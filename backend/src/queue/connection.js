// Redis connection settings for BullMQ, from REDIS_URL (redis:// or rediss://).

function redisConnectionOptions(overrides = {}) {
  const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    ...overrides,
  };
}

const QUEUE_NAME = "notifications";
const queuePrefix = () => process.env.BULLMQ_PREFIX || "bull";

module.exports = { redisConnectionOptions, QUEUE_NAME, queuePrefix };
