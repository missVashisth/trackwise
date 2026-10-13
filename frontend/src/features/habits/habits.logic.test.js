// Run with `npm test` (node's built-in test runner; no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyHabitForm,
  firstInvalidStep,
  formFromHabit,
  periodLabel,
  previewPercent,
  scheduleLabel,
  toHabitPayload,
  trackingLabel,
  validateStep,
} from "./habits.logic.js";

const form = (overrides = {}) => ({ ...emptyHabitForm("2026-03-11"), title: "Reading", ...overrides });

test("basics: a name is required and long texts are rejected", () => {
  assert.deepEqual(Object.keys(validateStep("basics", form({ title: "  " }))), ["title"]);
  assert.ok(validateStep("basics", form({ motivation: "x".repeat(501) })).motivation);
  assert.deepEqual(validateStep("basics", form()), {});
});

test("schedule: each type asks only for what it needs", () => {
  assert.deepEqual(validateStep("schedule", form({ scheduleType: "daily", weekdays: [] })), {}, "weekdays ignored for daily");
  assert.ok(validateStep("schedule", form({ scheduleType: "weekdays", weekdays: [] })).weekdays);
  assert.ok(validateStep("schedule", form({ scheduleType: "timesPerWeek", timesPerPeriod: "8" })).timesPerPeriod);
  assert.deepEqual(validateStep("schedule", form({ scheduleType: "timesPerMonth", timesPerPeriod: "20" })), {});
  assert.ok(validateStep("schedule", form({ scheduleType: "timesPerMonth", timesPerPeriod: "32" })).timesPerPeriod);
  assert.ok(validateStep("schedule", form({ endDate: "2026-03-01" })).endDate);
  assert.ok(validateStep("schedule", form({ startDate: "" })).startDate);
});

test("tracking: a measurable habit needs a positive target and a unit", () => {
  assert.deepEqual(validateStep("tracking", form({ trackingMethod: "checkbox", targetValue: "" })), {});
  assert.deepEqual(validateStep("tracking", form({ trackingMethod: "percentage" })), {});
  const errors = validateStep("tracking", form({ trackingMethod: "measurable", targetValue: "0", unit: " " }));
  assert.deepEqual(Object.keys(errors).sort(), ["targetValue", "unit"]);
  assert.deepEqual(validateStep("tracking", form({ trackingMethod: "measurable", targetValue: "30", unit: "minutes" })), {});
});

test("milestones are optional; each one needs a title and sensible targets", () => {
  assert.deepEqual(validateStep("milestones", form()), {});
  const errors = validateStep("milestones", form({ endDate: "2026-04-01", milestones: [{ title: "", description: "", targetValue: "-1", targetDate: "2026-05-01" }] }));
  assert.deepEqual(Object.keys(errors).sort(), ["milestone-0-targetDate", "milestone-0-targetValue", "milestone-0-title"]);
});

test("firstInvalidStep points at the earliest step to fix", () => {
  assert.equal(firstInvalidStep(form()), null);
  assert.equal(firstInvalidStep(form({ title: "", trackingMethod: "measurable" })).stepId, "basics");
  assert.equal(firstInvalidStep(form({ trackingMethod: "measurable" })).stepId, "tracking");
});

test("payload contains only what the chosen options use", () => {
  const weekly = toHabitPayload(form({ scheduleType: "weekdays", weekdays: [5, 1, 3], trackingMethod: "checkbox", targetValue: "30" }));
  assert.deepEqual(weekly.schedule, { type: "weekdays", weekdays: [1, 3, 5] });
  assert.deepEqual([weekly.targetValue, weekly.unit, weekly.endDate, weekly.lifeAreaId], [null, "", null, null]);

  const measurable = toHabitPayload(form({ scheduleType: "timesPerWeek", timesPerPeriod: "3", trackingMethod: "measurable", targetValue: "30", unit: " minutes ", milestones: [{ title: " 100 min ", description: "", targetValue: "100", targetDate: "" }] }));
  assert.deepEqual(measurable.schedule, { type: "timesPerWeek", timesPerPeriod: 3 });
  assert.deepEqual([measurable.targetValue, measurable.unit], [30, "minutes"]);
  assert.deepEqual(measurable.milestones, [{ title: "100 min", description: "", targetValue: 100, targetDate: null }]);
});

test("editing round-trips an existing habit and keeps milestone ids", () => {
  const habit = {
    title: "Run", motivation: "", description: "", lifeAreaId: null, icon: "footprints", color: null,
    schedule: { type: "timesPerMonth", timesPerPeriod: 8 }, startDate: "2026-03-01", endDate: null,
    trackingMethod: "measurable", targetValue: 5, unit: "km",
    milestones: [{ id: "m1", title: "First 50 km", description: "", targetValue: 50, targetDate: null }],
  };
  const payload = toHabitPayload(formFromHabit(habit));
  assert.deepEqual(payload.schedule, { type: "timesPerMonth", timesPerPeriod: 8 });
  assert.deepEqual([payload.targetValue, payload.unit, payload.icon], [5, "km", "footprints"]);
  assert.equal(payload.milestones[0]._id, "m1");
});

test("labels describe schedules, targets and the current period", () => {
  assert.equal(scheduleLabel({ type: "daily" }), "Every day");
  assert.equal(scheduleLabel({ type: "weekdays", weekdays: [1, 2, 3, 4, 5] }), "Weekdays");
  assert.equal(scheduleLabel({ type: "weekdays", weekdays: [0, 3] }), "Wed, Sun");
  assert.equal(scheduleLabel({ type: "timesPerWeek", timesPerPeriod: 1 }), "1 time a week");
  assert.equal(scheduleLabel({ type: "timesPerMonth", timesPerPeriod: 8 }), "8 times a month");
  assert.equal(trackingLabel({ trackingMethod: "measurable", targetValue: 30, unit: "minutes" }), "30 minutes a day");
  assert.equal(periodLabel({ period: { type: "week", target: 3, credit: 1.5 } }), "1.5 of 3 this week");
  assert.equal(periodLabel({ period: { type: "week", scheduledDays: 3, completedDays: 1 } }), "1 of 3 scheduled days done this week");
});

test("progress preview mirrors the server's rules, including partial credit and safe targets", () => {
  const measurable = { trackingMethod: "measurable", targetValue: 30 };
  assert.equal(previewPercent(measurable, { actualValue: "20" }), 66.67);
  assert.equal(previewPercent(measurable, { actualValue: "90" }), 100);
  assert.equal(previewPercent(measurable, { actualValue: "" }), null);
  assert.equal(previewPercent({ trackingMethod: "measurable", targetValue: 0 }, { actualValue: "5" }), 0, "no division by zero");
  assert.equal(previewPercent({ trackingMethod: "percentage" }, { progressPercent: "20" }), 20);
  assert.equal(previewPercent({ trackingMethod: "checkbox" }, { completed: true }), 100);
});
