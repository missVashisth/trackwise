const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "TASK_REMINDER",
  "GOAL_COMPLETED",
  "PROGRESS_MILESTONE",
  "PASSWORD_RESET",
  "CHALLENGE_REMINDER",
  "CHALLENGE_WEEKLY",
  "CHALLENGE_ENDING",
  "CHALLENGE_FINISHED",
];
const CHANNELS = { IN_APP: "IN_APP", EMAIL: "EMAIL" };

// IN_APP: "delivered" as soon as it is stored. EMAIL: queued -> sent | failed (| skipped).
const STATUSES = ["delivered", "queued", "sent", "failed", "skipped"];

const NotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    channel: {
      type: String,
      enum: Object.values(CHANNELS),
      required: true,
    },
    // Final rendered text. Stored, so later template changes never rewrite history.
    title: { type: String, required: true },
    message: { type: String, required: true },
    // Non-sensitive context for the UI (goalId, goalTitle, milestone, pendingCount, date).
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Same logical notification -> same key; the unique index makes duplicates impossible.
    dedupeKey: { type: String },
    readAt: { type: Date, default: null },
    status: { type: String, enum: STATUSES, required: true },
    attempts: { type: Number, default: 0 },
    deliveredAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    providerMessageId: { type: String, default: null },
  },
  { timestamps: true }
);

// The bell: a user's in-app notifications, newest first (also serves the unread count).
NotificationSchema.index({ userId: 1, channel: 1, createdAt: -1 });
// Deduplication.
NotificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);
// Challenge scan: "was this enrollment already notified today?" (challenge notifications only).
NotificationSchema.index(
  { "metadata.enrollmentId": 1, "metadata.date": 1 },
  { partialFilterExpression: { "metadata.enrollmentId": { $type: "string" } } }
);
// The stale-email sweep only ever looks at queued emails, so keep that index tiny.
NotificationSchema.index(
  { createdAt: 1 },
  { partialFilterExpression: { status: "queued" } }
);

const Notification = mongoose.model("Notification", NotificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.CHANNELS = CHANNELS;
