const mongoose = require("mongoose");
const logger = require("../utils/logger");

// Never let a connection string's credentials reach a log line.
const redact = (text) => String(text).replace(/(mongodb(?:\+srv)?:\/\/)[^@/\s]+@/gi, "$1<credentials>@");

/** What to check for the common startup failures; null when the error is self-explanatory. */
function hintFor(err) {
  if (err.syscall === "querySrv" || err.code === "ENOTFOUND" || err.code === "ETIMEOUT") {
    return "DNS lookup of the Atlas host failed before MongoDB was contacted. Check the network/DNS of this machine (Wi-Fi, VPN, DNS servers), then restart.";
  }
  if (err.name === "MongoServerSelectionError") {
    return "Atlas did not answer. Check this machine's IP is on the Atlas access list and that outbound port 27017 is allowed.";
  }
  if (err.name === "MongoServerError" && /auth/i.test(err.message)) {
    return "Atlas rejected the database user. Check the username/password in MONGO_URI.";
  }
  return null;
}

/**
 * Connects once and rejects on failure. Mongoose does not retry a failed *first* connection,
 * so the caller must not carry on as if the database were available.
 */
async function connectToDB() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (err) {
    logger.error("db.connect_failed", {
      error: redact(err.message),
      code: err.code,
      syscall: err.syscall,
      hint: hintFor(err),
    });
    throw err;
  }

  logger.info("db.connected", { host: mongoose.connection.host, db: mongoose.connection.name });

  // After a successful first connection the driver reconnects by itself; make that visible.
  mongoose.connection.on("disconnected", () => logger.warn("db.disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("db.reconnected"));
  mongoose.connection.on("error", (err) => logger.error("db.error", { error: redact(err.message) }));
}

module.exports = connectToDB;
