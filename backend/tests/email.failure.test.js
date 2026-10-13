const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SECRET = "re_test_SECRET_must_not_leak_123";
process.env.RESEND_API_KEY = SECRET;
process.env.EMAIL_FROM = "Goal Tracker <noreply@example.com>";
const h = require("./helpers");

let base, service, worker, Notification, captured, output;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  service = require("../src/services/notifications/notification.service");
  worker = require("../src/queue/notification.worker");
  Notification = require("../src/models/notification.model");
});
after(h.teardown);

beforeEach(async () => {
  await h.resetDb();
  captured = [];
  service.setEnqueueDelivery(async (n, d) => captured.push({ n, d }));
});

// Record everything written to stdout/stderr while `fn` runs.
async function captureOutput(fn) {
  const chunks = [];
  const previousLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "debug"; // capture everything the app logs
  const original = { out: process.stdout.write, err: process.stderr.write };
  process.stdout.write = (chunk, ...rest) => (chunks.push(String(chunk)), original.out.call(process.stdout, "", ...rest));
  process.stderr.write = (chunk, ...rest) => (chunks.push(String(chunk)), original.err.call(process.stderr, "", ...rest));
  try {
    await fn();
  } finally {
    process.stdout.write = original.out;
    process.stderr.write = original.err;
    process.env.LOG_LEVEL = previousLevel;
  }
  return chunks.join("");
}

async function aliceWithGoal() {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const today = require("../src/utils/date").getTodayDateKey();
  const goal = (await alice.request("POST", "/goals", { title: "Ship", startDate: today, totalDays: 2, metric: { target: 1 } })).body.goal;
  const task = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "Work", weightage: 1 })).body.task;
  return { alice, goal, task, today };
}

test("goal and task operations succeed while email delivery fails", async () => {
  const { alice, goal, task } = await aliceWithGoal();

  const tick = await alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`);
  const complete = await alice.request("PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() });
  assert.equal(tick.status, 201);
  assert.equal(complete.status, 200);
  await service.flushBackgroundNotifications();

  // The worker then hits a provider that is down for every attempt.
  const emailJob = captured.find(({ n }) => n.channel === "EMAIL");
  const failing = { send: async () => { throw Object.assign(new Error("provider down"), { permanent: false }); } };
  for (let attemptsMade = 0; attemptsMade < 3; attemptsMade++) {
    await assert.rejects(
      worker.processDelivery({ data: { notificationId: String(emailJob.n._id) }, attemptsMade, opts: { attempts: 3 } }, "t", { emailService: failing })
    );
  }

  assert.equal((await Notification.findById(emailJob.n._id).lean()).status, "failed");
  const stored = (await alice.request("GET", `/goals/${goal._id}`)).body.goal;
  assert.ok(stored.completedAt, "goal stays completed");
  assert.equal(stored.progress.overall, 50, "progress unaffected");
  const inApp = (await alice.request("GET", "/notifications")).body.notifications.map((n) => n.type).sort();
  assert.deepEqual(inApp, ["GOAL_COMPLETED", "PROGRESS_MILESTONE"], "in-app notifications still arrive");
});

test("the API answers without waiting for slow notification work", async () => {
  const { alice, goal } = await aliceWithGoal();
  service.setEnqueueDelivery(() => new Promise((resolve) => setTimeout(resolve, 1500)));

  const started = Date.now();
  const res = await alice.request("PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() });
  const elapsed = Date.now() - started;
  assert.equal(res.status, 200);
  assert.ok(elapsed < 500, `request took ${elapsed}ms`);
  await service.flushBackgroundNotifications();
});

test("a queue outage does not fail the business operation", async () => {
  const { alice, goal } = await aliceWithGoal();
  service.setEnqueueDelivery(async () => {
    throw new Error("Queue not reachable");
  });
  const res = await alice.request("PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() });
  await service.flushBackgroundNotifications();
  assert.equal(res.status, 200);
  assert.equal((await Notification.findOne({ channel: "EMAIL" }).lean()).status, "queued", "waiting for the stale sweep");
});

test("provider credentials never appear in API responses or logs", async () => {
  const { alice, goal } = await aliceWithGoal();
  const { createResendProvider } = require("../src/services/email/resend.provider");
  const emailService = require("../src/services/email/email.service");
  // Real Resend adapter with a fake HTTP client that rejects the key, like the real API would.
  emailService.setEmailProvider(
    createResendProvider({
      apiKey: SECRET,
      from: process.env.EMAIL_FROM,
      client: { emails: { send: async () => ({ data: null, error: { name: "invalid_api_key", statusCode: 403, message: "API key is invalid" } }) } },
    })
  );

  const logs = await captureOutput(async () => {
    await alice.request("PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() });
    await service.flushBackgroundNotifications();
    const emailJob = captured.find(({ n }) => n.channel === "EMAIL");
    await assert.rejects(worker.processDelivery({ data: { notificationId: String(emailJob.n._id) }, attemptsMade: 0, opts: { attempts: 3 } }, "t", {}));
  });

  const responses = [
    await alice.request("GET", "/notifications"),
    await alice.request("GET", "/auth/get-me"),
    await alice.request("GET", "/goals"),
  ].map((r) => r.text);

  assert.ok(logs.includes("delivery.failed"), "the failure itself is logged");
  assert.ok(!logs.includes(SECRET), "API key not in logs");
  for (const body of responses) assert.ok(!body.includes(SECRET), "API key not in responses");
  assert.equal((await Notification.findOne({ channel: "EMAIL" }).lean()).status, "failed");
});

test("the frontend has no access to email-provider configuration", () => {
  const frontendSrc = path.join(__dirname, "../../frontend/src");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
    }
  };
  walk(frontendSrc);
  const offenders = files.filter((file) => /RESEND|resend|EMAIL_FROM|re_[A-Za-z0-9]{8,}/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("the logger redacts secrets even if a caller passes them", async () => {
  const logger = require("../src/utils/logger");
  const logs = await captureOutput(async () => {
    logger.error("test.event", { password: "p@ss", resetUrl: "http://x/#token=abc", apiKey: SECRET, nested: { token: "t" }, goalId: "g1" });
  });
  assert.ok(logs.includes('"goalId":"g1"'));
  for (const secret of ["p@ss", "token=abc", SECRET, '"t"']) assert.ok(!logs.includes(secret), secret);
});
