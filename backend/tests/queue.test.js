const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.NOTIFICATION_MAX_ATTEMPTS = "3";
process.env.NOTIFICATION_BACKOFF_MS = "50";
process.env.EMAIL_PROVIDER_MAX_PER_SECOND = "100";
const h = require("./helpers");
const { UnrecoverableError, DelayedError } = require("bullmq");

let Notification, User, worker, emailService;

before(async () => {
  await h.setupDb();
  Notification = require("../src/models/notification.model");
  User = require("../src/models/user.model");
  worker = require("../src/queue/notification.worker");
  emailService = require("../src/services/email/email.service");
});
after(h.teardown);
beforeEach(h.resetDb);

let counter = 0;
async function emailNotification(overrides = {}) {
  counter += 1;
  const user = await User.create({ username: `u${counter}`, email: `u${counter}@example.com`, password: "x" });
  const notification = await Notification.create({
    userId: user._id,
    type: "GOAL_COMPLETED",
    channel: "EMAIL",
    title: "Goal completed 🎉",
    message: "Congratulations! You completed “Ship it”.",
    status: "queued",
    ...overrides,
  });
  return { user, notification };
}

function fakeJob(notification, { attemptsMade = 0, attempts = 3, resetUrl } = {}) {
  return {
    data: { notificationId: String(notification._id), ...(resetUrl ? { resetUrl } : {}) },
    attemptsMade,
    opts: { attempts },
    delayedTo: null,
    async moveToDelayed(timestamp) {
      this.delayedTo = timestamp;
    },
  };
}

function fakeEmail(behaviour = () => ({ id: "msg_1" })) {
  const sent = [];
  return {
    sent,
    async send(email) {
      sent.push(email);
      return behaviour(email, sent.length);
    },
  };
}

const transient = () => {
  throw new (require("../src/services/email/email.service").EmailDeliveryError)("Resend internal_server_error", { permanent: false, code: "internal_server_error" });
};
const permanent = () => {
  throw new (require("../src/services/email/email.service").EmailDeliveryError)("Resend validation_error", { permanent: true, code: "validation_error" });
};

describe("delivery processing", () => {
  test("successful delivery marks the notification sent", async () => {
    const { user, notification } = await emailNotification();
    const email = fakeEmail();
    const result = await worker.processDelivery(fakeJob(notification), "token", { emailService: email });

    assert.equal(result.outcome, "sent");
    assert.equal(email.sent.length, 1);
    assert.equal(email.sent[0].to, user.email);
    assert.equal(email.sent[0].idempotencyKey, `notification-${notification._id}`);
    assert.ok(email.sent[0].html.includes("Ship it"));
    const stored = await Notification.findById(notification._id).lean();
    assert.equal(stored.status, "sent");
    assert.equal(stored.providerMessageId, "msg_1");
    assert.ok(stored.deliveredAt);
  });

  test("a transient failure is retried (error rethrown, notification stays queued)", async () => {
    const { notification } = await emailNotification();
    await assert.rejects(
      worker.processDelivery(fakeJob(notification, { attemptsMade: 0 }), "t", { emailService: fakeEmail(transient) }),
      (err) => !(err instanceof UnrecoverableError)
    );
    const stored = await Notification.findById(notification._id).lean();
    assert.equal(stored.status, "queued");
    assert.equal(stored.attempts, 1);
    assert.match(stored.lastError, /internal_server_error/);
  });

  test("the last allowed attempt marks the notification failed", async () => {
    const { notification } = await emailNotification();
    await assert.rejects(worker.processDelivery(fakeJob(notification, { attemptsMade: 2, attempts: 3 }), "t", { emailService: fakeEmail(transient) }));
    const stored = await Notification.findById(notification._id).lean();
    assert.equal(stored.status, "failed");
    assert.ok(stored.failedAt);
  });

  test("a permanent failure is not retried", async () => {
    const { notification } = await emailNotification();
    await assert.rejects(
      worker.processDelivery(fakeJob(notification), "t", { emailService: fakeEmail(permanent) }),
      (err) => err instanceof UnrecoverableError
    );
    assert.equal((await Notification.findById(notification._id).lean()).status, "failed");
  });

  test("an already-sent notification is not sent again (duplicate / replayed job)", async () => {
    const { notification } = await emailNotification({ status: "sent" });
    const email = fakeEmail();
    const result = await worker.processDelivery(fakeJob(notification), "t", { emailService: email });
    assert.equal(result.outcome, "skipped");
    assert.equal(email.sent.length, 0);
  });

  test("over the per-user email limit the job is delayed, not sent and not failed", async () => {
    const { notification } = await emailNotification();
    const email = fakeEmail();
    const job = fakeJob(notification);
    const rateLimiter = { consume: async () => ({ allowed: false, retryAfterMs: 60000 }) };

    await assert.rejects(worker.processDelivery(job, "t", { emailService: email, rateLimiter }), (err) => err instanceof DelayedError);
    assert.equal(email.sent.length, 0);
    assert.ok(job.delayedTo > Date.now());
    assert.equal((await Notification.findById(notification._id).lean()).status, "queued");
  });

  test("password-reset emails carry the link, skip the per-user limit, and never store it", async () => {
    const resetUrl = `http://app.test/reset-password#token=${"a".repeat(64)}`;
    const { notification } = await emailNotification({ type: "PASSWORD_RESET", title: "Reset your password", message: "m", metadata: { expiresInMinutes: 30 } });
    const email = fakeEmail();
    const rateLimiter = { consume: async () => ({ allowed: false, retryAfterMs: 60000 }) };

    await worker.processDelivery(fakeJob(notification, { resetUrl }), "t", { emailService: email, rateLimiter });
    assert.ok(email.sent[0].html.includes(resetUrl));
    assert.ok(email.sent[0].text.includes(resetUrl));
    assert.ok(!JSON.stringify(await Notification.findById(notification._id).lean()).includes("a".repeat(64)));
  });

  test("a reset job without its link fails instead of sending a useless email", async () => {
    const { notification } = await emailNotification({ type: "PASSWORD_RESET" });
    const email = fakeEmail();
    const result = await worker.processDelivery(fakeJob(notification), "t", { emailService: email });
    assert.equal(result.outcome, "failed");
    assert.equal(email.sent.length, 0);
  });
});

describe("email provider", () => {
  const { createResendProvider } = require("../src/services/email/resend.provider");
  const provider = (reply) =>
    createResendProvider({
      apiKey: "re_test",
      from: "Goal Tracker <noreply@example.com>",
      client: { emails: { send: async (payload, options) => reply(payload, options) } },
    });

  test("returns the provider id and passes the idempotency key", async () => {
    let seenOptions;
    const result = await provider((payload, options) => {
      seenOptions = options;
      return { data: { id: "abc" }, error: null };
    }).send({ to: "a@b.c", subject: "s", html: "h", text: "t", idempotencyKey: "notification-1" });
    assert.deepEqual(result, { id: "abc" });
    assert.deepEqual(seenOptions, { idempotencyKey: "notification-1" });
  });

  for (const [name, statusCode, expectPermanent] of [
    ["validation_error", 422, true],
    ["invalid_api_key", 403, true],
    ["invalid_from_address", 422, true],
    ["rate_limit_exceeded", 429, false],
    ["internal_server_error", 500, false],
    ["application_error", 500, false],
  ]) {
    test(`classifies ${name} as ${expectPermanent ? "permanent" : "transient"}`, async () => {
      await assert.rejects(
        provider(() => ({ data: null, error: { name, statusCode, message: "x" } })).send({ to: "a@b.c", subject: "s" }),
        (err) => err.permanent === expectPermanent && err.code === name
      );
    });
  }

  test("network errors are transient", async () => {
    await assert.rejects(
      provider(() => {
        throw new Error("ECONNRESET");
      }).send({ to: "a@b.c", subject: "s" }),
      (err) => err.permanent === false
    );
  });

  test("without RESEND_API_KEY the email service fails permanently instead of crashing", async () => {
    emailService.resetEmailProvider();
    await assert.rejects(emailService.send({ to: "a@b.c", subject: "s", html: "", text: "" }), (err) => err.permanent && err.code === "not_configured");
  });
});

describe("queue + worker (real Redis)", async () => {
  const redisUp = await h.isRedisAvailable();
  const { getQueue, closeQueue, enqueueDelivery } = require("../src/queue/notification.queue");
  const service = require("../src/services/notifications/notification.service");
  let notificationWorker = null;
  let email;

  before(async () => {
    if (!redisUp) return;
    await getQueue().waitUntilReady();
  });
  after(async () => {
    if (!redisUp) return;
    if (notificationWorker) await notificationWorker.close();
    await getQueue().obliterate({ force: true });
    await closeQueue();
  });

  const startWorker = (behaviour) => {
    email = fakeEmail(behaviour);
    notificationWorker = worker.createNotificationWorker({ emailService: email, concurrency: 1 });
  };
  const stopWorker = async () => {
    await notificationWorker.close();
    notificationWorker = null;
  };
  const statusOf = async (id) => (await Notification.findById(id).lean()).status;

  test("notify adds exactly one delivery job per email notification", { skip: !redisUp && "Redis not available" }, async () => {
    const { user } = await emailNotification();
    const [, emailDoc] = await service.notify({ userId: user._id, type: "GOAL_COMPLETED", data: { goalId: "g", goalTitle: "G" }, dedupeKey: "GOAL_COMPLETED:job-test" });
    await enqueueDelivery(emailDoc); // a second add for the same notification

    const jobs = await getQueue().getJobs(["waiting", "delayed", "prioritized"]);
    const mine = jobs.filter((j) => j.data.notificationId === String(emailDoc._id));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, `deliver-${emailDoc._id}`);
    assert.equal(mine[0].opts.attempts, 3);
    await getQueue().obliterate({ force: true });
  });

  test("the worker delivers a queued email", { skip: !redisUp && "Redis not available" }, async () => {
    const { notification } = await emailNotification();
    startWorker();
    await enqueueDelivery(notification);
    await h.waitFor(async () => (await statusOf(notification._id)) === "sent", { timeout: 5000 });
    assert.equal(email.sent.length, 1);
    await stopWorker();
  });

  test("transient failures are retried with backoff until they succeed", { skip: !redisUp && "Redis not available" }, async () => {
    const { notification } = await emailNotification();
    startWorker((_, call) => (call < 3 ? transient() : { id: "ok" }));
    await enqueueDelivery(notification);
    await h.waitFor(async () => (await statusOf(notification._id)) === "sent", { timeout: 8000 });
    const stored = await Notification.findById(notification._id).lean();
    assert.equal(email.sent.length, 3);
    assert.equal(stored.attempts, 3);
    await stopWorker();
  });

  test("after the retry limit the job and the notification are failed", { skip: !redisUp && "Redis not available" }, async () => {
    const { notification } = await emailNotification();
    startWorker(transient);
    const job = await enqueueDelivery(notification);
    await h.waitFor(async () => (await statusOf(notification._id)) === "failed", { timeout: 8000 });
    await h.waitFor(async () => (await getQueue().getJob(job.id))?.failedReason);
    const failedJob = await getQueue().getJob(job.id);
    assert.equal(email.sent.length, 3, "exactly NOTIFICATION_MAX_ATTEMPTS sends");
    assert.equal(failedJob.attemptsMade, 3);
    assert.ok(await failedJob.isFailed(), "kept in BullMQ's failed set for inspection");
    await stopWorker();
  });
});
