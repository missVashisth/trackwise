const { Router} = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");
const taskController = require("../controllers/task.controller");


const taskRouter = Router();

// Authentication middleware for ech request
taskRouter.use(authMiddleware.authUser);
taskRouter.param("goalId", objectIdParam("goal"));
taskRouter.param("taskId", objectIdParam("task"));


/**
 * @name POST /api/goals/:goalId/tasks
 * @description Add a task to a particular goal.
 * @access Private
 */

taskRouter.post("/:goalId/tasks", taskController.addTask);

/**
 * @name Get  /api/goals/:goalId/tasks
 * @description Get all tasks belonging to that goal.
 * @access Private
 */
taskRouter.get("/:goalId/tasks", taskController.getAllTasks);

/**
 * @name GET /api/goals/:goalId/tasks/:taskId
 * @description Get the details of a particular subtask.
 * @access Private
 */
taskRouter.get("/:goalId/tasks/:taskId", taskController.getOneTask);



/**
 * @name PATCH /api/goals/:goalId/tasks/:taskId
 * @description Update a task or mark it as complete.
 * @access Private
 */
taskRouter.patch("/:goalId/tasks/:taskId",taskController.updateTask);


/**
 * @name DELETE /api/goals/:goalId/subtasks/:subtaskId
 * @description Delete a particular subtask.
 * @access Private
 */
taskRouter.delete("/:goalId/tasks/:taskId",taskController.deleteTask);





module.exports = taskRouter;