// Covers the "don't dump code on me" rules in the user assistant's system prompt.
//
// This is the whole behaviour: the user asks how to build or learn something and
// wants an ordered plan back, not a 200-line file. The rules are prompt text, so
// the only way to pin them down is to assert they are still in the prompt and
// that adding them did not cost the sections that were already there.
//
//   node tests/aiCodeResponseRules.test.js
const assert = require("assert");

const AIContextBuilder = require("../src/services/ai/aiContextBuilder.js");

const HEADER = "How to answer questions about code, tools and building things:";

async function run() {
  const builder = new AIContextBuilder();
  const { prompt } = builder.buildSystemPrompt({
    profileContext: null,
    timezone: "Asia/Manila",
  });

  // --- the code rules are present ------------------------------------------
  {
    assert.ok(prompt.includes(HEADER), "code section missing from the system prompt");

    // Plan first. This is the rule the user actually asked for: the answer leads
    // with what to learn, not with an implementation.
    assert.ok(
      prompt.includes("Lead with a short ordered plan"),
      "must tell the model to lead with a plan of what to learn"
    );

    assert.ok(
      prompt.includes("Do not paste full files"),
      "must forbid full files / long scripts"
    );
    assert.ok(
      prompt.includes("Never write more than a few lines of code at a time"),
      "must cap how much code may be written at once"
    );

    // Short code is still allowed — the user asked for "simple short code", not
    // no code at all, so this line has to stay.
    assert.ok(
      prompt.includes("A short snippet is fine"),
      "a small illustrative snippet must remain allowed"
    );
    assert.ok(
      prompt.includes("ask before writing anything long"),
      "long implementations require the user to ask first"
    );
    assert.ok(
      prompt.includes("Do not invent libraries"),
      "must not hallucinate libraries or APIs"
    );
  }
  console.log("ok  plan-first, no-dump-code rules reach the system prompt");

  // --- the rules are a list, not one run-on sentence ----------------------
  {
    const section = prompt.slice(prompt.indexOf(HEADER));
    const bullets = section.split("\n").filter((line) => line.startsWith("- "));

    assert.ok(
      bullets.length >= 5,
      `expected at least 5 separate rules, found ${bullets.length}`
    );
  }
  console.log("ok  rules are separate lines the model can weigh individually");

  // --- nothing earlier was displaced --------------------------------------
  {
    assert.ok(
      prompt.includes("You are a personal productivity assistant"),
      "persona line lost"
    );
    assert.ok(prompt.includes("How this app works"), "app help section lost");
    assert.ok(prompt.includes("Current date:"), "clock context lost");

    // The code rules must not sit before the app reference: the app rules are
    // the ones that keep the model honest about this product, and burying them
    // under a block about code makes them easier to skip.
    assert.ok(
      prompt.indexOf("How this app works") < prompt.indexOf(HEADER),
      "app help must come before the code rules"
    );
  }
  console.log("ok  persona, app help and clock context all survive");

  // --- every line is a real rule, not filler -------------------------------
  {
    const section = prompt.slice(prompt.indexOf(HEADER));
    for (const line of section.split("\n")) {
      if (!line.startsWith("- ")) continue;
      assert.ok(line.length > 40, `rule too short to carry meaning: ${line}`);
    }
  }
  console.log("ok  no placeholder rules left in the section");

  console.log("\nAll AI code-response rule checks passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
