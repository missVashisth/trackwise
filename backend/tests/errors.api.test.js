// The public error contract: every error has { success:false, code, message, requestId }, internal
// details (Mongo/JS/provider messages) never reach the client, and auth abuse is rate limited.

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const h = require("./helpers");

let base, Goal, Task, rateLimit, roadmapService, AiError, AI_MESSAGES;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Goal = require("../src/models/goal.model");
  Task = require("../src/models/task.model");
  rateLimit = require("../src/utils/rateLimit");
  roadmapService = require("../src/services/roadmap.service");
  ({ AiError, AI_MESSAGES } = require("../src/services/ai.services"));
});
after(h.teardown);
beforeEach(async () => {
  await h.resetDb();
  rateLimit.resetRateLimits();
});

/** Captures what the server writes to stderr (the structured error log) while fn runs. */
async function captureLogs(fn) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "warn";
  const write = process.stderr.write;
  let out = "";
  process.stderr.write = (chunk, ...rest) => {
    out += chunk;
    return typeof rest.at(-1) === "function" ? rest.at(-1)() || true : true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = write;
    process.env.LOG_LEVEL = previous;
  }
  return out;
}

function assertEnvelope(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, code, res.text);
  assert.equal(typeof res.body.message, "string");
  assert.match(res.body.requestId, /^[A-Za-z0-9._-]{8,64}$/);
}

test("not found, malformed IDs and other users' goals share one shape with stable codes", async () => {
  const alice = h.createClient(base);
  const bob = h.createClient(base);
  await h.registerUser(alice, "alice");
  await h.registerUser(bob, "bobby");
  const goal = (await alice.request("POST", "/goals", { title: "Run", startDate: "2026-03-01", totalDays: 10 })).body.goal;

  assertEnvelope(await alice.request("GET", "/goals/aaaaaaaaaaaaaaaaaaaaaaaa"), 404, "GOAL_NOT_FOUND");
  assertEnvelope(await alice.request("GET", "/goals/not-an-id"), 400, "INVALID_GOAL_ID");
  assertEnvelope(await alice.request("GET", "/goals/undefined/tasks"), 400, "INVALID_GOAL_ID");
  // Another user's goal is indistinguishable from a missing one.
  const foreign = await bob.request("GET", `/goals/${goal._id}`);
  assertEnvelope(foreign, 404, "GOAL_NOT_FOUND");
  // Listing another user's (or a deleted) goal's tasks is a 404 too, not an empty list.
  assertEnvelope(await bob.request("GET", `/goals/${goal._id}/tasks`), 404, "GOAL_NOT_FOUND");
  assert.equal((await alice.request("GET", `/goals/${goal._id}/tasks`)).status, 200);
  assertEnvelope(await bob.request("GET", `/insights/goals/${goal._id}`), 404, "NOT_FOUND");
  assertEnvelope(await alice.request("GET", "/habits/aaaaaaaaaaaaaaaaaaaaaaaa"), 404, "HABIT_NOT_FOUND");
  assertEnvelope(await alice.request("PATCH", "/notifications/aaaaaaaaaaaaaaaaaaaaaaaa/read"), 404, "NOTIFICATION_NOT_FOUND");
});

test("authentication failures distinguish a missing session from an expired one", async () => {
  const anon = h.createClient(base);
  assertEnvelope(await anon.request("GET", "/goals"), 401, "UNAUTHENTICATED");

  const user = await h.registerUser(h.createClient(base), "carol");
  const expired = h.createClient(base);
  expired.cookie = `token=${jwt.sign({ id: user.id, pv: 0, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET)}`;
  assertEnvelope(await expired.request("GET", "/goals"), 401, "SESSION_EXPIRED");

  const forged = h.createClient(base);
  forged.cookie = `token=${jwt.sign({ id: user.id, pv: 0 }, "not-the-secret", { expiresIn: "1h" })}`;
  const res = await forged.request("GET", "/goals");
  assertEnvelope(res, 401, "UNAUTHENTICATED");
  assert.doesNotMatch(res.text, /signature|jwt/i, "no token internals");

  assertEnvelope(await anon.request("POST", "/auth/login", { email: "carol@example.com", password: "wrong-password" }), 400, "INVALID_CREDENTIALS");
  assertEnvelope(await anon.request("POST", "/auth/login", { email: "nobody@example.com", password: "wrong-password" }), 400, "INVALID_CREDENTIALS");
});

test("validation errors keep their explanation and name the field; duplicates get their own code", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const badDays = await alice.request("POST", "/goals", { title: "Run", startDate: "2026-03-01", totalDays: 0 });
  assertEnvelope(badDays, 400, "VALIDATION_ERROR");
  assert.ok(badDays.body.message.length > 10);

  const anon = h.createClient(base);
  const shortName = await anon.request("POST", "/auth/register", { username: "ab", email: "ab@example.com", password: "secret1" });
  assertEnvelope(shortName, 400, "VALIDATION_ERROR");
  assert.equal(shortName.body.field, "username");
  const shortPassword = await anon.request("POST", "/auth/register", { username: "abcd", email: "abcd@example.com", password: "123" });
  assert.equal(shortPassword.body.field, "password");
  const missing = await anon.request("POST", "/auth/register", {});
  assertEnvelope(missing, 400, "VALIDATION_ERROR");
  assert.equal(missing.body.field, undefined, "a message about several fields names none");
  assertEnvelope(await anon.request("POST", "/auth/register", { username: "alice", email: "alice@example.com", password: "secret1" }), 400, "ACCOUNT_EXISTS");

  const created = await alice.request("POST", "/goals", { title: "Run", startDate: new Date().toISOString().slice(0, 10), totalDays: 30 });
  assert.equal(created.status, 201, created.text);
  const goal = created.body.goal;
  const task = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "Stretch", weightage: 1 })).body.task;
  assert.equal((await alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`)).status, 201);
  assertEnvelope(await alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`), 409, "TASK_ALREADY_COMPLETED");
});

test("malformed JSON, oversized bodies and unknown routes answer in JSON", async () => {
  const malformed = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  const body = await malformed.json();
  assert.equal(malformed.status, 400);
  assert.equal(body.code, "MALFORMED_JSON");

  const huge = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x".repeat(2_000_000) }) });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).code, "PAYLOAD_TOO_LARGE");

  const unknown = await fetch(`${base}/does-not-exist`);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, "NOT_FOUND");
});

test("unexpected server errors are logged with the request ID but never shown to the client", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const original = Goal.find;
  Goal.find = () => {
    throw new Error("MongoServerError: connection to cluster0.secret-host.mongodb.net:27017 closed");
  };
  let res;
  const logged = await captureLogs(async () => {
    res = await alice.request("GET", "/goals");
  });
  Goal.find = original;

  assertEnvelope(res, 500, "INTERNAL_ERROR");
  assert.equal(res.body.message, "Something went wrong on our side. Please try again in a moment.");
  assert.doesNotMatch(res.text, /Mongo|secret-host|27017/);
  const entry = logged.trim().split("\n").map((line) => JSON.parse(line)).find((e) => e.event === "http.error");
  assert.ok(entry, logged);
  assert.equal(entry.requestId, res.body.requestId, "the log line can be found from the ID the user sees");
  assert.match(entry.error, /secret-host/);
});

test("library messages in 400s (cast/validation errors) are replaced with a plain one", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const res = await alice.request("POST", "/goals", { title: "Run", startDate: "2026-03-01", totalDays: 10, lifeArea: { $gt: "" } });
  assert.ok(res.status === 400 || res.status === 201, res.text);
  if (res.status === 400) assert.doesNotMatch(res.text, /Cast to|ObjectId|validation failed/i);

  const original = Goal.find;
  Goal.find = () => {
    const err = new Error('Cast to ObjectId failed for value "x" (type string) at path "_id" for model "Goal"');
    err.name = "CastError";
    throw err;
  };
  const leaked = await alice.request("GET", "/goals");
  Goal.find = original;
  assert.ok(leaked.status >= 400);
  assert.doesNotMatch(leaked.text, /Cast to|ObjectId|model "Goal"/);
});

test("a request ID from the proxy is reused when well-formed, replaced otherwise", async () => {
  const good = await fetch(`${base}/goals`, { headers: { "X-Request-Id": "lb-1234567890" } });
  assert.equal(good.headers.get("x-request-id"), "lb-1234567890");
  assert.equal((await good.json()).requestId, "lb-1234567890");
  const bad = await fetch(`${base}/goals`, { headers: { "X-Request-Id": "<script>alert(1)</script>" } });
  assert.notEqual(bad.headers.get("x-request-id"), "<script>alert(1)</script>");
});

test("successful responses are unchanged and carry no error fields", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const res = await alice.request("GET", "/goals");
  assert.equal(res.status, 200);
  assert.equal(res.body.success, undefined);
  assert.equal(res.body.code, undefined);
});

test("failed logins per account are limited; successful logins don't count", async () => {
  await h.registerUser(h.createClient(base), "dave");
  const anon = h.createClient(base);
  for (let i = 0; i < 5; i++) {
    assert.equal((await anon.request("POST", "/auth/login", { email: "dave@example.com", password: "secret1" })).status, 200);
  }
  for (let i = 0; i < 10; i++) {
    assert.equal((await anon.request("POST", "/auth/login", { email: "dave@example.com", password: "nope-nope" })).status, 400);
  }
  const limited = await anon.request("POST", "/auth/login", { email: "dave@example.com", password: "secret1" });
  assertEnvelope(limited, 429, "RATE_LIMITED");
  const again = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "dave@example.com", password: "secret1" }) });
  assert.equal(again.status, 429);
  assert.ok(Number(again.headers.get("retry-after")) > 0, "tells the client when to retry");
  // Other accounts are unaffected.
  await h.registerUser(h.createClient(base), "erin");
  assert.equal((await anon.request("POST", "/auth/login", { email: "erin@example.com", password: "secret1" })).status, 200);
});

test("AI failures reach the client as plain, coded messages and save nothing", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const goal = { title: "Learn Spanish", startDate: "2026-03-01", totalDays: 7 };
  const cases = [
    [new AiError(AI_MESSAGES.timeout, { status: 504, code: "AI_TIMEOUT" }), 504, "AI_TIMEOUT"],
    [new AiError(AI_MESSAGES.rateLimited, { status: 503, code: "AI_RATE_LIMITED" }), 503, "AI_RATE_LIMITED"],
    [new AiError(AI_MESSAGES.unavailable, { status: 503, code: "AI_NOT_CONFIGURED", reason: "missing_api_key" }), 503, "AI_NOT_CONFIGURED"],
    [new AiError(AI_MESSAGES.refused, { status: 422, code: "AI_REFUSED" }), 422, "AI_REFUSED"],
    [new Error("TypeError: Cannot read properties of undefined (reading 'choices')"), 500, "INTERNAL_ERROR"],
  ];
  try {
    for (const [error, status, code] of cases) {
      roadmapService.setRoadmapGenerator(async () => {
        throw error;
      });
      const res = await alice.request("POST", "/roadmaps/generate", { goal });
      assertEnvelope(res, status, code);
      assert.doesNotMatch(res.text, /OPENROUTER|api key|choices|TypeError|missing_api_key/i, code);
    }
    // Malformed AI output: the validation detail stays in the log.
    roadmapService.setRoadmapGenerator(async () => ({ model: "fake", data: { summary: "", phases: [], days: [{ day: 99, tasks: [] }] } }));
    const invalid = await alice.request("POST", "/roadmaps/generate", { goal });
    assertEnvelope(invalid, 502, "AI_INVALID_OUTPUT");
    // (Checked on the message only: the random request ID may contain any digits.)
    assert.doesNotMatch(invalid.body.message, /day number|99/);
  } finally {
    roadmapService.setRoadmapGenerator(null);
  }
  assert.equal(await Goal.countDocuments(), 0, "a failed generation creates no goal");
  assert.equal(await Task.countDocuments(), 0, "a failed generation creates no tasks");
});

test("health check reports database state", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("CORS allows only the configured frontend origin, with credentials", async () => {
  const allowed = await fetch(`${base}/health`, { headers: { Origin: "http://app.test" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://app.test");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  const other = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("production configuration is checked before the server starts", () => {
  const { configProblems, authCookieOptions, allowedOrigins } = require("../src/config/runtime");
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = "production";
    process.env.MONGO_URI = "mongodb://db";
    process.env.JWT_SECRET = "short";
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGINS;
    const problems = configProblems();
    assert.ok(problems.some((p) => /JWT_SECRET/.test(p)));
    assert.ok(problems.some((p) => /FRONTEND_URL/.test(p)));
    assert.ok(problems.every((p) => !p.includes("short")), "values are never echoed");

    process.env.JWT_SECRET = "x".repeat(40);
    process.env.FRONTEND_URL = "https://goals.example.com/";
    assert.deepEqual(configProblems(), []);
    assert.deepEqual(allowedOrigins(), ["https://goals.example.com"]);
    assert.equal(authCookieOptions().secure, true);

    process.env.NODE_ENV = "development";
    process.env.COOKIE_SAMESITE = "none";
    assert.deepEqual([authCookieOptions().sameSite, authCookieOptions().secure], ["none", true], "SameSite=None always needs Secure");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
