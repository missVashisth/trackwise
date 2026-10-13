// Per-user time zones: "today" for task completion, task lists, daily progress and reminders is
// the user's own calendar day. The clock is mocked so instants can be chosen precisely.
const { test, describe, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

const date = require("../src/utils/date");
let base, TaskCompletion, DailyProgress, Notification, service, scan;

const setNow = (iso) => mock.timers.setTime(new Date(iso).getTime());

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  TaskCompletion = require("../src/models/taskCompletion.model");
  DailyProgress = require("../src/models/dailyProgress.model");
  Notification = require("../src/models/notification.model");
  service = require("../src/services/notifications/notification.service");
  scan = require("../src/queue/reminder.scan");
  service.setEnqueueDelivery(async () => {});
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-01T12:00:00Z").getTime() });
});
after(async () => {
  mock.timers.reset();
  await h.teardown();
});
beforeEach(async () => {
  await h.resetDb();
  await Promise.all([TaskCompletion.syncIndexes(), DailyProgress.syncIndexes()]);
});

async function userIn(name, timezone) {
  const client = h.createClient(base);
  const res = await client.request("POST", "/auth/register", { username: name, email: `${name}@example.com`, password: "secret1", timezone });
  assert.equal(res.status, 201, res.text);
  return client;
}
async function goalWithTasks(client, startDate, weights = [1, 1]) {
  const goal = (await client.request("POST", "/goals", { title: "Habit", startDate, totalDays: 10, metric: { target: 1 } })).body.goal;
  const tasks = [];
  for (const [i, weightage] of weights.entries()) {
    tasks.push((await client.request("POST", `/goals/${goal._id}/tasks`, { title: `T${i}`, weightage })).body.task);
  }
  return { goal, tasks };
}
const complete = (client, goal, task) => client.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`);

describe("date utilities", () => {
  test("the same UTC instant is a different calendar day in different zones", () => {
    const instant = new Date("2026-03-08T04:30:00Z");
    assert.equal(date.toDateKey(instant, "Asia/Kolkata"), "2026-03-08");
    assert.equal(date.toDateKey(instant, "America/New_York"), "2026-03-07");
    assert.equal(date.toDateKey(instant, "Pacific/Auckland"), "2026-03-08");
  });

  test("midnight boundaries follow the zone, including 30/45-minute offsets", () => {
    assert.equal(date.toDateKey(new Date("2026-05-10T18:29:59Z"), "Asia/Kolkata"), "2026-05-10");
    assert.equal(date.toDateKey(new Date("2026-05-10T18:30:00Z"), "Asia/Kolkata"), "2026-05-11");
    assert.equal(date.startOfDateKey("2026-10-04", "Asia/Kathmandu").toISOString(), "2026-10-03T18:15:00.000Z");
  });

  test("daylight saving: local midnight moves in UTC and the day keys stay correct", () => {
    // US spring forward 2026-03-08, fall back 2026-11-01.
    assert.equal(date.startOfDateKey("2026-03-08", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z");
    assert.equal(date.startOfDateKey("2026-03-09", "America/New_York").toISOString(), "2026-03-09T04:00:00.000Z");
    assert.equal(date.startOfDateKey("2026-11-02", "America/New_York").toISOString(), "2026-11-02T05:00:00.000Z");
    // 23:59 local on the DST day is still that day; one minute later is the next.
    assert.equal(date.toDateKey(new Date("2026-03-09T03:59:00Z"), "America/New_York"), "2026-03-08");
    assert.equal(date.toDateKey(new Date("2026-03-09T04:00:00Z"), "America/New_York"), "2026-03-09");
    // Chile skips midnight on 2026-09-06: that day starts at 01:00 local.
    assert.equal(date.startOfDateKey("2026-09-06", "America/Santiago").toISOString(), "2026-09-06T04:00:00.000Z");
  });

  test("invalid or missing zones fall back to the default", () => {
    assert.equal(date.resolveTimeZone("Mars/Olympus"), date.DEFAULT_TIME_ZONE);
    assert.equal(date.resolveTimeZone(undefined), date.DEFAULT_TIME_ZONE);
    assert.equal(date.resolveTimeZone({ $ne: null }), date.DEFAULT_TIME_ZONE);
    assert.equal(date.resolveTimeZone("America/New_York"), "America/New_York");
  });
});

describe("storing the user's time zone", () => {
  test("register stores it, get-me returns it, invalid values are rejected", async () => {
    const ny = await userIn("nyuser", "America/New_York");
    assert.equal((await ny.request("GET", "/auth/get-me")).body.user.timezone, "America/New_York");

    const bad = await h.createClient(base).request("POST", "/auth/register", { username: "badzone", email: "b@example.com", password: "secret1", timezone: "Nowhere/City" });
    assert.equal(bad.status, 400);
  });

  test("existing users without a zone get the default; login and PATCH update it", async () => {
    const legacy = h.createClient(base);
    await h.registerUser(legacy, "legacy");
    assert.equal((await legacy.request("GET", "/auth/get-me")).body.user.timezone, "Asia/Kolkata");

    const login = await h.createClient(base).request("POST", "/auth/login", { email: "legacy@example.com", password: "secret1", timezone: "Europe/London" });
    assert.equal(login.body.user.timezone, "Europe/London");

    assert.equal((await legacy.request("PATCH", "/auth/me/timezone", { timezone: "Asia/Tokyo" })).status, 200);
    assert.equal((await legacy.request("PATCH", "/auth/me/timezone", { timezone: "Asia/NotAZone" })).status, 400);
    assert.equal((await legacy.request("GET", "/auth/get-me")).body.user.timezone, "Asia/Tokyo");
  });
});

describe("daily completion per user time zone", () => {
  test("at one UTC instant, New York and Kolkata users are on different local days", async () => {
    setNow("2026-03-02T02:00:00Z"); // 21:00 Mar 1 in New York, 07:30 Mar 2 in Kolkata
    const ny = await userIn("nyc", "America/New_York");
    const ind = await userIn("ind", "Asia/Kolkata");
    const nyGoal = await goalWithTasks(ny, "2026-03-01");
    const inGoal = await goalWithTasks(ind, "2026-03-01");

    assert.equal((await ny.request("GET", "/tasks")).body.today, "2026-03-01");
    assert.equal((await ind.request("GET", "/tasks")).body.today, "2026-03-02");

    await complete(ny, nyGoal.goal, nyGoal.tasks[0]);
    await complete(ind, inGoal.goal, inGoal.tasks[0]);
    assert.deepEqual((await TaskCompletion.find({ taskId: nyGoal.tasks[0]._id }).lean()).map((c) => c.dateKey), ["2026-03-01"]);
    assert.deepEqual((await TaskCompletion.find({ taskId: inGoal.tasks[0]._id }).lean()).map((c) => c.dateKey), ["2026-03-02"]);
  });

  test("complete on one local day, again on the next local day; same local day is rejected", async () => {
    setNow("2026-03-01T15:00:00Z"); // 10:00 New York
    const ny = await userIn("ny2", "America/New_York");
    const { goal, tasks } = await goalWithTasks(ny, "2026-03-01");

    assert.equal((await complete(ny, goal, tasks[0])).status, 201);
    setNow("2026-03-02T04:59:00Z"); // 23:59 New York, still Mar 1 (already 2 Mar in UTC)
    assert.equal((await complete(ny, goal, tasks[0])).status, 409, "same local day");
    let list = (await ny.request("GET", "/tasks")).body;
    assert.equal(list.today, "2026-03-01");
    assert.equal(list.Tasks.find((t) => t.title === "T0").completedToday, true);

    setNow("2026-03-02T05:00:00Z"); // 00:00 New York, Mar 2
    list = (await ny.request("GET", "/tasks")).body;
    assert.equal(list.today, "2026-03-02");
    assert.deepEqual(list.Tasks.map((t) => t.completedToday), [false, false], "nothing carries over");
    assert.equal((await complete(ny, goal, tasks[0])).status, 201);
    assert.deepEqual((await TaskCompletion.find({ taskId: tasks[0]._id }).sort({ dateKey: 1 }).lean()).map((c) => c.dateKey), ["2026-03-01", "2026-03-02"]);
  });

  test("a goal starting today is running today for a user west of UTC", async () => {
    setNow("2026-03-02T03:00:00Z"); // 22:00 Mar 1 in New York
    const ny = await userIn("west", "America/New_York");
    const { goal } = await goalWithTasks(ny, "2026-03-01");
    const stored = (await ny.request("GET", `/goals/${goal._id}`)).body.goal;
    assert.equal(stored.isOngoing, true);
  });
});

describe("daily progress records", () => {
  test("progress records carry the local dateKey, one per goal per day, history kept", async () => {
    setNow("2026-03-01T15:00:00Z");
    const ny = await userIn("prog", "America/New_York");
    const { goal, tasks } = await goalWithTasks(ny, "2026-03-01");

    await complete(ny, goal, tasks[0]);
    const second = await complete(ny, goal, tasks[1]);
    assert.equal(second.body.goalProgress.today, 10, "both tasks => the whole day's 10%");

    let records = await DailyProgress.find({ goalId: goal._id }).lean();
    assert.equal(records.length, 1, "updated in place, not duplicated");
    assert.equal(records[0].dateKey, "2026-03-01");

    setNow("2026-03-02T15:00:00Z");
    const day2 = await complete(ny, goal, tasks[0]);
    assert.equal(day2.status, 201);
    assert.equal(day2.body.progressError, null);
    records = await DailyProgress.find({ goalId: goal._id }).sort({ dateKey: 1 }).lean();
    assert.deepEqual(records.map((r) => [r.dateKey, r.dailyProgress]), [["2026-03-01", 10], ["2026-03-02", 5]]);
    assert.equal(day2.body.goalProgress.overall, 15, "history still counts");
    assert.ok(records.every((r) => typeof r.dateKey === "string"));
  });

  test("concurrent completions on the same day never create two progress records", async () => {
    setNow("2026-03-01T15:00:00Z");
    const ny = await userIn("race", "America/New_York");
    const { goal, tasks } = await goalWithTasks(ny, "2026-03-01", [1, 1, 1, 1]);

    const results = await Promise.all(tasks.map((task) => complete(ny, goal, task)));
    assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201]);
    assert.equal(await DailyProgress.countDocuments({ goalId: goal._id, dateKey: "2026-03-01" }), 1);

    // A later recalculation for the day reads every completion.
    const daily = await ny.request("GET", `/goals/${goal._id}/progress/daily`);
    assert.equal(daily.body.progress.completedWeight, 4);
    assert.equal(daily.body.progress.dailyProgress, 10);
  });

  test("legacy { goalId, date } index: completion is kept, the API says progress failed, migration fixes it", async () => {
    setNow("2026-03-01T15:00:00Z");
    const ny = await userIn("legacyidx", "America/New_York");
    const { goal, tasks } = await goalWithTasks(ny, "2026-03-01");
    // Recreate an old database: the leftover index plus an old-format record (string date, no dateKey).
    await DailyProgress.collection.createIndex({ goalId: 1, date: 1 }, { unique: true });
    await DailyProgress.collection.insertOne({ goalId: goal._id, date: "Sat Feb 28 2026", totalWeight: 1, completedWeight: 1, dailyProgress: 5 });

    assert.equal((await complete(ny, goal, tasks[0])).status, 201, "day 1: first record with date:null fits");
    setNow("2026-03-02T15:00:00Z");
    const blocked = await complete(ny, goal, tasks[0]);
    assert.equal(blocked.status, 201, "the completion itself was saved");
    assert.equal(blocked.body.goalProgress, null);
    assert.match(blocked.body.progressError, /progress could not be updated/);
    assert.equal(await TaskCompletion.countDocuments({ taskId: tasks[0]._id, dateKey: "2026-03-02" }), 1);

    const { dropLegacyCompletionIndexes } = require("../src/migrations/dropLegacyCompletionIndexes");
    assert.deepEqual(await dropLegacyCompletionIndexes(), ["goalId_1_date_1"]);
    const indexes = await DailyProgress.collection.indexes();
    const current = indexes.find((i) => i.name === "goalId_1_dateKey_1");
    assert.ok(current?.unique && current.partialFilterExpression, "current unique index exists (partial)");

    // Undo + redo recalculates day 2 normally now; the old record is untouched.
    await ny.request("DELETE", `/goals/${goal._id}/tasks/${tasks[0]._id}/completions/2026-03-02`);
    const fixed = await complete(ny, goal, tasks[0]);
    assert.equal(fixed.body.progressError, null);
    assert.equal(fixed.body.goalProgress.today, 5);
    assert.equal(await DailyProgress.countDocuments({ date: "Sat Feb 28 2026" }), 1, "legacy record preserved");
  });
});

describe("reminders at each user's local time", () => {
  test("each user is reminded after their own local reminder time, once per local day", async () => {
    setNow("2026-03-01T12:00:00Z");
    const ny = await userIn("remny", "America/New_York");
    const ind = await userIn("remin", "Asia/Kolkata");
    await goalWithTasks(ny, "2026-02-25");
    await goalWithTasks(ind, "2026-02-25");
    const reminders = async (name) => {
      const user = await require("../src/models/user.model").findOne({ username: name });
      return Notification.find({ userId: user._id, type: "TASK_REMINDER", channel: "IN_APP" }).lean();
    };

    // 15:00 UTC = 20:30 Kolkata, 10:00 New York.
    let summary = await scan.runReminderScan({ now: new Date("2026-03-01T15:00:00Z") });
    assert.equal(summary.reminded, 1);
    assert.deepEqual((await reminders("remin")).map((n) => n.metadata.date), ["2026-03-01"]);
    assert.equal((await reminders("remny")).length, 0, "not 8 PM in New York yet");

    // 01:30 UTC Mar 2 = 20:30 Mar 1 New York (EST), 07:00 Mar 2 Kolkata.
    summary = await scan.runReminderScan({ now: new Date("2026-03-02T01:30:00Z") });
    assert.equal(summary.reminded, 1);
    assert.deepEqual((await reminders("remny")).map((n) => n.metadata.date), ["2026-03-01"], "New York's own date");
    assert.equal((await reminders("remin")).length, 1, "Kolkata not reminded again (morning)");

    // Running again later the same evening changes nothing.
    summary = await scan.runReminderScan({ now: new Date("2026-03-02T02:15:00Z") });
    assert.equal(summary.reminded, 0);
    assert.equal(summary.duplicates, 1);
    assert.equal((await reminders("remny")).length, 1);
  });

  test("REMINDER_LOCAL_TIME, else a simple daily REMINDER_CRON, sets the local reminder time", () => {
    const saved = { local: process.env.REMINDER_LOCAL_TIME, cron: process.env.REMINDER_CRON };
    try {
      delete process.env.REMINDER_LOCAL_TIME;
      process.env.REMINDER_CRON = "0 18 * * *";
      assert.equal(scan.reminderMinutes(), 18 * 60);
      process.env.REMINDER_LOCAL_TIME = "19:30";
      assert.equal(scan.reminderMinutes(), 19 * 60 + 30);
      delete process.env.REMINDER_LOCAL_TIME;
      delete process.env.REMINDER_CRON;
      assert.equal(scan.reminderMinutes(), 20 * 60);
    } finally {
      if (saved.local === undefined) delete process.env.REMINDER_LOCAL_TIME;
      else process.env.REMINDER_LOCAL_TIME = saved.local;
      if (saved.cron === undefined) delete process.env.REMINDER_CRON;
      else process.env.REMINDER_CRON = saved.cron;
    }
  });
});
