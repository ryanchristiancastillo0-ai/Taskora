// Environment-aware ZeroBounce email validation tests.
// Run with: node tests/emailValidationService.test.js
const assert = require("assert");

// jwt.js reads the secrets at require time, so they must exist beforehand.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

const EmailValidationService = require("../src/services/user/emailValidationService.js");
const AuthService = require("../src/services/user/authService.js");
const AppError = require("../src/utils/AppError");

const API_KEY = "zb_test_key_do_not_log_me";
const REJECTED_MESSAGE = "This email address cannot be used to create an account.";
const UNREACHABLE_MESSAGE =
  "Email validation is temporarily unavailable. Please try again.";

const prodEnv = (extra = {}) => ({
  NODE_ENV: "production",
  ZEROBOUNCE_API_KEY: API_KEY,
  ...extra,
});

// Swaps global fetch for a recorder. No real network call and no real
// credential is ever used.
function stubFetch(handler) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// A body that is not valid JSON, to exercise the parse guard.
function brokenJsonResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
    text: async () => "<html>gateway</html>",
  };
}

async function expectAppError(fn, statusCode) {
  try {
    await fn();
  } catch (error) {
    assert.ok(
      error instanceof AppError,
      `expected AppError, got ${error && error.name}: ${error && error.message}`
    );
    assert.strictEqual(
      error.statusCode,
      statusCode,
      `expected status ${statusCode}, got ${error.statusCode} (${error.message})`
    );
    return error;
  }
  throw new Error(`expected the call to reject with ${statusCode}, but it resolved`);
}

// Registration must not reach the database at all when the address is refused.
function unusedPrisma() {
  const touched = [];
  const record = (name) => () => {
    touched.push(name);
    throw new Error(`prisma.${name} must not be called`);
  };
  return {
    touched,
    user: { findUnique: record("user.findUnique"), create: record("user.create") },
    personalizationProfile: { create: record("personalizationProfile.create") },
  };
}

async function run() {
  // ---------- development and test never touch the network ----------
  {
    // No key, and an address that ZeroBounce would certainly reject.
    const service = new EmailValidationService({ NODE_ENV: "development" });
    const stub = stubFetch(() => {
      throw new Error("development must not call ZeroBounce");
    });
    try {
      const result = await service.validate("nobody@nowhere.test");
      assert.strictEqual(result.checked, false, "dev must not report a check");
      assert.strictEqual(result.status, "skipped");
      assert.strictEqual(stub.calls.length, 0, "dev made an outbound call");
    } finally {
      stub.restore();
    }
  }
  {
    // A configured key must not switch dev into a live check.
    const service = new EmailValidationService(
      prodEnv({ NODE_ENV: "development" })
    );
    const stub = stubFetch(() => {
      throw new Error("development must not call ZeroBounce");
    });
    try {
      await service.validate("nobody@nowhere.test");
      assert.strictEqual(stub.calls.length, 0, "dev called ZeroBounce despite a key");
    } finally {
      stub.restore();
    }
  }
  {
    // An unset NODE_ENV has to behave as development, not production.
    const service = new EmailValidationService({ ZEROBOUNCE_API_KEY: API_KEY });
    assert.strictEqual(service.isProduction(), false);
    const stub = stubFetch(() => {
      throw new Error("unset NODE_ENV must not call ZeroBounce");
    });
    try {
      await service.validate("nobody@nowhere.test");
      assert.strictEqual(stub.calls.length, 0, "unset NODE_ENV made an outbound call");
    } finally {
      stub.restore();
    }
  }
  {
    const service = new EmailValidationService(
      prodEnv({ NODE_ENV: "test" })
    );
    const stub = stubFetch(() => {
      throw new Error("test must not call ZeroBounce");
    });
    try {
      await service.validate("nobody@nowhere.test");
      assert.strictEqual(stub.calls.length, 0, "test made an outbound call");
    } finally {
      stub.restore();
    }
  }

  // ---------- production refuses to start without a key ----------
  {
    const service = new EmailValidationService({ NODE_ENV: "production" });
    const stub = stubFetch(() => {
      throw new Error("a missing key must not produce a request");
    });
    try {
      assert.strictEqual(service.isEnabled(), true, "production must be enabled");
      const error = await expectAppError(
        () => service.validate("someone@gmail.com"),
        503
      );
      assert.strictEqual(error.message, UNREACHABLE_MESSAGE);
      assert.strictEqual(stub.calls.length, 0, "a missing key still called out");
    } finally {
      stub.restore();
    }
  }
  {
    // An empty key is not a key.
    const service = new EmailValidationService(
      prodEnv({ ZEROBOUNCE_API_KEY: "" })
    );
    const stub = stubFetch(() => {
      throw new Error("an empty key must not produce a request");
    });
    try {
      await expectAppError(() => service.validate("someone@gmail.com"), 503);
      assert.strictEqual(stub.calls.length, 0);
    } finally {
      stub.restore();
    }
  }

  // ---------- the request itself is built from the documented v2 API ----------
  {
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch(() =>
      jsonResponse({ status: "valid", sub_status: "" })
    );
    try {
      await service.validate("someone@gmail.com");
      assert.strictEqual(stub.calls.length, 1);

      const { url, options } = stub.calls[0];
      assert.ok(url instanceof URL, "the service should pass a URL object");
      assert.strictEqual(url.origin + url.pathname,
        "https://api.zerobounce.net/v2/validate");
      assert.strictEqual(url.searchParams.get("email"), "someone@gmail.com");
      assert.strictEqual(url.searchParams.get("api_key"), API_KEY);
      // Inside the documented 3-60s range so slow servers answer "unknown"
      // rather than tripping our own abort.
      const timeout = Number(url.searchParams.get("timeout"));
      assert.ok(timeout >= 3 && timeout <= 60, `timeout was ${timeout}`);
      assert.ok(timeout < 20, "provider timeout should leave HTTP headroom");
      assert.strictEqual(options.method, "GET");
      assert.strictEqual(options.headers.accept, "application/json");
      assert.ok(options.signal, "the request needs an abort signal");
    } finally {
      stub.restore();
    }
  }
  {
    // A regional endpoint can be pinned.
    const service = new EmailValidationService(
      prodEnv({ ZEROBOUNCE_API_URL: "https://api-eu.zerobounce.net/v2/validate" })
    );
    const stub = stubFetch(() => jsonResponse({ status: "valid" }));
    try {
      await service.validate("someone@gmail.com");
      assert.strictEqual(
        stub.calls[0].url.origin + stub.calls[0].url.pathname,
        "https://api-eu.zerobounce.net/v2/validate"
      );
    } finally {
      stub.restore();
    }
  }
  {
    // The address is trimmed the same way the schema trims it upstream.
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch(() => jsonResponse({ status: "valid" }));
    try {
      await service.validate("  someone@gmail.com  ");
      assert.strictEqual(stub.calls[0].url.searchParams.get("email"), "someone@gmail.com");
    } finally {
      stub.restore();
    }
  }

  // ---------- accepted statuses ----------
  for (const [status, subStatus] of [
    ["valid", ""],
    ["valid", "alias_address"],
    ["catch-all", "role_based_catch_all"],
    ["unknown", "greylisted"],
    ["unknown", "timeout_exceeded"],
    ["VALID", ""],
  ]) {
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch(() => jsonResponse({ status, sub_status: subStatus }));
    try {
      const result = await service.validate("someone@gmail.com");
      assert.strictEqual(result.checked, true, `${status} should be checked`);
      assert.strictEqual(result.status, status.toLowerCase());
    } finally {
      stub.restore();
    }
  }

  // ---------- rejected statuses ----------
  for (const [status, subStatus] of [
    ["invalid", "mailbox_not_found"],
    ["invalid", "no_dns_entries"],
    ["invalid", "mailbox_quota_exceeded"],
    ["invalid", ""],
    ["spamtrap", ""],
    ["abuse", ""],
    ["do_not_mail", ""],
    ["do_not_mail", "disposable"],
    ["do_not_mail", "toxic"],
    ["INVALID", ""],
    // v2 nests these under do_not_mail but repeats them in sub_status, so a
    // valid status carrying one of them is still refused.
    ["valid", "disposable"],
    ["valid", "toxic"],
  ]) {
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch(() => jsonResponse({ status, sub_status: subStatus }));
    try {
      const error = await expectAppError(
        () => service.validate("spoof@nowhere.test"),
        400
      );
      // The client must not learn which status fired, only that it was refused.
      assert.strictEqual(
        error.message,
        REJECTED_MESSAGE,
        `${status}/${subStatus} leaked a different message`
      );
      for (const word of ["invalid", "disposable", "toxic", "spamtrap", "do_not_mail"]) {
        assert.ok(
          !error.message.toLowerCase().includes(word),
          `the client message leaked "${word}"`
        );
      }
    } finally {
      stub.restore();
    }
  }

  {
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch(() => jsonResponse({ status: "valid" }));
    try {
      const error = await expectAppError(() => service.validate("   "), 400);
      assert.strictEqual(error.message, REJECTED_MESSAGE);
      assert.strictEqual(stub.calls.length, 0, "an empty address was sent upstream");
    } finally {
      stub.restore();
    }
  }

  // ---------- any trouble reaching or understanding ZeroBounce fails closed ----------
  const unreachable = [
    [
      "a network failure",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "a timeout",
      () => {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      },
    ],
    [
      "an HTTP 429",
      () => jsonResponse({}, { ok: false, status: 429 }),
    ],
    [
      "an HTTP 500",
      () => jsonResponse({}, { ok: false, status: 500 }),
    ],
    [
      "an HTTP 401",
      () => jsonResponse({}, { ok: false, status: 401 }),
    ],
    ["a non-JSON body", () => brokenJsonResponse()],
    ["a null body", () => jsonResponse(null)],
    ["a string body", () => jsonResponse("nope")],
    [
      "an invalid API key",
      () => jsonResponse({ error: "Invalid API Key or your account ran out of credits" }),
    ],
    [
      "an exhausted credit balance",
      () => jsonResponse({ error: "Invalid API Key or your account ran out of credits" }),
    ],
    ["a body with no status", () => jsonResponse({})],
    [
      "a status we do not recognise",
      () => jsonResponse({ status: "some_future_status" }),
    ],
  ];

  for (const [label, handler] of unreachable) {
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch(handler);
    try {
      const error = await expectAppError(
        () => service.validate("someone@gmail.com"),
        503
      );
      assert.strictEqual(
        error.message,
        UNREACHABLE_MESSAGE,
        `${label} produced a different message`
      );
      // The key rides in the query string, so it must never reach the client.
      assert.ok(
        !String(error.message).includes(API_KEY),
        `${label} leaked the API key`
      );
    } finally {
      stub.restore();
    }
  }

  {
    // A fetch error whose message quotes the URL must not leak the key either.
    const service = new EmailValidationService(prodEnv());
    const stub = stubFetch((url) => {
      throw new Error(`request to ${url} refused`);
    });
    try {
      const error = await expectAppError(
        () => service.validate("someone@gmail.com"),
        503
      );
      assert.ok(!error.message.includes(API_KEY), "the API key reached the client");
    } finally {
      stub.restore();
    }
  }

  // ---------- registration consults the validator before the database ----------
  {
    // A refused address must not cost a lookup or create anything.
    const prisma = unusedPrisma();
    const service = new AuthService(prisma, null, null, {
      validate: async () => {
        throw new AppError(REJECTED_MESSAGE, 400);
      },
    });
    const error = await expectAppError(
      () => service.register({ email: "spoof@nowhere.test", password: "pw", firstName: "A" }),
      400
    );
    assert.strictEqual(error.message, REJECTED_MESSAGE);
    assert.deepStrictEqual(prisma.touched, [], "the database was touched anyway");
  }
  {
    // The validator has to run first, not after the duplicate check. The stub
    // prisma is intentionally incomplete: register is expected to blow up
    // further along, and only the recorded order matters here.
    const order = [];
    const service = new AuthService(
      {
        user: {
          findUnique: async () => {
            order.push("findUnique");
            return null;
          },
          create: async () => {
            order.push("create");
            return { id: "u1" };
          },
        },
      },
      null,
      null,
      {
        validate: async () => {
          order.push("validate");
        },
      }
    );
    await service
      .register({ email: "x@y.com", password: "pw", firstName: "A" })
      .catch(() => {});

    assert.ok(order.includes("validate"), "the validator never ran");
    assert.strictEqual(order[0], "validate", `validation ran after: ${order.join(", ")}`);
  }
  {
    // And a passing address goes on to create the user.
    const created = [];
    const prisma = {
      user: {
        findUnique: async () => null,
        create: async ({ data }) => {
          created.push(data.email);
          return { id: "u1", email: data.email, firstName: data.firstName };
        },
      },
      personalizationProfile: { create: async () => ({}) },
      refreshToken: { create: async () => ({}) },
    };
    const service = new AuthService(
      prisma,
      { hash: async (value) => `hashed:${value}` },
      null,
      { validate: async () => ({ checked: true, status: "valid" }) }
    );
    const result = await service.register({
      email: "someone@gmail.com",
      password: "pw",
      firstName: "A",
    });
    assert.deepStrictEqual(created, ["someone@gmail.com"]);
    assert.strictEqual(result.user.email, "someone@gmail.com");
    // The password hash is still what gets stored.
    assert.ok(result.accessToken, "tokens were not issued");
  }
  {
    // A duplicate address still reports 409, so the new check has not changed
    // the existing duplicate behaviour.
    const prisma = {
      user: { findUnique: async () => ({ id: "u1" }), create: async () => ({}) },
    };
    const service = new AuthService(prisma, null, null, {
      validate: async () => ({ checked: true, status: "valid" }),
    });
    await expectAppError(
      () => service.register({ email: "taken@x.com", password: "pw", firstName: "A" }),
      409
    );
  }

  console.log("email validation service: OK");
  console.log("All email-validation tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
