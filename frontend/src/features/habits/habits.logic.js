// Pure helpers for habits: wizard steps and validation, API payloads, labels.
// No React, no API calls — unit-tested with `npm test` (node --test). The server re-validates
// everything; these checks only give users fast, friendly feedback.

export const SCHEDULE_OPTIONS = [
  { value: "daily", label: "Every day", hint: "A small action you repeat daily" },
  { value: "weekdays", label: "On specific days", hint: "Pick the days of the week" },
  { value: "timesPerWeek", label: "A number of times per week", hint: "Any days, e.g. 3 times a week" },
  { value: "timesPerMonth", label: "A number of times per month", hint: "Any days, e.g. 8 times a month" },
];

export const TRACKING_OPTIONS = [
  { value: "checkbox", label: "Done / not done", hint: "Tick it off when you did it" },
  { value: "measurable", label: "A daily target", hint: "Minutes, pages, reps, litres…" },
  { value: "percentage", label: "Percentage", hint: "Rate how much of it you did, 0–100%" },
];

// Monday first; values are JS weekday numbers (0 = Sunday), as the API expects.
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

export const UNIT_SUGGESTIONS = ["minutes", "pages", "reps", "litres", "km", "steps", "sessions"];

export const HABIT_STEPS = [
  { id: "basics", label: "Basics" },
  { id: "schedule", label: "Schedule" },
  { id: "tracking", label: "Tracking" },
  { id: "milestones", label: "Milestones" },
  { id: "review", label: "Review" },
];

/** Day statuses from the API: how each day without/with a log is shown. */
export const DAY_STATUS = {
  done: { label: "Done", tone: "done" },
  partial: { label: "Partly done", tone: "partial" },
  zero: { label: "Logged 0%", tone: "zero" },
  missed: { label: "Missed", tone: "missed" },
  pending: { label: "Not logged yet", tone: "pending" },
  rest: { label: "Rest day", tone: "rest" },
  open: { label: "Not logged", tone: "open" },
  future: { label: "Upcoming", tone: "future" },
  outside: { label: "Outside habit dates", tone: "outside" },
};

const MAX_MILESTONES = 20;

export function emptyHabitForm(today = "") {
  return {
    title: "",
    motivation: "",
    description: "",
    lifeAreaId: "",
    icon: "",
    color: "",
    scheduleType: "daily",
    weekdays: [1, 2, 3, 4, 5],
    timesPerPeriod: "3",
    startDate: today,
    endDate: "",
    trackingMethod: "checkbox",
    targetValue: "",
    unit: "minutes",
    milestones: [],
  };
}

/** Form values for editing an existing habit. */
export function formFromHabit(habit) {
  return {
    ...emptyHabitForm(habit.startDate),
    title: habit.title,
    motivation: habit.motivation ?? "",
    description: habit.description ?? "",
    lifeAreaId: habit.lifeAreaId ?? "",
    icon: habit.icon ?? "",
    color: habit.color ?? "",
    scheduleType: habit.schedule.type,
    weekdays: habit.schedule.weekdays ?? [1, 2, 3, 4, 5],
    timesPerPeriod: String(habit.schedule.timesPerPeriod ?? 3),
    startDate: habit.startDate,
    endDate: habit.endDate ?? "",
    trackingMethod: habit.trackingMethod,
    targetValue: habit.targetValue != null ? String(habit.targetValue) : "",
    unit: habit.unit || "minutes",
    milestones: (habit.milestones ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? "",
      targetValue: m.targetValue != null ? String(m.targetValue) : "",
      targetDate: m.targetDate ?? "",
    })),
  };
}

const isPositive = (value) => value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
const isInt = (value, min, max) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

/** Errors for one wizard step ({} when the step is valid). Field keys match the form. */
export function validateStep(stepId, values) {
  const errors = {};
  if (stepId === "basics") {
    if (!values.title.trim()) errors.title = "Give your habit a name.";
    else if (values.title.trim().length > 120) errors.title = "Keep the name under 120 characters.";
    if (values.motivation.length > 500) errors.motivation = "Keep this under 500 characters.";
    if (values.description.length > 1000) errors.description = "Keep this under 1000 characters.";
  }
  if (stepId === "schedule") {
    if (values.scheduleType === "weekdays" && values.weekdays.length === 0) errors.weekdays = "Pick at least one day.";
    if (values.scheduleType === "timesPerWeek" && !isInt(values.timesPerPeriod, 1, 7)) errors.timesPerPeriod = "Choose 1 to 7 times a week.";
    if (values.scheduleType === "timesPerMonth" && !isInt(values.timesPerPeriod, 1, 31)) errors.timesPerPeriod = "Choose 1 to 31 times a month.";
    if (!values.startDate) errors.startDate = "Pick a start date.";
    if (values.endDate && values.startDate && values.endDate < values.startDate) errors.endDate = "The end date can't be before the start date.";
  }
  if (stepId === "tracking" && values.trackingMethod === "measurable") {
    if (!isPositive(values.targetValue)) errors.targetValue = "Set a daily target above 0.";
    if (!values.unit.trim()) errors.unit = "Add a unit, such as minutes or pages.";
  }
  if (stepId === "milestones") {
    if (values.milestones.length > MAX_MILESTONES) errors.milestones = `Up to ${MAX_MILESTONES} milestones.`;
    values.milestones.forEach((m, i) => {
      if (!m.title.trim()) errors[`milestone-${i}-title`] = "Give this milestone a title.";
      if (m.targetValue !== "" && !isPositive(m.targetValue)) errors[`milestone-${i}-targetValue`] = "Use a number above 0, or leave it empty.";
      if (m.targetDate && values.startDate && m.targetDate < values.startDate) errors[`milestone-${i}-targetDate`] = "This is before the habit starts.";
      if (m.targetDate && values.endDate && m.targetDate > values.endDate) errors[`milestone-${i}-targetDate`] = "This is after the habit ends.";
    });
  }
  return errors;
}

/** The first step with errors, or null when the whole form is valid. */
export function firstInvalidStep(values) {
  for (const step of HABIT_STEPS) {
    const errors = validateStep(step.id, values);
    if (Object.keys(errors).length) return { stepId: step.id, errors };
  }
  return null;
}

/** API payload from the form (only the fields the chosen options use). */
export function toHabitPayload(values) {
  const schedule = { type: values.scheduleType };
  if (values.scheduleType === "weekdays") schedule.weekdays = [...values.weekdays].sort((a, b) => a - b);
  if (values.scheduleType === "timesPerWeek" || values.scheduleType === "timesPerMonth") schedule.timesPerPeriod = Number(values.timesPerPeriod);

  const measurable = values.trackingMethod === "measurable";
  return {
    title: values.title.trim(),
    motivation: values.motivation.trim(),
    description: values.description.trim(),
    lifeAreaId: values.lifeAreaId || null,
    icon: values.icon || null,
    color: values.color || null,
    schedule,
    startDate: values.startDate,
    endDate: values.endDate || null,
    trackingMethod: values.trackingMethod,
    targetValue: measurable ? Number(values.targetValue) : null,
    unit: measurable ? values.unit.trim() : "",
    milestones: values.milestones.map((m) => ({
      ...(m.id ? { _id: m.id } : {}),
      title: m.title.trim(),
      description: m.description.trim(),
      targetValue: m.targetValue === "" ? null : Number(m.targetValue),
      targetDate: m.targetDate || null,
    })),
  };
}

// ---------------------------------------------------------------- labels

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function scheduleLabel(schedule) {
  switch (schedule?.type) {
    case "daily":
      return "Every day";
    case "weekdays": {
      const days = WEEKDAYS.filter((d) => schedule.weekdays?.includes(d.value));
      if (days.length === 7) return "Every day";
      if (days.length === 5 && !schedule.weekdays.includes(0) && !schedule.weekdays.includes(6)) return "Weekdays";
      return days.map((d) => d.short).join(", ");
    }
    case "timesPerWeek":
      return `${plural(schedule.timesPerPeriod, "time")} a week`;
    case "timesPerMonth":
      return `${plural(schedule.timesPerPeriod, "time")} a month`;
    default:
      return "—";
  }
}

export function trackingLabel(habit) {
  if (habit.trackingMethod === "measurable") return `${formatNumber(habit.targetValue)} ${habit.unit} a day`;
  if (habit.trackingMethod === "percentage") return "Percentage (0–100%)";
  return "Done / not done";
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

/** Preview of the percentage the server will store (display only; the server computes it). */
export function previewPercent(habit, { progressPercent, actualValue, completed }) {
  if (habit.trackingMethod === "percentage") {
    const value = Number(progressPercent);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
  }
  if (habit.trackingMethod === "measurable") {
    const value = Number(actualValue);
    const target = Number(habit.targetValue);
    if (actualValue === "" || !Number.isFinite(value) || value < 0) return null;
    return target > 0 ? Math.min(100, Math.round((value / target) * 10000) / 100) : 0;
  }
  return completed ? 100 : 0;
}

/** "1.5 of 3 this week" for flexible habits; "2 of 3 scheduled days done this week" for fixed ones. */
export function periodLabel(habit) {
  const period = habit.period;
  if (!period) return "";
  const span = period.type === "month" ? "this month" : "this week";
  if (period.target != null) return `${formatNumber(period.credit)} of ${period.target} ${span}`;
  if (!period.scheduledDays) return `No scheduled days yet ${span}`;
  return `${period.completedDays} of ${plural(period.scheduledDays, "scheduled day")} done ${span}`;
}
