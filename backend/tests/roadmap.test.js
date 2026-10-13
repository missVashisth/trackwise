// AI roadmaps: draft generation (AI replaced by a fake), confirmation, today/pending lists,
// one-time completion and roadmap progress. The clock is mocked to move between days.
const { test, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let base, alice, bob, Goal, Task, DailyProgress, roadmapService, generatorCalls;

const setTime = (iso) => mock.timers.setTime(new Date(iso).getTime());
// 06:00 in Kolkata (alice's default zone) on the given day.
const setDay = (day) => setTime(`${day}T00:30:00Z`);

function fakeGenerator(call) {
  generatorCalls.push(call);
  const { details } = call;
  return {
    model: "fake-model",
    data: {
      summary: `Plan for ${details.title}`,
      phases: [{ title: "Foundations", description: "Basics", startDay: 1, endDay: details.totalDays }],
      days: Array.from({ length: details.totalDays }, (_, i) => ({
        day: i + 1,
        focus: `Focus ${i + 1}`,
        tasks: [
          { title: `Day ${i + 1} read`, description: "Read a chapter", estimatedMinutes: 30 },
          { title: `Day ${i + 1} practice`, description: "Do exercises", estimatedMinutes: 20 },
        ],
      })),
    },
  };
}

const GOAL = { title: "Learn Spanish", description: "Reach A1", startDate: "2026-03-01", totalDays: 3, dailyMinutes: 60, skillLevel: "beginner", targetOutcome: "Hold a short conversation" };

const generate = (client, body) => client.request("POST", "/roadmaps/generate", body);
const confirm = (client, body) => client.request("POST", "/roadmaps/confirm", body);
const roadmapOf = async (client, goalId) => (await client.request("GET", `/goals/${goalId}/roadmap`)).body;
const titles = (list) => list.map((t) => t.title);

async function createRoadmapGoal(client = alice, goal = GOAL, requestId = "req-0000-0001") {
  const { draft } = (await generate(client, { goal })).body;
  const res = await confirm(client, { requestId, goal, draft });
  assert.equal(res.status, 201, res.text);
  return { goal: res.body.goal, draft };
}

before(async () => {
  await h.setupDb();
  base = await h.startServer();
  Goal = require("../src/models/goal.model");
  Task = require("../src/models/task.model");
  DailyProgress = require("../src/models/dailyProgress.model");
  roadmapService = require("../src/services/roadmap.service");
  roadmapService.setRoadmapGenerator(async (call) => fakeGenerator(call));
  require("../src/services/notifications/notification.service").setEnqueueDelivery(async () => {});
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-03-01T00:30:00Z").getTime() });
});
after(async () => {
  mock.timers.reset();
  await h.teardown();
});

beforeEach(async () => {
  await h.resetDb();
  require("../src/utils/rateLimit").resetRateLimits();
  generatorCalls = [];
  setDay("2026-03-01");
  alice = h.createClient(base);
  bob = h.createClient(base);
  await h.registerUser(alice, "alice");
  await h.registerUser(bob, "bobby");
});

// 1, 3, 5
test("generating a roadmap returns a validated draft and saves nothing", async () => {
  const res = await generate(alice, { goal: GOAL });
  assert.equal(res.status, 200, res.text);
  const { draft } = res.body;
  assert.deepEqual(draft.days.map((d) => [d.day, d.date]), [[1, "2026-03-01"], [2, "2026-03-02"], [3, "2026-03-03"]]);
  assert.equal(draft.totalTasks, 6);
  assert.equal(new Set(draft.days.flatMap((d) => d.tasks.map((t) => t.itemId))).size, 6, "every entry has its own id");
  assert.equal(draft.tailored, false);
  assert.equal(draft.preferences, null);
  assert.equal(draft.goal.endDate, "2026-03-03");
  assert.equal(generatorCalls[0].details.dailyMinutes, 60);

  assert.equal(await Goal.countDocuments(), 0, "no goal before confirmation");
  assert.equal(await Task.countDocuments(), 0, "no tasks before confirmation");
});

// 2
test("tailoring passes the preferences and the previous draft to the generator", async () => {
  const first = (await generate(alice, { goal: GOAL })).body.draft;
  const res = await generate(alice, {
    goal: GOAL,
    preferences: { dailyMinutes: 30, knownTopics: "greetings", difficultTopics: "verbs", learningStyle: "flashcards" },
    previousDraft: first,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.draft.tailored, true);
  const call = generatorCalls.at(-1);
  assert.equal(call.preferences.difficultTopics, "verbs");
  assert.equal(call.preferences.dailyMinutes, 30);
  assert.equal(call.previousDraft.days.length, 3);
  assert.equal(await Goal.countDocuments(), 0);
});

// 4
test("confirming persists the goal, its roadmap and one scheduled task per entry", async () => {
  const { goal, draft } = await createRoadmapGoal();
  assert.equal(goal.title, "Learn Spanish");
  assert.equal(goal.totalDays, 3);
  assert.equal(goal.deadline.slice(0, 10), "2026-03-03");
  assert.equal(goal.dailyMinutes, 60);
  assert.equal(goal.roadmap.status, "active");
  assert.equal(goal.roadmap.phases[0].title, "Foundations");
  assert.equal(goal.progress.basis, "roadmap");

  const tasks = await Task.find({ goalId: goal._id }).sort({ scheduledDate: 1, roadmapOrder: 1 }).lean();
  assert.equal(tasks.length, 6);
  assert.deepEqual(tasks.map((t) => [t.scheduledDate, t.originalScheduledDate, t.roadmapDay, t.roadmapOrder]).slice(0, 2), [
    ["2026-03-01", "2026-03-01", 1, 0],
    ["2026-03-01", "2026-03-01", 1, 1],
  ]);
  assert.ok(tasks.every((t) => t.kind === "roadmap" && String(t.userId) === String(goal.user) && t.completedAt === null && t.weightage === undefined));
  assert.deepEqual(tasks.map((t) => t.roadmapItemId).sort(), draft.days.flatMap((d) => d.tasks.map((t) => t.itemId)).sort());
});

// 6
test("repeated and concurrent confirmations never create a second goal or duplicate tasks", async () => {
  const { draft } = (await generate(alice, { goal: GOAL })).body;
  const body = { requestId: "req-dup-0001", goal: GOAL, draft };

  const [a, b] = await Promise.all([confirm(alice, body), confirm(alice, body)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  const again = await confirm(alice, body);
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  assert.equal(await Goal.countDocuments(), 1);
  assert.equal(await Task.countDocuments(), 6);

  const changed = structuredClone(draft);
  changed.days[0].tasks[0].title = "Something else";
  assert.equal((await confirm(alice, { ...body, draft: changed })).status, 409, "same requestId, different roadmap");

  // An existing goal gets at most one roadmap.
  const plain = (await alice.request("POST", "/goals", { title: "Plain", startDate: "2026-03-01", totalDays: 3 })).body.goal;
  const forPlain = (await generate(alice, { goalId: plain._id })).body.draft;
  assert.equal((await confirm(alice, { requestId: "req-plain-01", goalId: plain._id, draft: forPlain })).status, 201);
  assert.equal((await confirm(alice, { requestId: "req-plain-02", goalId: plain._id, draft: forPlain })).status, 409);
  assert.equal((await generate(alice, { goalId: plain._id })).status, 409);
  assert.equal(await Task.countDocuments({ goalId: plain._id }), 6);
});

// 7, 8, 9, 10
test("today's and pending lists follow the user's date; completion moves a task once and keeps its schedule", async () => {
  const { goal } = await createRoadmapGoal();

  let rm = await roadmapOf(alice, goal._id);
  assert.equal(rm.today, "2026-03-01");
  assert.deepEqual(titles(rm.groups.today), ["Day 1 read", "Day 1 practice"]);
  assert.deepEqual(rm.groups.pending, []);
  assert.equal(rm.groups.upcoming.length, 4);

  // Day 1: finish one task, leave the other open.
  const day1Read = rm.groups.today[0];
  assert.equal((await alice.request("POST", `/goals/${goal._id}/tasks/${day1Read._id}/complete`)).status, 201);

  setDay("2026-03-03"); // day 3: nothing ran in between
  rm = await roadmapOf(alice, goal._id);
  assert.deepEqual(titles(rm.groups.today), ["Day 3 read", "Day 3 practice"]);
  assert.deepEqual(titles(rm.groups.pending), ["Day 1 practice", "Day 2 read", "Day 2 practice"]);
  assert.deepEqual(titles(rm.groups.completed), ["Day 1 read"], "a completed task stays completed on later days");
  assert.equal(rm.tasks.length, 6, "no copies were created when the date changed");

  // Complete an overdue task from the pending list.
  const overdue = rm.groups.pending[0];
  const res = await alice.request("POST", `/goals/${goal._id}/tasks/${overdue._id}/complete`);
  assert.equal(res.status, 201);
  assert.equal(res.body.task.roadmapStatus, "completed");
  assert.equal(res.body.task.scheduledDate, "2026-03-01", "original schedule kept");
  assert.equal(res.body.task.originalScheduledDate, "2026-03-01");
  assert.equal(new Date(res.body.task.completedAt).toISOString(), "2026-03-03T00:30:00.000Z", "actual completion time");

  rm = await roadmapOf(alice, goal._id);
  assert.deepEqual(titles(rm.groups.pending), ["Day 2 read", "Day 2 practice"]);
  assert.ok(!titles(rm.groups.today).includes("Day 1 practice"), "not duplicated into today");
  assert.equal(rm.tasks.length, 6);

  // The shared task list carries the same state.
  const listed = (await alice.request("GET", "/tasks")).body.Tasks;
  const byTitle = Object.fromEntries(listed.map((t) => [t.title, t]));
  assert.equal(byTitle["Day 1 practice"].roadmapStatus, "completed");
  assert.equal(byTitle["Day 1 practice"].completedToday, true);
  assert.equal(byTitle["Day 2 read"].roadmapStatus, "pending");
  assert.equal(byTitle["Day 3 read"].roadmapStatus, "today");
});

// 11, 8
test("progress = completed / total; a new day changes nothing; overdue completion counts normally", async () => {
  const { goal } = await createRoadmapGoal();
  assert.equal(goal.progress.overall, 0);
  const rm = await roadmapOf(alice, goal._id);
  const [t1, t2] = rm.groups.today;

  const first = await alice.request("POST", `/goals/${goal._id}/tasks/${t1._id}/complete`);
  assert.deepEqual([first.body.goalProgress.overall, first.body.goalProgress.today], [16.67, 16.67]);

  setDay("2026-03-02");
  let g = (await alice.request("GET", `/goals/${goal._id}`)).body.goal;
  assert.deepEqual([g.progress.overall, g.progress.today], [16.67, 0], "a new day neither adds nor removes progress");

  const overdue = await alice.request("POST", `/goals/${goal._id}/tasks/${t2._id}/complete`);
  assert.deepEqual([overdue.body.goalProgress.overall, overdue.body.goalProgress.today], [33.33, 16.67]);
  assert.deepEqual(overdue.body.goalProgress.roadmap, { total: 6, completed: 2, completedToday: 1 });
  assert.deepEqual(overdue.body.goalProgress.history, [16.67, 33.33]);

  setDay("2026-03-05"); // past the deadline, tasks still open: earned progress is unchanged
  g = (await alice.request("GET", `/goals/${goal._id}`)).body.goal;
  assert.equal(g.progress.overall, 33.33);

  // Reopening is explicit and lowers progress again.
  const reopened = await alice.request("POST", `/goals/${goal._id}/tasks/${t2._id}/reopen`);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.task.roadmapStatus, "pending");
  assert.equal(reopened.body.goalProgress.overall, 16.67);
  assert.equal((await alice.request("POST", `/goals/${goal._id}/tasks/${t2._id}/reopen`)).status, 409);

  // Roadmap goals write no daily-progress records; zero-task goals stay at 0 without dividing by zero.
  assert.equal(await DailyProgress.countDocuments({ goalId: goal._id, totalWeight: { $gt: 0 } }), 0);
  const empty = (await alice.request("POST", "/goals", { title: "Empty", startDate: "2026-03-05", totalDays: 2 })).body.goal;
  assert.equal(empty.progress.overall, 0);
});

// 12
test("duplicate completion requests count the task once", async () => {
  const { goal } = await createRoadmapGoal();
  const task = (await roadmapOf(alice, goal._id)).groups.today[0];
  const path = `/goals/${goal._id}/tasks/${task._id}/complete`;
  const results = await Promise.all([alice.request("POST", path), alice.request("POST", path), alice.request("POST", path)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
  assert.equal(results.find((r) => r.status === 409).body.message, "Task is already completed");
  const g = (await alice.request("GET", `/goals/${goal._id}`)).body.goal;
  assert.equal(g.progress.roadmap.completed, 1);
  assert.equal(g.progress.overall, 16.67);
});

// 13
test("other users and invalid payloads are rejected", async () => {
  const { goal, draft } = await createRoadmapGoal();
  const task = (await roadmapOf(alice, goal._id)).groups.today[0];

  assert.equal((await bob.request("GET", `/goals/${goal._id}/roadmap`)).status, 404);
  assert.equal((await bob.request("POST", `/goals/${goal._id}/tasks/${task._id}/complete`)).status, 404);
  assert.equal((await bob.request("POST", `/goals/${goal._id}/tasks/${task._id}/reopen`)).status, 404);
  assert.equal((await bob.request("PATCH", `/goals/${goal._id}/tasks/${task._id}`, { title: "hacked" })).status, 404);
  assert.equal((await bob.request("DELETE", `/goals/${goal._id}/tasks/${task._id}`)).status, 404);
  assert.equal((await generate(bob, { goalId: goal._id })).status, 404);
  assert.equal((await confirm(bob, { requestId: "req-bob-0001", goalId: goal._id, draft })).status, 404);
  assert.equal((await bob.request("POST", `/goals/${goal._id}/tasks`, { kind: "roadmap", title: "x", day: 1 })).status, 404);
  assert.equal((await h.createClient(base).request("POST", "/roadmaps/generate", { goal: GOAL })).status, 401);

  // Goal details
  for (const bad of [{ ...GOAL, totalDays: 0 }, { ...GOAL, totalDays: 500 }, { ...GOAL, startDate: "2026-02-30" }, { ...GOAL, title: "" }, { ...GOAL, dailyMinutes: 2 }, { ...GOAL, skillLevel: "guru" }]) {
    assert.equal((await generate(alice, { goal: bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await generate(alice, { goal: GOAL, preferences: "lots" })).status, 400);
  assert.equal((await generate(alice, { goalId: "nope" })).status, 400);

  // Drafts sent back for confirmation are re-validated.
  const outOfRange = structuredClone(draft);
  outOfRange.days[0].day = 9;
  const noTitle = structuredClone(draft);
  noTitle.days[1].tasks[0].title = "  ";
  const dupIds = structuredClone(draft);
  dupIds.days[1].tasks[0].itemId = dupIds.days[0].tasks[0].itemId;
  for (const [i, bad] of [outOfRange, noTitle, dupIds, { days: [] }, null].entries()) {
    assert.equal((await confirm(alice, { requestId: `req-bad-000${i}`, goal: GOAL, draft: bad })).status, 400);
  }
  assert.equal((await confirm(alice, { requestId: "x", goal: GOAL, draft })).status, 400, "malformed requestId");
  assert.equal(await Goal.countDocuments({ user: goal.user }), 1, "nothing saved by rejected requests");

  // Unusable AI output is a 502, not a saved roadmap.
  roadmapService.setRoadmapGenerator(async () => ({ model: "fake", data: { summary: "", phases: [], days: [{ day: 99, tasks: [] }] } }));
  const broken = await generate(alice, { goal: GOAL });
  assert.equal(broken.status, 502);
  roadmapService.setRoadmapGenerator(async (call) => fakeGenerator(call));

  // Without an API key the AI client reports "not configured" instead of calling out.
  const { generateStructured } = require("../src/services/ai.services");
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(generateStructured({ system: "", prompt: "", toolName: "t", toolDescription: "", schema: {} }), { status: 503, code: "AI_NOT_CONFIGURED" });
  if (saved) process.env.OPENROUTER_API_KEY = saved;

  // Manual scheduling must stay inside the goal's dates.
  assert.equal((await alice.request("POST", `/goals/${goal._id}/tasks`, { kind: "roadmap", title: "Late", scheduledDate: "2026-03-09" })).status, 400);
  assert.equal((await alice.request("POST", `/goals/${goal._id}/tasks`, { kind: "roadmap", title: "Bad", day: 0 })).status, 400);
  const manual = await alice.request("POST", `/goals/${goal._id}/tasks`, { kind: "roadmap", title: "Extra review", day: 2, estimatedMinutes: 15 });
  assert.equal(manual.status, 201, manual.text);
  assert.deepEqual([manual.body.task.scheduledDate, manual.body.task.roadmapDay, manual.body.task.source, manual.body.task.roadmapStatus], ["2026-03-02", 2, "manual", "upcoming"]);
  assert.equal(manual.body.goalProgress.roadmap.total, 7);
});

// 14
test("today is the user's own local date, across midnight and a DST change", async () => {
  setTime("2026-03-07T12:00:00Z"); // sign in on the test's own dates (sessions last 7 days)
  assert.equal((await alice.request("POST", "/auth/login", { email: "alice@example.com", password: "secret1" })).status, 200);
  const ny = h.createClient(base);
  const res = await ny.request("POST", "/auth/register", { username: "nyc", email: "nyc@example.com", password: "secret1", timezone: "America/New_York" });
  assert.equal(res.status, 201);

  const goal = { ...GOAL, startDate: "2026-03-07", totalDays: 3 };
  const nyGoal = (await createRoadmapGoal(ny, goal, "req-ny-00001")).goal;
  const inGoal = (await createRoadmapGoal(alice, goal, "req-in-00001")).goal;

  // 2026-03-08T04:59Z: 23:59 on Mar 7 in New York, 10:29 on Mar 8 in Kolkata.
  setTime("2026-03-08T04:59:00Z");
  let nyRm = await roadmapOf(ny, nyGoal._id);
  let inRm = await roadmapOf(alice, inGoal._id);
  assert.equal(nyRm.today, "2026-03-07");
  assert.deepEqual(titles(nyRm.groups.today), ["Day 1 read", "Day 1 practice"]);
  assert.equal(inRm.today, "2026-03-08");
  assert.deepEqual(titles(inRm.groups.today), ["Day 2 read", "Day 2 practice"]);
  assert.deepEqual(titles(inRm.groups.pending), ["Day 1 read", "Day 1 practice"]);

  // One minute later it is midnight in New York (the night clocks spring forward).
  setTime("2026-03-08T05:00:00Z");
  nyRm = await roadmapOf(ny, nyGoal._id);
  assert.equal(nyRm.today, "2026-03-08");
  assert.deepEqual(titles(nyRm.groups.pending), ["Day 1 read", "Day 1 practice"]);

  // Completed at 00:30 EST on the 23-hour DST day: "today" until 00:00 EDT the next day.
  setTime("2026-03-08T05:30:00Z");
  await ny.request("POST", `/goals/${nyGoal._id}/tasks/${nyRm.groups.today[0]._id}/complete`);
  setTime("2026-03-09T03:59:00Z"); // 23:59 EDT on Mar 8
  assert.equal((await ny.request("GET", `/goals/${nyGoal._id}`)).body.goal.progress.today, 16.67);
  setTime("2026-03-09T04:00:00Z"); // 00:00 EDT on Mar 9
  const next = (await ny.request("GET", `/goals/${nyGoal._id}`)).body.goal.progress;
  assert.deepEqual([next.today, next.overall], [0, 16.67]);
});

// 15
test("daily recurring tasks, daily progress and reminders keep working next to roadmap tasks", async () => {
  const { goal } = await createRoadmapGoal();
  const daily = (await alice.request("POST", `/goals/${goal._id}/tasks`, { title: "Flashcards", weightage: 1 })).body.task;
  assert.equal(daily.kind, undefined, "goal tasks stay daily by default");

  const tick = await alice.request("POST", `/goals/${goal._id}/tasks/${daily._id}/complete`);
  assert.equal(tick.status, 201, tick.text);
  // The day's record counts only the daily task: 1 of 1 done (roadmap tasks have no weightage).
  const record = await DailyProgress.findOne({ goalId: goal._id, dateKey: "2026-03-01" }).lean();
  assert.deepEqual([record.totalWeight, record.completedWeight, record.completionRatio], [1, 1, 1]);
  assert.equal((await alice.request("POST", `/goals/${goal._id}/tasks/${daily._id}/complete`)).status, 409);

  setDay("2026-03-02");
  const listed = Object.fromEntries((await alice.request("GET", "/tasks")).body.Tasks.map((t) => [t.title, t]));
  assert.equal(listed.Flashcards.completedToday, false, "daily task resets on a new day");
  assert.equal(listed["Day 1 read"].roadmapStatus, "pending", "roadmap task does not reset; it is overdue");

  // Reminder count for Mar 2: Flashcards (not ticked today) + 4 open roadmap tasks due by then.
  const { pendingCountsForUsers } = require("../src/queue/reminder.scan");
  const counts = await pendingCountsForUsers([goal.user], "2026-03-02");
  assert.equal(counts.get(String(goal.user)), 5);

  // The goal dashboard history still works for this goal.
  const insights = (await alice.request("GET", `/goals/${goal._id}/insights`)).body.insights;
  assert.equal(insights.roadmap.total, 6);
  assert.equal(insights.roadmap.pending, 2);
  assert.deepEqual(insights.tasks.map((t) => t.title), ["Flashcards"]);
});
