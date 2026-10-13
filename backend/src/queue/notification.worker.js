// Consumer side of the "notifications" queue. One worker handles every job type:
//   deliver            - send one EMAIL notification (retries with exponential backoff)
//   task-reminder-scan - daily cron (BullMQ job scheduler)
//   requeue-stale      - periodic sweep for emails that never reached the queue

const { Worker, UnrecoverableError, DelayedError } = require("bullmq");
const IORedis = require("ioredis");
const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const defaultEmailService = require("../services/email/email.service");
const { renderEmail } = require("../services/email/emailTemplates");
const { createRedisRateLimiter } = require("./deliveryRateLimit");
const { runReminderScan, requeueStaleEmails, reminderMinutes } = require("./reminder.scan");
const { runChallengeScan } = require("./challenge.scan");
const { JOBS, getQueue, intFromEnv } = require("./notification.queue");
const { redisConnectionOptions, QUEUE_NAME, queuePrefix } = require("./connection");
const logger = require("../utils/logger");

const HOUR_MS = 60 * 60 * 1000;

async function markFailed(notificationId, message, extra = {}) {
  await Notification.updateOne(
    { _id: notificationId },
    { $set: { status: "failed", failedAt: new Date(), lastError: message, ...extra } }
  );
}

/**
 * Deliver one EMAIL notification. Exported separately so it can be tested with a plain job object.
 * Outcomes: sent | skipped (already handled) | delayed (rate limit) | retry (transient) | failed.
 */
async function processDelivery(job, token, { emailService = defaultEmailService, rateLimiter } = {}) {
  const { notificationId, resetUrl } = job.data;
  const notification = await Notification.findById(notificationId);

  if (!notification || notification.channel !== "EMAIL") {
    logger.warn("delivery.skipped", { notificationId, reason: "not_found" });
    return { outcome: "skipped", reason: "not_found" };
  }
  // Idempotency: a duplicate or replayed job must not send twice.
  if (notification.status !== "queued") {
    logger.info("delivery.skipped", { notificationId, reason: `status_${notification.status}` });
    return { outcome: "skipped", reason: notification.status };
  }

  const user = await User.findById(notification.userId).select("email username").lean();
  if (!user) {
    await markFailed(notification._id, "User no longer exists");
    logger.warn("delivery.failed", { notificationId, type: notification.type, reason: "user_missing" });
    return { outcome: "failed", reason: "user_missing" };
  }

  const isPasswordReset = notification.type === "PASSWORD_RESET";
  if (isPasswordReset && !resetUrl) {
    await markFailed(notification._id, "Reset link missing from job");
    return { outcome: "failed", reason: "reset_link_missing" };
  }

  // Password-reset requests are throttled at the API instead; never delay a reset email here.
  if (!isPasswordReset && rateLimiter) {
    const max = intFromEnv("EMAIL_MAX_PER_USER_PER_HOUR", 10);
    const limit = await rateLimiter.consume(`notifications:email-rate:${notification.userId}`, max, HOUR_MS);
    if (!limit.allowed) {
      logger.info("delivery.rate_limited", { notificationId, type: notification.type, retryAfterMs: limit.retryAfterMs });
      await job.moveToDelayed(Date.now() + limit.retryAfterMs, token);
      throw new DelayedError();
    }
  }

  const content = renderEmail(notification.type, {
    username: user.username,
    title: notification.title,
    message: notification.message,
    ...notification.metadata,
    resetUrl,
  });

  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 1;

  try {
    const { id } = await emailService.send({
      to: user.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      // Lets the provider drop a duplicate if a retry repeats a send that actually went through.
      idempotencyKey: `notification-${notification._id}`,
    });
    await Notification.updateOne(
      { _id: notification._id },
      { $set: { status: "sent", deliveredAt: new Date(), providerMessageId: id, lastError: null }, $inc: { attempts: 1 } }
    );
    logger.info("delivery.sent", { notificationId, type: notification.type, attempt });
    return { outcome: "sent" };
  } catch (err) {
    const permanent = Boolean(err.permanent);
    const finalAttempt = permanent || attempt >= maxAttempts;
    await Notification.updateOne(
      { _id: notification._id },
      {
        $set: { lastError: err.message, ...(finalAttempt ? { status: "failed", failedAt: new Date() } : {}) },
        $inc: { attempts: 1 },
      }
    );
    const fields = { notificationId, type: notification.type, attempt, maxAttempts, permanent, code: err.code, error: err.message };
    if (finalAttempt) logger.error("delivery.failed", fields);
    else logger.warn("delivery.retry_scheduled", fields);

    // Permanent errors skip the remaining attempts; transient ones go back with exponential backoff.
    if (permanent) throw new UnrecoverableError(err.message);
    throw err;
  }
}

function createProcessor(deps) {
  return async function processJob(job, token) {
    switch (job.name) {
      case JOBS.DELIVER:
        return processDelivery(job, token, deps);
      case JOBS.TASK_REMINDER_SCAN: {
        // Challenges ride on the same schedule; their failure must not undo task reminders.
        const tasks = await runReminderScan();
        const challenges = await runChallengeScan({ dueAt: reminderMinutes() }).catch((err) => {
          logger.error("scheduler.challenge_scan_failed", { error: err.message });
          return null;
        });
        return { tasks, challenges };
      }
      case JOBS.REQUEUE_STALE:
        return requeueStaleEmails();
      default:
        throw new UnrecoverableError(`Unknown job ${job.name}`);
    }
  };
}

function createNotificationWorker({ emailService = defaultEmailService, concurrency = 5 } = {}) {
  const rateLimitClient = new IORedis(redisConnectionOptions({ maxRetriesPerRequest: 3 }));
  rateLimitClient.on("error", (err) => logger.warn("queue.rate_limit_redis_error", { error: err.message }));
  const rateLimiter = createRedisRateLimiter(async () => rateLimitClient);

  const worker = new Worker(QUEUE_NAME, createProcessor({ emailService, rateLimiter }), {
    connection: redisConnectionOptions({ maxRetriesPerRequest: null }),
    prefix: queuePrefix(),
    concurrency,
    // Provider throughput cap across all workers (Resend's default is 2 requests/second).
    limiter: { max: intFromEnv("EMAIL_PROVIDER_MAX_PER_SECOND", 2), duration: 1000 },
  });

  worker.on("failed", (job, err) => {
    if (!job || err?.name === "DelayedError") return;
    const exhausted = job.attemptsMade >= (job.opts?.attempts ?? 1) || err?.name === "UnrecoverableError";
    logger[exhausted ? "error" : "warn"]("queue.job_failed", {
      job: job.name,
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      exhausted,
      error: err?.message,
    });
  });
  worker.on("error", (err) => logger.error("queue.worker_error", { error: err.message }));

  const closeWorker = worker.close.bind(worker);
  worker.close = async (...args) => {
    await closeWorker(...args);
    await rateLimitClient.quit().catch(() => {});
  };

  return worker;
}

/**
 * Idempotent: upserting the same scheduler ids on every start never duplicates schedules.
 * Reminders are per user, at their own local time (see reminder.scan.js), so the scan itself
 * runs every 15 minutes; this also covers zones with :30 and :45 offsets.
 */
async function registerSchedules(queue = getQueue()) {
  const pattern = process.env.REMINDER_SCAN_CRON || "*/15 * * * *";
  const { reminderMinutes } = require("./reminder.scan");
  const minutes = reminderMinutes();
  await queue.upsertJobScheduler("task-reminders", { pattern }, { name: JOBS.TASK_REMINDER_SCAN });
  await queue.upsertJobScheduler("requeue-stale-emails", { every: 15 * 60 * 1000 }, { name: JOBS.REQUEUE_STALE });
  logger.info("scheduler.registered", {
    reminderScanCron: pattern,
    reminderLocalTime: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
  });
}

module.exports = { createNotificationWorker, registerSchedules, processDelivery, createProcessor };
