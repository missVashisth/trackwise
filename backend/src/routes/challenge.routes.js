const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam, dateKeyParam } = require("../middlewares/validateParams.middleware");
const { rateLimit } = require("../utils/rateLimit");
const controller = require("../controllers/challenge.controller");

const router = Router();
router.use(authMiddleware.authUser);
router.param("templateId", objectIdParam("challenge"));
router.param("enrollmentId", objectIdParam("challenge"));
router.param("dateKey", dateKeyParam);

// Creating templates is cheap to abuse; cap it per user.
const templateWrites = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  key: (req) => req.user?.id ?? null,
  message: "You've created or changed many challenges in the last hour. Please try again later.",
});

// Catalogue (built-in templates + the user's own private ones)
router.get("/", controller.listTemplates);
router.post("/templates", templateWrites, controller.createTemplate);
router.get("/templates/:templateId", controller.getTemplate);
router.patch("/templates/:templateId", templateWrites, controller.updateTemplate);
router.post("/templates/:templateId/archive", controller.archiveTemplate);
router.post("/templates/:templateId/join", controller.join);

// The user's own attempts
router.get("/mine", controller.listMine);
router.get("/enrollments/:enrollmentId", controller.getEnrollment);
router.patch("/enrollments/:enrollmentId", controller.updateSettings);
router.post("/enrollments/:enrollmentId/leave", controller.leave);
router.post("/enrollments/:enrollmentId/restart", controller.restart);
router.get("/enrollments/:enrollmentId/days/:dateKey", controller.getDay);
router.put("/enrollments/:enrollmentId/days/:dateKey/activities/:activityKey", controller.logActivity);
router.delete("/enrollments/:enrollmentId/days/:dateKey/activities/:activityKey", controller.clearActivity);

module.exports = router;
