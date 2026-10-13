// Notification copy lives in code (not in MongoDB): each template turns structured
// data into the final title/message, which is then stored on the notification.

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const TEMPLATES = {
  TASK_REMINDER: ({ pendingCount }) => ({
    title: "Tasks waiting for you",
    message: `You still have ${plural(pendingCount, "task")} to complete today.`,
  }),

  GOAL_COMPLETED: ({ goalTitle }) => ({
    title: "Goal completed 🎉",
    message: `Congratulations! You completed “${goalTitle}”.`,
  }),

  PROGRESS_MILESTONE: ({ goalTitle, milestone }) => ({
    title: milestone >= 100 ? "100% progress reached 🎯" : `${milestone}% milestone reached`,
    message:
      milestone >= 100
        ? `“${goalTitle}” has reached 100% progress. Time to mark it complete?`
        : `“${goalTitle}” is now ${milestone}% complete. Keep going!`,
  }),

  // Challenge copy: encouraging and specific, never shaming. Original, unattributed lines only.
  CHALLENGE_REMINDER: ({ challengeTitle, remaining, missedYesterday }) => ({
    title: `${challengeTitle}: today's activities`,
    message:
      (missedYesterday ? "A missed day doesn't erase the effort you've already made. " : "You're building consistency one day at a time. ") +
      `${plural(remaining, "required activity")} ${remaining === 1 ? "is" : "are"} still open today — focus on the next step.`,
  }),

  CHALLENGE_WEEKLY: ({ challengeTitle, week, completeDays, requiredAdherence }) => ({
    title: `${challengeTitle}: week ${week} report`,
    message: `Your weekly report is ready: ${plural(completeDays, "complete day")} and ${requiredAdherence ?? 0}% of required activities done. Review what went well and choose one thing to improve.`,
  }),

  CHALLENGE_ENDING: ({ challengeTitle, daysLeft }) => ({
    title: `${challengeTitle}: ${plural(daysLeft, "day")} left`,
    message: `You have ${plural(daysLeft, "day")} left in your challenge. Take a look at today's activities.`,
  }),

  CHALLENGE_FINISHED: ({ challengeTitle, outcome }) => ({
    title: `${challengeTitle} is complete 🎉`,
    message: outcome || "You reached the last day of your challenge. Take a moment to look back at how far you've come.",
  }),

  PASSWORD_RESET: ({ expiresInMinutes }) => ({
    title: "Reset your password",
    message: `We received a request to reset your password. The link expires in ${expiresInMinutes} minutes.`,
  }),
};

function renderTemplate(type, data = {}) {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`No notification template for type ${type}`);
  return template(data);
}

module.exports = { renderTemplate };
