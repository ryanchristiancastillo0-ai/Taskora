// Real-time clock context for the AI.
//
// `new Date()` is the single source of truth: it reads the clock of whatever
// machine runs the backend, so nothing here is ever hardcoded or cached between
// requests. The only thing that needs care is formatting. On a local machine the
// OS timezone usually matches the user, but a deployed server (Render, etc.) is
// typically UTC, so reading the server's local fields with getHours()/getDate()
// would hand the model the wrong day. Everything below therefore formats through
// Intl.DateTimeFormat with an explicit IANA zone and timeZoneName: "longOffset",
// which yields the zone's real UTC offset (including DST) instead of guessing.

const DEFAULT_TIMEZONE = "Asia/Manila";

const partsCache = new Map();

// Intl option bundles are expensive to build and these are reused constantly.
function formatter(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let cached = partsCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    partsCache.set(key, cached);
  }
  return cached;
}

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the zone to format in, most specific first. An invalid stored value
 * falls through to the next candidate rather than throwing, because a bad row in
 * the database must not be able to break every AI reply.
 */
function resolveTimeZone(...candidates) {
  for (const candidate of candidates) {
    if (isValidTimeZone(candidate)) return candidate;
  }
  return DEFAULT_TIMEZONE;
}

// Decompose an instant into calendar fields for a given zone.
function zonedParts(date, timeZone) {
  const raw = formatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  }).formatToParts(date);

  const out = {};
  for (const part of raw) {
    if (part.type !== "literal") out[part.type] = part.value;
  }

  return {
    year: Number(out.year),
    // Intl emits hour "24" for midnight in some ICU versions; normalize to 0.
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    // e.g. "GMT+8" — the zone's actual offset, DST included.
    offset: out.timeZoneName ?? "",
  };
}

const pad = (value) => String(value).padStart(2, "0");

const isoDate = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;

// 12-hour clock with seconds, e.g. "2:37:15 PM". Matches the format the assistant
// should quote back to the user.
function clock12({ hour, minute, second }) {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${pad(minute)}:${pad(second)} ${suffix}`;
}

// Midnight and noon are the awkward cases: 00:05 is "12:05 AM" and 12:05 is
// "12:05 PM". Date.UTC handles month/year rollover, so 31 December plus one day
// lands on 1 January without any special casing.
const DAY_MS = 86_400_000;

function addDays(parts, days) {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatDay(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return {
    date: isoDate(parts),
    weekday: formatter(timeZone, { weekday: "long" }).format(date),
  };
}

// Coarse part of the day, so "is it morning or afternoon?" does not need the
// model to infer it from a clock string.
function partOfDay(hour) {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/**
 * Build the clock context handed to the model. Recomputed on every request, so
 * it always reflects the moment the AI request is processed.
 *
 * `now` is injectable purely so tests can assert the formatting deterministically
 * without faking a clock in production code; production never passes it.
 */
function buildDateTimeContext({ timeZone, now = new Date() } = {}) {
  const zone = resolveTimeZone(timeZone);
  const parts = zonedParts(now, zone);

  return {
    timeZone: zone,
    offset: parts.offset,
    date: isoDate(parts),
    time: clock12(parts),
    time24: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
    weekday: formatter(zone, { weekday: "long" }).format(now),
    partOfDay: partOfDay(parts.hour),
    yesterday: formatDay(new Date(now.getTime() - DAY_MS), zone),
    tomorrow: formatDay(new Date(now.getTime() + DAY_MS), zone),
  };
}

/**
 * Render the context as prompt lines. The instruction is explicit that the model
 * must use these values and must not claim the time is unavailable — otherwise
 * it falls back to saying it has no real-time clock, which is exactly the
 * behaviour this replaces.
 */
function buildDateTimePrompt(timezone) {
  const context = buildDateTimeContext({ timeZone: timezone });

  return {
    context,
    prompt: [
      "Current date and time (authoritative, generated by the application at the moment this request was processed):",
      `Current date: ${context.date}`,
      `Current time: ${context.time}`,
      `Day of week: ${context.weekday}`,
      `Timezone: ${context.timeZone} (${context.offset})`,
      `Time of day: ${context.partOfDay}`,
      `Yesterday: ${context.yesterday.date} (${context.yesterday.weekday})`,
      `Tomorrow: ${context.tomorrow.date} (${context.tomorrow.weekday})`,
      "",
      "Use the provided current date, time, day, and timezone when answering date/time-related questions. Never guess the current date or time. Do not claim that the current time is unavailable when the application has provided the current date/time context.",
    ].join("\n"),
  };
}

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 *
 * Derived by formatting the instant in the zone and reading the result back as
 * if it were UTC. Doing it this way (rather than parsing "GMT+8" text) means DST
 * is handled by Intl for free: the offset is whatever the zone actually was at
 * that moment, not a single fixed number for the whole year.
 */
function zoneOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Compare at whole-second resolution; sub-second parts are not part of a
  // calendar offset and would otherwise skew the result.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * The UTC instant of local midnight for a "YYYY-MM-DD" day in a given zone.
 *
 * This is what makes "due today" correct on a UTC server. Naively doing
 * new Date("2026-09-26") would mean midnight UTC, which is 8am in Manila and
 * would wrongly exclude or include the wrong tasks.
 */
function startOfDayUtc(dateStr, timeZone) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0);

  // One refinement pass handles DST transitions, where the offset at local
  // midnight differs from the offset 24h earlier.
  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const corrected = naive - zoneOffsetMs(new Date(firstGuess), timeZone);

  return new Date(corrected);
}

/**
 * Half-open [start, end) UTC range covering one local calendar day. Use with
 * Prisma filters: { gte: start, lt: end }.
 */
function dayRangeUtc(dateStr, timeZone) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day) + DAY_MS);
  const nextDateStr = `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-${pad(nextDay.getUTCDate())}`;

  return {
    start: startOfDayUtc(dateStr, timeZone),
    end: startOfDayUtc(nextDateStr, timeZone),
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  resolveTimeZone,
  zonedParts,
  clock12,
  zoneOffsetMs,
  startOfDayUtc,
  dayRangeUtc,
  buildDateTimeContext,
  buildDateTimePrompt,
};
