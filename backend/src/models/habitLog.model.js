const mongoose = require("mongoose");

// One record per habit per local day. A day without a record was simply not logged: missed days
// are never stored, analytics derive them from the habit's schedule.
const HabitLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    habitId: { type: mongoose.Schema.Types.ObjectId, ref: "Habit", required: true },
    dateKey: { type: String, required: true }, // the user's local calendar day, "YYYY-MM-DD"

    // Share of the day's goal reached, 0–100 (partial credit counts).
    progressPercent: { type: Number, required: true, min: 0, max: 100 },
    // Measurable habits: what was done and the target in force that day (so a later target change
    // does not rewrite history).
    actualValue: { type: Number, default: null },
    targetValue: { type: Number, default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// At most one record per habit per day.
HabitLogSchema.index({ userId: 1, habitId: 1, dateKey: 1 }, { unique: true });

// Insights read all of a user's logs for a date range (across habits).
HabitLogSchema.index({ userId: 1, dateKey: 1 });

module.exports = mongoose.model("HabitLog", HabitLogSchema);
