const Goal = require("../models/goal.model");
const Task = require("../models/task.model");
const TaskCompletion = require("../models/taskCompletion.model");
const DailyProgress = require("../models/dailyProgress.model");
const { getTodayDateKey, dateOnlyKey } = require("../utils/date");
const { DAILY_TASKS, getRoadmapProgressByGoal } = require("./roadmap.service");

async function calculateDailyProgress(goalId, userId, dateKey, { retried = false } = {}) {
  // 1. Verify goal ownership
  const goal = await Goal.findOne({
    _id: goalId,
    user: userId,
  });

  if (!goal) {
    throw new Error("Goal not found");
  }

  // 2. Check if progress already exists
  const existingProgress = await DailyProgress.findOne({
    goalId,
    userId,
    dateKey,
  });

  // 3. Return finalized progress without modifying it
  if (existingProgress?.isFinalized === true) {
    return existingProgress;
  }

  // 4. Fetch the goal's current daily (recurring) tasks. Roadmap tasks are one-time and have no
  //    weightage; they count through getRoadmapProgressByGoal instead.
  const tasks = await Task.find({
    goalId,
    userId,
    ...DAILY_TASKS,
  });

  // 5. Fetch completions for this date
  const completions = await TaskCompletion.find({
    goalId,
    userId,
    dateKey,
  });

  // 6. Calculate weights
  let totalWeight = 0;
  let completedWeight = 0;

  const completedTaskIds = new Set(
    completions.map((completion) =>
      completion.taskId.toString()
    )
  );

  tasks.forEach((task) => {
    totalWeight += task.weightage;

    if (completedTaskIds.has(task._id.toString())) {
      completedWeight += task.weightage;
    }
  });

  // 7. Calculate completion ratio
  const completionRatio =
    totalWeight > 0 ? completedWeight / totalWeight : 0;

  // 8. Calculate daily target
  const dailyTarget = 100 / goal.totalDays;

  // 9. Calculate daily progress
  const dailyProgress = Number(
    (dailyTarget * completionRatio).toFixed(2)
  );

  // 10. Save or update only if the record is not finalized
  try {
    const progress = await DailyProgress.findOneAndUpdate(
      {
        goalId,
        dateKey,
        isFinalized: { $ne: true },
      },
      {
        $set: {
          userId,
          totalWeight,
          completedWeight,
          completionRatio,
          dailyTarget,
          dailyProgress,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return progress;
  } catch (error) {
    // Two requests upserted the same goal/day at once and the other inserted first. Recalculate
    // (now an update of that record, or a finalized read) rather than return its older values.
    if (error.code === 11000 && error.keyPattern?.dateKey && !retried) {
      return calculateDailyProgress(goalId, userId, dateKey, { retried: true });
    }

    throw error;
  }
}


async function finalizePreviousDays(goalId, userId, todayDateKey) {
  // Finalize all existing, unfinalized records before today
  const result = await DailyProgress.updateMany(
    {
      goalId,
      userId,
      dateKey: { $lt: todayDateKey },
      isFinalized: { $ne: true },
    },
    {
      $set: {
        isFinalized: true,
        finalizedAt: new Date(),
      },
    }
  );

  return result;
}

/**
 * Progress summary per goal. Returns a Map keyed by goal id string.
 *
 * Goals with roadmap tasks ("roadmap" basis): completed roadmap tasks / total roadmap tasks.
 * Other goals ("daily" basis), built from DailyProgress records:
 *   overall  - sum of daily progress, capped at 100
 *   today    - today's contribution
 *   history  - cumulative progress after each recorded day (for sparklines)
 */
async function getProgressByGoal(userId, goalIds, timeZone) {
  const today = getTodayDateKey(timeZone);
  const filter = { userId };
  if (goalIds) filter.goalId = { $in: goalIds };

  const [records, roadmapProgress] = await Promise.all([
    DailyProgress.find(filter, "goalId dateKey dailyProgress").sort({ dateKey: 1 }),
    getRoadmapProgressByGoal(userId, goalIds, timeZone),
  ]);

  const byGoal = new Map();
  for (const record of records) {
    const key = record.goalId.toString();
    if (!byGoal.has(key)) byGoal.set(key, { basis: "daily", overall: 0, today: 0, history: [] });
    const summary = byGoal.get(key);
    summary.overall = Math.min(100, Number((summary.overall + record.dailyProgress).toFixed(2)));
    summary.history.push(summary.overall);
    if (record.dateKey === today) summary.today = record.dailyProgress;
  }
  for (const [key, summary] of roadmapProgress) byGoal.set(key, summary);
  return byGoal;
}

async function getGoalProgress(goalId, userId, timeZone) {
  const byGoal = await getProgressByGoal(userId, [goalId], timeZone);
  return { goalId, ...(byGoal.get(goalId.toString()) ?? { basis: "daily", overall: 0, today: 0, history: [] }) };
}

/** Is the goal running on the calendar day `dateKey`? (start/deadline are date-only values) */
function isGoalRunningOn(goal, dateKey) {
  return (
    Boolean(goal) &&
    !goal.completedAt &&
    dateOnlyKey(goal.startDate) <= dateKey &&
    (!goal.deadline || dateKey <= dateOnlyKey(goal.deadline))
  );
}

/**
 * Lifecycle of a goal on the calendar day `dateKey`, using the same rules as task completion:
 * "completed" once marked done, "upcoming" before its start date, "ended" after its deadline
 * without being marked done, otherwise "active".
 */
function goalStatusOn(goal, dateKey) {
  if (goal.completedAt) return "completed";
  if (dateKey < dateOnlyKey(goal.startDate)) return "upcoming";
  if (goal.deadline && dateKey > dateOnlyKey(goal.deadline)) return "ended";
  return "active";
}

/** Recalculate today's record after the goal's task set changes, then return the goal's progress. */
async function refreshTodayProgress(goalId, userId, timeZone) {
  const today = getTodayDateKey(timeZone);
  const goal = await Goal.findOne({ _id: goalId, user: userId });
  if (isGoalRunningOn(goal, today)) await calculateDailyProgress(goalId, userId, today);
  return getGoalProgress(goalId, userId, timeZone);
}

module.exports = {
  calculateDailyProgress,
  finalizePreviousDays,
  getProgressByGoal,
  getGoalProgress,
  refreshTodayProgress,
  isGoalRunningOn,
  goalStatusOn,
};
















// const Goal = require("../models/goal.model");
// const Task = require("../models/task.model");
// const TaskCompletion = require("../models/taskCompletion.model");
// const DailyProgress = require("../models/dailyProgress.model");

// async function calculateDailyProgress(goalId, userId, dateKey) {
//   // 1. Check goal ownership
//   const goal = await Goal.findOne({
//     _id: goalId,
//     user: userId,
//   });

//   if (!goal) {
//     throw new Error("Goal not found");
//   }

//   // 2. Get all tasks for this goal
//   const tasks = await Task.find({
//     goalId,
//     userId,
//   });

//   // 3. Get completed tasks for this date
//   const completions = await TaskCompletion.find({
//     goalId,
//     userId,
//     dateKey,
//   });

//   // 4. Calculate weights
//   let totalWeight = 0;
//   let completedWeight = 0;

//   tasks.forEach((task) => {
//     totalWeight += task.weightage;

//     const isCompleted = completions.some(
//       (completion) =>
//         completion.taskId.toString() === task._id.toString()
//     );

//     if (isCompleted) {
//       completedWeight += task.weightage;
//     }
//   });

//   // 5. Calculate completion ratio
//   let completionRatio = 0;

//   if (totalWeight > 0) {
//     completionRatio = completedWeight / totalWeight;
//   }

//   // 6. Calculate daily target
//   const dailyTarget = 100 / goal.totalDays;

//   // 7. Calculate daily progress
//   let dailyProgress = dailyTarget * completionRatio;

//   dailyProgress = Number(dailyProgress.toFixed(2));

//   // 8. Save/update daily progress
//   const progress = await DailyProgress.findOneAndUpdate(
//     {
//       goalId,
//       dateKey,
//     },
//     {
//       $set: {
//         userId,
//         totalWeight,
//         completedWeight,
//         completionRatio,
//         dailyTarget,
//         dailyProgress,
//       },
//     },
//     {
//       returnDocument: "after",
//       upsert: true,
//       setDefaultsOnInsert: true,
//     }
//   );

//   // 9. Return the progress document
//   return progress;
// }

// module.exports = {
//   calculateDailyProgress,
// };





