const Notification = require("../models/notification.model");
const { CHANNELS } = Notification;

// Fields the client needs; delivery internals (dedupeKey, status, errors) stay server-side.
const PUBLIC_FIELDS = "_id type title message metadata readAt createdAt";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PAGE = 1000;

function parsePositiveInt(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= max ? number : null;
}

// Every query below starts from this filter, so ownership comes from the session, never the client.
const ownInApp = (req) => ({ userId: req.user.id, channel: CHANNELS.IN_APP });

/**
 * @name GET /api/notifications?page=1&limit=20
 * @description The current user's in-app notifications, newest first.
 * @access Private
 */
async function listNotifications(req, res) {
  try {
    const page = parsePositiveInt(req.query.page, 1, MAX_PAGE);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    if (page === null || limit === null) {
      return res.status(400).json({ message: `page must be 1-${MAX_PAGE} and limit 1-${MAX_LIMIT}` });
    }

    // Fetch one extra row to know whether another page exists without a separate count.
    const rows = await Notification.find(ownInApp(req), PUBLIC_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .lean();

    return res.status(200).json({
      notifications: rows.slice(0, limit),
      page,
      limit,
      hasMore: rows.length > limit,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

/**
 * @name GET /api/notifications/unread-count
 * @access Private
 */
async function getUnreadCount(req, res) {
  try {
    const count = await Notification.countDocuments({ ...ownInApp(req), readAt: null });
    return res.status(200).json({ count });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

/**
 * @name PATCH /api/notifications/:notificationId/read
 * @description Mark one of the current user's notifications as read (keeps the first read time).
 * @access Private
 */
async function markAsRead(req, res) {
  try {
    const filter = { ...ownInApp(req), _id: req.params.notificationId };
    const notification =
      (await Notification.findOneAndUpdate({ ...filter, readAt: null }, { $set: { readAt: new Date() } }, { new: true, projection: PUBLIC_FIELDS }).lean()) ??
      (await Notification.findOne(filter, PUBLIC_FIELDS).lean());

    // Someone else's id and a non-existent id look the same.
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    return res.status(200).json({ notification });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

/**
 * @name PATCH /api/notifications/read-all
 * @access Private
 */
async function markAllAsRead(req, res) {
  try {
    const result = await Notification.updateMany({ ...ownInApp(req), readAt: null }, { $set: { readAt: new Date() } });
    return res.status(200).json({ updated: result.modifiedCount });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

module.exports = { listNotifications, getUnreadCount, markAsRead, markAllAsRead };
