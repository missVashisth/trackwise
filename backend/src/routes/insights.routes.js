const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");
const insightsController = require("../controllers/insights.controller");

const insightsRouter = Router();

insightsRouter.use(authMiddleware.authUser);
insightsRouter.param("goalId", objectIdParam("goal"));
insightsRouter.param("habitId", objectIdParam("habit"));

/** @name GET /api/insights/overview  @description All goals, tasks and habits for a period.  @access Private */
insightsRouter.get("/overview", insightsController.overview);
insightsRouter.get("/challenges", insightsController.challenges);

/** @name GET /api/insights/goals/:goalId  @description One goal for a period.  @access Private */
insightsRouter.get("/goals/:goalId", insightsController.goal);

/** @name GET /api/insights/habits/:habitId  @description One habit for a period.  @access Private */
insightsRouter.get("/habits/:habitId", insightsController.habit);

module.exports = insightsRouter;
