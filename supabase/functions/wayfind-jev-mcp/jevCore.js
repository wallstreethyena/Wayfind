// Wayfind Jev core: pure, dependency-free helpers shared by the Supabase Edge
// Function and the hermetic Node regression guard.
//
// Contract:
// - bounded judgement only; Jev is not a source of factual truth
// - one TypeSafe request per tool call; no retries (a retry can double spend)
// - no silent fallback or fabricated answer when TypeSafe is unavailable
// - fixed upstream host; callers cannot turn this into an SSRF primitive

export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_JEV_MODEL = "jev-latest";
export const MAX_STATE_CHARS = 12000;
export const MAX_INSTRUCTION_CHARS = 1200;
export const MAX_CHECKS = 8;
export const MAX_LABELS = 12;
export const MAX_LEVELS = 10;
export const JEV_TIMEOUT_MS = 8000;

export class JevGatewayError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "JevGatewayError";
    this.code = code;
    this.status = status;
  }
}

function text(value, field, { min = 1, max = MAX_INSTRUCTION_CHARS } = {}) {
  if (typeof value !== "string") {
    throw new JevGatewayError("invalid_input", `${field} must be text.`, 400);
  }
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    throw new JevGatewayError("invalid_input", `${field} must be ${min}-${max} characters.`, 400);
  }
  return clean;
}

function stateText(value) {
  return text(value, "state", { min: 1, max: MAX_STATE_CHARS });
}

function normalizeStringList(values, field, { minItems, maxItems, maxChars = MAX_INSTRUCTION_CHARS }) {
  if (!Array.isArray(values) || values.length < minItems || values.length > maxItems) {
    throw new JevGatewayError(
      "invalid_input",
      `${field} must contain ${minItems}-${maxItems} items.`,
      400,
    );
  }
  return values.map((value, index) => text(value, `${field}[${index}]`, { max: maxChars }));
}

function ensureUnique(values, field) {
  const seen = new Set();
  for (const value of values) {
    const key = value.toLocaleLowerCase("en-US");
    if (seen.has(key)) {
      throw new JevGatewayError("invalid_input", `${field} contains a duplicate value: ${value}`, 400);
    }
    seen.add(key);
  }
}

export function buildCheckRequest({ state, propositions }, model = DEFAULT_JEV_MODEL) {
  const cleanState = stateText(state);
  const cleanPropositions = normalizeStringList(propositions, "propositions", {
    minItems: 1,
    maxItems: MAX_CHECKS,
    maxChars: 700,
  });
  const questions = {};
  for (let i = 0; i < cleanPropositions.length; i += 1) {
    questions[`check_${i + 1}`] = {
      type: "noul",
      instructions: cleanPropositions[i],
      criteria: {
        true: "The proposition is supported by the supplied state.",
        false: "The proposition is not supported by the supplied state.",
      },
    };
  }
  return { state: cleanState, questions, model };
}

export function buildClassifyRequest({ state, instructions, labels }, model = DEFAULT_JEV_MODEL) {
  const cleanState = stateText(state);
  const cleanInstructions = text(instructions, "instructions", { max: 1000 });
  if (!Array.isArray(labels) || labels.length < 2 || labels.length > MAX_LABELS) {
    throw new JevGatewayError("invalid_input", `labels must contain 2-${MAX_LABELS} items.`, 400);
  }
  const cleanLabels = labels.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new JevGatewayError("invalid_input", `labels[${index}] must be an object.`, 400);
    }
    const label = text(item.label, `labels[${index}].label`, { max: 80 });
    const description = item.description == null || String(item.description).trim() === ""
      ? null
      : text(String(item.description), `labels[${index}].description`, { max: 500 });
    return { label, description };
  });
  ensureUnique(cleanLabels.map((item) => item.label), "labels");

  const criteria = Object.fromEntries(cleanLabels.map((item) => [item.label, item.description]));
  return {
    state: cleanState,
    questions: {
      classification: { type: "choice", instructions: cleanInstructions, criteria },
    },
    model,
  };
}

export function buildScoreRequest({ state, instructions, levels }, model = DEFAULT_JEV_MODEL) {
  const cleanState = stateText(state);
  const cleanInstructions = text(instructions, "instructions", { max: 1000 });
  const cleanLevels = normalizeStringList(levels, "levels", {
    minItems: 2,
    maxItems: MAX_LEVELS,
    maxChars: 500,
  });
  return {
    state: cleanState,
    questions: {
      score: { type: "score", instructions: cleanInstructions, criteria: cleanLevels },
    },
    model,
  };
}

function requireAnswer(payload, key, type) {
  const answer = payload && payload.answers && payload.answers[key];
  if (!answer || answer.type !== type) {
    throw new JevGatewayError("typesafe_bad_response", "TypeSafe returned an unexpected response shape.", 502);
  }
  return answer;
}

export function parseCheckResponse(payload, propositions) {
  return propositions.map((proposition, index) => {
    const answer = requireAnswer(payload, `check_${index + 1}`, "noul");
    const probability = Number(answer.noul);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new JevGatewayError("typesafe_bad_response", "TypeSafe returned an invalid probability.", 502);
    }
    return { proposition, probability };
  });
}

export function parseClassifyResponse(payload) {
  const answer = requireAnswer(payload, "classification", "choice");
  if (typeof answer.choice !== "string" || !Number.isFinite(Number(answer.confidence))) {
    throw new JevGatewayError("typesafe_bad_response", "TypeSafe returned an invalid classification.", 502);
  }
  return {
    choice: answer.choice,
    confidence: Number(answer.confidence),
    probabilities: answer.probabilities || {},
  };
}

export function parseScoreResponse(payload) {
  const answer = requireAnswer(payload, "score", "score");
  if (!Number.isFinite(Number(answer.score)) || !Number.isFinite(Number(answer.confidence))) {
    throw new JevGatewayError("typesafe_bad_response", "TypeSafe returned an invalid score.", 502);
  }
  return {
    score: Number(answer.score),
    confidence: Number(answer.confidence),
    legend: answer.legend || {},
    probabilities: answer.probabilities || {},
  };
}

export async function callTypeSafe(
  requestBody,
  {
    fetchImpl = globalThis.fetch,
    apiKey = "",
    timeoutMs = JEV_TIMEOUT_MS,
  } = {},
) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new JevGatewayError(
      "typesafe_unconfigured",
      "Jev is installed but TYPESAFE_API_KEY is not configured.",
      503,
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new JevGatewayError("typesafe_unavailable", "TypeSafe transport is unavailable.", 502);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(TYPESAFE_SYSTEMONE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new JevGatewayError("typesafe_timeout", "Jev timed out before returning a judgment.", 504);
    }
    throw new JevGatewayError("typesafe_unavailable", "Jev could not be reached.", 502);
  } finally {
    clearTimeout(timer);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // Deliberately do not forward the upstream body. It can contain implementation
    // details and is never needed to tell the model that the judgement failed.
    throw new JevGatewayError(
      `typesafe_http_${response.status}`,
      `Jev request failed with HTTP ${response.status}.`,
      response.status === 429 ? 429 : 502,
    );
  }
  if (!payload || typeof payload !== "object" || !payload.answers || typeof payload.answers !== "object") {
    throw new JevGatewayError("typesafe_bad_response", "TypeSafe returned an unexpected response shape.", 502);
  }
  return payload;
}

export async function runChecks(input, options) {
  const model = String(options && options.model ? options.model : DEFAULT_JEV_MODEL).trim() || DEFAULT_JEV_MODEL;
  const body = buildCheckRequest(input, model);
  const payload = await callTypeSafe(body, { ...options, model });
  return {
    model: payload.model || model,
    results: parseCheckResponse(payload, body ? input.propositions.map((p) => String(p).trim()) : []),
    usage: payload.usage || null,
  };
}

export async function runClassification(input, options) {
  const model = String(options && options.model ? options.model : DEFAULT_JEV_MODEL).trim() || DEFAULT_JEV_MODEL;
  const body = buildClassifyRequest(input, model);
  const payload = await callTypeSafe(body, { ...options, model });
  return { model: payload.model || model, ...parseClassifyResponse(payload), usage: payload.usage || null };
}

export async function runScore(input, options) {
  const model = String(options && options.model ? options.model : DEFAULT_JEV_MODEL).trim() || DEFAULT_JEV_MODEL;
  const body = buildScoreRequest(input, model);
  const payload = await callTypeSafe(body, { ...options, model });
  return { model: payload.model || model, ...parseScoreResponse(payload), usage: payload.usage || null };
}

export function safeGatewayError(error) {
  if (error instanceof JevGatewayError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return { code: "jev_gateway_error", message: "Jev gateway failed safely.", status: 500 };
}
