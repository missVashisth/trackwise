const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base;
let Notification;
let service;
let alice;
let bob;
let aliceId;
let bobId;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Notification = require("../src/models/notification.model");
  service = require("../src/services/notifications/notification.service");
  service.setEnqueueDelivery(async () => {});
});
after(h.teardown);

beforeEach(async () => {
  await h.resetDb();
  alice = h.createClient(base);
  bob = h.createClient(base);
  aliceId = (await h.registerUser(alice, "alice")).id;
  bobId = (await h.registerUser(bob, "bob")).id;
});

async function seed(userId, count, { channel = "IN_APP", start = Date.now() - count * 1000 } = {}) {
  const docs = Array.from({ length: count }, (_, i) => ({
    userId,
    type: "TASK_REMINDER",
    channel,
    title: `n${i}`,
    message: `message ${i}`,
    status: channel === "IN_APP" ? "delivered" : "queued",
    dedupeKey: `seed:${userId}:${channel}:${i}`,
    createdAt: new Date(start + i * 1000),
  }));
  return Notification.insertMany(docs);
}

test("lists only my in-app notifications, newest first, without internal fields", async () => {
  await seed(aliceId, 3);
  await seed(aliceId, 2, { channel: "EMAIL" });
  await seed(bobId, 4);

  const res = await alice.request("GET", "/notifications");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.notifications.map((n) => n.title), ["n2", "n1", "n0"]);
  for (const n of res.body.notifications) {
    for (const internal of ["userId", "dedupeKey", "status", "lastError", "attempts", "providerMessageId", "channel"]) {
      assert.ok(!(internal in n), `${internal} must not be exposed`);
    }
  }
});

test("pagination walks the whole history without gaps or overlap", async () => {
  await seed(aliceId, 25);
  const titles = [];
  const hasMore = [];
  for (const page of [1, 2, 3]) {
    const res = await alice.request("GET", `/notifications?page=${page}&limit=10`);
    assert.equal(res.status, 200);
    titles.push(...res.body.notifications.map((n) => n.title));
    hasMore.push(res.body.hasMore);
  }
  assert.equal(titles.length, 25);
  assert.equal(new Set(titles).size, 25);
  assert.deepEqual(hasMore, [true, true, false]);
});

test("invalid pagination parameters are rejected", async () => {
  for (const query of ["page=0", "page=-1", "limit=0", "limit=51", "page=abc", "limit=1e3", "page=1&page=2"]) {
    const res = await alice.request("GET", `/notifications?${query}`);
    assert.equal(res.status, 400, query);
  }
  // Express 5's simple query parser keeps "page[$gt]" as a literal key, so no operator reaches Mongo.
  const bracket = await alice.request("GET", "/notifications?page[$gt]=1");
  assert.equal(bracket.status, 200);
  assert.equal(bracket.body.page, 1);
});

test("unread count, mark one read, mark all read", async () => {
  const [first] = await seed(aliceId, 3);
  await seed(bobId, 2);

  assert.equal((await alice.request("GET", "/notifications/unread-count")).body.count, 3);

  const read = await alice.request("PATCH", `/notifications/${first._id}/read`);
  assert.equal(read.status, 200);
  assert.ok(read.body.notification.readAt);
  assert.equal((await alice.request("GET", "/notifications/unread-count")).body.count, 2);

  const again = await alice.request("PATCH", `/notifications/${first._id}/read`);
  assert.equal(again.body.notification.readAt, read.body.notification.readAt, "first read time is kept");

  const all = await alice.request("PATCH", "/notifications/read-all");
  assert.equal(all.body.updated, 2);
  assert.equal((await alice.request("GET", "/notifications/unread-count")).body.count, 0);
  assert.equal((await bob.request("GET", "/notifications/unread-count")).body.count, 2, "bob untouched");
});

test("another user's notification cannot be read or marked", async () => {
  const [aliceNote] = await seed(aliceId, 1);

  const res = await bob.request("PATCH", `/notifications/${aliceNote._id}/read`);
  assert.equal(res.status, 404);
  const stored = await Notification.findById(aliceNote._id).lean();
  assert.equal(stored.readAt, null);

  const list = await bob.request("GET", "/notifications");
  assert.equal(list.body.notifications.length, 0);
});

test("my own email-channel notification is not exposed through the in-app API", async () => {
  const [email] = await seed(aliceId, 1, { channel: "EMAIL" });
  assert.equal((await alice.request("PATCH", `/notifications/${email._id}/read`)).status, 404);
});

test("malformed ids are a 400, not a server error", async () => {
  for (const id of ["abc", "123", "zzzzzzzzzzzzzzzzzzzzzzzz"]) {
    assert.equal((await alice.request("PATCH", `/notifications/${id}/read`)).status, 400, id);
  }
});

test("every notification endpoint requires authentication", async () => {
  const anon = h.createClient(base);
  const [n] = await seed(aliceId, 1);
  for (const [method, path] of [
    ["GET", "/notifications"],
    ["GET", "/notifications/unread-count"],
    ["PATCH", "/notifications/read-all"],
    ["PATCH", `/notifications/${n._id}/read`],
  ]) {
    assert.equal((await anon.request(method, path)).status, 401, `${method} ${path}`);
  }
});

test("ticking a task past a milestone and completing a goal create notifications (once)", async () => {
  const today = require("../src/utils/date").getTodayDateKey();
  const goal = (await alice.request("POST", "/goals", { title: "Read", startDate: today, totalDays: 2, metric: { target: 1 } })).body.goal;
  const task = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "Read 10 pages", weightage: 1 })).body.task;

  const tick = await alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`);
  assert.equal(tick.status, 201);
  await service.flushBackgroundNotifications();

  let list = (await alice.request("GET", "/notifications")).body.notifications;
  assert.deepEqual(list.map((n) => [n.type, n.metadata.milestone]), [["PROGRESS_MILESTONE", 50]]);

  // Untick and tick again: the 50% milestone must not repeat.
  await alice.request("DELETE", `/goals/${goal._id}/tasks/${task._id}/completions/${today}`);
  await alice.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`);
  await alice.request("PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() });
  await service.flushBackgroundNotifications();

  list = (await alice.request("GET", "/notifications")).body.notifications;
  assert.deepEqual(list.map((n) => n.type).sort(), ["GOAL_COMPLETED", "PROGRESS_MILESTONE"]);
  assert.equal(await Notification.countDocuments({ type: "GOAL_COMPLETED", channel: "EMAIL" }), 1);
  assert.equal((await bob.request("GET", "/notifications")).body.notifications.length, 0);
});
