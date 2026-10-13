// Daily scan: which users still have unfinished tasks today? Users are read in _id-ordered
// batches, and each batch needs a fixed number of queries (no per-user lookups).
// Safe to run twice: the reminder's dedupeKey (user + day) allows one per user per day.

const User = require("../models/user.model");
const Goal = require("../models/goal.model");
const Task = require("../models/task.model");
const TaskCompletion = require("../models/taskCompletion.model");
const Notification = require("../models/notification.model");
const { notify } = require("../services/notifications/notification.service");
const { enqueueDelivery } = require("./notification.queue");
const { resolveTimeZone, toDateKey, localMinutesOfDay } = require("../utils/date");
const logger = require("../utils/logger");
const { DAILY_TASKS, ROADMAP } = require("../services/roadmap.service");

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER_MINUTES = 20 * 60;

/**
 * Local time of day (minutes after midnight) at which each user is reminded, in THEIR zone.
 * REMINDER_LOCAL_TIME="20:00"; otherwise a simple daily REMINDER_CRON ("0 18 * * *") is read as
 * that local time, so existing .env files keep their meaning; otherwise 20:00.
 */
function reminderMinutes() {
  const local = /^(\d{1,2}):(\d{2})$/.exec(process.env.REMINDER_LOCAL_TIME ?? "");
  if (local && +local[1] < 24 && +local[2] < 60) return +local[1] * 60 + +local[2];
  const cron = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec((process.env.REMINDER_CRON ?? "").trim());
  if (cron && +cron[2] < 24 && +cron[1] < 60) return +cron[2] * 60 + +cron[1];
  return DEFAULT_REMINDER_MINUTES;
}

/**
 * Unfinished tasks on the calendar day `dateKey` per user, keyed by user id string.
 * Goal start/deadline are calendar dates stored as UTC midnight, so they compare in UTC.
 */
async function pendingCountsForUsers(userIds, dateKey) {
  const dayStart = new Date(`${dateKey}T00:00:00Z`);
  const nextDay = new Date(dayStart.getTime() + DAY_MS);

  // Goals running that day: started by then, last day not before it, not completed.
  const goals = await Goal.find(
    {
      user: { $in: userIds },
      completedAt: null,
      startDate: { $lt: nextDay },
      $or: [{ deadline: null }, { deadline: { $gte: dayStart } }],
    },
    { _id: 1 }
  ).lean();
  const goalIds = goals.map((g) => g._id);

  const [goalTasks, completions, openTodos, openRoadmapTasks, openGoals] = await Promise.all([
    // Daily (recurring) tasks of running goals: unfinished unless ticked that day.
    goalIds.length
      ? Task.find({ userId: { $in: userIds }, goalId: { $in: goalIds }, ...DAILY_TASKS }, { _id: 1, userId: 1 }).lean()
      : [],
    TaskCompletion.find({ userId: { $in: userIds }, dateKey }, { taskId: 1 }).lean(),
    // To-dos due that day or overdue and still open (the Today page shows exactly these).
    Task.find(
      { userId: { $in: userIds }, goalId: null, completedAt: null, dueDate: { $ne: null, $lte: dateKey } },
      { userId: 1 }
    ).lean(),
    // Roadmap tasks scheduled for that day or earlier and still open (Today + Pending lists).
    Task.find(
      { userId: { $in: userIds }, kind: ROADMAP, completedAt: null, scheduledDate: { $lte: dateKey } },
      { userId: 1, goalId: 1 }
    ).lean(),
    Goal.find({ user: { $in: userIds }, completedAt: null }, { _id: 1 }).lean(),
  ]);

  const doneToday = new Set(completions.map((c) => String(c.taskId)));
  const counts = new Map();
  const bump = (userId) => counts.set(String(userId), (counts.get(String(userId)) ?? 0) + 1);
  for (const task of goalTasks) if (!doneToday.has(String(task._id))) bump(task.userId);
  for (const todo of openTodos) bump(todo.userId);
  const openGoalIds = new Set(openGoals.map((g) => String(g._id)));
  for (const task of openRoadmapTasks) if (openGoalIds.has(String(task.goalId))) bump(task.userId);
  return counts;
}

const reminderKey = (userId, dateKey) => `TASK_REMINDER:${userId}:${dateKey}`;

/**
 * Runs every few minutes. A user is due once their local clock has passed the reminder time and
 * they have not been reminded for their local date yet. Running late (worker was down) still
 * reminds them that evening; running twice cannot remind twice (dedupe key per local date).
 */
async function runReminderScan({ now = new Date(), batchSize = 500 } = {}) {
  const startedAt = Date.now();
  const dueAt = reminderMinutes();
  let lastId = null;
  let usersScanned = 0;
  let notYetDue = 0;
  let reminded = 0;
  let duplicates = 0;

  for (;;) {
    const users = await User.find(lastId ? { _id: { $gt: lastId } } : {}, { _id: 1, timezone: 1 })
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();
    if (users.length === 0) break;
    lastId = users[users.length - 1]._id;
    usersScanned += users.length;

    const due = [];
    for (const user of users) {
      const zone = resolveTimeZone(user.timezone);
      if (localMinutesOfDay(now, zone) < dueAt) {
        notYetDue += 1;
        continue;
      }
      due.push({ userId: user._id, dateKey: toDateKey(now, zone) });
    }
    if (due.length === 0) continue;

    // One query to skip everyone already reminded for their local date.
    const already = new Set(
      (
        await Notification.find(
          { dedupeKey: { $in: due.map((d) => `${reminderKey(d.userId, d.dateKey)}:IN_APP`) } },
          { dedupeKey: 1 }
        ).lean()
      ).map((n) => n.dedupeKey)
    );
    const remaining = due.filter((d) => !already.has(`${reminderKey(d.userId, d.dateKey)}:IN_APP`));
    duplicates += due.length - remaining.length;

    // Users in different zones can be on different local dates at this instant.
    const byDate = new Map();
    for (const d of remaining) {
      if (!byDate.has(d.dateKey)) byDate.set(d.dateKey, []);
      byDate.get(d.dateKey).push(d.userId);
    }

    for (const [dateKey, userIds] of byDate) {
      const counts = await pendingCountsForUsers(userIds, dateKey);
      for (const [userId, pendingCount] of counts) {
        const created = await notify({
          userId,
          type: "TASK_REMINDER",
          data: { pendingCount, date: dateKey },
          dedupeKey: reminderKey(userId, dateKey),
        });
        if (created.length) reminded += 1;
        else duplicates += 1;
      }
    }
  }

  const summary = { usersScanned, notYetDue, reminded, duplicates, ms: Date.now() - startedAt };
  logger.info("scheduler.reminder_scan_done", summary);
  return summary;
}

/**
 * Emails stay "queued" if Redis was down when they were created. Re-add them; the jobId
 * (notification id) makes this a no-op for ones that already have a job.
 */
async function requeueStaleEmails({ olderThanMs = 10 * 60 * 1000, limit = 100, enqueue = enqueueDelivery } = {}) {
  const stale = await Notification.find({
    status: "queued",
    channel: "EMAIL",
    createdAt: { $lt: new Date(Date.now() - olderThanMs) },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  let requeued = 0;
  let expired = 0;
  for (const notification of stale) {
    if (notification.type === "PASSWORD_RESET") {
      // The one-time link was never stored, so it cannot be re-sent; the user can request a new one.
      await Notification.updateOne(
        { _id: notification._id, status: "queued" },
        { $set: { status: "failed", failedAt: new Date(), lastError: "Reset link was not delivered in time" } }
      );
      expired += 1;
      continue;
    }
    await enqueue(notification);
    requeued += 1;
  }
  if (stale.length) logger.info("scheduler.requeue_stale_done", { found: stale.length, requeued, expired });
  return { found: stale.length, requeued, expired };
}

module.exports = { runReminderScan, pendingCountsForUsers, requeueStaleEmails, reminderMinutes };
