import { test } from "node:test";
import assert from "node:assert/strict";
import { trimLeadingEmpty, cumulativeOccurrences, dailyCompletionSeries, eligibleDays, habitValueSeries, lastInterruption, needingAttention, progressSegments, trendDirection } from "./insights.charts.js";

test("daily completion: no scheduled items is a gap, not 0%", () => {
  const daily = [
    { dateKey: "2026-03-09", status: "partial", habitsScheduled: 1, habitsCompleted: 1, tasksScheduled: 3, tasksCompleted: 1 },
    { dateKey: "2026-03-10", status: "activity", habitsScheduled: 0, habitsCompleted: 0, tasksScheduled: 0, tasksCompleted: 0, activity: 2 },
    { dateKey: "2026-03-11", status: "future" },
  ];
  assert.deepEqual(dailyCompletionSeries(daily).map((d) => d.rate), [50, null]);
  assert.equal(eligibleDays([{ status: "beforeStart" }, { status: "missed" }, { status: "pending" }, { status: "future" }]), 2);
});

test("progress segments find plateaus, gains and drops without interpolating", () => {
  const s = (pairs) => pairs.map(([cumulative, progress], i) => ({ dateKey: `2026-03-${String(i + 1).padStart(2, "0")}`, cumulative, progress }));
  const r = progressSegments(s([[20, 5], [20, 0], [20, 0], [20, 0], [35, 15], [35, 0], [55, 20]]));
  assert.deepEqual(r.plateaus, [{ from: "2026-03-02", to: "2026-03-04", days: 3 }]);
  assert.deepEqual([r.gainDays, r.dropDays, r.start, r.end], [3, 0, 20, 55]);
  assert.equal(progressSegments(s([[30, 0], [25, 0]])).dropDays, 1);
  assert.deepEqual(progressSegments([...s([[10, 0], [10, 0], [10, 0]]), { dateKey: "x", future: true }]).plateaus.length, 1, "trailing plateau, future ignored");
});

test("trend direction needs two known values and a real change", () => {
  assert.equal(trendDirection([20, null, 35, 55]), "up");
  assert.equal(trendDirection([60, 58]), "flat");
  assert.equal(trendDirection([80, null, 40]), "down");
  assert.equal(trendDirection([null, 40]), null);
});

test("habit series: missed days are markers, rest days are gaps, measurable uses actual values", () => {
  const daily = [
    { dateKey: "a", outcome: "completed", progressPercent: 100, actualValue: 30, note: "good" },
    { dateKey: "b", outcome: "rest", progressPercent: null, actualValue: null },
    { dateKey: "c", outcome: "missed", progressPercent: null, actualValue: null },
    { dateKey: "d", outcome: "partial", progressPercent: 50, actualValue: 15 },
    { dateKey: "e", outcome: "future", progressPercent: null },
  ];
  const measurable = habitValueSeries(daily, "measurable");
  assert.deepEqual(measurable.map((d) => [d.value, d.missed]), [[30, null], [null, null], [null, 0], [15, null]]);
  assert.equal(measurable[0].note, "good");
  assert.deepEqual(habitValueSeries(daily, "percentage").map((d) => d.value), [100, null, null, 50]);
  assert.deepEqual(cumulativeOccurrences(daily).map((d) => [d.scheduled, d.completed]), [[1, 1], [1, 1], [2, 1], [3, 1]]);
  assert.equal(lastInterruption(daily), "c");
});

test("attention list puts the most urgent items first and skips healthy ones", () => {
  const goals = [
    { goalId: "g1", title: "A", overallProgress: 40, health: { status: "onTrack" } },
    { goalId: "g2", title: "B", overallProgress: 10, health: { status: "needsAttention" } },
    { goalId: "g3", title: "C", overallProgress: 30, health: { status: "behind" } },
  ];
  const habits = [
    { habitId: "h1", title: "D", rate: 30, health: { status: "struggling" } },
    { habitId: "h2", title: "E", rate: 60, health: { status: "building" } },
  ];
  assert.deepEqual(needingAttention(goals, habits).map((i) => i.title), ["B", "D", "C"]);
});

test("leading empty periods are trimmed, later gaps kept", () => {
  const b = [{ r: null }, { r: null }, { r: 50 }, { r: null }, { r: 70 }];
  assert.deepEqual(trimLeadingEmpty(b, ["r"]).map((x) => x.r), [50, null, 70]);
  assert.deepEqual(trimLeadingEmpty([{ r: null }, { r: null }, { r: null }, { r: 9 }], ["r"]).map((x) => x.r), [null, 9], "keeps at least two");
  assert.equal(trimLeadingEmpty([{ r: 1 }, { r: 2 }], ["r"]).length, 2);
});
