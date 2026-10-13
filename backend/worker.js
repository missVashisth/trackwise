// Notification worker: email delivery, retries and scheduled reminders.
// Run alongside the API:  npm run worker
require("dotenv").config();
const mongoose = require("mongoose");
const { createNotificationWorker, registerSchedules } = require("./src/queue/notification.worker");
const { getQueue, closeQueue } = require("./src/queue/notification.queue");
const logger = require("./src/utils/logger");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const worker = createNotificationWorker();
  await getQueue().waitUntilReady();
  await registerSchedules();
  logger.info("worker.started", { pid: process.pid });

  const shutdown = async (signal) => {
    logger.info("worker.stopping", { signal });
    await worker.close();
    await closeQueue();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("worker.start_failed", { error: err.message });
  process.exit(1);
});
