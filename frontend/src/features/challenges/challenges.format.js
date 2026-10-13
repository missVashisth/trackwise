// Labels shared by the challenge pages.

export const CATEGORIES = [
  { id: "fitness", label: "Fitness" },
  { id: "learning", label: "Reading & learning" },
  { id: "wellness", label: "Wellness" },
  { id: "productivity", label: "Productivity" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "custom", label: "Custom" },
];
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** "Every day" / "Mon, Wed, Fri". */
export function scheduleLabel(days) {
  if (!days?.length || days.length === 7) return "Every day";
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  return days.map((d) => WEEKDAYS[d]).join(", ");
}

/** "Read 10 pages" / "No added sugar". */
export function ruleText(activity) {
  return activity.kind === "numeric" ? `${activity.title}: ${formatAmount(activity.target)} ${activity.unit}` : activity.title;
}

export const formatAmount = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** How a rule may be changed by the participant. */
export function ruleKind(activity) {
  if (!activity.required) return { label: "Optional", tone: "bg-slate-100 text-slate-600" };
  if (activity.customizable) return { label: "Required · adjustable target", tone: "bg-brand-50 text-brand-700" };
  return { label: "Required", tone: "bg-amber-50 text-amber-800" };
}

export const PHASE_LABEL = { upcoming: "Starts soon", running: "In progress", ended: "Finished", left: "Left" };

export const STRICT_RULE =
  "Strict rule: every required activity must be done every day. If a required activity is missed, you can keep going, but this run won't count as a full completion — you can restart at any time.";

/** Challenge day status -> calendar styles shared with Insights. */
export const DAY_TO_CALENDAR = { complete: "complete", partial: "partial", missed: "missed", rest: "none", today: "pending", future: "future" };
