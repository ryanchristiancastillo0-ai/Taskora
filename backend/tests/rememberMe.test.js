// "Remember me" session-lifetime tests.
// Run with: node tests/rememberMe.test.js
const assert = require("assert");

// jwt.js reads the secrets at require time, so they must exist beforehand.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

const jwt = require("jsonwebtoken");
const { setAuthCookies, REMEMBERED_REFRESH_MAX_AGE, REFRESH_TOKEN_MAX_AGE } =
  require("../src/utils/cookie");
const { signRefreshToken, REMEMBERED_REFRESH_EXPIRES_IN } =
  require("../src/utils/jwt");
const { loginSchema } = require("../src/validators/user/authValidators.js");
const AuthService = require("../src/services/user/authService.js");

const DAY = 24 * 60 * 60 * 1000;

// Captures what would be written as Set-Cookie headers.
function fakeRes() {
  const set = [];
  return {
    set,
    cookie: (name, value, options) => set.push({ name, value, options }),
    clearCookie: (name, options) => set.push({ name, value: null, options }),
  };
}

const cookieNamed = (res, name) => res.set.find((c) => c.name === name);

// Decode a token without verifying it, to inspect its claims/lifetime.
function claims(token) {
  return jwt.decode(token);
}

const lifetimeMs = (token) => (claims(token).exp - claims(token).iat) * 1000;

function buildService() {
  const created = [];
  const prisma = {
    refreshToken: {
      create: async ({ data }) => {
        created.push(data);
        return data;
      },
      findUnique: async () => null,
      update: async ({ data }) => data,
    },
  };
  return {
    created,
    service: new AuthService(prisma, null, null),
  };
}

async function run() {
  // ---------- cookies: unchecked means a real session cookie ----------
  {
    const res = fakeRes();
    setAuthCookies(res, { accessToken: "a", refreshToken: "r" });

    for (const name of ["accessToken", "refreshToken"]) {
      const entry = cookieNamed(res, name);
      assert.ok(entry, `${name} not set`);
      // No maxAge => the browser discards it on close.
      assert.strictEqual(
        entry.options.maxAge,
        undefined,
        `${name} must be a session cookie when not remembered`
      );
    }
  }

  // Explicit false behaves the same as omitted.
  {
    const res = fakeRes();
    setAuthCookies(res, {
      accessToken: "a",
      refreshToken: "r",
      rememberMe: false,
    });
    assert.strictEqual(cookieNamed(res, "refreshToken").options.maxAge, undefined);
  }

  // ---------- cookies: checked persists for 30 days ----------
  {
    const res = fakeRes();
    setAuthCookies(res, {
      accessToken: "a",
      refreshToken: "r",
      rememberMe: true,
    });

    assert.strictEqual(
      cookieNamed(res, "refreshToken").options.maxAge,
      REMEMBERED_REFRESH_MAX_AGE
    );
    assert.strictEqual(
      REMEMBERED_REFRESH_MAX_AGE,
      30 * DAY,
      "remembered session should last 30 days"
    );
    // The access token stays short-lived either way; it is refreshed silently.
    assert.strictEqual(cookieNamed(res, "accessToken").options.maxAge, 15 * 60 * 1000);
  }

  // ---------- register keeps its existing 7 day behaviour ----------
  {
    const res = fakeRes();
    setAuthCookies(res, {
      accessToken: "a",
      refreshToken: "r",
      refreshMaxAge: REFRESH_TOKEN_MAX_AGE,
    });
    // Signup must not become a session-only login just because "Remember me"
    // is now a thing.
    assert.strictEqual(
      cookieNamed(res, "refreshToken").options.maxAge,
      7 * DAY
    );
  }

  // ---------- the JWT itself must match the cookie ----------
  {
    const plain = signRefreshToken("u1");
    const remembered = signRefreshToken("u1", { rememberMe: true });

    assert.strictEqual(lifetimeMs(plain), 7 * DAY);
    assert.strictEqual(lifetimeMs(remembered), 30 * DAY);
    assert.strictEqual(REMEMBERED_REFRESH_EXPIRES_IN, "30d");
  }

  // ---------- the flag rides in the payload so refresh can preserve it ----------
  {
    assert.strictEqual(claims(signRefreshToken("u1")).rememberMe, undefined);
    assert.strictEqual(
      claims(signRefreshToken("u1", { rememberMe: true })).rememberMe,
      true
    );
  }

  // ---------- the stored token must not expire before its JWT ----------
  {
    const { service, created } = buildService();
    await service.createTokens("u1");
    await service.createTokens("u2", {}, { rememberMe: true });

    const plainDays = (created[0].expiresAt - Date.now()) / DAY;
    const rememberedDays = (created[1].expiresAt - Date.now()) / DAY;

    // Slight tolerance: the assertion runs a moment after the call.
    assert.ok(Math.abs(plainDays - 7) < 0.01, `plain was ${plainDays} days`);
    assert.ok(
      Math.abs(rememberedDays - 30) < 0.01,
      `remembered was ${rememberedDays} days`
    );
  }

  // ---------- refresh must not silently downgrade a remembered session ----------
  {
    const created = [];
    const prisma = {
      refreshToken: {
        create: async ({ data }) => created.push(data),
        findUnique: async () => ({ id: "t1", revokedAt: null, expiresAt: new Date(Date.now() + DAY) }),
        update: async () => ({}),
      },
    };
    const service = new AuthService(prisma, null, null);

    const rememberedToken = signRefreshToken("u1", { rememberMe: true });
    const result = await service.refresh(rememberedToken);

    assert.strictEqual(result.rememberMe, true, "refresh dropped the flag");
    assert.strictEqual(claims(result.refreshToken).rememberMe, true);
    const days = (created[0].expiresAt - Date.now()) / DAY;
    assert.ok(Math.abs(days - 30) < 0.01, `re-issued token lasted ${days} days`);

    // A normal session stays normal.
    const plain = await service.refresh(signRefreshToken("u1"));
    assert.strictEqual(plain.rememberMe, false);
  }

  // ---------- the flag must survive schema validation ----------
  {
    // Undeclared keys are stripped by Zod; without the schema change
    // rememberMe would silently never reach the service.
    assert.strictEqual(
      loginSchema.parse({ email: "a@b.com", password: "pw" }).rememberMe,
      false
    );
    assert.strictEqual(
      loginSchema.parse({ email: "a@b.com", password: "pw", rememberMe: true })
        .rememberMe,
      true
    );
  }

  console.log("remember me: OK");
  console.log("All remember-me tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
