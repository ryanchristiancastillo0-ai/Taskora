// Deterministic task pattern detector.
//
// This module is PURE — it only turns a list of "YYYY-MM-DD" occurrence
// dates into a structured pattern verdict. No database, no AI, no side
// effects. Every decision below is fully explainable by inspecting the
// constants and the arithmetic.
//
// Detection rules:
//   1. At least MIN_OCCURRENCES distinct occurrence dates are required
//      before anything is treated as a pattern (no single/two-off guesses).
//   2. Any interval longer than MAX_GAP_DAYS invalidates the pattern
//      ("long gap between occurrences").
//   3. Intervals must be consistent enough: coefficient of variation
//      (stddev / mean) must stay below MAX_COEFFICIENT_OF_VARIATION.
//   4. A confidence score is computed from evidence (occurrence count)
//      and regularity (CV), and must pass MIN_CONFIDENCE.
//   5. The next expected occurrence is last occurrence + interval.

const { addDaysKey, daysBetweenKeys } = require("../../utils/date.js");

const MIN_OCCURRENCES = 3;
const MAX_GAP_DAYS = 120;
const MAX_COEFFICIENT_OF_VARIATION = 0.35;
const TARGET_OCCURRENCES = 5;
const MIN_CONFIDENCE = 0.5;

// Turn a raw task title into the grouping key. Detection groups tasks by
// this normalized title (lowercased, whitespace collapsed) so casing or
// spacing differences count as the same recurring task.
function normalizeTaskTitle(title) {
  return String(title || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Human-friendly label for a detected interval.
function classifyFrequency(intervalDays) {
  if (intervalDays >= 27 && intervalDays <= 32) {
    return "MONTHLY";
  }
  if (intervalDays === 7) {
    return "WEEKLY";
  }
  if (intervalDays === 14) {
    return "BIWEEKLY";
  }
  return "EVERY_DAYS";
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStdDev(values, avg) {
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Detect a recurring interval pattern from occurrence date keys.
//
// dates: array of "YYYY-MM-DD" strings (may contain duplicates/unsorted).
//
// Returns:
//   {
//     patternDetected: boolean,
//     rejectReason: string | null,
//     occurrences: number,
//     intervals: number[],
//     averageInterval: number | null,
//     stdDev: number | null,
//     coefficientOfVariation: number | null,
//     intervalDays: number | null,
//     frequencyType: string | null,
//     confidence: number | null,
//     lastOccurrence: string | null,
//     nextOccurrence: string | null
//   }
function detectTaskPattern(dates) {
  const unique = Array.from(new Set((dates || []).filter(Boolean))).sort();
  const occurrences = unique.length;

  if (occurrences < MIN_OCCURRENCES) {
    return noPattern("insufficient_occurrences", unique);
  }

  const intervals = [];
  for (let i = 1; i < occurrences; i += 1) {
    intervals.push(daysBetweenKeys(unique[i - 1], unique[i]));
  }

  if (intervals.some((interval) => interval <= 0)) {
    return noPattern("non_positive_interval", unique);
  }

  if (intervals.some((interval) => interval > MAX_GAP_DAYS)) {
    return reject("long_gap", unique, intervals);
  }

  const averageInterval = mean(intervals);
  const stdDev = populationStdDev(intervals, averageInterval);
  const coefficientOfVariation = stdDev / averageInterval;

  if (coefficientOfVariation > MAX_COEFFICIENT_OF_VARIATION) {
    return reject("inconsistent_intervals", unique, intervals, {
      averageInterval,
      stdDev,
      coefficientOfVariation,
    });
  }

  const intervalDays = Math.round(averageInterval);
  const frequencyType = classifyFrequency(intervalDays);

  const occurrenceScore = Math.min(1, occurrences / TARGET_OCCURRENCES);
  const consistencyScore = Math.max(
    0,
    1 - Math.min(1, coefficientOfVariation / MAX_COEFFICIENT_OF_VARIATION)
  );
  const confidence =
    Math.round((occurrenceScore * 0.6 + consistencyScore * 0.4) * 100) / 100;

  if (confidence < MIN_CONFIDENCE) {
    return reject("low_confidence", unique, intervals, {
      averageInterval,
      stdDev,
      coefficientOfVariation,
      occurrenceScore,
      consistencyScore,
      confidence,
    });
  }

  const lastOccurrence = unique[unique.length - 1];
  const nextOccurrence = addDaysKey(lastOccurrence, intervalDays);

  return {
    patternDetected: true,
    rejectReason: null,
    occurrences,
    intervals,
    averageInterval,
    stdDev,
    coefficientOfVariation,
    intervalDays,
    frequencyType,
    confidence,
    lastOccurrence,
    nextOccurrence,
  };
}

function noPattern(reason, unique) {
  return { patternDetected: false, rejectReason: reason, occurrences: unique.length };
}

function reject(reason, unique, intervals, extra = {}) {
  return {
    patternDetected: false,
    rejectReason: reason,
    occurrences: unique.length,
    intervals,
    ...extra,
  };
}

// When is a suggestion allowed to fire relative to nextOccurrence?
// Negative = before expected, positive = after expected.
const SUGGESTION_WINDOW_BEFORE = 2;
const SUGGESTION_WINDOW_AFTER = 2;

function isWithinSuggestionWindow(todayKey, expectedKey) {
  const distance = daysBetweenKeys(todayKey, expectedKey);
  return (
    distance >= -SUGGESTION_WINDOW_BEFORE && distance <= SUGGESTION_WINDOW_AFTER
  );
}

// Rolling forward: keep stepping nextOccurrence forward by the interval
// until it enters the suggestion window (or the future). This keeps
// suggestions relevant when a cycle slipped by while the system was off.
// Guard rails against runaway loops.
function forwardNextOccurrenceKey(nextKey, intervalDays, todayKey, maxSteps = 24) {
  let candidate = nextKey;
  let distance = daysBetweenKeys(todayKey, candidate);
  let steps = 0;
  while (distance < -SUGGESTION_WINDOW_AFTER && steps < maxSteps) {
    candidate = addDaysKey(candidate, intervalDays);
    distance = daysBetweenKeys(todayKey, candidate);
    steps += 1;
  }
  return candidate;
}

module.exports = {
  normalizeTaskTitle,
  detectTaskPattern,
  classifyFrequency,
  isWithinSuggestionWindow,
  forwardNextOccurrenceKey,
  MIN_OCCURRENCES,
  MAX_GAP_DAYS,
  MAX_COEFFICIENT_OF_VARIATION,
  TARGET_OCCURRENCES,
  MIN_CONFIDENCE,
  SUGGESTION_WINDOW_BEFORE,
  SUGGESTION_WINDOW_AFTER,
};