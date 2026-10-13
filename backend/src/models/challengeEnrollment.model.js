const mongoose = require("mongoose");
const { ActivitySchema } = require("./challengeTemplate.model");

// One participant's attempt at a challenge. Restarting creates a new enrollment (attempt + 1), so
// every run keeps its own history. The rules are a snapshot taken when joining (plus the
// participant's own allowed changes) — later template edits never reach a running attempt.

const PersonalActivitySchema = new mongoose.Schema(
  {
    ...ActivitySchema.obj,
    // The participant switched this optional activity off.
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const ChallengeEnrollmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "ChallengeTemplate", required: true },
    attempt: { type: Number, default: 1 },
    // active: running or not started yet; completed: the last day has passed; left: the user left.
    status: { type: String, enum: ["active", "completed", "left"], default: "active" },
    startDate: { type: String, required: true }, // user's local day 1, "YYYY-MM-DD"
    endDate: { type: String, required: true }, // last day
    // Snapshot of the template when joining.
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, required: true },
    durationDays: { type: Number, required: true },
    strict: { type: Boolean, default: false },
    templateVersion: { type: Number, default: 1 },
    activities: { type: [PersonalActivitySchema], default: [] },
    // Reminder choices for this challenge. Email is opt-in.
    reminders: {
      daily: { type: Boolean, default: true },
      weekly: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },
    leftAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// At most one running attempt per user and challenge (also under concurrent joins).
ChallengeEnrollmentSchema.index({ userId: 1, templateId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });
// "My challenges", newest first.
ChallengeEnrollmentSchema.index({ userId: 1, createdAt: -1 });
// Participant counts per challenge, and the reminder scan over running attempts.
ChallengeEnrollmentSchema.index({ status: 1, templateId: 1, endDate: 1 });

module.exports = mongoose.model("ChallengeEnrollment", ChallengeEnrollmentSchema);
