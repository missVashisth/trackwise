// Per-user email throttle, shared by every worker through Redis (fixed window).
// This only paces delivery; whether a notification exists is decided earlier (deduplication).

function createRedisRateLimiter(getClient) {
  return {
    /** @returns {Promise<{ allowed: boolean, retryAfterMs: number }>} */
    async consume(key, max, windowMs) {
      const client = await getClient();
      const count = await client.incr(key);
      if (count === 1) await client.pexpire(key, windowMs);
      if (count <= max) return { allowed: true, retryAfterMs: 0 };
      const ttl = await client.pttl(key);
      return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
    },
  };
}

module.exports = { createRedisRateLimiter };
