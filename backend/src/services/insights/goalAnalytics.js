// Goal analytics from the records the app already keeps — never from a task's current state.
//
// Progress (the app's own rules, see dailyProgress.service / roadmap.service):
// - overall: getProgressByGoal (passed in) — daily goals: Σ DailyProgress (capped at 100);
//   roadmap goals: completed roadmap tasks / all roadmap tasks.
// - progress made in a range: the same quantity restricted to the range — Σ DailyProgress of the
//   range's days, or roadmap tasks completed (local completion day) in the range / all × 100.
// Task occurrences (what was scheduled):
// - daily task: one occurrence per day the goal was running (start..deadline, until the day it was
//   completed) for each daily task that existed that day (created on or before it). Completed =
//   a TaskCompletion for that task and day. Tasks deleted since are unknown (their records are gone).
// - roadmap task: one occurrence on its scheduled day; completed if it has been completed (at any
//   time); "on time" if completed on or before that day.
// - Today counts only once done; days after today never count.

const { toDateKey, dateOnlyKey } = require("../../utils/date");
const { goalStatusOn } = require("../dailyProgress.service");
const { shiftKey, weekdayOf, minKey, maxKey, eachDay, trailingWeeks, trailingMonths } = require("./period");
const { WEEKDAY_NAMES, weekdayPattern } = require("./habitAnalytics");

const round2 = (n) => Number(n.toFixed(2));
const rate = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null);
const MIN_TASK_OBSERVATIONS = 3;

/** Precomputed, time-zone-resolved facts about a goal's tasks, completions and progress records. */
function indexGoal(goal, { tasks, completions, dailyProgress, baseline = 0 }, timeZone) {
  const startKey = dateOnlyKey(goal.startDate);
  const deadlineKey = goal.deadline ? dateOnlyKey(goal.deadline) : null;
  const completedKey = goal.completedAt ? toDateKey(goal.completedAt, timeZone) : null;
  const dailyTasks = tasks.filter((t) => t.kind !== "roadmap").map((t) => ({ ...t, createdKey: toDateKey(t.createdAt, timeZone) }));
  const roadmapTasks = tasks
    .filter((t) => t.kind === "roadmap")
    .map((t) => ({ ...t, completedKey: t.completedAt ? toDateKey(t.completedAt, timeZone) : null }));
  const taskIds = new Set(dailyTasks.map((t) => String(t._id)));

  const completionsByDay = new Map(); // dateKey -> Set(taskId) (existing daily tasks only)
  for (const c of completions) {
    if (!taskIds.has(String(c.taskId))) continue;
    if (!completionsByDay.has(c.dateKey)) completionsByDay.set(c.dateKey, new Set());
    completionsByDay.get(c.dateKey).add(String(c.taskId));
  }
  const progressByDay = new Map(dailyProgress.map((r) => [r.dateKey, r.dailyProgress ?? 0]));
  const roadmapDoneByDay = new Map();
  for (const t of roadmapTasks) if (t.completedKey) roadmapDoneByDay.set(t.completedKey, (roadmapDoneByDay.get(t.completedKey) ?? 0) + 1);

  return { goal, startKey, deadlineKey, completedKey, dailyTasks, roadmapTasks, completionsByDay, progressByDay, roadmapDoneByDay, baseline, isRoadmap: roadmapTasks.length > 0 };
}

const isRunning = (g, key) => key >= g.startKey && (!g.deadlineKey || key <= g.deadlineKey) && (!g.completedKey || key <= g.completedKey);

/** Scheduled vs completed task occurrences on one day ({ scheduled, completed, pending }). */
function occurrencesOn(g, key, today) {
  const day = { scheduled: 0, completed: 0, pending: 0, dailyScheduled: 0, roadmapScheduled: 0 };
  if (key > today) return day;
  if (isRunning(g, key)) {
    const done = g.completionsByDay.get(key) ?? new Set();
    for (const task of g.dailyTasks) {
      if (task.createdKey > key) continue;
      const completed = done.has(String(task._id));
      if (key === today && !completed) {
        day.pending += 1;
        continue;
      }
      day.scheduled += 1;
      day.dailyScheduled += 1;
      if (completed) day.completed += 1;
    }
  }
  for (const task of g.roadmapTasks) {
    if (task.scheduledDate !== key) continue;
    if (key === today && !task.completedKey) {
      day.pending += 1;
      continue;
    }
    day.scheduled += 1;
    day.roadmapScheduled += 1;
    if (task.completedKey) day.completed += 1;
  }
  return day;
}

/** Progress the goal gained on a day (same quantity overall progress is summed from). */
function progressOn(g, key) {
  if (g.isRoadmap) return g.roadmapTasks.length ? ((g.roadmapDoneByDay.get(key) ?? 0) / g.roadmapTasks.length) * 100 : 0;
  return g.progressByDay.get(key) ?? 0;
}

/** Task occurrences and progress over from..to. */
function rangeStats(g, from, to, today) {
  const s = { scheduled: 0, completed: 0, pendingToday: 0, progressMade: 0, activeDays: 0, roadmapOnTime: 0 };
  const weekdays = Array.from({ length: 7 }, (_, day) => ({ day, name: WEEKDAY_NAMES[day], opportunities: 0, completed: 0, missed: 0 }));
  for (const key of eachDay(from, minKey(to, today))) {
    const day = occurrencesOn(g, key, today);
    s.scheduled += day.scheduled;
    s.completed += day.completed;
    s.pendingToday += day.pending;
    const w = weekdays[weekdayOf(key)];
    w.opportunities += day.scheduled;
    w.completed += day.completed;
    w.missed += day.scheduled - day.completed;
    s.progressMade += progressOn(g, key);
    if ((g.completionsByDay.get(key)?.size ?? 0) + (g.roadmapDoneByDay.get(key) ?? 0) > 0) s.activeDays += 1;
  }
  for (const t of g.roadmapTasks) {
    if (t.scheduledDate >= from && t.scheduledDate <= to && t.completedKey && t.completedKey <= t.scheduledDate) s.roadmapOnTime += 1;
  }
  return {
    scheduled: s.scheduled,
    completed: s.completed,
    remaining: s.scheduled - s.completed,
    pendingToday: s.pendingToday,
    completionRate: rate(s.completed, s.scheduled),
    progressMade: round2(s.progressMade),
    activeDays: s.activeDays,
    roadmapOnTime: s.roadmapOnTime,
    weekdays: weekdays.map((w) => ({ ...w, rate: rate(w.completed, w.opportunities) })),
  };
}

/** Cumulative overall progress at the end of each day (capped at 100, like the overall figure). */
function cumulativeSeries(g, from, to, today) {
  // Everything recorded before `from` is the starting point: records before the loaded window
  // (baseline) plus the window's records before `from`.
  let cumulative = Math.min(100, g.baseline + [...g.progressByDay].reduce((sum, [key, value]) => (key < from ? sum + value : sum), 0));
  if (g.isRoadmap) cumulative = g.roadmapTasks.length ? (g.roadmapTasks.filter((t) => t.completedKey && t.completedKey < from).length / g.roadmapTasks.length) * 100 : 0;
  return eachDay(from, to).map((key) => {
    if (key > today) return { dateKey: key, progress: null, cumulative: null };
    const gained = progressOn(g, key);
    cumulative = Math.min(100, cumulative + gained);
    return { dateKey: key, progress: round2(gained), cumulative: round2(cumulative) };
  });
}

/** Days with any recorded activity (a daily-task completion or a roadmap task completed). */
function activityStreaks(g, historyFrom, today) {
  const start = maxKey(g.startKey, historyFrom);
  if (start > today) return { current: 0, longest: 0 };
  let run = 0;
  let longest = 0;
  let current = 0;
  const days = eachDay(start, today);
  for (const key of days) {
    const active = (g.completionsByDay.get(key)?.size ?? 0) + (g.roadmapDoneByDay.get(key) ?? 0) > 0;
    run = active ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Current: ends today, or yesterday if today has no activity yet (the day is not over).
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const key = days[i];
    const active = (g.completionsByDay.get(key)?.size ?? 0) + (g.roadmapDoneByDay.get(key) ?? 0) > 0;
    if (active) current += 1;
    else if (key !== today) break;
  }
  return { current, longest };
}

/** Roadmap phases as milestones: tasks of the phase's days, and how many are done. */
function phaseMilestones(g) {
  const phases = g.goal.roadmap?.phases ?? [];
  return phases.map((p) => {
    const tasks = g.roadmapTasks.filter((t) => t.roadmapDay >= p.startDay && t.roadmapDay <= p.endDay);
    const completed = tasks.filter((t) => t.completedKey).length;
    return { title: p.title, startDay: p.startDay, endDay: p.endDay, tasks: tasks.length, completed, done: tasks.length > 0 && completed === tasks.length };
  });
}

function recentActivity(g, limit = 10) {
  const items = [];
  const titles = new Map(g.dailyTasks.map((t) => [String(t._id), t.title]));
  for (const [dateKey, ids] of g.completionsByDay) for (const id of ids) items.push({ type: "daily", title: titles.get(id), dateKey });
  for (const t of g.roadmapTasks) if (t.completedKey) items.push({ type: "roadmap", title: t.title, dateKey: t.completedKey, scheduledDate: t.scheduledDate });
  return items.sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, limit);
}

/** Progress gained in the last 14 days vs the 14 before (for "slowing down" observations). */
function momentum(g, today) {
  const sum = (from, to) => eachDay(from, to).reduce((s, key) => s + progressOn(g, key), 0);
  const recent = sum(shiftKey(today, -13), today);
  const before = sum(shiftKey(today, -27), shiftKey(today, -14));
  return { recent14: round2(recent), previous14: round2(before), runningDays: g.startKey <= shiftKey(today, -27) };
}

/**
 * "Full pace": the progress the goal would show by the end of `key` if everything planned had been
 * done. Daily-task goals: each day of the goal is worth 100 / totalDays. Roadmap goals: the share
 * of roadmap tasks scheduled up to that day. This follows from the goal's own definition — it is a
 * reference, not a prediction.
 */
function expectedBy(g, key) {
  if (key < g.startKey) return 0;
  if (g.isRoadmap) {
    const total = g.roadmapTasks.length;
    return total ? round2((g.roadmapTasks.filter((t) => t.scheduledDate <= key).length / total) * 100) : 0;
  }
  const totalDays = g.goal.totalDays || 1;
  const last = g.deadlineKey && key > g.deadlineKey ? g.deadlineKey : key;
  const days = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${g.startKey}T00:00:00Z`)) / 86_400_000) + 1;
  return round2(Math.min(100, (days / totalDays) * 100));
}

const MIN_PACE_DAYS = 3;

/**
 * Goal health, by explicit rules in this order (first match wins):
 *   completed / upcoming / past deadline  – from the goal's status
 *   not enough data   – fewer than MIN_PACE_DAYS finished days
 *   needsAttention    – running 14+ finished days and no recorded progress in the last 14 days
 *   slowing           – last 14 days gained less than half of the 14 days before (which had progress)
 *   onTrack           – progress ≥ 80% of full pace by the end of yesterday
 *   behind            – progress below 80% of full pace
 * Today is left out of the pace (it is still in progress).
 */
function goalHealth(g, overall, status, m, today) {
  const yesterday = shiftKey(today, -1);
  const finishedDays = g.startKey > yesterday ? 0 : Math.round((Date.parse(`${minKey(yesterday, g.deadlineKey) ?? yesterday}T00:00:00Z`) - Date.parse(`${g.startKey}T00:00:00Z`)) / 86_400_000) + 1;
  const expected = expectedBy(g, yesterday);
  const pace = { expected, actual: overall, finishedDays };
  if (status === "completed") return { status: "completed", label: "Completed", tone: "positive", reason: "Marked complete.", pace };
  if (status === "upcoming") return { status: "notStarted", label: "Not started", tone: "neutral", reason: `Starts on ${g.startKey}.`, pace };
  if (status === "ended") return { status: "ended", label: "Past deadline", tone: "warning", reason: `Ended at ${Math.round(overall)}% without being marked complete.`, pace };
  if (finishedDays < MIN_PACE_DAYS || expected <= 0) return { status: "notEnoughData", label: "Not enough data", tone: "neutral", reason: `Needs at least ${MIN_PACE_DAYS} finished days.`, pace };
  if (finishedDays >= 14 && m.recent14 === 0 && overall < 100) return { status: "needsAttention", label: "Needs attention", tone: "negative", reason: "No recorded progress in the last 14 days.", pace };
  if (m.runningDays && m.previous14 > 0 && m.recent14 < m.previous14 / 2) return { status: "slowing", label: "Progress slowing", tone: "warning", reason: `${m.recent14} pts in the last 14 days vs ${m.previous14} in the 14 days before.`, pace };
  if (overall >= expected * 0.8) return { status: "onTrack", label: "On track", tone: "positive", reason: `${Math.round(overall)}% done; full pace would be ${Math.round(expected)}% by now.`, pace };
  return { status: "behind", label: "Behind pace", tone: "warning", reason: `${Math.round(overall)}% done; full pace would be ${Math.round(expected)}% by now.`, pace };
}

/** Everything about one goal for a range. */
function analyzeGoal(g, range, { overall, historyFrom, timeZone }) {
  const { from, to, prev, today } = range;
  const current = rangeStats(g, from, to, today);
  const previous = rangeStats(g, prev.from, prev.to, today);
  const enough = (s) => s.scheduled >= MIN_TASK_OBSERVATIONS;
  const trend = (buckets) =>
    buckets.map((b) => {
      const s = rangeStats(g, b.from, b.to, today);
      return { from: b.from, to: b.to, progressMade: s.progressMade, completionRate: s.completionRate, scheduled: s.scheduled, completed: s.completed };
    });

  const cumulative = cumulativeSeries(g, from, to, today);
  const m = momentum(g, today);
  const status = goalStatusOn(g.goal, today);
  return {
    goalId: g.goal._id,
    title: g.goal.title,
    color: g.goal.color ?? null,
    status,
    basis: g.isRoadmap ? "roadmap" : "daily",
    startDate: g.startKey,
    deadline: g.deadlineKey,
    completedOn: g.completedKey,
    overallProgress: overall?.overall ?? 0,
    remainingProgress: round2(100 - (overall?.overall ?? 0)),
    tasks: { daily: g.dailyTasks.length, roadmap: g.roadmapTasks.length },
    current: { ...current, weekdays: undefined },
    previous: { progressMade: previous.progressMade, completionRate: previous.completionRate, scheduled: previous.scheduled },
    change: {
      progressMade: round2(current.progressMade - previous.progressMade),
      completionRate: enough(current) && enough(previous) && current.completionRate !== null && previous.completionRate !== null ? round2(current.completionRate - previous.completionRate) : null,
    },
    enoughData: enough(current),
    weekdays: current.weekdays,
    weekdayPattern: weekdayPattern(current.weekdays),
    streaks: activityStreaks(g, historyFrom, today),
    milestones: phaseMilestones(g),
    momentum: m,
    health: goalHealth(g, overall?.overall ?? 0, status, m, today),
    series: eachDay(from, to).map((key, i) => {
      if (key > today) return { dateKey: key, future: true, expected: expectedBy(g, key) };
      const day = occurrencesOn(g, key, today);
      return { dateKey: key, scheduled: day.scheduled, completed: day.completed, missed: day.scheduled - day.completed, pending: day.pending, progress: cumulative[i].progress, cumulative: cumulative[i].cumulative, expected: expectedBy(g, key) };
    }),
    trends: { weekly: trend(trailingWeeks(minKey(to, today), 8)), monthly: trend(trailingMonths(minKey(to, today), 6)) },
    recentActivity: recentActivity(g),
    timeZone,
  };
}

module.exports = { indexGoal, analyzeGoal, goalHealth, expectedBy, rangeStats, occurrencesOn, cumulativeSeries, progressOn, isRunning, MIN_TASK_OBSERVATIONS };
