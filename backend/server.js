require("dotenv").config()
const mongoose = require("mongoose");
const app = require("./src/app");
const connectToDB = require("./src/config/database");
const { dropLegacyCompletionIndexes } = require("./src/migrations/dropLegacyCompletionIndexes");
const logger = require("./src/utils/logger");
const { port: configuredPort, configProblems, optionalWarnings } = require("./src/config/runtime");
const port = configuredPort();

async function start() {
    // Refuse to start half-configured (e.g. no JWT secret) instead of failing on the first request.
    const problems = configProblems();
    if (problems.length) {
        problems.forEach((problem) => logger.error("config.invalid", { problem }));
        throw new Error("Invalid configuration");
    }
    optionalWarnings().forEach((warning) => logger.warn("config.optional_missing", { warning }));

    // Every route needs the database: connect before accepting requests.
    await connectToDB();

    // Only runs once connected. Not fatal: the app works with or without the old indexes.
    try {
        await dropLegacyCompletionIndexes();
    } catch (err) {
        logger.error("migration.legacy_index_cleanup_failed", { error: err.message });
    }

    const server = app.listen(port , ()=>{
        logger.info("server.listening", { port });
    })

    const shutdown = (signal) => {
        logger.info("server.stopping", { signal });
        server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
        // Don't hang forever on keep-alive connections.
        setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

start().catch((err) => {
    // The reason was already logged (config.invalid / db.connect_failed). Exiting beats serving
    // requests that would each hang for 10s in Mongoose's buffer; restart once the cause is fixed.
    console.error(err.message === "Invalid configuration" ? "Server not started: invalid configuration (see config.invalid above)." : "Server not started: could not connect to MongoDB.");
    process.exit(1);
});
