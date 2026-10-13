const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam, dateKeyParam } = require("../middlewares/validateParams.middleware");
const habitController = require("../controllers/habit.controller");

const habitRouter = Router();

habitRouter.use(authMiddleware.authUser);
habitRouter.param("habitId", objectIdParam("habit"));
habitRouter.param("milestoneId", objectIdParam("milestone"));
habitRouter.param("dateKey", dateKeyParam);

/** @name POST /api/habits  @description Create a habit.  @access Private */
habitRouter.post("/", habitController.createHabit);

/** @name GET /api/habits?status=active|archived|all  @description The user's habits with today's progress.  @access Private */
habitRouter.get("/", habitController.listHabits);

/** @name GET /api/habits/:habitId  @description One habit.  @access Private */
habitRouter.get("/:habitId", habitController.getHabit);

/** @name PATCH /api/habits/:habitId  @description Update a habit.  @access Private */
habitRouter.patch("/:habitId", habitController.updateHabit);

/** @name POST /api/habits/:habitId/archive | /restore  @description Archive or restore a habit.  @access Private */
habitRouter.post("/:habitId/archive", habitController.archiveHabit);
habitRouter.post("/:habitId/restore", habitController.restoreHabit);

/** @name PATCH /api/habits/:habitId/milestones/:milestoneId  @description Mark a milestone reached.  @access Private */
habitRouter.patch("/:habitId/milestones/:milestoneId", habitController.setMilestone);

/** @name GET /api/habits/:habitId/logs?from&to  @description Day-by-day history.  @access Private */
habitRouter.get("/:habitId/logs", habitController.getHistory);

/** @name PUT|DELETE /api/habits/:habitId/logs/:dateKey  @description Set or clear a day's progress.  @access Private */
habitRouter.put("/:habitId/logs/:dateKey", habitController.upsertLog);
habitRouter.delete("/:habitId/logs/:dateKey", habitController.deleteLog);

module.exports = habitRouter;
