const { redis } = require("../config/redis");
const { verifyAccessToken } = require("../utils/jwt");
const { RateLimitService } = require("../services/platform/rateLimitService");

/**
 * Redis-backed rate limiting, as reusable Express middleware.
 *
 * One service instance, built here from the shared connection in
 * config/redis.js — the same client CacheService, ReminderScheduler and the
 * BullMQ queues use. There is deliberately no second connection: a second
 * client would double the sockets against the same server for no benefit, and
 * the counters have to be visible to the queues' Redis anyway to mean anything
 * across instances.
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

const rateLimitService = new RateLimitService(redis);

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
 * The address is `req.ip`, and `trust proxy` is deliberately left unset. That is
 * the safe default and it matches what AuditService already records, with the
 * same caveat noted there: behind a proxy that address is the proxy's until
 * `trust proxy` is configured to match the topology. Turning it on to sharpen
 * unauthenticated buckets would also change what every existing audit row holds,
 * which is a wider decision than this one.
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

  return `ip:${req.ip || "unknown"}`;
}

/**
 * Builds a limiter for one policy.
 *
 * `match` limits only the requests it returns true for, `skip` exempts requests
 * from a limiter that would otherwise apply. Both are predicates on the request
 * as it looks at the mount point, so `req.path` is already relative to it.
 */
function createRateLimiter({ scope, limit, windowMs, match, skip }) {
  return function rateLimitMiddleware(req, res, next) {
    if (typeof skip === "function" && skip(req)) {
      return next();
    }

    if (typeof match === "function" && !match(req)) {
      return next();
    }

    return rateLimitService
      .consume({ scope, identifier: identifyRequest(req), limit, windowMs })
      .then((result) => {
        // Redis is unreachable. Allow the request and say nothing on the
        // response: a RateLimit header that is not backed by a counter is worse
        // than no header, because a client would trust it.
        if (result.degraded) {
          return next();
        }

        res.set("RateLimit-Limit", String(result.limit));
        res.set("RateLimit-Remaining", String(result.remaining));
        res.set("RateLimit-Reset", String(result.retryAfterSeconds));

        if (result.allowed) {
          return next();
        }

        // The whole point of the header: a client that is turned away is told how
        // long to wait, in the unit RFC 9110 defines for it, rather than having
        // to guess from the window.
        res.set("Retry-After", String(result.retryAfterSeconds));

        // The shared failure envelope from errorMiddleware, written directly
        // rather than thrown: this is a middleware-level rejection of the same
        // kind authMiddleware and adminGuard already return, and it has to add
        // headers that a thrown AppError has nowhere to carry.
        return res.status(429).json({
          success: false,
          message: `Too many requests. Please try again in ${result.retryAfterSeconds} seconds.`,
          retryAfter: result.retryAfterSeconds,
        });
      })
      .catch(next);
  };
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
