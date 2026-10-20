

// require("dotenv").config()
// const mongoose = require("mongoose");
// const app = require("./src/app");
// const connectToDB = require("./src/config/database");
// const { dropLegacyCompletionIndexes } = require("./src/migrations/dropLegacyCompletionIndexes");
// const logger = require("./src/utils/logger");
// const { port: configuredPort, configProblems, optionalWarnings } = require("./src/config/runtime");
// const port = configuredPort();

// async function start() {
//     // Refuse to start half-configured (e.g. no JWT secret) instead of failing on the first request.
//     const problems = configProblems();
//     if (problems.length) {
//         problems.forEach((problem) => logger.error("config.invalid", { problem }));
//         throw new Error("Invalid configuration");
//     }
//     optionalWarnings().forEach((warning) => logger.warn("config.optional_missing", { warning }));

//     // Every route needs the database: connect before accepting requests.
//     await connectToDB();

//     // Only runs once connected. Not fatal: the app works with or without the old indexes.
//     try {
//         await dropLegacyCompletionIndexes();
//     } catch (err) {
//         logger.error("migration.legacy_index_cleanup_failed", { error: err.message });
//     }

//     const server = app.listen(port , ()=>{
//         logger.info("server.listening", { port });
//     })

//     const shutdown = (signal) => {
//         logger.info("server.stopping", { signal });
//         server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
//         // Don't hang forever on keep-alive connections.
//         setTimeout(() => process.exit(0), 10_000).unref();
//     };
//     process.on("SIGINT", shutdown);
//     process.on("SIGTERM", shutdown);
// }

// start().catch((err) => {
//     // The reason was already logged (config.invalid / db.connect_failed). Exiting beats serving
//     // requests that would each hang for 10s in Mongoose's buffer; restart once the cause is fixed.
//     console.error(err.message === "Invalid configuration" ? "Server not started: invalid configuration (see config.invalid above)." : "Server not started: could not connect to MongoDB.");
//     process.exit(1);
// });







require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./src/app");
const connectToDB = require("./src/config/database");
const {
  dropLegacyCompletionIndexes,
} = require("./src/migrations/dropLegacyCompletionIndexes");
const logger = require("./src/utils/logger");
const {
  port: configuredPort,
  configProblems,
  optionalWarnings,
} = require("./src/config/runtime");

// Existing BullMQ worker and queue modules
const {
  createNotificationWorker,
  registerSchedules,
} = require("./src/queue/notification.worker");
const {
  getQueue,
  closeQueue,
} = require("./src/queue/notification.queue");

const port = configuredPort();

let notificationWorker = null;
let shuttingDown = false;

async function startNotificationWorker() {
  const worker = createNotificationWorker();

  try {
    await getQueue().waitUntilReady();
    await registerSchedules();

    logger.info("worker.started", { pid: process.pid });

    return worker;
  } catch (err) {
    await worker.close().catch(() => {});
    await closeQueue().catch(() => {});
    throw err;
  }
}

async function start() {
  const problems = configProblems();

  if (problems.length) {
    problems.forEach((problem) =>
      logger.error("config.invalid", { problem })
    );
    throw new Error("Invalid configuration");
  }

  optionalWarnings().forEach((warning) =>
    logger.warn("config.optional_missing", { warning })
  );

  // Connect MongoDB before accepting requests.
  await connectToDB();

  try {
    await dropLegacyCompletionIndexes();
  } catch (err) {
    logger.error("migration.legacy_index_cleanup_failed", {
      error: err.message,
    });
  }

  const server = app.listen(port, () => {
    logger.info("server.listening", { port });

    // Start the worker without blocking the API from starting.
    startNotificationWorker()
      .then(async (worker) => {
        if (shuttingDown) {
          await worker.close();
          await closeQueue();
          return;
        }

        notificationWorker = worker;
      })
      .catch((err) => {
        logger.error("worker.start_failed", {
          error: err.message,
        });
      });
  });

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info("server.stopping", { signal });

    const forceExit = setTimeout(() => {
      process.exit(1);
    }, 10_000);

    forceExit.unref();

    server.close(async () => {
      try {
        if (notificationWorker) {
          await notificationWorker.close();
          notificationWorker = null;
        }

        await closeQueue();
        await mongoose.disconnect();

        clearTimeout(forceExit);
        process.exit(0);
      } catch (err) {
        logger.error("server.shutdown_failed", {
          error: err.message,
        });
        process.exit(1);
      }
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error(
    err.message === "Invalid configuration"
      ? "Server not started: invalid configuration (see config.invalid above)."
      : "Server not started: could not connect to MongoDB."
  );

  process.exit(1);
});



