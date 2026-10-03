// AIProvider retry wrapper tests (no live API needed).
// Run with: node tests/aiProviderRetry.test.js
const assert = require("assert");
const AppError = require("../src/utils/AppError");
const AIProvider = require("../src/services/user/ai/aiProvider.js");

function transientError(statusCode) {
  return new AppError("Upstream denied", statusCode, { isTransient: true });
}

class StubProvider extends AIProvider {
  constructor(results) {
    super();
    this.name = "STUB";
    this.results = results.slice();
  }

  async generateText() {
    const next = this.results.shift();
    if (next instanceof Error) throw next;
    return { text: next };
  }
}

async function run() {
  // ---------- transient failures are retried until success ----------
  {
    const provider = new StubProvider([
      transientError(503),
      transientError(503),
      "Hello",
    ]);
    const { text } = await provider.generateTextWithRetry({ messages: [] });
    assert.strictEqual(text, "Hello");
    console.log("transient 503 retried to success: OK");
  }

  // ---------- non-transient errors are not retried ----------
  {
    const provider = new StubProvider([new AppError("Not found", 404)]);
    await assert.rejects(
      () => provider.generateTextWithRetry({ messages: [] }),
      (err) => err.statusCode === 404
    );
    console.log("non-transient error not retried: OK");
  }

  // ---------- persistent transient failures stop after retries ----------
  {
    const provider = new StubProvider([
      transientError(503),
      transientError(503),
      transientError(503),
      transientError(503),
      transientError(503),
    ]);
    await assert.rejects(
      () => provider.generateTextWithRetry({ messages: [] }),
      (err) => err.details && err.details.isTransient === true
    );
    console.log("persistent transient failure exhausts retries: OK");
  }

  console.log("\nAll AI provider retry tests passed.");
}

run().catch((error) => {
  console.error("Test run failed:", error);
  process.exit(1);
});