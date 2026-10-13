// Producer side of the single "notifications" queue. The API process only ever adds jobs here;
// the worker process (worker.js) consumes them.

const { Queue } = require("bullmq");
const logger = require("../utils/logger");
const { redisConnectionOptions, QUEUE_NAME, queuePrefix } = require("./connection");

const JOBS = {
  DELIVER: "deliver",
  TASK_REMINDER_SCAN: "task-reminder-scan",
  REQUEUE_STALE: "requeue-stale",
};

const READY_TIMEOUT_MS = 3000;

const intFromEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const retryConfig = () => ({
  attempts: intFromEnv("NOTIFICATION_MAX_ATTEMPTS", 5),
  backoffMs: intFromEnv("NOTIFICATION_BACKOFF_MS", 30000),
});

let queue = null;
let lastErrorLoggedAt = 0;

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      // Fail fast instead of buffering commands while Redis is unreachable.
      connection: redisConnectionOptions({ enableOfflineQueue: false }),
      prefix: queuePrefix(),
    });
    queue.on("error", (err) => {
      if (Date.now() - lastErrorLoggedAt < 60000) return;
      lastErrorLoggedAt = Date.now();
      logger.warn("queue.connection_error", { error: err.message });
    });
  }
  return queue;
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Add one email delivery job. jobId = notification id, so adding the same notification twice
 * (retries, the stale sweep, races) never produces two jobs.
 * `resetUrl` is only for PASSWORD_RESET: it carries the one-time link to the worker and is
 * never written to MongoDB; those jobs are deleted as soon as they finish.
 */
async function enqueueDelivery(notification, { resetUrl } = {}) {
  const q = getQueue();
  await withTimeout(q.waitUntilReady(), READY_TIMEOUT_MS, "Queue not reachable");

  const sensitive = Boolean(resetUrl);
  const { attempts, backoffMs } = retryConfig();
  const job = await q.add(
    JOBS.DELIVER,
    { notificationId: String(notification._id), ...(sensitive ? { resetUrl } : {}) },
    {
      jobId: `deliver-${notification._id}`,
      attempts,
      backoff: { type: "exponential", delay: backoffMs },
      removeOnComplete: sensitive ? true : { age: 24 * 3600, count: 1000 },
      // Failed jobs are kept a week for inspection (BullMQ's failed set is the dead-letter list),
      // except reset-link jobs, which must not keep the token around.
      removeOnFail: sensitive ? true : { age: 7 * 24 * 3600 },
    }
  );
  logger.info("queue.job_added", { job: JOBS.DELIVER, jobId: job.id, notificationId: String(notification._id) });
  return job;
}

async function closeQueue() {
  if (queue) {
    const q = queue;
    queue = null;
    await q.close();
  }
}

module.exports = { JOBS, getQueue, enqueueDelivery, closeQueue, retryConfig, intFromEnv };
