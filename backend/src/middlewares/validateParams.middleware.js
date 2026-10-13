const mongoose = require("mongoose");
const { isValidDateKey } = require("../utils/validation");

/** router.param handler: rejects a malformed ObjectId in the URL with a 400 instead of a cast error. */
function objectIdParam(label) {
  return (req, res, next, value) => {
    if (!mongoose.Types.ObjectId.isValid(value) || String(new mongoose.Types.ObjectId(value)) !== value) {
      return res.status(400).json({ message: `Invalid ${label} ID` });
    }
    next();
  };
}

/** router.param handler for "YYYY-MM-DD" date segments. */
function dateKeyParam(req, res, next, value) {
  if (!isValidDateKey(value)) {
    return res.status(400).json({ message: "Invalid date. Use YYYY-MM-DD" });
  }
  next();
}

module.exports = { objectIdParam, dateKeyParam };
