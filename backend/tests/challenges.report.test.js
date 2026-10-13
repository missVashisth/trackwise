// Challenge report rules (pure): what counts as done, missed, rest and future; adherence, streaks,
// weeks, trends and the strict rule.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildReport, progressFor } = require("../src/services/challenges/challengeReport");

const read = { key: "read", title: "Read", kind: "numeric", target: 10, unit: "pages", required: true };
const water = { key: "water", title: "Water", kind: "numeric", target: 3, unit: "litres", required: false };
const gym = { key: "gym", title: "Gym", kind: "checkbox", required: true, days: [1, 3, 5] }; // Mon, Wed, Fri

// 2026-10-05 is a Monday.
const enrollment = (extra = {}) => ({ startDate: "2026-10-05", endDate: "2026-10-18", durationDays: 14, strict: false, status: "active", activities: [read, water], ...extra });
const done = (activityKey, dateKey) => ({ activityKey, dateKey, progressPercent: 100 });
const partial = (activityKey, dateKey, progressPercent) => ({ activityKey, dateKey, progressPercent });

test("numeric progress uses the target in force when logged; checkboxes are all or nothing", () => {
  assert.equal(progressFor(read, { value: 5, target: 10 }), 50);
  assert.equal(progressFor(read, { value: 25, target: 10 }), 100);
  assert.equal(progressFor(read, { value: 5, target: 20 }), 25, "a later target change doesn't rewrite this");
  assert.equal(progressFor(gym, { done: true }), 100);
  assert.equal(progressFor(gym, { done: false }), 0);
});

test("today is never missed before it ends; future days are future; finished days count", () => {
  const logs = [done("read", "2026-10-05"), done("water", "2026-10-05"), done("read", "2026-10-06")];
  const r = buildReport(enrollment(), logs, "2026-10-07");
  const [d1, d2, d3, d4] = r.days;
  assert.equal(d1.status, "complete");
  assert.equal(d2.status, "complete", "optional water missed, required read done");
  assert.equal(d3.status, "today");
  assert.deepEqual(d3.activities.map((a) => a.status), ["open", "open"]);
  assert.equal(d4.status, "future");
  // Finished days: 2 days x 2 activities = 4 eligible, 3 done; required: 2 of 2.
  assert.deepEqual([r.totals.eligible, r.totals.completed, r.totals.missed], [4, 3, 1]);
  assert.deepEqual([r.totals.requiredEligible, r.totals.requiredCompleted], [2, 2]);
  assert.equal(r.totals.requiredAdherence, 100);
  assert.equal(r.totals.adherence, 75);
  assert.equal(r.currentDay, 3);
  assert.equal(r.daysRemaining, 12);
  assert.equal(r.phase, "running");
});

test("partial progress is shown but only a reached target counts as done", () => {
  const r = buildReport(enrollment(), [partial("read", "2026-10-05", 60)], "2026-10-06");
  assert.equal(r.days[0].status, "missed");
  assert.equal(r.days[0].activities[0].progressPercent, 60);
  assert.equal(r.totals.requiredCompleted, 0);
});

test("weekday-only activities: other days are rest days, which don't break streaks", () => {
  const e = enrollment({ activities: [gym] });
  const logs = [done("gym", "2026-10-05"), done("gym", "2026-10-07")]; // Mon, Wed
  const r = buildReport(e, logs, "2026-10-09"); // Friday, not done yet
  assert.deepEqual(r.days.slice(0, 5).map((d) => d.status), ["complete", "rest", "complete", "rest", "today"]);
  assert.equal(r.streak.current, 2, "Tue/Thu rest days neither count nor break");
  assert.equal(r.totals.requiredEligible, 2);
});

test("streak: today extends it only once complete; a missed day breaks it", () => {
  const logs = ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"].map((d) => done("read", d));
  const before = buildReport(enrollment({ activities: [read] }), logs, "2026-10-10");
  assert.equal(before.streak.current, 2, "10-07 was missed");
  assert.equal(before.streak.longest, 2);
  const after = buildReport(enrollment({ activities: [read] }), [...logs, done("read", "2026-10-10")], "2026-10-10");
  assert.equal(after.streak.current, 3);
});

test("weeks and the recent trend use finished days only", () => {
  const e = enrollment({ activities: [read], endDate: "2026-10-25", durationDays: 21 });
  // Week 1: 7 of 7. Week 2: 3 of 7.
  const logs = [
    ...["05", "06", "07", "08", "09", "10", "11"].map((d) => done("read", `2026-10-${d}`)),
    ...["12", "13", "14"].map((d) => done("read", `2026-10-${d}`)),
  ];
  const r = buildReport(e, logs, "2026-10-19");
  assert.deepEqual(r.weeks.map((w) => [w.week, w.requiredAdherence, w.finished]), [[1, 100, true], [2, 42.9, true], [3, null, false]]);
  assert.equal(r.trend.direction, "down");
  assert.equal(r.trend.change, -57.1);
});

test("strict challenges: a missed required activity is reported, with plain wording", () => {
  const e = enrollment({ strict: true, activities: [read], endDate: "2026-10-07", durationDays: 3 });
  const running = buildReport(e, [done("read", "2026-10-05")], "2026-10-07");
  assert.deepEqual(running.strict, { brokenOn: { day: 2, dateKey: "2026-10-06" }, qualifies: false });
  const ended = buildReport(e, [done("read", "2026-10-05")], "2026-10-09");
  assert.equal(ended.phase, "ended");
  assert.equal(ended.outcome.kind, "finished_with_misses");
  assert.match(ended.outcome.text, /missed on 2 days/);
  assert.doesNotMatch(ended.outcome.text, /fail/i);

  const perfect = buildReport(e, ["05", "06", "07"].map((d) => done("read", `2026-10-${d}`)), "2026-10-09");
  assert.equal(perfect.outcome.kind, "completed");
  assert.equal(perfect.strict.qualifies, true);
  // Non-strict challenges never get a strict verdict.
  assert.equal(buildReport(enrollment(), [], "2026-10-09").strict, null);
});

test("a challenge that hasn't started shows no misses; switched-off activities are not expected", () => {
  const upcoming = buildReport(enrollment(), [], "2026-10-01");
  assert.equal(upcoming.phase, "upcoming");
  assert.equal(upcoming.totals.eligible, 0);
  assert.ok(upcoming.days.every((d) => d.status === "future"));
  const off = buildReport(enrollment({ activities: [read, { ...water, enabled: false }] }), [done("read", "2026-10-05")], "2026-10-06");
  assert.equal(off.totals.eligible, 1);
  assert.equal(off.days[0].activities[1].status, "rest");
});
