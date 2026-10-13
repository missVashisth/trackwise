const express = require("express");

const overallProgressRouter = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");
const overallProgressController = require("../controllers/overallProgress.controller");


// Authentication middleware for every request
overallProgressRouter.use(authMiddleware.authUser);
overallProgressRouter.param("goalId", objectIdParam("goal"));


// Get overall progress of a goal
overallProgressRouter.get(
  "/:goalId/progress",
  overallProgressController.getOverallProgress
);

module.exports = overallProgressRouter;