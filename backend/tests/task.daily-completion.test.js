// Goal tasks recur daily: a completion counts for one date key only.
// The clock is mocked so the same task can be exercised on consecutive days.
const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, TaskCompletion, service, alice, goal, taskA, taskB;

// 06:00 IST on the given day.
const at = (day, time = "00:30:00Z") => new Date(`${day}T${time}`).getTime();
const setDay = (day, time) => mock.timers.setTime(at(day, time));

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  TaskCompletion = require("../src/models/taskCompletion.model");
  service = require("../src/services/notifications/notification.service");
  service.setEnqueueDelivery(async () => {});
  mock.timers.enable({ apis: ["Date"], now: at("2026-03-01") });
});
after(async () => {
  mock.timers.reset();
  await h.teardown();
});

beforeEach(async () => {
  await h.resetDb();
  await TaskCompletion.syncIndexes(); // schema indexes only (a test below adds the legacy one)
  setDay("2026-03-01");
  alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  goal = (await alice.request("POST", "/goals", { title: "Daily habit", startDate: "2026-03-01", totalDays: 10, metric: { target: 1 } })).body.goal;
  taskA = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "A", weightage: 1 })).body.task;
  taskB = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "B", weightage: 1 })).body.task;
});

const complete = (task) => alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`);
const completedToday = async () => {
  const res = await alice.request("GET", "/tasks");
  return { today: res.body.today, done: Object.fromEntries(res.body.Tasks.map((t) => [t.title, t.completedToday])) };
};
const daysCompleted = async (task) =>
  (await TaskCompletion.find({ taskId: task._id }).sort({ dateKey: 1 }).lean()).map((c) => c.dateKey);

test("a task completed on day 1 is incomplete again on day 2, and can be completed again", async () => {
  assert.equal((await complete(taskA)).status, 201);
  assert.deepEqual(await completedToday(), { today: "2026-03-01", done: { A: true, B: false } });

  setDay("2026-03-02");
  assert.deepEqual(await completedToday(), { today: "2026-03-02", done: { A: false, B: false } });

  assert.equal((await complete(taskA)).status, 201);
  assert.deepEqual(await daysCompleted(taskA), ["2026-03-01", "2026-03-02"], "two distinct completion records");
});

test("completing the same task twice on the same day is rejected", async () => {
  assert.equal((await complete(taskA)).status, 201);
  const again = await complete(taskA);
  assert.equal(again.status, 409);
  assert.deepEqual(await daysCompleted(taskA), ["2026-03-01"]);
});

test("an incomplete task does not count toward that day's progress", async () => {
  const res = await complete(taskA);
  // 10-day goal => 10% per day; 1 of 2 equal-weight tasks done => 5%.
  assert.equal(res.body.goalProgress.today, 5);
  assert.equal(res.body.goalProgress.overall, 5);

  setDay("2026-03-02");
  const day2 = await alice.request("GET", `/goals/${goal._id}`);
  assert.equal(day2.body.goal.progress.today, 0, "day 2 starts with nothing done");
  assert.equal(day2.body.goal.progress.overall, 5, "day 1 still counts");
});

test("yesterday's completion stays in history; undoing today removes only today's record", async () => {
  await complete(taskA);
  setDay("2026-03-02");
  await complete(taskA);
  await complete(taskB);

  const history = await alice.request("GET", `/goals/${goal._id}/tasks/${taskA._id}/completions`);
  assert.deepEqual(history.body.completions.map((c) => c.dateKey), ["2026-03-02", "2026-03-01"]);

  const undo = await alice.request("DELETE", `/goals/${goal._id}/tasks/${taskA._id}/completions/2026-03-02`);
  assert.equal(undo.status, 200);
  assert.deepEqual(await daysCompleted(taskA), ["2026-03-01"], "yesterday kept");
  assert.equal(undo.body.goalProgress.overall, 10, "day 1 (5%) + day 2 with only B done (5%)");
});

test("the day changes at midnight India time, and the task list follows it", async () => {
  const { getTodayDateKey } = require("../src/utils/date");
  setDay("2026-03-02", "18:29:59Z"); // 23:59:59 IST
  assert.equal(getTodayDateKey(), "2026-03-02");
  await complete(taskA);
  assert.equal((await completedToday()).done.A, true);

  setDay("2026-03-02", "18:30:00Z"); // 00:00:00 IST next day
  assert.equal(getTodayDateKey(), "2026-03-03");
  assert.deepEqual(await completedToday(), { today: "2026-03-03", done: { A: false, B: false } });
});

test("a leftover unique index from the old schema no longer blocks day-2 completions", async () => {
  // Databases created by an earlier version still carry { taskId, date } unique. Current documents
  // have no `date`, so MongoDB indexes them all as null: one completion per task, ever.
  await TaskCompletion.collection.createIndex({ taskId: 1, date: 1 }, { unique: true });
  assert.equal((await complete(taskA)).status, 201);
  setDay("2026-03-02");

  const blocked = await complete(taskA);
  assert.notEqual(blocked.body.message, "Task is already completed today", "must not be reported as a same-day duplicate");

  const { dropLegacyCompletionIndexes } = require("../src/migrations/dropLegacyCompletionIndexes");
  assert.deepEqual(await dropLegacyCompletionIndexes(), ["taskId_1_date_1"]);
  assert.deepEqual(await dropLegacyCompletionIndexes(), [], "safe to run again");

  assert.equal((await complete(taskA)).status, 201);
  assert.deepEqual(await daysCompleted(taskA), ["2026-03-01", "2026-03-02"]);
});

test("standalone to-dos are unaffected: completed once, not per day", async () => {
  const todo = (await alice.request("POST", "/tasks", { title: "Buy milk" })).body.task;
  await alice.request("PATCH", `/tasks/${todo._id}`, { completed: true });
  setDay("2026-03-02");
  const res = await alice.request("GET", "/tasks");
  assert.equal(res.body.Tasks.find((t) => t.title === "Buy milk").completedToday, true);
});
