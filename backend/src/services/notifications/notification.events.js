// Business events -> notification decisions. Controllers call these after their own work
// succeeded; everything here runs in the background.

const { notifyInBackground } = require("./notification.service");

const MILESTONES = [25, 50, 75, 100];

function goalCompleted({ userId, goal }) {
  notifyInBackground({
    userId,
    type: "GOAL_COMPLETED",
    data: { goalId: String(goal._id), goalTitle: goal.title },
    dedupeKey: `GOAL_COMPLETED:${goal._id}`,
  });
}

/** Called after a task tick; notifies the highest milestone reached, once per goal and milestone. */
function taskCompleted({ userId, goal, goalProgress }) {
  // Rounded like the UI shows it, so 99.99 (3 days × 33.33) still counts as 100.
  const overall = Math.round(goalProgress?.overall ?? 0);
  const milestone = MILESTONES.filter((m) => overall >= m).pop();
  if (!milestone) return;

  notifyInBackground({
    userId,
    type: "PROGRESS_MILESTONE",
    data: { goalId: String(goal._id), goalTitle: goal.title, milestone },
    dedupeKey: `PROGRESS_MILESTONE:${goal._id}:${milestone}`,
  });
}

module.exports = { goalCompleted, taskCompleted, MILESTONES };
