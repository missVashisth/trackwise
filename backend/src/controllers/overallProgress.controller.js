const Goal = require("../models/goal.model");
const DailyProgress = require("../models/dailyProgress.model");


// GET /:goalId/progress
// Get overall progress of a goal
async function getOverallProgress(req, res) {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;

    // ----------------------------------
    // 1. Check goal ownership
    // ----------------------------------

    const goal = await Goal.findOne({
      _id: goalId,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }


    // ----------------------------------
    // 2. Get all daily progress records
    // ----------------------------------

    const dailyProgressRecords = await DailyProgress.find({
      goalId,
      userId,
    }).sort({ dateKey: 1 });


    // ----------------------------------
    // 3. Calculate overall progress
    // ----------------------------------

    const totalProgress = dailyProgressRecords.reduce(
      (sum, day) => sum + day.dailyProgress,
      0
    );


    // ----------------------------------
    // 4. Prevent progress from going
    //    above 100%
    // ----------------------------------

    const overallProgress = Math.min(
      100,
      Number(totalProgress.toFixed(2))
    );


    // ----------------------------------
    // 5. Return response
    // ----------------------------------

    return res.status(200).json({
      message: "Overall progress calculated successfully",

      progress: {
        goalId,
        totalDays: goal.totalDays,
        startDate: goal.startDate,
        overallProgress,
        daysWithProgress: dailyProgressRecords.length,
      },
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
}


module.exports = {
  getOverallProgress,
};