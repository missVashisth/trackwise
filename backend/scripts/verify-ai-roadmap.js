// Manual check of the real AI provider (OpenRouter), run with:  npm run verify:ai
//   1. configuration present (values never printed) and the model's advertised capabilities
//   2. one tiny real request (connectivity, key, credits, model)
//   3. a real 7-day roadmap through the app's own flow: generateDraft (AI + lenient cleanup) ->
//      strict re-validation (as on confirm) -> confirmRoadmap (creates the daily tasks) ->
//      getRoadmap (today/pending/upcoming lists)
// Step 2 uses an in-memory MongoDB, never MONGO_URI: no real data is read or written.
// The API key is never printed.
require("dotenv").config({ quiet: true });
delete process.env.MONGO_URI;
process.env.LOG_LEVEL = process.env.LOG_LEVEL === "silent" ? "error" : process.env.LOG_LEVEL || "error";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { generateStructured, aiModel, isAiConfigured, modelCapabilities, outputMode } = require("../src/services/ai.services");

const report = (label, value) => console.log(`${label.padEnd(28)} ${value}`);

async function main() {
  report("OPENROUTER_API_KEY", isAiConfigured() ? "set" : "missing — add it to backend/.env");
  report("OPENROUTER_MODEL", process.env.OPENROUTER_MODEL?.trim() ? "set" : "not set (default used)");
  report("model", aiModel());
  if (!isAiConfigured()) {
    process.exitCode = 1;
    return;
  }

  try {
    const capabilities = await modelCapabilities(aiModel());
    if (!capabilities) {
      report("model on OpenRouter", "NOT FOUND — check OPENROUTER_MODEL against https://openrouter.ai/models");
      process.exitCode = 1;
      return;
    }
    report("JSON output mode", outputMode(capabilities));
  } catch (err) {
    report("model list", `FAILED: ${err.status ?? ""} ${err.message}`);
    process.exitCode = 1;
    return;
  }

  // Small request
  const started = Date.now();
  try {
    const { data } = await generateStructured({
      system: 'Reply with the json object {"ok": true}.',
      prompt: "Connectivity check.",
      schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
      schemaName: "connectivity_check",
      example: { ok: true },
      maxTokens: 50,
    });
    report("1. small request", `OK in ${Date.now() - started} ms → ${JSON.stringify(data)}`);
  } catch (err) {
    report("1. small request", `FAILED (${err.status} ${err.code}): ${err.message}`);
    process.exitCode = 1;
    return; // the provider's status and message are in the ai.request_rejected log line above
  }

  // 2. Full roadmap flow on an in-memory database
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  try {
    require("../src/app"); // registers every model
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const User = mongoose.model("users");
    const Task = mongoose.model("Task");
    const { generateDraft, confirmRoadmap, getRoadmap, validateGoalDetails, normalizeDraft } = require("../src/services/roadmap.service");
    const { getTodayDateKey } = require("../src/utils/date");

    const timeZone = "Asia/Kolkata";
    const user = await User.create({ username: "verify-ai", email: "verify-ai@example.invalid", password: "x".repeat(20), timezone: timeZone });
    const { details, error } = validateGoalDetails(
      { title: "Learn the basics of Spanish", startDate: getTodayDateKey(timeZone), totalDays: 7, dailyMinutes: 30, skillLevel: "beginner", targetOutcome: "Introduce myself and order food" },
      timeZone
    );
    if (error) throw new Error(error);

    const t0 = Date.now();
    const draft = await generateDraft({ details });
    report("2. roadmap generated", `${draft.days.length} days, ${draft.totalTasks} tasks, ${draft.phases.length} phases in ${Date.now() - t0} ms`);
    const strict = normalizeDraft(draft, details, { strict: true, assignIds: false });
    if (strict.error) throw new Error(`roadmap failed validation: ${strict.error}`);
    report("   validation", `passed (${strict.draft.totalTasks} tasks over days ${strict.draft.days[0].day}–${strict.draft.days.at(-1).day})`);

    const { goalId, created } = await confirmRoadmap({ userId: user._id, timeZone, requestId: `verify-${Date.now()}`, goalInput: details, draftInput: draft });
    const tasks = await Task.countDocuments({ goalId, kind: "roadmap" });
    const roadmap = await getRoadmap(goalId, user._id, timeZone);
    report("3. saved as tasks", `created=${created}, ${tasks} roadmap tasks (expected ${draft.totalTasks})`);
    report("4. today's list", `${roadmap.groups.today.length} today, ${roadmap.groups.upcoming.length} upcoming, ${roadmap.groups.pending.length} pending`);
    console.log("\nDay 1 tasks:");
    for (const task of roadmap.groups.today) console.log(`  - ${task.title}${task.estimatedMinutes ? ` (${task.estimatedMinutes} min)` : ""}`);
    if (tasks !== draft.totalTasks) process.exitCode = 1;
  } catch (err) {
    report("2. roadmap flow", `FAILED (${err.status ?? ""} ${err.code ?? err.name}): ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
}

main();
