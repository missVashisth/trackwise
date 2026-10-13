// Habits: creation and validation, schedules, tracking methods, daily logs, history, ownership.
// The clock is mocked so days and time zones can be crossed deliberately.
const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, alice, bob, HabitLog, Habit;

const setTime = (iso) => mock.timers.setTime(new Date(iso).getTime());
// 06:00 in Kolkata (the default zone) on the given day. 2026-03-11 is a Wednesday.
const setDay = (day) => setTime(`${day}T00:30:00Z`);

const DAILY_PERCENT = { title: "Reading", schedule: { type: "daily" }, trackingMethod: "percentage", startDate: "2026-03-09" };
const MEASURABLE = { title: "Meditation", schedule: { type: "daily" }, trackingMethod: "measurable", targetValue: 30, unit: "minutes", startDate: "2026-03-09" };
const CHECKBOX = { title: "Drink water", schedule: { type: "weekdays", weekdays: [1, 3, 5] }, trackingMethod: "checkbox", startDate: "2026-03-09" };

const create = (client, body) => client.request("POST", "/habits", body);
const log = (client, habitId, day, body) => client.request("PUT", `/habits/${habitId}/logs/${day}`, body);
const history = (client, habitId, query = "") => client.request("GET", `/habits/${habitId}/logs${query}`);

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Habit = require("../src/models/habit.model");
  HabitLog = require("../src/models/habitLog.model");
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-11T00:30:00Z").getTime() });
});
after(async () => {
  mock.timers.reset();
  await h.teardown();
});
beforeEach(async () => {
  await h.resetDb();
  setDay("2026-03-11");
  alice = h.createClient(base);
  bob = h.createClient(base);
  await h.registerUser(alice, "alice");
  await h.registerUser(bob, "bobby");
});

test("creates habits for every schedule type and tracking method", async () => {
  const bodies = [
    DAILY_PERCENT,
    MEASURABLE,
    CHECKBOX,
    { title: "Gym", schedule: { type: "timesPerWeek", timesPerPeriod: 3 }, trackingMethod: "checkbox" },
    { title: "Long run", schedule: { type: "timesPerMonth", timesPerPeriod: 4 }, trackingMethod: "measurable", targetValue: 10, unit: "km", endDate: "2026-06-30" },
  ];
  for (const body of bodies) {
    const res = await create(alice, body);
    assert.equal(res.status, 201, `${body.title}: ${res.text}`);
  }
  const list = (await alice.request("GET", "/habits")).body;
  assert.equal(list.today, "2026-03-11");
  const byTitle = Object.fromEntries(list.habits.map((x) => [x.title, x]));

  assert.deepEqual(byTitle.Reading.schedule, { type: "daily" });
  assert.equal(byTitle.Reading.today.status, "pending", "today without a log is 'not logged yet'");
  assert.deepEqual([byTitle.Meditation.targetValue, byTitle.Meditation.unit], [30, "minutes"]);
  assert.deepEqual(byTitle["Drink water"].schedule, { type: "weekdays", weekdays: [1, 3, 5] });
  assert.equal(byTitle["Drink water"].today.requirement, "scheduled", "Wednesday is scheduled");
  assert.deepEqual(byTitle.Gym.schedule, { type: "timesPerWeek", timesPerPeriod: 3 });
  assert.equal(byTitle.Gym.startDate, "2026-03-11", "start date defaults to the user's today");
  assert.equal(byTitle.Gym.today.requirement, "flexible");
  assert.deepEqual([byTitle.Gym.period.type, byTitle.Gym.period.from, byTitle.Gym.period.to, byTitle.Gym.period.target], ["week", "2026-03-09", "2026-03-15", 3]);
  assert.deepEqual([byTitle["Long run"].period.type, byTitle["Long run"].period.from, byTitle["Long run"].period.to], ["month", "2026-03-01", "2026-03-31"]);
  assert.equal(byTitle["Long run"].endDate, "2026-06-30");
  assert.deepEqual(byTitle.Reading.milestones, [], "milestones are optional");
  assert.equal(byTitle.Reading.targetValue, null);
});

test("rejects invalid habits with a clear message and saves nothing", async () => {
  const otherArea = (await bob.request("GET", "/life-areas")).body.lifeAreas[0]._id;
  const cases = [
    [{ ...DAILY_PERCENT, title: "  " }, /name/i],
    [{ ...DAILY_PERCENT, schedule: undefined }, /how often/],
    [{ ...DAILY_PERCENT, schedule: { type: "hourly" } }, /Schedule type/],
    [{ ...DAILY_PERCENT, schedule: { type: "weekdays", weekdays: [] } }, /weekday/],
    [{ ...DAILY_PERCENT, schedule: { type: "weekdays", weekdays: [7] } }, /weekday/],
    [{ ...DAILY_PERCENT, schedule: { type: "timesPerWeek", timesPerPeriod: 0 } }, /week/],
    [{ ...DAILY_PERCENT, schedule: { type: "timesPerWeek", timesPerPeriod: 8 } }, /week/],
    [{ ...DAILY_PERCENT, schedule: { type: "timesPerMonth", timesPerPeriod: 32 } }, /month/],
    [{ ...DAILY_PERCENT, trackingMethod: "vibes" }, /Tracking method/],
    [{ ...MEASURABLE, targetValue: 0 }, /target/i],
    [{ ...MEASURABLE, targetValue: -5 }, /target/i],
    [{ ...MEASURABLE, targetValue: "abc" }, /target/i],
    [{ ...MEASURABLE, unit: "" }, /unit/],
    [{ ...DAILY_PERCENT, startDate: "2026-02-30" }, /Start date/],
    [{ ...DAILY_PERCENT, endDate: "2026-03-01" }, /before the start/],
    [{ ...DAILY_PERCENT, icon: "<script>" }, /icon/],
    [{ ...DAILY_PERCENT, lifeAreaId: otherArea }, /Category not found/],
    [{ ...DAILY_PERCENT, milestones: [{ title: "" }] }, /Milestone 1 title/],
    [{ ...DAILY_PERCENT, milestones: [{ title: "Pages", targetValue: -1 }] }, /Milestone 1 target/],
    [{ ...DAILY_PERCENT, milestones: [{ title: "Early", targetDate: "2026-03-01" }] }, /before the habit starts/],
    [{ ...DAILY_PERCENT, endDate: "2026-04-01", milestones: [{ title: "Late", targetDate: "2026-05-01" }] }, /after the habit ends/],
    [{ ...DAILY_PERCENT, milestones: Array.from({ length: 21 }, (_, i) => ({ title: `M${i}` })) }, /at most 20/],
  ];
  for (const [body, message] of cases) {
    const res = await create(alice, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.match(res.body.message, message);
  }
  assert.equal(await Habit.countDocuments(), 0);
});

test("milestones are stored with the habit and completed separately from daily progress", async () => {
  const habit = (await create(alice, { ...MEASURABLE, milestones: [{ title: "First 100 minutes", targetValue: 100, targetDate: "2026-03-20" }, { title: "Ten sessions" }] })).body.habit;
  assert.equal(habit.milestones.length, 2);
  assert.deepEqual([habit.milestones[0].targetValue, habit.milestones[0].targetDate, habit.milestones[0].completedAt], [100, "2026-03-20", null]);

  const res = await alice.request("PATCH", `/habits/${habit._id}/milestones/${habit.milestones[1]._id}`, { completed: true });
  assert.equal(res.status, 200);
  assert.ok(res.body.habit.milestones[1].completedAt);
  assert.equal(await HabitLog.countDocuments(), 0, "reaching a milestone logs no daily progress");

  await log(alice, habit._id, "2026-03-11", { actualValue: 30 });
  const after = (await alice.request("GET", `/habits/${habit._id}`)).body.habit;
  assert.equal(after.milestones[0].completedAt, null, "daily completion does not complete milestones");

  // Editing keeps completion of milestones that stay.
  const edited = await alice.request("PATCH", `/habits/${habit._id}`, { milestones: [after.milestones[1], { title: "New one" }] });
  assert.equal(edited.status, 200, edited.text);
  assert.ok(edited.body.habit.milestones[0].completedAt);
  assert.equal(edited.body.habit.milestones[1].completedAt, null);
});

test("percentage logs: 0–100 only, partial credit, updates replace the day's value", async () => {
  const habit = (await create(alice, DAILY_PERCENT)).body.habit;
  for (const bad of [-1, 101, "abc", null, undefined]) {
    assert.equal((await log(alice, habit._id, "2026-03-11", { progressPercent: bad })).status, 400, String(bad));
  }

  const first = await log(alice, habit._id, "2026-03-11", { progressPercent: 20, note: "Chapter 1" });
  assert.equal(first.status, 201);
  assert.equal(first.body.log.progressPercent, 20);
  assert.equal(first.body.habit.today.status, "partial", "20% is partial credit, not zero");

  const second = await log(alice, habit._id, "2026-03-11", { progressPercent: 60 });
  assert.equal(second.status, 200);
  assert.equal(second.body.log.progressPercent, 60, "replaced, not 20 + 60");
  assert.equal(second.body.log.note, "Chapter 1", "note kept when not sent");

  assert.equal((await log(alice, habit._id, "2026-03-11", { progressPercent: 100 })).body.habit.today.status, "done");
  assert.equal(await HabitLog.countDocuments({ habitId: habit._id }), 1);
  assert.equal((await log(alice, habit._id, "2026-03-11", { progressPercent: 0 })).body.habit.today.status, "zero");
});

test("measurable logs: progress = min(100, actual / target × 100), with the target of that day", async () => {
  const habit = (await create(alice, MEASURABLE)).body.habit;
  assert.equal((await log(alice, habit._id, "2026-03-11", { actualValue: 20 })).body.log.progressPercent, 66.67);
  assert.equal((await log(alice, habit._id, "2026-03-11", { actualValue: 45 })).body.log.progressPercent, 100, "capped at 100");
  const zero = (await log(alice, habit._id, "2026-03-10", { actualValue: 0 })).body.log;
  assert.deepEqual([zero.progressPercent, zero.actualValue, zero.targetValue], [0, 0, 30]);
  for (const bad of [-3, "lots", null]) assert.equal((await log(alice, habit._id, "2026-03-11", { actualValue: bad })).status, 400);
  assert.equal((await log(alice, habit._id, "2026-03-11", { progressPercent: 50 })).status, 400, "wrong field for the method");

  // A new target applies from now on; yesterday keeps the target it was measured against.
  await alice.request("PATCH", `/habits/${habit._id}`, { targetValue: 60 });
  assert.equal((await log(alice, habit._id, "2026-03-11", { actualValue: 30 })).body.log.progressPercent, 50);
  const days = (await history(alice, habit._id, "?from=2026-03-10&to=2026-03-11")).body.logs;
  assert.deepEqual(days.map((d) => [d.dateKey, d.targetValue, d.progressPercent]), [["2026-03-10", 30, 0], ["2026-03-11", 60, 50]]);
});

test("checkbox logs: done or not done", async () => {
  const habit = (await create(alice, CHECKBOX)).body.habit;
  assert.equal((await log(alice, habit._id, "2026-03-11", {})).status, 400);
  assert.equal((await log(alice, habit._id, "2026-03-11", { completed: true })).body.log.progressPercent, 100);
  assert.equal((await log(alice, habit._id, "2026-03-11", { completed: false })).body.log.progressPercent, 0);
  const cleared = await alice.request("DELETE", `/habits/${habit._id}/logs/2026-03-11`);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.habit.today.status, "pending", "removing the entry makes the day not logged again");
  assert.equal((await alice.request("DELETE", `/habits/${habit._id}/logs/2026-03-11`)).status, 404);
});

test("concurrent and repeated submissions keep one record per habit per day", async () => {
  const habit = (await create(alice, DAILY_PERCENT)).body.habit;
  const results = await Promise.all([30, 40, 50, 60].map((p) => log(alice, habit._id, "2026-03-11", { progressPercent: p })));
  assert.ok(results.every((r) => r.status === 200 || r.status === 201), results.map((r) => r.status).join());
  assert.equal(results.filter((r) => r.status === 201).length, 1, "exactly one created the record");
  assert.equal(await HabitLog.countDocuments({ habitId: habit._id, dateKey: "2026-03-11" }), 1);
});

test("log dates: not in the future, inside the habit's dates, not while archived; backfill allowed", async () => {
  const habit = (await create(alice, { ...DAILY_PERCENT, endDate: "2026-03-12" })).body.habit;
  assert.match((await log(alice, habit._id, "2026-03-12", { progressPercent: 10 })).body.message, /future/);
  assert.match((await log(alice, habit._id, "2026-03-08", { progressPercent: 10 })).body.message, /before the habit started/);
  assert.equal((await log(alice, habit._id, "2026-03-09", { progressPercent: 10 })).status, 201, "an earlier day can be filled in");
  assert.equal((await log(alice, habit._id, "2026-13-01", { progressPercent: 10 })).status, 400);
  setDay("2026-03-14"); // within the 7-day session
  assert.match((await log(alice, habit._id, "2026-03-14", { progressPercent: 10 })).body.message, /after the habit ended/);

  await alice.request("POST", `/habits/${habit._id}/archive`);
  assert.match((await log(alice, habit._id, "2026-03-12", { progressPercent: 10 })).body.message, /archived/);
});

test("today follows the user's time zone", async () => {
  const ny = h.createClient(base);
  setTime("2026-03-11T12:00:00Z");
  await ny.request("POST", "/auth/register", { username: "nyc", email: "nyc@example.com", password: "secret1", timezone: "America/New_York" });
  await alice.request("POST", "/auth/login", { email: "alice@example.com", password: "secret1" });
  const nyHabit = (await create(ny, { ...DAILY_PERCENT, startDate: "2026-03-10" })).body.habit;
  const inHabit = (await create(alice, { ...DAILY_PERCENT, startDate: "2026-03-10" })).body.habit;

  // 2026-03-12T03:00Z: 23:00 on Mar 11 in New York, 08:30 on Mar 12 in Kolkata.
  setTime("2026-03-12T03:00:00Z");
  assert.equal((await ny.request("GET", "/habits")).body.today, "2026-03-11");
  assert.equal((await alice.request("GET", "/habits")).body.today, "2026-03-12");
  assert.match((await log(ny, nyHabit._id, "2026-03-12", { progressPercent: 50 })).body.message, /future/, "not yet Mar 12 in New York");
  assert.equal((await log(alice, inHabit._id, "2026-03-12", { progressPercent: 50 })).status, 201);
  assert.equal((await log(ny, nyHabit._id, "2026-03-11", { progressPercent: 50 })).status, 201);

  // An hour later it is Mar 12 in New York too: yesterday without a log is missed, today pending.
  setTime("2026-03-12T05:00:00Z");
  const days = (await history(ny, nyHabit._id, "?from=2026-03-10&to=2026-03-12")).body.days;
  assert.deepEqual(days.map((d) => [d.dateKey, d.status]), [["2026-03-10", "missed"], ["2026-03-11", "partial"], ["2026-03-12", "pending"]]);
});

test("history distinguishes missed, rest, open, pending and future days without storing them", async () => {
  const daily = (await create(alice, DAILY_PERCENT)).body.habit;
  const weekdays = (await create(alice, { ...CHECKBOX, schedule: { type: "weekdays", weekdays: [1, 3] } })).body.habit; // Mon, Wed
  const flexible = (await create(alice, { title: "Gym", schedule: { type: "timesPerWeek", timesPerPeriod: 3 }, trackingMethod: "checkbox", startDate: "2026-03-09" })).body.habit;
  await log(alice, daily._id, "2026-03-09", { progressPercent: 100 });
  await log(alice, daily._id, "2026-03-10", { progressPercent: 40 });
  await log(alice, flexible._id, "2026-03-09", { completed: true });

  const range = "?from=2026-03-08&to=2026-03-12";
  const statuses = async (habit) => (await history(alice, habit._id, range)).body.days.map((d) => d.status);
  assert.deepEqual(await statuses(daily), ["outside", "done", "partial", "pending", "future"]);
  assert.deepEqual(await statuses(weekdays), ["outside", "missed", "rest", "pending", "future"]);
  assert.deepEqual(await statuses(flexible), ["outside", "done", "open", "pending", "future"]);
  assert.equal(await HabitLog.countDocuments(), 3, "no records were created for missed days");

  const defaults = (await history(alice, daily._id)).body;
  assert.deepEqual([defaults.from, defaults.to, defaults.days.length], ["2026-02-10", "2026-03-11", 30]);
  assert.equal((await history(alice, daily._id, "?from=2026-03-10&to=2026-03-01")).status, 400);
  assert.equal((await history(alice, daily._id, "?from=2024-01-01&to=2026-03-11")).status, 400);
  assert.equal((await history(alice, daily._id, "?from=bad")).status, 400);
});

test("current period: flexible habits earn partial credit; fixed habits report scheduled days", async () => {
  const gym = (await create(alice, { title: "Gym", schedule: { type: "timesPerWeek", timesPerPeriod: 3 }, trackingMethod: "percentage", startDate: "2026-03-01" })).body.habit;
  await log(alice, gym._id, "2026-03-08", { progressPercent: 100 }); // previous week (Sunday)
  await log(alice, gym._id, "2026-03-09", { progressPercent: 100 });
  const res = await log(alice, gym._id, "2026-03-11", { progressPercent: 50 });
  assert.deepEqual([res.body.habit.period.credit, res.body.habit.period.target, res.body.habit.period.daysLogged], [1.5, 3, 2]);

  const reading = (await create(alice, DAILY_PERCENT)).body.habit;
  await log(alice, reading._id, "2026-03-09", { progressPercent: 100 });
  const period = (await log(alice, reading._id, "2026-03-10", { progressPercent: 50 })).body.habit.period;
  // Mon–Wed scheduled so far (today included, not logged yet).
  assert.deepEqual([period.scheduledDays, period.completedDays, period.averagePercent], [3, 1, 50]);
});

test("updates, tracking-method lock and archive/restore", async () => {
  const habit = (await create(alice, DAILY_PERCENT)).body.habit;
  const switched = await alice.request("PATCH", `/habits/${habit._id}`, { trackingMethod: "measurable", targetValue: 20, unit: "pages" });
  assert.equal(switched.status, 200, "allowed while nothing is logged");
  await log(alice, habit._id, "2026-03-11", { actualValue: 10 });
  assert.equal((await alice.request("PATCH", `/habits/${habit._id}`, { trackingMethod: "checkbox" })).status, 409);
  assert.equal((await alice.request("PATCH", `/habits/${habit._id}`, { schedule: { type: "weekdays", weekdays: [] } })).status, 400);
  const renamed = await alice.request("PATCH", `/habits/${habit._id}`, { title: "Read books", schedule: { type: "weekdays", weekdays: [3] } });
  assert.deepEqual([renamed.body.habit.title, renamed.body.habit.schedule.weekdays, renamed.body.habit.unit], ["Read books", [3], "pages"]);

  await alice.request("POST", `/habits/${habit._id}/archive`);
  assert.equal((await alice.request("GET", "/habits")).body.habits.length, 0);
  const archived = (await alice.request("GET", "/habits?status=archived")).body.habits;
  assert.equal(archived[0].isArchived, true);
  assert.equal((await alice.request("POST", `/habits/${habit._id}/restore`)).body.habit.isArchived, false);
  assert.equal((await alice.request("GET", "/habits?status=all")).body.habits.length, 1);
  assert.equal((await alice.request("GET", "/habits?status=weird")).status, 400);
  assert.equal(await HabitLog.countDocuments({ habitId: habit._id }), 1, "archiving keeps history");
});

test("users can only see and change their own habits", async () => {
  const habit = (await create(alice, { ...DAILY_PERCENT, milestones: [{ title: "M" }] })).body.habit;
  const milestone = habit.milestones[0]._id;
  const forged = await create(bob, { ...DAILY_PERCENT, userId: habit.userId });
  assert.equal(forged.body.habit.userId === habit.userId, false, "userId in the body is ignored");

  const attempts = [
    bob.request("GET", `/habits/${habit._id}`),
    bob.request("PATCH", `/habits/${habit._id}`, { title: "Mine" }),
    bob.request("POST", `/habits/${habit._id}/archive`),
    bob.request("POST", `/habits/${habit._id}/restore`),
    bob.request("PATCH", `/habits/${habit._id}/milestones/${milestone}`, { completed: true }),
    log(bob, habit._id, "2026-03-11", { progressPercent: 50 }),
    bob.request("DELETE", `/habits/${habit._id}/logs/2026-03-11`),
    history(bob, habit._id),
  ];
  for (const res of await Promise.all(attempts)) assert.equal(res.status, 404, res.text);
  assert.deepEqual((await bob.request("GET", "/habits")).body.habits.map((x) => x.title), ["Reading"]);
  assert.equal((await alice.request("GET", "/habits")).body.habits.length, 1);
  assert.equal((await h.createClient(base).request("GET", "/habits")).status, 401);
  assert.equal((await alice.request("GET", "/habits/not-an-id")).status, 400);
  assert.equal(await HabitLog.countDocuments(), 0);
  assert.equal((await Habit.findById(habit._id)).title, "Reading");
});
