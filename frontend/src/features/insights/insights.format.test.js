import { test } from "node:test";
import assert from "node:assert/strict";
import { formatChange, isCurrentRange, periodFromParams, periodQueryString, rangeLabel, stepPeriod } from "./insights.format.js";

test("period state round-trips through the URL", () => {
  assert.deepEqual(periodFromParams(new URLSearchParams("")), { period: "week", date: null });
  assert.deepEqual(periodFromParams(new URLSearchParams("period=month&date=2026-03-11")), { period: "month", date: "2026-03-11" });
  assert.deepEqual(periodFromParams(new URLSearchParams("period=custom&from=2026-03-01&to=2026-03-10")), { period: "custom", from: "2026-03-01", to: "2026-03-10" });
  assert.deepEqual(periodFromParams(new URLSearchParams("period=custom")), { period: "week", date: null }, "incomplete custom range falls back");
  assert.equal(periodQueryString({ period: "week", date: null }), "period=week");
  assert.equal(periodQueryString({ period: "custom", from: "2026-03-01", to: "2026-03-10" }), "period=custom&from=2026-03-01&to=2026-03-10");
});

test("stepping moves to the neighbouring week, month or equal-length custom range", () => {
  const week = { period: "week", from: "2026-03-09", to: "2026-03-15", days: 7, today: "2026-03-11" };
  assert.deepEqual(stepPeriod({ period: "week" }, week, -1), { period: "week", date: "2026-03-08" });
  assert.deepEqual(stepPeriod({ period: "week" }, week, 1), { period: "week", date: "2026-03-16" });
  const month = { period: "month", from: "2026-03-01", to: "2026-03-31", days: 31, today: "2026-03-11" };
  assert.deepEqual(stepPeriod({ period: "month" }, month, -1), { period: "month", date: "2026-02-28" });
  const custom = { period: "custom", from: "2026-03-01", to: "2026-03-10", days: 10 };
  assert.deepEqual(stepPeriod({ period: "custom" }, custom, -1), { period: "custom", from: "2026-02-19", to: "2026-02-28" });
  assert.equal(isCurrentRange(week), true);
  assert.equal(isCurrentRange({ ...week, to: "2026-03-08" }), false);
});

test("labels and change formatting", () => {
  assert.equal(rangeLabel({ period: "week", from: "2026-03-09", to: "2026-03-15" }), "9–15 Mar 2026");
  assert.equal(rangeLabel({ period: "month", from: "2026-03-01", to: "2026-03-31" }), "March 2026");
  assert.equal(rangeLabel({ period: "week", from: "2026-03-30", to: "2026-04-05" }), "30 Mar – 5 Apr 2026");
  assert.deepEqual(formatChange(12.4), { text: "+12 pts vs previous", tone: "up" });
  assert.deepEqual(formatChange(-5), { text: "−5 pts vs previous", tone: "down" });
  assert.equal(formatChange(null), null);
});
