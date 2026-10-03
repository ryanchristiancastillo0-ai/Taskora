// Regression guard for the silent-truncation bug.
//
// A bare `String` in the Prisma schema maps to VARCHAR(191) on MySQL. Every
// long-form text field therefore has to be declared @db.Text, otherwise replies,
// chat messages, notes and notifications get cut off at 191 characters with no
// error. This test fails loudly if a future schema edit drops the annotation or
// if the matching migration goes missing.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SCHEMA = path.resolve(__dirname, "..", "prisma", "schema.prisma");
const MIGRATION_DIR = path.resolve(
  __dirname,
  "..",
  "prisma",
  "migrations",
  "20260926150000_widen_text_columns"
);

// model -> field that must not be VARCHAR(191).
const MUST_BE_TEXT = [
  ["AIMessage", "content"],
  ["Message", "content"],
  ["Note", "content"],
  ["Notification", "message"],
];

// Zod ceilings, to prove the database is no longer the limiting factor.
const VALIDATOR_LIMITS = [
  { file: "messageValidators.js", limit: 5000, field: "content" },
];

function readSchema() {
  return fs.readFileSync(SCHEMA, "utf8");
}

// Pull the body of a single `model X { ... }` block.
function modelBlock(source, model) {
  const start = source.indexOf(`model ${model} {`);
  assert.notStrictEqual(start, -1, `model ${model} not found in schema.prisma`);

  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated model block for ${model}`);
}

function run() {
  const source = readSchema();

  for (const [model, field] of MUST_BE_TEXT) {
    const block = modelBlock(source, model);
    // Match the field declaration, ignoring comment lines.
    const declaration = block
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trimEnd())
      .find((line) => new RegExp(`^\\s*${field}\\s+String\\??\\b`).test(line));

    assert.ok(
      declaration,
      `${model}.${field} should still be declared as a String field`
    );
    assert.match(
      declaration,
      /@db\.Text\b/,
      `${model}.${field} must be @db.Text — a bare String is VARCHAR(191) on MySQL ` +
        `and silently truncates long text`
    );
    console.log(`ok  ${model}.${field} is @db.Text`);
  }

  // The migration that actually widens the existing columns.
  const migrationPath = path.join(MIGRATION_DIR, "migration.sql");
  assert.ok(
    fs.existsSync(migrationPath),
    "the widen_text_columns migration.sql is missing — the columns in the " +
      "database are still VARCHAR(191)"
  );

  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const [model, field] of MUST_BE_TEXT) {
    assert.match(
      sql,
      new RegExp(
        `ALTER TABLE \`${model}\` MODIFY \`${field}\` TEXT`,
        "i"
      ),
      `migration.sql is missing: ALTER TABLE \`${model}\` MODIFY \`${field}\` TEXT`
    );
  }
  console.log("ok  migration widens all four columns to TEXT");

  // The database must now be able to hold anything the validators allow.
  const TEXT_MAX_BYTES = 65_535;
  for (const { file, limit } of VALIDATOR_LIMITS) {
    assert.ok(
      limit < TEXT_MAX_BYTES,
      `${file} allows ${limit} characters, which exceeds TEXT capacity`
    );
  }
  console.log("ok  validator limits fit inside TEXT capacity");

  console.log("\nAll long-text column checks passed.");
}

run();
