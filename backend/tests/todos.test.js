// To-dos (tasks without a goal): dates, priority and ownership, as used by Upcoming.
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, Task;

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Task = require("../src/models/task.model");
});
after(h.teardown);
beforeEach(h.resetDb);

test("a to-do keeps its calendar day exactly as sent, whatever the user's time zone", async () => {
  const india = h.createClient(base);
  await india.request("POST", "/auth/register", { username: "priya", email: "priya@example.com", password: "secret1", timezone: "Asia/Kolkata" });
  const res = await india.request("POST", "/tasks", { title: "Pay rent", dueDate: "2026-10-31" });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.task.dueDate, "2026-10-31");
  const list = await india.request("GET", "/tasks");
  assert.equal(list.body.Tasks.find((t) => t.title === "Pay rent").dueDate, "2026-10-31");
});

test("priority: set on create, changed and cleared on update, validated", async () => {
  const alice = h.createClient(base);
  await h.registerUser(alice, "alice");
  const created = await alice.request("POST", "/tasks", { title: "Book flights", dueDate: "2026-11-02", priority: "high" });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.task.priority, "high");
  const id = created.body.task._id;

  assert.equal((await alice.request("PATCH", `/tasks/${id}`, { priority: "low" })).body.task.priority, "low");
  const cleared = await alice.request("PATCH", `/tasks/${id}`, { priority: null });
  assert.equal(cleared.body.task.priority, undefined);

  for (const bad of ["urgent", 3, { $ne: null }]) {
    const res = await alice.request("POST", "/tasks", { title: "x", dueDate: "2026-11-02", priority: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.body.code, "VALIDATION_ERROR");
  }
  assert.equal((await alice.request("PATCH", `/tasks/${id}`, { dueDate: "2026-02-30" })).status, 400);
  assert.equal((await alice.request("POST", "/tasks", { title: "x".repeat(201), dueDate: "2026-11-02" })).status, 400);
  assert.equal(await Task.countDocuments({ title: "x" }), 0);
});

test("to-dos belong to their owner", async () => {
  const alice = h.createClient(base);
  const bob = h.createClient(base);
  await h.registerUser(alice, "alice");
  await h.registerUser(bob, "bobby");
  const id = (await alice.request("POST", "/tasks", { title: "Secret", dueDate: "2026-11-02" })).body.task._id;
  assert.equal((await bob.request("PATCH", `/tasks/${id}`, { completed: true })).status, 404);
  assert.equal((await bob.request("DELETE", `/tasks/${id}`)).status, 404);
  assert.ok(!(await bob.request("GET", "/tasks")).body.Tasks.some((t) => t.title === "Secret"));
  assert.equal((await Task.findById(id)).completedAt, null);
});
