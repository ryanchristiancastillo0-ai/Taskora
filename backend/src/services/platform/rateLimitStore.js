const { MemoryStore } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

/**
 * The storage strategy behind Taskora's rate limiters.
 *
 *   Redis reachable  ->  rate-limit-redis, on the shared client from
 *                        config/redis.js, so the counters are visible to every
 *                        instance of this process
 *   Redis unreachable ->  express-rate-limit's own in-memory store, in the same
 *                        process
 *
 * Both are reached through one Store, so there is one limiter per policy and the
 * choice is invisible to the client: same key, same headers, same 429 body. That
 * is the whole point. The alternative — a Redis limiter plus a separate in-memory
 * limiter — would mean two implementations of every policy, two sets of counters
 * and a middleware that has to choose between them, which is how the two drift
 * apart and only one of them ends up tested.
 *
 * Failing over rather than failing open is the deliberate change from the fixed
 * window script this replaces. That script returned `allowed: true` whenever Redis
 * was unreachable, which meant a Redis outage silently removed rate limiting from
 * login, password reset and the metered AI endpoints at exactly the moment the
 * app was most attractive to attack. An outage now degrades to a per-process
 * budget instead of no budget.
 *
 * A per-process budget is weaker than the shared one — each replica counts its
 * own traffic — so this is a safety net rather than a substitute. It is still
 * strictly better than nothing, and it is the reason a Redis blip is invisible
 * from the outside.
 */

// Unchanged from the limiter this replaces, so the keys Redis already holds stay
// meaningful and `app:` (CacheService) can never be mistaken for a counter.
const RATE_LIMIT_NAMESPACE = "taskora:ratelimit";

const SECOND = 1000;

// How long a known-down Redis is left alone before one request is used as the
// probe. Without this, every request would attempt a command against a dead
// server and a busy app would turn one outage into a wall of Redis errors. With
// it, a dead Redis costs one failed command per window per policy.
const PROBE_INTERVAL_MS = Math.max(
  SECOND,
  Number(process.env.RATE_LIMIT_REDIS_PROBE_MS || 5 * SECOND)
);

// config/redis.js stops ioredis retrying after ten attempts, and ioredis does not
// reconnect on its own once a client has ended: from then on every command
// rejects with "Connection is closed" forever. This is how long to wait between
// asking that same client to try again, so recovery does not need a restart.
const RECONNECT_INTERVAL_MS = Math.max(
  SECOND,
  Number(process.env.RATE_LIMIT_REDIS_RECONNECT_MS || 30 * SECOND)
);

/**
 * What the limiter knows about Redis, derived from the one client Taskora
 * already has.
 *
 * Availability is tracked from ioredis's own lifecycle (`ready`, `close`, `end`,
 * `error`) rather than from the mere existence of the client object, because an
 * ioredis instance exists whether or not anything is listening on the other end
 * of the socket. `status` is re-read on every attempt so a disconnect the tracker
 * did not see an event for still takes effect immediately.
 *
 * Cached per client: the state and the log line belong to Redis, not to a policy,
 * so an outage is reported once for the whole app instead of once per limiter.
 */
const availabilityByClient = new WeakMap();

function createRedisAvailability(client) {
  let available = client.status === "ready";
  let lastAttemptAt = 0;
  let lastReconnectAt = 0;
  let outageReported = false;

  const isConnected = () => client.status === "ready";

  // Deliberately no URL and no error code: REDIS_URL can carry a password in a
  // hosted deployment, and nothing about the server's address helps whoever reads
  // the log. `error.message` is the same text config/redis.js already logs.
  function markUp() {
    if (outageReported) {
      outageReported = false;
      console.warn(
        "[ratelimit] Redis is reachable again — Redis-backed rate limiting resumed."
      );
    }

    available = true;

    // Cleared, not just left alone: the throttle exists to spare a Redis that is
    // known to be down, and this is the proof that it is not. Leaving the old
    // timestamp would keep serving requests from memory for the rest of the probe
    // window after Redis had already come back.
    lastAttemptAt = 0;
  }

  /**
   * A disconnect this tracker saw, before anything has tried to use Redis.
   *
   * Records state and nothing else. The log line and the reconnect belong to a
   * command that actually failed, which is one request later at most — and at
   * shutdown there is no next request, so `redis.disconnect()` on the way out
   * produces no misleading "Redis unavailable" line at all.
   */
  function markDisconnected() {
    available = false;
  }

  function markDown(error) {
    if (!outageReported) {
      outageReported = true;
      console.warn(
        `[ratelimit] Redis unavailable (${error.message}) — in-memory rate limiting is handling requests until it recovers.`
      );
    }

    available = false;
    lastAttemptAt = Date.now();
    nudgeReconnect();
  }

  /**
   * Asks the shared client to reconnect once it has given up.
   *
   * Not a second connection: the same client the queues and the cache use, and
   * only when ioredis has already stopped trying on its own. Reviving it also
   * revives those, which is why it is throttled rather than attempted per
   * request, and why it is not awaited — a request must never queue behind a
   * connect that may take the full retry budget to fail.
   *
   * Reached only from a command that actually failed, never from the connection
   * events. server.js closes this same client with `redis.disconnect()` on the
   * way out, and reconnecting it there would reopen a socket the shutdown is in
   * the middle of closing — enough to keep the process alive after it should
   * have gone.
   */
  function nudgeReconnect() {
    if (client.status !== "end" || typeof client.connect !== "function") {
      return;
    }

    const now = Date.now();
    if (now - lastReconnectAt < RECONNECT_INTERVAL_MS) {
      return;
    }

    lastReconnectAt = now;
    console.warn(
      "[ratelimit] Redis connection was closed — asking the shared client to reconnect."
    );

    Promise.resolve()
      .then(() => client.connect())
      .catch(() => {});
  }

  // ioredis is an EventEmitter; the stub the test suite swaps in is too. Guarded
  // anyway, because a client that cannot report its own lifecycle must not take
  // the limiter down with it — the status read in canAttempt is the real signal.
  if (typeof client.on === "function") {
    client.on("ready", markUp);
    client.on("close", markDisconnected);
    client.on("end", markDisconnected);
    client.on("error", markDisconnected);
  }

  return {
    /**
     * Whether this request should try Redis, which is not the same question as
     * whether Redis is up.
     *
     * While it is up, every request tries. While it is down, one request per
     * probe window tries anyway — that attempt is the probe, so recovery costs no
     * extra round trip and, because it is a real increment, a counter that
     * survived the outage continues where it left off rather than restarting.
     */
    canAttempt(now = Date.now()) {
      if (available && !isConnected()) {
        // The connection dropped without an event this tracker saw.
        available = false;
      }

      if (available) {
        return true;
      }

      return now - lastAttemptAt >= PROBE_INTERVAL_MS;
    },

    markUp,
    markDown,

    get available() {
      return available;
    },
  };
}

function redisAvailabilityFor(client) {
  let availability = availabilityByClient.get(client);

  if (!availability) {
    availability = createRedisAvailability(client);
    availabilityByClient.set(client, availability);
  }

  return availability;
}

/**
 * One store per policy. Never share the result between two limiters: the
 * counters are per policy, and express-rate-limit warns about a reused store for
 * the same reason.
 */
function createRateLimitStore({ client, scope, windowMs }) {
  const availability = redisAvailabilityFor(client);
  const memoryStore = new MemoryStore();

  // The scope is the first segment of the key, so two policies cannot spend each
  // other's budget even for the same account on the same address.
  const prefix = `${RATE_LIMIT_NAMESPACE}:${scope}:`;

  const redisStore = new RedisStore({
    prefix,
    sendCommand: (command, ...args) => client.call(command, ...args),
  });

  // rate-limit-redis caches the SHA of its Lua scripts when init() runs, and a
  // load that failed while Redis was down leaves that rejected promise cached for
  // the lifetime of the instance — every later increment would re-throw it and
  // the store could never recover. Loading is therefore lazy and repeated after
  // each failure rather than done once at startup, which also means a process
  // started against a dead Redis never logs a startup error for it.
  let scriptsLoaded = false;
  let policyWindowMs = windowMs;

  /**
   * The key, as the memory store needs it.
   *
   * The two stores disagree about who prefixes. rate-limit-redis prepends
   * `prefix` to every key it is given, because its keys live in a namespace
   * shared with everything else in Redis. MemoryStore is handed the bare key and
   * stores it as-is, which would leave the fallback counting under `ip:...` while
   * Redis counts under `taskora:ratelimit:<scope>:ip:...` — same limit, two
   * different identities, and no way to tell from a key alone which store counted
   * it. Prefixing here makes the key mean the same thing in both modes, so the
   * scope stays part of the key and `resetKey` means what it says in either one.
   */
  const memoryKey = (key) => `${prefix}${key}`;

  async function ensureScripts() {
    if (scriptsLoaded) {
      return;
    }

    await redisStore.init({ windowMs: policyWindowMs });
    scriptsLoaded = true;
  }

  /**
   * Runs one store operation against Redis, or against memory when Redis cannot
   * be used. Never rejects: a rate limiter that failed closed would make a Redis
   * blip look like an outage of the whole product, and one that failed open would
   * be the bug this module exists to remove.
   */
  async function throughRedis(operation, fallback) {
    if (!availability.canAttempt()) {
      return fallback();
    }

    try {
      const result = await operation();
      availability.markUp();
      return result;
    } catch (error) {
      scriptsLoaded = false;
      availability.markDown(error);
      return fallback();
    }
  }

  return {
    // False because this store's keys live in Redis: the counters of two
    // instances of this process have to be the same counters, which is exactly
    // what a local store cannot promise.
    localKeys: false,
    prefix,

    init(options) {
      policyWindowMs = options.windowMs ?? policyWindowMs;
      memoryStore.init(options);
    },

    increment: (key) =>
      throughRedis(
        async () => {
          await ensureScripts();
          return redisStore.increment(key);
        },
        () => memoryStore.increment(memoryKey(key))
      ),

    decrement: (key) =>
      throughRedis(
        () => redisStore.decrement(key),
        () => memoryStore.decrement(memoryKey(key))
      ),

    resetKey: (key) =>
      throughRedis(
        () => redisStore.resetKey(key),
        () => memoryStore.resetKey(memoryKey(key))
      ),

    get: (key) =>
      throughRedis(
        async () => {
          await ensureScripts();
          return redisStore.get(key);
        },
        () => memoryStore.get(memoryKey(key))
      ),
  };
}

module.exports = {
  RATE_LIMIT_NAMESPACE,
  PROBE_INTERVAL_MS,
  RECONNECT_INTERVAL_MS,
  createRateLimitStore,
  redisAvailabilityFor,
};
