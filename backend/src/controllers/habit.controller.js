const Habit = require("../models/habit.model");
const HabitLog = require("../models/habitLog.model");
const LifeArea = require("../models/lifeArea.model");
const { getTodayDateKey } = require("../utils/date");
const { statusForError, parseBoolean } = require("../utils/validation");
const {
  validateHabit,
  computeProgress,
  checkLogDate,
  buildHistory,
  historyRange,
  serializeHabit,
  earliestPeriodStart,
} = require("../services/habit.service");

const LOG_FIELDS = "dateKey progressPercent actualValue targetValue note updatedAt";

/** The user's habit, or null. Ownership comes from the session, never from the request body. */
const findOwnHabit = (req) => Habit.findOne({ _id: req.params.habitId, userId: req.user.id });

async function lifeAreaError(fields, userId) {
  if (!fields.lifeAreaId) return null;
  const exists = await LifeArea.exists({ _id: fields.lifeAreaId, user: userId });
  return exists ? null : "Category not found";
}

/** One habit with today's log and its current period, ready for the API. */
async function serializeOne(habit, userId, today) {
  const logs = await HabitLog.find({ userId, habitId: habit._id, dateKey: { $gte: earliestPeriodStart(today), $lte: today } }, LOG_FIELDS).lean();
  return serializeHabit(habit, { today, todayLog: logs.find((l) => l.dateKey === today) ?? null, periodLogs: logs });
}

function sendError(res, err) {
  const status = statusForError(err);
  if (status === 500) console.error(err);
  return res.status(status).json({ message: err.message });
}

/**
 * @name POST /api/habits
 * @description Create a habit for the logged-in user.
 * @access Private
 */
async function createHabit(req, res) {
  try {
    const userId = req.user.id;
    const today = getTodayDateKey(req.user.timeZone);
    const { fields, error } = validateHabit(req.body, { today });
    if (error) return res.status(400).json({ message: error });
    const areaError = await lifeAreaError(fields, userId);
    if (areaError) return res.status(400).json({ message: areaError });

    const habit = await Habit.create({ ...fields, userId });
    return res.status(201).json({ message: "Habit created", habit: await serializeOne(habit, userId, today) });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name GET /api/habits?status=active|archived|all
 * @description The user's habits with today's progress (two queries in total).
 * @access Private
 */
async function listHabits(req, res) {
  try {
    const userId = req.user.id;
    const today = getTodayDateKey(req.user.timeZone);
    const status = req.query.status ?? "active";
    if (!["active", "archived", "all"].includes(status)) return res.status(400).json({ message: "status must be active, archived or all" });

    const filter = { userId };
    if (status === "active") filter.archivedAt = null;
    if (status === "archived") filter.archivedAt = { $ne: null };
    const habits = await Habit.find(filter).sort({ createdAt: 1 });

    const logs = habits.length
      ? await HabitLog.find({ userId, habitId: { $in: habits.map((h) => h._id) }, dateKey: { $gte: earliestPeriodStart(today), $lte: today } }, `habitId ${LOG_FIELDS}`).lean()
      : [];
    const logsByHabit = new Map();
    for (const log of logs) {
      const key = String(log.habitId);
      if (!logsByHabit.has(key)) logsByHabit.set(key, []);
      logsByHabit.get(key).push(log);
    }

    return res.status(200).json({
      today,
      timeZone: req.user.timeZone,
      habits: habits.map((habit) => {
        const own = logsByHabit.get(String(habit._id)) ?? [];
        return serializeHabit(habit, { today, todayLog: own.find((l) => l.dateKey === today) ?? null, periodLogs: own });
      }),
    });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name GET /api/habits/:habitId
 * @description One habit with today's progress and its current period.
 * @access Private
 */
async function getHabit(req, res) {
  try {
    const habit = await findOwnHabit(req);
    if (!habit) return res.status(404).json({ message: "Habit not found" });
    const today = getTodayDateKey(req.user.timeZone);
    return res.status(200).json({ today, habit: await serializeOne(habit, req.user.id, today) });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name PATCH /api/habits/:habitId
 * @description Update a habit. The tracking method can only change while no progress is logged,
 * so existing history keeps its meaning.
 * @access Private
 */
async function updateHabit(req, res) {
  try {
    const userId = req.user.id;
    const habit = await findOwnHabit(req);
    if (!habit) return res.status(404).json({ message: "Habit not found" });
    const today = getTodayDateKey(req.user.timeZone);

    const { fields, error } = validateHabit(req.body, { existing: habit.toObject(), today });
    if (error) return res.status(400).json({ message: error });
    const areaError = await lifeAreaError(fields, userId);
    if (areaError) return res.status(400).json({ message: areaError });

    if (fields.trackingMethod && fields.trackingMethod !== habit.trackingMethod && (await HabitLog.exists({ userId, habitId: habit._id }))) {
      return res.status(409).json({ message: "The tracking method can't change after progress has been logged" });
    }

    habit.set(fields);
    await habit.save();
    return res.status(200).json({ message: "Habit updated", habit: await serializeOne(habit, userId, today) });
  } catch (err) {
    return sendError(res, err);
  }
}

/** POST /api/habits/:habitId/archive and /restore */
function setArchived(archived) {
  return async function archiveHandler(req, res) {
    try {
      const habit = await Habit.findOneAndUpdate(
        { _id: req.params.habitId, userId: req.user.id },
        { $set: { archivedAt: archived ? new Date() : null } },
        { returnDocument: "after" }
      );
      if (!habit) return res.status(404).json({ message: "Habit not found" });
      const today = getTodayDateKey(req.user.timeZone);
      return res.status(200).json({ message: archived ? "Habit archived" : "Habit restored", habit: await serializeOne(habit, req.user.id, today) });
    } catch (err) {
      return sendError(res, err);
    }
  };
}

/**
 * @name PATCH /api/habits/:habitId/milestones/:milestoneId
 * @description Mark a milestone reached (or not). Separate from daily progress.
 * @access Private
 */
async function setMilestone(req, res) {
  try {
    const completed = parseBoolean(req.body.completed);
    if (completed === null) return res.status(400).json({ message: "completed must be true or false" });
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.habitId, userId: req.user.id, "milestones._id": req.params.milestoneId },
      { $set: { "milestones.$.completedAt": completed ? new Date() : null } },
      { returnDocument: "after" }
    );
    if (!habit) return res.status(404).json({ message: "Milestone not found" });
    const today = getTodayDateKey(req.user.timeZone);
    return res.status(200).json({ message: "Milestone updated", habit: await serializeOne(habit, req.user.id, today) });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name PUT /api/habits/:habitId/logs/:dateKey
 * @description Set the day's progress (replaces that day's previous entry; never adds to it).
 * Body by tracking method: { progressPercent } | { actualValue } | { completed }, plus { note }.
 * @access Private
 */
async function upsertLog(req, res) {
  try {
    const userId = req.user.id;
    const habit = await findOwnHabit(req);
    if (!habit) return res.status(404).json({ message: "Habit not found" });
    if (habit.archivedAt) return res.status(400).json({ message: "This habit is archived; restore it to log progress" });

    const today = getTodayDateKey(req.user.timeZone);
    const { dateKey } = req.params;
    const dateError = checkLogDate(habit, dateKey, today);
    if (dateError) return res.status(400).json({ message: dateError });

    const progress = computeProgress(habit, req.body);
    if (progress.error) return res.status(400).json({ message: progress.error });

    const update = { $set: { progressPercent: progress.progressPercent, actualValue: progress.actualValue, targetValue: progress.targetValue } };
    if (req.body.note !== undefined) {
      if (typeof req.body.note !== "string" || req.body.note.length > 500) return res.status(400).json({ message: "Note must be text under 500 characters" });
      update.$set.note = req.body.note.trim();
    }

    const filter = { userId, habitId: habit._id, dateKey };
    const write = () => HabitLog.findOneAndUpdate(filter, update, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, includeResultMetadata: true });
    let result;
    try {
      result = await write();
    } catch (err) {
      // Two first-writes for the same day raced; the unique index kept one. Update that one.
      if (err.code !== 11000) throw err;
      result = await write();
    }

    const created = !result.lastErrorObject?.updatedExisting;
    return res.status(created ? 201 : 200).json({
      message: created ? "Progress logged" : "Progress updated",
      log: result.value,
      habit: await serializeOne(habit, userId, today),
    });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name DELETE /api/habits/:habitId/logs/:dateKey
 * @description Remove the day's entry (the day becomes "not logged" again).
 * @access Private
 */
async function deleteLog(req, res) {
  try {
    const userId = req.user.id;
    const habit = await findOwnHabit(req);
    if (!habit) return res.status(404).json({ message: "Habit not found" });
    const deleted = await HabitLog.findOneAndDelete({ userId, habitId: habit._id, dateKey: req.params.dateKey });
    if (!deleted) return res.status(404).json({ message: "Nothing was logged for this day" });
    const today = getTodayDateKey(req.user.timeZone);
    return res.status(200).json({ message: "Entry removed", habit: await serializeOne(habit, userId, today) });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name GET /api/habits/:habitId/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
 * @description Day-by-day history (default: last 30 days). Days without a log are marked missed,
 * rest, open or pending from the schedule; nothing is stored for them.
 * @access Private
 */
async function getHistory(req, res) {
  try {
    const userId = req.user.id;
    const habit = await findOwnHabit(req);
    if (!habit) return res.status(404).json({ message: "Habit not found" });
    const today = getTodayDateKey(req.user.timeZone);
    const range = historyRange(req.query, today);
    if (range.error) return res.status(400).json({ message: range.error });

    const logs = await HabitLog.find({ userId, habitId: habit._id, dateKey: { $gte: range.from, $lte: range.to } }, LOG_FIELDS).sort({ dateKey: 1 }).lean();
    return res.status(200).json({
      today,
      from: range.from,
      to: range.to,
      logs,
      days: buildHistory(habit.toObject(), logs, { from: range.from, to: range.to, today }),
    });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = {
  createHabit,
  listHabits,
  getHabit,
  updateHabit,
  archiveHabit: setArchived(true),
  restoreHabit: setArchived(false),
  setMilestone,
  upsertLog,
  deleteLog,
  getHistory,
};
