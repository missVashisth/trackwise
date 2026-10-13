const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");
const taskController = require("../controllers/task.controller");

const userTasksRouter = Router();

userTasksRouter.use(authMiddleware.authUser);
userTasksRouter.param("taskId", objectIdParam("task"));

/**
 * @name GET /api/tasks
 * @description Get all tasks of the logged-in user across goals.
 * @access Private
 */
userTasksRouter.get("/", taskController.getUserTasks);

/**
 * @name POST /api/tasks
 * @description Add a standalone to-do for a day.
 * @access Private
 */
userTasksRouter.post("/", taskController.addTodo);

/**
 * @name PATCH /api/tasks/:taskId
 * @description Update a to-do or mark it done.
 * @access Private
 */
userTasksRouter.patch("/:taskId", taskController.updateTodo);

/**
 * @name DELETE /api/tasks/:taskId
 * @description Delete a to-do.
 * @access Private
 */
userTasksRouter.delete("/:taskId", taskController.deleteTodo);

module.exports = userTasksRouter;
