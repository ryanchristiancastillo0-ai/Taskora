"use strict";

/**
 * Redis-backed rate limiting.
 *
 * Two halves, deliberately.
 *
 * The first drives the limiter through its own factory on a throwaway Express
 * app, which is the only way to test a two-request window or twenty concurrent
 * callers without waiting a minute or hammering the real application's routes.
 * It is the real middleware and the real Redis script — only the policy numbers
 * and the endpoint are the test's.
 *
 * The second drives the routes the limiters are actually mounted on, so what is
 * asserted is the wiring in app.js and not just the middleware. Those limits come
 * from the environment, which is why the overrides below are set before the app is
 * required (the middleware reads them once, at load) and removed in afterAll:
 * `npm test` runs every suite in one process, and an override left behind would
 * silently tighten the next suite's limits.
 */

process.env.RATE_LIMIT_API_MAX = "8";
process.env.RATE_LIMIT_AUTH_MAX = "6";
process.env.RATE_LIMIT_PASSWORD_RESET_MAX = "2";
process.env.RATE_LIMIT_AI_MAX = "3";
process.env.RATE_LIMIT_UPLOAD_MAX = "2";

const express = require("express");
const cookieParser = require("cookie-parser");

const {
  app,
  request,
  resetState,
  register,
  createUser,
  cookiesFrom,
  TEST_PASSWORD,
} = require("../support/harness");
const redisStub = require("../support/redisStub");
const {
  createRateLimiter,
  identifyRequest,
} = require("../../src/middleware/rateLimiter");

const RATE_LIMIT_ENV = [
  "RATE_LIMIT_API_MAX",
  "RATE_LIMIT_AUTH_MAX",
  "RATE_LIMIT_PASSWORD_RESET_MAX",
  "RATE_LIMIT_AI_MAX",
  "RATE_LIMIT_UPLOAD_MAX",
];

afterAll(() => {
  for (const name of RATE_LIMIT_ENV) {
    delete process.env[name];
  }
});

beforeEach(resetState);

/** The limiter under test, on an endpoint of its own. */
function limitedApp(limiter, path = "/ping") {
  const server = express();
  server.use(cookieParser());
  server.use(limiter);
  server.get(path, (req, res) => res.json({ success: true, message: "pong" }));
  return server;
}

function limiterFor({ scope, limit, windowMs = 60_000 }) {
  return createRateLimiter({ scope, limit, windowMs });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The rate-limit keys the limiter actually wrote. */
function rateLimitKeys(scope) {
  const prefix = scope ? `taskora:ratelimit:${scope}:` : "taskora:ratelimit:";
  return [...redisStub.redis.store.keys()].filter((key) => key.startsWith(prefix));
}

/** The counter value the limiter is holding for a scope, whatever it keyed on. */
function counterFor(scope) {
  const [key] = rateLimitKeys(scope);
  return key === undefined ? null : Number(redisStub.redis.store.get(key));
}

describe("the limiter as middleware", () => {
  it("should let a request under the limit through and report what is left", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 3 }));

    const response = await request(server).get("/ping");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "pong" });
    expect(response.headers["ratelimit-limit"]).toBe("3");
    expect(response.headers["ratelimit-remaining"]).toBe("2");
    // Seconds until the window ends, which is also what a 429 would carry as
    // Retry-After.
    expect(Number(response.headers["ratelimit-reset"])).toBeGreaterThan(0);
    expect(Number(response.headers["ratelimit-reset"])).toBeLessThanOrEqual(60);
    // Nothing is limited yet, so there is nothing to retry after.
    expect(response.headers["retry-after"]).toBeUndefined();
  });

  it("should count down to zero without turning the last allowed request away", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 3 }));

    const remaining = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(server).get("/ping");
      expect(response.status).toBe(200);
      remaining.push(response.headers["ratelimit-remaining"]);
    }

    expect(remaining).toEqual(["2", "1", "0"]);
  });

  it("should answer the request past the limit with 429, Retry-After and the shared envelope", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 2 }));

    await request(server).get("/ping");
    await request(server).get("/ping");
    const blocked = await request(server).get("/ping");

    expect(blocked.status).toBe(429);
    // The same { success: false, message } shape authMiddleware and
    // errorMiddleware already return, so the frontend's ApiError path reads it
    // without knowing anything about rate limiting.
    expect(blocked.body).toMatchObject({
      success: false,
      message: expect.stringContaining("Too many requests"),
    });
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
    expect(blocked.headers["retry-after"]).toBe(String(blocked.body.retryAfter));
    expect(blocked.headers["ratelimit-remaining"]).toBe("0");
  });

  it("should keep counting while blocked, so the window cannot be extended by retrying", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 1 }));

    await request(server).get("/ping");
    await request(server).get("/ping");
    await request(server).get("/ping");

    // The counter is 4 now, and Retry-After is still the original window rather
    // than a fresh one: a client that retries in a loop must not be able to push
    // its own unlock time out.
    const blocked = await request(server).get("/ping");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeLessThanOrEqual(60);
    expect(counterFor("unit")).toBe(4);
  });

  it("should allow requests again once the window has expired", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 1, windowMs: 150 }));

    expect((await request(server).get("/ping")).status).toBe(200);
    expect((await request(server).get("/ping")).status).toBe(429);

    await wait(220);

    const afterWindow = await request(server).get("/ping");
    expect(afterWindow.status).toBe(200);
    expect(afterWindow.headers["ratelimit-remaining"]).toBe("0");
  });

  it("should not let concurrent requests share more than the limit", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 5 }));

    // Fired together rather than awaited one by one: the counter has to be right
    // when they all arrive at once, which is the case a read-modify-write in the
    // application would get wrong.
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => request(server).get("/ping"))
    );

    const allowed = responses.filter((response) => response.status === 200);
    const blocked = responses.filter((response) => response.status === 429);

    expect(allowed).toHaveLength(5);
    expect(blocked).toHaveLength(15);
    expect(counterFor("unit")).toBe(20);
  });

  it("should give each scope its own counter", async () => {
    const first = limitedApp(limiterFor({ scope: "one", limit: 1 }), "/one");
    const second = limitedApp(limiterFor({ scope: "two", limit: 1 }), "/two");

    expect((await request(first).get("/one")).status).toBe(200);
    // Same address, same moment, different policy: an exhausted /one budget must
    // not spend the /two budget.
    expect((await request(first).get("/one")).status).toBe(429);
    expect((await request(second).get("/two")).status).toBe(200);
  });

  it("should give each authenticated account its own counter", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 1 }));

    const alice = await register();
    const bob = await register();
    const aliceCookie = `accessToken=${cookiesFrom(alice.response).accessToken.value}`;
    const bobCookie = `accessToken=${cookiesFrom(bob.response).accessToken.value}`;

    expect((await request(server).get("/ping").set("Cookie", [aliceCookie])).status).toBe(200);
    expect((await request(server).get("/ping").set("Cookie", [aliceCookie])).status).toBe(429);
    // One account spending its budget says nothing about another's.
    expect((await request(server).get("/ping").set("Cookie", [bobCookie])).status).toBe(200);
  });

  it("should namespace its keys so two policies cannot collide", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 5 }));

    await request(server).get("/ping");

    // scope, then who it was counted against. CacheService's namespace is a
    // different prefix, so a cached value can never be mistaken for a counter or
    // the other way round.
    expect(rateLimitKeys("unit")).toHaveLength(1);
    expect(rateLimitKeys("unit")[0]).toMatch(/^taskora:ratelimit:unit:(user|ip):\S+$/);
  });

  it("should skip a request its policy does not match", async () => {
    const uploadsOnly = createRateLimiter({
      scope: "unit",
      limit: 1,
      match: (req) => String(req.get("content-type") || "").startsWith("multipart/"),
    });
    const server = limitedApp(uploadsOnly);

    // JSON is not this policy's business, so it must not spend the budget.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(server).get("/ping")).status).toBe(200);
    }

    const multipart = await request(server)
      .get("/ping")
      .set("Content-Type", "multipart/form-data; boundary=x");
    expect(multipart.status).toBe(200);
    expect((await request(server).get("/ping").set("Content-Type", "multipart/form-data; boundary=x")).status).toBe(429);
  });

  it("should let requests through when Redis cannot be reached", async () => {
    const server = limitedApp(limiterFor({ scope: "unit", limit: 1 }));
    const realEval = redisStub.redis.eval;

    // What config/redis.js produces when Redis is down: every command rejects,
    // because enableOfflineQueue is off.
    redisStub.redis.eval = async () => {
      throw new Error("Stream isn't writeable");
    };

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await request(server).get("/ping");
        expect(response.status).toBe(200);
        // No RateLimit header either: one that is not backed by a counter is
        // worse than none, because a client would believe it.
        expect(response.headers["ratelimit-limit"]).toBeUndefined();
      }
    } finally {
      redisStub.redis.eval = realEval;
    }
  });
});

describe("who a request is counted against", () => {
  it("should prefer the account authMiddleware already identified", () => {
    expect(identifyRequest({ user: { userId: "user-1" }, ip: "10.0.0.1" })).toBe("user:user-1");
  });

  it("should read the account off the access cookie when authMiddleware has not run", async () => {
    // A limiter mounted ahead of a router has no req.user yet, which is the case
    // that would otherwise collapse every signed-in user onto one address bucket.
    const { response } = await register();
    const token = cookiesFrom(response).accessToken.value;

    const identified = identifyRequest({
      cookies: { accessToken: token },
      ip: "203.0.113.9",
    });

    expect(identified).toMatch(/^user:/);
    expect(identified).not.toBe("ip:203.0.113.9");
  });

  it("should fall back to the address when there is no usable token", () => {
    expect(identifyRequest({ ip: "203.0.113.9" })).toBe("ip:203.0.113.9");
    expect(
      identifyRequest({ cookies: { accessToken: "not.a.real.token" }, ip: "203.0.113.9" })
    ).toBe("ip:203.0.113.9");
    // A refresh token is not an access token, and this middleware never looks at
    // one: it reads the same cookie authMiddleware does and nothing more.
    expect(
      identifyRequest({ cookies: { refreshToken: "anything" }, ip: "203.0.113.9" })
    ).toBe("ip:203.0.113.9");
  });

  it("should not let a forged cookie lock a stranger out", () => {
    // Whatever the cookie claims, a token that does not verify counts by address,
    // so one attacker cannot spend another caller's budget — and cannot forge
    // their way past a limit either, because the counter it lands in is its own.
    expect(
      identifyRequest({ cookies: { accessToken: "eyJhbGciOiJIUzI1NiJ9.e30.x" }, ip: "198.51.100.4" })
    ).toBe("ip:198.51.100.4");
  });
});

describe("the limiters mounted on the real routes", () => {
  it("should not rate limit the health probe", async () => {
    // Whatever a monitor does, the answer stays 200.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app).get("/api/health");
      expect(response.status).toBe(200);
    }

    // The general API budget was never touched by any of them.
    expect(rateLimitKeys()).toEqual([]);
  });
  it("should answer an ordinary authenticated request normally", async () => {
    const { agent, user } = await createUser();

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
    // The innermost policy is the one that reports itself, which on an auth route
    // is the auth tier rather than the general API tier.
    expect(me.headers["ratelimit-limit"]).toBe("6");

    const tasks = await agent.get("/api/tasks");
    expect(tasks.status).toBe(200);
    expect(tasks.headers["ratelimit-limit"]).toBe("8");
  });

  it("should turn away a burst of failed sign-ins but not the first ones", async () => {
    const { user } = await createUser();

    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: "WrongPassword123!" });
      statuses.push(response.status);
    }

    // createUser() spent one, so five more fit inside RATE_LIMIT_AUTH_MAX=6. Each
    // of those is the endpoint's own answer — 401 — rather than a 429, which is
    // the property that matters: the limiter is not pre-empting real attempts.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("should keep refresh and logout working", async () => {
    const { agent } = await createUser();

    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);

    const loggedOut = await agent.post("/api/auth/logout");
    expect(loggedOut.status).toBe(200);
  });

  it("should protect the password reset endpoints more tightly than the rest of auth", async () => {
    const { user } = await createUser();

    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: user.email });
      statuses.push(response.status);
    }

    // RATE_LIMIT_PASSWORD_RESET_MAX=2, and the general auth budget is not even
    // close to spent, so this is the reset tier doing the work on its own.
    expect(statuses.slice(0, 2)).toEqual([200, 200]);
    expect(statuses[2]).toBe(429);
    expect(rateLimitKeys("password-reset")).toHaveLength(1);
  });

  it("should limit the AI endpoints without touching AI logic", async () => {
    const { agent } = await createUser();

    const statuses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await agent.get("/api/ai/preferences");
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
    // Keyed by account, because the access cookie is read even though the AI
    // router's own authMiddleware has not run yet.
    expect(rateLimitKeys("ai")[0]).toMatch(/^taskora:ratelimit:ai:user:/);
  });

  it("should limit uploads before Multer sees the body", async () => {
    const { agent } = await createUser();

    // A real multipart request — that is the only thing the upload tier counts, so
    // the content type has to genuinely be there. The field is deliberately the
    // wrong one, which Multer rejects with a 400 before writing anything to disk.
    // What matters is that the attempt was counted either way and that the third
    // one never reaches Multer at all.
    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await agent.post("/api/users/me/avatar").field("unexpected", "x");
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 2)).toEqual([400, 400]);
    expect(statuses[2]).toBe(429);
    expect(rateLimitKeys("upload")[0]).toMatch(/^taskora:ratelimit:upload:user:/);
  });

  it("should not rate limit requests outside /api", async () => {
    // The static mount sits above the limiters and outside their prefix. A miss
    // here is a 404 from express.static, never a 429.
    const response = await request(app).get("/uploads/does-not-exist.png");

    expect(response.status).toBe(404);
    expect(rateLimitKeys()).toEqual([]);
  });

  it("should let a real sign-in through again once the auth counter is gone", async () => {
    const { user } = await createUser();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: "WrongPassword123!" });
    }

    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(blocked.status).toBe(429);

    // Dropping the counter is what the expiry looks like from out here; the window
    // itself is exercised for real in the 150ms case above.
    redisStub.reset();

    const allowed = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(allowed.status).toBe(200);
    expect(allowed.body.message).toBe("Login successful");
  });
});
