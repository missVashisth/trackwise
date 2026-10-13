// const mongoose = require("mongoose");
// const { getTodayDateKey } = require("../utils/date");
// const {calculateDailyProgress} = require("../services/dailyProgress.service");


// const TaskCompletion = require("../models/taskCompletion.model");
// const Task = require("../models/task.model");
// const Goal = require("../models/goal.model");


// /**
//  * @name POST /:goalId/tasks/:taskId/complete
//  * @description Mark task as completed for today
//  * @access Private
//  */
// // async function completeTask(req, res) {
// //   try {
// //     const userId = req.user.id;
// //     const { goalId, taskId } = req.params;

// //     // 1. Check whether goal belongs to logged-in user
// //     const goal = await Goal.findOne({
// //       _id: goalId,
// //       user: userId,
// //     });

// //     if (!goal) {
// //       return res.status(404).json({
// //         message: "Goal not found",
// //       });
// //     }

// //     // 2. Check whether task belongs to this goal and user
// //     const task = await Task.findOne({
// //       _id: taskId,
// //       goalId: goalId,
// //       userId: userId,
// //     });

// //     if (!task) {
// //       return res.status(404).json({
// //         message: "Task not found",
// //       });
// //     }

// //     // 3. Get today's date
// //     const today = new Date();
// //     today.setHours(0, 0, 0, 0);

// //     // 4. Check if task is already completed today
// //     const existingCompletion = await TaskCompletion.findOne({
// //       taskId,
// //       date: today,
// //     });

// //     if (existingCompletion) {
// //       return res.status(409).json({
// //         message: "Task is already completed today",
// //         completion: existingCompletion,
// //       });
// //     }

// //     // 5. Create completion record
// //     const completion = await TaskCompletion.create({
// //       taskId,
// //       goalId,
// //       userId,
// //       date: today,
// //     });

// //     return res.status(201).json({
// //       message: "Task completed successfully",
// //       completion,
// //     });
// //   } catch (error) {
// //     console.error(error);

// //     return res.status(500).json({
// //       message: error.message,
// //     });
// //   }
// // }


// async function completeTask(req, res) {
//   try {
//     const userId = req.user.id;
//     const { goalId, taskId } = req.params;

//     const goal = await Goal.findOne({
//       _id: goalId,
//       user: userId,
//     });

//     if (!goal) {
//       return res.status(404).json({
//         message: "Goal not found",
//       });
//     }

//     const task = await Task.findOne({
//       _id: taskId,
//       goalId,
//       userId,
//     });

//     if (!task) {
//       return res.status(404).json({
//         message: "Task not found",
//       });
//     }

//     const dateKey = getTodayDateKey();

//     const completion = await TaskCompletion.findOneAndUpdate(
//       {
//         taskId,
//         dateKey,
//       },
//       {
//         $setOnInsert: {
//           taskId,
//           goalId,
//           userId,
//           dateKey,
//         },
//       },
//       {
//         returnDocument: "after",
//         upsert: true,
//         setDefaultsOnInsert: true,
//       }
//     );

//     return res.status(200).json({
//       message: "Task completed successfully",
//       completion,
//     });
//   } catch (error) {
//     if (error.code === 11000) {
//       return res.status(409).json({
//         message: "Task is already completed today",
//       });
//     }

//     console.error(error);

//     return res.status(500).json({
//       message: error.message,
//     });
//   }
// }


// /**
//  * @name GET /:goalId/tasks/:taskId/completions
//  * @description Get all completion records for a task
//  * @access Private
//  */
// async function getTaskCompletions(req, res) {
//   try {
//     const userId = req.user.id;
//     const { goalId, taskId } = req.params;

//     // Check task ownership
//     const task = await Task.findOne({
//       _id: taskId,
//       goalId: goalId,
//       userId: userId,
//     });

//     if (!task) {
//       return res.status(404).json({
//         message: "Task not found",
//       });
//     }

//     const completions = await TaskCompletion.find({
//       taskId,
//       goalId,
//       userId,
//     }).sort({ date: -1 });

//     return res.status(200).json({
//       count: completions.length,
//       completions,
//     });
//   } catch (error) {
//     console.error(error);

//     return res.status(500).json({
//       message: error.message,
//     });
//   }
// }


// /**
//  * @name GET /:goalId/tasks/:taskId/completions/:date
//  * @description Get completion for a particular date
//  * @access Private
//  */
// async function getTaskCompletionByDate(req, res) {
//   try {
//     const userId = req.user.id;
//     const { goalId, taskId, date } = req.params;

//     const task = await Task.findOne({
//       _id: taskId,
//       goalId,
//       userId,
//     });

//     if (!task) {
//       return res.status(404).json({
//         message: "Task not found",
//       });
//     }

//     const completion = await TaskCompletion.findOne({
//       taskId,
//       goalId,
//       userId,
//     //   date: new Date(date),
//     dateKey: date,
//     });

//     if (!completion) {
//       return res.status(404).json({
//         message: "Task was not completed on this date",
//       });
//     }

//     return res.status(200).json({
//       completion,
//     });
//   } catch (error) {
//     console.error(error);

//     return res.status(500).json({
//       message: error.message,
//     });
//   }
// }


// /**
//  * @name DELETE /:goalId/tasks/:taskId/completions/:date
//  * @description Undo task completion for a particular date
//  * @access Private
//  */
// async function removeTaskCompletion(req, res) {
//   try {
//     const userId = req.user.id;
//     const { goalId, taskId, date } = req.params;

//     const task = await Task.findOne({
//       _id: taskId,
//       goalId,
//       userId,
//     });

//     if (!task) {
//       return res.status(404).json({
//         message: "Task not found",
//       });
//     }

//     const completion = await TaskCompletion.findOneAndDelete({
//       taskId,
//       goalId,
//       userId,
//     //   date: new Date(date),
//     dateKey: date,
//     });

//     if (!completion) {
//       return res.status(404).json({
//         message: "Completion record not found",
//       });
//     }

//     return res.status(200).json({
//       message: "Task completion removed successfully",
//       completion,
//     });
//   } catch (error) {
//     console.error(error);

//     return res.status(500).json({
//       message: error.message,
//     });
//   }
// }


// module.exports = {
//   completeTask,
//   getTaskCompletions,
//   getTaskCompletionByDate,
//   removeTaskCompletion,
// };





const { getTodayDateKey, dateOnlyKey } = require("../utils/date");
const {
  calculateDailyProgress,
  getGoalProgress,
} = require("../services/dailyProgress.service");
const logger = require("../utils/logger");

/**
 * Recalculate the day's progress after a completion was added or removed. The completion change
 * is already saved, so a failure here must not be reported as if the click failed: the response
 * says the progress could not be refreshed and the client re-fetches it.
 */
async function recalculateProgress({ goalId, userId, dateKey, timeZone }) {
  try {
    const progress = await calculateDailyProgress(goalId, userId, dateKey);
    const goalProgress = await getGoalProgress(goalId, userId, timeZone);
    return { progress, goalProgress, progressError: null };
  } catch (err) {
    logger.error("progress.recalculation_failed", { goalId: String(goalId), dateKey, error: err.message });
    return { progress: null, goalProgress: null, progressError: "Saved, but progress could not be updated. Refresh to see the latest progress." };
  }
}

const TaskCompletion = require("../models/taskCompletion.model");
const Task = require("../models/task.model");
const Goal = require("../models/goal.model");
const notificationEvents = require("../services/notifications/notification.events");
const { ROADMAP, isRoadmapTask, serializeTask } = require("../services/roadmap.service");

/** Fresh goal progress after a roadmap task changed; a failure here never undoes the change. */
async function roadmapProgress(goalId, userId, timeZone) {
  try {
    return { goalProgress: await getGoalProgress(goalId, userId, timeZone), progressError: null };
  } catch (err) {
    logger.error("progress.recalculation_failed", { goalId: String(goalId), error: err.message });
    return { goalProgress: null, progressError: "Saved, but progress could not be updated. Refresh to see the latest progress." };
  }
}

/**
 * Roadmap tasks are completed once. The update only matches an open task, so of two identical
 * requests exactly one succeeds; the other gets 409 and progress counts the task once.
 * The original scheduled date is left untouched; completedAt records when it was actually done.
 */
async function completeRoadmapTask(req, res, goal, task) {
  const userId = req.user.id;
  const today = getTodayDateKey(req.user.timeZone);

  const completed = await Task.findOneAndUpdate(
    { _id: task._id, goalId: goal._id, userId, kind: ROADMAP, completedAt: null },
    { $set: { completedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!completed) {
    const current = await Task.findOne({ _id: task._id, userId });
    return res.status(409).json({
      message: "Task is already completed",
      task: current ? serializeTask(current, today) : null,
    });
  }

  const { goalProgress, progressError } = await roadmapProgress(goal._id, userId, req.user.timeZone);
  if (goalProgress) notificationEvents.taskCompleted({ userId, goal, goalProgress });

  return res.status(201).json({
    message: "Task completed successfully",
    task: serializeTask(completed, today),
    goalProgress,
    progressError,
  });
}

/**
 * @name POST /:goalId/tasks/:taskId/reopen
 * @description Mark a completed roadmap task as not done again (explicit user action).
 * @access Private
 */
async function reopenTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId } = req.params;

    const goal = await Goal.findOne({ _id: goalId, user: userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    const task = await Task.findOne({ _id: taskId, goalId, userId });
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (!isRoadmapTask(task)) {
      return res.status(400).json({ message: "Only roadmap tasks can be reopened; daily tasks are unticked per day" });
    }
    if (goal.completedAt) return res.status(400).json({ message: "This goal is already completed" });

    const reopened = await Task.findOneAndUpdate(
      { _id: task._id, goalId, userId, kind: ROADMAP, completedAt: { $ne: null } },
      { $set: { completedAt: null } },
      { returnDocument: "after" }
    );
    const today = getTodayDateKey(req.user.timeZone);
    if (!reopened) {
      return res.status(409).json({ message: "Task is not completed", task: serializeTask(task, today) });
    }

    const { goalProgress, progressError } = await roadmapProgress(goal._id, userId, req.user.timeZone);
    return res.status(200).json({
      message: "Task reopened",
      task: serializeTask(reopened, today),
      goalProgress,
      progressError,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
}

/**
 * @name POST /:goalId/tasks/:taskId/complete
 * @description Mark task as completed for today
 * @access Private
 */
async function completeTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId } = req.params;

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

    // 2. Verify task belongs to this goal and user
    const task = await Task.findOne({
      _id: taskId,
      goalId,
      userId,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    // 3. Today's date key in the user's own time zone
    const dateKey = getTodayDateKey(req.user.timeZone);

    if (goal.completedAt) {
      return res.status(400).json({ message: "This goal is already completed" });
    }

    // One-time roadmap tasks: today, overdue (pending) and early completion are all allowed.
    if (isRoadmapTask(task)) {
      return completeRoadmapTask(req, res, goal, task);
    }

    // Daily tasks only count while their goal is running (start/deadline are calendar dates).
    if (dateKey < dateOnlyKey(goal.startDate)) {
      return res.status(400).json({ message: "This goal has not started yet" });
    }
    if (goal.deadline && dateKey > dateOnlyKey(goal.deadline)) {
      return res.status(400).json({ message: "This goal has already ended" });
    }

    // 4. Check if already completed today
    const existingCompletion = await TaskCompletion.findOne({
      taskId,
      goalId,
      userId,
      dateKey,
    });

    if (existingCompletion) {
      return res.status(409).json({
        message: "Task is already completed today",
        completion: existingCompletion,
      });
    }

    // 5. Create TaskCompletion record
    const completion = await TaskCompletion.create({
      taskId,
      goalId,
      userId,
      dateKey,
    });

    // 6. Automatically recalculate DailyProgress
    const { progress, goalProgress, progressError } = await recalculateProgress({
      goalId,
      userId,
      dateKey,
      timeZone: req.user.timeZone,
    });

    // Milestone notifications run in the background; this response never waits for them.
    if (goalProgress) notificationEvents.taskCompleted({ userId, goal, goalProgress });

    // 7. Return completion and updated progress
    return res.status(201).json({
      message: "Task completed successfully",
      completion,
      progress,
      goalProgress,
      progressError,
    });
  } catch (error) {
    // Simultaneous duplicate requests hit the { taskId, dateKey } unique index. Any other
    // duplicate-key error is a real problem and must not be disguised as "already completed".
    if (error.code === 11000 && error.keyPattern?.taskId && error.keyPattern?.dateKey) {
      return res.status(409).json({
        message: "Task is already completed today",
      });
    }

    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
}

/**
 * @name GET /:goalId/tasks/:taskId/completions
 * @description Get all completion records for a task
 * @access Private
 */
async function getTaskCompletions(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId } = req.params;

    // 1. Verify task ownership
    const task = await Task.findOne({
      _id: taskId,
      goalId,
      userId,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    // 2. Get all completion records
    const completions = await TaskCompletion.find({
      taskId,
      goalId,
      userId,
    }).sort({ dateKey: -1 });

    return res.status(200).json({
      count: completions.length,
      completions,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
}

/**
 * @name GET /:goalId/tasks/:taskId/completions/:date
 * @description Get completion for a particular date
 * @access Private
 */
async function getTaskCompletionByDate(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId, date } = req.params;

    // 1. Verify task ownership
    const task = await Task.findOne({
      _id: taskId,
      goalId,
      userId,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    // 2. Find completion for the requested date
    const completion = await TaskCompletion.findOne({
      taskId,
      goalId,
      userId,
      dateKey: date,
    });

    if (!completion) {
      return res.status(404).json({
        message: "Task was not completed on this date",
      });
    }

    return res.status(200).json({
      completion,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
}

/**
 * @name DELETE /:goalId/tasks/:taskId/completions/:date
 * @description Undo task completion for a particular date
 * @access Private
 */
async function removeTaskCompletion(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId, date } = req.params;

    // 1. Verify task ownership
    const task = await Task.findOne({
      _id: taskId,
      goalId,
      userId,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    // 2. Remove completion for the requested date
    const completion = await TaskCompletion.findOneAndDelete({
      taskId,
      goalId,
      userId,
      dateKey: date,
    });

    if (!completion) {
      return res.status(404).json({
        message: "Completion record not found",
      });
    }

    // 3. Recalculate DailyProgress after removing completion
    const { progress, goalProgress, progressError } = await recalculateProgress({
      goalId,
      userId,
      dateKey: date,
      timeZone: req.user.timeZone,
    });

    // 4. Return updated progress
    return res.status(200).json({
      message: "Task completion removed successfully",
      completion,
      progress,
      goalProgress,
      progressError,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: error.message,
    });
  }
}

module.exports = {
  completeTask,
  reopenTask,
  getTaskCompletions,
  getTaskCompletionByDate,
  removeTaskCompletion,
};