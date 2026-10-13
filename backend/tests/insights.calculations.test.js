// Insights calculations on hand-built records (no database): periods, habit rates and
// denominators, flexible targets, streaks, weekday patterns. Expected values are worked out by hand.
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.LOG_LEVEL = "silent";
const { parsePeriod } = require("../src/services/insights/period");
const { analyzeHabit, weekdayPattern } = require("../src/services/insights/habitAnalytics");
const { habitNarrative } = require("../src/services/insights/narrative");

const TODAY = "2026-03-11"; // a Wednesday
const range = (query) => parsePeriod(query, TODAY).range;
const habit = (overrides) => ({ _id: "h1", title: "Reading", icon: null, color: null, startDate: "2026-03-02", endDate: null, trackingMethod: "percentage", targetValue: null, unit: "", schedule: { type: "daily" }, ...overrides });
const logs = (entries) => Object.entries(entries).map(([dateKey, progressPercent]) => ({ dateKey, progressPercent, actualValue: null }));
const analyze = (h, l, query, opts = {}) => analyzeHabit(h, l, range(query), { historyFrom: "2025-01-01", ...opts });

test("periods: Monday–Sunday weeks, calendar months, custom ranges and their previous periods", () => {
  const week = range({ period: "week", date: "2026-03-11" });
  assert.deepEqual([week.from, week.to, week.prev.from, week.prev.to, week.days], ["2026-03-09", "2026-03-15", "2026-03-02", "2026-03-08", 7]);
  const sunday = range({ period: "week", date: "2026-03-15" });
  assert.equal(sunday.from, "2026-03-09", "Sunday belongs to the week that started on Monday");
  const month = range({ period: "month", date: "2026-03-11" });
  assert.deepEqual([month.from, month.to, month.prev.from, month.prev.to], ["2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"]);
  const custom = range({ period: "custom", from: "2026-03-01", to: "2026-03-10" });
  assert.deepEqual([custom.prev.from, custom.prev.to, custom.days], ["2026-02-19", "2026-02-28", 10]);
  assert.equal(range({}).period, "week", "week by default");

  for (const bad of [{ period: "year" }, { period: "custom" }, { period: "custom", from: "2026-03-10", to: "2026-03-01" }, { period: "custom", from: "2025-01-01", to: "2026-03-01" }, { period: "week", date: "2026-02-30" }]) {
    assert.ok(parsePeriod(bad, TODAY).error, JSON.stringify(bad));
  }
});

// Daily habit from Mon 2 March. Logs: 2:100 3:50 4:– 5:100 6:0 7:100 8:– 9:100 10:100 11(today):–
const DAILY_LOGS = logs({ "2026-03-02": 100, "2026-03-03": 50, "2026-03-05": 100, "2026-03-06": 0, "2026-03-07": 100, "2026-03-09": 100, "2026-03-10": 100 });

test("fixed schedule: completed ÷ eligible scheduled occurrences; today, future and pre-start days excluded", () => {
  const month = analyze(habit(), DAILY_LOGS, { period: "month", date: TODAY });
  // Eligible: 2–10 March = 9 days (1 March is before the start, today is unlogged, 12–31 are future).
  assert.deepEqual(
    [month.current.opportunities, month.current.completed, month.current.partial, month.current.missed, month.current.pendingToday],
    [9, 5, 1, 3, true],
  );
  assert.equal(month.current.completionRate, 55.56);
  assert.equal(month.current.averageProgress, 61.11, "(5×100 + 50) / 9 — partial credit kept separate");
  const outcome = (key) => month.daily.find((d) => d.dateKey === key).outcome;
  assert.deepEqual(["2026-03-01", "2026-03-03", "2026-03-04", "2026-03-06", "2026-03-11", "2026-03-12"].map(outcome), ["outside", "partial", "missed", "missed", "pending", "future"]);
});

test("insufficient data: no rate comparison below the minimum number of occurrences", () => {
  const week = analyze(habit(), DAILY_LOGS, { period: "week", date: TODAY });
  assert.deepEqual([week.current.opportunities, week.current.completionRate], [2, 100]);
  assert.equal(week.previous.rate, 42.86, "previous week: 3 of 7");
  assert.equal(week.change, null, "2 occurrences this week are too few to compare");
  assert.equal(week.enoughData, false);
  const narrative = habitNarrative(week, range({ period: "week", date: TODAY }));
  assert.ok(!narrative.observations.some((o) => o.id === "change"));
});

test("partial percentage days are not completions; logged 0% on a finished day is a miss", () => {
  const h = analyze(habit(), logs({ "2026-03-09": 99, "2026-03-10": 0 }), { period: "custom", from: "2026-03-09", to: "2026-03-10" });
  assert.deepEqual([h.current.completed, h.current.partial, h.current.missed, h.current.completionRate, h.current.averageProgress], [0, 1, 1, 0, 49.5]);
});

test("specific weekdays: rest days are neither scheduled nor missed; logs on rest days are extra", () => {
  const monWedFri = habit({ schedule: { type: "weekdays", weekdays: [1, 3, 5] } });
  const l = logs({ "2026-03-02": 100, "2026-03-03": 100, "2026-03-06": 100, "2026-03-07": 50, "2026-03-09": 100 });
  const week = analyze(monWedFri, l, { period: "custom", from: "2026-03-02", to: "2026-03-08" });
  assert.deepEqual([week.current.opportunities, week.current.completed, week.current.missed, week.current.extraDays, week.current.completionRate], [3, 2, 1, 2, 66.67]);
  assert.equal(week.daily.find((d) => d.dateKey === "2026-03-03").outcome, "extra");
  assert.equal(week.daily.find((d) => d.dateKey === "2026-03-08").outcome, "rest");
  // Streak: Fri 6 ✓, Mon 9 ✓, Wed 11 = today, unlogged — not a break. Wed 4 was missed earlier.
  assert.deepEqual([week.streaks.current, week.streaks.longest], [2, 2]);
});

test("streaks: interruptions reset; today's unlogged day does not", () => {
  const h = analyze(habit(), DAILY_LOGS, { period: "week", date: TODAY });
  // 2 ✓ 3 partial(0) 4 ✗ 5 ✓ 6 ✗ 7 ✓ 8 ✗ 9 ✓ 10 ✓ 11 pending
  assert.deepEqual([h.streaks.current, h.streaks.longest, h.streaks.unit], [2, 2, "occurrences"]);
  const perfect = analyze(habit(), logs({ "2026-03-02": 100, "2026-03-03": 100, "2026-03-04": 100, "2026-03-05": 100, "2026-03-06": 100, "2026-03-07": 100, "2026-03-08": 100, "2026-03-09": 100, "2026-03-10": 100, "2026-03-11": 100 }), { period: "week", date: TODAY });
  assert.deepEqual([perfect.streaks.current, perfect.streaks.longest], [10, 10]);
});

test("flexible weekly target: partial credit, prorated first week, ended periods only", () => {
  // 3 times a week from Wednesday 4 March: the first week covers 5 of 7 days -> target 2.14.
  const gym = habit({ title: "Gym", startDate: "2026-03-04", schedule: { type: "timesPerWeek", timesPerPeriod: 3 } });
  const l = logs({ "2026-03-04": 100, "2026-03-06": 100, "2026-03-07": 50, "2026-03-09": 100 });
  const month = analyze(gym, l, { period: "month", date: TODAY });
  const [first, current] = month.current.periods;
  assert.deepEqual([first.from, first.target, first.credit, first.ended, first.met], ["2026-03-02", 2.14, 2.5, true, true]);
  assert.deepEqual([current.from, current.credit, current.ended], ["2026-03-09", 1, false]);
  assert.equal(month.current.periods.length, 2, "later weeks have not started; the week ending 5 April belongs to April");
  assert.equal(month.current.targetRate, 100, "min(2.5, 2.14) / 2.14");
  assert.deepEqual([month.streaks.current, month.streaks.longest, month.streaks.unit], [1, 1, "weeks"]);

  const week = analyze(gym, l, { period: "week", date: TODAY });
  assert.equal(week.current.targetRate, null, "the current week has not ended");
  assert.deepEqual([week.currentPeriod.credit, week.currentPeriod.target], [1, 3]);
});

test("flexible monthly target viewed by week: no double counting, current month shown for context", () => {
  const runs = habit({ title: "Runs", startDate: "2026-03-01", schedule: { type: "timesPerMonth", timesPerPeriod: 8 }, trackingMethod: "checkbox" });
  const week = analyze(runs, logs({ "2026-03-02": 100, "2026-03-10": 100 }), { period: "week", date: TODAY });
  assert.deepEqual([week.current.periods.length, week.current.targetRate], [0, null], "March does not end in this week");
  assert.deepEqual([week.currentPeriod.from, week.currentPeriod.credit, week.currentPeriod.target], ["2026-03-01", 2, 8]);
});

test("measurable habits: totals and averages from actual values", () => {
  const minutes = habit({ trackingMethod: "measurable", targetValue: 30, unit: "minutes" });
  const l = [
    { dateKey: "2026-03-09", progressPercent: 66.67, actualValue: 20 },
    { dateKey: "2026-03-10", progressPercent: 100, actualValue: 45 },
    { dateKey: "2026-03-11", progressPercent: 100, actualValue: 30 },
  ];
  const week = analyze(minutes, l, { period: "week", date: TODAY });
  assert.deepEqual(week.numeric, { unit: "minutes", target: 30, total: 95, loggedDays: 3, averagePerLoggedDay: 31.67, averagePerOccurrence: 31.67 });
  assert.deepEqual([week.current.opportunities, week.current.completed, week.current.partial], [3, 2, 1], "today counts once logged");
});

test("archived habits stop counting after the day they were archived", () => {
  const h = analyze(habit(), DAILY_LOGS, { period: "month", date: TODAY }, { archivedKey: "2026-03-07" });
  assert.deepEqual([h.current.opportunities, h.current.completed], [6, 3], "2–7 March only");
  assert.equal(h.daily.find((d) => d.dateKey === "2026-03-09").outcome, "outside");
});

test("weekday patterns compare rates (not counts) and need enough occurrences", () => {
  const day = (d, opportunities, completed) => ({ day: d, name: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d], opportunities, completed, missed: opportunities - completed, rate: opportunities ? (completed / opportunities) * 100 : null });
  // Monday has the most misses (5) but the better rate (75%); Wednesday misses fewer (2) at 50%.
  const fair = weekdayPattern([day(1, 20, 15), day(3, 4, 2), day(5, 2, 0)]);
  assert.deepEqual([fair.enoughData, fair.best.name, fair.worst.name], [true, "Mon", "Wed"]);
  assert.equal(fair.minObservations, 4, "Friday (2 occurrences) is ignored");
  assert.equal(weekdayPattern([day(1, 20, 15), day(3, 3, 0)]).enoughData, false, "only one weekday has enough data");
  const close = weekdayPattern([day(1, 10, 8), day(2, 10, 7)]);
  assert.deepEqual([close.best, close.worst], [null, null], "a 10-point spread is not called a pattern");
});

// ---- Redesign additions: full-pace reference, goal and habit health, weekday/weekend rule

const { indexGoal, goalHealth, expectedBy } = require("../src/services/insights/goalAnalytics");
const { habitHealth } = require("../src/services/insights/habitAnalytics");
const { overviewNarrative } = require("../src/services/insights/narrative");

const goalIndex = ({ start = "2026-03-01", totalDays = 10, roadmapDays = [] } = {}) =>
  indexGoal(
    { _id: "g1", title: "G", startDate: new Date(`${start}T00:00:00Z`), deadline: new Date(Date.parse(`${start}T00:00:00Z`) + (totalDays - 1) * 86400000), totalDays, completedAt: null },
    { tasks: roadmapDays.map((d, i) => ({ _id: `t${i}`, kind: "roadmap", scheduledDate: d, completedAt: null, createdAt: new Date(`${start}T00:00:00Z`) })), completions: [], dailyProgress: [] },
    "UTC",
  );

test("full pace follows the goal's own definition (days, or the roadmap plan)", () => {
  const daily = goalIndex();
  assert.equal(expectedBy(daily, "2026-02-28"), 0, "before the start");
  assert.equal(expectedBy(daily, "2026-03-05"), 50, "5 of 10 days");
  assert.equal(expectedBy(daily, "2026-03-20"), 100, "capped at the deadline");
  const roadmap = goalIndex({ roadmapDays: ["2026-03-01", "2026-03-02", "2026-03-05", "2026-03-08"] });
  assert.equal(expectedBy(roadmap, "2026-03-05"), 75, "3 of 4 tasks planned by then");
});

test("goal health: explicit rules in order, with reasons", () => {
  const g = goalIndex({ start: "2026-02-01", totalDays: 60 }); // by 10 March: 38 finished days of 60 -> 63.33% full pace
  const quiet = { recent14: 5, previous14: 5, runningDays: true };
  const h = (overall, status = "active", m = quiet, today = TODAY) => goalHealth(g, overall, status, m, today).status;
  assert.equal(h(10, "completed"), "completed");
  assert.equal(h(0, "upcoming"), "notStarted");
  assert.equal(h(40, "ended"), "ended");
  assert.equal(goalHealth(goalIndex({ start: "2026-03-10" }), 5, "active", quiet, TODAY).status, "notEnoughData", "1 finished day");
  assert.equal(h(30, "active", { recent14: 0, previous14: 10, runningDays: true }), "needsAttention");
  assert.equal(h(55, "active", { recent14: 4, previous14: 10, runningDays: true }), "slowing");
  assert.equal(h(55), "onTrack", "55 ≥ 80% of 63.33");
  assert.equal(h(40), "behind", "40 < 50.67");
  assert.match(goalHealth(g, 40, "active", quiet, TODAY).reason, /full pace would be 63% by now/);
});

test("habit health: strong / building / struggling / declining, only with enough data", () => {
  const fixed = (rate, opportunities = 10) => ({ kind: "fixed", rate, opportunities });
  assert.equal(habitHealth(fixed(90), null, false).status, "strong");
  assert.equal(habitHealth(fixed(65), null, false).status, "building");
  assert.equal(habitHealth(fixed(30), null, false).status, "struggling");
  assert.equal(habitHealth(fixed(70), -20, false).status, "declining");
  assert.equal(habitHealth(fixed(100, 3), null, false).status, "notEnoughData", "3 days is too few");
  assert.equal(habitHealth({ kind: "flexible", rate: null, periodsEnded: 0 }, null, false).status, "notEnoughData");
  assert.equal(habitHealth(fixed(90), null, true).status, "archived");
});

test("weekday vs weekend observation needs enough days on both sides", () => {
  const weekdays = (wk, we) => [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const [o, c] = day === 0 || day === 6 ? we : wk;
    return { day, opportunities: o, completed: c };
  });
  const habitReport = (wd) => ({ habitId: "h", title: "Reading", current: { kind: "fixed", rate: 70, observations: 30, weekdays: wd, missed: 3 }, change: null, streaks: { current: 0, unit: "occurrences" }, previous: {} });
  const pooled = { habitRate: null, habitObs: 0, habitObsPrev: 0, taskRate: null, taskObs: 0, taskObsPrev: 0, weekdayPattern: { enoughData: false }, activityStreak: { current: 0 }, habitMissed: 0 };
  const r = range({ period: "month", date: TODAY });
  const text = (wd) => overviewNarrative({ range: r, habits: [habitReport(wd)], goals: [], pooled }).observations.map((o) => o.text).join(" ");
  assert.match(text(weekdays([4, 4], [2, 0])), /more consistently on weekdays than at weekends \(100% vs 0%\)/);
  assert.doesNotMatch(text(weekdays([4, 4], [1, 0])), /weekends/, "only 2 weekend days in total");
  assert.match(text(weekdays([4, 3], [2, 1])), /on weekdays than at weekends \(75% vs 50%\)/, "25-point gap, enough days on both sides");
  assert.doesNotMatch(text(weekdays([10, 7], [5, 3])), /weekends/, "70% vs 60% is below the 20-point threshold");
});
