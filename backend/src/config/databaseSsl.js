"use strict";

/**
 * Where the database TLS certificate comes from.
 *
 * Aiven's MySQL needs its CA certificate for the server to be verified, and
 * Prisma takes that certificate as a connection-URL argument (`sslcert`) rather
 * than as a schema field or a `prisma.config.ts` field — neither of those
 * accepts one. The URL handed to PrismaClient is therefore the only place this
 * can live.
 *
 * `DB_CA_CERT_PATH` is the single source of truth for the path. When it is
 * absent the URL is returned untouched, so a local MySQL without TLS keeps
 * working exactly as it did before this file existed.
 *
 * Three details that are easy to get wrong:
 *
 *   1. Prisma resolves a relative certificate path against its own schema
 *      folder, not against backend/, so `./certificates/aiven-ca.pem` would not
 *      find the file even though it looks right. Every path is resolved to an
 *      absolute one here first, which makes the development value and the
 *      absolute Render path mean the same thing.
 *   2. A missing certificate otherwise surfaces as Prisma's "Can't reach
 *      database server", which points at the network instead of at the secret
 *      file. The file is checked here so the message names the variable and the
 *      path that was actually looked at.
 *   3. `sslcert` on its own encrypts the connection but still accepts any
 *      certificate, because Prisma's `sslaccept` default is
 *      `accept_invalid_certs`. `sslaccept=strict` is what makes the CA mean
 *      something, so it is always sent alongside the path.
 *
 * Nothing here logs. The URL carries the database password, so the errors below
 * quote only the certificate path.
 */

const fs = require("node:fs");
const path = require("node:path");

// backend/, resolved from backend/src/config/. Relative values in
// DB_CA_CERT_PATH are read from here rather than from the current working
// directory, which differs between `node src/server.js`, `npm start`, Jest and
// a Render build step.
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

// The only two parameters this file owns. Any that are already in DATABASE_URL
// are removed before ours are added, so a certificate configured in two places
// cannot end up as a duplicate query parameter that Prisma resolves one way
// while an operator reads it another.
const OWNED_PARAMS = ["sslcert", "sslaccept"];

function resolveCertificatePath(certificatePath) {
  // A value read from a .env file can carry stray whitespace, and an empty one
  // means "not configured" rather than "the backend folder".
  const configured = String(certificatePath).trim();
  if (!configured) {
    throw new Error("DB_CA_CERT_PATH is set but empty.");
  }

  const absolutePath = path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(BACKEND_ROOT, configured);

  let stats;
  try {
    stats = fs.statSync(absolutePath);
  } catch {
    throw new Error(
      `DB_CA_CERT_PATH is set to "${configured}" but there is no file at "${absolutePath}". ` +
        "In development the path is relative to backend/; in production it is the absolute path " +
        "of the certificate secret file."
    );
  }

  if (!stats.isFile()) {
    throw new Error(`DB_CA_CERT_PATH is set to "${configured}" but "${absolutePath}" is not a file.`);
  }

  try {
    fs.accessSync(absolutePath, fs.constants.R_OK);
  } catch {
    throw new Error(`DB_CA_CERT_PATH is set to "${configured}" but "${absolutePath}" cannot be read.`);
  }

  return absolutePath;
}

function stripOwnedParams(databaseUrl) {
  const queryStart = databaseUrl.indexOf("?");
  if (queryStart === -1) {
    return { base: databaseUrl, query: "" };
  }

  const kept = databaseUrl
    .slice(queryStart + 1)
    .split("&")
    .filter((pair) => {
      if (!pair) return false;
      const name = decodeURIComponent(pair.split("=")[0]).toLowerCase();
      return !OWNED_PARAMS.includes(name);
    });

  return { base: databaseUrl.slice(0, queryStart), query: kept.join("&") };
}

/**
 * Returns `databaseUrl` with the CA certificate attached, or the URL untouched
 * when no certificate is configured. Never mutates and never returns a promise.
 */
function withDatabaseCaCertificate(databaseUrl, certificatePath) {
  // Without a configured path there is nothing to add, and Prisma keeps its own
  // defaults. A missing DATABASE_URL is left for Prisma to report, so its error
  // stays the one an operator is used to seeing.
  if (!certificatePath || typeof databaseUrl !== "string" || databaseUrl === "") {
    return databaseUrl;
  }

  const absolutePath = resolveCertificatePath(certificatePath);
  const { base, query } = stripOwnedParams(databaseUrl);
  const params = [query, `sslcert=${encodeURIComponent(absolutePath)}`, "sslaccept=strict"].filter(Boolean);

  return `${base}?${params.join("&")}`;
}

module.exports = { withDatabaseCaCertificate };