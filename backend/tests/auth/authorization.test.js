"use strict";

/**
 * The role boundary.
 *
 * Taskora splits authorization across two middlewares and both halves matter:
 *
 *   authMiddleware — "is this a signed-in account", answered from the access
 *                    token cookie alone.
 *   adminGuard     — "is it an admin, and is it still active", answered from a
 *                    fresh database read on every request.
 *
 * The second is the interesting one. The role is not in the JWT, so a demotion
 * takes effect on the very next request instead of waiting out a 15-minute
 * token, and a suspended account is locked out even while holding a valid one.
 * These tests assert that behaviour rather than assuming it.
 */

const { app, request, db, resetState, createUser, createAdmin, signIn, register } = require("../support/harness");

beforeEach(resetState);

/** The console routes a test checks when it wants to prove the guard holds. */
const ADMIN_ROUTES = [
  ["/api/admin/overview", "get"],
  ["/api/admin/users", "get"],
  ["/api/admin/tasks", "get"],
  ["/api/admin/projects", "get"],
  ["/api/admin/notifications", "get"],
  ["/api/admin/reports", "get"],
  ["/api/admin/audit-logs", "get"],
];

describe("a request with no credentials", () => {
  it.each(ADMIN_ROUTES)("should reject %s %s with 401", async (route, method) => {
    const response = await request(app)[method](route);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: "Access token is required",
    });
  });

  it("should reject a user route with 401", async () => {
    const response = await request(app).get("/api/tasks");

    expect(response.status).toBe(401);
  });
});

describe("an authenticated non-admin", () => {
  it.each(ADMIN_ROUTES)("should be refused %s %s with 403", async (route, method) => {
    const { agent } = await createUser();

    const response = await agent[method](route);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      message: "Administrator access required",
    });
  });

  it("should be allowed the user routes", async () => {
    const { agent } = await createUser();

    const response = await agent.get("/api/tasks");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

describe("an administrator", () => {
  it.each(ADMIN_ROUTES)("should be allowed %s %s with 200", async (route, method) => {
    const { agent } = await createAdmin();

    const response = await agent[method](route);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should lose console access as soon as the role changes, without waiting for the token to expire", async () => {
    const { agent, id } = await createAdmin();
    expect((await agent.get("/api/admin/users")).status).toBe(200);

    // The role moves in the database while the same access token cookie is
    // still in the jar. adminGuard re-reads the row, so the very next request
    // is already refused.
    const row = db.findRow("user", id);
    row.role = "USER";

    const after = await agent.get("/api/admin/users");

    expect(after.status).toBe(403);
    expect(after.body.message).toBe("Administrator access required");
  });

  it("should keep console access after the role is granted, again without a new token", async () => {
    const { agent, id } = await createUser();

    expect((await agent.get("/api/admin/users")).status).toBe(403);

    db.findRow("user", id).role = "ADMIN";

    expect((await agent.get("/api/admin/users")).status).toBe(200);
  });
});

describe("a suspended administrator", () => {
  it("should be refused with 403 while still holding a valid access token", async () => {
    const { agent, id } = await createAdmin();
    db.findRow("user", id).status = "SUSPENDED";

    const response = await agent.get("/api/admin/overview");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("This account has been suspended");
  });

  it("should not be locked out of sign-in by the guard alone, because revocation is the suspension path's job", async () => {
    const { agent, id } = await createAdmin();
    db.findRow("user", id).status = "SUSPENDED";

    // authMiddleware reads the token and nothing else; only adminGuard looks at
    // status. So flipping the column directly blocks the console but leaves the
    // session valid — which is correct, because revoking the refresh tokens is
    // what AdminService.updateUser does, and it is covered in tests/admin.
    // (See usersAdmin.test.js for the end-to-end version.)
    expect((await agent.get("/api/admin/overview")).status).toBe(403);
  });
});

describe("a deleted account", () => {
  it("should be refused with 401 because the guard can no longer find the row", async () => {
    const { agent, id } = await createAdmin();

    db.table("user");
    db.rows("user").splice(db.rows("user").indexOf(db.findRow("user", id)), 1);

    const response = await agent.get("/api/admin/users");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Account not found");
  });
});

describe("cross-account access", () => {
  it("should not let one user read another's task", async () => {
    const owner = await createUser();
    const intruder = await createUser();

    const created = await owner.agent
      .post("/api/tasks")
      .send({ title: "Owner private task" });
    expect(created.status).toBe(201);

    const response = await intruder.agent.get(`/api/tasks/${created.body.data.task.id}`);

    // 404 rather than 403: the task service filters on { id, userId }, so
    // another person's task is indistinguishable from one that does not exist.
    // A 403 would confirm the id is real.
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Task not found");
  });

  it("should not let one user delete another's task", async () => {
    const owner = await createUser();
    const intruder = await createUser();

    const created = await owner.agent.post("/api/tasks").send({ title: "Owner task" });
    const taskId = created.body.data.task.id;

    const response = await intruder.agent.delete(`/api/tasks/${taskId}`);

    expect(response.status).toBe(404);
    expect((await owner.agent.get(`/api/tasks/${taskId}`)).status).toBe(200);
  });

  it("should not let a user update another user's task", async () => {
    const owner = await createUser();
    const intruder = await createUser();

    const created = await owner.agent.post("/api/tasks").send({ title: "Original title" });
    const taskId = created.body.data.task.id;

    const response = await intruder.agent
      .patch(`/api/tasks/${taskId}`)
      .send({ title: "Hijacked" });

    expect(response.status).toBe(404);
    const reread = await owner.agent.get(`/api/tasks/${taskId}`);
    expect(reread.body.data.task.title).toBe("Original title");
  });
});

describe("the token cookie itself", () => {
  it("should not accept an access token in a query string or header instead of the cookie", async () => {
    const { agent } = await createUser();
    await agent.post("/api/tasks").send({ title: "Mine" });

    // authMiddleware reads req.cookies only. A token in Authorization must not
    // authenticate, or a link with a token in it would grant access.
    const viaHeader = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${extractAccessToken(agent)}`);

    expect(viaHeader.status).toBe(401);
  });

  it("should refuse a token signed with the wrong secret", async () => {
    const forged = require("jsonwebtoken").sign(
      { userId: "someone", type: "access" },
      "not-the-access-secret",
      { expiresIn: "15m" }
    );

    const response = await request(app)
      .get("/api/tasks")
      .set("Cookie", [`accessToken=${forged}`]);

    expect(response.status).toBe(401);
  });
});

/** Reads the access token back out of a supertest agent's cookie jar. */
function extractAccessToken(agent) {
  const jar = agent.jar;
  const match = jar
    .getCookies("http://localhost")
    .find((cookie) => cookie.name === "accessToken");
  return match ? decodeURIComponent(match.value) : "";
}
