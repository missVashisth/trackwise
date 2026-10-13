// Reporting periods and calendar helpers for Insights. Every date here is a calendar-day key
// ("YYYY-MM-DD") in the user's own time zone, so grouping never depends on the server's zone and
// no day is counted twice across a time boundary.
//
//   week   – ISO week, Monday–Sunday (the same week habits use)
//   month  – calendar month
//   custom – from..to inclusive, at most MAX_CUSTOM_DAYS
// The previous period is the week/month before, or for a custom range the same number of days
// immediately before it.

const { isValidDateKey } = require("../../utils/validation");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_DAYS = 366;

const keyToUtc = (key) => Date.parse(`${key}T00:00:00Z`);
const shiftKey = (key, days) => new Date(keyToUtc(key) + days * MS_PER_DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((keyToUtc(to) - keyToUtc(from)) / MS_PER_DAY);
/** 0 = Sunday … 6 = Saturday, of the calendar day itself. */
const weekdayOf = (key) => new Date(keyToUtc(key)).getUTCDay();
const minKey = (...keys) => keys.filter(Boolean).sort()[0];
const maxKey = (...keys) => keys.filter(Boolean).sort().at(-1);

function weekOf(key) {
  const from = shiftKey(key, -((weekdayOf(key) + 6) % 7));
  return { from, to: shiftKey(from, 6) };
}

function monthOf(key) {
  const [y, m] = key.split("-").map(Number);
  return { from: `${key.slice(0, 7)}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** Every day key from..to inclusive. */
function eachDay(from, to) {
  const days = [];
  for (let key = from; key <= to; key = shiftKey(key, 1)) days.push(key);
  return days;
}

/**
 * Parses ?period=week|month|custom&date=YYYY-MM-DD (any day inside the week/month; default today)
 * or ?period=custom&from=&to=. Returns { range } or { error }.
 * range: { period, from, to, days, prev: { from, to }, today }
 */
function parsePeriod(query, today) {
  const period = query.period ?? "week";
  let from;
  let to;
  if (period === "week" || period === "month") {
    const anchor = query.date ?? today;
    if (!isValidDateKey(anchor)) return { error: "date must be a valid YYYY-MM-DD date" };
    ({ from, to } = period === "week" ? weekOf(anchor) : monthOf(anchor));
  } else if (period === "custom") {
    ({ from, to } = query);
    if (!isValidDateKey(from) || !isValidDateKey(to)) return { error: "A custom range needs from and to as YYYY-MM-DD dates" };
    if (from > to) return { error: "from must not be after to" };
    if (daysBetween(from, to) + 1 > MAX_CUSTOM_DAYS) return { error: `A custom range can cover at most ${MAX_CUSTOM_DAYS} days` };
  } else {
    return { error: "period must be week, month or custom" };
  }

  let prev;
  if (period === "week") prev = weekOf(shiftKey(from, -1));
  else if (period === "month") prev = monthOf(shiftKey(from, -1));
  else {
    const length = daysBetween(from, to) + 1;
    prev = { from: shiftKey(from, -length), to: shiftKey(from, -1) };
  }
  return { range: { period, from, to, days: daysBetween(from, to) + 1, prev, today } };
}

/** The last `count` ISO weeks / calendar months ending with the one that contains `key`. */
function trailingWeeks(key, count) {
  const last = weekOf(key);
  return Array.from({ length: count }, (_, i) => weekOf(shiftKey(last.from, -7 * (count - 1 - i))));
}
function trailingMonths(key, count) {
  const months = [];
  let current = monthOf(key);
  for (let i = 0; i < count; i += 1) {
    months.unshift(current);
    current = monthOf(shiftKey(current.from, -1));
  }
  return months;
}

module.exports = {
  MAX_CUSTOM_DAYS,
  shiftKey,
  daysBetween,
  weekdayOf,
  minKey,
  maxKey,
  weekOf,
  monthOf,
  eachDay,
  parsePeriod,
  trailingWeeks,
  trailingMonths,
};
