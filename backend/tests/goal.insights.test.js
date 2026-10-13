// Goal dashboard data: GET /api/goals/:goalId/insights and the goal `status` field.
// The clock is mocked so a goal can be exercised over several days.
const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, alice, bob, goal, taskA, taskB;

// 06:00 IST on the given day (users default to Asia/Kolkata).
const at = (day) => new Date(`${day}T00:30:00Z`).getTime();
const setDay = (day) => mock.timers.setTime(at(day));

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  require("../src/services/notifications/notification.service").setEnqueueDelivery(async () => {});
  mock.timers.enable({ apis: ["Date"], now: at("2026-03-01") });
});
after(async () => {
  mock.timers.reset();
  await h.teardown();
});

beforeEach(async () => {
  await h.resetDb();
  setDay("2026-03-01");
  alice = h.createClient(base);
  bob = h.createClient(base);
  await h.registerUser(alice, "alice");
  await h.registerUser(bob, "bob");
  goal = (await alice.request("POST", "/goals", { title: "Run daily", startDate: "2026-03-01", totalDays: 10 })).body.goal;
  taskA = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "A", weightage: 1 })).body.task;
  taskB = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "B", weightage: 1 })).body.task;
});

const complete = (task) => alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`);
const insights = async (client = alice, id = goal._id) => {
  const res = await client.request("GET", `/goals/${id}/insights`);
  return { status: res.status, body: res.body, insights: res.body.insights };
};

test("another user's goal is not found, and a malformed id is rejected", async () => {
  assert.equal((await insights(bob)).status, 404);
  assert.equal((await bob.request("GET", `/goals/${goal._id}`)).status, 404);
  assert.equal((await insights(alice, "not-an-id")).status, 400);
  assert.equal((await alice.request("GET", "/goals/000000000000000000000000/insights")).status, 404);
});

test("history over several days matches the stored progress and never carries ticks over", async () => {
  await complete(taskA);
  await complete(taskB); // day 1: everything
  setDay("2026-03-02"); //   day 2: nothing
  setDay("2026-03-03");
  await complete(taskA); //  day 3: half
  setDay("2026-03-04"); //   day 4 (today): nothing yet

  const { status, insights: data } = await insights();
  assert.equal(status, 200);
  assert.equal(data.today, "2026-03-04");
  assert.equal(data.status, "active");

  assert.deepEqual(
    data.series.map((d) => [d.dateKey, d.outcome, d.tasksCompleted, d.completionPercent, d.cumulative]),
    [
      ["2026-03-01", "full", 2, 100, 10],
      ["2026-03-02", "none", 0, 0, 10],
      ["2026-03-03", "partial", 1, 50, 15],
      ["2026-03-04", "none", 0, 0, 15],
    ],
  );
  assert.equal(data.series.at(-1).isToday, true);

  // Same numbers as the goal itself (shared progress service).
  const goalNow = (await alice.request("GET", `/goals/${goal._id}`)).body.goal;
  assert.equal(data.progress.overall, goalNow.progress.overall);
  assert.equal(data.progress.overall, 15);
  assert.equal(data.progress.today, 0);

  // Today is excluded from the finished-day stats.
  assert.deepEqual(data.stats.sinceStart, { trackedDays: 3, activeDays: 2, fullDays: 1, missedDays: 1, consistency: 67 });

  const byTitle = Object.fromEntries(data.tasks.map((t) => [t.title, t]));
  assert.equal(byTitle.A.totalCompletions, 2);
  assert.equal(byTitle.A.lastCompletedDateKey, "2026-03-03");
  assert.equal(byTitle.B.totalCompletions, 1);
  assert.deepEqual(byTitle.B.recent.map((r) => r.done), [true, false, false, false]);

  assert.equal(data.recentActivity[0].title, "A");
  assert.equal(data.recentActivity[0].dateKey, "2026-03-03");
  assert.equal(data.recentActivity.length, 3);

  assert.deepEqual(
    { elapsed: data.timeline.elapsedDays, remaining: data.timeline.remainingDays, ideal: data.timeline.idealProgress },
    { elapsed: 4, remaining: 7, ideal: 40 },
  );

  // The task list for today shows nothing ticked: day 3's completion does not carry over.
  const tasks = (await alice.request("GET", "/tasks")).body.Tasks;
  assert.deepEqual(tasks.map((t) => t.completedToday), [false, false]);
});

test("a goal without tasks has no tracked days and no fabricated rate", async () => {
  const empty = (await alice.request("POST", "/goals", { title: "Empty", startDate: "2026-02-25", totalDays: 30 })).body.goal;
  const { insights: data } = await insights(alice, empty._id);
  assert.equal(data.series.length, 5);
  assert.ok(data.series.every((d) => d.outcome === "noTasks"));
  assert.deepEqual(data.stats.sinceStart, { trackedDays: 0, activeDays: 0, fullDays: 0, missedDays: 0, consistency: null });
  assert.deepEqual(data.tasks, []);
  assert.deepEqual(data.recentActivity, []);
  assert.equal(data.progress.overall, 0);
});

test("goal status: upcoming, active, ended and completed", async () => {
  const upcoming = (await alice.request("POST", "/goals", { title: "Later", startDate: "2026-03-05", totalDays: 3 })).body.goal;
  assert.equal(upcoming.status, "upcoming");
  const upcomingInsights = (await insights(alice, upcoming._id)).insights;
  assert.equal(upcomingInsights.series.length, 0);
  assert.equal(upcomingInsights.timeline.daysUntilStart, 4);

  assert.equal(goal.status, "active");

  const short = (await alice.request("POST", "/goals", { title: "Short", startDate: "2026-02-20", totalDays: 3 })).body.goal;
  assert.equal(short.status, "ended");
  assert.equal((await insights(alice, short._id)).insights.series.length, 3, "history stops at the deadline");

  await complete(taskA);
  setDay("2026-03-02");
  const done = (await alice.request("PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() })).body.goal;
  assert.equal(done.status, "completed");
  setDay("2026-03-06");
  const data = (await insights()).insights;
  assert.equal(data.status, "completed");
  assert.equal(data.timeline.completedOn, "2026-03-02");
  assert.equal(data.series.length, 2, "history stops on the day the goal was completed");
  assert.equal(data.progress.overall, 5);
});
