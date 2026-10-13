// One place that decides what a user is told when a request fails.
//
// The API answers errors as { success:false, code, message, requestId, field? } (see the backend's
// utils/apiError.js). Messages are chosen here from the stable `code` (and the HTTP status). The
// server's own `message` is shown only for client errors (4xx) that went through the API's
// sanitizing error envelope (recognisable by its `code`): those are written for end users and
// explain what to correct ("Duration must be between 1 and 120 days"). Anything else — 5xx bodies,
// proxy pages, network failures — gets a friendly message from this file, never raw text.

export const UNKNOWN_ERROR = "We couldn't complete that action. Please try again. If the problem continues, contact support.";
const SERVER_ERROR = "Something went wrong on our side. Please try again in a moment.";

const MESSAGES = {
  NETWORK_ERROR: "We couldn't connect to the server. Check your internet connection and try again.",
  TIMEOUT: "The server is taking too long to respond. Please try again.",
  INTERNAL_ERROR: SERVER_ERROR,
  SERVER_ERROR,
  SERVICE_UNAVAILABLE: SERVER_ERROR,

  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  UNAUTHENTICATED: "Please sign in to continue.",
  INVALID_CREDENTIALS: "The email or password is incorrect.",
  FORBIDDEN: "You don't have access to this.",

  GOAL_NOT_FOUND: "We couldn't find this goal. It may have been deleted. Refresh your goals and try again.",
  INVALID_GOAL_ID: "We couldn't open this goal. Please return to your goals and select it again.",
  TASK_NOT_FOUND: "We couldn't find this task. It may have been deleted. Refresh and try again.",
  TODO_NOT_FOUND: "We couldn't find this to-do. It may have been deleted. Refresh and try again.",
  HABIT_NOT_FOUND: "We couldn't find this habit. It may have been deleted. Return to your habits and try again.",
  HABIT_LOG_NOT_FOUND: "There is nothing logged for that day.",
  NOTIFICATION_NOT_FOUND: "That notification is no longer available.",
  CHALLENGE_NOT_FOUND: "We couldn't find this challenge. It may have been removed, or the link is wrong.",
  NOT_FOUND: "We couldn't find what you were looking for. It may have been deleted.",
  INVALID_ID: "We couldn't open that item. Please go back and select it again.",

  TASK_ALREADY_COMPLETED: "This task is already marked as completed.",
  MALFORMED_JSON: UNKNOWN_ERROR,
  PAYLOAD_TOO_LARGE: "That is too much to save at once. Please shorten it and try again.",
  RATE_LIMITED: "You're doing that too often. Please wait a little and try again.",

  AI_TIMEOUT: "Roadmap generation is taking longer than expected. Please try again.",
  AI_RATE_LIMITED: "The AI planner is busy right now. Please wait a little and try again.",
  AI_UNAVAILABLE: "Our AI planner is temporarily unavailable. Please try again shortly.",
  AI_ERROR: "Our AI planner is temporarily unavailable. Please try again shortly.",
  AI_NOT_CONFIGURED: "Our AI planner is unavailable right now. Please try again later.",
  AI_INVALID_OUTPUT: "We couldn't create a usable roadmap for this request. Try making your goal more specific, or try again.",
  AI_OUTPUT_TOO_LONG: "That roadmap was too long to create in one go. Try a shorter duration.",
  AI_REFUSED: "We couldn't generate a roadmap from that request. Try describing your goal, timeframe, and desired outcome more clearly.",
};

// Codes whose server message is the more useful explanation (validation, specific conflicts, limits).
const SERVER_EXPLAINS = new Set([
  "VALIDATION_ERROR",
  "ACCOUNT_EXISTS",
  "INVALID_RESET_TOKEN",
  "GOAL_COMPLETED",
  "GOAL_ENDED",
  "GOAL_NOT_STARTED",
  "HABIT_ARCHIVED",
  "ROADMAP_EXISTS",
  "CONFLICT",
  "RATE_LIMITED",
  "ALREADY_JOINED",
  "CHALLENGE_LEFT",
  "CHALLENGE_NOT_ACTIVE",
  "STRICT_RULE_NOT_ACKNOWLEDGED",
  "RULE_LOCKED",
]);

// Failures where trying the same thing again (maybe after a moment) can succeed.
const RETRYABLE = new Set([
  "NETWORK_ERROR",
  "TIMEOUT",
  "INTERNAL_ERROR",
  "SERVER_ERROR",
  "SERVICE_UNAVAILABLE",
  "RATE_LIMITED",
  "AI_TIMEOUT",
  "AI_RATE_LIMITED",
  "AI_UNAVAILABLE",
  "AI_ERROR",
  "AI_INVALID_OUTPUT",
]);

/** Fallback code for a response without one (e.g. an HTML error page from a proxy). */
function codeForStatus(status) {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,40}$/;

/** What to tell the user for this failure. */
export function friendlyMessage({ status, code, serverMessage, fromApi }) {
  if (code === "TASK_ALREADY_COMPLETED" && /today/i.test(serverMessage ?? "")) {
    return "This task is already marked as completed for today.";
  }
  const explainable = fromApi && status >= 400 && status < 500 && typeof serverMessage === "string" && serverMessage.trim();
  if (explainable && SERVER_EXPLAINS.has(code)) return serverMessage;
  if (MESSAGES[code]) return MESSAGES[code];
  if (explainable && status === 400) return serverMessage;
  return status >= 500 ? SERVER_ERROR : UNKNOWN_ERROR;
}

/**
 * A failed request. `message` is always safe to show. The rest is for code:
 *   status, code (stable, e.g. "GOAL_NOT_FOUND"), field (form field a validation error is about),
 *   retryable (offer "Try again"), requestId (quote to support).
 */
export class ApiError extends Error {
  constructor({ status = 0, code, serverMessage, field = null, requestId = null, fromApi = false, retryAfter = null }) {
    const finalCode = typeof code === "string" && SAFE_CODE.test(code) ? code : codeForStatus(status);
    super(friendlyMessage({ status, code: finalCode, serverMessage, fromApi }));
    this.name = "ApiError";
    this.status = status;
    this.code = finalCode;
    this.field = typeof field === "string" ? field : null;
    this.requestId = typeof requestId === "string" ? requestId : null;
    this.retryable = RETRYABLE.has(finalCode);
    this.retryAfter = retryAfter;
  }

  get isNotFound() {
    return this.status === 404 || this.code === "INVALID_GOAL_ID" || this.code === "INVALID_ID";
  }
}

/** An error the app raises itself, with a message written for the user. */
export class UserMessageError extends Error {
  constructor(message, { cause, retryable = false } = {}) {
    super(message, { cause });
    this.name = "UserMessageError";
    this.retryable = retryable;
  }
}

/** Safe text for any thrown value: ApiError/UserMessageError messages; a fallback for anything else (bugs). */
export function errorMessage(err, fallback = UNKNOWN_ERROR) {
  if (err instanceof ApiError || err instanceof UserMessageError) return err.message;
  if (err) console.error(err); // a bug, not a user problem: keep the detail in the console only
  return fallback;
}

/** Field-level errors for a form: { [field]: message } when the API named a field, else {}. */
export function fieldErrors(err, fields) {
  if (err instanceof ApiError && err.field && (!fields || fields.includes(err.field))) {
    return { [err.field]: err.message };
  }
  return {};
}
