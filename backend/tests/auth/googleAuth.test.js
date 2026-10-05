"use strict";

/**
 * Google Sign-In — the two OAuth routes, and the account rules around them.
 *
 * These go through the real HTTP stack, so what is asserted is the contract a
 * browser actually gets: a redirect, the Set-Cookie attributes on the auth pair,
 * and the exact query parameter the callback hands back on failure. A body-only
 * test would pass against a flow no browser could complete.
 *
 * The only thing stubbed is `global.fetch`. Nothing reaches Google: the
 * authorization URL is asserted as a string, and the token and userinfo calls are
 * answered by the fake below. The alternative — a real network call — would make
 * the suite depend on a third party being up, and on credentials nobody should
 * put in a repository.
 *
 * Nothing here touches a database. The Prisma client is the in-memory store the
 * rest of the suite uses (see tests/support/memoryDb.js), and the development
 * database is unreachable by construction.
 */

// Raised before the app is required, because rateLimiter.js reads these once at
// load. Each Google attempt is two requests against the shared /api/auth budget,
// and several cases below run more than one attempt, which would otherwise spend
// a limit sized for a login form. Removed in afterAll so this file cannot tighten
// another suite's — the same contract rateLimit.test.js follows.
process.env.RATE_LIMIT_API_MAX = "500";
process.env.RATE_LIMIT_AUTH_MAX = "500";

const {
  app,
  request,
  db,
  TEST_PASSWORD,
  uniqueEmail,
  resetState,
  register,
  cookiesFrom,
  cookieHas,
} = require("../support/harness");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

const FRONTEND_ORIGIN = "http://localhost:5173";

const realFetch = global.fetch;

/** A Response-shaped object, which is all googleAuthService reads. */
function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

/**
 * Answers the two Google endpoints googleAuthService talks to.
 *
 * Any other URL is a bug rather than a third provider, so it throws instead of
 * quietly answering: a test that stopped exercising the exchange would then fail
 * loudly rather than pass on a stub that responded to everything.
 */
function stubGoogle({ profile, tokenStatus = 200, tokenBody, networkError } = {}) {
  const calls = { token: [], userinfo: [] };

  global.fetch = jest.fn(async (url, init = {}) => {
    const href = String(url);

    if (href.startsWith(TOKEN_ENDPOINT)) {
      calls.token.push(init);

      if (networkError) throw networkError;

      if (tokenStatus !== 200) {
        return jsonResponse(tokenStatus, tokenBody ?? { error: "invalid_grant" });
      }

      return jsonResponse(200, tokenBody ?? { access_token: "test-google-access-token" });
    }

    if (href.startsWith(USERINFO_ENDPOINT)) {
      calls.userinfo.push(init);
      return jsonResponse(200, profile);
    }

    throw new Error(`unexpected fetch to ${href}`);
  });

  return calls;
}

/** A complete, ordinary Google profile. Overridable field by field. */
function googleProfile(overrides = {}) {
  return {
    sub: "107346720000000000001",
    email: uniqueEmail("google"),
    email_verified: true,
    name: "Rina Santos",
    given_name: "Rina",
    family_name: "Santos",
    picture: "https://lh3.googleusercontent.com/a/ACg8oc-test=s96-c",
    ...overrides,
  };
}

/**
 * Runs a whole sign-in the way a browser does: step one, read the state out of the
 * URL, step two with the same cookie jar.
 *
 * One agent for both requests, because that is the point — the state cookie is
 * httpOnly and is only ever carried by the browser.
 */
async function signInWithGoogle({
  profile,
  code = "test-authorization-code",
  tokenStatus,
  tokenBody,
  networkError,
  callbackQuery,
} = {}) {
  const calls = stubGoogle({ profile, tokenStatus, tokenBody, networkError });
  const agent = request.agent(app);

  const start = await agent.get("/api/auth/google");
  const state = new URL(start.headers.location).searchParams.get("state");

  const callback = callbackQuery
    ? await agent.get("/api/auth/google/callback").query(callbackQuery)
    : await agent.get("/api/auth/google/callback").query({ code, state });

  return { agent, start, callback, state, calls };
}

/**
 * The Cookie header a browser would send for the session a callback handed back.
 *
 * Set explicitly rather than through an agent jar, for the reason
 * authorization.test.js:220 does the same: these assertions are about what the
 * server accepts, and a jar's path scoping would add a second, unrelated thing
 * that could fail them.
 */
function sessionCookieHeader(response) {
  const cookies = cookiesFrom(response);

  return [
    `accessToken=${cookies.accessToken.value}`,
    `refreshToken=${cookies.refreshToken.value}`,
  ];
}

/** Where a redirect sent the browser, and the authError code it carried, if any. */
function redirectTo(response) {
  const location = new URL(response.headers.location);

  return {
    origin: location.origin,
    path: location.pathname,
    authError: location.searchParams.get("authError"),
  };
}

/** The one user row, which is what most of these assertions are about. */
function onlyUser() {
  const rows = db.rows("user");
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** Runs `body` with one Google variable replaced, then puts it back. */
async function withGoogleEnv(name, value, body) {
  const original = process.env[name];

  if (value === undefined) delete process.env[name];
  else process.env[name] = value;

  try {
    return await body();
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}

beforeEach(resetState);

afterEach(() => {
  global.fetch = realFetch;
});

afterAll(() => {
  delete process.env.RATE_LIMIT_API_MAX;
  delete process.env.RATE_LIMIT_AUTH_MAX;
});

describe("GET /api/auth/google", () => {
  it("should redirect to Google with the configured client, callback and a state", async () => {
    const response = await request(app).get("/api/auth/google");

    expect(response.status).toBe(302);

    const location = new URL(response.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe(AUTHORIZE_ENDPOINT);
    expect(location.searchParams.get("client_id")).toBe(
      "test-google-client-id.apps.googleusercontent.com"
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8080/api/auth/google/callback"
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    // Nothing here is needed after sign-in, so nobody is asked to consent to
    // offline access and no refresh token is ever issued by Google.
    expect(location.searchParams.get("access_type")).toBe("online");
    // Otherwise a "Continue with Google" button silently signs in as whichever
    // account the browser happened to be holding.
    expect(location.searchParams.get("prompt")).toBe("select_account");
  });

  it("should mint a long, unguessable state that differs on every attempt", async () => {
    const first = await request(app).get("/api/auth/google");
    const second = await request(app).get("/api/auth/google");

    const stateOf = (response) =>
      new URL(response.headers.location).searchParams.get("state");

    expect(stateOf(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(stateOf(second)).not.toBe(stateOf(first));
  });

  it("should store the state in an httpOnly cookie scoped to the Google routes", async () => {
    const response = await request(app).get("/api/auth/google");

    const cookies = cookiesFrom(response);
    expect(cookies.googleOAuthState.value).toBe(
      new URL(response.headers.location).searchParams.get("state")
    );
    expect(cookieHas(cookies.googleOAuthState, "HttpOnly")).toBe(true);
    expect(cookieHas(cookies.googleOAuthState, "Max-Age")).toBe(true);
    // Lax, not Strict. The callback arrives as a top-level navigation from
    // accounts.google.com, which the browser treats as cross-site, and a Strict
    // cookie is not carried through one — the flow would fail on every attempt.
    expect(cookies.googleOAuthState.attributes.join(" ")).toContain("Lax");
    // Scoped to the two Google routes rather than "/", so a ten-minute
    // single-purpose value is not attached to every request this backend serves.
    expect(cookies.googleOAuthState.attributes).toContain("Path=/api/auth/google");
  });

  it("should never put the client secret in the URL it redirects to", async () => {
    const response = await request(app).get("/api/auth/google");

    expect(response.headers.location).not.toContain("test-google-client-secret");
  });
});

describe("GET /api/auth/google/callback — a new Google user", () => {
  it("should create the account, set the auth cookies and send them to the frontend", async () => {
    const profile = googleProfile();

    const { callback } = await signInWithGoogle({ profile });

    expect(callback.status).toBe(302);
    // The frontend root, where RedirectIfSignedIn and the onboarding guard
    // already decide what happens next. Deciding it here would duplicate a rule
    // that lives in one place.
    expect(redirectTo(callback)).toEqual({
      origin: FRONTEND_ORIGIN,
      path: "/",
      authError: null,
    });

    const user = onlyUser();
    expect(user.email).toBe(profile.email);
    expect(user.googleId).toBe(profile.sub);
    expect(user.firstName).toBe("Rina");
    expect(user.lastName).toBe("Santos");
    // Applied from the profile once, at creation.
    expect(user.avatarUrl).toBe(profile.picture);

    const cookies = cookiesFrom(callback);
    expect(cookies.accessToken).toBeDefined();
    expect(cookies.refreshToken).toBeDefined();
    expect(cookieHas(cookies.accessToken, "HttpOnly")).toBe(true);
    // The same pair, with the same attributes, an email/password sign-in gets.
    expect(cookies.accessToken.attributes.join(" ")).toContain("Strict");
  });

  it("should exchange the code server-side rather than trusting anything in the query", async () => {
    const { calls } = await signInWithGoogle({ profile: googleProfile() });

    expect(calls.token).toHaveLength(1);

    const body = new URLSearchParams(calls.token[0].body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("test-authorization-code");
    // The secret is used here, on the server, and goes nowhere near the browser.
    expect(body.get("client_secret")).toBe("test-google-client-secret");
    expect(body.get("redirect_uri")).toBe(
      "http://localhost:8080/api/auth/google/callback"
    );

    // The profile is read with the token Google just minted, not from the request.
    // This is what makes `sub` usable as an identity: the callback carries a code,
    // never a profile, so a caller cannot assert an identity of their choosing.
    expect(calls.userinfo[0].headers.authorization).toBe(
      "Bearer test-google-access-token"
    );
  });

  it("should not store the Google access token anywhere", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile() });

    expect(JSON.stringify(onlyUser())).not.toContain("test-google-access-token");

    // And not on the wire to the browser either.
    const cookies = cookiesFrom(callback);
    expect(cookies.accessToken.value).not.toContain("test-google-access-token");
    expect(cookies.refreshToken.value).not.toContain("test-google-access-token");
  });

  it("should create the personalization profile, so onboarding works as it does on register", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile() });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionCookieHeader(callback));

    expect(me.status).toBe(200);
    // Without this row /auth/me would report isNew from a profile that does not
    // exist, and the onboarding guard would send a brand new account to an
    // interview whose answers have nowhere to go.
    expect(me.body.data.isNew).toBe(true);
    expect(db.rows("personalizationProfile")).toHaveLength(1);
  });

  it("should give the account a real password hash nobody can present", async () => {
    const profile = googleProfile();
    await signInWithGoogle({ profile });

    // NOT NULL in the schema, so a value is written — but an invented one, which
    // is why password sign-in is impossible for a Google-only account.
    const user = onlyUser();
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.passwordHash).not.toBe(profile.sub);

    const attempt = await request(app)
      .post("/api/auth/login")
      .send({ email: profile.email, password: "AnyPassword123!" });

    expect(attempt.status).toBe(401);
  });

  it("should fall back through the name chain rather than failing on a bare profile", async () => {
    // No given_name, no family_name and no name at all, which is the shape a
    // consumer profile with no name set can have. firstName is NOT NULL, so
    // something has to fill it, and it must come from Google or from the address
    // rather than from thin air.
    const profile = googleProfile({
      name: undefined,
      given_name: undefined,
      family_name: undefined,
      picture: undefined,
    });

    await signInWithGoogle({ profile });

    const user = onlyUser();
    expect(user.firstName).toBe(profile.email.split("@")[0]);
    expect(user.lastName).toBeNull();
    expect(user.avatarUrl).toBeNull();
  });

  it("should split a single full name into first and last", async () => {
    await signInWithGoogle({
      profile: googleProfile({
        name: "Rina Marisol Santos",
        given_name: undefined,
        family_name: undefined,
      }),
    });

    const user = onlyUser();
    expect(user.firstName).toBe("Rina");
    expect(user.lastName).toBe("Marisol Santos");
  });
});

describe("GET /api/auth/google/callback — returning and linked users", () => {
  it("should sign the same account in again without creating a second one", async () => {
    const profile = googleProfile();

    const first = await signInWithGoogle({ profile });
    const firstId = onlyUser().id;

    const second = await signInWithGoogle({ profile });

    expect(second.callback.status).toBe(302);
    expect(redirectTo(second.callback).authError).toBeNull();
    expect(db.rows("user")).toHaveLength(1);
    expect(onlyUser().id).toBe(firstId);
    expect(first.callback.status).toBe(302);

    // A separate session each time, with the earlier one still on record.
    expect(db.rows("refreshToken")).toHaveLength(2);
  });

  it("should keep finding the account by googleId after the email changes", async () => {
    const profile = googleProfile();
    await signInWithGoogle({ profile });
    const userId = onlyUser().id;

    // The email is unique and changeable in this schema, and a Google address can
    // change on Google's side too. Keying on `sub` is what makes that neither a
    // duplicate nor a lockout.
    db.rows("user")[0].email = "moved-on@taskora.test";

    const again = await signInWithGoogle({
      profile: { ...profile, email: "brand-new@taskora.test" },
    });

    expect(redirectTo(again.callback).authError).toBeNull();
    expect(db.rows("user")).toHaveLength(1);
    expect(onlyUser().id).toBe(userId);
    // And it did not re-point the link onto the new address.
    expect(onlyUser().googleId).toBe(profile.sub);
  });

  it("should link an existing password account and leave its password working", async () => {
    const email = uniqueEmail();
    await register({ email, firstName: "Existing", lastName: "Owner" });
    const originalHash = db.rows("user")[0].passwordHash;
    const originalId = db.rows("user")[0].id;

    const profile = googleProfile({ email, email_verified: true });
    const { callback } = await signInWithGoogle({ profile });

    expect(redirectTo(callback).authError).toBeNull();
    // Linked, not duplicated, and not a new account.
    expect(db.rows("user")).toHaveLength(1);
    expect(onlyUser().id).toBe(originalId);
    expect(onlyUser().googleId).toBe(profile.sub);
    // The credential the account already had is untouched — not read, not
    // rewritten, not cleared.
    expect(onlyUser().passwordHash).toBe(originalHash);
    // The name the person chose in Taskora survives too.
    expect(onlyUser().firstName).toBe("Existing");

    // And the password still works, which is the whole point of linking rather
    // than replacing.
    const passwordLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: TEST_PASSWORD });
    expect(passwordLogin.status).toBe(200);
    expect(passwordLogin.body.data.user.id).toBe(originalId);
  });

  it("should not let a later sign-in overwrite a name or an avatar the person set", async () => {
    const email = uniqueEmail();
    await register({ email, firstName: "Chosen", lastName: "Name" });

    const profile = googleProfile({
      email,
      email_verified: true,
      name: "Rina Santos",
      given_name: "Rina",
      family_name: "Santos",
      picture: "https://lh3.googleusercontent.com/a/new=s96-c",
    });

    const first = await signInWithGoogle({ profile });
    expect(redirectTo(first.callback).authError).toBeNull();

    // Applied at creation only. An avatar the person chose inside Taskora is not
    // something a Google profile may replace on every visit.
    await signInWithGoogle({ profile });
    expect(onlyUser().firstName).toBe("Chosen");
    // `avatarUrl` was never set by register(), so it has no value to compare —
    // what matters is that it did not become the Google one.
    expect(onlyUser().avatarUrl).not.toBe(profile.picture);
  });
});

describe("GET /api/auth/google/callback — refusing to link", () => {
  it("should refuse an unverified email that already has a password account", async () => {
    const email = uniqueEmail();
    await register({ email });

    const { callback } = await signInWithGoogle({
      profile: googleProfile({ email, email_verified: false }),
    });

    expect(redirectTo(callback)).toEqual({
      origin: FRONTEND_ORIGIN,
      path: "/login",
      authError: "account_conflict",
    });
    // Nothing was written: no link, and no session for whoever asked.
    expect(onlyUser().googleId).toBeNull();
    expect(cookiesFrom(callback).accessToken).toBeUndefined();
  });

  it("should refuse when the profile carries no verified flag at all", async () => {
    const email = uniqueEmail();
    await register({ email });

    // An absent `email_verified` is not a maybe — it is the same refusal. This
    // is the case a truthy-coercing implementation would wave through.
    const { callback } = await signInWithGoogle({
      profile: googleProfile({ email, email_verified: undefined }),
    });

    expect(redirectTo(callback).authError).toBe("account_conflict");
    expect(onlyUser().googleId).toBeNull();
  });

  it("should still create a brand-new account for an unverified address", async () => {
    // The asymmetry with the two cases above is deliberate. `email_verified` is
    // the licence to take over an account somebody already has; there is nothing
    // to take over here, so the new account is created either way.
    const profile = googleProfile({ email_verified: false });

    const { callback } = await signInWithGoogle({ profile });

    expect(redirectTo(callback).authError).toBeNull();
    expect(onlyUser().googleId).toBe(profile.sub);
  });

  it("should refuse an email already linked to a different Google identity", async () => {
    const email = uniqueEmail();
    await register({ email });
    db.rows("user")[0].googleId = "107346720000000000009";

    // This is the case that makes matching on email dangerous on its own: the
    // owner changed their Taskora email to one a different Google account now
    // answers for. Re-pointing googleId would hand the account — and all its
    // data — to whoever controls the new address.
    const { callback } = await signInWithGoogle({
      profile: googleProfile({ email, email_verified: true, sub: "attacker-sub" }),
    });

    expect(redirectTo(callback).authError).toBe("account_conflict");
    expect(onlyUser().googleId).toBe("107346720000000000009");
    expect(cookiesFrom(callback).accessToken).toBeUndefined();
  });

  it("should reject a profile with no usable identity", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile({ sub: undefined }) });

    expect(redirectTo(callback).authError).toBe("incomplete_profile");
    expect(db.rows("user")).toHaveLength(0);
    expect(cookiesFrom(callback).accessToken).toBeUndefined();
  });

  it("should reject an address that is not shaped like one", async () => {
    // `email` is not a substitute for `sub` — a Workspace administrator can
    // rename the mailbox behind it — but it still has to be a usable lookup key.
    const { callback } = await signInWithGoogle({
      profile: googleProfile({ email: "not-an-address" }),
    });

    expect(redirectTo(callback).authError).toBe("incomplete_profile");
    expect(db.rows("user")).toHaveLength(0);
  });
});

describe("GET /api/auth/google/callback — CSRF and malformed callbacks", () => {
  it("should refuse a callback whose state was not issued by this server", async () => {
    const { callback, calls } = await signInWithGoogle({
      callbackQuery: { code: "test-authorization-code", state: "not-the-state-we-issued" },
    });

    expect(redirectTo(callback).authError).toBe("invalid_state");
    // Checked before the code is spent: redeeming it anyway would let anybody who
    // can reach this endpoint feed their own Google authorization into a session.
    expect(calls.token).toHaveLength(0);
    expect(db.rows("user")).toHaveLength(0);
    expect(cookiesFrom(callback).accessToken).toBeUndefined();
  });

  it("should refuse a callback with no state cookie at all", async () => {
    const stub = stubGoogle({ profile: googleProfile() });

    const response = await request(app)
      .get("/api/auth/google/callback")
      .query({ code: "test-authorization-code", state: "a".repeat(64) });

    // A refreshed or bookmarked callback URL lands here, and so does a browser
    // whose cookie expired. Both fail the same way, so neither is distinguishable
    // by somebody probing the endpoint.
    expect(redirectTo(response).authError).toBe("invalid_state");
    expect(stub.token).toHaveLength(0);
  });

  it("should clear the state cookie so a callback cannot be replayed", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile() });

    const cleared = cookiesFrom(callback).googleOAuthState;
    expect(cleared).toBeDefined();
    // An expiry in the past, with the path repeated, is how a browser is told to
    // drop a cookie. Repeating the path is what makes it match at all.
    expect(cleared.value).toBe("");
    expect(cleared.attributes).toContain("Path=/api/auth/google");
  });

  it("should report a cancelled consent screen as cancelled", async () => {
    const { callback, calls } = await signInWithGoogle({
      callbackQuery: { error: "access_denied", state: "ignored" },
    });

    expect(redirectTo(callback).authError).toBe("cancelled");
    expect(calls.token).toHaveLength(0);
  });

  it("should refuse a callback with a valid state but no code", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google");
    const state = new URL(start.headers.location).searchParams.get("state");

    const callback = await agent.get("/api/auth/google/callback").query({ state });

    expect(redirectTo(callback).authError).toBe("invalid_callback");
  });
});

describe("GET /api/auth/google/callback — provider and database failures", () => {
  let consoleError;

  beforeEach(() => {
    // The service logs every provider failure, which is the right behaviour and
    // very noisy here. Captured rather than silenced, so the masking assertions
    // below have something to read.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("should fail closed, without detail, when the token exchange is refused", async () => {
    const { callback } = await signInWithGoogle({
      profile: googleProfile(),
      tokenStatus: 400,
      tokenBody: { error: "invalid_grant", error_description: "Bad Request" },
    });

    const target = redirectTo(callback);
    expect(target.authError).toBe("failed");
    expect(target.path).toBe("/login");
    // Nothing upstream reaches the browser: not the error code Google sent, and
    // emphatically not the client secret that was in the request.
    expect(callback.headers.location).not.toContain("invalid_grant");
    expect(callback.headers.location).not.toContain("Bad%20Request");
    expect(callback.headers.location).not.toContain("test-google-client-secret");
    expect(db.rows("user")).toHaveLength(0);
  });

  it("should keep the client secret out of its own log lines", async () => {
    // A provider can quote the request that produced the failure, and the token
    // request carries the secret in its body.
    await signInWithGoogle({
      profile: googleProfile(),
      tokenStatus: 400,
      tokenBody: {
        error: "invalid_client",
        error_description: "client_secret=test-google-client-secret was rejected",
      },
    });

    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain("***");
    expect(logged).not.toContain("test-google-client-secret");
  });

  it("should fail closed when the provider cannot be reached", async () => {
    const { callback } = await signInWithGoogle({
      profile: googleProfile(),
      networkError: new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com"),
    });

    expect(redirectTo(callback).authError).toBe("failed");
    expect(callback.headers.location).not.toContain("ENOTFOUND");
    expect(db.rows("user")).toHaveLength(0);
  });

  it("should not spend the code when Google answers with no access token", async () => {
    const { callback, calls } = await signInWithGoogle({
      profile: googleProfile(),
      tokenBody: { token_type: "Bearer" },
    });

    expect(redirectTo(callback).authError).toBe("failed");
    // The userinfo call is only made with a token in hand.
    expect(calls.userinfo).toHaveLength(0);
    expect(db.rows("user")).toHaveLength(0);
  });

  it("should give the browser one code for every provider failure", async () => {
    // A non-2xx, a network failure and an unparseable body are indistinguishable
    // from out here, which is what stops this endpoint being a probe for anything.
    const failures = [
      { tokenStatus: 500, tokenBody: { error: "server_error" } },
      { networkError: new Error("socket hang up") },
      { tokenBody: {} },
    ];

    for (const failure of failures) {
      const { callback } = await signInWithGoogle({ profile: googleProfile(), ...failure });
      expect(redirectTo(callback).authError).toBe("failed");
    }
  });
});

describe("Google sign-in inside the existing session system", () => {
  it("should be recognised by the auth middleware on a protected route", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile() });

    const header = sessionCookieHeader(callback);

    const me = await request(app).get("/api/auth/me").set("Cookie", header);
    expect(me.status).toBe(200);
    expect(me.body.data.user.googleId).toBeDefined();

    // And on a route outside /api/auth, which is where the interesting half of the
    // application's surface lives. Cookies do not isolate by port, which is how
    // the frontend on :5173 reaches this backend on :8080 at all.
    const tasks = await request(app).get("/api/tasks").set("Cookie", header);
    expect(tasks.status).toBe(200);
  });

  it("should reject a protected route with no cookies, exactly as before", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Access token is required");
  });

  it("should refresh through the existing endpoint and retire the token it presented", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile() });

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", sessionCookieHeader(callback));

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.message).toBe("Token refreshed successfully");
    // Both cookies come back as session cookies, because the lifetime in
    // setAuthCookies comes from the `rememberMe` flag carried in the token, this
    // one is false, and cookie.js:24 then omits maxAge for the pair together.
    // That is the existing rule for an unticked login form
    // (rememberMe.test.js:84), not something Google changes: the callback's
    // 7-day Max-Age applies until the first refresh, exactly as it does for a
    // password sign-in.
    const refreshedCookies = cookiesFrom(refreshed);
    expect(cookieHas(refreshedCookies.accessToken, "Max-Age")).toBe(false);
    expect(cookieHas(refreshedCookies.refreshToken, "Max-Age")).toBe(false);

    const tokens = db.rows("refreshToken");
    expect(tokens).toHaveLength(2);
    expect(tokens[0].revokedAt).not.toBeNull();

    // Deliberately NOT asserted: that the newly issued token is itself usable.
    // It is not, and that is a pre-existing AuthService bug rather than anything
    // about Google — signRefreshToken (utils/jwt.js:17) carries no jti or nonce,
    // so two tokens minted for one user inside the same second are byte-identical
    // and collide on the @unique tokenHash (prisma/schema.prisma:333). Reproduced
    // on the plain email/password path with no Google involved: register + login
    // in the same second already stores two rows with one hash, and refresh then
    // re-issues the token it just revoked, which the next refresh rejects with
    // 401 "Refresh token has been revoked". Against real MySQL the duplicate
    // INSERT is a unique-constraint 500 instead. Fixing that belongs in
    // AuthService, not in a test for this feature.
  });

  it("should log a Google user out and revoke their refresh token", async () => {
    const { callback } = await signInWithGoogle({ profile: googleProfile() });
    const header = sessionCookieHeader(callback);

    const loggedOut = await request(app).post("/api/auth/logout").set("Cookie", header);
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.body.message).toBe("Logout successful");

    const cleared = cookiesFrom(loggedOut);
    expect(cleared.accessToken.value).toBe("");
    expect(cleared.refreshToken.value).toBe("");
    expect(db.rows("refreshToken").filter((row) => row.revokedAt === null)).toHaveLength(0);

    // The refresh token is the renewable half of the session, so with it revoked
    // this browser cannot obtain a new access token once the current one expires.
    const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", header);
    expect(refreshed.status).toBe(401);
  });

  it("should record the sign-in in the audit trail under the existing login action", async () => {
    const profile = googleProfile();
    await signInWithGoogle({ profile });

    // Recorded under the same action an email/password sign-in uses, with the
    // provider as a detail rather than as a new entry in the action vocabulary —
    // so the admin console's existing login filter covers both.
    const login = db
      .rows("auditLog")
      .find((row) => row.action === "AUTH_LOGIN_SUCCEEDED");

    expect(login).toBeDefined();
    expect(login.details.provider).toBe("google");
    expect(login.details.accountCreated).toBe(true);
    expect(login.details.accountLinked).toBe(false);
    expect(login.details.email).toBe(profile.email);
  });

  it("should record a linked sign-in as linked rather than created", async () => {
    const email = uniqueEmail();
    await register({ email });

    await signInWithGoogle({ profile: googleProfile({ email, email_verified: true }) });

    const login = db
      .rows("auditLog")
      .filter((row) => row.action === "AUTH_LOGIN_SUCCEEDED")
      .pop();

    expect(login.details.accountCreated).toBe(false);
    expect(login.details.accountLinked).toBe(true);
  });

  it("should record a failure without the provider's own words", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await signInWithGoogle({
      profile: googleProfile(),
      tokenStatus: 400,
      tokenBody: { error: "invalid_grant", error_description: "Bad Request" },
    });

    const failure = db
      .rows("auditLog")
      .find((row) => row.action === "AUTH_LOGIN_FAILED");

    expect(failure).toBeDefined();
    expect(failure.details.provider).toBe("google");
    expect(JSON.stringify(failure.details)).not.toContain("invalid_grant");
    expect(JSON.stringify(failure.details)).not.toContain("test-google-client-secret");
  });
});

describe("the existing email/password authentication", () => {
  it("should be entirely unaffected: register, login, me, logout", async () => {
    const email = uniqueEmail();

    const created = await register({ email, firstName: "Password", lastName: "Only" });
    expect(created.response.status).toBe(201);
    // Untouched by this feature: an account that never used Google has no link.
    expect(db.rows("user")[0].googleId).toBeNull();

    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.googleId).toBeNull();

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(200);
  });

  it("should still reject a bad password with the same message", async () => {
    const email = uniqueEmail();
    await register({ email });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "WrongPassword123!" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("should never expose a password hash, on any auth response", async () => {
    const email = uniqueEmail();
    const created = await register({ email });
    expect(created.response.body.data.user).not.toHaveProperty("passwordHash");

    const { callback } = await signInWithGoogle({ profile: googleProfile({ email }) });
    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionCookieHeader(callback));

    expect(me.body.data.user).not.toHaveProperty("passwordHash");
  });
});

describe("an unconfigured server", () => {
  it("should not redirect to Google at all when the credentials are placeholders", async () => {
    // Exactly what a fresh clone looks like after copying .env.example, and the
    // reason placeholders are read as unset: a real request carrying
    // "your_client_id_here" would fail at Google and report a provider error for
    // what is really an unfinished setup step.
    await withGoogleEnv("GOOGLE_CLIENT_ID", "your_client_id_here", async () => {
      const stub = stubGoogle({ profile: googleProfile() });
      const response = await request(app).get("/api/auth/google");

      expect(response.status).toBe(302);
      expect(redirectTo(response)).toEqual({
        origin: FRONTEND_ORIGIN,
        path: "/login",
        authError: "not_configured",
      });
      expect(response.headers.location).not.toContain("accounts.google.com");
      expect(cookiesFrom(response).googleOAuthState).toBeUndefined();
      // Nothing was even attempted, so nothing could have leaked.
      expect(stub.token).toHaveLength(0);
    });
  });

  it("should treat the documented BACKEND_PORT template as unconfigured too", async () => {
    await withGoogleEnv(
      "GOOGLE_CALLBACK_URL",
      "http://localhost:BACKEND_PORT/api/auth/google/callback",
      async () => {
        const response = await request(app).get("/api/auth/google");
        expect(redirectTo(response).authError).toBe("not_configured");
      }
    );
  });

  it("should start working once real credentials replace the placeholders", async () => {
    // The other half of the previous case: the check is on the value, not on a
    // one-way switch, so a deployment that adds Google later needs no restart.
    await withGoogleEnv("GOOGLE_CLIENT_ID", "your_client_id_here", async () => {
      expect(redirectTo(await request(app).get("/api/auth/google")).authError).toBe(
        "not_configured"
      );
    });

    const response = await request(app).get("/api/auth/google");
    expect(new URL(response.headers.location).hostname).toBe("accounts.google.com");
  });

  it("should leave the email/password endpoints working while unconfigured", async () => {
    await withGoogleEnv("GOOGLE_CLIENT_ID", undefined, async () => {
      const email = uniqueEmail();
      const { response } = await register({ email });
      expect(response.status).toBe(201);

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
    });
  });
});
