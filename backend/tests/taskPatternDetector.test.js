// Deterministic pattern-detection tests for the task-pattern engine.
// Run with: node tests/taskPatternDetector.test.js
const assert = require("assert");
const detector = require("../src/services/user/taskPatternDetector.js");

function detect(dates) {
  return detector.detectTaskPattern(dates);
}

async function run() {
  // ---------- insufficient history ----------
  {
    assert.strictEqual(detect([]).patternDetected, false);
    assert.strictEqual(detect(["2026-09-02"]).patternDetected, false);
    const two = detect(["2026-09-02", "2026-09-16"]);
    assert.strictEqual(two.patternDetected, false);
    assert.strictEqual(two.rejectReason, "insufficient_occurrences");
    console.log("insufficient history: OK");
  }

  // ---------- exact 14-day pattern (spec example) ----------
  {
    const r = detect(["2026-09-02", "2026-09-16", "2026-09-30", "2026-10-14"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.intervalDays, 14);
    assert.strictEqual(r.frequencyType, "BIWEEKLY");
    assert.deepStrictEqual(r.intervals, [14, 14, 14]);
    assert.strictEqual(r.averageInterval, 14);
    assert.strictEqual(r.lastOccurrence, "2026-10-14");
    assert.strictEqual(r.nextOccurrence, "2026-10-28");
    assert.ok(r.confidence > 0.5);
    console.log("exact 14-day pattern: OK");
  }

  // ---------- slightly irregular (14/14/15 still biweekly) ----------
  {
    const r = detect(["2026-09-02", "2026-09-16", "2026-09-30", "2026-10-15"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.intervalDays, 14);
    assert.strictEqual(r.lastOccurrence, "2026-10-15");
    assert.strictEqual(r.nextOccurrence, "2026-10-29");
    console.log("slightly irregular pattern: OK");
  }

  // ---------- highly irregular rejected ----------
  {
    const r = detect(["2026-09-02", "2026-09-06", "2026-09-16", "2026-10-02"]);
    assert.strictEqual(r.patternDetected, false);
    assert.strictEqual(r.rejectReason, "inconsistent_intervals");
    console.log("highly irregular rejected: OK");
  }

  // ---------- long gap rejected ----------
  {
    const r = detect(["2026-01-01", "2026-01-15", "2026-06-01", "2026-06-15"]);
    assert.strictEqual(r.patternDetected, false);
    assert.strictEqual(r.rejectReason, "long_gap");
    console.log("long gap rejected: OK");
  }

  // ---------- weekly classification ----------
  {
    const r = detect(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.frequencyType, "WEEKLY");
    assert.strictEqual(r.nextOccurrence, "2026-11-02");
    console.log("weekly classification: OK");
  }

  // ---------- monthly classification + year boundary ----------
  {
    const r = detect(["2026-11-20", "2026-12-20", "2027-01-20", "2027-02-20"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.frequencyType, "MONTHLY");
    assert.strictEqual(r.nextOccurrence, "2027-03-23");
    console.log("monthly classification + year boundary: OK");
  }

  // ---------- leap year (2028) next-occurrence ----------
  {
    // Jan 29 -> Feb 26 -> Mar 25 (Feb 2028 has 29 days).
    const r = detect(["2028-01-29", "2028-02-26", "2028-03-25"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.intervalDays, 28);
    assert.strictEqual(r.nextOccurrence, "2028-04-22");
    console.log("leap year handled: OK");
  }

  // ---------- custom "every N days" ----------
  {
    const r = detect(["2026-10-01", "2026-10-11", "2026-10-21"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.frequencyType, "EVERY_DAYS");
    assert.strictEqual(r.intervalDays, 10);
    assert.strictEqual(r.nextOccurrence, "2026-10-31");
    console.log("custom interval classification: OK");
  }

  // ---------- confidence grows with more evidence ----------
  {
    const three = detect(["2026-09-02", "2026-09-16", "2026-09-30"]);
    const six = detect([
      "2026-05-01", "2026-05-15", "2026-05-29",
      "2026-06-12", "2026-06-26", "2026-07-10",
    ]);
    assert.ok(three.confidence < six.confidence, "more evidence => higher confidence");
    assert.strictEqual(three.confidence, 0.76);
    assert.strictEqual(six.confidence, 1);
    console.log("confidence calculation: OK");
  }

  // ---------- duplicates don't inflate evidence ----------
  {
    const r = detect(["2026-10-06", "2026-10-06", "2026-10-13", "2026-10-20"]);
    assert.strictEqual(r.patternDetected, true);
    assert.strictEqual(r.occurrences, 3);
    assert.strictEqual(r.nextOccurrence, "2026-10-27");
    console.log("dedupe: OK");
  }

  // ---------- title normalization ----------
  {
    assert.strictEqual(detector.normalizeTaskTitle("  Clean   ROOM "), "clean room");
    assert.strictEqual(detector.normalizeTaskTitle("Clean Room"), "clean room");
    assert.strictEqual(detector.normalizeTaskTitle(""), "");
    console.log("title normalization: OK");
  }

  // ---------- suggestion window helpers ----------
  {
    assert.strictEqual(detector.isWithinSuggestionWindow("2026-10-26", "2026-10-28"), true); // 2 before
    assert.strictEqual(detector.isWithinSuggestionWindow("2026-10-28", "2026-10-28"), true); // exact
    assert.strictEqual(detector.isWithinSuggestionWindow("2026-10-30", "2026-10-28"), true); // 2 after
    assert.strictEqual(detector.isWithinSuggestionWindow("2026-10-31", "2026-10-28"), false); // 3 after
    assert.strictEqual(detector.isWithinSuggestionWindow("2026-10-25", "2026-10-28"), false); // 3 before

    // Roll forward a slipped cycle into the window.
    const fwd = detector.forwardNextOccurrenceKey("2026-09-14", 14, "2026-10-28");
    assert.strictEqual(fwd, "2026-10-26"); // within window (2 days before expected 10-28 baseline)
    console.log("suggestion window + roll forward: OK");
  }

  console.log("All task pattern detector tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});