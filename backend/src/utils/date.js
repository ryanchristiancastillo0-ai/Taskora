// Local-calendar date helpers for pattern detection.
//
// Dates are handled as "YYYY-MM-DD" strings representing a calendar day
// (no time component) so day arithmetic is stable across DST switches,
// month/year boundaries and leap years. This mirrors the approach already
// used by HabitCompletion (store the local "YYYY-MM-DD" to avoid MySQL
// timezone shifting).

const DAY_MS = 86_400_000;

function pad(value) {
  return String(value).padStart(2, "0");
}

// Date -> "YYYY-MM-DD" using LOCAL calendar fields.
function localKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "YYYY-MM-DD" -> Date set to LOCAL midnight of that day.
function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// "YYYY-MM-DD" -> UTC millisecond timestamp (no DST ambiguity).
function utcTime(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

// Whole days from a to b: positive when b is after a.
function daysBetweenKeys(a, b) {
  return Math.round((utcTime(b) - utcTime(a)) / DAY_MS);
}

// Add whole days to a key, returning a new "YYYY-MM-DD". Handles month
// and year boundaries plus leap years via Date's normalization.
function addDaysKey(key, offsetDays) {
  const date = new Date(utcTime(key));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = { localKey, parseKey, utcTime, daysBetweenKeys, addDaysKey };