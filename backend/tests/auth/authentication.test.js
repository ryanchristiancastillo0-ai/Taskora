"use strict";

/**
 * /api/auth — registration, sign-in, refresh and sign-out.
 *
 * These go through the real HTTP stack, so they cover the cookie contract as
 * well as the JSON contract: an endpoint that answered 200 but set the wrong
 * cookie would pass a body-only test and still be broken in the browser.
 *
 * Status codes are the application's existing ones. Nothing here was changed to
 * make an assertion pass.
 */

const {
  app,
  request,
  db,
  TEST_PASSWORD,
  uniqueEmail,
  resetState,
  register,
  signIn,
  cookiesFrom,
  cookieHas,
} = require("../support/harness");

beforeEach(resetState);

describe("POST /api/auth/register", () => {
  it("should create an account and set httpOnly auth cookies", async () => {
    const email = uniqueEmail();

    const { response } = await register({ email, firstName: "Ryan", lastName: "Santos" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, message: "Registration successful" });
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.firstName).toBe("Ryan");

    const cookies = cookiesFrom(response);
    expect(cookies.accessToken).toBeDefined();
    expect(cookies.refreshToken).toBeDefined();
    expect(cookieHas(cookies.accessToken, "HttpOnly")).toBe(true);
    expect(cookieHas(cookies.accessToken, "SameSite")).toBe(true);
  });

  it("should never return the password hash", async () => {
    const { response } = await register();

    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("should reject a duplicate email with 409", async () => {
    const email = uniqueEmail();
    await register({ email });

    const { response } = await register({ email });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, message: "Email is already registered" });
  });

  it("should reject a password shorter than 8 characters with 400", async () => {
    const { response } = await register({ password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it("should reject a malformed email with 400", async () => {
    const { response } = await register({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "email" })])
    );
  });
});

describe("POST /api/auth/login", () => {
  it("should sign in an existing account and set both auth cookies", async () => {
    const { payload } = await register({ email: uniqueEmail() });

    const response = await request(app).post("/api/auth/login").send({
      email: payload.email,
      password: payload.password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, message: "Login successful" });

    const cookies = cookiesFrom(response);
    expect(cookies.accessToken).toBeDefined();
    expect(cookies.refreshToken).toBeDefined();
  });

  it("should issue a session refresh cookie when rememberMe is absent", async () => {
    const { payload } = await register();

    const response = await request(app).post("/api/auth/login").send({
      email: payload.email,
      password: payload.password,
    });

    // No Max-Age on the refresh cookie means it dies with the browser session,
    // which is what "remember me" unticked is supposed to mean.
    expect(cookieHas(cookiesFrom(response).refreshToken, "Max-Age")).toBe(false);
  });

  it("should give the refresh cookie a Max-Age when rememberMe is set", async () => {
    const { payload } = await register();

    const response = await request(app).post("/api/auth/login").send({
      email: payload.email,
      password: payload.password,
      rememberMe: true,
    });

    expect(response.status).toBe(200);
    expect(cookieHas(cookiesFrom(response).refreshToken, "Max-Age")).toBe(true);
  });

  it("should reject a wrong password with 401 and the same message as an unknown address", async () => {
    const { payload } = await register();

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: payload.email, password: "WrongPassword123!" });

    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("nobody"), password: "WrongPassword123!" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical answers, so the endpoint cannot be used to test whether an
    // address has an account.
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it("should reject a missing password with 400", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: uniqueEmail() });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
  });
});

describe("GET /api/auth/me", () => {
  it("should return the signed-in user", async () => {
    const { agent, user } = await signIn({ email: (await register()).payload.email });

    const response = await agent.get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("should reject a request with no access token with 401", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: "Access token is required",
    });
  });

  it("should reject a forged access token with 401", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["accessToken=not.a.real.token"]);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });

  it("should reject a refresh token presented as an access token with 401", async () => {
    const { payload } = await register();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: payload.email, password: payload.password });

    const refreshCookie = cookiesFrom(login).refreshToken.value;
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`accessToken=${refreshCookie}`]);

    expect(response.status).toBe(401);
    // The two tokens are signed with different secrets, so verifyAccessToken
    // throws before the `type !== "access"` branch is ever reached — the
    // observed message is the catch-all, not "Invalid access token".
    expect(response.body.message).toBe("Invalid or expired access token");
  });
});

describe("POST /api/auth/refresh", () => {
  it("should exchange a refresh cookie for a new pair of cookies", async () => {
    const { payload } = await register();
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: payload.email, password: payload.password });

    const response = await agent.post("/api/auth/refresh");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "Token refreshed successfully",
    });
    expect(cookiesFrom(response).accessToken).toBeDefined();
  });

  it("should revoke the presented token so it cannot be reused", async () => {
    const { payload } = await register();
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: payload.email, password: payload.password });
    const refreshCookie = cookiesFrom(login).refreshToken.value;

    const first = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refreshToken=${refreshCookie}`]);
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refreshToken=${refreshCookie}`]);

    expect(replay.status).toBe(401);
  });

  it("should reject a refresh with no cookie with 401", async () => {
    const response = await request(app).post("/api/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Refresh token is required");
  });
});

describe("POST /api/auth/logout", () => {
  it("should clear both auth cookies", async () => {
    const { agent } = await signIn({ email: (await register()).payload.email });

    const response = await agent.post("/api/auth/logout");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, message: "Logout successful" });

    const cleared = cookiesFrom(response);
    expect(cleared.accessToken.value).toBe("");
    expect(cleared.refreshToken.value).toBe("");
  });

  it("should revoke the stored refresh token so the session cannot be renewed", async () => {
    const email = (await register()).payload.email;
    const { agent } = await signIn({ email });

    await agent.post("/api/auth/logout");
    const refresh = await agent.post("/api/auth/refresh");

    expect(refresh.status).toBe(401);
  });

  it("should reject an unauthenticated logout with 401", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(401);
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("should answer identically for a known and an unknown address", async () => {
    const { payload } = await register();

    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: payload.email });
    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: uniqueEmail("nobody") });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it("should store a reset code only for an address that exists", async () => {
    const { payload } = await register();
    await request(app).post("/api/auth/forgot-password").send({ email: payload.email });

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: uniqueEmail("nobody") });

    expect(db.rows("passwordResetCode")).toHaveLength(1);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("should reject a wrong reset code with 400", async () => {
    const { payload } = await register();

    const response = await request(app).post("/api/auth/reset-password").send({
      email: payload.email,
      code: "000000",
      newPassword: "BrandNewPassword123!",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid or expired reset code");
  });

  it("should let the account sign in with the new password after a valid reset", async () => {
    // The code itself is minted by the service and emailed through the Brevo
    // stub, so the test reads it back from the stub the way an admin reading a
    // mailbox would, rather than reaching into the store for the hash.
    const emailStub = require("../support/emailServiceStub");
    const { payload } = await register();

    await request(app).post("/api/auth/forgot-password").send({ email: payload.email });
    const code = emailStub.sent.find((entry) => entry.kind === "password-reset").code;

    const reset = await request(app).post("/api/auth/reset-password").send({
      email: payload.email,
      code,
      newPassword: "BrandNewPassword123!",
    });
    expect(reset.status).toBe(200);

    const oldPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: payload.email, password: TEST_PASSWORD });
    const newPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: payload.email, password: "BrandNewPassword123!" });

    expect(oldPassword.status).toBe(401);
    expect(newPassword.status).toBe(200);
  });
});
