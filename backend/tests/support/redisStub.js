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
 */

const store = new Map();

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
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

  async flushall() {
    store.clear();
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
  reset: () => store.clear(),
};
