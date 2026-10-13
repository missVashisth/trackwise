const mongoose = require("mongoose");

const DailyProgressSchema = new mongoose.Schema(
  {
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

    totalWeight: {
      type: Number,
      required: true,
    },

    completedWeight: {
      type: Number,
      required: true,
    },

    completionRatio: {
      type: Number,
      required: true,
    },

    dailyTarget: {
      type: Number,
      required: true,
    },

    dailyProgress: {
      type: Number,
      required: true,
    },

    // Whether this day's progress is locked
    isFinalized: {
      type: Boolean,
      default: false,
    },

    // When this day's progress was locked
    finalizedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// One record per goal per day. Partial, because legacy records from an older schema have a
// `date` string and no `dateKey`; every current record has a dateKey and is fully protected.
DailyProgressSchema.index(
  { goalId: 1, dateKey: 1 },
  { unique: true, partialFilterExpression: { dateKey: { $type: "string" } } }
);

// Insights read all of a user's daily progress for a date range (across goals).
DailyProgressSchema.index({ userId: 1, dateKey: 1 });

const DailyProgress = mongoose.model(
  "DailyProgress",
  DailyProgressSchema
);

module.exports = DailyProgress;










// const mongoose = require("mongoose");

// const DailyProgressSchema = new mongoose.Schema(
//   {
//     goalId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Goal",
//       required: true,
//     },

//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },

//     dateKey: {
//       type: String,
//       required: true,
//     },

//     totalWeight: {
//       type: Number,
//       required: true,
//     },

//     completedWeight: {
//       type: Number,
//       required: true,
//     },

//     completionRatio: {
//       type: Number,
//       required: true,
//     },

//     dailyTarget: {
//       type: Number,
//       required: true,
//     },

//     dailyProgress: {
//       type: Number,
//       required: true,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // One progress record per goal per day
// DailyProgressSchema.index(
//   { goalId: 1, dateKey: 1 },
//   { unique: true }
// );

// const DailyProgress = mongoose.model(
//   "DailyProgress",
//   DailyProgressSchema
// );

// module.exports = DailyProgress;