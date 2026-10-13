const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // null for a standalone to-do that is not part of any goal
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null,
    },

    title: {
      type: String,
      required: true,
    },

    // Kind of goal task. Missing (older records) or "daily": recurs every day while the goal runs,
    // ticked per day through TaskCompletion. "roadmap": a one-time task scheduled for one day of
    // the goal, completed once (completedAt). To-dos (no goal) have no kind.
    kind: {
      type: String,
      enum: ["daily", "roadmap"],
    },

    // Only daily goal tasks have a weightage; it drives the goal's daily progress.
    weightage: {
      type: Number,
      required: function () {
        return Boolean(this.goalId) && this.kind !== "roadmap";
      },
      validate: {
        validator: (value) => value == null || (Number.isFinite(value) && value > 0),
        message: "Weightage must be a number greater than 0",
      },
    },

    // To-do only: the day it is planned for ("YYYY-MM-DD"); unfinished to-dos roll over.
    dueDate: {
      type: String,
      default: null,
    },

    // To-dos and roadmap tasks: when it was actually completed (a timestamp), null while open.
    // Daily goal tasks are ticked per day instead (TaskCompletion).
    completedAt: {
      type: Date,
      default: null,
    },

    // ---- Roadmap tasks only
    // Calendar day it is planned for ("YYYY-MM-DD"), inside the goal's start..deadline. Compared
    // with the user's local date; never shifted by time zones and never changed by completing it.
    scheduledDate: {
      type: String,
      default: undefined,
      required: function () {
        return this.kind === "roadmap";
      },
    },
    description: {
      type: String,
      default: undefined,
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: undefined,
    },
    estimatedMinutes: {
      type: Number,
      default: undefined,
      validate: {
        validator: (value) => value == null || (Number.isInteger(value) && value > 0),
        message: "Estimated duration must be a whole number of minutes greater than 0",
      },
    },
    // The date it was first scheduled for. Kept even if the task is ever moved, so the original
    // plan stays known; completing a task never changes either date.
    originalScheduledDate: {
      type: String,
      default: undefined,
    },
    // Position in the roadmap: day number (1 = goal start date) and order within that day.
    roadmapDay: {
      type: Number,
      default: undefined,
    },
    roadmapOrder: {
      type: Number,
      default: undefined,
    },
    // Stable id of the roadmap entry this task was created from (unique per goal); makes saving a
    // roadmap idempotent: a retried save finds the same entries instead of adding copies.
    roadmapItemId: {
      type: String,
      default: undefined,
    },
    // Who created the roadmap item: "manual" or "ai".
    source: {
      type: String,
      enum: ["manual", "ai"],
      default: undefined,
    },

    // status: {
    //   type: String,
    //   enum: ["pending", "done"],
    //   default: "pending",
    // },
  },
  {
    timestamps: true,
  }
);

// Task queries are per user, optionally per goal (task lists, to-dos, reminder scan).
TaskSchema.index({ userId: 1, goalId: 1 });

// One task per roadmap entry per goal. Partial: only roadmap tasks carry a roadmapItemId.
TaskSchema.index(
  { goalId: 1, roadmapItemId: 1 },
  { unique: true, partialFilterExpression: { roadmapItemId: { $type: "string" } } }
);

const Task = mongoose.model("Task", TaskSchema);

module.exports = Task;
