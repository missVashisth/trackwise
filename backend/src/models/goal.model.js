const mongoose = require("mongoose");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MetricSchema = new mongoose.Schema(
    {
        type: { type: String, default: "numeric" },
        current: { type: Number, default: 0 },
        target: { type: Number, default: 100 },
        unit: { type: String, default: "" },
        prefix: { type: Boolean, default: false },
    },
    { _id: false }
)

const RoadmapSchema = new mongoose.Schema(
    {
        requestId: { type: String, required: true },
        status: { type: String, enum: ["saving", "active"], required: true },
        source: { type: String, enum: ["ai", "manual"], default: "ai" },
        model: { type: String, default: null },
        summary: { type: String, default: "" },
        phases: {
            type: [
                new mongoose.Schema(
                    { title: String, description: String, startDay: Number, endDay: Number },
                    { _id: false }
                ),
            ],
            default: [],
        },
        // What the user told the generator when tailoring (no secrets; free text they typed).
        preferences: { type: mongoose.Schema.Types.Mixed, default: null },
        // Fingerprint of the confirmed draft: a retry must send the same roadmap.
        draftHash: { type: String, required: true },
        confirmedAt: { type: Date, default: null },
    },
    { _id: false }
)

const GoalSchema = new mongoose.Schema(
    {
        title:{
            type: String,
            required: true
        },
        description: {
            type: String,
            default: "",
        },
        // Duration in days. Each day is worth 100 / totalDays percent of progress.
        totalDays: {
            type: Number,
            required: [true, "Set the goal duration in days"],
            min: [1, "Duration must be at least 1 day"],
            validate: {
                validator: Number.isInteger,
                message: "Duration must be a whole number of days",
            },
        },
        startDate:{
            type: Date,
            default: Date.now,
        },
        // Last day of the goal; always derived from startDate + totalDays.
        deadline: {
            type: Date,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true
        },
        completedAt: {
            type: Date,
            default: null,
        },
        lifeAreaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LifeArea",
            default: null,
        },
        parentGoalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Goal",
            default: null,
        },
        impact: {
            type: String,
            enum: ["high", "medium", "low"],
            default: "medium",
        },
        metric: {
            type: MetricSchema,
            default: undefined,
        },
        // metric.current values over time
        history: {
            type: [Number],
            default: [],
        },
        color: {
            type: String,
            default: null,
        },
        isFavorite: {
            type: Boolean,
            default: false,
        },
        // Optional planning context (used to generate a roadmap).
        dailyMinutes: {
            type: Number,
            default: null,
            validate: {
                validator: (value) => value == null || (Number.isInteger(value) && value >= 5 && value <= 1440),
                message: "Time per day must be between 5 and 1440 minutes",
            },
        },
        skillLevel: {
            type: String,
            enum: ["beginner", "intermediate", "advanced", null],
            default: null,
        },
        targetOutcome: {
            type: String,
            default: "",
            maxlength: [500, "Keep the target outcome under 500 characters"],
        },
        // The confirmed roadmap of this goal (its tasks are Task documents with kind "roadmap").
        // Absent until the user confirms one. status "saving" only while a confirmation is being
        // written; a retry with the same requestId finishes it instead of starting another.
        roadmap: {
            type: RoadmapSchema,
            default: undefined,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }

    },
    {
        timestamps: true
    }
)

GoalSchema.pre("validate", function () {
    if (this.startDate && this.totalDays) {
        this.deadline = new Date(this.startDate.getTime() + (this.totalDays - 1) * MS_PER_DAY);
    }
    this.isActive = !this.completedAt;
})


// Every goal query is scoped to one user (goal list, reminder scan).
GoalSchema.index({ user: 1 });

// A roadmap confirmation (requestId) creates at most one goal per user, even when retried.
GoalSchema.index(
    { user: 1, "roadmap.requestId": 1 },
    { unique: true, partialFilterExpression: { "roadmap.requestId": { $type: "string" } } }
);

const Goal = mongoose.model("Goal", GoalSchema)

module.exports = Goal;
