// Isolated backend for browser (Playwright) tests. NEVER touches a real database or AI provider:
//   - MongoDB: an in-memory server (mongodb-memory-server), wiped on every start.
//   - AI: a local fake of OpenRouter's API whose behaviour tests choose (ok, timeout, 429, ...).
//   - Email: deliveries are captured in memory (nothing is sent); tests read reset links from them.
// Test-only control routes live under /__e2e on THIS process only; the real app never mounts them.
//
//   node scripts/e2e-server.js            (port E2E_API_PORT, default 3100)

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run the e2e server with NODE_ENV=production.");
  process.exit(1);
}

const crypto = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");

const API_PORT = Number(process.env.E2E_API_PORT) || 3100;
const FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN || "http://127.0.0.1:5181";

// Everything below is set before the app is loaded, and overrides any developer .env.
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: crypto.randomBytes(32).toString("hex"),
  LOG_LEVEL: process.env.E2E_LOG_LEVEL || "warn",
  FRONTEND_URL: FRONTEND_ORIGIN,
  REDIS_URL: process.env.E2E_REDIS_URL || "redis://127.0.0.1:6390",
  BULLMQ_PREFIX: `e2e-${process.pid}`,
  OPENROUTER_API_KEY: "e2e-fake-key-not-a-secret",
  OPENROUTER_MODEL: "e2e/fake-model",
  AI_ROADMAPS_PER_HOUR: "1000",
  AUTH_REGISTRATIONS_PER_IP_PER_HOUR: "1000",
  AUTH_LOGINS_PER_IP_PER_15_MIN: "1000",
});
delete process.env.MONGO_URI;
delete process.env.CORS_ORIGINS;
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// ---------------------------------------------------------------- fake OpenRouter

const ai = { mode: "ok", times: Infinity, delayMs: 0, calls: 0 };

function draftFor(prompt) {
  const days = Number(/Plan every day from 1 to (\d+)/.exec(prompt)?.[1]) || 7;
  const title = /Goal: (.*)/.exec(prompt)?.[1]?.slice(0, 60) || "your goal";
  return {
    summary: `A ${days}-day plan for ${title}.`,
    phases: [{ title: "Foundations", description: "Build the basics", startDay: 1, endDay: days }],
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      focus: `Step ${i + 1}`,
      tasks: [
        { title: `Day ${i + 1}: study ${title}`, description: "Work through today's material.", estimatedMinutes: 30 },
        { title: `Day ${i + 1}: practice`, description: "Apply what you learned.", estimatedMinutes: 15 },
      ],
    })),
  };
}

const completion = (content, finishReason = "stop") => ({
  id: `gen-${ai.calls}`,
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "e2e/fake-model",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
});

// mode -> [status, body]
function fakeAnswer(mode, prompt) {
  const error = (status, message) => [status, { error: { code: status, message } }];
  switch (mode) {
    case "timeout": return error(408, "Request timed out upstream");
    case "rate_limit": return error(429, "Rate limit exceeded");
    case "auth": return error(401, "No auth credentials found (api key: ****fake)");
    case "credits": return error(402, "Insufficient credits");
    case "outage": return error(503, "No available provider meets the routing requirements");
    case "model_missing": return error(404, "No endpoints found for e2e/fake-model");
    case "refused": return [200, completion("", "content_filter")];
    case "malformed": return [200, completion("Sure! Here's your plan: {not json")];
    case "invalid_schema": return [200, completion(JSON.stringify({ summary: "x", phases: [], days: [{ day: 999, focus: "", tasks: [] }] }))];
    case "truncated": return [200, completion('{"summary":"cut off', "length")];
    default: return [200, completion(JSON.stringify(draftFor(prompt)))];
  }
}

const fake = express();
fake.use(express.json({ limit: "5mb" }));
fake.get("/api/v1/models", (req, res) => {
  res.json({ data: [{ id: "e2e/fake-model", supported_parameters: ["response_format", "structured_outputs", "max_tokens"] }] });
});
fake.post("/api/v1/chat/completions", async (req, res) => {
  ai.calls += 1;
  const mode = ai.times > 0 ? ai.mode : "ok";
  if (ai.times > 0 && ai.times !== Infinity) ai.times -= 1;
  if (ai.delayMs) await new Promise((r) => setTimeout(r, ai.delayMs));
  const prompt = req.body.messages?.find((m) => m.role === "user")?.content ?? "";
  const [status, body] = fakeAnswer(mode, prompt);
  res.status(status).json(body);
});

// ---------------------------------------------------------------- start

async function main() {
  const fakeServer = http.createServer(fake).listen(0, "127.0.0.1");
  await once(fakeServer, "listening");
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${fakeServer.address().port}/api/v1`;

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = require("../src/app");
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  // Capture email/queue deliveries instead of using Redis + Resend.
  const notificationService = require("../src/services/notifications/notification.service");
  const deliveries = [];
  notificationService.setEnqueueDelivery(async (notification, delivery) => {
    deliveries.push({ type: notification.type, userId: String(notification.userId), channel: notification.channel, resetUrl: delivery?.resetUrl ?? null, at: new Date().toISOString() });
  });
  const { resetRateLimits } = require("../src/utils/rateLimit");
  const User = require("../src/models/user.model");

  const control = express.Router();
  control.use(express.json());
  control.post("/ai", (req, res) => {
    const { mode = "ok", times = Infinity, delayMs = 0 } = req.body ?? {};
    Object.assign(ai, { mode, times: times ?? Infinity, delayMs });
    res.json({ ok: true });
  });
  control.get("/ai/calls", (req, res) => res.json({ calls: ai.calls }));
  control.get("/emails", (req, res) => res.json({ deliveries }));
  control.post("/rate-limits/reset", (req, res) => {
    resetRateLimits();
    res.json({ ok: true });
  });
  // A correctly signed but already-expired session for `email` (to test expiry handling).
  control.post("/expired-token", async (req, res) => {
    const user = await User.findOne({ email: req.body.email }).lean();
    if (!user) return res.status(404).json({ message: "no such user" });
    const token = jwt.sign({ id: user._id, username: user.username, pv: user.passwordVersion ?? 0, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    res.json({ token });
  });
  // Move a challenge enrollment so it started `daysAgo` days ago (to test reports with history).
  control.post("/challenges/backdate", async (req, res) => {
    const Enrollment = require("../src/models/challengeEnrollment.model");
    const enrollment = await Enrollment.findById(req.body.enrollmentId);
    if (!enrollment) return res.status(404).json({ message: "no such enrollment" });
    const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    enrollment.startDate = shift(enrollment.startDate, -req.body.daysAgo);
    enrollment.endDate = shift(enrollment.startDate, enrollment.durationDays - 1);
    await enrollment.save();
    res.json({ startDate: enrollment.startDate, endDate: enrollment.endDate });
  });
  control.post("/reset-token/expire", async (req, res) => {
    await User.updateOne({ email: req.body.email }, { $set: { passwordResetExpiresAt: new Date(Date.now() - 60_000) } });
    res.json({ ok: true });
  });

  const outer = express();
  outer.use("/__e2e", control);
  outer.use(app);
  const server = outer.listen(API_PORT, "127.0.0.1");
  await once(server, "listening");
  console.log(`e2e API on http://127.0.0.1:${API_PORT}/api (in-memory MongoDB, fake AI, captured email)`);

  const stop = async () => {
    server.closeAllConnections?.();
    server.close();
    fakeServer.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("e2e server failed to start:", err.message);
  process.exit(1);
});
