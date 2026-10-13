const express = require("express");

const dailyProgressRouter = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");
const dailyProgressController = require("../controllers/dailyProgress.controller");


// Authentication middleware for every request
dailyProgressRouter.use(authMiddleware.authUser);
dailyProgressRouter.param("goalId", objectIdParam("goal"));


// Get progress for a particular day
dailyProgressRouter.get(
  "/:goalId/progress/daily",
  dailyProgressController.getDailyProgress
);

module.exports = dailyProgressRouter;