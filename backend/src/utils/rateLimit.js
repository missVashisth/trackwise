// Small fixed-window request limiter for sensitive endpoints (forgot/reset password).
// In-memory, so limits are per API process; move the store to Redis if the API is scaled out.

const stores = new Set();

/**
 * @param {object} options
 * @param {number} options.windowMs
 * @param {number} options.max - requests allowed per key per window
 * @param {(req) => string|null} [options.key] - default: client IP; null skips limiting
 * @param {string} [options.message]
 * @param {boolean} [options.failuresOnly] - only requests answered with an error count (e.g. failed logins)
 */
function rateLimit({ windowMs, max, key = (req) => req.ip, message = "Too many requests. Please try again later.", failuresOnly = false }) {
  const hits = new Map();
  stores.add(hits);

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const k = key(req);
    if (k == null) return next();
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    if (entry.count >= max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    entry.count += 1;
    if (failuresOnly) {
      const counted = entry;
      res.on("finish", () => {
        if (res.statusCode < 400 && counted.count > 0) counted.count -= 1;
      });
    }
    next();
  };
}

/** Tests only: forget every counter. */
function resetRateLimits() {
  for (const hits of stores) hits.clear();
}

module.exports = { rateLimit, resetRateLimits };
