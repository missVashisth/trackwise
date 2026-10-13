const mongoose = require("mongoose");

// A reusable challenge definition ("75 Hard", "Reading Challenge", a user's own). Participants never
// read their rules from here after joining: each enrollment keeps its own snapshot, so editing a
// template (which bumps `version`) never rewrites anyone's running challenge.

const CATEGORIES = ["fitness", "learning", "wellness", "productivity", "lifestyle", "custom"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const ACTIVITY_KINDS = ["checkbox", "numeric"];

const ActivitySchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // stable id within the template (logs refer to it)
    title: { type: String, required: true },
    description: { type: String, default: "" },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    // numeric: met when the logged value reaches target (in `unit`).
    target: { type: Number, default: null },
    unit: { type: String, default: "" },
    required: { type: Boolean, default: true },
    // Participants may change the target (numeric) / switch it off (optional activities only).
    customizable: { type: Boolean, default: false },
    // Weekdays it applies to (0 = Sunday … 6 = Saturday); empty = every day.
    days: { type: [Number], default: [] },
  },
  { _id: false }
);

const ChallengeTemplateSchema = new mongoose.Schema(
  {
    // Built-in catalogue entries have a slug (idempotent seeding) and no owner.
    slug: { type: String, default: undefined },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: String, enum: CATEGORIES, required: true },
    difficulty: { type: String, enum: DIFFICULTIES, default: "medium" },
    durationDays: { type: Number, required: true, min: 1, max: 365 },
    activities: { type: [ActivitySchema], default: [] },
    // Strict challenges: missing a required activity on a finished day means the run no longer
    // counts as a full completion (explained before joining). Others only track adherence.
    strict: { type: Boolean, default: false },
    // "published": built-ins, visible to everyone. User templates stay "private" (only the owner
    // sees and joins them) — there is no public publishing without moderation.
    status: { type: String, enum: ["published", "private", "archived"], required: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

ChallengeTemplateSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string" } } });
ChallengeTemplateSchema.index({ status: 1, category: 1 });
ChallengeTemplateSchema.index({ ownerId: 1, status: 1 });

module.exports = mongoose.model("ChallengeTemplate", ChallengeTemplateSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.DIFFICULTIES = DIFFICULTIES;
module.exports.ACTIVITY_KINDS = ACTIVITY_KINDS;
module.exports.ActivitySchema = ActivitySchema;
