import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, UserMessageError, errorMessage, fieldErrors, friendlyMessage, UNKNOWN_ERROR } from "./errors.js";

const quiet = (fn) => {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
};

test("known codes get the product's own wording, whatever the server said", () => {
  const cases = [
    [404, "GOAL_NOT_FOUND", "Goal not found", "We couldn't find this goal. It may have been deleted. Refresh your goals and try again."],
    [400, "INVALID_GOAL_ID", "Invalid goal ID", "We couldn't open this goal. Please return to your goals and select it again."],
    [401, "SESSION_EXPIRED", "Session expired, please log in again", "Your session has expired. Please sign in again."],
    [400, "INVALID_CREDENTIALS", "Invalid email or password.", "The email or password is incorrect."],
    [504, "AI_TIMEOUT", "x", "Roadmap generation is taking longer than expected. Please try again."],
    [503, "AI_RATE_LIMITED", "x", "The AI planner is busy right now. Please wait a little and try again."],
    [503, "AI_NOT_CONFIGURED", "OPENROUTER_API_KEY is missing", "Our AI planner is unavailable right now. Please try again later."],
    [500, "INTERNAL_ERROR", "MongoServerError: boom", "Something went wrong on our side. Please try again in a moment."],
  ];
  for (const [status, code, serverMessage, expected] of cases) {
    assert.equal(new ApiError({ status, code, serverMessage, fromApi: true }).message, expected, code);
  }
});

test("validation messages from the API are shown (they explain what to fix); others are not", () => {
  const validation = new ApiError({ status: 400, code: "VALIDATION_ERROR", serverMessage: "Duration must be between 1 and 120 days", field: "totalDays", fromApi: true });
  assert.equal(validation.message, "Duration must be between 1 and 120 days");
  assert.deepEqual(fieldErrors(validation, ["title", "totalDays"]), { totalDays: "Duration must be between 1 and 120 days" });
  assert.deepEqual(fieldErrors(validation, ["title"]), {}, "a field the form doesn't have is not mapped");

  // A 400 that did not come through the API's sanitizing envelope (no code) is never echoed.
  const raw = new ApiError({ status: 400, serverMessage: 'Cast to ObjectId failed for value "x"', fromApi: false });
  assert.equal(raw.message, UNKNOWN_ERROR);
  // 5xx text is never echoed, envelope or not.
  assert.equal(new ApiError({ status: 500, serverMessage: "TypeError: x is undefined", fromApi: true, code: "INTERNAL_ERROR" }).message, "Something went wrong on our side. Please try again in a moment.");
});

test("responses without a code are classified by status (e.g. an HTML 502 from a proxy)", () => {
  assert.equal(new ApiError({ status: 502 }).code, "SERVER_ERROR");
  assert.equal(new ApiError({ status: 502 }).message, "Something went wrong on our side. Please try again in a moment.");
  assert.equal(new ApiError({ status: 0, code: "NETWORK_ERROR" }).message, "We couldn't connect to the server. Check your internet connection and try again.");
  assert.equal(new ApiError({ status: 0, code: "TIMEOUT" }).message, "The server is taking too long to respond. Please try again.");
  assert.equal(new ApiError({ status: 404 }).isNotFound, true);
  assert.equal(new ApiError({ status: 400, code: "INVALID_ID" }).isNotFound, true);
  assert.equal(new ApiError({ status: 418, code: "<script>" }).code, "UNKNOWN", "codes must look like codes");
});

test("retry is offered only where repeating can help", () => {
  const retryable = (code, status = 503) => new ApiError({ status, code, fromApi: true }).retryable;
  assert.equal(retryable("AI_TIMEOUT"), true);
  assert.equal(retryable("AI_UNAVAILABLE"), true);
  assert.equal(retryable("NETWORK_ERROR", 0), true);
  assert.equal(retryable("AI_NOT_CONFIGURED"), false);
  assert.equal(retryable("AI_REFUSED", 422), false);
  assert.equal(retryable("AI_OUTPUT_TOO_LONG", 502), false);
  assert.equal(retryable("VALIDATION_ERROR", 400), false);
});

test("a duplicate completion mentions 'today' only when it is about today", () => {
  assert.equal(friendlyMessage({ status: 409, code: "TASK_ALREADY_COMPLETED", serverMessage: "Task is already completed today", fromApi: true }), "This task is already marked as completed for today.");
  assert.equal(friendlyMessage({ status: 409, code: "TASK_ALREADY_COMPLETED", serverMessage: "Task is already completed", fromApi: true }), "This task is already marked as completed.");
});

test("errorMessage never exposes a bug's own message", () => {
  assert.equal(quiet(() => errorMessage(new TypeError("Cannot read properties of undefined (reading 'goalId')"))), UNKNOWN_ERROR);
  assert.equal(quiet(() => errorMessage("goalId is not available")), UNKNOWN_ERROR);
  assert.equal(errorMessage(new UserMessageError("The goal was saved, but some of its tasks were not.")), "The goal was saved, but some of its tasks were not.");
  assert.equal(errorMessage(new ApiError({ status: 404, code: "GOAL_NOT_FOUND", fromApi: true })), "We couldn't find this goal. It may have been deleted. Refresh your goals and try again.");
});
