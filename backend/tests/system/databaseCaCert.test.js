"use strict";

/**
 * Where the database TLS certificate comes from, and what happens when it is
 * wrong.
 *
 * Aiven's MySQL is verified against a CA file, and the only place Prisma 6.19.3
 * accepts one for the `mysql` provider is the connection URL — not the schema
 * datasource block, and not `prisma.config.ts`. So these tests pin the two
 * things that are easy to break silently:
 *
 *   1. the path is resolved to an absolute one, because Prisma resolves a
 *      relative certificate path against its own schema folder rather than
 *      against backend/, and
 *   2. a path that does not resolve fails with a message naming the variable,
 *      instead of Prisma's "Can't reach database server", which sends an
 *      operator looking at the network instead of at the secret file.
 *
 * Both cases are asserted without inventing a second CA format: the positive
 * cases use a real file on disk, reached through a relative path built from the
 * temp directory so nothing is written inside backend/ during a test run.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const { withDatabaseCaCertificate } = require("../../src/config/databaseSsl");

// backend/, which is the directory a relative DB_CA_CERT_PATH is read from.
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

// A password-shaped secret that must never reach an error message or a log.
const DATABASE_URL = "mysql://taskora:sup3r-s3cret-pw@aiven-host:3306/taskora";

const mockConstructorCalls = [];

jest.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(options) {
      mockConstructorCalls.push(options);
    }
  },
}));

// config/prisma.js is replaced by a memory stub for every other suite. This one
// needs the real file, because the wiring in it is what is under test.
jest.dontMock("../../src/config/prisma.js");

let tempDir;
let caFile;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "taskora-ca-cert-"));
  caFile = path.join(tempDir, "aiven-ca.pem");
  fs.writeFileSync(caFile, "-----BEGIN CERTIFICATE-----\nnot-a-real-certificate\n-----END CERTIFICATE-----\n");
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  mockConstructorCalls.length = 0;
  delete process.env.DB_CA_CERT_PATH;
  process.env.DATABASE_URL = DATABASE_URL;
});

afterEach(() => {
  delete process.env.DB_CA_CERT_PATH;
});

function readParam(url, name) {
  const match = new URL(url).searchParams.get(name);
  return match;
}

describe("when no certificate is configured", () => {
  it("should return the connection URL untouched", () => {
    expect(withDatabaseCaCertificate(DATABASE_URL, undefined)).toBe(DATABASE_URL);
    expect(withDatabaseCaCertificate(DATABASE_URL, "")).toBe(DATABASE_URL);
  });

  it("should add no TLS parameters", () => {
    const result = withDatabaseCaCertificate(DATABASE_URL, undefined);

    expect(result).not.toContain("sslcert");
    expect(result).not.toContain("sslaccept");
  });
});

describe("a relative path, as used in development", () => {
  it("should be read from backend/ rather than from the current directory", () => {
    // No such file, so the message is the assertion: it has to name the path
    // the lookup was anchored to. Anchoring anywhere else would produce a
    // different path here.
    expect(() => withDatabaseCaCertificate(DATABASE_URL, "./certificates/aiven-ca.pem")).toThrow(
      path.join(BACKEND_ROOT, "certificates", "aiven-ca.pem")
    );
  });

  it("should become an absolute path in the connection URL", () => {
    // Relative, but climbing out to the temp file. It only resolves if
    // backend/ is the base, which is the behaviour being pinned.
    const relative = path.relative(BACKEND_ROOT, caFile);

    const result = withDatabaseCaCertificate(DATABASE_URL, relative);

    expect(readParam(result, "sslcert")).toBe(path.normalize(caFile));
  });
});

describe("an absolute path, as used for a Render secret file", () => {
  it("should be used as given instead of being re-anchored to backend/", () => {
    const renderPath = path.resolve("/etc/secrets/aiven-ca.pem");

    expect(() => withDatabaseCaCertificate(DATABASE_URL, renderPath)).toThrow(renderPath);
  });

  it("should be used as given when the file exists", () => {
    const result = withDatabaseCaCertificate(DATABASE_URL, caFile);

    expect(readParam(result, "sslcert")).toBe(path.normalize(caFile));
  });
});

describe("the TLS parameters it sends", () => {
  it("should turn on certificate verification, not just encryption", () => {
    // Prisma's sslaccept default is accept_invalid_certs, so ss lcert alone
    // would encrypt the connection while accepting any certificate. Verified
    // against a real local MySQL: with accept_invalid_certs a server whose
    // certificate name does not match connects happily, and with strict the
    // same server is refused.
    const result = withDatabaseCaCertificate(DATABASE_URL, caFile);

    expect(readParam(result, "sslaccept")).toBe("strict");
  });

  it("should percent-encode the path so Windows separators survive", () => {
    const result = withDatabaseCaCertificate(DATABASE_URL, caFile);

    // new URL() decodes it, so the decoded value is what has to round-trip.
    expect(result).toContain(encodeURIComponent(path.normalize(caFile)));
  });

  it("should keep the rest of an existing query string", () => {
    const result = withDatabaseCaCertificate(`${DATABASE_URL}?connection_limit=5`, caFile);

    expect(readParam(result, "connection_limit")).toBe("5");
    expect(readParam(result, "sslcert")).toBe(path.normalize(caFile));
    expect(readParam(result, "sslaccept")).toBe("strict");
  });

  it("should replace a certificate already in DATABASE_URL instead of duplicating it", () => {
    // Two sources of truth would otherwise become two ss lcert parameters,
    // resolved one way by Prisma and read another way by whoever set it.
    const result = withDatabaseCaCertificate(
      `${DATABASE_URL}?sslcert=/wrong/ca.pem&sslaccept=accept_invalid_certs`,
      caFile
    );

    expect(result.match(/sslcert=/g)).toHaveLength(1);
    expect(result.match(/sslaccept=/g)).toHaveLength(1);
    expect(readParam(result, "sslcert")).toBe(path.normalize(caFile));
    // The permissive default cannot survive, even when someone wrote it there
    // on purpose.
    expect(readParam(result, "sslaccept")).toBe("strict");
  });
});

describe("a certificate path that does not work", () => {
  it("should name DB_CA_CERT_PATH and the path it looked at", () => {
    expect(() => withDatabaseCaCertificate(DATABASE_URL, "./certificates/missing.pem")).toThrow(/DB_CA_CERT_PATH/);
  });

  it("should reject a directory", () => {
    expect(() => withDatabaseCaCertificate(DATABASE_URL, tempDir)).toThrow(/is not a file/);
  });

  it("should reject a value that is only whitespace", () => {
    expect(() => withDatabaseCaCertificate(DATABASE_URL, "   ")).toThrow(/empty/);
  });

  it("should never put the database password in the error", () => {
    let message = "";
    try {
      withDatabaseCaCertificate(DATABASE_URL, "./certificates/missing.pem");
    } catch (error) {
      message = error.message;
    }

    expect(message).not.toContain("sup3r-s3cret-pw");
    expect(message).not.toContain(DATABASE_URL);
  });
});

describe("config/prisma.js wiring", () => {
  function loadPrisma() {
    let exported;
    jest.isolateModules(() => {
      exported = require("../../src/config/prisma.js");
    });
    return exported;
  }

  it("should construct PrismaClient with no datasource override when no certificate is set", () => {
    loadPrisma();

    // Exactly the original call. A local MySQL without TLS must not change.
    expect(mockConstructorCalls).toEqual([undefined]);
  });

  it("should pass the certificate URL to PrismaClient when a certificate is set", () => {
    process.env.DB_CA_CERT_PATH = caFile;

    loadPrisma();

    expect(mockConstructorCalls).toHaveLength(1);
    const options = mockConstructorCalls[0];
    expect(Object.keys(options.datasources)).toEqual(["db"]);
    expect(readParam(options.datasources.db.url, "sslcert")).toBe(path.normalize(caFile));
    expect(readParam(options.datasources.db.url, "sslaccept")).toBe("strict");
  });

  it("should refuse to start rather than connect unverified when the path is wrong", () => {
    process.env.DB_CA_CERT_PATH = "./certificates/missing.pem";

    expect(() => loadPrisma()).toThrow(/DB_CA_CERT_PATH/);
    expect(mockConstructorCalls).toEqual([]);
  });
});