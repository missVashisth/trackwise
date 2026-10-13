// Shared test setup. Every test file runs in its own process (node --test), against its own
// in-memory MongoDB — never the real database. Redis-backed tests use TEST_REDIS_URL.

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";
process.env.FRONTEND_URL = "http://app.test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL || "redis://127.0.0.1:6379";
process.env.BULLMQ_PREFIX = `test-${process.pid}`;
delete process.env.MONGO_URI;

const { once } = require("node:events");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod = null;
let server = null;

async function setupDb() {
  require("../src/app"); // registers every model
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Build indexes up front: deduplication relies on the unique index existing.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function teardown() {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function startServer() {
  const app = require("../src/app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}/api`;
}

/** fetch with a cookie jar of one cookie (the auth token). */
function createClient(base) {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = value;
    },
    async request(method, path, body) {
      const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.startsWith("token=;") ? "" : setCookie.split(";")[0];
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return { status: res.status, body: json, text };
    },
  };
}

async function registerUser(client, name, password = "secret1") {
  const res = await client.request("POST", "/auth/register", { username: name, email: `${name}@example.com`, password });
  if (res.status !== 201) throw new Error(`register ${name} failed: ${res.status} ${res.text}`);
  return res.body.user;
}

async function waitFor(check, { timeout = 3000, interval = 25 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function isRedisAvailable() {
  const IORedis = require("ioredis");
  const { redisConnectionOptions } = require("../src/queue/connection");
  const client = new IORedis(redisConnectionOptions({ lazyConnect: true, connectTimeout: 500, maxRetriesPerRequest: 0, retryStrategy: () => null }));
  client.on("error", () => {});
  try {
    await client.connect();
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

module.exports = { setupDb, resetDb, teardown, startServer, createClient, registerUser, waitFor, isRedisAvailable };
