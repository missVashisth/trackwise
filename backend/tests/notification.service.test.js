const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const mongoose = require("mongoose");

let service;
let Notification;
let generator;
let enqueued;

before(async () => {
  await h.setupDb();
  service = require("../src/services/notifications/notification.service");
  Notification = require("../src/models/notification.model");
  generator = require("../src/services/notifications/messageGenerator");
});
after(h.teardown);

beforeEach(async () => {
  await h.resetDb();
  enqueued = [];
  service.setEnqueueDelivery(async (notification, delivery) => {
    enqueued.push({ id: String(notification._id), delivery });
  });
  generator.setMessageGenerator(new generator.TemplateMessageGenerator());
});

const newUserId = () => new mongoose.Types.ObjectId();
const goalCompleted = (userId, key = "GOAL_COMPLETED:g1") => ({
  userId,
  type: "GOAL_COMPLETED",
  data: { goalId: "g1", goalTitle: "Run a marathon" },
  dedupeKey: key,
});

test("creates an in-app and an email notification for the given user with rendered text", async () => {
  const userId = newUserId();
  const created = await service.notify(goalCompleted(userId));

  assert.equal(created.length, 2);
  const inApp = created.find((n) => n.channel === "IN_APP");
  const email = created.find((n) => n.channel === "EMAIL");
  for (const n of created) {
    assert.equal(String(n.userId), String(userId));
    assert.equal(n.title, "Goal completed 🎉");
    assert.equal(n.message, "Congratulations! You completed “Run a marathon”.");
  }
  assert.equal(inApp.status, "delivered");
  assert.ok(inApp.deliveredAt);
  assert.equal(inApp.readAt, null);
  assert.equal(email.status, "queued");
  assert.deepEqual(enqueued.map((e) => e.id), [String(email._id)], "only the email goes to the queue");
});

test("deduplication: the same key twice creates nothing the second time", async () => {
  const userId = newUserId();
  await service.notify(goalCompleted(userId));
  const second = await service.notify(goalCompleted(userId));

  assert.deepEqual(second, []);
  assert.equal(await Notification.countDocuments(), 2);
  assert.equal(enqueued.length, 1, "no second email job");
});

test("deduplication holds under concurrency (unique index, not just the pre-check)", async () => {
  const userId = newUserId();
  await Promise.all(Array.from({ length: 10 }, () => service.notify(goalCompleted(userId))));

  assert.equal(await Notification.countDocuments({ channel: "IN_APP" }), 1);
  assert.equal(await Notification.countDocuments({ channel: "EMAIL" }), 1);
  assert.equal(enqueued.length, 1);
});

test("a different dedupe key is a different notification", async () => {
  const userId = newUserId();
  await service.notify(goalCompleted(userId, "GOAL_COMPLETED:g1"));
  await service.notify(goalCompleted(userId, "GOAL_COMPLETED:g2"));
  assert.equal(await Notification.countDocuments(), 4);
});

test("the message generator is swappable and the stored text is final", async () => {
  const userId = newUserId();
  generator.setMessageGenerator({
    async generate({ type, data }) {
      return { title: `custom ${type}`, message: `Personal note about ${data.goalTitle}` };
    },
  });
  await service.notify(goalCompleted(userId));
  generator.setMessageGenerator(new generator.TemplateMessageGenerator());

  const stored = await Notification.findOne({ channel: "IN_APP" }).lean();
  assert.equal(stored.title, "custom GOAL_COMPLETED");
  assert.equal(stored.message, "Personal note about Run a marathon", "history keeps the generated text");
});

test("if the queue is unreachable the email stays queued and notify still succeeds", async () => {
  service.setEnqueueDelivery(async () => {
    throw new Error("Queue not reachable");
  });
  const created = await service.notify(goalCompleted(newUserId()));

  assert.equal(created.length, 2);
  const email = await Notification.findOne({ channel: "EMAIL" }).lean();
  assert.equal(email.status, "queued", "left for the stale-email sweep");
});

test("a reset email that cannot be queued is marked failed (its link only exists in memory)", async () => {
  service.setEnqueueDelivery(async () => {
    throw new Error("Queue not reachable");
  });
  await service.notify({
    userId: newUserId(),
    type: "PASSWORD_RESET",
    data: { expiresInMinutes: 30 },
    delivery: { resetUrl: "http://app.test/reset-password#token=abc" },
  });
  const email = await Notification.findOne().lean();
  assert.equal(email.status, "failed");
});

test("the reset link is passed to the queue but never stored", async () => {
  const secret = "f".repeat(64);
  await service.notify({
    userId: newUserId(),
    type: "PASSWORD_RESET",
    data: { expiresInMinutes: 30 },
    delivery: { resetUrl: `http://app.test/reset-password#token=${secret}` },
  });

  const stored = await Notification.find().lean();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].channel, "EMAIL");
  assert.ok(!JSON.stringify(stored).includes(secret), "token must not be in MongoDB");
  assert.ok(enqueued[0].delivery.resetUrl.includes(secret), "token reaches the delivery job");
});

test("notifyInBackground never throws into the caller, even on bad input", async () => {
  assert.doesNotThrow(() => service.notifyInBackground({ userId: newUserId(), type: "NOT_A_TYPE" }));
  await service.flushBackgroundNotifications();
  assert.equal(await Notification.countDocuments(), 0);
});
