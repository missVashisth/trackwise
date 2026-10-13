// The OpenRouter client (OpenAI SDK -> OpenRouter Chat Completions) and roadmap validation of its
// answers. fetch is mocked underneath the real SDK, so request building, error classes and retries
// are the SDK's own — but nothing reaches the network.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.LOG_LEVEL = "silent";
const { generateStructured, AiError, clearModelCache } = require("../src/services/ai.services");
const { DRAFT_SCHEMA, generateDraft, RoadmapError } = require("../src/services/roadmap.service");

const FAKE_KEY = "sk-or-v1-test-not-a-real-key-123456";
const DEFAULT_MODEL = "qwen/qwen3.6-flash";
const realFetch = global.fetch;
let calls;
let replies;
let models;

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req_test_1", "x-should-retry": "false", ...headers },
  });

/** A Chat Completions reply with the given message content and finish reason. */
const completion = (content, finishReason = "stop", message = {}) =>
  json(200, {
    id: "gen-1",
    object: "chat.completion",
    model: DEFAULT_MODEL,
    choices: [{ index: 0, message: { role: "assistant", content, ...message }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });

const FULL = ["max_tokens", "reasoning", "response_format", "structured_outputs", "temperature"];

beforeEach(() => {
  calls = [];
  replies = [];
  models = [
    { id: DEFAULT_MODEL, supported_parameters: FULL },
    { id: "vendor/json-only", supported_parameters: ["max_tokens", "response_format"] },
    { id: "vendor/plain", supported_parameters: ["max_tokens", "temperature"] },
  ];
  clearModelCache();
  process.env.OPENROUTER_API_KEY = FAKE_KEY;
  delete process.env.OPENROUTER_MODEL;
  global.fetch = async (url, init) => {
    const call = { url: String(url), init, body: init?.body ? JSON.parse(init.body) : null };
    calls.push(call);
    if (call.url.endsWith("/models")) return json(200, { data: models });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
});
afterEach(() => {
  global.fetch = realFetch;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  process.env.LOG_LEVEL = "silent";
});

const SCHEMA = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } };
const EXAMPLE = { a: "example" };
const ARGS = { system: "sys", prompt: "plan it", schema: SCHEMA, schemaName: "goal_roadmap", example: EXAMPLE, maxTokens: 5000 };
const header = (init, name) => new Headers(init.headers).get(name);
const chatCalls = () => calls.filter((c) => c.url.endsWith("/chat/completions"));

/** Captures what the logger writes to stderr while fn runs. */
async function captureStderr(fn) {
  const original = process.stderr.write;
  let out = "";
  process.stderr.write = (chunk) => {
    out += chunk;
    return true;
  };
  process.env.LOG_LEVEL = "warn";
  try {
    await fn();
  } finally {
    process.stderr.write = original;
    process.env.LOG_LEVEL = "silent";
  }
  return out;
}

test("calls OpenRouter Chat Completions with a strict JSON schema for qwen/qwen3.6-flash", async () => {
  replies.push(completion('{"a":"ok"}'));
  const { data, model, mode } = await generateStructured(ARGS);
  assert.deepEqual(data, { a: "ok" });
  assert.equal(model, DEFAULT_MODEL);
  assert.equal(mode, "json_schema");

  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/models", "capabilities checked first");
  const { url, body, init } = chatCalls()[0];
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(header(init, "authorization"), `Bearer ${FAKE_KEY}`);
  assert.equal(header(init, "x-title"), "Goal Tracker");
  assert.ok(header(init, "http-referer"), "attribution header, no secret");
  assert.equal(body.model, DEFAULT_MODEL);
  assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "goal_roadmap", strict: true, schema: SCHEMA } });
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.equal(body.max_tokens, 5000);
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages.map((m) => m.role), ["system", "user"]);
  const system = body.messages[0].content;
  assert.match(system, /^sys/);
  assert.ok(system.includes(JSON.stringify(SCHEMA)) && system.includes(JSON.stringify(EXAMPLE)));
  assert.equal(body.messages[1].content, "plan it");
});

test("optional parameters follow the configured model's advertised support", async () => {
  process.env.OPENROUTER_MODEL = "vendor/json-only";
  replies.push(completion('{"a":"ok"}'));
  assert.equal((await generateStructured(ARGS)).mode, "json_object");
  let body = chatCalls().at(-1).body;
  assert.equal(body.model, "vendor/json-only");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.reasoning, undefined, "no reasoning parameter for a model without it");

  process.env.OPENROUTER_MODEL = "vendor/plain";
  replies.push(completion('```json\n{"a":"fenced"}\n```'));
  const plain = await generateStructured(ARGS);
  assert.deepEqual([plain.mode, plain.data.a], ["prompt", "fenced"]);
  body = chatCalls().at(-1).body;
  assert.equal(body.response_format, undefined);
  assert.equal(body.reasoning, undefined);

  assert.equal(calls.filter((c) => c.url.endsWith("/models")).length, 1, "model list is fetched once and cached");
});

test("missing key, blank model and unknown models are handled before any generation", async () => {
  process.env.OPENROUTER_MODEL = "   ";
  replies.push(completion("{}"));
  assert.equal((await generateStructured(ARGS)).model, DEFAULT_MODEL, "blank model falls back to the default");

  process.env.OPENROUTER_MODEL = "vendor/does-not-exist";
  await assert.rejects(generateStructured(ARGS), { status: 503, code: "AI_NOT_CONFIGURED", reason: "model_not_listed", message: /temporarily unavailable/ });
  assert.equal(chatCalls().length, 1, "no completion request for an unknown model");

  process.env.OPENROUTER_API_KEY = " ";
  const before = calls.length;
  const missingKey = await generateStructured(ARGS).catch((e) => e);
  assert.deepEqual([missingKey.status, missingKey.code, missingKey.reason], [503, "AI_NOT_CONFIGURED", "missing_api_key"]);
  assert.doesNotMatch(missingKey.message, /OPENROUTER|API_KEY|key/i, "setup details are not shown to users");
  assert.equal(calls.length, before, "no request at all without a key");
});

test("insufficient credits (402) is a setup error; logs carry no key, key fragment or prompt", async () => {
  replies.push(json(402, { error: { code: 402, message: `Insufficient credits. Key ${FAKE_KEY} api key: ****${FAKE_KEY.slice(-4)}` } }));
  let error;
  const logged = await captureStderr(async () => {
    error = await generateStructured(ARGS).catch((e) => e);
  });
  assert.ok(error instanceof AiError);
  assert.deepEqual([error.status, error.code], [503, "AI_NOT_CONFIGURED"]);
  assert.equal(error.reason, "no_credits");
  assert.doesNotMatch(error.message, /credit|key|account/i, "billing/setup details are not shown to users");
  assert.ok(!error.message.includes("Insufficient credits. Key"), "raw provider text is not shown to users");

  const entries = logged.trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(entries.some((e) => e.event === "ai.not_configured" && e.reason === "no_credits"), "the reason is in the log");
  const entry = entries.find((e) => e.event === "ai.request_rejected");
  assert.equal(entry.event, "ai.request_rejected");
  assert.equal(entry.status, 402);
  assert.match(entry.message, /Insufficient credits/);
  assert.equal(entry.requestId, "req_test_1");
  assert.ok(!logged.includes(FAKE_KEY) && !logged.includes(FAKE_KEY.slice(-4)), "no key or key fragment in the log");
  assert.ok(!logged.includes("plan it"), "the prompt is never logged");
});

test("credential, moderation, timeout, rate-limit, upstream and request errors map to safe errors", async () => {
  const cases = [
    [401, "No auth credentials found", { status: 503, code: "AI_NOT_CONFIGURED", reason: "credentials_rejected" }],
    [403, "Input was flagged by moderation", { status: 422, code: "AI_REFUSED", message: /describing your goal/ }],
    [403, "Key not allowed for this model", { status: 503, code: "AI_NOT_CONFIGURED", reason: "model_not_allowed" }],
    [404, "No endpoints found", { status: 503, code: "AI_NOT_CONFIGURED", reason: "model_not_found" }],
    [408, "Request timed out", { status: 504, code: "AI_TIMEOUT", message: /longer than expected/ }],
    [429, "Rate limit exceeded", { status: 503, code: "AI_RATE_LIMITED", message: /busy/ }],
    [502, "Provider returned error", { status: 503, code: "AI_UNAVAILABLE" }],
    [503, "No available provider meets the routing requirements", { status: 503, code: "AI_UNAVAILABLE" }],
  ];
  for (const [status, message, expected] of cases) {
    replies.push(json(status, { error: { code: status, message } }));
    const error = await generateStructured(ARGS).catch((e) => e);
    assert.ok(error instanceof AiError, `HTTP ${status}`);
    for (const [key, value] of Object.entries(expected)) {
      if (value instanceof RegExp) assert.match(error[key], value, `HTTP ${status} ${key}`);
      else assert.equal(error[key], value, `HTTP ${status} ${key}`);
    }
    assert.ok(!error.message.includes(message), `HTTP ${status}: provider text is not shown to users`);
    assert.doesNotMatch(error.message, /credential|model|key|credit/i, `HTTP ${status}: no setup details for users`);
  }

  replies.push(json(400, { error: { code: 400, message: "Invalid schema for response_format" } }));
  const logged = await captureStderr(async () => {
    await assert.rejects(generateStructured(ARGS), { status: 502, code: "AI_ERROR", message: /temporarily unavailable/ });
  });
  assert.match(logged, /Invalid schema/, "the provider's reason is in the log only");
});

test("errors inside a 200 response are not mistaken for a roadmap", async () => {
  replies.push(json(200, { error: { code: 402, message: "Insufficient credits" } }));
  await assert.rejects(generateStructured(ARGS), { status: 503, code: "AI_NOT_CONFIGURED", reason: "no_credits" });

  replies.push(json(200, { id: "gen-2", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: '{"a":"partial' }, finish_reason: "error", error: { code: 502, message: "provider died" } }] }));
  await assert.rejects(generateStructured(ARGS), { status: 503, code: "AI_UNAVAILABLE" });
});

test("timeouts are reported as such (after the SDK's single retry)", async () => {
  replies.push(new Error("Request timed out"), new Error("Request timed out"));
  await assert.rejects(generateStructured(ARGS), { status: 504, code: "AI_TIMEOUT", message: /longer than expected/ });
  assert.equal(chatCalls().length, 2, "one retry, then give up");
});

test("empty, malformed, truncated, filtered and refused answers are rejected", async () => {
  replies.push(completion(""));
  await assert.rejects(generateStructured(ARGS), { code: "AI_INVALID_OUTPUT", reason: "empty_output", message: /usable roadmap/ });
  replies.push(completion(null));
  await assert.rejects(generateStructured(ARGS), { code: "AI_INVALID_OUTPUT", reason: "empty_output" });
  replies.push(completion("Here is your plan: {"));
  await assert.rejects(generateStructured(ARGS), { code: "AI_INVALID_OUTPUT", reason: "not_json", message: /usable roadmap/ });
  replies.push(completion("[1,2,3]"));
  await assert.rejects(generateStructured(ARGS), { code: "AI_INVALID_OUTPUT" });
  replies.push(completion('{"a":"cut', "length"));
  await assert.rejects(generateStructured(ARGS), { code: "AI_OUTPUT_TOO_LONG", reason: "too_long", message: /shorter duration/ });
  replies.push(completion("", "content_filter"));
  await assert.rejects(generateStructured(ARGS), { code: "AI_REFUSED", status: 422 });
  replies.push(completion(null, "stop", { refusal: "I can't help with that." }));
  await assert.rejects(generateStructured(ARGS), { code: "AI_REFUSED", status: 422 });
});

// ---- Through the real roadmap service: OpenRouter answer -> application validation

const DETAILS = { title: "Learn Spanish", description: "", startDate: "2026-10-12", totalDays: 2, endDate: "2026-10-13", dailyMinutes: 30, skillLevel: null, targetOutcome: "" };
const day = (n) => ({ day: n, focus: `Focus ${n}`, tasks: [{ title: `Task ${n}`, description: "Do it", estimatedMinutes: 20 }] });

test("a valid roadmap passes the application's validation; the roadmap schema is sent", async () => {
  replies.push(completion(JSON.stringify({ summary: "Plan", phases: [{ title: "All", description: "", startDay: 1, endDay: 2 }], days: [day(1), day(2)] })));
  const draft = await generateDraft({ details: DETAILS });
  assert.deepEqual(draft.days.map((d) => [d.day, d.date, d.tasks.length]), [[1, "2026-10-12", 1], [2, "2026-10-13", 1]]);
  assert.equal(draft.totalTasks, 2);
  assert.equal(draft.model, DEFAULT_MODEL);
  assert.ok(draft.days.every((d) => d.tasks.every((t) => t.itemId)), "entries get ids for saving");
  const { body } = chatCalls()[0];
  assert.equal(body.response_format.json_schema.name, "goal_roadmap");
  assert.deepEqual(body.response_format.json_schema.schema, DRAFT_SCHEMA);
});

test("schema-invalid output is rejected with a clear error and nothing usable", async () => {
  replies.push(completion(JSON.stringify({ summary: "x", phases: [], days: "not a list" })));
  await assert.rejects(generateDraft({ details: DETAILS }), (err) =>
    err instanceof RoadmapError && err.status === 502 && err.code === "AI_INVALID_OUTPUT" && /usable roadmap/.test(err.message) && !/not a list|day number|has no days/i.test(err.message));

  replies.push(completion(JSON.stringify({ summary: "x", phases: [], days: [{ day: 9, tasks: [{ title: "out of range" }] }, { day: 1, tasks: [{ title: "" }] }] })));
  await assert.rejects(generateDraft({ details: DETAILS }), { status: 502 });
});

test("the roadmap schema meets strict structured-output rules", () => {
  const UNSUPPORTED = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems"];
  let objects = 0;
  (function walk(node, path) {
    if (!node || typeof node !== "object") return;
    for (const key of UNSUPPORTED) assert.equal(node[key], undefined, `${path}.${key} is not used`);
    if (node.type === "object") {
      objects += 1;
      assert.equal(node.additionalProperties, false, `${path} must set additionalProperties: false`);
      assert.deepEqual([...(node.required ?? [])].sort(), Object.keys(node.properties).sort(), `${path}: every property required`);
      for (const [name, child] of Object.entries(node.properties)) walk(child, `${path}.${name}`);
    }
    if (node.type === "array") walk(node.items, `${path}[]`);
  })(DRAFT_SCHEMA, "schema");
  assert.equal(objects, 4);
});
