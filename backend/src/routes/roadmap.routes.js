const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { rateLimit } = require("../utils/rateLimit");
const roadmapController = require("../controllers/roadmap.controller");

const roadmapRouter = Router();

roadmapRouter.use(authMiddleware.authUser);

// Each generation is a paid AI call: cap it per user (in-memory, per API process).
const generationLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AI_ROADMAPS_PER_HOUR) || 20,
  key: (req) => req.user?.id ?? null,
  message: "You have generated many roadmaps in the last hour. Please try again later.",
});

/**
 * @name POST /api/roadmaps/generate
 * @description Generate or tailor a roadmap draft (not saved).
 * @access Private
 */
roadmapRouter.post("/generate", generationLimit, roadmapController.generateRoadmapController);

/**
 * @name POST /api/roadmaps/confirm
 * @description Save a confirmed roadmap and create its scheduled tasks (idempotent per requestId).
 * @access Private
 */
roadmapRouter.post("/confirm", roadmapController.confirmRoadmapController);

module.exports = roadmapRouter;
