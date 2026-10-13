const mongoose = require("mongoose");

// One record per enrollment, activity and local day — updating an activity replaces that day's
// record. Days without a record were not logged: missed days are derived, never stored.
const ChallengeLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "ChallengeEnrollment", required: true },
    activityKey: { type: String, required: true },
    dateKey: { type: String, required: true }, // "YYYY-MM-DD", the participant's local day
    // checkbox: done; numeric: value (and the target in force that day, so later changes keep history).
    done: { type: Boolean, default: false },
    value: { type: Number, default: null },
    target: { type: Number, default: null },
    // 0–100: share of the day's target reached (checkbox: 0 or 100). Met at 100.
    progressPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { timestamps: true }
);

ChallengeLogSchema.index({ enrollmentId: 1, activityKey: 1, dateKey: 1 }, { unique: true });
// Reports read one enrollment's logs; Insights read a user's logs for a date range.
ChallengeLogSchema.index({ enrollmentId: 1, dateKey: 1 });
ChallengeLogSchema.index({ userId: 1, dateKey: 1 });

module.exports = mongoose.model("ChallengeLog", ChallengeLogSchema);
