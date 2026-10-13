const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const mongoose = require("mongoose");

let Goal, Task, TaskCompletion, User, Notification, service, scan, today, enqueued, eveningToday;

before(async () => {
  await h.setupDb();
  Goal = require("../src/models/goal.model");
  Task = require("../src/models/task.model");
  TaskCompletion = require("../src/models/taskCompletion.model");
  User = require("../src/models/user.model");
  Notification = require("../src/models/notification.model");
  service = require("../src/services/notifications/notification.service");
  scan = require("../src/queue/reminder.scan");
  today = require("../src/utils/date").getTodayDateKey();
  // 21:00 in the default zone (Asia/Kolkata) today: past the default 20:00 reminder time.
  eveningToday = new Date(require("../src/utils/date").startOfDateKey(today, "Asia/Kolkata").getTime() + 21 * 60 * 60 * 1000);
});
after(h.teardown);

beforeEach(async () => {
  await h.resetDb();
  enqueued = [];
  service.setEnqueueDelivery(async (n) => enqueued.push(String(n._id)));
});

const DAY = 24 * 60 * 60 * 1000;
const dateOnly = (offsetDays) => new Date(new Date(`${today}T00:00:00Z`).getTime() + offsetDays * DAY);

let userCounter = 0;
async function makeUser() {
  userCounter += 1;
  return User.create({ username: `user${userCounter}`, email: `user${userCounter}@example.com`, password: "x" });
}
async function makeGoal(user, { startOffset = 0, totalDays = 10, completed = false } = {}) {
  return Goal.create({ title: "Goal", user: user._id, startDate: dateOnly(startOffset), totalDays, completedAt: completed ? new Date() : null });
}
const makeTask = (user, goal, title = "task") => Task.create({ userId: user._id, goalId: goal._id, title, weightage: 1 });
const tick = (user, goal, task) => TaskCompletion.create({ userId: user._id, goalId: goal._id, taskId: task._id, dateKey: today });
const reminders = (user) => Notification.find({ userId: user._id, type: "TASK_REMINDER" }).lean();

test("an unfinished task today produces one in-app and one email reminder", async () => {
  const user = await makeUser();
  const goal = await makeGoal(user);
  await makeTask(user, goal, "a");
  const done = await makeTask(user, goal, "b");
  await tick(user, goal, done);

  const summary = await scan.runReminderScan({ now: eveningToday });
  const sent = await reminders(user);
  assert.equal(summary.reminded, 1);
  assert.deepEqual(sent.map((n) => n.channel).sort(), ["EMAIL", "IN_APP"]);
  assert.equal(sent[0].message, "You still have 1 task to complete today.");
  assert.equal(sent[0].metadata.date, today);
  assert.equal(enqueued.length, 1, "the email went to the queue");
});

test("no reminder when every task for today is done", async () => {
  const user = await makeUser();
  const goal = await makeGoal(user);
  await tick(user, goal, await makeTask(user, goal));

  await scan.runReminderScan({ now: eveningToday });
  assert.equal((await reminders(user)).length, 0);
});

test("open to-dos due today or overdue count; future and finished ones do not", async () => {
  const user = await makeUser();
  await Task.create([
    { userId: user._id, title: "today", dueDate: today },
    { userId: user._id, title: "overdue", dueDate: "2000-01-01" },
    { userId: user._id, title: "future", dueDate: "2999-01-01" },
    { userId: user._id, title: "done", dueDate: today, completedAt: new Date() },
  ]);
  await scan.runReminderScan({ now: eveningToday });
  const [reminder] = await reminders(user);
  assert.equal(reminder.metadata.pendingCount, 2);
});

test("goals that have not started, have ended, or are completed are ignored", async () => {
  const user = await makeUser();
  await makeTask(user, await makeGoal(user, { startOffset: 3 }));
  await makeTask(user, await makeGoal(user, { startOffset: -20, totalDays: 5 }));
  await makeTask(user, await makeGoal(user, { completed: true }));

  await scan.runReminderScan({ now: eveningToday });
  assert.equal((await reminders(user)).length, 0);
});

test("running the scan again (or twice at once) never duplicates a reminder", async () => {
  const user = await makeUser();
  await makeTask(user, await makeGoal(user));

  await scan.runReminderScan({ now: eveningToday });
  const second = await scan.runReminderScan({ now: eveningToday });
  await Promise.all([scan.runReminderScan({ now: eveningToday }), scan.runReminderScan({ now: eveningToday })]);

  assert.equal(second.reminded, 0);
  assert.equal(second.duplicates, 1);
  assert.equal((await reminders(user)).length, 2, "one in-app + one email, total");
  assert.equal(enqueued.length, 1);
});

test("users are processed in batches and nobody is skipped", async () => {
  const users = [];
  for (let i = 0; i < 7; i++) {
    const user = await makeUser();
    if (i % 2 === 0) await makeTask(user, await makeGoal(user));
    users.push(user);
  }
  const summary = await scan.runReminderScan({ now: eveningToday, batchSize: 3 });
  assert.equal(summary.usersScanned, 7);
  assert.equal(summary.reminded, 4);
});

test("stale queued emails are re-queued; stale reset emails are failed instead", async () => {
  const userId = new mongoose.Types.ObjectId();
  const old = new Date(Date.now() - 30 * 60 * 1000);
  const base = { userId, channel: "EMAIL", title: "t", message: "m", status: "queued" };
  const [stale, fresh, reset] = await Notification.create([
    { ...base, type: "TASK_REMINDER" },
    { ...base, type: "GOAL_COMPLETED" },
    { ...base, type: "PASSWORD_RESET" },
  ]);
  await Notification.collection.updateMany({ _id: { $in: [stale._id, reset._id] } }, { $set: { createdAt: old } });

  const requeued = [];
  const result = await scan.requeueStaleEmails({ enqueue: async (n) => requeued.push(String(n._id)) });

  assert.deepEqual(requeued, [String(stale._id)]);
  assert.equal(result.expired, 1);
  assert.equal((await Notification.findById(reset._id).lean()).status, "failed");
  assert.equal((await Notification.findById(fresh._id).lean()).status, "queued");
});
