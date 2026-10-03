// Runs every *.test.js in this folder as a separate process and reports a
// summary. Each test file is self-contained and exits on its own, so a hung
// test cannot block the rest of the suite.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TESTS_DIR = __dirname;
const BACKEND_ROOT = path.resolve(TESTS_DIR, "..");
const PER_TEST_TIMEOUT_MS = 120_000;

const files = fs
  .readdirSync(TESTS_DIR)
  .filter((name) => name.endsWith(".test.js"))
  .sort();

if (files.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const results = [];

for (const file of files) {
  process.stdout.write(`\n=== ${file} ===\n`);
  const started = Date.now();

  const run = spawnSync(process.execPath, [path.join(TESTS_DIR, file)], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    timeout: PER_TEST_TIMEOUT_MS,
  });

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const output = `${run.stdout || ""}${run.stderr || ""}`.trimEnd();

  if (output) {
    console.log(output);
  }

  const timedOut = run.error && run.error.code === "ETIMEDOUT";
  const passed = !timedOut && run.status === 0;

  results.push({ file, passed, seconds, code: run.status, timedOut });
  console.log(`--- ${passed ? "PASS" : "FAIL"} (${seconds}s)`);
}

const failed = results.filter((r) => !r.passed);

console.log("\n========================================");
console.log(`Total ${results.length}  passed ${results.length - failed.length}  failed ${failed.length}`);
for (const r of results) {
  if (!r.passed) {
    console.log(`  FAIL ${r.file}${r.timedOut ? " (timed out)" : ` (exit ${r.code})`}`);
  }
}
console.log("========================================");

process.exit(failed.length === 0 ? 0 : 1);
