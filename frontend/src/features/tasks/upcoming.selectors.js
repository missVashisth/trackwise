// Pure helpers for the Upcoming page, which shows the work of one selected date.
//
// Dated work: to-dos by `dueDate`, roadmap goal tasks by `scheduledDate` (both local "YYYY-MM-DD"
// keys, compared as strings — never converted through Date, so no time-zone shift). Daily goal tasks
// repeat every day their goal runs.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const keyToUtc = (key) => Date.parse(`${key}T00:00:00Z`);

export const shiftKey = (key, days) => new Date(keyToUtc(key) + days * MS_PER_DAY).toISOString().slice(0, 10);
export const isDateKey = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(keyToUtc(value)) && new Date(keyToUtc(value)).toISOString().slice(0, 10) === value;

const fmt = (key, options) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
export const weekdayLong = (key) => fmt(key, { weekday: "long" });
export const weekdayShort = (key) => fmt(key, { weekday: "short" });
export const dayMonth = (key) => fmt(key, { day: "numeric", month: "short" });
export const monthYear = (key) => fmt(key, { month: "long", year: "numeric" });

/** "Today" / "Tomorrow" / "Wednesday" for a day relative to `today`. */
export function dayLabel(key, today) {
  if (key === today) return "Today";
  if (key === shiftKey(today, 1)) return "Tomorrow";
  if (key === shiftKey(today, -1)) return "Yesterday";
  return weekdayLong(key);
}

/** The date a task is planned for, or null (daily goal tasks and undated to-dos). */
export function plannedDate(task) {
  if (task.isTodo) return task.dueDate ?? null;
  if (task.isRoadmap) return task.scheduledDate ?? null;
  return null;
}

/** To-dos and roadmap tasks: done once. Daily goal tasks: ticked for today. */
export const isDone = (task) => (task.isTodo ? Boolean(task.completedAt) : task.isRoadmap ? task.roadmapStatus === "completed" : Boolean(task.completedToday));

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const byPriorityThenTitle = (a, b) =>
  Number(isDone(a)) - Number(isDone(b)) ||
  (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
  a.title.localeCompare(b.title);

/** Is the goal running on dateKey (start..deadline, not completed)? */
const goalRunsOn = (goal, dateKey) =>
  !goal.completedAt && goal.startDate?.slice(0, 10) <= dateKey && (!goal.deadline || goal.deadline.slice(0, 10) >= dateKey);

/**
 * The work for ONE selected date.
 *   tasks: every task of the user (to-dos and goal tasks); goals: the user's goals;
 *   today: the user's local date; date: the selected date.
 * Returns:
 *   scheduled — to-dos due and roadmap tasks scheduled on `date` (done ones included, listed last);
 *   overdue   — only when `date` is today: open dated tasks from earlier days (never repeated in
 *               `scheduled`, never moved to another date);
 *   daily     — recurring goal tasks of goals running that day, each once. Their per-day ticks are
 *               only known for today, so `dailyMode` says how to show them: "today" (tickable),
 *               "future" (read-only) or "past" (not listed — history lives on the goal page).
 */
export function buildDay({ tasks, goals, today, date }) {
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const scheduled = [];
  const overdue = [];
  const daily = [];
  const seen = new Set();
  const dailyMode = date === today ? "today" : date > today ? "future" : "past";

  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    const goal = task.goalId ? goalById.get(task.goalId) : null;
    if (task.goalId && !goal) continue;

    if (!task.isTodo && !task.isRoadmap) {
      if (dailyMode !== "past" && goalRunsOn(goal, date)) daily.push({ task, goal });
      continue;
    }
    // Roadmap tasks of a completed goal are no longer actionable.
    if (goal?.completedAt && !isDone(task)) continue;
    const planned = plannedDate(task);
    if (planned === date) scheduled.push(task);
    else if (date === today && planned && planned < today && !isDone(task)) overdue.push(task);
  }

  scheduled.sort(byPriorityThenTitle);
  overdue.sort((a, b) => plannedDate(a).localeCompare(plannedDate(b)) || byPriorityThenTitle(a, b));
  daily.sort((a, b) => a.goal.title.localeCompare(b.goal.title) || a.task.title.localeCompare(b.task.title));
  return { scheduled, overdue, daily, dailyMode };
}

/** "Tuesday, 13 October 2026" (year only when it differs from today's). */
export function longDate(key, today) {
  return fmt(key, { weekday: "long", day: "numeric", month: "long", ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

/**
 * Goals a dated task can be added to from Upcoming: open goals that already plan their work as a
 * roadmap (scheduled one-time tasks), and whose dates include `dateKey`. Adding a scheduled task
 * to a daily-task goal would switch that goal's progress to roadmap progress, so those aren't offered.
 */
export function goalsAcceptingDatedTasks(goals, dateKey) {
  return goals.filter((goal) => {
    if (goal.completedAt || goal.progress?.basis !== "roadmap") return false;
    const start = goal.startDate?.slice(0, 10);
    const deadline = goal.deadline?.slice(0, 10);
    return Boolean(start && deadline && dateKey >= start && dateKey <= deadline);
  });
}
