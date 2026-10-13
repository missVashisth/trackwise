// Pure date helpers. No React, no side effects.

export const MS_PER_DAY = 86_400_000;

// Calendar dates (goal start/deadline) travel as "YYYY-MM-DD" or UTC midnight. Read them as that
// calendar day locally; `new Date()` on UTC midnight would show the previous day west of UTC.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

export function parseDate(value) {
  if (!value) return null;
  const dateOnly = typeof value === "string" ? DATE_ONLY.exec(value) : null;
  const date = value instanceof Date ? value : dateOnly ? new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

/** "2026-09-28" — the format <input type="date"> expects. */
export function toDateInputValue(value) {
  const date = parseDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "1 Jan", or "1 Jul '25" when the year differs from the current one. */
export function formatShortDate(value, now = new Date()) {
  const date = parseDate(value);
  if (!date) return "—";
  const base = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (date.getFullYear() === now.getFullYear()) return base;
  return `${base} '${String(date.getFullYear()).slice(-2)}`;
}

/** "28 Sep 2026" */
export function formatLongDate(value) {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Compact countdown like Griply: "6d", "3m", "1y", or "-1m" when overdue.
 * Returns null when there is no deadline.
 */
export function formatRelativeDeadline(value, now = new Date()) {
  const date = parseDate(value);
  if (!date) return null;

  const days = daysBetween(now, date);
  const abs = Math.abs(days);

  let label;
  if (abs === 0) label = "today";
  else if (abs < 30) label = `${abs}d`;
  else if (abs < 365) label = `${Math.max(1, Math.round(abs / 30))}m`;
  else label = `${Math.max(1, Math.round(abs / 365))}y`;

  if (days < 0 && abs > 0) label = `-${label}`;

  let tone = "neutral";
  if (days < 0) tone = "danger";
  else if (days <= 14) tone = "warning";

  return { label, tone, days };
}

/** { key: "2026-Q4", label: "Q4 2026" } */
export function quarterOf(value) {
  const date = parseDate(value);
  if (!date) return null;
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return { key: `${date.getFullYear()}-Q${quarter}`, label: `Q${quarter} ${date.getFullYear()}` };
}

/** This browser's IANA time zone, e.g. "America/New_York". */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Today's "YYYY-MM-DD" in `timeZone` — pass the user's zone as reported by the server, so this
 * matches the key the server uses for completions. Falls back to the browser's zone.
 */
export function currentAppDateKey(timeZone, now = new Date()) {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", options).format(now);
  }
}
