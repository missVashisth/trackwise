// Minimal structured logger: one JSON object per line on stdout/stderr.
// Fields whose names look sensitive are redacted before anything is written.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|reset[-_]?url|^html$|^text$/i;

function threshold() {
  return LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;
}

function sanitize(value, depth = 0) {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value === null || typeof value !== "object" || depth > 3) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(val, depth + 1);
  }
  return out;
}

function write(level, event, fields = {}) {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...sanitize(fields) });
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

module.exports = {
  debug: (event, fields) => write("debug", event, fields),
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
};
