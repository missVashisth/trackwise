// Domain vocabulary shared by every layer of the goals feature.

export const IMPACT = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

export const IMPACT_OPTIONS = [
  { value: IMPACT.HIGH, label: "High", bolts: 3, weight: 3 },
  { value: IMPACT.MEDIUM, label: "Medium", bolts: 2, weight: 2 },
  { value: IMPACT.LOW, label: "Low", bolts: 1, weight: 1 },
];

export const IMPACT_WEIGHT = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.weight]));

/** Mirrors Griply's success-metric list. `unit` is the default suffix/prefix. */
export const METRIC_TYPES = [
  { value: "numeric", label: "Numeric", hint: "Set a numeric target", unit: "" },
  { value: "percentage", label: "Percentage", hint: "E.g. 5% → 10%", unit: "%" },
  { value: "money", label: "Money", hint: "E.g. 0k → 100k", unit: "$", prefix: true },
  { value: "weight", label: "Weight", hint: "E.g. Lose 5kg", unit: "kg" },
  { value: "distance", label: "Distance", hint: "E.g. 5km → 10km", unit: "km" },
  { value: "time", label: "Time", hint: "E.g. 0 → 100 hours", unit: "h" },
  { value: "pages", label: "Pages", hint: "E.g. 0 → 497 pages", unit: "pages" },
  { value: "chapters", label: "Chapters", hint: "E.g. 0 → 10 chapters", unit: "chapters" },
  { value: "tasks", label: "Completed tasks", hint: "Progress from finished tasks", unit: "tasks" },
  { value: "subgoals", label: "Subgoal progress", hint: "Progress from milestones", unit: "subgoals" },
  { value: "custom", label: "Custom", hint: "Your own metric", unit: "" },
];

export const METRIC_BY_TYPE = Object.fromEntries(METRIC_TYPES.map((m) => [m.value, m]));

/** Metric types whose progress is a count of finished items, shown as a ring. */
export const COUNT_METRICS = new Set(["tasks", "subgoals"]);

export const GOAL_COLORS = [
  { value: "indigo", label: "Indigo", hex: "#4f46e5" },
  { value: "blue", label: "Blue", hex: "#2563eb" },
  { value: "green", label: "Green", hex: "#16a34a" },
  { value: "orange", label: "Orange", hex: "#ea580c" },
  { value: "pink", label: "Pink", hex: "#db2777" },
  { value: "amber", label: "Amber", hex: "#d97706" },
  { value: "teal", label: "Teal", hex: "#0d9488" },
  { value: "slate", label: "Slate", hex: "#475569" },
];

export const COLOR_HEX = Object.fromEntries(GOAL_COLORS.map((c) => [c.value, c.hex]));

export const GROUPING = { NONE: "none", LIFE_AREA: "lifeArea", DEADLINE: "deadline" };

export const GROUPING_OPTIONS = [
  { value: GROUPING.NONE, label: "No grouping" },
  { value: GROUPING.LIFE_AREA, label: "By life area" },
  { value: GROUPING.DEADLINE, label: "By deadline" },
];

export const STATUS_FILTER = { ACTIVE: "active", COMPLETED: "completed", ALL: "all" };

export const STATUS_OPTIONS = [
  { value: STATUS_FILTER.ACTIVE, label: "Active" },
  { value: STATUS_FILTER.COMPLETED, label: "Completed" },
  { value: STATUS_FILTER.ALL, label: "All" },
];

/** Table columns. `sortable` columns toggle sort when their header is clicked. */
export const GOAL_COLUMNS = [
  { key: "title", label: "Name", sortable: true },
  { key: "progress", label: "Progress", sortable: true },
  { key: "impact", label: "Impact", sortable: true },
  { key: "startDate", label: "Start date", sortable: true },
  { key: "deadline", label: "Deadline", sortable: true },
  { key: "tasksCount", label: "Tasks", sortable: true },
];
