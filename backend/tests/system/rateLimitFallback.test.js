"use strict";

/**
 * What the application does while Redis is unreachable.
 *
 * rateLimit.test.js covers the limiter itself, on its own Express app, where the
 * policy numbers are the test's. This file is the other half: the limiters the
 * application actually mounts, on the real routes, answering the question an
 * outage actually raises — does Taskora stay up, and is it still protected?
 *
 * Both answers have to be yes, and they pull in opposite directions. Falling open
 * keeps the app up and leaves login, password reset and the metered AI endpoints
 * unprotected at the exact moment an outage makes the app cheapest to attack.
 * Falling closed keeps them protected and takes the whole product down with Redis.
 * So neither: the app keeps answering, and keeps a budget of its own.
 *
 * Its own file, because the limiters here are the application's singletons. A
 * limiter that has spent an in-memory budget keeps it for the rest of its window,
 * and one test's outage must not decide what the next one is allowed to do. Jest
 * gives each file its own module registry, so the app under test here is built
 * fresh, and each test starts by spending nothing.
 */

process.env.RATE_LIMIT_API_MAX = "8";
process.env.RATE_LIMIT_AUTH_MAX = "3";

const { app, request, resetState } = require("../support/harness");
const redisStub = require("../support/redisStub");
const { apiRateLimiter, authRateLimiter } = require("../../src/middleware/rateLimiter");
const { PROBE_INTERVAL_MS } = require("../../src/services/platform/rateLimitStore");

const RATE_LIMIT_ENV = ["RATE_LIMIT_API_MAX", "RATE_LIMIT_AUTH_MAX"];

afterAll(() => {
  for (const name of RATE_LIMIT_ENV) {
    delete process.env[name];
  }
});

beforeEach(resetState);

/**
 * Empties the application's own counters for the address these tests arrive from.
 *
 * Both stores, deliberately, and in a particular order. `resetKey` goes wherever
 * the limiter is currently counting — the same failover decision everything else
 * makes — so asking while Redis is up deletes the Redis key and leaves the
 * fallback's count standing. Asking while Redis is down reaches the memory store
 * instead. The outage is exactly the situation the second clear is for: this
 * process already spent an in-memory budget in an earlier test, and a Redis
 * outage is not a reason to hand the next test a bill it did not earn.
 */
async function emptyBudgets() {
  redisStub.redis.goDown();
  for (const limiter of [apiRateLimiter, authRateLimiter]) {
    // The bare identifier, because that is what a store is given: both stores
    // prefix it themselves, so one key clears whichever one is answering.
    // Awaited, because the store decides that only once it has tried, and the
    // next request must not be able to overtake the delete.
    await limiter.resetKey("ip:127.0.0.1");
  }
  redisStub.redis.goUp();
}

/** A login that cannot succeed, which is also the request an attacker would send. */
function loginAttempt() {
  return request(app)
    .post("/api/auth/login")
    .send({ email: "nobody@taskora.test", password: "WrongPassword123!" });
}

/** Longer than the probe window, so a request after an outage really re-tries Redis. */
function waitForProbeWindow() {
  return new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS + 50));
}

afterEach(() => {
  redisStub.redis.goUp();
});

describe("the application while Redis is unreachable", () => {
  it("should keep answering requests", async () => {
    await emptyBudgets();
    redisStub.redis.goDown();

    // Not a 500, and not a hang: the outage is Redis's problem, not the app's.
    expect((await request(app).get("/api/health")).status).toBe(200);

    const rejected = await loginAttempt();
    expect(rejected.status).toBe(401);
    expect(rejected.body).toMatchObject({ success: false });
  });

  it("should still limit logins", async () => {
    await emptyBudgets();
    redisStub.redis.goDown();

    // The budget holds without Redis: three rejections from the limit, then the
    // fourth request is turned away before it reaches the route.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await loginAttempt();
      expect(response.status).toBe(401);
      // Counted in memory, and counted honestly: the header describes the budget
      // the fallback is actually enforcing.
      expect(response.headers["ratelimit-remaining"]).toBe(String(3 - attempt));
    }

    const blocked = await loginAttempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      success: false,
      message: expect.stringContaining("Too many requests"),
    });
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
    expect(blocked.headers["ratelimit-limit"]).toBe("3");
  });

  it("should go back to Redis without a restart", async () => {
    await emptyBudgets();

    // Spend the whole Redis budget on this address while Redis is up.
    expect((await loginAttempt()).status).toBe(401);
    expect((await loginAttempt()).status).toBe(401);
    expect((await loginAttempt()).status).toBe(401);

    redisStub.redis.goDown();
    await waitForProbeWindow();

    // Counted in memory, so the shared counter stands still at three.
    expect((await loginAttempt()).status).toBe(401);

    redisStub.redis.goUp();
    await waitForProbeWindow();

    // Redis mode again, and it remembers: the fourth increment is over the limit
    // again, which a limiter that restarted from zero would have allowed.
    const blocked = await loginAttempt();
    expect(blocked.status).toBe(429);
    expect(blocked.headers["ratelimit-remaining"]).toBe("0");
  });

  it("should leave the health probe reachable while everything else is counted", async () => {
    await emptyBudgets();
    redisStub.redis.goDown();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await request(app).get("/api/health")).status).toBe(200);
    }
  });
});