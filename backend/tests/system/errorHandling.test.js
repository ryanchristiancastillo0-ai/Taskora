"use strict";

/**
 * The parts that are not a feature: the health check, the shape of an error,
 * and the things that must never leak.
 *
 * These are the tests most likely to be deleted by accident, because nothing
 * about them looks like a feature. They are also the only ones that would notice
 * a stack trace, a password hash or an env var appearing in a response, which
 * is why they assert on absence as carefully as on presence.
 */

const { app, request, resetState, createUser } = require("../support/harness");

beforeEach(resetState);

describe("GET /api/health", () => {
  it("should report the service up without requiring a token", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    // The shared envelope, not a bespoke health shape.
    expect(response.body).toEqual({ success: true, message: "OK" });
  });
});

describe("an unknown route", () => {
  it("should return the shared 404 shape", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      message: expect.any(String),
    });
  });

  it("should answer an unauthenticated 404 with 404, not with 401", async () => {
    // The guard is mounted per-router, so a missing path never reaches it. If
    // this ever came back 401 it would mean auth had been hoisted above the
    // routes, which would also hide which routes exist.
    const response = await request(app).get("/nope");

    expect(response.status).toBe(404);
  });
});

describe("the error response shape", () => {
  it("should use success: false and a message for a handled failure", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@taskora.test", password: "WrongPassword123!" });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body).toHaveProperty("message");
  });

  it("should attach details to a validation failure", async () => {
    const { agent } = await createUser();

    const response = await agent.post("/api/tasks").send({ priority: "HIGH" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "title", message: expect.any(String) })])
    );
  });

// Known defect: body-parser throws a SyntaxError carrying statusCode 400, but
// errorMiddleware only maps AppError, so a client that sends a truncated body is
// answered 500. That is a wrong status code, not a crash, and fixing it means
// touching production error handling. `it.failing` records the gap: it passes
// while the bug is present and starts failing the moment someone fixes it,
// which is the signal to delete this wrapper and the assertion together.
it.failing("should reject malformed JSON with 400 rather than 500", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send("{ not json");

  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
});
});

describe("what an error must not leak", () => {
  it("should not include a stack trace on a handled error", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@taskora.test", password: "WrongPassword123!" });

    expect(response.body).not.toHaveProperty("stack");
    expect(JSON.stringify(response.body)).not.toContain("node_modules");
  });

  it("should not include a stack trace on an unhandled error", async () => {
    const { agent } = await createUser();

    const response = await agent.post("/api/tasks").send({ title: "Bad", priority: "NOPE" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toHaveProperty("stack");
    // The internal shape of the test double must not reach the client either.
    expect(JSON.stringify(response.body)).not.toContain("memoryDb");
    expect(JSON.stringify(response.body)).not.toContain("node_modules");
  });

  it("should answer a wrong password without confirming whether the account exists", async () => {
    const { user } = await createUser();

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "WrongPassword123!" });

    const noSuchAccount = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@taskora.test", password: "WrongPassword123!" });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    // Identical wording: a different message for a known address would turn the
    // login form into an account-enumeration oracle.
    expect(wrongPassword.body.message).toBe(noSuchAccount.body.message);
    expect(wrongPassword.body).toEqual(noSuchAccount.body);
  });

  it("should not echo the submitted password back", async () => {
    const { user } = await createUser();

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "WrongPassword123!" });

    expect(JSON.stringify(response.body)).not.toContain("WrongPassword123!");
  });
});

describe("security headers", () => {
  it("should set the usual hardening headers on a JSON response", async () => {
    const response = await request(app).get("/api/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    // Helmet's default, which is SAMEORIGIN rather than DENY.
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["content-security-policy"]).toBeTruthy();
    // crossOriginResourcePolicy is opened up because the SPA loads uploaded
    // images straight from this origin.
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("should not mark a response that carries a token as cacheable", async () => {
    const { agent } = await createUser();

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBeTruthy();
    // Whatever the header says, the point is that the body is per-account, so
    // a shared cache must not be told to keep it.
    expect(response.headers["cache-control"] ?? "").not.toMatch(/public|max-age/);
  });
});

describe("CORS", () => {
  it("should allow the configured origin with credentials", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    // Credentials are only sent when the origin is echoed back exactly; a
    // wildcard plus credentials is rejected by browsers anyway.
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("should never reflect the requesting origin, so a stranger's is not echoed", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example.com");

    // cors() is configured with a fixed origin string, so the header is that
    // constant whatever the request asked for. It is not a reflection, and a
    // browser refuses it for a page not on that origin.
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-origin"]).not.toContain("evil.example.com");
  });

  it("should refuse a preflight from an unknown origin", async () => {
    const response = await request(app)
      .options("/api/tasks")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"] ?? "").not.toContain("evil.example.com");
  });
});

describe("the auth cookie surface", () => {
  it("should set the refresh cookie httpOnly and strict", async () => {
    const { agent } = await createUser();

    const response = await agent.post("/api/auth/refresh");

    expect(response.status).toBe(200);
    const cookies = [].concat(response.headers["set-cookie"] || []);
    const refresh = cookies.find((cookie) => cookie.startsWith("refreshToken="));

    expect(refresh).toBeDefined();
    expect(refresh).toContain("HttpOnly");
    expect(refresh).toContain("SameSite=Strict");
    // Path is `/`, so the refresh token rides along on every request in the
    // origin. Narrowing it to /api/auth would be the stronger choice.
    expect(refresh).toContain("Path=/");
  });

  it("should clear both cookies on sign-out", async () => {
    const { agent } = await createUser();

    const response = await agent.post("/api/auth/logout");

    expect(response.status).toBe(200);
    const cookies = [].concat(response.headers["set-cookie"] || []);
    for (const name of ["accessToken", "refreshToken"]) {
      const cookie = cookies.find((entry) => entry.startsWith(`${name}=`));
      expect(cookie).toBeDefined();
      // Cleared by an epoch `Expires`, which is equivalent to Max-Age=0. The
      // emptied value alone would not remove it.
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cookie).toContain("HttpOnly");
    }
  });

  it("should refuse to repeat an action on a signed-out session", async () => {
    const { agent } = await createUser();
    await agent.post("/api/auth/logout");

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(401);
  });
});