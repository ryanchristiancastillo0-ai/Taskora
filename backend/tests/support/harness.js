"use strict";

/**
 * Shared test harness: the app, one store per file, and the two ways a test
 * gets to act as somebody.
 *
 * Both go through the real HTTP API on purpose. There is no shortcut that
 * injects a req.user or signs a token by hand, because the two things most
 * worth testing about Taskora's authorization are exactly the parts such a
 * shortcut would bypass: that the access token cookie is set with the right
 * attributes, and that authMiddleware and adminGuard read it back on every
 * request.
 */

const request = require("supertest");
const bcrypt = require("bcrypt");

const app = require("../../src/app.js");
const { db, prisma } = require("./memoryDb");
const redisStub = require("./redisStub");
const emailStub = require("./emailServiceStub");

const TEST_PASSWORD = "TaskoraTest123!";

// bcrypt at the application's 12 rounds costs ~300ms per hash, which is a real
// cost when a fixture needs a dozen accounts. Seeded rows are hashed at 4
// instead: bcrypt.compare() accepts any cost, so the code under test cannot tell
// the difference, and the suites that specifically test password hashing go
// through the real API and pay the real price.
const SEED_ROUNDS = 4;

let sequence = 0;

/** A fresh address per call, so a suite never depends on a row it left behind. */
function uniqueEmail(prefix = "user") {
  sequence += 1;
  return `${prefix}.${process.pid}.${sequence}@taskora.test`;
}

/**
 * Clears every piece of shared state.
 *
 * Called from beforeEach. Jest gives each test file its own module registry, so
 * the double is per file rather than per test; resetting it here is what makes
 * individual `it` blocks independent and repeatable in any order.
 */
function resetState() {
  db.reset();
  redisStub.reset();
  emailStub.sent.length = 0;
}

/** Parses Set-Cookie headers into { name: value } for assertions. */
function cookiesFrom(response) {
  const headers = response.headers["set-cookie"] ?? [];
  const jar = {};

  for (const header of headers) {
    const [pair, ...attributes] = header.split(";");
    const index = pair.indexOf("=");
    jar[pair.slice(0, index).trim()] = {
      value: pair.slice(index + 1),
      attributes: attributes.map((attribute) => attribute.trim()),
    };
  }

  return jar;
}

/** True when the Set-Cookie header carries the given attribute (`Max-Age`, `HttpOnly`). */
function cookieHas(cookie, attribute) {
  const wanted = attribute.toLowerCase();
  return cookie.attributes.some((entry) => entry.split("=")[0].trim().toLowerCase() === wanted);
}

/** Registers through the API. Uses the real bcrypt rounds the app uses. */
async function register(overrides = {}) {
  const payload = {
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? TEST_PASSWORD,
    firstName: overrides.firstName ?? "Test",
    lastName: overrides.lastName ?? "User",
  };

  const response = await request(app).post("/api/auth/register").send(payload);

  return { response, payload };
}

/** Logs in through the API and returns a cookie-carrying agent. */
async function signIn({ email, password = TEST_PASSWORD }) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ email, password });

  if (response.status !== 200) {
    throw new Error(
      `signIn failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`
    );
  }

  return { agent, user: response.body.data.user };
}

/**
 * Creates an account directly in the store, then signs in over HTTP.
 *
 * Used for the admin cases: role is not something registration can produce, and
 * the point is to test the guard with a role the database holds, not to test
 * how an admin row is created.
 */
async function createAccount({ role = "USER", status = "ACTIVE", email, ...rest } = {}) {
  const address = email ?? uniqueEmail(role === "ADMIN" ? "admin" : "user");
  const password = rest.password ?? TEST_PASSWORD;

  const row = db.seed("user", {
    email: address,
    passwordHash: await bcrypt.hash(password, SEED_ROUNDS),
    firstName: rest.firstName ?? "Test",
    lastName: rest.lastName ?? "User",
    role,
    status,
    ...rest,
  });

  db.seed("personalizationProfile", { userId: row.id });

  return { id: row.id, email: address, password, ...(await signIn({ email: address, password })) };
}

/** A plain signed-in user. */
function createUser(overrides) {
  return createAccount({ ...overrides, role: "USER" });
}

/** An active administrator. */
function createAdmin(overrides) {
  return createAccount({ ...overrides, role: "ADMIN" });
}

module.exports = {
  app,
  request,
  prisma,
  db,
  TEST_PASSWORD,
  SEED_ROUNDS,
  uniqueEmail,
  resetState,
  cookiesFrom,
  cookieHas,
  register,
  signIn,
  createAccount,
  createUser,
  createAdmin,
};
