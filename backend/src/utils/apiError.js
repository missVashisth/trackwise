// The public shape of an API error, and the rules that keep internal details out of it.
//
//   { success: false, code: "GOAL_NOT_FOUND", message: "...", requestId: "...", field?: "title" }
//
// Controllers keep answering with res.status(4xx/5xx).json({ message }) as before; the error
// envelope middleware passes every such body through toPublicError(), which adds a stable `code`
// (the contract the frontend relies on), the request ID, and — for 400s — the form field the
// message is about. 4xx messages are written by the controllers for end users and are kept, unless
// they look like a leaked library message. 5xx messages never reach the client.

const GENERIC_SERVER_ERROR = "Something went wrong on our side. Please try again in a moment.";
const GENERIC_BAD_INPUT = "Some of the information sent was not valid. Please check it and try again.";

// Messages that come from Mongoose/MongoDB/JS internals rather than from our own validation.
const LEAKY_MESSAGE = /Cast to|validation failed|E11000|duplicate key|ObjectId|BSON|buffering timed out|Mongo|Cannot read prop|is not a function|undefined|null|stack|at \S+ \(/i;

// 404 messages -> resource-specific codes. Anything else is NOT_FOUND.
const NOT_FOUND_CODES = [
  [/^goal not found/i, "GOAL_NOT_FOUND"],
  [/^(task|completion record) not found/i, "TASK_NOT_FOUND"],
  [/^to-do not found/i, "TODO_NOT_FOUND"],
  [/^(habit|milestone) not found/i, "HABIT_NOT_FOUND"],
  [/^challenge not found/i, "CHALLENGE_NOT_FOUND"],
  [/^notification not found/i, "NOTIFICATION_NOT_FOUND"],
  [/^nothing was logged/i, "HABIT_LOG_NOT_FOUND"],
];

// Specific 400/409 situations the frontend explains in its own words.
const CLIENT_ERROR_CODES = [
  [/^invalid goal id/i, "INVALID_GOAL_ID"],
  [/^invalid (\w+ )?id/i, "INVALID_ID"],
  [/^invalid email or password/i, "INVALID_CREDENTIALS"],
  [/reset link is invalid or has expired/i, "INVALID_RESET_TOKEN"],
  [/^account already exists/i, "ACCOUNT_EXISTS"],
  [/already completed today/i, "TASK_ALREADY_COMPLETED"],
  [/^task is already completed/i, "TASK_ALREADY_COMPLETED"],
  [/already has a roadmap/i, "ROADMAP_EXISTS"],
  [/^malformed json/i, "MALFORMED_JSON"],
  [/goal is (already )?completed/i, "GOAL_COMPLETED"],
  [/goal has already ended/i, "GOAL_ENDED"],
  [/goal has not started/i, "GOAL_NOT_STARTED"],
  [/habit is archived/i, "HABIT_ARCHIVED"],
];

// Which form field a 400 message is about, so forms can show it next to the input.
const FIELD_HINTS = [
  [/username/i, "username"],
  [/password/i, "password"],
  [/e-?mail/i, "email"],
  [/time zone/i, "timezone"],
  [/start date|startDate/i, "startDate"],
  [/deadline|end date/i, "deadline"],
  [/duration|totalDays|number of days/i, "totalDays"],
  [/daily minutes|time per day|dailyMinutes/i, "dailyMinutes"],
  [/weightage/i, "weightage"],
  [/due ?date|dueDate/i, "dueDate"],
  [/\btitle\b|give the (task|to-do|goal|habit) a/i, "title"],
  [/\bnote\b/i, "note"],
  [/target/i, "target"],
];

function match(table, message) {
  for (const [pattern, value] of table) if (pattern.test(message)) return value;
  return null;
}

/** The single form field a message is about; null when it names none or several. */
function fieldFor(message) {
  const fields = new Set(FIELD_HINTS.filter(([pattern]) => pattern.test(message)).map(([, field]) => field));
  return fields.size === 1 ? [...fields][0] : null;
}

function codeFor(status, message = "") {
  if (status === 401) {
    if (/expired/i.test(message)) return "SESSION_EXPIRED";
    return "UNAUTHENTICATED";
  }
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return match(NOT_FOUND_CODES, message) ?? "NOT_FOUND";
  if (status === 409) return match(CLIENT_ERROR_CODES, message) ?? "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return match(CLIENT_ERROR_CODES, message) ?? "VALIDATION_ERROR";
}

function isLeaky(message) {
  return typeof message !== "string" || !message.trim() || message.length > 300 || LEAKY_MESSAGE.test(message);
}

/**
 * The client-safe version of an error body. `body` is what the controller passed to res.json.
 * Returns { body, internalMessage } — internalMessage is set when something was withheld (to log).
 */
function toPublicError(status, body, requestId) {
  const original = body && typeof body === "object" ? body : { message: String(body ?? "") };
  const { message, code, ...rest } = original;
  // AI errors carry their own user-safe message and stable code, even as 5xx.
  const trustedCode = typeof code === "string" && /^[A-Z][A-Z0-9_]{2,40}$/.test(code) ? code : null;

  let publicMessage = message;
  let internalMessage = null;
  if (status >= 500 && !(trustedCode && trustedCode.startsWith("AI_"))) {
    publicMessage = GENERIC_SERVER_ERROR;
    internalMessage = message ?? null;
  } else if (isLeaky(message)) {
    publicMessage = status >= 500 ? GENERIC_SERVER_ERROR : GENERIC_BAD_INPUT;
    internalMessage = message ?? null;
  }

  const finalCode = trustedCode ?? codeFor(status, publicMessage);
  const field = status === 400 && finalCode === "VALIDATION_ERROR" ? fieldFor(publicMessage) : null;

  return {
    body: {
      ...rest,
      success: false,
      code: finalCode,
      message: publicMessage,
      ...(field ? { field } : {}),
      requestId,
    },
    internalMessage,
  };
}

module.exports = { toPublicError, codeFor, fieldFor, GENERIC_SERVER_ERROR, GENERIC_BAD_INPUT };
