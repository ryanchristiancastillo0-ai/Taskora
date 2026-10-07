"use strict";

/**
 * A Redis stand-in for CacheService and for rate limiting.
 *
 * Two APIs, because the application uses two:
 *
 *   get/set/del/unlink/keys/exists  what CacheService calls
 *   call(command, ...args)          the raw command channel rate-limit-redis uses
 *
 * The first is a Map with the handful of commands Taskora needs, so the cache is
 * genuinely exercised (a cached task list really does have to be invalidated by a
 * later write for the tests to pass) without requiring a Redis server to be
 * installed or running. `keys()` supports the glob patterns
 * CacheService.invalidatePattern() builds (`app:<userId>:tasks:*`), which is the
 * whole reason the task CRUD tests are deterministic.
 *
 * The second exists because the rate limiter is no longer a hand-written Lua
 * script: rate-limit-redis runs its own, through SCRIPT LOAD and EVALSHA. Those
 * two scripts are implemented here in JavaScript — the same INCR / SET PX / PTTL
 * arithmetic, against the same `store` — so a broken limiter fails its own tests
 * rather than passing them. A command the limiter has no implementation for
 * throws rather than pretending, and an unknown script SHA answers NOSCRIPT the
 * way Redis does, which is what exercises rate-limit-redis's reload path.
 *
 * The connection is a state machine, because the limiter's whole job is
 * reacting to one. `goDown()` is what a stopped WSL Redis looks like from here:
 * every command rejects immediately with the same text a real client with
 * `enableOfflineQueue: false` produces, and `status` leaves "ready" so the
 * limiter's own detection is exercised rather than bypassed. `goUp()` puts it
 * back and fires the events ioredis would fire, which is how a test can watch
 * rate limiting resume without a restart.
 *
 * Expiry is tracked only for keys a script creates. `set()` keeps ignoring its
 * EX argument as it always has, because cache lifetime is not what any suite is
 * testing, whereas rate-limit window expiry is.
 */

const store = new Map();

// key -> epoch ms. Deliberately separate from `store` so a cached value's
// behaviour is untouched by this addition.
const expiries = new Map();

// sha -> script text. Survives reset(), as it does in Redis: SCRIPT LOAD is not
// affected by a key expiring, so rate-limit-redis keeps a usable SHA across a
// reset and its reload path stays out of the way.
const scripts = new Map();

// event -> handlers, so a test can drive the same lifecycle events ioredis emits.
const listeners = new Map();

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/** Drops a key once its window has closed. Redis expires lazily too. */
function expireIfDue(key) {
  const expiresAt = expiries.get(key);

  if (expiresAt !== undefined && expiresAt <= Date.now()) {
    store.delete(key);
    expiries.delete(key);
  }
}

function readValue(key) {
  expireIfDue(key);
  return store.get(key) ?? null;
}

function writeValue(key, value, ttlMs) {
  store.set(key, String(value));
  expiries.set(key, Date.now() + ttlMs);
}

/**
 * The two scripts rate-limit-redis ships, recognised by their bodies rather than
 * by position, so loading them in a different order cannot change the answer.
 */
function scriptKind(script) {
  if (script.includes('redis.call("SET", KEYS[1], 1, "PX", windowMs)')) {
    return "increment";
  }

  if (script.includes('local totalHits = redis.call("GET", KEYS[1])')) {
    return "get";
  }

  return null;
}

function shaFor(script) {
  const kind = scriptKind(script);

  if (!kind) {
    throw new Error("redisStub.call: SCRIPT LOAD received a script it does not implement");
  }

  for (const [sha, loaded] of scripts) {
    if (scriptKind(loaded) === kind) {
      return sha;
    }
  }

  const sha = `sha-${scripts.size + 1}`;
  scripts.set(sha, script);
  return sha;
}

/**
 * The increment script: a fixed window anchored to the first request that creates
 * the key, so a key's TTL is the only thing that ends a window.
 */
function runIncrementScript(key, windowMs) {
  const current = readValue(key);
  const ttl = expiries.has(key) ? expiries.get(key) - Date.now() : -2;

  if (current === null || ttl <= 0) {
    writeValue(key, 1, windowMs);
    return [1, windowMs];
  }

  const totalHits = Number(current) + 1;
  store.set(key, String(totalHits));
  return [totalHits, ttl];
}

function runGetScript(key) {
  const current = readValue(key);

  if (current === null) {
    return [false, -2];
  }

  return [Number(current), expiries.get(key) - Date.now()];
}

/**
 * The raw command channel rate-limit-redis talks over: SCRIPT LOAD and EVALSHA for
 * the two window scripts, plus the DECR and DEL its decrement and reset use.
 * Anything else throws rather than pretending.
 */
function call(command, ...args) {
  const name = String(command).toUpperCase();

  if (name === "SCRIPT") {
    return shaFor(args[1]);
  }

  if (name === "EVALSHA") {
    const [sha, numberOfKeys, key, argument] = args;

    const script = scripts.get(sha);
    if (!script) {
      // The exact shape rate-limit-redis matches on to reload.
      throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    }

    if (Number(numberOfKeys) !== 1) {
      throw new Error(`redisStub.call: EVALSHA expected 1 key, received ${numberOfKeys}`);
    }

    return scriptKind(script) === "increment"
      ? runIncrementScript(key, Number(argument))
      : runGetScript(key);
  }

  if (name === "GET") {
    return readValue(args[0]);
  }

  if (name === "DECR") {
    const key = args[0];
    const next = Number(readValue(key) ?? 0) - 1;
    store.set(key, String(next));
    return next;
  }

  if (name === "DEL") {
    let removed = 0;
    for (const key of args.flat()) {
      expireIfDue(key);
      expiries.delete(key);
      if (store.delete(key)) removed += 1;
    }
    return removed;
  }

  throw new Error(`redisStub.call does not implement ${name}`);
}

/**
 * What config/redis.js produces when nothing is listening: `enableOfflineQueue`
 * is off, so a command issued while the client is not ready rejects at once
 * rather than queueing.
 */
function assertConnected() {
  if (redis.status !== "ready") {
    throw new Error("Stream isn't writeable");
  }
}

function emit(event, ...args) {
  for (const handler of listeners.get(event) ?? []) {
    handler(...args);
  }
}

const redis = {
  store,

  /** "ready" unless a test has taken the connection down. */
  status: "ready",

  async call(command, ...args) {
    assertConnected();
    return call(command, ...args);
  },

  async get(key) {
    assertConnected();
    return readValue(key);
  },

  async set(key, value) {
    assertConnected();
    store.set(key, String(value));
    return "OK";
  },

  async del(...keys) {
    assertConnected();
    return call("DEL", ...keys);
  },

  async unlink(...keys) {
    assertConnected();
    return call("DEL", ...keys);
  },

  async keys(pattern) {
    assertConnected();
    const matcher = globToRegExp(pattern);
    return [...store.keys()].filter((key) => matcher.test(key));
  },

  async exists(key) {
    assertConnected();
    return readValue(key) === null ? 0 : 1;
  },

  async flushall() {
    store.clear();
    expiries.clear();
    return "OK";
  },

  on(event, handler) {
    const existing = listeners.get(event) ?? [];
    existing.push(handler);
    listeners.set(event, existing);
    return redis;
  },

  emit,

  /** Stops answering, the way a stopped Redis server looks from in here. */
  goDown() {
    redis.status = "reconnecting";
    emit("close");
    emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    return redis;
  },

  /** Brings the connection back and fires the events ioredis would fire. */
  goUp() {
    redis.status = "ready";
    emit("ready");
    return redis;
  },

  /** Stands in for ioredis after `retryStrategy` has given up for good. */
  goDead() {
    redis.status = "end";
    emit("end");
    return redis;
  },

  /**
   * Stands in for ioredis's connect(). Reconnecting succeeds — the counter is
   * there so a test can assert that the limiter asked for one at all, and how
   * often. A test that wants to watch a server that stays stopped replaces this.
   */
  connectCount: 0,

  async connect() {
    redis.connectCount += 1;
    redis.goUp();
    return "OK";
  },

  disconnect() {},
  quit: async () => "OK",
};

module.exports = {
  redis,
  REDIS_URL: "redis://stub",
  // Exposed so a test can assert on cache invalidation directly, and so
  // `reset()` puts the connection back: the limiter tracks Redis through this
  // client's status and events, so a suite that took Redis down has to be able to
  // undo that before the next test rather than leaking fallback mode into it.
  reset: () => {
    store.clear();
    expiries.clear();
    redis.connectCount = 0;
    redis.status = "ready";
    emit("ready");
  },
};
