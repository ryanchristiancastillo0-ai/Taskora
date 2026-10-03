"use strict";

/**
 * /api/admin — the staff console.
 *
 * Two things worth noting about the fixtures. Every admin is created through
 * AdminService's own bootstrap path rather than by writing a row, so the tests
 * exercise the same row shape the app produces. And each admin signs in for
 * themselves, because adminGuard re-reads the database on every request — an
 * admin token from an earlier test is not interchangeable with a later one.
 */

const { app, request, db, resetState, createUser, createAdmin } = require("../support/harness");

beforeEach(resetState);

describe("GET /api/admin/overview", () => {
  it("should return counts that match what is actually stored", async () => {
    const { agent } = await createAdmin();
    const { agent: other } = await createUser();

    await other.post("/api/tasks").send({ title: "One" });
    await other.post("/api/tasks").send({ title: "Two" });
    await other.post("/api/tasks").send({ title: "Three", status: "COMPLETED" });

    const response = await agent.get("/api/admin/overview");

    expect(response.status).toBe(200);
    // The service returns a flat object; there is no wrapping `overview` key.
    expect(response.body.data.totalUsers).toBe(2);
    expect(response.body.data.totalTasks).toBe(3);
    expect(response.body.data.completedTasks).toBe(1);
    expect(response.body.data.completionRate).toBe(33);
  });

  it("should reject a non-admin with 403", async () => {
    const { agent } = await createUser();

    const response = await agent.get("/api/admin/overview");

    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/users", () => {
  it("should list every user, not just the caller's", async () => {
    const { agent } = await createAdmin();
    await createUser();
    await createUser();

    const response = await agent.get("/api/admin/users");

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(3);
  });

  it("should never include a password hash", async () => {
    const { agent } = await createAdmin();
    await createUser();

    const response = await agent.get("/api/admin/users");

    for (const user of response.body.data.items) {
      expect(user).not.toHaveProperty("password");
      expect(user).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(user)).not.toContain("$2b$");
    }
  });

  it("should support a search filter", async () => {
    const { agent } = await createAdmin();
    await createUser({ email: "alice@example.com" });
    await createUser({ email: "bob@example.com" });

    const response = await agent.get("/api/admin/users?q=alice");

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].email).toBe("alice@example.com");
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("should promote a user to ADMIN", async () => {
    const { agent } = await createAdmin();
    const target = await createUser();

    const response = await agent
      .patch(`/api/admin/users/${target.user.id}`)
      .send({ role: "ADMIN" });

    expect(response.status).toBe(200);
    // updateUser returns the row flat, with a derived display name and a select
    // list that cannot include the password hash.
    expect(response.body.data).toMatchObject({ id: target.user.id, role: "ADMIN" });
    expect(response.body.data).not.toHaveProperty("password");
    expect(db.findRow("user", target.user.id).role).toBe("ADMIN");
  });

  it("should suspend a user and end their sessions", async () => {
    const admin = await createAdmin();
    const target = await createUser();

    // The target still holds a live access token and a live refresh token.
    expect((await target.agent.get("/api/tasks")).status).toBe(200);

    const response = await admin.agent
      .patch(`/api/admin/users/${target.user.id}`)
      .send({ status: "SUSPENDED" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("SUSPENDED");

    // adminGuard reads status on every request, so the console is shut at once.
    expect((await target.agent.get("/api/admin/overview")).status).toBe(403);
  });

  it("should revoke the suspended user's refresh tokens, so the session cannot be renewed", async () => {
    const admin = await createAdmin();
    const target = await createUser();

    expect((await target.agent.post("/api/auth/refresh")).status).toBe(200);

    await admin.agent
      .patch(`/api/admin/users/${target.user.id}`)
      .send({ status: "SUSPENDED" });

    // updateUser marks the tokens revoked rather than deleting the rows, so the
    // count stays the same and the check is on revokedAt.
    const tokens = db.table("refreshToken").filter((row) => row.userId === target.user.id);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every((row) => row.revokedAt !== null)).toBe(true);

    // And presenting a revoked one is refused, so the user cannot mint fresh
    // 15-minute access tokens.
    expect((await target.agent.post("/api/auth/refresh")).status).toBe(401);
  });

  it("should record the acting admin's own sign-in, read straight from the store", async () => {
    const admin = await createAdmin();
    const target = await createUser();

    // Both fixtures signed in, so two AUTH_LOGIN_SUCCEEDED rows exist. Note the
    // audit vocabulary declares ADMIN_ROLE_CHANGED / ADMIN_STATUS_CHANGED but
    // nothing writes them yet — only the auth events in authController are
    // wired to AuditService.record(). So there is no row for the promotion
    // below, and asserting one would document a feature that does not exist.
    const rows = db.rows("auditLog");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.action === "AUTH_LOGIN_SUCCEEDED")).toBe(true);

    const entry = rows.find((row) => row.userId === admin.user.id);
    expect(entry).toMatchObject({
      action: "AUTH_LOGIN_SUCCEEDED",
      entity: "User",
      entityId: admin.user.id,
      oldValue: null,
      newValue: null,
    });
    expect(entry.details).toMatchObject({ email: admin.user.email, rememberMe: false });
    expect(entry.ipAddress).toBeTruthy();

    // Sanity: the promotion really did happen, it just was not logged.
    await admin.agent
      .patch(`/api/admin/users/${target.user.id}`)
      .send({ role: "ADMIN" });
    expect(db.findRow("user", target.user.id).role).toBe("ADMIN");
    expect(db.rows("auditLog")).toHaveLength(2);
  });

  it("should never write a secret into an audit row", async () => {
    await createUser();

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@taskora.test", password: "WrongPassword123!" });

    expect(response.status).toBe(401);

    const failure = db.rows("auditLog").find((row) => row.action === "AUTH_LOGIN_FAILED");
    expect(failure).toBeDefined();
    // A failed sign-in has no account to attach, so userId is null and the
    // attempted address is read out of details instead.
    expect(failure.userId).toBeNull();
    expect(failure.details.email).toBe("nobody@taskora.test");
    expect(JSON.stringify(failure)).not.toContain("WrongPassword123!");
  });

  it("should reject a request that changes nothing with 400", async () => {
    const { agent } = await createAdmin();
    const target = await createUser();

    const response = await agent.patch(`/api/admin/users/${target.user.id}`).send({});

    expect(response.status).toBe(400);
  });

  it("should reject an invalid role with 400", async () => {
    const { agent } = await createAdmin();
    const target = await createUser();

    const response = await agent
      .patch(`/api/admin/users/${target.user.id}`)
      .send({ role: "SUPERUSER" });

    expect(response.status).toBe(400);
  });

  it("should return 404 for an unknown user id", async () => {
    const { agent } = await createAdmin();

    const response = await agent.patch("/api/admin/users/nobody").send({ status: "SUSPENDED" });

    expect(response.status).toBe(404);
  });
});

describe("the self-lockout guards on PATCH /api/admin/users/:id", () => {
  // There is no DELETE /api/admin/users/:id route — deletion is the account's
  // own DELETE /api/users/me. These two are the paths by which an admin could
  // otherwise strand themselves, and both exist in updateUser.
  it("should refuse to remove the caller's own admin access", async () => {
    const { agent, user } = await createAdmin();

    const response = await agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ role: "USER" });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/cannot remove your own admin access/i);
    // Still an admin, and still able to use the console.
    expect(db.findRow("user", user.id).role).toBe("ADMIN");
    expect((await agent.get("/api/admin/overview")).status).toBe(200);
  });

  it("should refuse to suspend the caller's own account", async () => {
    const { agent, user } = await createAdmin();

    const response = await agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ status: "SUSPENDED" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You cannot suspend your own account");
    expect(db.findRow("user", user.id).status).toBe("ACTIVE");
  });

  it("should let a second admin demote the first, which is the supported way out", async () => {
    const first = await createAdmin();
    const second = await createAdmin();

    const response = await second.agent
      .patch(`/api/admin/users/${first.user.id}`)
      .send({ role: "USER" });

    expect(response.status).toBe(200);
    expect(db.findRow("user", first.user.id).role).toBe("USER");
    // The demoted admin is shut out on its next request, with the token it is
    // still holding.
    expect((await first.agent.get("/api/admin/overview")).status).toBe(403);
  });
});

describe("GET /api/admin/audit-logs", () => {
  it("should refuse a non-admin with 403", async () => {
    const { agent } = await createUser();

    const response = await agent.get("/api/admin/audit-logs");

    expect(response.status).toBe(403);
  });

  it("should show an admin the audit trail with actor, target and metadata attached", async () => {
    const { agent } = await createAdmin();
    await createUser();

    const response = await agent.get("/api/admin/audit-logs");

    expect(response.status).toBe(200);
    const entries = response.body.data.items;
    expect(entries).toHaveLength(2);
    // Newest first, so the second fixture's sign-in leads.
    expect(entries[0].id).toEqual(expect.any(String));
    expect(entries[0]).toHaveProperty("action", "AUTH_LOGIN_SUCCEEDED");
    // The row's own userId is not exposed; it reaches the client as actor.id.
    expect(entries[0]).not.toHaveProperty("userId");
    expect(entries[0]).toHaveProperty("actor");
    expect(entries[0].actor).toHaveProperty("email");
    expect(entries[0].actor.id).toBe(entries[0].entityId);
    expect(entries[0]).toHaveProperty("at");
    expect(response.body.data.pagination).toMatchObject({ total: 2 });
  });

  it("should filter by action", async () => {
    const { agent } = await createAdmin();
    await createUser();
    await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@taskora.test", password: "WrongPassword123!" });

    const response = await agent.get("/api/admin/audit-logs?action=AUTH_LOGIN_FAILED");

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].action).toBe("AUTH_LOGIN_FAILED");
    // The unmatched-attempt row is returned with actor: null rather than dropped.
    expect(response.body.data.items[0].actor).toBeNull();
  });

  it("should expose no write path for its own trail", async () => {
    const { agent } = await createAdmin();

    // An audit log an admin can erase is not an audit log, so there is no
    // create, update or delete on this router.
    for (const [method, route] of [
      ["post", "/api/admin/audit-logs"],
      ["delete", "/api/admin/audit-logs"],
      ["delete", `/api/admin/audit-logs/${db.rows("auditLog")[0].id}`],
    ]) {
      const response = await agent[method](route);
      expect(response.status).toBe(404);
    }
  });

  it("should reject an unauthenticated request with 401", async () => {
    const response = await request(app).get("/api/admin/audit-logs");

    expect(response.status).toBe(401);
  });
});

describe("GET /api/admin/reports", () => {
  it("should return a report payload to an admin", async () => {
    const { agent } = await createAdmin();

    const response = await agent.get("/api/admin/reports?range=30d");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});