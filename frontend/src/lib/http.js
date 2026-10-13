// Shared HTTP client. Every feature's API layer goes through this so
// base URL, credentials, timeouts and error handling live in one place.
// Every failure is thrown as an ApiError whose `message` is safe to show (see lib/errors.js).

import { ApiError } from "./errors.js";

// Set VITE_API_URL at build time. Without it, development talks to the local API and a production
// build uses the same origin ("/api"), never a localhost address that only works on one machine.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3000/api" : "/api");

// Most requests answer in well under a second; this only catches a hung connection.
const DEFAULT_TIMEOUT_MS = 30_000;

let unauthorizedHandler = null;

/** Called when a data request comes back 401 (session expired, revoked, or logged out elsewhere). */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(path, { method = "GET", body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      credentials: "include", // backend issues the auth token as a cookie
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // fetch only rejects when no HTTP answer arrived: offline, DNS, CORS, server down, or our timeout.
    throw new ApiError({ status: 0, code: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR" });
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);

  // Auth endpoints report their own 401s (e.g. the session check on load); everything else means the session is gone.
  if (response.status === 401 && !path.startsWith("/auth/")) {
    unauthorizedHandler?.(data?.code === "SESSION_EXPIRED" ? "expired" : "signed-out");
  }

  if (!response.ok) {
    const fromApi = Boolean(data && typeof data === "object" && typeof data.code === "string");
    throw new ApiError({
      status: response.status,
      code: data?.code,
      serverMessage: data?.message,
      field: data?.field,
      requestId: data?.requestId ?? response.headers.get("x-request-id"),
      fromApi,
      retryAfter: Number(response.headers.get("retry-after")) || null,
    });
  }

  return data ?? {};
}

export const http = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};
