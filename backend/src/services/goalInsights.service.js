// Read-only history of one goal for its dashboard. Built from the records the app already keeps:
//
// - DailyProgress: one record per goal per day, written whenever that day's completions change.
//   It holds the day's completed / total task weight and the progress the day contributed.
// - TaskCompletion: which task was ticked on which day (the user's calendar day).
//
// Overall progress is the same sum getGoalProgress uses; nothing here writes or recalculates
// records. A day without any record or completion is reported as "nothing recorded", never as
// deleted data, and days before the goal's first task are not counted as missed.

const Goal = require("../models/goal.model");
const Task = require("../models/task.model");
const TaskCompletion = require("../models/taskCompletion.model");
const DailyProgress = require("../models/dailyProgress.model");
const { getGoalProgress, goalStatusOn } = require("./dailyProgress.service");
const { DAILY_TASKS, ROADMAP } = require("./roadmap.service");
const { getTodayDateKey, toDateKey, dateOnlyKey } = require("../utils/date");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SERIES_MAX_DAYS = 365; // daily series sent to the client (stats still cover the whole goal)
const TASK_RECENT_DAYS = 14;
const RECENT_ACTIVITY_LIMIT = 10;

const shiftKey = (dateKey, days) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
const daysFromTo = (fromKey, toKey) => Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / MS_PER_DAY);
const minKey = (...keys) => keys.filter(Boolean).sort()[0];
const round2 = (n) => Number(n.toFixed(2));

/** How a single day went: "full" | "partial" | "none" (nothing done) | "noTasks". */
function dayOutcome(record, tasksCompleted, hadTasks) {
  if (record) {
    if (record.totalWeight <= 0) return "noTasks";
    if (record.completionRatio >= 1) return "full";
    if (record.completedWeight > 0 || tasksCompleted > 0) return "partial";
    return "none";
  }
  if (tasksCompleted > 0) return "partial"; // completions saved, progress record missing
  return hadTasks ? "none" : "noTasks";
}

function summarize(days) {
  const tracked = days.filter((d) => d.outcome !== "noTasks");
  const active = tracked.filter((d) => d.outcome === "full" || d.outcome === "partial").length;
  return {
    trackedDays: tracked.length,
    activeDays: active,
    fullDays: tracked.filter((d) => d.outcome === "full").length,
    missedDays: tracked.filter((d) => d.outcome === "none").length,
    // Share of days (with tasks) on which at least one task was done.
    consistency: tracked.length ? Math.round((active / tracked.length) * 100) : null,
  };
}

/** Returns null when the goal does not exist or is not the user's. */
async function getGoalInsights(goalId, userId, timeZone) {
  const goal = await Goal.findOne({ _id: goalId, user: userId });
  if (!goal) return null;

  const today = getTodayDateKey(timeZone);

  // Daily-tick history uses the daily (recurring) tasks only; roadmap tasks are summarized below.
  const [records, completions, tasks, roadmapTasks, progress] = await Promise.all([
    DailyProgress.find({ goalId, userId }, "dateKey dailyProgress completedWeight totalWeight completionRatio").sort({ dateKey: 1 }).lean(),
    TaskCompletion.find({ goalId, userId }, "taskId dateKey createdAt").lean(),
    Task.find({ goalId, userId, ...DAILY_TASKS }, "title weightage createdAt").sort({ createdAt: 1 }).lean(),
    Task.find({ goalId, userId, kind: ROADMAP }, "title scheduledDate completedAt").lean(),
    getGoalProgress(goal._id, userId, timeZone),
  ]);

  // ---- The goal's days so far: start date .. min(today, deadline, day it was completed)
  const startKey = dateOnlyKey(goal.startDate);
  const deadlineKey = goal.deadline ? dateOnlyKey(goal.deadline) : null;
  const completedKey = goal.completedAt ? toDateKey(goal.completedAt, timeZone) : null;
  const endKey = minKey(today, deadlineKey, completedKey);
  const windowDays = endKey >= startKey ? daysFromTo(startKey, endKey) + 1 : 0;

  // ---- Index the records by day
  const recordByDay = new Map();
  let undatedProgress = 0;
  let undatedRecords = 0;
  for (const record of records) {
    if (typeof record.dateKey === "string") recordByDay.set(record.dateKey, record);
    else {
      // Records from an older schema carry no dateKey; they count toward overall progress only.
      undatedRecords += 1;
      undatedProgress += record.dailyProgress ?? 0;
    }
  }

  const completionsByDay = new Map();
  const completionsByTask = new Map();
  for (const completion of completions) {
    if (typeof completion.dateKey !== "string") continue;
    completionsByDay.set(completion.dateKey, (completionsByDay.get(completion.dateKey) ?? 0) + 1);
    const taskKey = completion.taskId.toString();
    if (!completionsByTask.has(taskKey)) completionsByTask.set(taskKey, new Set());
    completionsByTask.get(taskKey).add(completion.dateKey);
  }

  const firstTaskKey = tasks.length ? toDateKey(tasks[0].createdAt, timeZone) : null;

  // ---- Day-by-day series. Cumulative progress is summed exactly like getProgressByGoal
  // (undated records first, then by day, rounded and capped at 100 at every step).
  const datedRecords = records.filter((r) => typeof r.dateKey === "string");
  let pointer = 0;
  let cumulative = 0;
  for (const record of records) {
    if (typeof record.dateKey !== "string") cumulative = Math.min(100, round2(cumulative + (record.dailyProgress ?? 0)));
  }

  const days = [];
  for (let i = 0; i < windowDays; i += 1) {
    const dateKey = shiftKey(startKey, i);
    while (pointer < datedRecords.length && datedRecords[pointer].dateKey <= dateKey) {
      cumulative = Math.min(100, round2(cumulative + (datedRecords[pointer].dailyProgress ?? 0)));
      pointer += 1;
    }
    const record = recordByDay.get(dateKey) ?? null;
    const tasksCompleted = completionsByDay.get(dateKey) ?? 0;
    const hadTasks = Boolean(firstTaskKey && firstTaskKey <= dateKey);
    days.push({
      dateKey,
      isToday: dateKey === today,
      outcome: dayOutcome(record, tasksCompleted, hadTasks),
      tasksCompleted,
      // Share of the day's task weight that was done; null when no record says so.
      completionPercent: record && record.totalWeight > 0 ? Math.round(record.completionRatio * 100) : record || tasksCompleted ? null : 0,
      dailyProgress: record?.dailyProgress ?? 0,
      cumulative,
    });
  }

  // Finished days only: today is still in progress.
  const pastDays = days.filter((d) => !d.isToday);

  // ---- Per-task history (current tasks)
  const recentKeys = days.slice(-TASK_RECENT_DAYS).map((d) => d.dateKey);
  const taskHistory = tasks.map((task) => {
    const doneDays = completionsByTask.get(task._id.toString()) ?? new Set();
    const sorted = [...doneDays].sort();
    return {
      taskId: task._id,
      title: task.title,
      weightage: task.weightage,
      totalCompletions: doneDays.size,
      lastCompletedDateKey: sorted.at(-1) ?? null,
      recent: recentKeys.map((dateKey) => ({ dateKey, done: doneDays.has(dateKey) })),
    };
  });

  // ---- Latest completions
  const titleById = new Map(tasks.map((t) => [t._id.toString(), t.title]));
  const recentActivity = completions
    .filter((c) => typeof c.dateKey === "string")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((c) => ({ taskId: c.taskId, title: titleById.get(c.taskId.toString()) ?? null, dateKey: c.dateKey, completedAt: c.createdAt }));

  // ---- Timeline toward the deadline. Each day is worth 100 / totalDays, so finishing every task
  // on every day so far (today included) would put the goal at `idealProgress`.
  const elapsedDays = Math.min(windowDays, goal.totalDays);
  const timeline = {
    startDate: startKey,
    deadline: deadlineKey,
    completedOn: completedKey,
    totalDays: goal.totalDays,
    elapsedDays,
    remainingDays: deadlineKey && !completedKey && today <= deadlineKey ? daysFromTo(today, deadlineKey) + 1 : 0,
    daysUntilStart: today < startKey ? daysFromTo(today, startKey) : 0,
    idealProgress: Math.min(100, round2((elapsedDays * 100) / goal.totalDays)),
  };

  // ---- Roadmap (one-time tasks): planned vs. done per day. A task counts as planned from its
  // scheduled date and as done from the local date it was completed.
  let roadmap = null;
  if (roadmapTasks.length) {
    const plannedByDay = new Map();
    const doneByDay = new Map();
    for (const task of roadmapTasks) {
      plannedByDay.set(task.scheduledDate, (plannedByDay.get(task.scheduledDate) ?? 0) + 1);
      if (task.completedAt) {
        const day = toDateKey(task.completedAt, timeZone);
        doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
      }
    }
    const total = roadmapTasks.length;
    const countThrough = (map, dateKey) => [...map].reduce((sum, [day, n]) => (day <= dateKey ? sum + n : sum), 0);
    const doneTotal = roadmapTasks.filter((t) => t.completedAt).length;
    roadmap = {
      total,
      completed: doneTotal,
      today: roadmapTasks.filter((t) => !t.completedAt && t.scheduledDate === today).length,
      pending: roadmapTasks.filter((t) => !t.completedAt && t.scheduledDate < today).length,
      upcoming: roadmapTasks.filter((t) => !t.completedAt && t.scheduledDate > today).length,
      // Share of the roadmap scheduled up to and including today: where full pace would be.
      plannedThroughToday: countThrough(plannedByDay, today),
      expectedProgress: round2((countThrough(plannedByDay, today) / total) * 100),
      series: days.slice(-SERIES_MAX_DAYS).map((d) => ({
        dateKey: d.dateKey,
        isToday: d.isToday,
        planned: countThrough(plannedByDay, d.dateKey),
        done: countThrough(doneByDay, d.dateKey),
        completedThatDay: doneByDay.get(d.dateKey) ?? 0,
      })),
    };
  }

  return {
    goalId: goal._id,
    today,
    timeZone,
    status: goalStatusOn(goal, today),
    roadmap,
    progress: { overall: progress.overall, today: progress.today },
    timeline,
    stats: {
      sinceStart: summarize(pastDays),
      last7Days: summarize(pastDays.slice(-7)),
    },
    series: days.slice(-SERIES_MAX_DAYS),
    seriesTruncated: days.length > SERIES_MAX_DAYS,
    tasks: taskHistory,
    recentActivity,
    undated: { records: undatedRecords, progress: round2(undatedProgress) },
  };
}

module.exports = { getGoalInsights };
