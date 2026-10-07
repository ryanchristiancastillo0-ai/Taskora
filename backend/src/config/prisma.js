const { PrismaClient } = require("@prisma/client");
const { withDatabaseCaCertificate } = require("./databaseSsl");

// Aiven's MySQL verifies its server certificate against a CA file, and Prisma
// only accepts that as a connection-URL argument. DB_CA_CERT_PATH is the single
// source of truth for where the file is: a relative path under backend/ in
// development, the absolute path of the Render secret file in production, and
// unset when the database needs no certificate. Leaving it unset keeps the
// original `new PrismaClient()` call, so nothing about a local MySQL changes.
const certificatePath = process.env.DB_CA_CERT_PATH;
const databaseUrl = certificatePath
  ? withDatabaseCaCertificate(process.env.DATABASE_URL, certificatePath)
  : undefined;

const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : new PrismaClient();

module.exports = prisma;