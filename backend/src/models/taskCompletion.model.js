const mongoose = require("mongoose");

const TaskCompletionSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },

    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    dateKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// A task can only be completed once on a particular day
TaskCompletionSchema.index(
  { taskId: 1, dateKey: 1 },
  { unique: true }
);

// "What did this user complete today?" (task list flags, reminder scan).
TaskCompletionSchema.index({ userId: 1, dateKey: 1 });

// A goal's completion history (goal dashboard, deleting a goal).
TaskCompletionSchema.index({ goalId: 1, dateKey: 1 });

const TaskCompletion = mongoose.model(
  "TaskCompletion",
  TaskCompletionSchema
);

module.exports = TaskCompletion;




// Notes
// Task A → Oct 1
// Task A → Oct 2
// Task A → Oct 3

// MongoDB has 3 completion documents.

// If Task A wasn't completed on Oct 4, there is simply no Oct 4 document.