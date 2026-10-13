// Non-component helpers shared by the goal dashboard.

export const GOAL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "progress", label: "Progress" },
  { id: "roadmap", label: "Roadmap" },
  { id: "tasks", label: "Tasks" },
];

export const GOAL_STATUS = {
  upcoming: { label: "Upcoming", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  active: { label: "Active", className: "bg-green-50 text-green-700 ring-green-200" },
  ended: { label: "Past deadline", className: "bg-orange-50 text-orange-700 ring-orange-200" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/** The backend's status; older (mock) data falls back to the flags it does have. */
export function goalStatusOf(goal) {
  if (goal.status) return goal.status;
  if (goal.completedAt) return "completed";
  return goal.isOngoing ? "active" : "upcoming";
}

/** Why a goal's tasks cannot be ticked today, or null when they can. */
export function tickBlockedReason(status) {
  if (status === "upcoming") return "This goal hasn’t started yet";
  if (status === "ended") return "This goal’s deadline has passed";
  if (status === "completed") return "This goal is completed";
  return null;
}

/** "+0.5" / "−2" with up to two decimals, for percentage points. */
export function formatPoints(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
