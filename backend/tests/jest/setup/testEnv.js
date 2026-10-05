"use strict";

/**
 * The test environment, set before any application module is required.
 *
 * Two rules this file exists to enforce:
 *
 *   1. The suite never reads backend/.env. Values are assigned here instead, so
 *      a test run cannot depend on a developer's local secrets, cannot pass only
 *      on one machine, and cannot be handed a real provider key by accident.
 *
 *   2. Nothing can reach the development database even if a mock is removed by
 *      mistake. The Prisma client is replaced in mocks.js, but DATABASE_URL is
 *      still pointed at a port nothing listens on and at a database named
 *      `taskora_test`, so an unmocked client fails to connect rather than
 *      writing to `taskora`.
 */

const os = require("os");
const path = require("path");

process.env.NODE_ENV = "test";

// Deterministic signing keys. The application only ever signs with these, so
// tokens minted in one test are verifiable in the next.
process.env.JWT_ACCESS_SECRET = "test-access-secret-not-used-anywhere-else";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-not-used-anywhere-else";

// A URL that cannot reach the development database. Port 1 is not something a
// Postgres server listens on, so this fails loudly instead of quietly.
process.env.DATABASE_URL =
  "postgresql://taskora_test:taskora_test@127.0.0.1:1/taskora_test?schema=public";
process.env.REDIS_URL = "redis://127.0.0.1:1";

process.env.CORS_ORIGIN = "http://localhost:5173";

// Uploads land in a temp directory. uploadMiddleware.js mkdirs this at require
// time, so without it requiring the app would create backend/uploads.
process.env.UPLOAD_DIR = path.join(os.tmpdir(), "taskora-test-uploads");
process.env.MAX_FILE_SIZE_BYTES = "1024";

// No paid provider is reachable from a test. EmailValidationService already
// skips ZeroBounce outside production; blanking the keys makes that explicit
// rather than incidental, so adding a NODE_ENV guard elsewhere cannot turn a
// test into a paid API call.
process.env.GEMINI_API_KEY = "";
process.env.OPENROUTER_API_KEY = "";
process.env.ELEVENLABS_API_KEY = "";
process.env.BREVO_API_KEY = "";
process.env.BREVO_SENDER_EMAIL = "";
process.env.ZEROBOUNCE_API_KEY = "";

// Google Sign-In. Plausible-looking but fake, so the flow is exercised in its
// configured state rather than short-circuiting to "not available". Nothing here
// reaches Google: the values are read only to build the authorization URL and the
// token request, and the suite replaces global.fetch to answer both.
//
// These must not look like placeholders. googleAuthService deliberately treats a
// committed placeholder as "not configured" so a fresh clone disables the button
// instead of sending a real request carrying "your_client_id_here", and a test
// value starting with "your_" would quietly exercise that branch instead of the
// one it means to.
process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:8080/api/auth/google/callback";
