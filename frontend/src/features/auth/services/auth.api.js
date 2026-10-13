// API layer: talks to the backend, knows nothing about React or state.

import { http } from "../../../lib/http.js";
import { browserTimeZone } from "../../../lib/date.js";

// The user's "today" (daily tasks, progress, reminders) follows the device they use.

/** POST /api/auth/register — expects { username, email, password }; sends the browser's time zone */
export function registerUser({ username, email, password }) {
  return http.post("/auth/register", { username, email, password, timezone: browserTimeZone() });
}

/** POST /api/auth/login — expects { email, password }; sends the browser's time zone */
export function loginUser({ email, password }) {
  return http.post("/auth/login", { email, password, timezone: browserTimeZone() });
}

/** PATCH /api/auth/me/timezone — keep the saved zone in step with this device */
export function updateTimezone(timezone) {
  return http.patch("/auth/me/timezone", { timezone });
}

/** GET /api/auth/get-me — resolves the user from the auth cookie */
export function getMe() {
  return http.get("/auth/get-me");
}

/** POST /api/auth/logout — blacklists the token and clears the cookie */
export function logoutUser() {
  return http.post("/auth/logout");
}

/** POST /api/auth/forgot-password — always answers with the same generic message */
export function requestPasswordReset(email) {
  return http.post("/auth/forgot-password", { email });
}

/** POST /api/auth/reset-password — token comes from the emailed link */
export function resetPassword({ token, password }) {
  return http.post("/auth/reset-password", { token, password });
}
