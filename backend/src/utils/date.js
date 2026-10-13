// Date rules for the whole app.
//
// - Timestamps (createdAt, completedAt, ...) are real instants, stored in UTC.
// - "Date keys" ("YYYY-MM-DD") are calendar days in a user's IANA time zone: which day a task
//   completion belongs to, what "today" is. They come from Intl, so daylight saving is handled.
// - Goal start dates and deadlines are calendar dates picked in a date input and stored as
//   UTC midnight; their key is read in UTC (dateOnlyKey), never shifted by a time zone.

const DEFAULT_TIME_ZONE = "Asia/Kolkata";
const TIME_ZONE = DEFAULT_TIME_ZONE; // kept for existing imports

const formatters = new Map();

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The user's zone if valid, otherwise the app default. */
function resolveTimeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

function localParts(date, timeZone) {
  const parts = {};
  for (const { type, value } of formatterFor(resolveTimeZone(timeZone)).formatToParts(new Date(date))) {
    parts[type] = value;
  }
  return parts;
}

/** "YYYY-MM-DD" of the instant `date` on the wall calendar of `timeZone`. */
function toDateKey(date, timeZone = DEFAULT_TIME_ZONE) {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

function getTodayDateKey(timeZone = DEFAULT_TIME_ZONE) {
  return toDateKey(new Date(), timeZone);
}

/** Minutes since local midnight (0-1439) of the instant `date` in `timeZone`. */
function localMinutesOfDay(date, timeZone = DEFAULT_TIME_ZONE) {
  const { hour, minute } = localParts(date, timeZone);
  return Number(hour) * 60 + Number(minute);
}

/** How far `timeZone` is ahead of UTC at the given instant, in ms (DST-aware). */
function offsetMs(instant, timeZone) {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The first instant of the calendar day `dateKey` in `timeZone`. */
function startOfDateKey(dateKey, timeZone = DEFAULT_TIME_ZONE) {
  const zone = resolveTimeZone(timeZone);
  const [y, m, d] = dateKey.split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  // Two passes: the offset can differ between the guess and the real answer around DST changes.
  let instant = wallMidnight - offsetMs(wallMidnight, zone);
  instant = wallMidnight - offsetMs(instant, zone);
  // Where a DST jump skips midnight, the day starts at the first instant whose key is dateKey.
  if (toDateKey(instant, zone) !== dateKey) instant += 60 * 60 * 1000;
  return new Date(instant);
}

/** Key of a date-only value (goal start/deadline stored as UTC midnight). */
function dateOnlyKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

module.exports = {
  DEFAULT_TIME_ZONE,
  TIME_ZONE,
  isValidTimeZone,
  resolveTimeZone,
  toDateKey,
  getTodayDateKey,
  localMinutesOfDay,
  startOfDateKey,
  dateOnlyKey,
};
