// Pure helpers for roadmap tasks. Which list a task is in (roadmapStatus) is decided by the
// server from the user's local date; these only sort and group what the store already holds.

export const ROADMAP_STATUS = {
  today: { label: "Today", className: "bg-brand-50 text-brand-700 ring-brand-200" },
  pending: { label: "Overdue", className: "bg-red-50 text-red-700 ring-red-200" },
  upcoming: { label: "Upcoming", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  completed: { label: "Done", className: "bg-green-50 text-green-700 ring-green-200" },
};

export const byRoadmapOrder = (a, b) =>
  (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "") || (a.roadmapOrder ?? 0) - (b.roadmapOrder ?? 0);

export function splitGoalTasks(tasks) {
  const roadmap = tasks.filter((t) => t.isRoadmap).sort(byRoadmapOrder);
  const daily = tasks.filter((t) => !t.isRoadmap);
  return { roadmap, daily };
}

/** { today, pending, upcoming, completed } — completed newest first. */
export function groupRoadmapTasks(roadmapTasks) {
  const groups = { today: [], pending: [], upcoming: [], completed: [] };
  for (const task of roadmapTasks) (groups[task.roadmapStatus] ?? groups.upcoming).push(task);
  groups.completed.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  return groups;
}

/** [{ day, date, tasks }] in day order. */
export function roadmapDays(roadmapTasks) {
  const days = new Map();
  for (const task of roadmapTasks) {
    if (!days.has(task.scheduledDate)) days.set(task.scheduledDate, { day: task.roadmapDay, date: task.scheduledDate, tasks: [] });
    days.get(task.scheduledDate).tasks.push(task);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function formatMinutes(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
