// Deployment settings read from the environment, with development defaults.
// Values are never logged; only the names of missing/invalid settings are reported.

const DEV_ORIGIN = "http://localhost:5173";

const isProduction = () => process.env.NODE_ENV === "production";

/** Origins allowed to call the API with cookies: CORS_ORIGINS (comma-separated), else FRONTEND_URL, else the Vite dev server. */
function allowedOrigins() {
  const list = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || DEV_ORIGIN)
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  // Always a list: the cors package then echoes only a matching Origin (a single string is sent to everyone).
  return list;
}

/** Express "trust proxy": TRUST_PROXY=1 (one hop, typical PaaS) / true / false / a number. Default: off. */
function trustProxySetting() {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw || raw === "false") return false;
  if (raw === "true") return true;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : raw;
}

/**
 * Auth cookie options. COOKIE_SAMESITE=none is required when the frontend and API are on
 * different sites (e.g. app.example.com vs api.other-host.com); it forces Secure.
 */
function authCookieOptions() {
  const sameSite = ["lax", "strict", "none"].includes(process.env.COOKIE_SAMESITE) ? process.env.COOKIE_SAMESITE : "lax";
  return {
    httpOnly: true,
    sameSite,
    secure: isProduction() || sameSite === "none",
    path: "/",
  };
}

function port() {
  const value = Number(process.env.PORT);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 3000;
}

/** Names of required settings that are missing or unsafe. Empty array = OK to start. */
function configProblems() {
  const problems = [];
  if (!process.env.MONGO_URI) problems.push("MONGO_URI is not set");
  const secret = process.env.JWT_SECRET;
  if (!secret) problems.push("JWT_SECRET is not set");
  else if (isProduction() && secret.length < 32) problems.push("JWT_SECRET must be at least 32 characters in production");
  if (isProduction()) {
    if (!process.env.FRONTEND_URL && !process.env.CORS_ORIGINS) problems.push("FRONTEND_URL (or CORS_ORIGINS) must be set in production");
    const origins = [].concat(allowedOrigins());
    if (origins.some((o) => o.startsWith("http://localhost"))) problems.push("CORS origins must not point at localhost in production");
  }
  return problems;
}

/** Optional integrations: reported at startup so a missing one is noticed, but not fatal. */
function optionalWarnings() {
  const warnings = [];
  if (!process.env.OPENROUTER_API_KEY) warnings.push("OPENROUTER_API_KEY is not set: AI roadmaps are unavailable");
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) warnings.push("RESEND_API_KEY/EMAIL_FROM not set: emails (password reset, reminders) will not be sent");
  if (!process.env.REDIS_URL) warnings.push("REDIS_URL is not set: using redis://127.0.0.1:6379 for the notification queue");
  if (isProduction() && !process.env.TRUST_PROXY) {
    warnings.push("TRUST_PROXY is not set: behind a load balancer every client shares the proxy's IP, so IP rate limits would apply to all users together");
  }
  return warnings;
}

module.exports = { allowedOrigins, trustProxySetting, authCookieOptions, port, configProblems, optionalWarnings, isProduction };
