// Local-calendar date helpers for pattern detection and the daily summary.
//
// Dates are handled as "YYYY-MM-DD" strings representing a calendar day
// (no time component) so day arithmetic is stable across DST switches,
// month/year boundaries and leap years. This mirrors the approach already
// used by HabitCompletion (store the local "YYYY-MM-DD" to avoid MySQL
// timezone shifting). The timezone-aware functions in the second half power
// the daily-summary scheduler, which must compare against a user's local
// calendar, never UTC.

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

// The fields of `now` as the wall clock reads in `timeZone`. Built once here so
// the three timezone-aware helpers below share one Intl call.
function partsInZone(now, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(now);
}

function fieldOf(parts, type) {
  return Number(parts.find((part) => part.type === type).value);
}

// The epoch of local midnight in `timeZone` for `now`, as a UTC-time Date. This
// is the only safe way to build a "start of today / yesterday / this week" bound
// for a user whose calendar is not UTC: a date-only string would not, and DST
// shifts are handled by Intl, not by adding 24h to a wall-clock reading.
function startOfDayInZone(now, timeZone) {
  const parts = partsInZone(now, timeZone);
  return new Date(
    Date.UTC(fieldOf(parts, "year"), fieldOf(parts, "month") - 1, fieldOf(parts, "day"))
  );
}

// Hour of day (0-23) as the wall clock reads in `timeZone`. Used by the daily
// summary scheduler to decide whether a user's local time has reached the send
// hour.
function hourInZone(now, timeZone) {
  return fieldOf(partsInZone(now, timeZone), "hour");
}

// Appears as the day would read on a local calendar in `timeZone".
function dayKeyInZone(now, timeZone) {
  const parts = partsInZone(now, timeZone);
  const pad = (value) => String(value).padStart(2, "0");
  return `${fieldOf(parts, "year")}-${pad(fieldOf(parts, "month"))}-${pad(fieldOf(parts, "day"))}`;
}

module.exports = {
  localKey,
  parseKey,
  utcTime,
  daysBetweenKeys,
  addDaysKey,
  startOfDayInZone,
  hourInZone,
  dayKeyInZone,
};