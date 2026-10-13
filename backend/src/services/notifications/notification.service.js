// Decides which notifications exist and creates them. Callers describe a business event;
// this service picks channels, generates text, persists, and hands email to the queue.

const Notification = require("../../models/notification.model");
const { CHANNELS } = Notification;
const { getMessageGenerator } = require("./messageGenerator");
const { enqueueDelivery } = require("../../queue/notification.queue");
const logger = require("../../utils/logger");

const CHANNELS_BY_TYPE = {
  TASK_REMINDER: [CHANNELS.IN_APP, CHANNELS.EMAIL],
  GOAL_COMPLETED: [CHANNELS.IN_APP, CHANNELS.EMAIL],
  PROGRESS_MILESTONE: [CHANNELS.IN_APP],
  PASSWORD_RESET: [CHANNELS.EMAIL],
  // Challenge emails are opt-in per challenge: callers pass `channels` to drop EMAIL.
  CHALLENGE_REMINDER: [CHANNELS.IN_APP, CHANNELS.EMAIL],
  CHALLENGE_WEEKLY: [CHANNELS.IN_APP, CHANNELS.EMAIL],
  CHALLENGE_ENDING: [CHANNELS.IN_APP, CHANNELS.EMAIL],
  CHALLENGE_FINISHED: [CHANNELS.IN_APP, CHANNELS.EMAIL],
};

// The hand-off to the queue; replaceable so tests can observe it without Redis.
let enqueue = enqueueDelivery;

const channelKey = (dedupeKey, channel) => (dedupeKey ? `${dedupeKey}:${channel}` : undefined);

/**
 * @param {object} event
 * @param {string} event.userId   - always taken from the authenticated user / trusted server code
 * @param {string} event.type     - one of Notification.NOTIFICATION_TYPES
 * @param {object} [event.data]   - template context; stored as metadata, so never put secrets here
 * @param {string} [event.dedupeKey] - same key => same logical notification (created at most once)
 * @param {object} [event.delivery]  - transient delivery-only values (the reset link), never stored
 * @param {string[]} [event.channels] - narrow the type's channels (e.g. no EMAIL without opt-in)
 * @returns created Notification documents (empty when everything was a duplicate)
 */
async function notify({ userId, type, data = {}, dedupeKey, delivery = {}, channels: only }) {
  const allowed = CHANNELS_BY_TYPE[type];
  if (!allowed) throw new Error(`Unknown notification type ${type}`);
  const channels = only ? allowed.filter((c) => only.includes(c)) : allowed;
  if (!channels.length) return [];

  // Cheap pre-check so duplicates don't cost a message generation (matters once that is an AI call).
  if (dedupeKey) {
    const existing = await Notification.countDocuments({
      dedupeKey: { $in: channels.map((c) => channelKey(dedupeKey, c)) },
    });
    if (existing === channels.length) {
      logger.debug("notification.duplicate_skipped", { type, userId: String(userId), dedupeKey });
      return [];
    }
  }

  const { title, message } = await getMessageGenerator().generate({ type, data, userId });

  const created = [];
  for (const channel of channels) {
    const inApp = channel === CHANNELS.IN_APP;
    try {
      const notification = await Notification.create({
        userId,
        type,
        channel,
        title,
        message,
        metadata: data,
        dedupeKey: channelKey(dedupeKey, channel),
        status: inApp ? "delivered" : "queued",
        deliveredAt: inApp ? new Date() : null,
      });
      created.push(notification);
      logger.info("notification.created", { notificationId: String(notification._id), type, channel, userId: String(userId) });
    } catch (err) {
      // The unique dedupeKey index is the real guarantee when two callers race past the pre-check.
      if (err.code === 11000) {
        logger.debug("notification.duplicate_skipped", { type, channel, userId: String(userId), dedupeKey });
        continue;
      }
      throw err;
    }
  }

  for (const notification of created.filter((n) => n.channel === CHANNELS.EMAIL)) {
    try {
      await enqueue(notification, delivery);
    } catch (err) {
      logger.warn("notification.enqueue_failed", { notificationId: String(notification._id), type, error: err.message });
      if (delivery.resetUrl) {
        // The reset link only exists in memory, so the stale sweep cannot retry this one later.
        await Notification.updateOne(
          { _id: notification._id },
          { $set: { status: "failed", failedAt: new Date(), lastError: "Queue unavailable" } }
        );
      }
      // Other emails stay "queued"; the worker's stale sweep enqueues them once Redis is back.
    }
  }

  return created;
}

const inFlight = new Set();

/**
 * Fire-and-forget: the caller's request finishes without waiting, and a notification failure
 * can never fail the business operation that triggered it.
 */
function notifyInBackground(event) {
  const work = new Promise((resolve) => setImmediate(resolve))
    .then(() => notify(event))
    .catch((err) => {
      logger.error("notification.notify_failed", { type: event.type, userId: String(event.userId), error: err });
    })
    .finally(() => inFlight.delete(work));
  inFlight.add(work);
}

/** Tests and graceful shutdown: wait for background notification work to settle. */
async function flushBackgroundNotifications() {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

module.exports = {
  notify,
  notifyInBackground,
  flushBackgroundNotifications,
  CHANNELS_BY_TYPE,
  setEnqueueDelivery: (fn) => {
    enqueue = fn;
  },
  resetEnqueueDelivery: () => {
    enqueue = enqueueDelivery;
  },
};
