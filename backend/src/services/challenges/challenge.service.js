// Challenge catalogue, enrollment and daily tracking. Controllers stay thin; every function takes
// the authenticated user's id (never one from the request body).

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const ChallengeTemplate = require("../../models/challengeTemplate.model");
const ChallengeEnrollment = require("../../models/challengeEnrollment.model");
const ChallengeLog = require("../../models/challengeLog.model");
const { CATEGORIES, DIFFICULTIES, ACTIVITY_KINDS } = ChallengeTemplate;
const { BUILT_IN_TEMPLATES } = require("./catalog");
const { buildReport, progressFor, isScheduled, shiftKey, phaseOf } = require("./challengeReport");
const { isValidDateKey } = require("../../utils/validation");
const logger = require("../../utils/logger");

const MAX_ACTIVITIES = 10;
const MAX_START_DELAY_DAYS = 30;
const MAX_NUMERIC = 100000;

class ChallengeError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.name = "ChallengeError";
    this.status = status;
    if (code) this.code = code;
  }
}

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const isObjectId = (value) => typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value;

// ---------------------------------------------------------------- catalogue

let seeded = null;
/** Inserts missing built-in templates (by slug). Never overwrites an existing one. */
function ensureBuiltIns() {
  if (!seeded) {
    seeded = ChallengeTemplate.bulkWrite(
      BUILT_IN_TEMPLATES.map((template) => ({
        updateOne: { filter: { slug: template.slug }, update: { $setOnInsert: { ...template, ownerId: null, status: "published", version: 1 } }, upsert: true },
      })),
      { ordered: false },
    ).catch((err) => {
      seeded = null; // try again next time
      // Two processes seeding at once: the unique slug index makes the loser's upserts duplicates.
      if (err.code !== 11000) throw err;
    });
  }
  return seeded;
}

/** Tests only. */
function resetSeedState() {
  seeded = null;
}

/** Templates this user may see: published built-ins, plus their own private ones. */
const visibleTo = (userId) => ({ $or: [{ status: "published" }, { ownerId: new mongoose.Types.ObjectId(String(userId)), status: "private" }] });

/** Active participants per template (running or about to start; not finished or left). */
async function participantCounts(templateIds) {
  if (!templateIds.length) return new Map();
  // Any participant whose last day is not yet over anywhere on Earth (UTC-12 is a day behind).
  const earliestOpenDay = shiftKey(new Date().toISOString().slice(0, 10), -1);
  const rows = await ChallengeEnrollment.aggregate([
    { $match: { templateId: { $in: templateIds }, status: "active", endDate: { $gte: earliestOpenDay } } },
    { $group: { _id: "$templateId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

function serializeTemplate(template, { participants = 0, myEnrollment = null, userId } = {}) {
  return {
    id: String(template._id),
    title: template.title,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    durationDays: template.durationDays,
    strict: template.strict,
    activities: template.activities.map((a) => ({ key: a.key, title: a.title, description: a.description, kind: a.kind, target: a.target, unit: a.unit, required: a.required, customizable: a.customizable, days: a.days })),
    ruleCount: template.activities.length,
    requiredCount: template.activities.filter((a) => a.required).length,
    builtIn: !template.ownerId,
    mine: Boolean(template.ownerId && userId && String(template.ownerId) === String(userId)),
    status: template.status,
    version: template.version,
    participants,
    myEnrollmentId: myEnrollment ? String(myEnrollment._id) : null,
    updatedAt: template.updatedAt,
  };
}

async function listTemplates(userId, { category } = {}) {
  await ensureBuiltIns();
  const filter = visibleTo(userId);
  if (category) {
    if (!CATEGORIES.includes(category)) throw new ChallengeError(`Category must be one of: ${CATEGORIES.join(", ")}`);
    filter.category = category;
  }
  const templates = await ChallengeTemplate.find(filter).sort({ ownerId: 1, durationDays: 1, title: 1 }).lean();
  const ids = templates.map((t) => t._id);
  const [counts, mine] = await Promise.all([
    participantCounts(ids),
    ChallengeEnrollment.find({ userId, templateId: { $in: ids }, status: "active" }, { templateId: 1 }).lean(),
  ]);
  const mineByTemplate = new Map(mine.map((e) => [String(e.templateId), e]));
  return templates.map((t) => serializeTemplate(t, { participants: counts.get(String(t._id)) ?? 0, myEnrollment: mineByTemplate.get(String(t._id)), userId }));
}

async function findVisibleTemplate(userId, templateId) {
  if (!isObjectId(templateId)) throw new ChallengeError("Invalid challenge ID", 400);
  await ensureBuiltIns();
  const template = await ChallengeTemplate.findOne({ _id: templateId, ...visibleTo(userId) }).lean();
  if (!template) throw new ChallengeError("Challenge not found", 404, "CHALLENGE_NOT_FOUND");
  return template;
}

async function getTemplate(userId, templateId) {
  const template = await findVisibleTemplate(userId, templateId);
  const [counts, attempts] = await Promise.all([
    participantCounts([template._id]),
    ChallengeEnrollment.find({ userId, templateId: template._id }).sort({ attempt: -1 }).lean(),
  ]);
  const active = attempts.find((e) => e.status === "active");
  return {
    ...serializeTemplate(template, { participants: counts.get(String(template._id)) ?? 0, myEnrollment: active, userId }),
    myAttempts: attempts.map((e) => ({ id: String(e._id), attempt: e.attempt, status: e.status, startDate: e.startDate, endDate: e.endDate })),
  };
}

/** Validates a user's own template. Returns clean fields or throws ChallengeError (400). */
function validateTemplateInput(body, existing = null) {
  const input = body && typeof body === "object" ? body : {};
  const title = text(input.title ?? existing?.title, 81);
  if (title.length < 3 || title.length > 80) throw new ChallengeError("Give the challenge a title of 3–80 characters");
  const description = text(input.description ?? existing?.description ?? "", 501);
  if (description.length > 500) throw new ChallengeError("Keep the description under 500 characters");
  const category = input.category ?? existing?.category ?? "custom";
  if (!CATEGORIES.includes(category)) throw new ChallengeError(`Category must be one of: ${CATEGORIES.join(", ")}`);
  const difficulty = input.difficulty ?? existing?.difficulty ?? "medium";
  if (!DIFFICULTIES.includes(difficulty)) throw new ChallengeError(`Difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
  const durationDays = Number(input.durationDays ?? existing?.durationDays);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) throw new ChallengeError("Duration must be a whole number of days between 1 and 365");
  const strict = input.strict === undefined ? Boolean(existing?.strict) : input.strict === true;

  const rawActivities = input.activities ?? existing?.activities;
  if (!Array.isArray(rawActivities) || rawActivities.length < 1 || rawActivities.length > MAX_ACTIVITIES) {
    throw new ChallengeError(`Add between 1 and ${MAX_ACTIVITIES} daily activities`);
  }
  const keys = new Set();
  const activities = rawActivities.map((raw, index) => {
    const a = raw && typeof raw === "object" ? raw : {};
    const label = `Activity ${index + 1}`;
    const activityTitle = text(a.title, 81);
    if (!activityTitle || activityTitle.length > 80) throw new ChallengeError(`${label}: give it a title of up to 80 characters`);
    if (!ACTIVITY_KINDS.includes(a.kind)) throw new ChallengeError(`${label}: type must be checkbox or numeric`);
    let target = null;
    let unit = "";
    if (a.kind === "numeric") {
      target = Number(a.target);
      if (!Number.isFinite(target) || target <= 0 || target > MAX_NUMERIC) throw new ChallengeError(`${label}: set a target above 0`);
      unit = text(a.unit, 21);
      if (!unit || unit.length > 20) throw new ChallengeError(`${label}: give the target a unit (up to 20 characters), e.g. pages or minutes`);
    }
    const days = a.days === undefined || a.days === null ? [] : a.days;
    if (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ChallengeError(`${label}: weekdays must be numbers 0 (Sunday) to 6 (Saturday)`);
    // Keep existing keys stable (logs refer to them); new activities get a fresh one.
    let key = typeof a.key === "string" && /^[a-z0-9-]{1,40}$/.test(a.key) ? a.key : crypto.randomUUID().slice(0, 8);
    if (keys.has(key)) key = crypto.randomUUID().slice(0, 8);
    keys.add(key);
    return {
      key,
      title: activityTitle,
      description: text(a.description, 300),
      kind: a.kind,
      target,
      unit,
      required: a.required !== false,
      customizable: a.customizable === true,
      days: [...new Set(days)].sort(),
    };
  });
  if (!activities.some((a) => a.required)) throw new ChallengeError("At least one activity must be required");
  return { title, description, category, difficulty, durationDays, strict, activities };
}

async function createTemplate(userId, body) {
  const fields = validateTemplateInput(body);
  const template = await ChallengeTemplate.create({ ...fields, ownerId: userId, status: "private", version: 1 });
  return serializeTemplate(template.toObject(), { userId });
}

async function ownTemplate(userId, templateId) {
  if (!isObjectId(templateId)) throw new ChallengeError("Invalid challenge ID", 400);
  const template = await ChallengeTemplate.findOne({ _id: templateId, ownerId: userId, status: { $ne: "archived" } });
  if (!template) throw new ChallengeError("Challenge not found", 404, "CHALLENGE_NOT_FOUND");
  return template;
}

/** Owner edits create a new version; running enrollments keep the rules they joined with. */
async function updateTemplate(userId, templateId, body) {
  const template = await ownTemplate(userId, templateId);
  const fields = validateTemplateInput(body, template.toObject());
  Object.assign(template, fields);
  template.version += 1;
  await template.save();
  return serializeTemplate(template.toObject(), { userId });
}

async function archiveTemplate(userId, templateId) {
  const template = await ownTemplate(userId, templateId);
  template.status = "archived";
  await template.save();
  return { id: String(template._id), status: template.status };
}

// ---------------------------------------------------------------- enrollment

function serializeEnrollment(enrollment, today, report = null) {
  return {
    id: String(enrollment._id),
    templateId: String(enrollment.templateId),
    attempt: enrollment.attempt,
    status: enrollment.status,
    phase: phaseOf(enrollment, today),
    title: enrollment.title,
    description: enrollment.description,
    category: enrollment.category,
    durationDays: enrollment.durationDays,
    strict: enrollment.strict,
    startDate: enrollment.startDate,
    endDate: enrollment.endDate,
    templateVersion: enrollment.templateVersion,
    activities: enrollment.activities.map((a) => ({ key: a.key, title: a.title, description: a.description, kind: a.kind, target: a.target, unit: a.unit, required: a.required, customizable: a.customizable, days: a.days, enabled: a.enabled !== false })),
    reminders: enrollment.reminders,
    leftAt: enrollment.leftAt,
    today,
    ...(report ? { summary: summarize(report) } : {}),
  };
}

/** The compact numbers shown on cards and lists. */
function summarize(report) {
  return {
    currentDay: report.currentDay,
    daysRemaining: report.daysRemaining,
    requiredAdherence: report.totals.requiredAdherence,
    adherence: report.totals.adherence,
    streak: report.streak.current,
    today: report.todaySummary,
    strict: report.strict,
    outcome: report.outcome,
  };
}

/** Running attempts whose last day has passed become "completed" (lazily, on read). */
async function closeFinished(userId, today) {
  await ChallengeEnrollment.updateMany(
    { userId, status: "active", endDate: { $lt: today } },
    { $set: { status: "completed", completedAt: new Date() } },
  );
}

async function join(userId, templateId, body, today) {
  const template = await findVisibleTemplate(userId, templateId);
  const input = body && typeof body === "object" ? body : {};
  const startDate = input.startDate === undefined || input.startDate === null || input.startDate === "" ? today : input.startDate;
  if (!isValidDateKey(startDate)) throw new ChallengeError("Start date must be a valid YYYY-MM-DD date");
  if (startDate < today) throw new ChallengeError("The start date can't be in the past");
  if (startDate > shiftKey(today, MAX_START_DELAY_DAYS)) throw new ChallengeError(`Start within the next ${MAX_START_DELAY_DAYS} days`);
  if (input.acknowledgedStrictRule !== true && template.strict) {
    throw new ChallengeError("Please confirm you have read the strict rule before joining", 400, "STRICT_RULE_NOT_ACKNOWLEDGED");
  }

  await closeFinished(userId, today);
  const previous = await ChallengeEnrollment.countDocuments({ userId, templateId: template._id });
  try {
    const enrollment = await ChallengeEnrollment.create({
      userId,
      templateId: template._id,
      attempt: previous + 1,
      startDate,
      endDate: shiftKey(startDate, template.durationDays - 1),
      title: template.title,
      description: template.description,
      category: template.category,
      durationDays: template.durationDays,
      strict: template.strict,
      templateVersion: template.version,
      activities: template.activities.map((a) => ({ ...a, enabled: true })),
      reminders: { daily: input.reminders?.daily !== false, weekly: input.reminders?.weekly !== false, email: input.reminders?.email === true },
    });
    logger.info("challenge.joined", { userId: String(userId), templateId: String(template._id), attempt: enrollment.attempt });
    return serializeEnrollment(enrollment.toObject(), today);
  } catch (err) {
    if (err.code === 11000) throw new ChallengeError("You're already taking this challenge", 409, "ALREADY_JOINED");
    throw err;
  }
}

async function ownEnrollment(userId, enrollmentId) {
  if (!isObjectId(enrollmentId)) throw new ChallengeError("Invalid challenge ID", 400);
  const enrollment = await ChallengeEnrollment.findOne({ _id: enrollmentId, userId });
  if (!enrollment) throw new ChallengeError("Challenge not found", 404, "CHALLENGE_NOT_FOUND");
  return enrollment;
}

async function reportFor(enrollment, today) {
  const logs = await ChallengeLog.find({ enrollmentId: enrollment._id }, { activityKey: 1, dateKey: 1, progressPercent: 1, value: 1, done: 1, target: 1 }).lean();
  return { logs, report: buildReport(enrollment, logs, today) };
}

async function listMine(userId, today) {
  await closeFinished(userId, today);
  const enrollments = await ChallengeEnrollment.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  if (!enrollments.length) return [];
  // One query for every enrollment's logs (no per-enrollment round trips).
  const logs = await ChallengeLog.find({ enrollmentId: { $in: enrollments.map((e) => e._id) } }, { enrollmentId: 1, activityKey: 1, dateKey: 1, progressPercent: 1 }).lean();
  const byEnrollment = new Map();
  for (const log of logs) {
    const key = String(log.enrollmentId);
    if (!byEnrollment.has(key)) byEnrollment.set(key, []);
    byEnrollment.get(key).push(log);
  }
  const counts = await participantCounts([...new Set(enrollments.map((e) => String(e.templateId)))].map((id) => new mongoose.Types.ObjectId(id)));
  return enrollments.map((e) => ({
    ...serializeEnrollment(e, today, buildReport(e, byEnrollment.get(String(e._id)) ?? [], today)),
    participants: counts.get(String(e.templateId)) ?? 0,
  }));
}

async function getEnrollment(userId, enrollmentId, today) {
  await closeFinished(userId, today);
  const enrollment = await ownEnrollment(userId, enrollmentId);
  const { logs, report } = await reportFor(enrollment, today);
  const counts = await participantCounts([enrollment.templateId]);
  const recent = [...logs].filter((l) => l.progressPercent > 0).sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, 10);
  const titles = new Map(enrollment.activities.map((a) => [a.key, a]));
  return {
    ...serializeEnrollment(enrollment.toObject(), today, report),
    participants: counts.get(String(enrollment.templateId)) ?? 0,
    report,
    recentActivity: recent.map((l) => ({
      dateKey: l.dateKey,
      activityKey: l.activityKey,
      title: titles.get(l.activityKey)?.title ?? "Activity",
      progressPercent: l.progressPercent,
      value: l.value,
      unit: titles.get(l.activityKey)?.unit ?? "",
    })),
  };
}

/** One day's checklist: each activity with its status and log. */
async function getDay(userId, enrollmentId, dateKey, today) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (!isValidDateKey(dateKey)) throw new ChallengeError("Invalid date. Use YYYY-MM-DD");
  if (dateKey < enrollment.startDate || dateKey > enrollment.endDate) throw new ChallengeError("That day is outside this challenge");
  const logs = await ChallengeLog.find({ enrollmentId: enrollment._id, dateKey }).lean();
  const byKey = new Map(logs.map((l) => [l.activityKey, l]));
  return {
    dateKey,
    editable: dateKey <= today && enrollment.status !== "left",
    activities: enrollment.activities.map((a) => {
      const log = byKey.get(a.key) ?? null;
      const scheduled = isScheduled(a, dateKey);
      const status = dateKey > today ? "future" : !scheduled ? "rest" : log && log.progressPercent >= 100 ? "done" : dateKey === today ? "open" : "missed";
      return {
        key: a.key, title: a.title, description: a.description, kind: a.kind, target: log?.target ?? a.target, unit: a.unit, required: a.required, enabled: a.enabled !== false, days: a.days,
        scheduled, status, done: log?.done ?? false, value: log?.value ?? null, progressPercent: log?.progressPercent ?? 0,
      };
    }),
  };
}

/** Sets (replaces) one activity's record for a day. `clear` removes it. */
async function logActivity(userId, enrollmentId, dateKey, activityKey, body, today) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (enrollment.status === "left") throw new ChallengeError("You left this challenge, so it can't be updated", 409, "CHALLENGE_LEFT");
  if (!isValidDateKey(dateKey)) throw new ChallengeError("Invalid date. Use YYYY-MM-DD");
  if (dateKey > today) throw new ChallengeError("You can't log a day that hasn't happened yet");
  if (dateKey < enrollment.startDate || dateKey > enrollment.endDate) throw new ChallengeError("That day is outside this challenge");
  const activity = enrollment.activities.find((a) => a.key === activityKey);
  if (!activity) throw new ChallengeError("Activity not found", 404, "NOT_FOUND");
  if (!isScheduled(activity, dateKey)) throw new ChallengeError("This activity isn't scheduled on that day");

  const input = body && typeof body === "object" ? body : {};
  let fields;
  if (activity.kind === "checkbox") {
    if (typeof input.done !== "boolean") throw new ChallengeError("done must be true or false");
    fields = { done: input.done, value: null, target: null };
  } else {
    const value = Number(input.value);
    if (input.value === null || input.value === "" || !Number.isFinite(value) || value < 0 || value > MAX_NUMERIC) {
      throw new ChallengeError(`Enter an amount between 0 and ${MAX_NUMERIC} ${activity.unit}`.trim());
    }
    if (input.unit !== undefined && input.unit !== activity.unit) throw new ChallengeError(`Use ${activity.unit} for this activity`);
    fields = { done: false, value, target: activity.target };
  }
  const progressPercent = progressFor(activity, fields);
  const log = await ChallengeLog.findOneAndUpdate(
    { enrollmentId: enrollment._id, activityKey, dateKey },
    { $set: { ...fields, progressPercent }, $setOnInsert: { userId, enrollmentId: enrollment._id, activityKey, dateKey } },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).catch(async (err) => {
    // Two simultaneous first saves of the same day: the unique index lets one insert; retry as an update.
    if (err.code !== 11000) throw err;
    return ChallengeLog.findOneAndUpdate({ enrollmentId: enrollment._id, activityKey, dateKey }, { $set: { ...fields, progressPercent } }, { returnDocument: "after" });
  });
  return { log: { activityKey, dateKey, done: log.done, value: log.value, target: log.target, progressPercent: log.progressPercent }, day: await getDay(userId, enrollmentId, dateKey, today) };
}

async function clearActivity(userId, enrollmentId, dateKey, activityKey, today) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (enrollment.status === "left") throw new ChallengeError("You left this challenge, so it can't be updated", 409, "CHALLENGE_LEFT");
  if (!isValidDateKey(dateKey)) throw new ChallengeError("Invalid date. Use YYYY-MM-DD");
  await ChallengeLog.deleteOne({ enrollmentId: enrollment._id, activityKey, dateKey });
  return getDay(userId, enrollmentId, dateKey, today);
}

/**
 * Personal changes the rules allow: the target of a customizable numeric activity, switching an
 * optional activity on or off, and reminder choices. Required activities can't be switched off and
 * fixed targets can't change. Only this enrollment is updated — never the shared template.
 */
async function updateSettings(userId, enrollmentId, body, today) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (enrollment.status !== "active") throw new ChallengeError("Only a running challenge can be changed", 409, "CHALLENGE_NOT_ACTIVE");
  const input = body && typeof body === "object" ? body : {};

  if (input.activities !== undefined) {
    if (!Array.isArray(input.activities)) throw new ChallengeError("activities must be a list");
    for (const change of input.activities) {
      const activity = enrollment.activities.find((a) => a.key === change?.key);
      if (!activity) throw new ChallengeError("Activity not found", 404, "NOT_FOUND");
      if (change.target !== undefined && change.target !== activity.target) {
        if (!activity.customizable || activity.kind !== "numeric") throw new ChallengeError(`“${activity.title}” has a fixed target in this challenge`, 403, "RULE_LOCKED");
        const target = Number(change.target);
        if (!Number.isFinite(target) || target <= 0 || target > MAX_NUMERIC) throw new ChallengeError(`“${activity.title}”: set a target above 0`);
        activity.target = target;
      }
      if (change.enabled !== undefined && change.enabled !== (activity.enabled !== false)) {
        if (activity.required) throw new ChallengeError(`“${activity.title}” is required and can't be switched off`, 403, "RULE_LOCKED");
        if (typeof change.enabled !== "boolean") throw new ChallengeError("enabled must be true or false");
        activity.enabled = change.enabled;
      }
    }
  }
  if (input.reminders !== undefined) {
    const r = input.reminders;
    for (const key of ["daily", "weekly", "email"]) {
      if (r?.[key] !== undefined) {
        if (typeof r[key] !== "boolean") throw new ChallengeError(`reminders.${key} must be true or false`);
        enrollment.reminders[key] = r[key];
      }
    }
  }
  enrollment.markModified("activities");
  await enrollment.save();
  return getEnrollment(userId, enrollmentId, today);
}

async function leave(userId, enrollmentId, today) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (enrollment.status !== "active") throw new ChallengeError("This challenge isn't running", 409, "CHALLENGE_NOT_ACTIVE");
  enrollment.status = "left";
  enrollment.leftAt = new Date();
  await enrollment.save();
  logger.info("challenge.left", { userId: String(userId), enrollmentId: String(enrollment._id) });
  return serializeEnrollment(enrollment.toObject(), today);
}

/** Ends the current attempt (kept in history) and starts a new one today. */
async function restart(userId, enrollmentId, body, today) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (enrollment.status === "active") await leave(userId, enrollmentId, today);
  return join(userId, String(enrollment.templateId), { ...body, acknowledgedStrictRule: true }, today);
}

module.exports = {
  ChallengeError,
  ensureBuiltIns,
  resetSeedState,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  join,
  listMine,
  getEnrollment,
  getDay,
  logActivity,
  clearActivity,
  updateSettings,
  leave,
  restart,
  participantCounts,
  validateTemplateInput,
};
