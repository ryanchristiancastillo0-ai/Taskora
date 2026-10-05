"use strict";

/**
 * A Redis stand-in for CacheService.
 *
 * The API is a Map with the handful of commands Taskora calls — get, set, del,
 * keys, unlink — so the cache is genuinely exercised (a cached task list really
 * does have to be invalidated by a later write for the tests to pass) without
 * requiring a Redis server to be installed or running.
 *
 * `keys()` supports the glob patterns CacheService.invalidatePattern() builds
 * (`app:<userId>:tasks:*`), which is the whole reason the task CRUD tests are
 * deterministic.
 *
 * `eval()` implements one script only — the rate limiter's INCR/PEXPIRE/PTTL
 * window counter, recognised by its marker comment — and throws for anything
 * else rather than pretending. That marker is why the script carries one: a stub
 * that silently answered every script with the same numbers would let a broken
 * limiter pass its own tests.
 *
 * Expiry is tracked only for keys this script creates. `set()` keeps ignoring its
 * EX argument as it always has, because cache lifetime is not what any suite is
 * testing, whereas rate-limit window expiry is.
 */

const store = new Map();

// key -> epoch ms. Deliberately separate from `store` so a cached value's
// behaviour is untouched by this addition.
const expiries = new Map();

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

const RATE_LIMIT_MARKER = "taskora:ratelimit:v1";

// Reads a counter, dropping it first if its window has closed. Redis expires
// lazily too, so this is the same observable behaviour rather than a
// simplification: an expired key reads as absent.
function readCounter(key) {
  const expiresAt = expiries.get(key);

  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    store.delete(key);
    expiries.delete(key);
    return null;
  }

  return store.get(key) ?? null;
}

// The one Lua script the application runs, in JavaScript. No await inside, so it
// is atomic against everything else in this single-threaded double exactly as the
// real script is atomic against other clients.
async function evalRateLimitScript(_script, numberOfKeys, ...args) {
  if (numberOfKeys !== 1) {
    throw new Error(`redisStub.eval: expected 1 key, received ${numberOfKeys}`);
  }

  const [key, windowMs] = args;
  const counter = Number(readCounter(key) ?? 0) + 1;

  store.set(key, String(counter));

  if (counter === 1 || !expiries.has(key)) {
    expiries.set(key, Date.now() + Number(windowMs));
  }

  let ttl = expiries.get(key) - Date.now();
  if (ttl < 0) {
    expiries.set(key, Date.now() + Number(windowMs));
    ttl = Number(windowMs);
  }

  return [counter, ttl];
}

const redis = {
  store,

  async get(key) {
    return store.has(key) ? store.get(key) : null;
  },

  async set(key, value) {
    store.set(key, String(value));
    return "OK";
  },

  async del(...keys) {
    const flat = keys.flat();
    let removed = 0;
    for (const key of flat) {
      expiries.delete(key);
      if (store.delete(key)) removed += 1;
    }
    return removed;
  },

  async unlink(...keys) {
    return redis.del(...keys);
  },

  async keys(pattern) {
    const matcher = globToRegExp(pattern);
    return [...store.keys()].filter((key) => matcher.test(key));
  },

  async exists(key) {
    return store.has(key) ? 1 : 0;
  },

  async eval(script, numberOfKeys, ...args) {
    if (!String(script).includes(RATE_LIMIT_MARKER)) {
      throw new Error("redisStub.eval only implements the rate limit window script");
    }
    return evalRateLimitScript(script, numberOfKeys, ...args);
  },

  async flushall() {
    store.clear();
    expiries.clear();
    return "OK";
  },

  disconnect() {},
  quit: async () => "OK",
  on() {
    return this;
  },
};

module.exports = {
  redis,
  REDIS_URL: "redis://stub",
  // Exposed so a test can assert on cache invalidation directly.
  reset: () => {
    store.clear();
    expiries.clear();
  },
};
