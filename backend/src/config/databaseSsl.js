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

// Render mounts Secret Files here. In a fresh production container the
// development value of DB_CA_CERT_PATH ("./certificates/...") does not exist,
// and operators routinely copy that value to Render without realising it is
// relative to backend/. The resolver therefore falls back to this directory,
// matching first on the file basename and then on a unique PEM-looking file.
// TASKORA_SECRETS_DIR exists so the fallback can be exercised in tests; Render
// deployments never set it.
const SECRETS_DIR = process.env.TASKORA_SECRETS_DIR || "/etc/secrets";

// The only two parameters this file owns. Any that are already in DATABASE_URL
// are removed before ours are added, so a certificate configured in two places
// cannot end up as a duplicate query parameter that Prisma resolves one way
// while an operator reads it another.
const OWNED_PARAMS = ["sslcert", "sslaccept"];

function isReadableCertificateFile(candidatePath) {
  let stats;
  try {
    stats = fs.statSync(candidatePath);
  } catch {
    return false;
  }
  if (!stats.isFile()) return false;
  try {
    fs.accessSync(candidatePath, fs.constants.R_OK);
  } catch {
    return false;
  }
  return true;
}

function looksLikeCertificate(candidatePath) {
  if (!isReadableCertificateFile(candidatePath)) return false;
  try {
    const head = fs.readFileSync(candidatePath, "latin1").trimStart().slice(0, "-----BEGIN".length);
    return head === "-----BEGIN";
  } catch {
    return false;
  }
}

// Never throws on an empty directory or a missing mount: absence just returns
// null and the caller produces the error that names DB_CA_CERT_PATH.
function findRenderSecretFile(configuredPath) {
  const basename = path.basename(configuredPath.replace(/[\\/]+$/, "") || configuredPath);

  // Prefer an exact match on the configured file name, then the canonical
  // names a deployment would naturally use.
  const fixedCandidates = [
    path.join(SECRETS_DIR, basename),
    path.join(SECRETS_DIR, "aiven-ca.pem"),
    path.join(SECRETS_DIR, "ca-certificate.crt"),
    path.join(SECRETS_DIR, "mysql-ca.pem"),
  ];

  for (const candidate of fixedCandidates) {
    if (isReadableCertificateFile(candidate)) return candidate;
  }

  // Last resort: a unique certificate-looking file in the secret mount, so
  // any secret-file name works. Ambiguity returns null rather than guessing.
  let secretsStats;
  try {
    secretsStats = fs.statSync(SECRETS_DIR);
  } catch {
    return null;
  }
  if (!secretsStats.isDirectory()) return null;

  const matches = fs
    .readdirSync(SECRETS_DIR)
    .map((entry) => path.join(SECRETS_DIR, entry))
    .filter(looksLikeCertificate);

  return matches.length === 1 ? matches[0] : null;
}

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
    const fallback = findRenderSecretFile(configured);
    if (fallback) return fallback;
    throw new Error(
      `DB_CA_CERT_PATH is set to "${configured}" but there is no file at "${absolutePath}". ` +
        "In development the path is relative to backend/; in production it has to be found as a " +
        "mounted Secret File under /etc/secrets/ (a development value pointing at certificates/ " +
        "does not exist in a container, so the matching secret file there is used instead)."
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
  if (typeof databaseUrl !== "string" || databaseUrl === "") {
    return databaseUrl;
  }

  let absolutePath = certificatePath ? resolveCertificatePath(certificatePath) : null;

  // Production convenience: a certificate mounted under /etc/secrets/ is used
  // even when DB_CA_CERT_PATH was never set, so configuring the Secret File
  // alone is enough to secure the connection.
  if (!absolutePath && process.env.NODE_ENV === "production") {
    absolutePath = findRenderSecretFile("");
  }

  if (!absolutePath) return databaseUrl;

  const { base, query } = stripOwnedParams(databaseUrl);
  const params = [query, `sslcert=${encodeURIComponent(absolutePath)}`, "sslaccept=strict"].filter(Boolean);

  return `${base}?${params.join("&")}`;
}

module.exports = { withDatabaseCaCertificate };