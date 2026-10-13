const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const { objectIdParam } = require("../middlewares/validateParams.middleware");
const notificationController = require("../controllers/notification.controller");

const notificationRouter = Router();

notificationRouter.use(authMiddleware.authUser);
notificationRouter.param("notificationId", objectIdParam("notification"));

/**
 * @router GET /api/notifications
 * @description List the current user's in-app notifications (paginated)
 * @access Private
 */
notificationRouter.get("/", notificationController.listNotifications);

/**
 * @router GET /api/notifications/unread-count
 * @description Number of unread in-app notifications
 * @access Private
 */
notificationRouter.get("/unread-count", notificationController.getUnreadCount);

/**
 * @router PATCH /api/notifications/read-all
 * @description Mark all of the current user's notifications as read
 * @access Private
 */
notificationRouter.patch("/read-all", notificationController.markAllAsRead);

/**
 * @router PATCH /api/notifications/:notificationId/read
 * @description Mark one notification as read
 * @access Private
 */
notificationRouter.patch("/:notificationId/read", notificationController.markAsRead);

module.exports = notificationRouter;
