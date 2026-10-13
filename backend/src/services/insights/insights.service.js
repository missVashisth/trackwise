// Insights: loads the user's records once per request (bounded by date) and builds the overview,
// goal and habit reports. Every query is scoped to the authenticated user.
//
// Query budget per request: goals, tasks, task completions, daily-progress records (+1 aggregate
// for the pre-window baseline), habits, habit logs, and the existing progress service — no
// per-goal or per-habit queries.

const mongoose = require("mongoose");
const Goal = require("../../models/goal.model");
const Task = require("../../models/task.model");
const TaskCompletion = require("../../models/taskCompletion.model");
const DailyProgress = require("../../models/dailyProgress.model");
const Habit = require("../../models/habit.model");
const HabitLog = require("../../models/habitLog.model");
const { getProgressByGoal } = require("../dailyProgress.service");
const { getTodayDateKey, toDateKey, dateOnlyKey } = require("../../utils/date");
const { parsePeriod, shiftKey, minKey, maxKey, eachDay, weekdayOf, trailingWeeks, trailingMonths } = require("./period");
const { analyzeHabit, poolWeekdays, weekdayPattern, WEEKDAY_NAMES } = require("./habitAnalytics");
const { indexGoal, analyzeGoal, occurrencesOn } = require("./goalAnalytics");
const { overviewNarrative, habitNarrative, goalNarrative, thresholds } = require("./narrative");

const ACTIVITY_LOOKBACK_DAYS = 365; // streaks look back at most this far
const HABIT_LOOKBACK_DAYS = 730;
const TOP_GOALS_IN_CHART = 5;

const round2 = (n) => Number(n.toFixed(2));
const rate = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null);

const DEFINITIONS = {
  habitCompletionRate: "Completed scheduled occurrences ÷ eligible scheduled occurrences × 100, for habits with a fixed schedule. A day counts as completed at 100% progress; partial days are shown separately. Rest days, future days, days outside a habit's dates and today (until it is logged) are not counted.",
  habitAverageProgress: "Average progress over eligible scheduled days, with unlogged days as 0% — partial days count partly.",
  flexibleTargetRate: "For habits with a weekly or monthly target: progress toward the target in periods that have ended (partial days count partly; targets of partly covered periods are prorated).",
  taskCompletionRate: "Completed scheduled task occurrences ÷ scheduled task occurrences × 100. Daily tasks are scheduled every day their goal runs; roadmap tasks on their scheduled day; to-dos on their due day. Today counts only once done.",
  overallGoalProgress: "Each goal's own progress as shown in the app (daily-task goals: sum of daily progress; roadmap goals: completed ÷ all roadmap tasks). The average covers active goals only.",
  progressMade: "Goal progress gained in the period, using the same rule as overall progress.",
  activityStreak: "Consecutive days with at least one recorded completion or habit progress. A day without activity breaks the streak, except today while it is in progress.",
  habitStreak: "Consecutive completed scheduled occurrences (rest days don't break it), or for weekly/monthly targets consecutive periods whose target was met.",
  weekdayPattern: `Weekdays are compared by completion rate, not by count, and only with at least ${thresholds.MIN_WEEKDAY_OBSERVATIONS} scheduled items on that weekday in the period and a spread of at least 15 points.`,
  periods: "Weeks run Monday to Sunday; months are calendar months; all days are your local calendar days. The previous period is the week or month before (or the same number of days before a custom range).",
};

// ---------------------------------------------------------------- loading

async function loadData(userId, { windowFrom, goalId = null, habitId = null, include = { goals: true, habits: true } }) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const goalFilter = goalId ? { _id: goalId, user: uid } : { user: uid };
  const byGoal = goalId ? { goalId } : {};

  const [goals, tasks, completions, dailyProgress, baselines, habits, habitLogs] = await Promise.all([
    include.goals ? Goal.find(goalFilter).lean() : [],
    include.goals || include.todos ? Task.find({ userId: uid, ...byGoal }, "goalId kind title createdAt completedAt scheduledDate dueDate roadmapDay").lean() : [],
    include.goals ? TaskCompletion.find({ userId: uid, ...byGoal, dateKey: { $gte: windowFrom } }, "taskId goalId dateKey").lean() : [],
    include.goals ? DailyProgress.find({ userId: uid, ...byGoal, dateKey: { $gte: windowFrom } }, "goalId dateKey dailyProgress").lean() : [],
    include.goals
      ? DailyProgress.aggregate([
          { $match: { userId: uid, ...(goalId ? { goalId: new mongoose.Types.ObjectId(String(goalId)) } : {}), $or: [{ dateKey: { $lt: windowFrom } }, { dateKey: { $exists: false } }] } },
          { $group: { _id: "$goalId", total: { $sum: "$dailyProgress" } } },
        ])
      : [],
    include.habits ? Habit.find(habitId ? { _id: habitId, userId: uid } : { userId: uid }).lean() : [],
    include.habits ? HabitLog.find({ userId: uid, ...(habitId ? { habitId } : {}), dateKey: { $gte: windowFrom } }, "habitId dateKey progressPercent actualValue note").lean() : [],
  ]);
  return { goals, tasks, completions, dailyProgress, baselines, habits, habitLogs };
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = String(item[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function windowFor(range, today) {
  const end = minKey(range.to, today);
  return {
    trendStart: minKey(trailingWeeks(end, 8)[0].from, trailingMonths(end, 6)[0].from),
    historyFrom: shiftKey(today, -ACTIVITY_LOOKBACK_DAYS),
    habitHistoryFrom: shiftKey(today, -HABIT_LOOKBACK_DAYS),
  };
}

const archivedKeyOf = (habit, timeZone) => (habit.archivedAt ? toDateKey(habit.archivedAt, timeZone) : null);
const habitActiveIn = (habit, from, to, today, archivedKey) =>
  habit.startDate <= minKey(to, today) && (!habit.endDate || habit.endDate >= from) && (!archivedKey || archivedKey >= from);
const goalOverlaps = (g, from, to) => g.startKey <= to && (!g.deadlineKey || g.deadlineKey >= from) && (!g.completedKey || g.completedKey >= from);

// ---------------------------------------------------------------- to-dos

function todoStats(todos, from, to, today, timeZone) {
  const s = { scheduled: 0, completed: 0, pendingToday: 0, byDay: new Map() };
  for (const t of todos) {
    if (!t.dueDate || t.dueDate < from || t.dueDate > minKey(to, today)) continue;
    if (t.dueDate === today && !t.completedAt) {
      s.pendingToday += 1;
      continue;
    }
    s.scheduled += 1;
    const day = s.byDay.get(t.dueDate) ?? { scheduled: 0, completed: 0 };
    day.scheduled += 1;
    if (t.completedAt) {
      s.completed += 1;
      day.completed += 1;
    }
    s.byDay.set(t.dueDate, day);
  }
  s.completedKeys = todos.filter((t) => t.completedAt).map((t) => toDateKey(t.completedAt, timeZone));
  return s;
}

// ---------------------------------------------------------------- overview

async function getOverview(userId, timeZone, query) {
  const today = getTodayDateKey(timeZone);
  const { range, error } = parsePeriod(query, today);
  if (error) return { error };
  const { trendStart, historyFrom, habitHistoryFrom } = windowFor(range, today);
  const windowFrom = minKey(range.prev.from, trendStart, historyFrom, habitHistoryFrom);

  const [data, progressByGoal] = await Promise.all([loadData(userId, { windowFrom }), getProgressByGoal(userId, undefined, timeZone)]);

  // Goals
  const tasksByGoal = groupBy(data.tasks.filter((t) => t.goalId), "goalId");
  const completionsByGoal = groupBy(data.completions, "goalId");
  const progressRecordsByGoal = groupBy(data.dailyProgress, "goalId");
  const baselineByGoal = new Map(data.baselines.map((b) => [String(b._id), b.total]));
  const indexes = data.goals.map((goal) =>
    indexGoal(goal, { tasks: tasksByGoal.get(String(goal._id)) ?? [], completions: completionsByGoal.get(String(goal._id)) ?? [], dailyProgress: progressRecordsByGoal.get(String(goal._id)) ?? [], baseline: baselineByGoal.get(String(goal._id)) ?? 0 }, timeZone)
  );
  const goalReports = indexes.map((g) => ({ g, report: analyzeGoal(g, range, { overall: progressByGoal.get(String(g.goal._id)), historyFrom, timeZone }) }));

  const statusCounts = { active: 0, upcoming: 0, ended: 0, completed: 0 };
  for (const { report } of goalReports) statusCounts[report.status] += 1;
  const completedInRange = indexes.filter((g) => g.completedKey && g.completedKey >= range.from && g.completedKey <= range.to).length;
  const activeGoals = goalReports.filter(({ report }) => report.status === "active");

  // Habits
  const logsByHabit = groupBy(data.habitLogs, "habitId");
  // Habits active at some point in the current or previous period (archived ones up to the day
  // they were archived).
  const habitEntries = data.habits
    .map((habit) => ({ habit, archivedKey: archivedKeyOf(habit, timeZone) }))
    .filter(({ habit, archivedKey }) => habitActiveIn(habit, range.prev.from, range.to, today, archivedKey))
    .map((entry) => ({ ...entry, report: analyzeHabit(entry.habit, logsByHabit.get(String(entry.habit._id)) ?? [], range, { historyFrom: habitHistoryFrom, archivedKey: entry.archivedKey }) }));
  const habitReports = habitEntries.map((e) => e.report);
  const habitsInRange = habitEntries.filter((e) => habitActiveIn(e.habit, range.from, range.to, today, e.archivedKey)).map((e) => e.report);

  // To-dos
  const todos = data.tasks.filter((t) => !t.goalId);
  const todoNow = todoStats(todos, range.from, range.to, today, timeZone);
  const todoPrev = todoStats(todos, range.prev.from, range.prev.to, today, timeZone);

  // Pooled figures
  const fixedNow = habitReports.filter((h) => h.current.kind === "fixed");
  const sum = (list, pick) => list.reduce((s, x) => s + pick(x), 0);
  const habitObs = sum(fixedNow, (h) => h.current.opportunities);
  const habitDone = sum(fixedNow, (h) => h.current.completed);
  const fixedPrevStats = fixedNow.map((h) => ({ rate: h.previous.rate, obs: h.previous.observations }));
  const habitObsPrev = sum(fixedPrevStats, (x) => x.obs);
  const habitDonePrev = sum(fixedPrevStats, (x) => ((x.rate ?? 0) * x.obs) / 100);
  const flexible = habitReports.filter((h) => h.current.kind === "flexible");
  const flexEnded = flexible.flatMap((h) => h.current.periods.filter((p) => p.ended));
  const flexibleTargetRate = flexEnded.length ? round2((sum(flexEnded, (p) => Math.min(p.credit, p.target)) / sum(flexEnded, (p) => p.target)) * 100) : null;

  const taskScheduled = sum(goalReports, (x) => x.report.current.scheduled) + todoNow.scheduled;
  const taskCompleted = sum(goalReports, (x) => x.report.current.completed) + todoNow.completed;
  const taskScheduledPrev = sum(goalReports, (x) => x.report.previous.scheduled) + todoPrev.scheduled;
  const taskCompletedPrev = sum(goalReports, (x) => ((x.report.previous.completionRate ?? 0) * x.report.previous.scheduled) / 100) + todoPrev.completed;
  const pendingToday = sum(goalReports, (x) => x.report.current.pendingToday) + todoNow.pendingToday;

  // Weekday pattern across habits, goal tasks and to-dos (rates, not counts)
  const todoWeekdays = Array.from({ length: 7 }, (_, day) => ({ day, opportunities: 0, completed: 0, missed: 0 }));
  for (const [key, d] of todoNow.byDay) {
    const w = todoWeekdays[weekdayOf(key)];
    w.opportunities += d.scheduled;
    w.completed += d.completed;
    w.missed += d.scheduled - d.completed;
  }
  const pooledWeekdays = poolWeekdays([...fixedNow.map((h) => h.current.weekdays), ...goalReports.map((x) => x.report.weekdays), todoWeekdays]);

  // Activity days (any recorded completion or habit progress) for the overall streak
  const activity = new Map();
  const bump = (key, n = 1) => activity.set(key, (activity.get(key) ?? 0) + n);
  for (const c of data.completions) bump(c.dateKey);
  for (const t of data.tasks) if (t.kind === "roadmap" && t.completedAt) bump(toDateKey(t.completedAt, timeZone));
  for (const key of todoNow.completedKeys) bump(key);
  for (const l of data.habitLogs) if (l.progressPercent > 0) bump(l.dateKey);
  const activityStreak = streakOf(activity, maxKey(historyFrom, firstStart(indexes, data.habits, todos, timeZone) ?? today), today);
  const activeDays = (from, to) => eachDay(from, minKey(to, today)).filter((k) => (activity.get(k) ?? 0) > 0).length;

  // Day-by-day series and heatmap
  const firstDay = firstStart(indexes, data.habits, todos, timeZone);
  const daily = eachDay(range.from, range.to).map((key) => {
    if (key > today) return { dateKey: key, status: "future" };
    let habitsScheduled = 0;
    let habitsCompleted = 0;
    let habitsPartial = 0;
    let habitsPending = 0;
    let flexibleSessions = 0;
    for (const h of habitReports) {
      const day = h.daily.find((d) => d.dateKey === key);
      if (!day) continue;
      if (h.current.kind === "flexible") {
        if (day.outcome === "completed") flexibleSessions += 1;
        continue;
      }
      if (day.outcome === "pending") habitsPending += 1;
      if (day.outcome === "completed" || day.outcome === "partial" || day.outcome === "missed") habitsScheduled += 1;
      if (day.outcome === "completed") habitsCompleted += 1;
      if (day.outcome === "partial") habitsPartial += 1;
    }
    let tasksScheduled = 0;
    let tasksCompleted = 0;
    let tasksPending = 0;
    for (const g of indexes) {
      const day = occurrencesOn(g, key, today);
      tasksScheduled += day.scheduled;
      tasksCompleted += day.completed;
      tasksPending += day.pending;
    }
    const todoDay = todoNow.byDay.get(key);
    if (todoDay) {
      tasksScheduled += todoDay.scheduled;
      tasksCompleted += todoDay.completed;
    }
    const scheduled = habitsScheduled + tasksScheduled;
    const completed = habitsCompleted + tasksCompleted;
    const pending = habitsPending + tasksPending;
    let status;
    if (firstDay && key < firstDay) status = "beforeStart";
    else if (scheduled === 0 && pending === 0) status = (activity.get(key) ?? 0) > 0 ? "activity" : "none";
    else if (key === today && pending > 0) status = "pending";
    else if (completed === scheduled) status = "complete";
    else if (completed > 0 || habitsPartial > 0) status = "partial";
    else status = "missed";
    return {
      dateKey: key,
      status,
      habitsScheduled,
      habitsCompleted,
      habitsPartial,
      flexibleSessions,
      tasksScheduled,
      tasksCompleted,
      tasksMissed: tasksScheduled - tasksCompleted,
      pending,
      activity: activity.get(key) ?? 0,
      habitRate: rate(habitsCompleted, habitsScheduled),
      completionRate: rate(completed, scheduled),
    };
  });

  // Weekly / monthly comparisons (pooled over items)
  const end = minKey(range.to, today);
  const comparison = (buckets, pick) =>
    buckets.map((b, i) => {
      const habitParts = fixedNow.map((h) => pick(h.trends)[i]).filter(Boolean);
      const goalParts = goalReports.map((x) => pick(x.report.trends)[i]).filter(Boolean);
      const todo = todoStats(todos, b.from, b.to, today, timeZone);
      const hObs = sum(habitParts, (p) => p.opportunities ?? 0);
      const hDone = sum(habitParts, (p) => p.completed ?? 0);
      const tObs = sum(goalParts, (p) => p.scheduled) + todo.scheduled;
      const tDone = sum(goalParts, (p) => p.completed) + todo.completed;
      return { from: b.from, to: b.to, habitRate: rate(hDone, hObs), habitOccurrences: hObs, taskRate: rate(tDone, tObs), taskOccurrences: tObs, activeDays: activeDays(b.from, b.to) };
    });

  // Goal progress lines: active goals with the most progress in the window
  const chartGoals = goalReports
    .filter(({ report }) => report.status !== "upcoming")
    .sort((a, b) => b.report.current.progressMade - a.report.current.progressMade || b.report.overallProgress - a.report.overallProgress)
    .slice(0, TOP_GOALS_IN_CHART);

  const pooled = {
    habitRate: rate(habitDone, habitObs),
    habitObs,
    habitMissed: sum(fixedNow, (h) => h.current.missed),
    habitRatePrev: rate(habitDonePrev, habitObsPrev),
    habitObsPrev,
    taskRate: rate(taskCompleted, taskScheduled),
    taskObs: taskScheduled,
    taskRatePrev: rate(taskCompletedPrev, taskScheduledPrev),
    taskObsPrev: taskScheduledPrev,
    weekdayPattern: weekdayPattern(pooledWeekdays),
    activityStreak,
  };

  return {
    report: {
      range,
      definitions: DEFINITIONS,
      thresholds,
      summary: {
        goals: {
          ...statusCounts,
          paused: null, // goals have no paused state in this app
          completedInRange,
          averageProgressActive: activeGoals.length ? round2(sum(activeGoals, (x) => x.report.overallProgress) / activeGoals.length) : null,
        },
        habits: {
          tracked: habitsInRange.length,
          completionRate: pooled.habitRate,
          averageProgress: habitObs ? round2(sum(fixedNow, (h) => (h.current.averageProgress ?? 0) * h.current.opportunities) / habitObs) : null,
          occurrences: habitObs,
          completed: habitDone,
          partial: sum(fixedNow, (h) => h.current.partial),
          missed: pooled.habitMissed,
          flexibleTargetRate,
          previousRate: pooled.habitRatePrev,
          change: pooled.habitRate !== null && pooled.habitRatePrev !== null && habitObs >= thresholds.MIN_RATE_OBSERVATIONS && habitObsPrev >= thresholds.MIN_RATE_OBSERVATIONS ? round2(pooled.habitRate - pooled.habitRatePrev) : null,
        },
        tasks: {
          scheduled: taskScheduled,
          completed: taskCompleted,
          remaining: taskScheduled - taskCompleted,
          pendingToday,
          completionRate: pooled.taskRate,
          previousRate: pooled.taskRatePrev,
          change: pooled.taskRate !== null && pooled.taskRatePrev !== null && taskScheduled >= thresholds.MIN_RATE_OBSERVATIONS && taskScheduledPrev >= thresholds.MIN_RATE_OBSERVATIONS ? round2(pooled.taskRate - pooled.taskRatePrev) : null,
          breakdown: {
            goalTasks: { scheduled: sum(goalReports, (x) => x.report.current.scheduled), completed: sum(goalReports, (x) => x.report.current.completed) },
            todos: { scheduled: todoNow.scheduled, completed: todoNow.completed },
          },
        },
        streak: activityStreak,
        activeDays: { current: activeDays(range.from, range.to), previous: activeDays(range.prev.from, range.prev.to) },
      },
      charts: {
        daily,
        goalProgress: chartGoals.map(({ report }) => ({ goalId: report.goalId, title: report.title, color: report.color, series: report.series.filter((d) => !d.future).map((d) => ({ dateKey: d.dateKey, cumulative: d.cumulative })) })),
        weekly: comparison(trailingWeeks(end, 8), (t) => t.weekly),
        monthly: comparison(trailingMonths(end, 6), (t) => t.monthly),
        habitConsistency: habitsInRange.map((h) => ({ habitId: h.habitId, title: h.title, color: h.color, kind: h.current.kind, rate: h.current.rate, observations: h.current.observations, completed: h.current.completed ?? h.current.periodsMet, total: h.current.opportunities ?? h.current.periodsEnded })),
        weekdays: pooledWeekdays,
      },
      goals: goalReports
        .filter(({ g }) => goalOverlaps(g, range.from, range.to))
        .map(({ report }) => ({
          goalId: report.goalId,
          title: report.title,
          color: report.color,
          status: report.status,
          basis: report.basis,
          overallProgress: report.overallProgress,
          progressMade: report.current.progressMade,
          previousProgressMade: report.previous.progressMade,
          completionRate: report.current.completionRate,
          scheduled: report.current.scheduled,
          completed: report.current.completed,
          health: report.health,
          // Cumulative overall progress per finished day of the period (for small trend lines).
          progressSeries: report.series.filter((d) => !d.future).map((d) => ({ dateKey: d.dateKey, cumulative: d.cumulative })),
        })),
      habits: habitsInRange.map((h) => ({
        habitId: h.habitId,
        title: h.title,
        icon: h.icon,
        color: h.color,
        kind: h.current.kind,
        trackingMethod: h.trackingMethod,
        rate: h.current.rate,
        observations: h.current.observations,
        completed: h.current.kind === "fixed" ? h.current.completed : h.current.periodsMet,
        total: h.current.kind === "fixed" ? h.current.opportunities : h.current.periodsEnded,
        previousRate: h.previous.rate,
        change: h.change,
        streak: h.streaks,
        archived: h.archived,
        health: h.health,
        // Completion per week over the last 8 weeks (null = nothing to measure that week).
        weeklyRates: h.trends.weekly.map((w) => ({ from: w.from, rate: w.rate })),
      })),
      narrative: overviewNarrative({ range, habits: habitsInRange, goals: goalReports.map((x) => x.report), pooled }),
    },
  };
}

/** Earliest start of anything the user tracks (goals, habits, to-dos), as a day key. */
function firstStart(indexes, habits, todos, timeZone) {
  const keys = [
    ...indexes.map((g) => g.startKey),
    ...habits.map((h) => h.startDate),
    ...todos.map((t) => t.dueDate ?? toDateKey(t.createdAt, timeZone)),
  ].filter(Boolean);
  return keys.length ? keys.sort()[0] : null;
}

function streakOf(activity, from, today) {
  let run = 0;
  let longest = 0;
  const days = from <= today ? eachDay(from, today) : [];
  for (const key of days) {
    run = (activity.get(key) ?? 0) > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if ((activity.get(days[i]) ?? 0) > 0) current += 1;
    else if (days[i] !== today) break;
  }
  return { current, longest, lookbackDays: ACTIVITY_LOOKBACK_DAYS };
}

// ---------------------------------------------------------------- one goal / one habit

async function getGoalReport(userId, timeZone, goalId, query) {
  const today = getTodayDateKey(timeZone);
  const { range, error } = parsePeriod(query, today);
  if (error) return { error };
  const { trendStart, historyFrom } = windowFor(range, today);
  const windowFrom = minKey(range.prev.from, trendStart, historyFrom);

  const data = await loadData(userId, { windowFrom, goalId, include: { goals: true, habits: false } });
  const goal = data.goals[0];
  if (!goal) return { notFound: true };
  const progressByGoal = await getProgressByGoal(userId, [goal._id], timeZone);
  const g = indexGoal(goal, { tasks: data.tasks, completions: data.completions, dailyProgress: data.dailyProgress, baseline: data.baselines[0]?.total ?? 0 }, timeZone);
  const report = analyzeGoal(g, range, { overall: progressByGoal.get(String(goal._id)), historyFrom, timeZone });
  return { report: { range, definitions: DEFINITIONS, thresholds, goal: report, narrative: goalNarrative(report, range) } };
}

async function getHabitReport(userId, timeZone, habitId, query) {
  const today = getTodayDateKey(timeZone);
  const { range, error } = parsePeriod(query, today);
  if (error) return { error };
  const { trendStart, habitHistoryFrom } = windowFor(range, today);
  const windowFrom = minKey(range.prev.from, trendStart, habitHistoryFrom);

  const data = await loadData(userId, { windowFrom, habitId, include: { goals: false, habits: true } });
  const habit = data.habits[0];
  if (!habit) return { notFound: true };
  const report = analyzeHabit(habit, data.habitLogs, range, { historyFrom: habitHistoryFrom, archivedKey: archivedKeyOf(habit, timeZone) });
  return { report: { range, definitions: DEFINITIONS, thresholds, habit: report, narrative: habitNarrative(report, range) } };
}

module.exports = { getOverview, getGoalReport, getHabitReport, DEFINITIONS, WEEKDAY_NAMES, dateOnlyKey };
