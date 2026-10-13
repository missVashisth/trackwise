const Goal = require("../models/goal.model");
const DailyProgress = require("../models/dailyProgress.model");

const {
  calculateDailyProgress,
  finalizePreviousDays,
} = require("../services/dailyProgress.service");

const { getTodayDateKey } = require("../utils/date");

// GET /:goalId/progress/daily
// Get progress for a particular day
async function getDailyProgress(req, res) {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;

    const todayDateKey = getTodayDateKey(req.user.timeZone);
    const dateKey = req.query.dateKey || todayDateKey;

    // 1. Verify goal ownership
    const goal = await Goal.findOne({
      _id: goalId,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }

    // 2. Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({
        message: "Invalid dateKey format. Use YYYY-MM-DD",
      });
    }

    // 3. Do not allow future dates
    if (dateKey > todayDateKey) {
      return res.status(400).json({
        message: "Cannot retrieve progress for a future date",
      });
    }

    // 4. Finalize any existing previous-day records
    await finalizePreviousDays(
      goalId,
      userId,
      todayDateKey
    );

    // 5. For past dates, return the saved historical record
    if (dateKey < todayDateKey) {
      const progress = await DailyProgress.findOne({
        goalId,
        userId,
        dateKey,
      });

      if (!progress) {
        return res.status(404).json({
          message: "No saved progress found for this date",
        });
      }

      return res.status(200).json({
        message: "Historical daily progress retrieved successfully",
        progress,
      });
    }

    // 6. For today, calculate live progress using the service
    const progress = await calculateDailyProgress(
      goalId,
      userId,
      dateKey
    );

    // 7. Return response
    return res.status(200).json({
      message: "Daily progress calculated successfully",
      progress,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
}

module.exports = {
  getDailyProgress,
};






// const Goal = require("../models/goal.model");
// const Task = require("../models/task.model");
// const TaskCompletion = require("../models/taskCompletion.model");
// const DailyProgress = require("../models/dailyProgress.model");
// const {
//   calculateDailyProgress,
//   finalizePreviousDays,
// } = require("../services/dailyProgress.service");

// const { getTodayDateKey } = require("../utils/date");

// // GET /:goalId/progress/daily
// // Get progress for a particular day
// async function getDailyProgress(req, res) {
//   try {
//     const userId = req.user.id;
//     const { goalId } = req.params;

//     // If dateKey is not provided, use today
//     const dateKey = req.query.dateKey || getTodayDateKey();

//     // Get today's date separately
//     const todayDateKey = getTodayDateKey();

//     // This finalizes existing previous-day records whenever the user requests daily progress for that goal.
//     await finalizePreviousDays(goalId, userId, todayDateKey);

//     // ----------------------------------
//     // 1. Check goal ownership
//     // ----------------------------------

//     const goal = await Goal.findOne({
//       _id: goalId,
//       user: userId,
//     });

//     if (!goal) {
//       return res.status(404).json({
//         message: "Goal not found",
//       });
//     }

//     // ----------------------------------
//     // 2. Get all tasks for this goal
//     // ----------------------------------

//     const tasks = await Task.find({
//       goalId,
//       userId,
//     });

//     // ----------------------------------
//     // 3. Get completed tasks for this date
//     // ----------------------------------

//     const completions = await TaskCompletion.find({
//       goalId,
//       userId,
//       dateKey,
//     });

//     // ----------------------------------
//     // 4. Calculate total weight
//     // ----------------------------------

//     let totalWeight = 0;
//     let completedWeight = 0;

//     tasks.forEach((task) => {
//       totalWeight += task.weightage;

//       const isCompleted = completions.some(
//         (completion) => completion.taskId.toString() === task._id.toString()
//       );

//       if (isCompleted) {
//         completedWeight += task.weightage;
//       }
//     });

//     // ----------------------------------
//     // 5. Calculate completion ratio
//     // ----------------------------------

//     let completionRatio = 0;

//     if (totalWeight > 0) {
//       completionRatio = completedWeight / totalWeight;
//     }

//     // ----------------------------------
//     // 6. Calculate daily target
//     // ----------------------------------

//     const dailyTarget = 100 / goal.totalDays;

//     // ----------------------------------
//     // 7. Calculate daily progress
//     // ----------------------------------

//     let dailyProgress = dailyTarget * completionRatio;

//     dailyProgress = Number(dailyProgress.toFixed(2));

//     // ----------------------------------
//     // 8. Save/update daily snapshot
//     // ----------------------------------

//     const progress = await DailyProgress.findOneAndUpdate(
//       {
//         goalId,
//         dateKey,
//       },
//       {
//         $set: {
//           userId,
//           totalWeight,
//           completedWeight,
//           completionRatio,
//           dailyTarget,
//           dailyProgress,
//         },
//       },
//       {
//         returnDocument: "after",
//         upsert: true,
//         setDefaultsOnInsert: true,
//       }
//     );

//     // ----------------------------------
//     // 9. Return response
//     // ----------------------------------

//     return res.status(200).json({
//       message: "Daily progress calculated successfully",
//       progress,
//     });
//   } catch (error) {
//     console.error(error);

//     return res.status(500).json({
//       message: error.message,
//     });
//   }
// }

// module.exports = {
//   getDailyProgress,
// };
