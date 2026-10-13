const mongoose = require("mongoose");
const Goal = require("../models/goal.model");
const {
  validateGoalDetails,
  detailsFromGoal,
  validatePreferences,
  generateDraft,
  confirmRoadmap,
} = require("../services/roadmap.service");
const { serializeOne } = require("./goal.controller");
const { statusForError } = require("../utils/validation");

/** Errors from the roadmap/AI services carry a safe message and an HTTP status. */
function sendError(res, err) {
  const status = err.status ?? statusForError(err);
  // Unexpected errors keep their message server-side only: the error envelope logs and replaces it.
  const known = err.name === "AiError" || err.name === "RoadmapError";
  return res.status(status).json({ message: err.message, ...(known && err.code ? { code: err.code } : {}) });
}

/** Goal details for generation: a new goal's fields, or an existing goal of the user. */
async function resolveDetails(req) {
  const { goalId, goal } = req.body;
  if (goalId !== undefined) {
    if (typeof goalId !== "string" || !mongoose.Types.ObjectId.isValid(goalId)) return { status: 400, error: "Invalid goal ID" };
    const existing = await Goal.findOne({ _id: goalId, user: req.user.id });
    if (!existing) return { status: 404, error: "Goal not found" };
    if (existing.roadmap) return { status: 409, error: "This goal already has a roadmap" };
    if (existing.completedAt) return { status: 400, error: "This goal is completed; reopen it to plan a roadmap" };
    return { details: detailsFromGoal(existing) };
  }
  const { details, error } = validateGoalDetails(goal, req.user.timeZone);
  return error ? { status: 400, error } : { details };
}

/**
 * @name POST /api/roadmaps/generate
 * @description Generate (or tailor / regenerate) a roadmap draft with AI. Nothing is saved.
 * Body: { goal: { title, description, startDate, totalDays, dailyMinutes, skillLevel, targetOutcome } | goalId,
 *         preferences?, previousDraft? }
 * @access Private
 */
async function generateRoadmapController(req, res) {
  try {
    const { details, status, error } = await resolveDetails(req);
    if (error) return res.status(status).json({ message: error });

    const prefs = validatePreferences(req.body.preferences);
    if (prefs.error) return res.status(400).json({ message: prefs.error });

    const draft = await generateDraft({ details, preferences: prefs.preferences, previousDraft: req.body.previousDraft ?? null });
    return res.status(200).json({ draft });
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * @name POST /api/roadmaps/confirm
 * @description Save the confirmed draft: creates the goal (or adds the roadmap to `goalId`) and
 * one task per roadmap entry. Retrying with the same requestId returns the same goal.
 * Body: { requestId, goal | goalId, draft }
 * @access Private
 */
async function confirmRoadmapController(req, res) {
  try {
    const { requestId, goalId, goal, draft } = req.body;
    if (goalId !== undefined && (typeof goalId !== "string" || !mongoose.Types.ObjectId.isValid(goalId))) {
      return res.status(400).json({ message: "Invalid goal ID" });
    }

    const result = await confirmRoadmap({
      userId: req.user.id,
      timeZone: req.user.timeZone,
      requestId,
      goalId,
      goalInput: goal,
      draftInput: draft,
    });

    const saved = await Goal.findOne({ _id: result.goalId, user: req.user.id });
    return res.status(result.created ? 201 : 200).json({
      message: result.created ? "Roadmap saved" : "Roadmap was already saved",
      created: result.created,
      goal: await serializeOne(saved, req.user.id, req.user.timeZone),
    });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { generateRoadmapController, confirmRoadmapController };
