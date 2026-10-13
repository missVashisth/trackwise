const { getOverview, getGoalReport, getHabitReport } = require("../services/insights/insights.service");
const { getChallengeInsights } = require("../services/insights/challengeInsights");

function respond(res, result) {
  if (result.error) return res.status(400).json({ message: result.error });
  if (result.notFound) return res.status(404).json({ message: "Not found" });
  return res.status(200).json(result.report);
}

function fail(res, err) {
  console.error(err);
  return res.status(500).json({ message: "Couldn't build insights. Please try again." });
}

/**
 * @name GET /api/insights/overview?period=week|month|custom&date=YYYY-MM-DD&from=&to=
 * @description Insights across all of the user's goals, tasks and habits for a period.
 * @access Private
 */
async function overview(req, res) {
  try {
    return respond(res, await getOverview(req.user.id, req.user.timeZone, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

/**
 * @name GET /api/insights/goals/:goalId?period=...
 * @description Insights for one of the user's goals.
 * @access Private
 */
async function goal(req, res) {
  try {
    return respond(res, await getGoalReport(req.user.id, req.user.timeZone, req.params.goalId, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

/**
 * @name GET /api/insights/habits/:habitId?period=...
 * @description Insights for one of the user's habits.
 * @access Private
 */
async function habit(req, res) {
  try {
    return respond(res, await getHabitReport(req.user.id, req.user.timeZone, req.params.habitId, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

/**
 * @name GET /api/insights/challenges?period=...
 * @description The user's challenge attempts in a period: required-activity adherence, daily and
 * weekly results, comparison with the previous period. Separate from goal and habit metrics.
 * @access Private
 */
async function challenges(req, res) {
  try {
    return respond(res, await getChallengeInsights(req.user.id, req.user.timeZone, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = { challenges, overview, goal, habit };
