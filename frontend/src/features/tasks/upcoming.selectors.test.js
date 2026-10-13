import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay, dayLabel, goalsAcceptingDatedTasks, isDateKey, longDate, shiftKey } from "./upcoming.selectors.js";

const TODAY = "2026-10-13";
const todo = (id, dueDate, extra = {}) => ({ id, isTodo: true, isRoadmap: false, goalId: null, title: id, dueDate, completedAt: null, ...extra });
const roadmap = (id, goalId, scheduledDate, extra = {}) => ({ id, isTodo: false, isRoadmap: true, goalId, title: id, scheduledDate, roadmapStatus: "upcoming", ...extra });
const daily = (id, goalId) => ({ id, isTodo: false, isRoadmap: false, goalId, title: id });
const goal = (id, extra = {}) => ({ id, title: id, startDate: "2026-10-01T00:00:00.000Z", deadline: "2026-10-31T00:00:00.000Z", completedAt: null, progress: { basis: "roadmap" }, ...extra });
const ids = (list) => list.map((t) => t.id);

test("date keys shift without time-zone drift, across month and DST boundaries", () => {
  assert.equal(shiftKey("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftKey("2026-03-08", 1), "2026-03-09"); // US DST start
  assert.equal(shiftKey("2026-01-01", -1), "2025-12-31");
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(isDateKey("2026-02-28"), true);
});

test("labels", () => {
  assert.equal(dayLabel(TODAY, TODAY), "Today");
  assert.equal(dayLabel("2026-10-14", TODAY), "Tomorrow");
  assert.equal(dayLabel("2026-10-12", TODAY), "Yesterday");
  assert.equal(longDate("2026-10-15", TODAY), "Thursday 15 October");
  assert.match(longDate("2027-01-04", TODAY), /^Monday,? 4 January 2027$/); // the year only when it differs
});

const TASKS = [
  todo("today-todo", TODAY),
  todo("tomorrow-high", "2026-10-14", { priority: "high" }),
  todo("tomorrow-plain", "2026-10-14"),
  roadmap("roadmap-15", "g1", "2026-10-15"),
  todo("late-open", "2026-10-10"),
  todo("late-done", "2026-10-10", { completedAt: "2026-10-11T08:00:00Z" }),
  todo("undated", null),
  daily("stretch", "g1"),
];

test("only the selected date's tasks are listed — nothing from other days", () => {
  const tomorrow = buildDay({ tasks: TASKS, goals: [goal("g1")], today: TODAY, date: "2026-10-14" });
  assert.deepEqual(ids(tomorrow.scheduled), ["tomorrow-high", "tomorrow-plain"], "high priority first");
  assert.deepEqual(tomorrow.overdue, [], "overdue work only shows on today");
  assert.equal(tomorrow.dailyMode, "future");
  assert.deepEqual(tomorrow.daily.map((d) => d.task.id), ["stretch"]);

  const friday = buildDay({ tasks: TASKS, goals: [goal("g1")], today: TODAY, date: "2026-10-15" });
  assert.deepEqual(ids(friday.scheduled), ["roadmap-15"]);
  const later = buildDay({ tasks: TASKS, goals: [goal("g1")], today: TODAY, date: "2026-11-20" });
  assert.deepEqual(later.scheduled, []);
  assert.deepEqual(later.daily, [], "the goal has ended by then");
});

test("today: its own tasks, plus open overdue ones in their own group, each once and never moved", () => {
  const day = buildDay({ tasks: [...TASKS, TASKS[0]], goals: [goal("g1")], today: TODAY, date: TODAY });
  assert.deepEqual(ids(day.scheduled), ["today-todo"]);
  assert.deepEqual(ids(day.overdue), ["late-open"], "done and future tasks are not overdue");
  assert.equal(day.overdue[0].dueDate, "2026-10-10", "its date is unchanged");
  assert.equal(day.dailyMode, "today");
});

test("a past date shows what was planned for it, done or not, and nothing else", () => {
  const past = buildDay({ tasks: TASKS, goals: [goal("g1")], today: TODAY, date: "2026-10-10" });
  assert.deepEqual(ids(past.scheduled), ["late-open", "late-done"], "open first, then done");
  assert.deepEqual(past.overdue, []);
  assert.equal(past.dailyMode, "past");
  assert.deepEqual(past.daily, [], "per-day ticks aren't known here, so daily tasks aren't guessed");
});

test("finished goals: their open roadmap tasks and daily tasks drop out; done ones stay as history", () => {
  const done = goal("done", { completedAt: "2026-10-12T00:00:00Z" });
  const tasks = [roadmap("open", "done", "2026-10-14"), roadmap("finished", "done", "2026-10-11", { roadmapStatus: "completed" }), daily("d", "done")];
  assert.deepEqual(buildDay({ tasks, goals: [done], today: TODAY, date: "2026-10-14" }).scheduled, []);
  assert.deepEqual(ids(buildDay({ tasks, goals: [done], today: TODAY, date: "2026-10-11" }).scheduled), ["finished"]);
  assert.deepEqual(buildDay({ tasks, goals: [done], today: TODAY, date: TODAY }).daily, []);
});

test("only roadmap goals covering the date accept dated tasks", () => {
  const goals = [goal("roadmap-goal"), goal("daily-goal", { progress: { basis: "daily" } }), goal("done", { completedAt: "x" })];
  assert.deepEqual(goalsAcceptingDatedTasks(goals, "2026-10-20").map((g) => g.id), ["roadmap-goal"]);
  assert.deepEqual(goalsAcceptingDatedTasks(goals, "2026-11-20"), [], "outside the goal's dates");
});
