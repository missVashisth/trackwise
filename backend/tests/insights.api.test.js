// Insights endpoints on records created through the app itself (in-memory MongoDB, mocked clock).
// Today is Wednesday 11 March 2026 (06:00 in Kolkata, the users' default zone).
const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, alice, bob, Task, TaskCompletion, calculateDailyProgress, aliceId;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Task = require("../src/models/task.model");
  TaskCompletion = require("../src/models/taskCompletion.model");
  ({ calculateDailyProgress } = require("../src/services/dailyProgress.service"));
  require("../src/services/notifications/notification.service").setEnqueueDelivery(async () => {});
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-11T00:30:00Z").getTime() });
});
after(async () => {
  mock.timers.reset();
  await h.teardown();
});

let goal, taskA, taskB;

/** A daily-task goal from 5 March (10 days) with two equal tasks and some history. */
async function seedDailyGoal() {
  goal = (await alice.request("POST", "/goals", { title: "Read", startDate: "2026-03-05", totalDays: 10 })).body.goal;
  taskA = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "A", weightage: 1 })).body.task;
  taskB = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "B", weightage: 1 })).body.task;
  await Task.collection.updateMany({ goalId: Task.base.Types.ObjectId.createFromHexString(goal._id) }, { $set: { createdAt: new Date("2026-03-04T20:00:00Z") } }); // 5 March, Kolkata
  const history = { "2026-03-05": [taskA, taskB], "2026-03-06": [taskA], "2026-03-08": [taskA, taskB], "2026-03-10": [taskB] };
  for (const [dateKey, tasks] of Object.entries(history)) {
    for (const t of tasks) await TaskCompletion.create({ taskId: t._id, goalId: goal._id, userId: aliceId, dateKey });
    await calculateDailyProgress(goal._id, aliceId, dateKey);
  }
  await alice.request("POST", `/goals/${goal._id}/tasks/${taskA._id}/complete`); // today: A done, B open
}

beforeEach(async () => {
  await h.resetDb();
  alice = h.createClient(base);
  bob = h.createClient(base);
  aliceId = (await h.registerUser(alice, "alice"))._id ?? (await require("mongoose").model("users").findOne({ username: "alice" }))._id;
  await h.registerUser(bob, "bobby");
});

const overview = (client, query = "period=week") => client.request("GET", `/insights/overview?${query}`);

test("goal report: occurrences, completion rate, progress made and overall progress use the app's records", async () => {
  await seedDailyGoal();
  const res = await alice.request("GET", `/insights/goals/${goal._id}?period=week`);
  assert.equal(res.status, 200, res.text);
  const g = res.body.goal;

  // Mon 9: 2 scheduled, 0 done. Tue 10: 2 scheduled, 1 done. Wed 11 (today): A done counts, B is pending.
  assert.deepEqual([g.current.scheduled, g.current.completed, g.current.remaining, g.current.pendingToday, g.current.completionRate], [5, 2, 3, 1, 40]);
  // 10-day goal: a fully done day is worth 10 points; 10 March (B) and 11 March (A) gave 5 each.
  assert.equal(g.current.progressMade, 10);
  // Previous week (from the 5th): 8 scheduled, 5 done; 25 points.
  assert.deepEqual([g.previous.scheduled, g.previous.completionRate, g.previous.progressMade], [8, 62.5, 25]);
  assert.equal(g.change.completionRate, -22.5);

  const shown = (await alice.request("GET", `/goals/${goal._id}`)).body.goal.progress.overall;
  assert.equal(g.overallProgress, shown, "overall progress is the app's own figure");
  assert.equal(g.overallProgress, 35);
  assert.equal(g.remainingProgress, 65);
  assert.deepEqual(g.series.filter((d) => !d.future).map((d) => [d.dateKey, d.cumulative]), [["2026-03-09", 25], ["2026-03-10", 30], ["2026-03-11", 35]]);
  assert.equal(g.series.filter((d) => d.future).length, 4, "12–15 March are future");
  assert.deepEqual([g.streaks.current, g.streaks.longest], [2, 2], "activity on 10 and 11 March; 5–6 March before");
  assert.equal(g.recentActivity[0].dateKey, "2026-03-11");
  assert.ok(Array.isArray(res.body.narrative.observations) && res.body.narrative.observations.length > 0);
});

test("roadmap goal: scheduled vs completed (also when completed late) and progress = completed ÷ total", async () => {
  const rm = (await alice.request("POST", "/goals", { title: "Spanish", startDate: "2026-03-09", totalDays: 7 })).body.goal;
  const add = async (day, title) => (await alice.request("POST", `/goals/${rm._id}/tasks`, { kind: "roadmap", title, day })).body.task;
  await add(1, "T1");
  const t2 = await add(2, "T2");
  const t3 = await add(3, "T3");
  await add(4, "T4");
  await alice.request("POST", `/goals/${rm._id}/tasks/${t2._id}/complete`); // overdue, done today
  await alice.request("POST", `/goals/${rm._id}/tasks/${t3._id}/complete`); // today's, on time

  const g = (await alice.request("GET", `/insights/goals/${rm._id}?period=week`)).body.goal;
  assert.equal(g.basis, "roadmap");
  assert.deepEqual([g.current.scheduled, g.current.completed, g.current.roadmapOnTime], [3, 2, 1], "T4 is in the future; T1 is open");
  assert.deepEqual([g.current.progressMade, g.overallProgress], [50, 50]);
  assert.equal(g.series.find((d) => d.dateKey === "2026-03-11").cumulative, 50);
});

test("a goal without tasks or history reports zeros, never NaN, and says there is not enough data", async () => {
  const empty = (await alice.request("POST", "/goals", { title: "Empty", startDate: "2026-03-01", totalDays: 30 })).body.goal;
  const res = await alice.request("GET", `/insights/goals/${empty._id}?period=month`);
  assert.equal(res.status, 200);
  const g = res.body.goal;
  assert.deepEqual([g.current.scheduled, g.current.completionRate, g.current.progressMade, g.overallProgress, g.streaks.current], [0, null, 0, 0, 0]);
  assert.equal(res.body.narrative.hasData, false);
  assert.match(res.body.narrative.message, /Not enough data yet/);
  assert.ok(!JSON.stringify(res.body).includes("NaN"));
});

test("overview: summary cards, denominators, statuses and the activity calendar", async () => {
  await seedDailyGoal();
  await alice.request("POST", "/goals", { title: "Later", startDate: "2026-03-20", totalDays: 5 });
  const done = (await alice.request("POST", "/goals", { title: "Done", startDate: "2026-03-05", totalDays: 3 })).body.goal;
  await alice.request("PATCH", `/goals/${done._id}`, { completedAt: new Date().toISOString() });
  const habit = (await alice.request("POST", "/habits", { title: "Stretch", schedule: { type: "daily" }, trackingMethod: "percentage", startDate: "2026-03-09" })).body.habit;
  await alice.request("PUT", `/habits/${habit._id}/logs/2026-03-09`, { progressPercent: 100 });
  await alice.request("PUT", `/habits/${habit._id}/logs/2026-03-10`, { progressPercent: 50 });
  await alice.request("POST", "/tasks", { title: "Call bank", dueDate: "2026-03-10" }); // missed to-do
  const doneTodo = (await alice.request("POST", "/tasks", { title: "Pay bill", dueDate: "2026-03-11" })).body.task;
  await alice.request("PATCH", `/tasks/${doneTodo._id}`, { completed: true });
  await alice.request("POST", "/tasks", { title: "Shop", dueDate: "2026-03-11" }); // today, open: pending

  const res = await overview(alice);
  assert.equal(res.status, 200, res.text);
  const { summary, charts, range } = res.body;
  assert.deepEqual([range.from, range.to], ["2026-03-09", "2026-03-15"]);

  assert.deepEqual([summary.goals.active, summary.goals.upcoming, summary.goals.completed, summary.goals.paused, summary.goals.completedInRange], [1, 1, 1, null, 1]);
  assert.equal(summary.goals.averageProgressActive, 35);

  // Goal tasks 5 scheduled / 2 done (see above) + to-dos 2 / 1; pending today: B and "Shop".
  assert.deepEqual([summary.tasks.scheduled, summary.tasks.completed, summary.tasks.remaining, summary.tasks.pendingToday], [7, 3, 4, 2]);
  assert.equal(summary.tasks.completionRate, 42.86);
  assert.deepEqual(summary.tasks.breakdown, { goalTasks: { scheduled: 5, completed: 2 }, todos: { scheduled: 2, completed: 1 } });

  // Habit: 9 March done, 10 March 50% (partial), today not logged (not counted).
  assert.deepEqual([summary.habits.tracked, summary.habits.occurrences, summary.habits.completed, summary.habits.partial, summary.habits.completionRate, summary.habits.averageProgress], [1, 2, 1, 1, 50, 75]);

  const day = (key) => charts.daily.find((d) => d.dateKey === key);
  assert.deepEqual([day("2026-03-09").status, day("2026-03-09").habitsCompleted, day("2026-03-09").tasksScheduled], ["partial", 1, 2]);
  assert.equal(day("2026-03-11").status, "pending", "today is never called missed while open");
  assert.equal(day("2026-03-13").status, "future");
  // Activity on 8 (task completions), 9, 10 and 11 March: a 4-day streak; 3 active days inside this week.
  assert.deepEqual([summary.streak.current, summary.activeDays.current], [4, 3]);

  const month = (await overview(alice, "period=month&date=2026-03-11")).body;
  assert.equal(month.charts.daily.find((d) => d.dateKey === "2026-03-01").status, "beforeStart");
  assert.equal(month.charts.weekly.length, 8);
  assert.equal(month.charts.monthly.length, 6);
  assert.ok(month.charts.goalProgress.some((g) => g.title === "Read"));
  assert.equal(month.charts.habitConsistency[0].title, "Stretch");
  assert.ok(res.body.definitions.habitCompletionRate && res.body.definitions.taskCompletionRate);
});

test("habit report via the API matches the calculation rules", async () => {
  const habit = (await alice.request("POST", "/habits", { title: "Run", schedule: { type: "weekdays", weekdays: [1, 3, 5] }, trackingMethod: "measurable", targetValue: 5, unit: "km", startDate: "2026-03-09" })).body.habit;
  await alice.request("PUT", `/habits/${habit._id}/logs/2026-03-09`, { actualValue: 5 });
  await alice.request("PUT", `/habits/${habit._id}/logs/2026-03-10`, { actualValue: 3 }); // Tuesday: rest day, extra
  const res = await alice.request("GET", `/insights/habits/${habit._id}?period=week`);
  assert.equal(res.status, 200, res.text);
  const r = res.body.habit;
  assert.deepEqual([r.current.opportunities, r.current.completed, r.current.extraDays, r.current.pendingToday], [1, 1, 1, true]);
  assert.deepEqual([r.numeric.total, r.numeric.loggedDays, r.numeric.unit], [8, 2, "km"]);
  assert.equal(r.trends.weekly.length, 8);
});

test("custom ranges and invalid queries", async () => {
  await seedDailyGoal();
  const custom = await overview(alice, "period=custom&from=2026-03-05&to=2026-03-08");
  assert.equal(custom.status, 200);
  assert.deepEqual([custom.body.range.prev.from, custom.body.range.prev.to], ["2026-03-01", "2026-03-04"]);
  assert.deepEqual([custom.body.summary.tasks.scheduled, custom.body.summary.tasks.completed], [8, 5]);

  for (const query of ["period=year", "period=custom", "period=custom&from=2026-03-10&to=2026-03-01", "period=custom&from=2024-01-01&to=2026-03-01", "period=week&date=nope"]) {
    assert.equal((await overview(alice, query)).status, 400, query);
  }
  assert.equal((await alice.request("GET", "/insights/goals/not-an-id")).status, 400);
});

test("only the signed-in user's data is analysed", async () => {
  await seedDailyGoal();
  const habit = (await alice.request("POST", "/habits", { title: "Private", schedule: { type: "daily" }, trackingMethod: "checkbox" })).body.habit;
  assert.equal((await bob.request("GET", `/insights/goals/${goal._id}`)).status, 404);
  assert.equal((await bob.request("GET", `/insights/habits/${habit._id}`)).status, 404);
  const bobs = (await overview(bob)).body;
  assert.deepEqual([bobs.summary.goals.active, bobs.summary.habits.tracked, bobs.summary.tasks.scheduled, bobs.goals.length, bobs.habits.length], [0, 0, 0, 0, 0]);
  assert.equal((await h.createClient(base).request("GET", "/insights/overview")).status, 401);
});

test("redesign contract: list cards get health, change and trend data; habit days carry notes", async () => {
  await seedDailyGoal();
  const habit = (await alice.request("POST", "/habits", { title: "Stretch", schedule: { type: "daily" }, trackingMethod: "percentage", startDate: "2026-03-02" })).body.habit;
  await alice.request("PUT", `/habits/${habit._id}/logs/2026-03-09`, { progressPercent: 100, note: "Felt great" });

  const res = await overview(alice);
  const g = res.body.goals.find((x) => x.title === "Read");
  assert.deepEqual([g.progressMade, g.previousProgressMade], [10, 25]);
  assert.ok(["onTrack", "behind", "slowing", "needsAttention", "notEnoughData"].includes(g.health.status), g.health.status);
  assert.ok(g.health.label && g.health.reason && typeof g.health.pace.expected === "number");
  assert.deepEqual(g.progressSeries.map((p) => p.cumulative), [25, 30, 35], "finished days of the week only");

  const h = res.body.habits.find((x) => x.title === "Stretch");
  assert.equal(h.health.status, "notEnoughData", "2 eligible days this week");
  assert.equal(h.weeklyRates.length, 8);
  assert.ok("change" in h && "previousRate" in h && h.trackingMethod === "percentage");

  const detail = (await alice.request("GET", `/insights/goals/${goal._id}?period=week`)).body.goal;
  assert.equal(detail.series.find((d) => d.dateKey === "2026-03-09").expected, 50, "full pace on day 5 of 10");
  assert.equal(detail.series.find((d) => d.dateKey === "2026-03-14").expected, 100);
  const habitDay = (await alice.request("GET", `/insights/habits/${habit._id}?period=week`)).body.habit.daily.find((d) => d.dateKey === "2026-03-09");
  assert.equal(habitDay.note, "Felt great");
});
