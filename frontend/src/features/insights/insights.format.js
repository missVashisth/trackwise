// Pure helpers for the Insights UI: period state (kept in the URL), navigation and labels.
// The same reporting boundaries as the server: weeks are Monday–Sunday, months are calendar months.

const MS_PER_DAY = 86_400_000;
const keyToUtc = (key) => Date.parse(`${key}T00:00:00Z`);
export const shiftKey = (key, days) => new Date(keyToUtc(key) + days * MS_PER_DAY).toISOString().slice(0, 10);

export const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];

/** Period state from URL search params (falls back to the current week). */
export function periodFromParams(params) {
  const period = params.get("period");
  if (period === "custom" && params.get("from") && params.get("to")) return { period, from: params.get("from"), to: params.get("to") };
  if (period === "month") return { period, date: params.get("date") || null };
  return { period: "week", date: params.get("date") || null };
}

export function periodToParams(state) {
  if (state.period === "custom") return { period: "custom", from: state.from, to: state.to };
  return state.date ? { period: state.period, date: state.date } : { period: state.period };
}

export function periodQueryString(state) {
  return new URLSearchParams(periodToParams(state)).toString();
}

/** The week/month before or after the one shown (`range` is the server's resolved range). */
export function stepPeriod(state, range, direction) {
  if (state.period === "custom") {
    const days = range.days;
    return { period: "custom", from: shiftKey(range.from, direction * days), to: shiftKey(range.to, direction * days) };
  }
  return { period: state.period, date: direction < 0 ? shiftKey(range.from, -1) : shiftKey(range.to, 1) };
}

/** Whether the shown range already includes today (no "next" step into the future). */
export const isCurrentRange = (range) => range.to >= range.today;

const fmt = (key, opts) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });

/** "9–15 Mar 2026", "March 2026", "1 Feb – 10 Mar 2026". */
export function rangeLabel(range) {
  if (range.period === "month") return fmt(range.from, { month: "long", year: "numeric" });
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const sameMonth = sameYear && range.from.slice(0, 7) === range.to.slice(0, 7);
  if (sameMonth) return `${Number(range.from.slice(8))}–${fmt(range.to, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${fmt(range.from, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${fmt(range.to, { day: "numeric", month: "short", year: "numeric" })}`;
}

export const shortDay = (key) => fmt(key, { day: "numeric", month: "short" });
export const weekdayShort = (key) => fmt(key, { weekday: "short" });

export function formatPercent(value) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

/** "+12 pts vs previous" / "−5 pts vs previous" / "same as before" / null when nothing to compare. */
export function formatChange(change, unit = "pts") {
  if (change === null || change === undefined) return null;
  if (Math.abs(change) < 0.5) return { text: "same as before", tone: "neutral" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change))} ${unit} vs previous`, tone: change > 0 ? "up" : "down" };
}

/** Heatmap / day statuses from the server, in display order. */
export const DAY_STATUS_META = {
  complete: { label: "All scheduled done", className: "bg-green-500" },
  partial: { label: "Some done", className: "bg-green-200" },
  missed: { label: "Scheduled, none done", className: "bg-red-300" },
  activity: { label: "Activity, nothing scheduled", className: "bg-sky-200" },
  none: { label: "Nothing scheduled", className: "bg-slate-100" },
  pending: { label: "Today, in progress", className: "bg-white ring-2 ring-inset ring-brand-400" },
  future: { label: "Future", className: "bg-white ring-1 ring-inset ring-slate-200" },
  beforeStart: { label: "Before you started", className: "bg-slate-50 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,#e2e8f0_3px,#e2e8f0_4px)]" },
};

/** Habit/goal day outcomes from the server, mapped onto the same calendar styles. */
export const OUTCOME_TO_STATUS = {
  completed: "complete",
  partial: "partial",
  missed: "missed",
  extra: "activity",
  open: "none",
  rest: "none",
  pending: "pending",
  future: "future",
  outside: "beforeStart",
};
