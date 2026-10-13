const { Router } = require("express");
const goalController = require("../controllers/goal.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");

const goalRouter = Router();

// Authentication middleware for ech request
goalRouter.use(authMiddleware.authUser);
goalRouter.param("goalId", objectIdParam("goal"));

/**
 * @router POST /api/goals
 * @description add new Goal
 * @access Private
 */

goalRouter.post(
  "/",
  goalController.addNewGoalController
);

/**
 * @router GET /api/goals
 * @description  Login user
 * @access Private
 */

goalRouter.get("/", goalController.getAllGoalController );


/**
 * @router GET /api/goals/:goalId
 * @description Get a specific goal, including its details.
 * @access Private
 */
goalRouter.get("/:goalId", goalController.getOneGoalController );

/**
 * @router GET /api/goals/:goalId/insights
 * @description Progress history and activity of one goal, for its dashboard.
 * @access Private
 */
goalRouter.get("/:goalId/insights", goalController.getGoalInsightsController );

/**
 * @router GET /api/goals/:goalId/roadmap
 * @description The goal's roadmap tasks grouped for the user's today (today / pending / upcoming / completed).
 * @access Private
 */
goalRouter.get("/:goalId/roadmap", goalController.getGoalRoadmapController );


/**
 * @router PATCH /api/goals/:goalId
 * @description Update a goal, such as its title, deadline or description.
 * @access Private
 */
goalRouter.patch("/:goalId", goalController.updateGoal );

/**
 * @route DELETE /api/goals/:goalId
 * @description Delete a specific goal.
 * @access Private
 */
goalRouter.delete("/:goalId", goalController.deleteGoal );


module.exports = goalRouter;
