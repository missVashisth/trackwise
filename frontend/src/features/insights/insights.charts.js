// Pure transformations from Insights API data to chart series. Nothing is interpolated or invented:
// a day without data stays null (a gap), and a missed scheduled day is marked as missed, not as a
// low value. Unit-tested in insights.charts.test.js.

const isFinished = (d) => d.status !== "future" && d.status !== "beforeStart";

/** Days of the period that count so far (not future, not before you started anything). */
export function eligibleDays(daily) {
  return daily.filter(isFinished).length;
}

/** Share of scheduled items completed each day; null when nothing was scheduled (not zero). */
export function dailyCompletionSeries(daily) {
  return daily
    .filter((d) => d.status !== "future")
    .map((d) => {
      const scheduled = (d.habitsScheduled ?? 0) + (d.tasksScheduled ?? 0);
      const completed = (d.habitsCompleted ?? 0) + (d.tasksCompleted ?? 0);
      return { dateKey: d.dateKey, scheduled, completed, rate: scheduled > 0 ? Math.round((completed / scheduled) * 100) : null, activity: d.activity ?? 0 };
    });
}

/**
 * Where cumulative progress rose, stayed flat or fell. A plateau is at least `minDays` finished
 * days in a row without any gain.
 */
export function progressSegments(series, minDays = 3) {
  const days = series.filter((d) => !d.future && d.cumulative !== null && d.cumulative !== undefined);
  const plateaus = [];
  let run = [];
  let gains = 0;
  let drops = 0;
  days.forEach((d, i) => {
    const previous = i > 0 ? days[i - 1].cumulative : null;
    if (previous !== null && d.cumulative < previous) drops += 1;
    if ((d.progress ?? 0) > 0) {
      gains += 1;
      if (run.length >= minDays) plateaus.push({ from: run[0].dateKey, to: run.at(-1).dateKey, days: run.length });
      run = [];
    } else run.push(d);
  });
  if (run.length >= minDays) plateaus.push({ from: run[0].dateKey, to: run.at(-1).dateKey, days: run.length });
  return { plateaus, gainDays: gains, dropDays: drops, start: days[0]?.cumulative ?? null, end: days.at(-1)?.cumulative ?? null };
}

/** "up" | "down" | "flat" | null between the first and last known values (≥ `threshold` to count). */
export function trendDirection(values, threshold = 3) {
  const known = values.filter((v) => v !== null && v !== undefined);
  if (known.length < 2) return null;
  const diff = known.at(-1) - known[0];
  if (Math.abs(diff) < threshold) return "flat";
  return diff > 0 ? "up" : "down";
}

/**
 * Daily values of one habit for a chart:
 *   value  – the logged percentage, or the actual amount for measurable habits
 *   missed – a scheduled day that ended without progress (drawn as a marker at 0, not a value)
 * Rest days, open flexible days, days outside the habit and future days are null (gaps).
 */
export function habitValueSeries(daily, trackingMethod) {
  return daily
    .filter((d) => d.outcome !== "future" && d.outcome !== "outside")
    .map((d) => {
      const logged = d.progressPercent !== null && d.progressPercent !== undefined;
      const value = logged ? (trackingMethod === "measurable" ? d.actualValue ?? null : d.progressPercent) : null;
      return { dateKey: d.dateKey, outcome: d.outcome, value, missed: d.outcome === "missed" ? 0 : null, note: d.note ?? null };
    });
}

/** Running totals of scheduled and completed occurrences (checkbox habits). */
export function cumulativeOccurrences(daily) {
  let scheduled = 0;
  let completed = 0;
  return daily
    .filter((d) => d.outcome !== "future" && d.outcome !== "outside")
    .map((d) => {
      if (d.outcome === "completed" || d.outcome === "partial" || d.outcome === "missed") scheduled += 1;
      if (d.outcome === "completed") completed += 1;
      return { dateKey: d.dateKey, scheduled, completed };
    });
}

/** The most recent scheduled day that was missed, if any (for "last interruption"). */
export function lastInterruption(daily) {
  return [...daily].reverse().find((d) => d.outcome === "missed")?.dateKey ?? null;
}

/** Items sorted by attention: worst health first, then lowest rate/progress. */
const ATTENTION = { needsAttention: 0, struggling: 0, declining: 1, slowing: 1, behind: 2, building: 3 };
export function needingAttention(goals, habits, limit = 4) {
  const items = [
    ...goals.filter((g) => ATTENTION[g.health?.status] !== undefined).map((g) => ({ kind: "goal", id: g.goalId, title: g.title, health: g.health, rank: ATTENTION[g.health.status], value: g.overallProgress })),
    ...habits.filter((h) => ATTENTION[h.health?.status] !== undefined && h.health.status !== "building").map((h) => ({ kind: "habit", id: h.habitId, title: h.title, health: h.health, rank: ATTENTION[h.health.status], value: h.rate ?? 0 })),
  ];
  return items.sort((a, b) => a.rank - b.rank || a.value - b.value).slice(0, limit);
}

/**
 * Drop leading buckets that have no value in any series (before tracking started), keeping at
 * least `min` buckets. Later gaps stay — they are real periods with nothing to measure.
 */
export function trimLeadingEmpty(buckets, keys, min = 2) {
  const first = buckets.findIndex((b) => keys.some((k) => b[k] !== null && b[k] !== undefined));
  if (first <= 0) return buckets;
  return buckets.slice(Math.min(first, Math.max(0, buckets.length - min)));
}
