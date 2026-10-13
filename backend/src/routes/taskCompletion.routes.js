const express = require("express");
const taskCompletionRouter = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam, dateKeyParam } = require("../middlewares/validateParams.middleware");

// const authUser = require("../middlewares/auth.middleware");
const taskCompletionController = require("../controllers/taskCompletion.controller");


// Authentication middleware for ech request
taskCompletionRouter.use(authMiddleware.authUser);
taskCompletionRouter.param("goalId", objectIdParam("goal"));
taskCompletionRouter.param("taskId", objectIdParam("task"));
taskCompletionRouter.param("date", dateKeyParam);


// Mark a task as completed for today
/**
 * @name POST /:goalId/subtasks/:taskId/complete
 * @description Mark task as completed for today
 * @access Private
 */
taskCompletionRouter.post("/:goalId/tasks/:taskId/complete",taskCompletionController.completeTask);

/**
 * @name POST /:goalId/tasks/:taskId/reopen
 * @description Mark a completed roadmap task as not done again
 * @access Private
 */
taskCompletionRouter.post("/:goalId/tasks/:taskId/reopen",taskCompletionController.reopenTask);

// // Get completion history for a task
/**
 * @name GET /:goalId/subtasks/:taskId/complete
 * @description Get all completion records for a task
 * @access Private
 */
taskCompletionRouter.get("/:goalId/tasks/:taskId/completions",taskCompletionController.getTaskCompletions);



/**
 * @name GET /:goalId/tasks/:taskId/completions/:date
 * @description Get completion for a particular date
 * @access Private
 */
// taskCompletionRouter.get("/:goalId/tasks/:taskId/completions/:date",taskCompletionController.getTaskCompletionByDate);
taskCompletionRouter.get("/:goalId/tasks/:taskId/completions/:date",taskCompletionController.getTaskCompletionByDate);


/**
 * @name DELETE /:goalId/tasks/:taskId/completions/:date
 * @description Undo task completion for a particular date
 * @access Private
 */
taskCompletionRouter.delete("/:goalId/tasks/:taskId/completions/:date",taskCompletionController.removeTaskCompletion);





module.exports = taskCompletionRouter;