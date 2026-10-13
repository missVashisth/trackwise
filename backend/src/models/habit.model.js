const mongoose = require("mongoose");

// A habit is a repeating behaviour with its own schedule and tracking method. Daily progress lives
// in HabitLog (one record per habit per local day); milestones are separate checkpoints.

const ScheduleSchema = new mongoose.Schema(
  {
    // daily: every day. weekdays: only the listed days (0 = Sunday ... 6 = Saturday).
    // timesPerWeek / timesPerMonth: flexible, `timesPerPeriod` days with progress per ISO week
    // (Monday–Sunday) or calendar month, on any days.
    type: { type: String, enum: ["daily", "weekdays", "timesPerWeek", "timesPerMonth"], required: true },
    weekdays: { type: [Number], default: undefined },
    timesPerPeriod: { type: Number, default: undefined },
  },
  { _id: false }
);

const MilestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    // Optional measurable checkpoint, e.g. 50 (pages) or 10 (sessions); unit defaults to the habit's.
    targetValue: { type: Number, default: null },
    targetUnit: { type: String, default: "" },
    targetDate: { type: String, default: null }, // "YYYY-MM-DD"
    // Reaching a milestone is marked by the user; it is independent of daily completion.
    completedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

const HabitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    motivation: { type: String, default: "" }, // why the user wants this habit
    description: { type: String, default: "" }, // what counts as success
    lifeAreaId: { type: mongoose.Schema.Types.ObjectId, ref: "LifeArea", default: null }, // category
    icon: { type: String, default: null },
    color: { type: String, default: null },

    schedule: { type: ScheduleSchema, required: true },
    // Calendar days in the user's time zone ("YYYY-MM-DD"), like task schedules.
    startDate: { type: String, required: true },
    endDate: { type: String, default: null },

    // percentage: the user enters 0–100. measurable: a value against targetValue (unit).
    // checkbox: done / not done.
    trackingMethod: { type: String, enum: ["percentage", "measurable", "checkbox"], required: true },
    targetValue: { type: Number, default: null },
    unit: { type: String, default: "" },

    milestones: { type: [MilestoneSchema], default: [] },

    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Habit lists are per user, active or archived.
HabitSchema.index({ userId: 1, archivedAt: 1 });

module.exports = mongoose.model("Habit", HabitSchema);
