// OpenRouter client: the official `openai` SDK pointed at OpenRouter's OpenAI-compatible Chat
// Completions API. Used server-side only: the API key comes from the environment and never leaves
// the backend or appears in logs.
//
// Optional parameters depend on the model, so the model's advertised `supported_parameters` (from
// OpenRouter's model list) decide what is sent: a strict JSON Schema when the model supports
// structured outputs, else JSON-object mode, else prompt instructions only. The prompt always
// carries the schema and an example, and callers validate the result (roadmap.service's
// normalizeDraft does). Nothing here trusts the model's answer.

const OpenAI = require("openai");
const logger = require("../utils/logger");

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "qwen/qwen3.6-flash";
// A long roadmap is tens of thousands of output tokens in one non-streamed response.
const REQUEST_TIMEOUT_MS = 300_000;
const MODEL_LIST_TTL_MS = 60 * 60 * 1000;

// What users are told. Configuration details (missing key, no credits, unknown model) go to the
// log only: to a user they all mean "the planner is unavailable right now".
const MESSAGES = {
  timeout: "Roadmap generation is taking longer than expected. Please try again.",
  rateLimited: "The AI planner is busy right now. Please wait a little and try again.",
  unavailable: "Our AI planner is temporarily unavailable. Please try again shortly.",
  invalidOutput: "We couldn't create a usable roadmap for this request. Try making your goal more specific, or try again.",
  tooLong: "That roadmap was too long to create in one go. Try a shorter duration.",
  refused: "We couldn't generate a roadmap from that request. Try describing your goal, timeframe, and desired outcome more clearly.",
};

/**
 * code -> meaning for the client:
 *   AI_TIMEOUT, AI_RATE_LIMITED, AI_UNAVAILABLE, AI_INVALID_OUTPUT: transient, "Try again" helps.
 *   AI_OUTPUT_TOO_LONG: the plan didn't fit in one answer; a shorter duration helps, retrying won't.
 *   AI_NOT_CONFIGURED: server-side setup problem (key, credits, model); retrying won't help soon.
 *   AI_REFUSED: the request itself was declined; the user should reword it.
 *   AI_ERROR: our request was malformed (a bug).
 */
class AiError extends Error {
  constructor(message, { status = 502, code = "AI_ERROR", reason } = {}) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.code = code;
    this.reason = reason ?? code; // diagnostic only
  }
}

const notConfigured = (reason) => {
  logger.error("ai.not_configured", { reason });
  return new AiError(MESSAGES.unavailable, { status: 503, code: "AI_NOT_CONFIGURED", reason });
};

function aiModel() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

function isAiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

// Built per request: picks up the current env and keeps no state between calls.
function createClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY.trim(),
    // Overridable for a self-hosted proxy or the local end-to-end test stub.
    baseURL: process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    // Optional OpenRouter attribution; public values only.
    defaultHeaders: {
      "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
      "X-Title": "Goal Tracker",
    },
  });
}

// ---------------------------------------------------------------- model capabilities

let modelList = null; // { at, byId: Map<id, Set<parameter>> }

/** Tests only: forget the cached model list. */
function clearModelCache() {
  modelList = null;
}

/**
 * The parameters OpenRouter says `model` supports, as a Set; null when the model is not listed.
 * The list is public and cached for an hour.
 */
async function modelCapabilities(model, client = createClient()) {
  if (!modelList || Date.now() - modelList.at > MODEL_LIST_TTL_MS) {
    const page = await client.models.list();
    const byId = new Map();
    for (const entry of page.data ?? []) byId.set(entry.id, new Set(entry.supported_parameters ?? []));
    modelList = { at: Date.now(), byId };
  }
  return modelList.byId.get(model) ?? null;
}

/** How to ask this model for JSON: "json_schema" | "json_object" | "prompt". */
function outputMode(capabilities) {
  if (capabilities.has("structured_outputs") && capabilities.has("response_format")) return "json_schema";
  if (capabilities.has("response_format")) return "json_object";
  return "prompt";
}

// ---------------------------------------------------------------- errors

// Provider messages can quote part of a key ("api key: ****abcd"); strip any key fragment.
const redactKeys = (text) =>
  text.replace(/(api[ _-]?key:?\s*)\S+/gi, "$1[redacted]").replace(/sk-[A-Za-z0-9_-]{4,}/g, "sk-[redacted]");

/** Provider error details that are safe to log: no key, no key fragment, no prompt. */
function providerError(err) {
  return {
    status: err.status ?? err.code,
    type: err.type ?? err.error?.type,
    code: err.code ?? err.error?.code,
    message: typeof err.message === "string" ? redactKeys(err.message).slice(0, 500) : undefined,
    requestId: err.requestID ?? undefined,
  };
}

/** User-safe error for an OpenRouter status code (HTTP status or error.code of a 200 body). */
function errorForStatus(status, message = "") {
  switch (status) {
    case 401:
      return notConfigured("credentials_rejected");
    case 402:
      return notConfigured("no_credits");
    case 403:
      if (/moderat|flag|guardrail/i.test(message)) {
        return new AiError(MESSAGES.refused, { status: 422, code: "AI_REFUSED" });
      }
      return notConfigured("model_not_allowed");
    case 404:
      return notConfigured("model_not_found");
    case 408:
      return new AiError(MESSAGES.timeout, { status: 504, code: "AI_TIMEOUT" });
    case 429:
      return new AiError(MESSAGES.rateLimited, { status: 503, code: "AI_RATE_LIMITED" });
    default:
      if (status >= 500) {
        // 502: the model is down or answered badly; 503: no provider meets the requirements.
        return new AiError(MESSAGES.unavailable, { status: 503, code: "AI_UNAVAILABLE" });
      }
      // 400 / 422: a problem with our request.
      return new AiError(MESSAGES.unavailable, { status: 502, code: "AI_ERROR", reason: "request_rejected" });
  }
}

/** Maps an SDK error to a user-safe AiError; details go to the log only. */
function toAiError(err, model) {
  if (err instanceof AiError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    logger.error("ai.request_failed", { model, error: "timeout" });
    return new AiError(MESSAGES.timeout, { status: 504, code: "AI_TIMEOUT" });
  }
  if (err instanceof OpenAI.APIConnectionError) {
    logger.error("ai.request_failed", { model, error: redactKeys(String(err.message)) });
    return new AiError(MESSAGES.unavailable, { status: 503, code: "AI_UNAVAILABLE", reason: "connection_failed" });
  }
  if (!(err instanceof OpenAI.APIError)) throw err; // a bug, not a provider answer

  const details = providerError(err);
  logger.error("ai.request_rejected", { model, ...details });
  return errorForStatus(err.status, details.message);
}

// ---------------------------------------------------------------- request

/** System prompt plus explicit JSON instructions (needed for json_object / prompt modes, harmless otherwise). */
function withJsonInstructions(system, schema, example) {
  return [
    system,
    "Output format: reply with one valid json object and nothing else — no markdown, no code fences, no comments.",
    `It must match this JSON Schema exactly (every listed field present, no other fields):\n${JSON.stringify(schema)}`,
    example ? `Example of the expected json shape (illustrative content only):\n${JSON.stringify(example)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The JSON object in a model answer; tolerates a ```json fence (prompt mode), else null. */
function parseJsonObject(text) {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const data = JSON.parse(unfenced);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Asks the model for one JSON object shaped like `schema` (with `example` as a guide).
 * Returns { data, model, mode } where data is a parsed object; the caller validates it against
 * the application's rules. Throws AiError with a user-safe message on any failure.
 */
async function generateStructured({ system, prompt, schema, schemaName = "structured_output", example = null, maxTokens = 8000 }) {
  if (!isAiConfigured()) throw notConfigured("missing_api_key");

  const model = aiModel();
  const client = createClient();
  let completion;
  let mode;
  try {
    const capabilities = await modelCapabilities(model, client);
    if (!capabilities) {
      logger.error("ai.model_unknown", { model });
      throw notConfigured("model_not_listed");
    }
    mode = outputMode(capabilities);

    const request = {
      model,
      messages: [
        { role: "system", content: withJsonInstructions(system, schema, example) },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      stream: false,
      // Route only to providers that support every parameter sent (e.g. the JSON schema).
      provider: { require_parameters: true },
    };
    if (mode === "json_schema") {
      request.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
    } else if (mode === "json_object") {
      request.response_format = { type: "json_object" };
    }
    // Reasoning tokens count against max_tokens and a JSON plan does not need them.
    if (capabilities.has("reasoning")) request.reasoning = { enabled: false };

    completion = await client.chat.completions.create(request);
  } catch (err) {
    throw toAiError(err, model);
  }

  // OpenRouter can answer 200 with only an error object when the provider failed mid-request.
  if (completion?.error) {
    const details = { status: completion.error.code, message: redactKeys(String(completion.error.message ?? "")).slice(0, 500) };
    logger.error("ai.request_rejected", { model, ...details });
    throw errorForStatus(Number(completion.error.code), details.message);
  }

  const choice = completion?.choices?.[0];
  const finishReason = choice?.finish_reason;
  if (choice?.error || finishReason === "error") {
    logger.error("ai.request_rejected", { model, status: choice?.error?.code, message: redactKeys(String(choice?.error?.message ?? "")).slice(0, 500) });
    throw new AiError(MESSAGES.unavailable, { status: 503, code: "AI_UNAVAILABLE" });
  }
  if (finishReason === "length") {
    logger.error("ai.output_incomplete", { model, reason: finishReason, maxTokens });
    throw new AiError(MESSAGES.tooLong, { status: 502, code: "AI_OUTPUT_TOO_LONG", reason: "too_long" });
  }
  if (finishReason === "content_filter") {
    logger.warn("ai.refused", { model });
    throw new AiError(MESSAGES.refused, { status: 422, code: "AI_REFUSED" });
  }
  if (typeof choice?.message?.refusal === "string" && choice.message.refusal) {
    logger.warn("ai.refused", { model });
    throw new AiError(MESSAGES.refused, { status: 422, code: "AI_REFUSED" });
  }

  const text = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
  if (!text) {
    logger.error("ai.empty_output", { model, finishReason });
    throw new AiError(MESSAGES.invalidOutput, { status: 502, code: "AI_INVALID_OUTPUT", reason: "empty_output" });
  }

  const data = parseJsonObject(text);
  if (!data) {
    logger.error("ai.no_structured_output", { model, mode, finishReason, textLength: text.length });
    throw new AiError(MESSAGES.invalidOutput, { status: 502, code: "AI_INVALID_OUTPUT", reason: "not_json" });
  }

  return { data, model, mode };
}

module.exports = { generateStructured, isAiConfigured, aiModel, modelCapabilities, outputMode, clearModelCache, AiError, AI_MESSAGES: MESSAGES };
