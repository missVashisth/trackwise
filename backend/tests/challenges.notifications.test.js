// Challenge reminders, weekly reports and end-of-challenge messages.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let User, Enrollment, Log, Notification, notificationService, scan;
const deliveries = [];

before(async () => {
  await h.setupDb();
  User = require("../src/models/user.model");
  Enrollment = require("../src/models/challengeEnrollment.model");
  Log = require("../src/models/challengeLog.model");
  Notification = require("../src/models/notification.model");
  notificationService = require("../src/services/notifications/notification.service");
  scan = require("../src/queue/challenge.scan");
  notificationService.setEnqueueDelivery(async (n) => deliveries.push(n));
});
after(h.teardown);
beforeEach(async () => {
  await h.resetDb();
  deliveries.length = 0;
});

const DAY = 86400000;
const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
// 21:00 UTC: past the 20:00 reminder time for UTC users, before it for users further west.
const NOW = new Date("2026-10-13T21:00:00Z");
const TODAY = "2026-10-13";
const read = { key: "read", title: "Read", kind: "numeric", target: 10, unit: "pages", required: true };
const stretch = { key: "stretch", title: "Stretch", kind: "checkbox", required: false };

async function enroll({ startDaysAgo = 2, duration = 30, reminders = {}, timezone = "UTC", ...extra } = {}) {
  const user = await User.create({ username: `u${Math.random().toString(36).slice(2, 8)}`, email: `${Math.random().toString(36).slice(2)}@example.com`, password: "x", timezone });
  const startDate = shift(TODAY, -startDaysAgo);
  return Enrollment.create({
    userId: user._id,
    templateId: user._id, // any id: the scan never reads the template
    startDate,
    endDate: shift(startDate, duration - 1),
    title: "Reading Challenge",
    category: "learning",
    durationDays: duration,
    activities: [read, stretch],
    reminders,
    ...extra,
  });
}
const logRead = (enrollment, dateKey) => Log.create({ userId: enrollment.userId, enrollmentId: enrollment._id, activityKey: "read", dateKey, value: 10, target: 10, progressPercent: 100 });
const inApp = (filter = {}) => Notification.find({ channel: "IN_APP", ...filter }).lean();

test("decide: the most important message wins, and nothing is sent once today's required work is done", () => {
  const e = { _id: "e1", title: "Reading", startDate: "2026-10-01", endDate: "2026-10-30", durationDays: 30, activities: [read], reminders: { daily: true, weekly: true } };
  const done = (d) => ({ activityKey: "read", dateKey: d, progressPercent: 100 });

  assert.equal(scan.decide(e, [], "2026-10-03").type, "CHALLENGE_REMINDER");
  assert.equal(scan.decide(e, [], "2026-10-03").data.missedYesterday, true);
  assert.equal(scan.decide(e, [done("2026-10-02")], "2026-10-03").data.missedYesterday, false);
  assert.equal(scan.decide(e, [done("2026-10-03")], "2026-10-03"), null, "today already done");
  assert.equal(scan.decide({ ...e, reminders: { daily: false } }, [], "2026-10-03"), null);
  assert.equal(scan.decide(e, [], "2026-09-30"), null, "not started yet");

  const weekly = scan.decide(e, [done("2026-10-01"), done("2026-10-02")], "2026-10-08");
  assert.equal(weekly.type, "CHALLENGE_WEEKLY");
  assert.deepEqual([weekly.data.week, weekly.data.completeDays], [1, 2]);
  assert.equal(weekly.dedupeKey, "CHALLENGE_WEEKLY:e1:1");
  assert.equal(scan.decide({ ...e, reminders: { weekly: false } }, [], "2026-10-08").type, "CHALLENGE_REMINDER");

  assert.equal(scan.decide(e, [], "2026-10-28").type, "CHALLENGE_ENDING");
  assert.equal(scan.decide(e, [], "2026-10-28").data.daysLeft, 3);
  const finished = scan.decide(e, [], "2026-10-31");
  assert.equal(finished.type, "CHALLENGE_FINISHED");
  assert.match(finished.data.outcome, /Finished all 30 days/);
});

test("the scan reminds once per day, in the user's evening, in-app only unless email was chosen", async () => {
  const quiet = await enroll();
  const emailed = await enroll({ reminders: { email: true } });
  const west = await enroll({ timezone: "America/Los_Angeles" }); // 14:00 there: not due yet

  const first = await scan.runChallengeScan({ now: NOW, dueAt: 20 * 60 });
  assert.equal(first.sent, 2);
  assert.equal(first.notYetDue, 1);
  await scan.runChallengeScan({ now: NOW, dueAt: 20 * 60 });
  await scan.runChallengeScan({ now: new Date(NOW.getTime() + 15 * 60000), dueAt: 20 * 60 });

  assert.equal((await inApp({ userId: quiet.userId })).length, 1);
  assert.equal((await inApp({ userId: emailed.userId })).length, 1);
  assert.equal((await inApp({ userId: west.userId })).length, 0);
  assert.equal(await Notification.countDocuments({ channel: "EMAIL", userId: quiet.userId }), 0, "no email without opt-in");
  assert.equal(await Notification.countDocuments({ channel: "EMAIL", userId: emailed.userId }), 1);
  assert.equal(deliveries.length, 1);
  const [message] = await inApp({ userId: quiet.userId });
  assert.equal(message.type, "CHALLENGE_REMINDER");
  assert.match(message.message, /A missed day doesn't erase the effort/, "two finished days without logs");
  assert.doesNotMatch(message.message, /fail|lazy|shame/i);
});

test("no reminder when today's required activities are done; left challenges are silent", async () => {
  const done = await enroll();
  await logRead(done, TODAY);
  const left = await enroll({ status: "left" });
  const summary = await scan.runChallengeScan({ now: NOW, dueAt: 20 * 60 });
  assert.equal(summary.sent, 0);
  assert.equal((await inApp({ userId: done.userId })).length, 0);
  assert.equal((await inApp({ userId: left.userId })).length, 0);
});

test("at most one challenge message per day: a weekly report replaces that day's reminder", async () => {
  const e = await enroll({ startDaysAgo: 7 }); // today is day 8: week 1 just ended
  await logRead(e, shift(TODAY, -7));
  await scan.runChallengeScan({ now: NOW, dueAt: 20 * 60 });
  await scan.runChallengeScan({ now: NOW, dueAt: 20 * 60 });
  const sent = await inApp({ userId: e.userId });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "CHALLENGE_WEEKLY");
  assert.match(sent[0].message, /1 complete day/);
  // Next day: the weekly report isn't repeated; the normal reminder resumes.
  await scan.runChallengeScan({ now: new Date(NOW.getTime() + DAY), dueAt: 20 * 60 });
  assert.deepEqual((await inApp({ userId: e.userId })).map((n) => n.type).sort(), ["CHALLENGE_REMINDER", "CHALLENGE_WEEKLY"]);
});

test("ending soon and finished messages are sent once; a finished run is closed", async () => {
  const ending = await enroll({ startDaysAgo: 27 }); // day 28 of 30: 3 days left
  const finished = await enroll({ startDaysAgo: 30 }); // ended yesterday
  // Day 28: "3 days left". Day 29: week 4 has just ended, so its report. Day 30: the usual reminder.
  for (let i = 0; i < 3; i += 1) await scan.runChallengeScan({ now: new Date(NOW.getTime() + i * DAY), dueAt: 20 * 60 });
  const sent = await Notification.find({ channel: "IN_APP", userId: ending.userId }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(sent.map((n) => n.type), ["CHALLENGE_ENDING", "CHALLENGE_WEEKLY", "CHALLENGE_REMINDER"]);
  assert.equal(sent[1].metadata.week, 4);
  const done = await inApp({ userId: finished.userId });
  assert.deepEqual(done.map((n) => n.type), ["CHALLENGE_FINISHED"]);
  assert.equal((await Enrollment.findById(finished._id)).status, "completed");
});

test("a failing delivery for one participant doesn't stop the others; Redis being down keeps emails queued", async () => {
  notificationService.setEnqueueDelivery(async () => {
    throw new Error("Redis unavailable");
  });
  try {
    const a = await enroll({ reminders: { email: true } });
    const b = await enroll({ reminders: { email: true } });
    const summary = await scan.runChallengeScan({ now: NOW, dueAt: 20 * 60 });
    assert.equal(summary.sent, 2);
    for (const e of [a, b]) {
      assert.equal((await inApp({ userId: e.userId })).length, 1, "in-app doesn't depend on email");
      assert.equal((await Notification.findOne({ userId: e.userId, channel: "EMAIL" })).status, "queued", "retried by the stale sweep later");
    }
  } finally {
    notificationService.setEnqueueDelivery(async (n) => deliveries.push(n));
  }
});
