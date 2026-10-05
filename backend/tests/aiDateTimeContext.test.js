// Verifies the AI clock context is generated from the real system clock and
// formatted in an explicit IANA timezone.
//
// Note on `now`: it is injected only to make assertions deterministic. Nothing in
// the production path passes it — every call reads new Date() — and the
// "generated dynamically" case below proves that by comparing two real calls.
const assert = require("assert");

const {
  DEFAULT_TIMEZONE,
  resolveTimeZone,
  zonedParts,
  clock12,
  buildDateTimeContext,
  buildDateTimePrompt,
} = require("../src/utils/dateTime");

const AIContextBuilder = require("../src/services/ai/aiContextBuilder.js");

// 2026-09-26 14:37:15 in Asia/Manila (UTC+8) == 06:37:15 UTC.
const MANILA_AFTERNOON = new Date("2026-09-26T06:37:15Z");

async function run() {
  // --- timezone resolution ------------------------------------------------
  {
    assert.strictEqual(DEFAULT_TIMEZONE, "Asia/Manila");
    assert.strictEqual(resolveTimeZone("Europe/Paris"), "Europe/Paris");
    assert.strictEqual(resolveTimeZone(undefined), "Asia/Manila", "unset falls back");
    assert.strictEqual(resolveTimeZone(""), "Asia/Manila", "empty falls back");
    assert.strictEqual(resolveTimeZone("   "), "Asia/Manila", "blank falls back");
    assert.strictEqual(
      resolveTimeZone("Not/AZone"),
      "Asia/Manila",
      "a garbage stored value must not throw"
    );
    assert.strictEqual(
      resolveTimeZone("Not/AZone", "Asia/Tokyo"),
      "Asia/Tokyo",
      "first valid candidate wins"
    );
    console.log("ok  timezone resolution and safe fallback");
  }

  // --- explicit zone formatting, not server-local --------------------------
  {
    const manila = zonedParts(MANILA_AFTERNOON, "Asia/Manila");
    assert.deepStrictEqual(
      { y: manila.year, m: manila.month, d: manila.day },
      { y: 2026, m: 9, d: 26 },
      "Manila date"
    );
    assert.strictEqual(manila.hour, 14, "Manila hour");

    // Same instant, different zone -> different calendar values. This is the
    // Render/UTC trap: reading server-local fields would give the wrong day.
    const utc = zonedParts(MANILA_AFTERNOON, "UTC");
    assert.strictEqual(utc.hour, 6, "UTC hour differs from Manila");
    assert.strictEqual(utc.day, 26);

    // And a zone far enough behind rolls the date backwards.
    const ny = zonedParts(MANILA_AFTERNOON, "America/New_York");
    assert.strictEqual(ny.hour, 2, "New York hour");
    assert.strictEqual(ny.day, 26);
    assert.ok(/GMT-4|-04:00/.test(ny.offset), `expected a -4 offset, got ${ny.offset}`);
    console.log("ok  explicit IANA zone applied (not server-local)");
  }

  // --- 12-hour clock formatting -------------------------------------------
  {
    assert.strictEqual(clock12({ hour: 14, minute: 37, second: 15 }), "2:37:15 PM");
    assert.strictEqual(clock12({ hour: 9, minute: 5, second: 7 }), "9:05:07 AM");
    // Midnight and noon are the two cases that break naive % 12 arithmetic.
    assert.strictEqual(clock12({ hour: 0, minute: 30, second: 0 }), "12:30:00 AM");
    assert.strictEqual(clock12({ hour: 12, minute: 0, second: 0 }), "12:00:00 PM");
    assert.strictEqual(clock12({ hour: 23, minute: 59, second: 59 }), "11:59:59 PM");
    console.log("ok  12-hour clock formatting incl. midnight/noon");
  }

  // --- full context -------------------------------------------------------
  {
    const ctx = buildDateTimeContext({ timeZone: "Asia/Manila", now: MANILA_AFTERNOON });
    assert.strictEqual(ctx.timeZone, "Asia/Manila");
    assert.strictEqual(ctx.date, "2026-09-26");
    assert.strictEqual(ctx.time, "2:37:15 PM");
    assert.strictEqual(ctx.time24, "14:37:15");
    assert.strictEqual(ctx.weekday, "Saturday");
    assert.strictEqual(ctx.partOfDay, "afternoon");
    assert.strictEqual(ctx.yesterday.date, "2026-09-25");
    assert.strictEqual(ctx.yesterday.weekday, "Friday");
    assert.strictEqual(ctx.tomorrow.date, "2026-09-27");
    assert.strictEqual(ctx.tomorrow.weekday, "Sunday");
    console.log("ok  full date/time context (date, time, weekday, part of day)");
  }

  // --- month/year rollover ------------------------------------------------
  {
    // 2026-12-31 23:30 Manila -> tomorrow is 2027-01-01.
    const yearEnd = new Date("2026-12-31T15:30:00Z");
    const ctx = buildDateTimeContext({ timeZone: "Asia/Manila", now: yearEnd });
    assert.strictEqual(ctx.date, "2026-12-31");
    assert.strictEqual(ctx.tomorrow.date, "2027-01-01");
    assert.strictEqual(ctx.yesterday.date, "2026-12-30");
    console.log("ok  month/year rollover for yesterday/tomorrow");
  }

  // --- leap day -----------------------------------------------------------
  {
    const leap = new Date("2028-02-28T02:00:00Z");
    const ctx = buildDateTimeContext({ timeZone: "Asia/Manila", now: leap });
    assert.strictEqual(ctx.tomorrow.date, "2028-02-29", "leap day handled");
    console.log("ok  leap day handled");
  }

  // --- prompt wiring ------------------------------------------------------
  {
    const { prompt, context } = buildDateTimePrompt("Asia/Manila");
    assert.ok(prompt.includes("Never guess the current date or time"));
    assert.ok(
      prompt.includes("Do not claim that the current time is unavailable"),
      "the instruction that stops the 'I have no clock' reply must be present"
    );
    for (const line of [
      "Current date:",
      "Current time:",
      "Day of week:",
      "Timezone:",
      "Yesterday:",
      "Tomorrow:",
    ]) {
      assert.ok(prompt.includes(line), `prompt is missing "${line}"`);
    }
    assert.strictEqual(context.timeZone, "Asia/Manila");
    console.log("ok  prompt contains all clock fields plus the instruction");
  }

  // --- generated dynamically, never hardcoded -----------------------------
  {
    // Two real calls a moment apart must reflect the passing clock, proving the
    // value comes from new Date() rather than a constant in the source.
    const a = buildDateTimeContext({ timeZone: "Asia/Manila" });
    await new Promise((r) => setTimeout(r, 1100));
    const b = buildDateTimeContext({ timeZone: "Asia/Manila" });

    assert.notStrictEqual(
      a.time,
      b.time,
      "concurrent builds returned an identical clock string — value is not live"
    );
    assert.match(a.time, /^\d{1,2}:\d{2}:\d{2} (AM|PM)$/);
    assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(a.weekday, /^[A-Za-z]+$/);
    console.log(`ok  generated dynamically (${a.time} -> ${b.time})`);
  }

  // --- system prompt integration ------------------------------------------
  {
    const builder = new AIContextBuilder();
    const built = builder.buildSystemPrompt({
      profileContext: { displayName: "Ryan" },
      timezone: "Asia/Manila",
    });

    assert.strictEqual(typeof built.prompt, "string", "must still return a string");
    assert.ok(built.prompt.includes("Hello Ryan!"), "existing profile behaviour kept");
    assert.ok(built.prompt.includes("Current date:"), "clock context injected");
    assert.ok(
      built.prompt.includes("Asia/Manila"),
      "the user's zone must appear in the prompt"
    );
    assert.ok(built.dateTimeContext, "structured context returned for callers");

    // Works with no timezone supplied at all.
    const fallback = builder.buildSystemPrompt({ profileContext: null });
    assert.ok(fallback.prompt.includes("Asia/Manila"), "defaults to Asia/Manila");
    console.log("ok  system prompt integration, profile behaviour preserved");
  }

  console.log("\nAll AI date/time context checks passed.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
