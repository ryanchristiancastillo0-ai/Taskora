const RATE_LIMIT_NAMESPACE = "taskora:ratelimit";

/**
 * Fixed-window counter, held in Redis.
 *
 * The window is anchored to the first request that creates the key rather than
 * to the clock, so a key's TTL is the only thing that ends a window: there is no
 * bucket index to compute, and therefore no way for two instances to disagree
 * about which window a request belongs to.
 *
 * The whole increment is one Lua script rather than INCR-then-EXPIRE from the
 * application. Two reasons, both of which show up under real traffic:
 *
 *   - INCR followed by EXPIRE is two round trips, and a process that dies
 *     between them leaves a counter with no TTL. That key never expires, so the
 *     caller is locked out permanently rather than for one window.
 *   - Two replicas hitting the same key at the same moment can both read "no TTL
 *     yet" and both write one, which is harmless, but the same interleaving
 *     around a read-modify-write counter is how a limit gets exceeded. Redis
 *     runs a script to completion before serving anything else, so the counter
 *     cannot be observed half-updated.
 *
 * The returned TTL is read inside the same script for the same reason: the
 * Retry-After the client is told has to be the TTL the counter actually has, not
 * one measured a round trip later.
 *
 * Failure is deliberately open. config/redis.js already promises that "caching
 * and queues will fail open", CacheService swallows its errors, and every
 * BullMQ worker in server.js degrades to inline processing with a console.warn
 * instead of failing requests. A rate limiter that failed closed would make a
 * Redis blip indistinguishable from an outage of the whole product: nobody could
 * sign in, read a task or upload a file because a counter could not be
 * incremented. The trade is that a Redis outage also removes the protection,
 * which is why the failure is logged rather than swallowed silently — once per
 * outage, not once per request.
 */
const INCREMENT_WINDOW_SCRIPT = `
-- taskora:ratelimit:v1
local counter = redis.call("INCR", KEYS[1])

if counter == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local ttl = redis.call("PTTL", KEYS[1])

-- A negative TTL here means the key exists with no expiry (PTTL -1), which can
-- only happen if something other than this script wrote it. Re-arm it instead of
-- letting one counter live for the lifetime of the Redis dataset.
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return { counter, ttl }
`;

// Reported once per outage rather than once per rejected request: an unreachable
// Redis produces one error per in-flight request, and a log line per request is
// how a real problem gets missed. Reset on the next success, so a later outage
// is reported again.
let outageReported = false;

class RateLimitService {
  constructor(client) {
    // Without EVAL the counter cannot be made atomic, and silently running
    // without a limiter would be worse than a loud warning: the routes would
    // look protected and would not be. The existing CacheService degrades
    // quietly because a stale cache is merely unhelpful; an absent limiter is
    // not, so this one says so at startup.
    if (typeof client?.eval !== "function") {
      console.warn(
        "[ratelimit] the configured Redis client cannot run EVAL, so rate limiting is disabled."
      );
    }

    this.client = client;
  }

  /**
   * Namespaced, and structured so that two different things can never land on
   * the same key:
   *
   *   taskora:ratelimit:<scope>:<kind>:<value>
   *
   * `scope` is the policy (api, auth, ai, ...), `kind` is user or ip. Both are
   * supplied by the caller rather than derived here, so a caller cannot
   * accidentally produce a key that reads as another policy's. The app: prefix
   * CacheService uses is a different namespace and cannot collide with these.
   */
  buildKey(scope, identifier) {
    return `${RATE_LIMIT_NAMESPACE}:${scope}:${identifier}`;
  }

  /**
   * Counts one request against `identifier` and reports whether it is allowed.
   *
   * Never rejects. A caller that wants to know whether Redis was reachable can
   * read `degraded`; a caller that does not care can ignore the result and
   * treat `allowed: true` as "carry on".
   */
  async consume({ scope, identifier, limit, windowMs }) {
    const key = this.buildKey(scope, identifier);

    let raw;
    try {
      raw = await this.client.eval(INCREMENT_WINDOW_SCRIPT, 1, key, windowMs);
    } catch (error) {
      return this.degrade(error);
    }

    outageReported = false;

    const counter = Number(raw?.[0] ?? 0);
    const ttlMs = Number(raw?.[1] ?? windowMs);

    return {
      allowed: counter <= limit,
      degraded: false,
      limit,
      remaining: Math.max(0, limit - counter),
      // At least one second: a sub-second remainder rounded down would tell the
      // client to retry immediately, which is how a client ends up building a
      // tight retry loop against a limit it is already over.
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    };
  }

  // Not private syntax, just not part of the contract: nothing outside this
  // class should decide that a Redis failure means "allow".
  degrade(error) {
    if (!outageReported) {
      outageReported = true;
      console.warn(
        `[ratelimit] Redis unavailable (${error.message}) — requests are being allowed through until it recovers.`
      );
    }

    return {
      allowed: true,
      degraded: true,
      limit: null,
      remaining: null,
      retryAfterSeconds: null,
    };
  }
}

module.exports = { RateLimitService };
