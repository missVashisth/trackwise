// Challenges over HTTP: catalogue, templates, joining, tracking, settings, leaving and ownership.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, Template, Enrollment, Log, service, rateLimit;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Template = require("../src/models/challengeTemplate.model");
  Enrollment = require("../src/models/challengeEnrollment.model");
  Log = require("../src/models/challengeLog.model");
  service = require("../src/services/challenges/challenge.service");
  rateLimit = require("../src/utils/rateLimit");
});
after(h.teardown);
beforeEach(async () => {
  await h.resetDb();
  service.resetSeedState();
  rateLimit.resetRateLimits();
});

const today = () => new Date().toISOString().slice(0, 10); // users below are registered in UTC
const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function user(name) {
  const client = h.createClient(base);
  await client.request("POST", "/auth/register", { username: name, email: `${name}@example.com`, password: "secret1", timezone: "UTC" });
  return client;
}
const catalogue = async (client) => (await client.request("GET", "/challenges")).body.challenges;
const bySlugTitle = async (client, title) => (await catalogue(client)).find((c) => c.title === title);

const CUSTOM = {
  title: "Language sprint",
  description: "Practise every day",
  category: "learning",
  durationDays: 10,
  activities: [
    { title: "Vocabulary", kind: "numeric", target: 20, unit: "words", customizable: true },
    { title: "Listen to a podcast", kind: "checkbox", required: false },
  ],
};

test("the catalogue is seeded once, lists categories, and counts real participants only", async () => {
  const alice = await user("alice");
  const bob = await user("bobby");
  const list = await catalogue(alice);
  assert.ok(list.length >= 6);
  assert.ok(list.every((c) => c.builtIn && c.participants === 0 && c.myEnrollmentId === null));
  await catalogue(bob); // second read: no duplicates
  assert.equal(await Template.countDocuments({ slug: "75-hard" }), 1);

  const reading = list.find((c) => c.title === "Reading Challenge");
  assert.equal(reading.ruleCount, 1);
  assert.equal((await alice.request("POST", `/challenges/templates/${reading.id}/join`, {})).status, 201);
  assert.equal((await bob.request("POST", `/challenges/templates/${reading.id}/join`, {})).status, 201);
  const forBob = await bySlugTitle(bob, "Reading Challenge");
  assert.equal(forBob.participants, 2);
  assert.ok(forBob.myEnrollmentId);

  // Left and finished attempts are not "taking this challenge".
  await alice.request("POST", `/challenges/enrollments/${(await bySlugTitle(alice, "Reading Challenge")).myEnrollmentId}/leave`);
  assert.equal((await bySlugTitle(bob, "Reading Challenge")).participants, 1);

  const fitness = (await alice.request("GET", "/challenges?category=fitness")).body.challenges;
  assert.ok(fitness.length >= 1 && fitness.every((c) => c.category === "fitness"));
  assert.equal((await alice.request("GET", "/challenges?category=nope")).status, 400);
  // No private data in the catalogue.
  assert.doesNotMatch(JSON.stringify(await catalogue(alice)), /example\.com|bobby|alice/);
});

test("joining: one running attempt per challenge, also under concurrent requests; strict rules need consent", async () => {
  const alice = await user("alice");
  const reading = await bySlugTitle(alice, "Reading Challenge");
  const results = await Promise.all(Array.from({ length: 5 }, () => alice.request("POST", `/challenges/templates/${reading.id}/join`, {})));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409, 409]);
  assert.equal(results.find((r) => r.status === 409).body.code, "ALREADY_JOINED");
  assert.equal(await Enrollment.countDocuments({ status: "active" }), 1);
  const enrollment = results.find((r) => r.status === 201).body.enrollment;
  assert.equal(enrollment.startDate, today());
  assert.equal(enrollment.endDate, shift(today(), 29));
  assert.equal(enrollment.phase, "running");

  const hard = await bySlugTitle(alice, "75 Hard");
  const noConsent = await alice.request("POST", `/challenges/templates/${hard.id}/join`, {});
  assert.equal(noConsent.status, 400);
  assert.equal(noConsent.body.code, "STRICT_RULE_NOT_ACKNOWLEDGED");
  assert.equal((await alice.request("POST", `/challenges/templates/${hard.id}/join`, { acknowledgedStrictRule: true })).status, 201);

  for (const startDate of [shift(today(), -1), shift(today(), 31), "2026-02-30"]) {
    const res = await alice.request("POST", `/challenges/templates/${(await bySlugTitle(alice, "Winter Arc")).id}/join`, { startDate });
    assert.equal(res.status, 400, startDate);
  }
});

test("custom templates are private, validated, and editing one never changes running attempts", async () => {
  const alice = await user("alice");
  const bob = await user("bobby");
  for (const bad of [{}, { ...CUSTOM, title: "x" }, { ...CUSTOM, durationDays: 0 }, { ...CUSTOM, durationDays: 400 }, { ...CUSTOM, activities: [] },
    { ...CUSTOM, activities: [{ title: "No unit", kind: "numeric", target: 5 }] }, { ...CUSTOM, activities: [{ title: "Bad", kind: "slider" }] },
    { ...CUSTOM, activities: [{ title: "Opt", kind: "checkbox", required: false }] }, { ...CUSTOM, category: "gambling" }]) {
    assert.equal((await alice.request("POST", "/challenges/templates", bad)).status, 400, JSON.stringify(bad).slice(0, 80));
  }
  const created = await alice.request("POST", "/challenges/templates", CUSTOM);
  assert.equal(created.status, 201, created.text);
  const id = created.body.challenge.id;
  assert.equal(created.body.challenge.status, "private");
  assert.ok((await catalogue(alice)).some((c) => c.id === id));
  assert.ok(!(await catalogue(bob)).some((c) => c.id === id), "others don't see it");
  assert.equal((await bob.request("GET", `/challenges/templates/${id}`)).status, 404);
  assert.equal((await bob.request("POST", `/challenges/templates/${id}/join`, {})).status, 404);
  assert.equal((await bob.request("PATCH", `/challenges/templates/${id}`, { title: "Hijacked" })).status, 404);

  const joined = (await alice.request("POST", `/challenges/templates/${id}/join`, {})).body.enrollment;
  const edited = await alice.request("PATCH", `/challenges/templates/${id}`, { activities: [{ title: "Vocabulary", kind: "numeric", target: 50, unit: "words" }] });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.body.challenge.version, 2);
  const mine = (await alice.request("GET", `/challenges/enrollments/${joined.id}`)).body.enrollment;
  assert.equal(mine.templateVersion, 1);
  assert.deepEqual(mine.activities.map((a) => [a.title, a.target]), [["Vocabulary", 20], ["Listen to a podcast", null]]);

  // Built-ins can't be edited by anyone.
  const builtIn = await bySlugTitle(alice, "Reading Challenge");
  assert.equal((await alice.request("PATCH", `/challenges/templates/${builtIn.id}`, { title: "Mine now" })).status, 404);
  assert.equal((await alice.request("POST", `/challenges/templates/${id}/archive`)).status, 200);
  assert.equal((await alice.request("GET", `/challenges/enrollments/${joined.id}`)).status, 200, "an archived template's runs continue");
});

test("tracking: checkbox and numeric logs update the day's record instead of adding to it", async () => {
  const alice = await user("alice");
  const id = (await alice.request("POST", "/challenges/templates", CUSTOM)).body.challenge.id;
  const enrollment = (await alice.request("POST", `/challenges/templates/${id}/join`, {})).body.enrollment;
  const [vocab, podcast] = enrollment.activities;
  const day = `/challenges/enrollments/${enrollment.id}/days/${today()}`;

  let res = await alice.request("PUT", `${day}/activities/${vocab.key}`, { value: 10 });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.log.progressPercent, 50);
  res = await alice.request("PUT", `${day}/activities/${vocab.key}`, { value: 25 });
  assert.equal(res.body.log.progressPercent, 100);
  assert.equal(res.body.log.value, 25, "replaced, not 10 + 25");
  await Promise.all([1, 2, 3].map(() => alice.request("PUT", `${day}/activities/${podcast.key}`, { done: true })));
  assert.equal(await Log.countDocuments({ enrollmentId: enrollment.id }), 2);

  const view = (await alice.request("GET", day)).body.day;
  assert.deepEqual(view.activities.map((a) => a.status), ["done", "done"]);
  for (const [body, label] of [[{ value: -1 }, "negative"], [{ value: "abc" }, "text"], [{ value: 5, unit: "litres" }, "wrong unit"], [{}, "missing"]]) {
    assert.equal((await alice.request("PUT", `${day}/activities/${vocab.key}`, body)).status, 400, label);
  }
  assert.equal((await alice.request("PUT", `${day}/activities/${podcast.key}`, { done: "yes" })).status, 400);
  assert.equal((await alice.request("PUT", `/challenges/enrollments/${enrollment.id}/days/${shift(today(), 1)}/activities/${vocab.key}`, { value: 5 })).status, 400, "no future logs");
  assert.equal((await alice.request("PUT", `${day}/activities/nope`, { value: 5 })).status, 404);
  assert.equal((await alice.request("DELETE", `${day}/activities/${podcast.key}`)).status, 200);
  assert.equal(await Log.countDocuments({ enrollmentId: enrollment.id }), 1);
});

test("personal settings: allowed targets and optional activities only, for this participant only", async () => {
  const alice = await user("alice");
  const bob = await user("bobby");
  const id = (await alice.request("POST", "/challenges/templates", CUSTOM)).body.challenge.id;
  const a = (await alice.request("POST", `/challenges/templates/${id}/join`, {})).body.enrollment;
  const hard = await bySlugTitle(alice, "75 Hard");
  const h1 = (await alice.request("POST", `/challenges/templates/${hard.id}/join`, { acknowledgedStrictRule: true })).body.enrollment;
  const h2 = (await bob.request("POST", `/challenges/templates/${hard.id}/join`, { acknowledgedStrictRule: true })).body.enrollment;

  const read = h1.activities.find((x) => x.key === "read");
  const changed = await alice.request("PATCH", `/challenges/enrollments/${h1.id}`, { activities: [{ key: "read", target: 20 }], reminders: { email: true } });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(changed.body.enrollment.activities.find((x) => x.key === "read").target, 20);
  assert.equal(changed.body.enrollment.reminders.email, true);
  assert.equal(read.target, 10);
  assert.equal((await bob.request("GET", `/challenges/enrollments/${h2.id}`)).body.enrollment.activities.find((x) => x.key === "read").target, 10, "other participants unchanged");
  assert.equal((await Template.findById(hard.id)).activities.find((x) => x.key === "read").target, 10, "template unchanged");

  const locked = await alice.request("PATCH", `/challenges/enrollments/${h1.id}`, { activities: [{ key: "read", enabled: false }] });
  assert.equal(locked.status, 403);
  assert.equal(locked.body.code, "RULE_LOCKED");
  const podcast = a.activities[1];
  assert.equal((await alice.request("PATCH", `/challenges/enrollments/${a.id}`, { activities: [{ key: podcast.key, enabled: false }] })).body.enrollment.activities[1].enabled, false);
  assert.equal((await alice.request("PATCH", `/challenges/enrollments/${a.id}`, { activities: [{ key: podcast.key, target: 3 }] })).status, 403, "checkbox has no target");

  // Nobody else can read or change this enrollment.
  for (const [method, path, body] of [["GET", `/challenges/enrollments/${h1.id}`], ["PATCH", `/challenges/enrollments/${h1.id}`, { reminders: { daily: false } }],
    ["POST", `/challenges/enrollments/${h1.id}/leave`], ["PUT", `/challenges/enrollments/${h1.id}/days/${today()}/activities/read`, { value: 10 }],
    ["GET", `/challenges/enrollments/${h1.id}/days/${today()}`]]) {
    assert.equal((await bob.request(method, path, body)).status, 404, `${method} ${path}`);
  }
  assert.equal(await Log.countDocuments({ enrollmentId: h1.id }), 0);
  assert.equal((await alice.request("GET", "/challenges/enrollments/not-an-id")).status, 400);
});

test("leaving keeps history; restarting starts a new attempt; finished runs close themselves", async () => {
  const alice = await user("alice");
  const reading = await bySlugTitle(alice, "Reading Challenge");
  const first = (await alice.request("POST", `/challenges/templates/${reading.id}/join`, {})).body.enrollment;
  await alice.request("PUT", `/challenges/enrollments/${first.id}/days/${today()}/activities/read`, { value: 20 });
  const restarted = await alice.request("POST", `/challenges/enrollments/${first.id}/restart`, {});
  assert.equal(restarted.status, 201, restarted.text);
  assert.equal(restarted.body.enrollment.attempt, 2);
  const old = (await alice.request("GET", `/challenges/enrollments/${first.id}`)).body.enrollment;
  assert.equal(old.status, "left");
  assert.equal(old.report.totals.completed + old.report.todaySummary.met, 1, "the first attempt's log is kept");
  assert.equal((await alice.request("PUT", `/challenges/enrollments/${first.id}/days/${today()}/activities/read`, { value: 5 })).status, 409);

  // A run whose last day has passed becomes "completed" when read, and can be joined again.
  const start = shift(today(), -40);
  const past = await Enrollment.create({ userId: (await Enrollment.findById(first.id)).userId, templateId: (await bySlugTitle(alice, "Winter Arc")).id, startDate: start, endDate: shift(start, 29), title: "Past run", category: "lifestyle", durationDays: 30, activities: [{ key: "x", title: "X", kind: "checkbox", required: true }] });
  const mine = (await alice.request("GET", "/challenges/mine")).body.enrollments;
  assert.equal(mine.find((e) => e.id === String(past._id)).status, "completed");
  assert.equal(mine.find((e) => e.id === String(past._id)).phase, "ended");
  assert.match(mine.find((e) => e.id === String(past._id)).summary.outcome.text, /Finished all 30 days/);
  assert.equal((await alice.request("POST", `/challenges/templates/${(await bySlugTitle(alice, "Winter Arc")).id}/join`, {})).status, 201);
});

test("reports over real logs: adherence, misses and streaks from the participant's own records", async () => {
  const alice = await user("alice");
  const reading = await bySlugTitle(alice, "Reading Challenge");
  const enrollment = (await alice.request("POST", `/challenges/templates/${reading.id}/join`, {})).body.enrollment;
  // Pretend it started 4 days ago (logs for days 1, 2 and 4; day 3 missed).
  const start = shift(today(), -4);
  await Enrollment.updateOne({ _id: enrollment.id }, { $set: { startDate: start, endDate: shift(start, 29) } });
  for (const offset of [0, 1, 3]) {
    const res = await alice.request("PUT", `/challenges/enrollments/${enrollment.id}/days/${shift(start, offset)}/activities/read`, { value: 20 });
    assert.equal(res.status, 200, res.text);
  }
  const report = (await alice.request("GET", `/challenges/enrollments/${enrollment.id}`)).body.enrollment.report;
  assert.equal(report.currentDay, 5);
  assert.deepEqual([report.totals.requiredEligible, report.totals.requiredCompleted, report.totals.requiredMissed], [4, 3, 1]);
  assert.equal(report.totals.requiredAdherence, 75);
  assert.equal(report.streak.current, 1);
  assert.equal(report.days[4].status, "today", "today is not missed yet");
  assert.equal(report.daysRemaining, 26);
});

test("Insights: a challenge's period results come from its logs and stay separate from goals and habits", async () => {
  const alice = await user("alice");
  const bob = await user("bobby");
  const reading = await bySlugTitle(alice, "Reading Challenge");
  const enrollment = (await alice.request("POST", `/challenges/templates/${reading.id}/join`, {})).body.enrollment;
  // Started 10 days ago; read on 6 of the 10 finished days.
  const start = shift(today(), -10);
  await Enrollment.updateOne({ _id: enrollment.id }, { $set: { startDate: start, endDate: shift(start, 29) } });
  for (const offset of [0, 1, 2, 4, 6, 8]) {
    await alice.request("PUT", `/challenges/enrollments/${enrollment.id}/days/${shift(start, offset)}/activities/read`, { value: 20 });
  }
  const res = await alice.request("GET", `/insights/challenges?period=custom&from=${start}&to=${shift(today(), -1)}`);
  assert.equal(res.status, 200, res.text);
  const [item] = res.body.enrollments;
  assert.deepEqual([item.period.requiredTotal, item.period.requiredMet, item.period.requiredMissed, item.period.requiredAdherence], [10, 6, 4, 60]);
  assert.equal(item.period.completeDays, 6);
  assert.equal(item.daily.length, 10);
  assert.equal(item.progress.currentDay, 11);
  assert.equal(res.body.hasData, true);
  // The general overview has no challenge numbers mixed in.
  const overview = (await alice.request("GET", "/insights/overview?period=week")).body;
  assert.doesNotMatch(JSON.stringify(overview.summary), /challenge/i);
  // Nobody else sees it.
  assert.deepEqual((await bob.request("GET", `/insights/challenges?period=custom&from=${start}&to=${today()}`)).body.enrollments, []);
  assert.equal((await alice.request("GET", "/insights/challenges?period=custom&from=2026-10-10&to=2026-10-01")).status, 400);
});
