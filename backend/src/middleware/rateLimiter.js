const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const { redis } = require("../config/redis");
const { verifyAccessToken } = require("../utils/jwt");
const { createRateLimitStore } = require("../services/platform/rateLimitStore");

/**
 * Rate limiting, as reusable Express middleware.
 *
 * One express-rate-limit middleware per policy, over a store that is Redis when
 * Redis is usable and in-memory when it is not — see
 * services/platform/rateLimitStore.js, which owns that decision. There is no
 * second limiter and no second set of policy numbers: a client cannot tell which
 * store answered, which is the point.
 *
 * The Redis counters are shared by every instance of this process, because
 * spreading requests over replicas to get a fresh budget each does not work. The
 * store is built from the connection in config/redis.js — the same client
 * CacheService, ReminderScheduler and the BullMQ queues use. There is
 * deliberately no second connection.
 *
 * A policy is a scope, a limit and a window. Routes never touch Redis and never
 * build a key: they mount a limiter, and the scope is what keeps one policy's
 * traffic out of another's counters.
 *
 * Env-overridable in the same inline `Number(process.env.X || default)` style
 * the rest of the project uses (see uploadMiddleware's MAX_FILE_SIZE_BYTES), so
 * a deployment can tighten or relax a tier without a code change.
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;

const LIMITS = {
  // Everything under /api that is not covered more tightly below. Sized for an
  // interactive client: a page load is a handful of calls, so 100/minute is
  // generous to a person and still stops a script from walking the API.
  api: {
    limit: Number(process.env.RATE_LIMIT_API_MAX || 100),
    windowMs: Number(process.env.RATE_LIMIT_API_WINDOW_MS || MINUTE),
  },
  // One bucket across every auth endpoint, so the limit cannot be sidestepped by
  // spreading guesses across /login and /refresh. Ten a minute is above what the
  // login form, the register form and a single session refresh ever need, even
  // when they are used back to back.
  auth: {
    limit: Number(process.env.RATE_LIMIT_AUTH_MAX || 10),
    windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || MINUTE),
  },
  // The three endpoints that mint or redeem a password reset. Deliberately much
  // tighter and over a much longer window: each accepted call sends real email
  // through Brevo, and each rejected code is an online guess at a six-digit
  // number. Five per quarter hour is not a limit a person working through the
  // reset form will ever notice.
  passwordReset: {
    limit: Number(process.env.RATE_LIMIT_PASSWORD_RESET_MAX || 5),
    windowMs: Number(process.env.RATE_LIMIT_PASSWORD_RESET_WINDOW_MS || 15 * MINUTE),
  },
  // AI is metered per call by the provider, so abuse here costs money rather
  // than CPU. Twenty a minute covers a long conversation and stops a loop from
  // turning into a bill. Mounted ahead of the AI router, so a limited call never
  // reaches a controller or a queue.
  ai: {
    limit: Number(process.env.RATE_LIMIT_AI_MAX || 20),
    windowMs: Number(process.env.RATE_LIMIT_AI_WINDOW_MS || MINUTE),
  },
  // Uploads are matched on content type rather than on a path list, so a new
  // upload route is covered the day it is written and the list cannot go stale.
  upload: {
    limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 30),
    windowMs: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || MINUTE),
  },
};

/**
 * Who a request is counted against.
 *
 * `req.user` is preferred, so a limiter mounted after authMiddleware gets the
 * account for free. When mounted ahead of it — which is where a limiter has to
 * sit to keep a limited request away from the controller — the access cookie is
 * verified here instead, which is what lets an authenticated user be counted per
 * account rather than per address. That is a read of an already-signed token,
 * not a second authentication decision: it cannot grant access, a token that does
 * not verify simply falls through to the address, and authMiddleware still
 * answers the request exactly as it did before.
 *
 * The address is `req.ip`, run through express-rate-limit's `ipKeyGenerator` so
 * an IPv6 client is counted on its /56 rather than being able to walk through the
 * limit one address at a time. IPv4 addresses come out unchanged.
 *
 * `trust proxy` is deliberately left unset. That is the safe default and it
 * matches what AuditService already records, with the same caveat noted there:
 * behind a proxy that address is the proxy's until `trust proxy` is configured to
 * match the topology. Turning it on to sharpen unauthenticated buckets would also
 * change what every existing audit row holds, which is a wider decision than this
 * one.
 */
function identifyRequest(req) {
  if (req.user?.userId) {
    return `user:${req.user.userId}`;
  }

  const token = req.cookies?.accessToken;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      if (payload?.type === "access" && payload.userId) {
        return `user:${payload.userId}`;
      }
    } catch {
      // An absent, malformed or expired cookie is not this middleware's problem
      // to report — authMiddleware answers it a few lines later.
    }
  }

  return `ip:${ipKeyGenerator(req.ip || "unknown")}`;
}

/**
 * The 429.
 *
 * The shared failure envelope from errorMiddleware, written directly rather than
 * thrown: this is a middleware-level rejection of the same kind authMiddleware
 * and adminGuard already return, and it has to add headers that a thrown AppError
 * has nowhere to carry.
 *
 * The values are read off `req.rateLimit`, which express-rate-limit fills in
 * before calling the handler, and come from whichever store was used — so a
 * request turned away while Redis was down is indistinguishable from one turned
 * away while Redis was up.
 */
function rateLimitExceeded(req, res) {
  const info = req.rateLimit || {};
  const limit = info.limit ?? 0;

  // At least one second: a sub-second remainder rounded down would tell the
  // client to retry immediately, which is how a client ends up building a tight
  // retry loop against a limit it is already over.
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((info.resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000)
  );

  // Re-asserted here rather than left to the library, so the three headers mean
  // exactly what they meant before this was moved onto express-rate-limit.
  res.set("RateLimit-Limit", String(limit));
  res.set("RateLimit-Remaining", String(info.remaining ?? 0));
  res.set("RateLimit-Reset", String(retryAfterSeconds));

  // The whole point of the header: a client that is turned away is told how long
  // to wait, in the unit RFC 9110 defines for it, rather than having to guess
  // from the window.
  res.set("Retry-After", String(retryAfterSeconds));

  return res.status(429).json({
    success: false,
    message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
    retryAfter: retryAfterSeconds,
  });
}

/**
 * Builds a limiter for one policy.
 *
 * `match` limits only the requests it returns true for, `skip` exempts requests
 * from a limiter that would otherwise apply. Both are predicates on the request
 * as it looks at the mount point, so `req.path` is already relative to it.
 */
function createRateLimiter({ scope, limit, windowMs, match, skip }) {
  return rateLimit({
    windowMs,
    limit,
    store: createRateLimitStore({ client: redis, scope, windowMs }),

    // The scope is the first segment of the store's key prefix, so the key
    // itself is only the identifier. That is what keeps two policies from ever
    // landing on one counter, and what keeps a counter from ever being mistaken
    // for a CacheService value.
    keyGenerator: identifyRequest,

    // Both predicates collapse into the one thing express-rate-limit asks about:
    // should this request be counted at all.
    skip: (req) =>
      (typeof skip === "function" && skip(req)) ||
      (typeof match === "function" && !match(req)),

    // draft-6 is the draft whose header set is RateLimit-Limit,
    // RateLimit-Remaining and RateLimit-Reset — the three this API has always
    // published, with the same names and the same meaning. (draft-7 replaced them
    // with a single combined RateLimit header, which would have changed what
    // clients read.) It adds one header Taskora did not send before,
    // RateLimit-Policy, which restates the same limit and window. The legacy
    // X-RateLimit-* set stays off.
    standardHeaders: "draft-6",
    legacyHeaders: false,

    handler: rateLimitExceeded,

    // Two of the library's validations are per-request warnings about proxy
    // headers, and a client can trigger either one just by sending
    // X-Forwarded-For — which would turn a rate limiter into a way to fill the
    // log. Both describe a decision this file documents above (trust proxy is
    // deliberately unset), so they are the only two turned off; every
    // configuration-time check stays on.
    validate: {
      trustProxy: true,
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
  });
}

const apiRateLimiter = createRateLimiter({
  scope: "api",
  ...LIMITS.api,
  // The health probe is polled by uptime monitors and by whatever sits in front
  // of the app. Locking it out would convert a monitoring gap into an outage, and
  // it reads nothing a caller could abuse.
  skip: (req) => req.path === "/health",
});

const uploadRateLimiter = createRateLimiter({
  scope: "upload",
  ...LIMITS.upload,
  // Runs ahead of Multer and never touches the request stream, so a rejected
  // upload costs nothing and writes no partial file to disk. It also means this
  // works for the routes that accept multipart or JSON on the same path, such as
  // community group creation.
  match: (req) =>
    String(req.get("content-type") || "")
      .toLowerCase()
      .startsWith("multipart/form-data"),
});

// Paths are relative to the /api/auth mount, which is where this is applied.
const PASSWORD_RESET_PATHS = new Set([
  "/forgot-password",
  "/verify-reset-code",
  "/reset-password",
]);

const passwordResetRateLimiter = createRateLimiter({
  scope: "password-reset",
  ...LIMITS.passwordReset,
  match: (req) => PASSWORD_RESET_PATHS.has(req.path),
});

const authRateLimiter = createRateLimiter({ scope: "auth", ...LIMITS.auth });

const aiRateLimiter = createRateLimiter({ scope: "ai", ...LIMITS.ai });

module.exports = {
  createRateLimiter,
  identifyRequest,
  apiRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
  aiRateLimiter,
  uploadRateLimiter,
};
