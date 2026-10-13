// Earlier TaskCompletion and DailyProgress schemas stored a `date` field with unique indexes on
// { taskId, date } and { goalId, date }. Current documents have no `date`, so MongoDB indexes them
// all as `date: null` and those old indexes allowed only ONE completion per task / ONE progress
// record per goal, ever — blocking every later day (E11000 ... dup key: { ..., date: null }).
//
// This drops only those specific leftover indexes and makes sure the current schema's unique
// { goalId, dateKey } index exists. Documents are never modified or deleted. Safe to re-run.

const TaskCompletion = require("../models/taskCompletion.model");
const DailyProgress = require("../models/dailyProgress.model");
const logger = require("../utils/logger");

const LEGACY_INDEXES = [
  { model: TaskCompletion, name: "taskId_1_date_1" },
  { model: DailyProgress, name: "goalId_1_date_1" },
];

async function existingIndexNames(model) {
  try {
    return (await model.collection.indexes()).map((index) => index.name);
  } catch (err) {
    if (err.codeName === "NamespaceNotFound") return []; // collection not created yet
    throw err;
  }
}

/** Drops the legacy indexes that exist; returns the names it dropped. */
async function dropLegacyCompletionIndexes() {
  const dropped = [];
  for (const { model, name } of LEGACY_INDEXES) {
    if (!(await existingIndexNames(model)).includes(name)) continue;
    await model.collection.dropIndex(name);
    dropped.push(name);
    logger.info("migration.legacy_index_dropped", { collection: model.collection.name, index: name });
  }

  // The current one-record-per-goal-per-day index could never be built next to the legacy
  // records (no dateKey), so it is partial; build it now if it is missing.
  try {
    await DailyProgress.createIndexes();
  } catch (err) {
    // An older, non-partial unique { goalId, dateKey } index already enforces the same rule.
    if (err.codeName !== "IndexOptionsConflict" && err.codeName !== "IndexKeySpecsConflict") throw err;
    logger.warn("migration.daily_progress_index_kept", { reason: err.codeName });
  }

  return dropped;
}

module.exports = { dropLegacyCompletionIndexes };
