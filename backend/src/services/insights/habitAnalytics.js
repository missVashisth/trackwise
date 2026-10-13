// Habit analytics from HabitLog records, using the habit rules in habit.service.
//
// Definitions (all on the user's local calendar days):
// - An occurrence is a scheduled day (daily habits, or the chosen weekdays) inside the habit's
//   dates. Rest days, days before the start/after the end (or after archiving), and future days are
//   never counted. Today counts only once it is logged: an unlogged today is "pending", not missed.
// - Completed occurrence: the day's progress is 100% (the app's existing "done" rule). Partial days
//   are reported separately and never counted as completed.
//     completionRate  = completed occurrences / eligible occurrences × 100
//     averageProgress = Σ day progress (unlogged = 0) / eligible occurrences  (partial credit)
// - Flexible habits (N times per week/month) are measured per period: credit = Σ min(100, day %) / 100.
//   A period belongs to the reporting range that contains its last active day, so no period is
//   counted twice. The target of a period the habit only partly covers is prorated by active days.
//     targetRate = Σ min(credit, target) / Σ target over ended periods × 100
// - Weekday patterns compare rates (not counts) and need MIN_WEEKDAY_OBSERVATIONS eligible
//   occurrences on a weekday before it can be called strongest or weakest.

const { dayRequirement } = require("../habit.service");
const { shiftKey, daysBetween, weekdayOf, minKey, maxKey, weekOf, monthOf, eachDay, trailingWeeks, trailingMonths } = require("./period");

const MIN_WEEKDAY_OBSERVATIONS = 4;
const MIN_OBSERVATIONS_FOR_RATE = 3;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const round2 = (n) => Number(n.toFixed(2));
const rate = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null);
const isFlexible = (habit) => habit.schedule.type === "timesPerWeek" || habit.schedule.type === "timesPerMonth";

/** The habit's last countable day: its end date, the day it was archived, whichever is first. */
function effectiveEnd(habit, archivedKey) {
  return minKey(habit.endDate, archivedKey);
}

/** Day outcome for analytics: future | outside | rest | pending | completed | partial | missed | open | extra */
function dayOutcome(habit, key, log, today, archivedKey) {
  if (key > today) return "future";
  const end = effectiveEnd(habit, archivedKey);
  if (key < habit.startDate || (end && key > end)) return "outside";
  const requirement = dayRequirement(habit, key);
  const p = log?.progressPercent ?? null;
  if (requirement === "flexible") return p === null ? (key === today ? "pending" : "open") : p >= 100 ? "completed" : p > 0 ? "partial" : "open";
  if (requirement === "rest") return p !== null && p > 0 ? "extra" : "rest";
  if (p === null) return key === today ? "pending" : "missed";
  if (p >= 100) return "completed";
  if (p > 0) return "partial";
  return key === today ? "pending" : "missed"; // logged 0% on a finished day is a miss
}

/** Fixed-schedule occurrences between from and to. */
function fixedStats(habit, logsByDay, from, to, today, archivedKey) {
  const s = { opportunities: 0, completed: 0, partial: 0, missed: 0, pending: 0, extraDays: 0, progressSum: 0 };
  const weekdays = Array.from({ length: 7 }, (_, day) => ({ day, name: WEEKDAY_NAMES[day], opportunities: 0, completed: 0, missed: 0 }));
  for (const key of eachDay(from, to)) {
    const log = logsByDay.get(key);
    const outcome = dayOutcome(habit, key, log, today, archivedKey);
    if (outcome === "extra") s.extraDays += 1;
    if (outcome === "pending") s.pending += 1;
    if (outcome !== "completed" && outcome !== "partial" && outcome !== "missed") continue;
    const wd = weekdays[weekdayOf(key)];
    s.opportunities += 1;
    wd.opportunities += 1;
    s.progressSum += Math.min(100, log?.progressPercent ?? 0);
    if (outcome === "completed") {
      s.completed += 1;
      wd.completed += 1;
    } else if (outcome === "partial") s.partial += 1;
    else {
      s.missed += 1;
      wd.missed += 1;
    }
  }
  return {
    kind: "fixed",
    opportunities: s.opportunities,
    completed: s.completed,
    partial: s.partial,
    missed: s.missed,
    pendingToday: s.pending > 0,
    extraDays: s.extraDays,
    completionRate: rate(s.completed, s.opportunities),
    averageProgress: s.opportunities ? round2(s.progressSum / s.opportunities) : null,
    rate: rate(s.completed, s.opportunities),
    observations: s.opportunities,
    weekdays: weekdays.map((w) => ({ ...w, rate: rate(w.completed, w.opportunities) })),
  };
}

/** Flexible periods whose last active day falls in from..to. */
function flexibleStats(habit, logsByDay, from, to, today, archivedKey) {
  const ofPeriod = habit.schedule.type === "timesPerWeek" ? weekOf : monthOf;
  const end = effectiveEnd(habit, archivedKey);
  const periods = [];
  for (let cursor = ofPeriod(from); cursor.from <= to; cursor = ofPeriod(shiftKey(cursor.to, 1))) {
    const activeFrom = maxKey(cursor.from, habit.startDate);
    const activeTo = minKey(cursor.to, end);
    if (activeFrom > activeTo || activeTo < from || activeTo > to) continue; // not active, or owned by another range
    if (activeFrom > today) continue; // not started yet
    const periodDays = daysBetween(cursor.from, cursor.to) + 1;
    const activeDays = daysBetween(activeFrom, activeTo) + 1;
    const target = round2((habit.schedule.timesPerPeriod * activeDays) / periodDays);
    let credit = 0;
    let sessions = 0;
    for (const key of eachDay(activeFrom, minKey(activeTo, today))) {
      const p = logsByDay.get(key)?.progressPercent ?? 0;
      credit += Math.min(100, p) / 100;
      if (p >= 100) sessions += 1;
    }
    periods.push({ from: cursor.from, to: cursor.to, activeFrom, activeTo, target, credit: round2(credit), sessions, ended: activeTo < today, met: credit >= target - 1e-9 });
  }
  const ended = periods.filter((p) => p.ended);
  const targetSum = ended.reduce((sum, p) => sum + p.target, 0);
  const attained = ended.reduce((sum, p) => sum + Math.min(p.credit, p.target), 0);
  const current = periods.find((p) => !p.ended) ?? null;
  return {
    kind: "flexible",
    periodType: habit.schedule.type === "timesPerWeek" ? "week" : "month",
    periods,
    periodsEnded: ended.length,
    periodsMet: ended.filter((p) => p.met).length,
    targetRate: targetSum > 0 ? round2((attained / targetSum) * 100) : null,
    rate: targetSum > 0 ? round2((attained / targetSum) * 100) : null,
    observations: ended.length,
    current,
  };
}

function stats(habit, logsByDay, from, to, today, archivedKey) {
  return isFlexible(habit) ? flexibleStats(habit, logsByDay, from, to, today, archivedKey) : fixedStats(habit, logsByDay, from, to, today, archivedKey);
}

/**
 * Streaks over the loaded history (from `historyFrom`).
 * Fixed: consecutive completed occurrences; rest days do not break a streak; an unlogged today does
 * not break it either (the day is not over). Flexible: consecutive periods whose target was met.
 */
function streaks(habit, logsByDay, today, historyFrom, archivedKey) {
  const start = maxKey(habit.startDate, historyFrom);
  const end = minKey(effectiveEnd(habit, archivedKey), today);
  if (!end || start > end) return { unit: isFlexible(habit) ? habit.schedule.type === "timesPerWeek" ? "weeks" : "months" : "occurrences", current: 0, longest: 0, truncated: habit.startDate < historyFrom };

  if (isFlexible(habit)) {
    const { periods } = flexibleStats(habit, logsByDay, start, end === today ? (habit.schedule.type === "timesPerWeek" ? weekOf : monthOf)(today).to : end, today, archivedKey);
    let run = 0;
    let longest = 0;
    for (const p of periods.filter((x) => x.ended)) {
      run = p.met ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    const current = periods.find((p) => !p.ended);
    let currentRun = run;
    if (current?.met) currentRun += 1;
    return { unit: habit.schedule.type === "timesPerWeek" ? "weeks" : "months", current: currentRun, longest: Math.max(longest, currentRun), truncated: habit.startDate < historyFrom };
  }

  let run = 0;
  let longest = 0;
  for (const key of eachDay(start, end)) {
    const outcome = dayOutcome(habit, key, logsByDay.get(key), today, archivedKey);
    if (outcome === "completed") run += 1;
    else if (outcome === "partial" || outcome === "missed") run = 0;
    longest = Math.max(longest, run);
  }
  return { unit: "occurrences", current: run, longest, truncated: habit.startDate < historyFrom };
}

/** Totals for measurable habits over logged days in the range. */
function numericTotals(habit, logs, fixed) {
  if (habit.trackingMethod !== "measurable") return null;
  const values = logs.filter((l) => l.actualValue !== null && l.actualValue !== undefined);
  const total = values.reduce((sum, l) => sum + l.actualValue, 0);
  return {
    unit: habit.unit,
    target: habit.targetValue,
    total: round2(total),
    loggedDays: values.length,
    averagePerLoggedDay: values.length ? round2(total / values.length) : null,
    averagePerOccurrence: fixed?.opportunities ? round2(total / fixed.opportunities) : null,
  };
}

/** Strongest/weakest weekday by completion rate, only among weekdays with enough occurrences. */
function weekdayPattern(weekdays) {
  if (!weekdays) return { enoughData: false, minObservations: MIN_WEEKDAY_OBSERVATIONS, best: null, worst: null };
  const eligible = weekdays.filter((w) => w.opportunities >= MIN_WEEKDAY_OBSERVATIONS);
  if (eligible.length < 2) return { enoughData: false, minObservations: MIN_WEEKDAY_OBSERVATIONS, best: null, worst: null };
  const sorted = [...eligible].sort((a, b) => b.rate - a.rate || b.opportunities - a.opportunities);
  const best = sorted[0];
  const worst = sorted.at(-1);
  const distinct = best.rate - worst.rate >= 15; // at least 15 points apart to call it a pattern
  return { enoughData: true, minObservations: MIN_WEEKDAY_OBSERVATIONS, best: distinct ? best : null, worst: distinct ? worst : null };
}

/** Pooled weekday stats across habits (rates over all their occurrences on that weekday). */
function poolWeekdays(list) {
  const pooled = Array.from({ length: 7 }, (_, day) => ({ day, name: WEEKDAY_NAMES[day], opportunities: 0, completed: 0, missed: 0 }));
  for (const weekdays of list) {
    for (const w of weekdays ?? []) {
      pooled[w.day].opportunities += w.opportunities;
      pooled[w.day].completed += w.completed;
      pooled[w.day].missed += w.missed;
    }
  }
  return pooled.map((w) => ({ ...w, rate: rate(w.completed, w.opportunities) }));
}

/**
 * Habit health, by explicit rules (first match wins):
 *   archived; notEnoughData (fewer than 5 eligible days, or no ended period for flexible habits);
 *   declining (rate fell ≥ 15 points vs the previous period, both with enough data);
 *   strong (≥ 80%); struggling (< 50%); building (otherwise).
 */
function habitHealth(current, change, archived) {
  if (archived) return { status: "archived", label: "Archived", tone: "neutral" };
  const enough = current.kind === "fixed" ? current.opportunities >= 5 : current.periodsEnded >= 1;
  if (!enough || current.rate === null) return { status: "notEnoughData", label: "Not enough data", tone: "neutral" };
  if (change !== null && change <= -15) return { status: "declining", label: "Declining", tone: "negative" };
  if (current.rate >= 80) return { status: "strong", label: "Strong", tone: "positive" };
  if (current.rate < 50) return { status: "struggling", label: "Struggling", tone: "negative" };
  return { status: "building", label: "Building", tone: "warning" };
}

/**
 * Everything about one habit for a range. `logs` must cover at least historyFrom..range.to
 * (and the trend window); `archivedKey` is the local day it was archived, if any.
 */
function analyzeHabit(habit, logs, range, { historyFrom, archivedKey = null } = {}) {
  const { from, to, prev, today } = range;
  const logsByDay = new Map(logs.map((l) => [l.dateKey, l]));
  const current = stats(habit, logsByDay, from, to, today, archivedKey);
  const previous = stats(habit, logsByDay, prev.from, prev.to, today, archivedKey);
  const inRange = logs.filter((l) => l.dateKey >= from && l.dateKey <= minKey(to, today));

  const trend = (buckets) =>
    buckets.map((b) => {
      const s = stats(habit, logsByDay, b.from, b.to, today, archivedKey);
      return { from: b.from, to: b.to, rate: s.rate, observations: s.observations, ...(s.kind === "fixed" ? { completed: s.completed, opportunities: s.opportunities } : { periodsMet: s.periodsMet, periodsEnded: s.periodsEnded }) };
    });

  const enough = (s) => s.observations >= (s.kind === "fixed" ? MIN_OBSERVATIONS_FOR_RATE : 1);
  // Flexible habits: the period containing the range's last counted day, for context (a monthly
  // habit viewed by week has no period that ends inside the week).
  let currentPeriod = null;
  if (current.kind === "flexible") {
    const containing = (habit.schedule.type === "timesPerWeek" ? weekOf : monthOf)(minKey(to, today));
    currentPeriod = flexibleStats(habit, logsByDay, containing.from, containing.to, today, archivedKey).periods[0] ?? null;
  }
  const change = enough(current) && enough(previous) && current.rate !== null && previous.rate !== null ? round2(current.rate - previous.rate) : null;

  return {
    habitId: habit._id,
    title: habit.title,
    icon: habit.icon,
    color: habit.color,
    schedule: habit.schedule,
    trackingMethod: habit.trackingMethod,
    startDate: habit.startDate,
    endDate: habit.endDate,
    archived: Boolean(archivedKey),
    current,
    currentPeriod,
    previous: { rate: previous.rate, observations: previous.observations },
    change,
    enoughData: enough(current),
    health: habitHealth(current, change, Boolean(archivedKey)),
    streaks: streaks(habit, logsByDay, today, historyFrom, archivedKey),
    weekdayPattern: weekdayPattern(current.kind === "fixed" ? current.weekdays : null),
    numeric: numericTotals(habit, inRange, current.kind === "fixed" ? current : null),
    daily: eachDay(from, to).map((key) => {
      const log = logsByDay.get(key);
      return { dateKey: key, outcome: dayOutcome(habit, key, log, today, archivedKey), progressPercent: log?.progressPercent ?? null, actualValue: log?.actualValue ?? null, note: log?.note || null };
    }),
    trends: { weekly: trend(trailingWeeks(minKey(to, today), 8)), monthly: trend(trailingMonths(minKey(to, today), 6)) },
  };
}

module.exports = {
  MIN_WEEKDAY_OBSERVATIONS,
  MIN_OBSERVATIONS_FOR_RATE,
  WEEKDAY_NAMES,
  analyzeHabit,
  habitHealth,
  dayOutcome,
  weekdayPattern,
  poolWeekdays,
  isFlexible,
};
