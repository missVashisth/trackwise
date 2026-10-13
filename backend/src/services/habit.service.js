// Habit rules: input validation, schedules, daily progress and history.
//
// Dates: a habit's startDate/endDate and every log's dateKey are calendar days ("YYYY-MM-DD") in
// the user's time zone, the same convention as task completions. "Today" is always the user's
// local date (getTodayDateKey(timeZone)), never the server's.
//
// Missing logs are never stored. History marks a day without a log as:
//   "missed"  – a scheduled day that has ended,      "rest"  – not a scheduled day,
//   "open"    – a flexible habit's day (any day can count toward the period target),
//   "pending" – today, still in progress ("Not logged yet"), "future" / "outside" – not countable.
// Insights should read these the same way: only scheduled, active, finished days count as zero.

const mongoose = require("mongoose");
const { isValidDateKey } = require("../utils/validation");

const SCHEDULE_TYPES = ["daily", "weekdays", "timesPerWeek", "timesPerMonth"];
const TRACKING_METHODS = ["percentage", "measurable", "checkbox"];
const MAX_MILESTONES = 20;
const MAX_HISTORY_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const round2 = (n) => Number(n.toFixed(2));
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// ---------------------------------------------------------------- calendar helpers (date keys)

const keyToUtc = (dateKey) => Date.parse(`${dateKey}T00:00:00Z`);
const shiftKey = (dateKey, days) => new Date(keyToUtc(dateKey) + days * MS_PER_DAY).toISOString().slice(0, 10);
const daysBetween = (fromKey, toKey) => Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / MS_PER_DAY);
/** 0 = Sunday ... 6 = Saturday, for the calendar day itself (no time zone involved). */
const weekdayOf = (dateKey) => new Date(keyToUtc(dateKey)).getUTCDay();

/** The flexible period containing dateKey: ISO week (Monday–Sunday) or calendar month. */
function periodOf(scheduleType, dateKey) {
  if (scheduleType === "timesPerMonth") {
    const from = `${dateKey.slice(0, 7)}-01`;
    const [y, m] = dateKey.split("-").map(Number);
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month = last day
    return { type: "month", from, to };
  }
  const from = shiftKey(dateKey, -((weekdayOf(dateKey) + 6) % 7)); // back to Monday
  return { type: "week", from, to: shiftKey(from, 6) };
}

// ---------------------------------------------------------------- validation

function text(value, { field, max, required = false }) {
  if (value === undefined || value === null || value === "") {
    return required ? { error: `${field} is required` } : { value: "" };
  }
  if (typeof value !== "string") return { error: `${field} must be text` };
  const trimmed = value.trim();
  if (required && !trimmed) return { error: `${field} is required` };
  if (trimmed.length > max) return { error: `${field} must be at most ${max} characters` };
  return { value: trimmed };
}

function positiveNumber(value, { field, max = 1_000_000 }) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number <= 0 || number > max) {
    return { error: `${field} must be a number greater than 0` };
  }
  return { value: number };
}

function validateSchedule(input) {
  if (!isPlainObject(input)) return { error: "Choose how often you want to do this habit" };
  if (!SCHEDULE_TYPES.includes(input.type)) return { error: `Schedule type must be one of: ${SCHEDULE_TYPES.join(", ")}` };

  if (input.type === "daily") return { value: { type: "daily" } };

  if (input.type === "weekdays") {
    const days = Array.isArray(input.weekdays) ? input.weekdays.map(Number) : [];
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { error: "Pick at least one weekday (0 = Sunday … 6 = Saturday)" };
    }
    return { value: { type: "weekdays", weekdays: [...new Set(days)].sort((a, b) => a - b) } };
  }

  const max = input.type === "timesPerWeek" ? 7 : 31;
  const times = Number(input.timesPerPeriod);
  if (!Number.isInteger(times) || times < 1 || times > max) {
    return { error: `Times per ${input.type === "timesPerWeek" ? "week" : "month"} must be a whole number from 1 to ${max}` };
  }
  return { value: { type: input.type, timesPerPeriod: times } };
}

function validateMilestones(input, { startDate, endDate, existing = [] }) {
  if (input === undefined || input === null) return { value: [] };
  if (!Array.isArray(input)) return { error: "Milestones must be a list" };
  if (input.length > MAX_MILESTONES) return { error: `A habit can have at most ${MAX_MILESTONES} milestones` };

  const previous = new Map(existing.map((m) => [String(m._id), m]));
  const milestones = [];
  for (const [index, raw] of input.entries()) {
    const label = `Milestone ${index + 1}`;
    if (!isPlainObject(raw)) return { error: `${label} is invalid` };
    const title = text(raw.title, { field: `${label} title`, max: 120, required: true });
    if (title.error) return title;
    const description = text(raw.description, { field: `${label} description`, max: 500 });
    if (description.error) return description;
    const targetUnit = text(raw.targetUnit, { field: `${label} unit`, max: 20 });
    if (targetUnit.error) return targetUnit;

    let targetValue = null;
    if (raw.targetValue !== undefined && raw.targetValue !== null && raw.targetValue !== "") {
      const parsed = positiveNumber(raw.targetValue, { field: `${label} target` });
      if (parsed.error) return parsed;
      targetValue = parsed.value;
    }

    let targetDate = null;
    if (raw.targetDate !== undefined && raw.targetDate !== null && raw.targetDate !== "") {
      if (!isValidDateKey(raw.targetDate)) return { error: `${label} target date must be a valid YYYY-MM-DD date` };
      if (raw.targetDate < startDate) return { error: `${label} target date cannot be before the habit starts` };
      if (endDate && raw.targetDate > endDate) return { error: `${label} target date cannot be after the habit ends` };
      targetDate = raw.targetDate;
    }

    const milestone = { title: title.value, description: description.value, targetValue, targetUnit: targetUnit.value, targetDate };
    // Editing keeps an existing milestone's identity and completion.
    const kept = raw._id && previous.get(String(raw._id));
    if (kept) Object.assign(milestone, { _id: kept._id, completedAt: kept.completedAt ?? null });
    milestones.push(milestone);
  }
  return { value: milestones };
}

/**
 * Validates a habit for create (existing = null) or update (existing = the stored habit; only the
 * fields present in `body` change). Returns { fields } or { error }. `today` is the user's date.
 */
function validateHabit(body, { existing = null, today }) {
  if (!isPlainObject(body)) return { error: "Invalid habit" };
  const has = (key) => body[key] !== undefined;
  const fields = {};

  if (!existing || has("title")) {
    const title = text(body.title, { field: "Habit name", max: 120, required: true });
    if (title.error) return title;
    fields.title = title.value;
  }
  for (const [key, field, max] of [["motivation", "Motivation", 500], ["description", "Description", 1000]]) {
    if (!existing || has(key)) {
      const value = text(body[key], { field, max });
      if (value.error) return value;
      fields[key] = value.value;
    }
  }
  if (!existing || has("lifeAreaId")) {
    if (body.lifeAreaId === undefined || body.lifeAreaId === null || body.lifeAreaId === "") fields.lifeAreaId = null;
    else if (typeof body.lifeAreaId !== "string" || !mongoose.Types.ObjectId.isValid(body.lifeAreaId)) return { error: "Invalid category" };
    else fields.lifeAreaId = body.lifeAreaId;
  }
  if (!existing || has("icon")) {
    if (body.icon === undefined || body.icon === null || body.icon === "") fields.icon = null;
    else if (typeof body.icon !== "string" || !/^[a-z0-9-]{1,40}$/.test(body.icon)) return { error: "Invalid icon" };
    else fields.icon = body.icon;
  }
  if (!existing || has("color")) {
    if (body.color === undefined || body.color === null || body.color === "") fields.color = null;
    else if (typeof body.color !== "string" || !/^[a-z]{1,20}$/.test(body.color)) return { error: "Invalid color" };
    else fields.color = body.color;
  }

  if (!existing || has("schedule")) {
    const schedule = validateSchedule(body.schedule);
    if (schedule.error) return schedule;
    fields.schedule = schedule.value;
  }

  // Dates
  const startDate = has("startDate") ? body.startDate : existing?.startDate ?? today;
  if (!isValidDateKey(startDate)) return { error: "Start date must be a valid YYYY-MM-DD date" };
  if (!existing || has("startDate")) fields.startDate = startDate;
  let endDate = existing?.endDate ?? null;
  if (has("endDate")) endDate = body.endDate === null || body.endDate === "" ? null : body.endDate;
  if (endDate !== null) {
    if (!isValidDateKey(endDate)) return { error: "End date must be a valid YYYY-MM-DD date" };
    if (endDate < startDate) return { error: "End date cannot be before the start date" };
  }
  if (!existing || has("endDate")) fields.endDate = endDate;

  // Tracking method and target
  const method = has("trackingMethod") ? body.trackingMethod : existing?.trackingMethod;
  if (!TRACKING_METHODS.includes(method)) return { error: `Tracking method must be one of: ${TRACKING_METHODS.join(", ")}` };
  if (!existing || has("trackingMethod")) fields.trackingMethod = method;
  if (method === "measurable") {
    if (!existing || has("targetValue") || has("trackingMethod")) {
      const target = positiveNumber(body.targetValue, { field: "Daily target" });
      if (target.error) return target;
      fields.targetValue = target.value;
    }
    if (!existing || has("unit") || has("trackingMethod")) {
      const unit = text(body.unit, { field: "Unit", max: 20, required: true });
      if (unit.error) return { error: "Give the target a unit, such as minutes or pages" };
      fields.unit = unit.value;
    }
  } else if (!existing || has("trackingMethod")) {
    fields.targetValue = null;
    fields.unit = "";
  }

  if (!existing || has("milestones")) {
    const milestones = validateMilestones(body.milestones, { startDate, endDate, existing: existing?.milestones ?? [] });
    if (milestones.error) return milestones;
    fields.milestones = milestones.value;
  }

  return { fields };
}

// ---------------------------------------------------------------- daily progress

/**
 * The day's record from what the user entered, by tracking method. Values replace the day's
 * previous entry (never added to it). Returns { progressPercent, actualValue, targetValue } or { error }.
 *   percentage: progressPercent 0–100
 *   measurable: actualValue >= 0 -> min(100, actual / target × 100)
 *   checkbox:   completed true/false -> 100 / 0
 */
function computeProgress(habit, input) {
  const body = isPlainObject(input) ? input : {};
  if (habit.trackingMethod === "percentage") {
    const value = typeof body.progressPercent === "string" && body.progressPercent.trim() !== "" ? Number(body.progressPercent) : body.progressPercent;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      return { error: "Progress must be a percentage from 0 to 100" };
    }
    return { progressPercent: round2(value), actualValue: null, targetValue: null };
  }
  if (habit.trackingMethod === "measurable") {
    const value = typeof body.actualValue === "string" && body.actualValue.trim() !== "" ? Number(body.actualValue) : body.actualValue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000_000) {
      return { error: `Enter how much you did today${habit.unit ? ` (${habit.unit})` : ""}, 0 or more` };
    }
    const target = Number(habit.targetValue);
    const percent = Number.isFinite(target) && target > 0 ? Math.min(100, (value / target) * 100) : 0;
    return { progressPercent: round2(percent), actualValue: value, targetValue: Number.isFinite(target) && target > 0 ? target : null };
  }
  if (body.completed !== true && body.completed !== false) return { error: "completed must be true or false" };
  return { progressPercent: body.completed ? 100 : 0, actualValue: null, targetValue: null };
}

/** Whether a log may be written for dateKey: inside the habit's dates and not in the future. */
function checkLogDate(habit, dateKey, today) {
  if (!isValidDateKey(dateKey)) return "Invalid date. Use YYYY-MM-DD";
  if (dateKey > today) return "You can't log progress for a future day";
  if (dateKey < habit.startDate) return "This day is before the habit started";
  if (habit.endDate && dateKey > habit.endDate) return "This day is after the habit ended";
  return null;
}

// ---------------------------------------------------------------- schedule and history

/** "outside" | "scheduled" | "rest" | "flexible" for one calendar day. */
function dayRequirement(habit, dateKey) {
  if (dateKey < habit.startDate || (habit.endDate && dateKey > habit.endDate)) return "outside";
  const { type, weekdays = [] } = habit.schedule;
  if (type === "daily") return "scheduled";
  if (type === "weekdays") return weekdays.includes(weekdayOf(dateKey)) ? "scheduled" : "rest";
  return "flexible";
}

function dayStatus(habit, dateKey, log, today) {
  const requirement = dayRequirement(habit, dateKey);
  if (dateKey > today) return requirement === "outside" ? "outside" : "future";
  if (log) return log.progressPercent >= 100 ? "done" : log.progressPercent > 0 ? "partial" : "zero";
  if (requirement === "outside") return "outside";
  if (dateKey === today) return "pending"; // the day is not over: "Not logged yet"
  if (requirement === "scheduled") return "missed";
  return requirement === "rest" ? "rest" : "open";
}

/** Day-by-day history from `from` to `to` (inclusive, at most a year). */
function buildHistory(habit, logs, { from, to, today }) {
  const byDay = new Map(logs.map((log) => [log.dateKey, log]));
  const days = [];
  for (let key = from; key <= to; key = shiftKey(key, 1)) {
    const log = byDay.get(key) ?? null;
    days.push({
      dateKey: key,
      requirement: dayRequirement(habit, key),
      status: dayStatus(habit, key, log, today),
      progressPercent: log ? log.progressPercent : null,
      actualValue: log?.actualValue ?? null,
      note: log?.note ?? "",
    });
  }
  return days;
}

/** Date range for a history request: defaults to the last 30 days up to today. */
function historyRange(query, today) {
  const to = query.to ?? today;
  const from = query.from ?? shiftKey(to, -29);
  if (!isValidDateKey(from) || !isValidDateKey(to)) return { error: "from and to must be valid YYYY-MM-DD dates" };
  if (from > to) return { error: "from must not be after to" };
  if (daysBetween(from, to) + 1 > MAX_HISTORY_DAYS) return { error: `At most ${MAX_HISTORY_DAYS} days at a time` };
  return { from, to };
}

/**
 * Progress in the current period, for the habit list and detail.
 *   flexible habits: credit = sum of the period's day progress / 100 (partial days count partly),
 *                    against timesPerPeriod.
 *   fixed habits:    this week's scheduled days so far and their average progress.
 */
function currentPeriod(habit, logs, today) {
  const flexible = habit.schedule.type === "timesPerWeek" || habit.schedule.type === "timesPerMonth";
  const period = periodOf(habit.schedule.type, today);
  const inPeriod = logs.filter((log) => log.dateKey >= period.from && log.dateKey <= today);
  if (flexible) {
    const credit = round2(inPeriod.reduce((sum, log) => sum + Math.min(100, log.progressPercent), 0) / 100);
    return { ...period, target: habit.schedule.timesPerPeriod, credit, daysLogged: inPeriod.filter((l) => l.progressPercent > 0).length };
  }
  const scheduledDays = [];
  for (let key = period.from; key <= today; key = shiftKey(key, 1)) {
    if (dayRequirement(habit, key) === "scheduled") scheduledDays.push(key);
  }
  const byDay = new Map(inPeriod.map((log) => [log.dateKey, log.progressPercent]));
  const total = scheduledDays.reduce((sum, key) => sum + (byDay.get(key) ?? 0), 0);
  return {
    ...period,
    scheduledDays: scheduledDays.length,
    completedDays: scheduledDays.filter((key) => (byDay.get(key) ?? 0) >= 100).length,
    averagePercent: scheduledDays.length ? round2(total / scheduledDays.length) : null,
  };
}

/** Habit JSON for the API, with today's state and the current period. */
function serializeHabit(habit, { today, todayLog = null, periodLogs = [] }) {
  const data = typeof habit.toObject === "function" ? habit.toObject() : { ...habit };
  return {
    ...data,
    isArchived: Boolean(data.archivedAt),
    today: {
      dateKey: today,
      requirement: dayRequirement(data, today),
      status: dayStatus(data, today, todayLog, today),
      log: todayLog,
    },
    period: currentPeriod(data, periodLogs, today),
  };
}

/** Earliest day the current period of any habit can start (for one batched log query). */
function earliestPeriodStart(today) {
  const week = periodOf("timesPerWeek", today).from;
  const month = periodOf("timesPerMonth", today).from;
  return week < month ? week : month;
}

module.exports = {
  SCHEDULE_TYPES,
  TRACKING_METHODS,
  validateHabit,
  computeProgress,
  checkLogDate,
  dayRequirement,
  dayStatus,
  buildHistory,
  historyRange,
  currentPeriod,
  periodOf,
  serializeHabit,
  earliestPeriodStart,
  weekdayOf,
  shiftKey,
};
