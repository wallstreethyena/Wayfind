// lib/paidGemini.js — the single fail-closed path to Google's Gemini API.
//
// Mirrors lib/paidAi.js (Anthropic) so Gemini AI can never spend unmetered:
//   1. Every attempt validates payload shape, model name, output token cap,
//      byte cap, and credentials BEFORE touching the ledger or network.
//   2. WAYFIND_GATE=shut (or unset/typo) blocks before ledger or network.
//   3. Missing or invalid GEMINI_MONTHLY_REQUEST_CAP fails closed (no default).
//   4. Every attempt takes one atomic monthly ledger grant via Supabase
//      wf_spend_take (SKU: gemini_requests, or an explicit validated lane).
//   5. The API key is sent ONLY in the `x-goog-api-key` request header — never
//      in the URL query string — so keys cannot leak into logs or traces.
//   6. Uses redirect:"error", cache:"no-store", and a strict request timeout.
//
// Billing note: consumer Google AI Pro / Ultra subscriptions do not directly
// bill server-side website API traffic. Point GEMINI_API_KEY at an AI Studio
// project (free tier or linked Cloud Billing with monthly AI Pro credits) and
// bound volume via GEMINI_MONTHLY_REQUEST_CAP.
import { gateMode } from "./spendGate.js";
import { CARBON_EDITORIAL_LANE, CARBON_EDITORIAL_MODEL, CARBON_EDITORIAL_MAX_BYTES, CARBON_EDITORIAL_MAX_OUTPUT_TOKENS } from "./geminiEditorialPolicy.js";

const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_SKU = "gemini_requests";
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const MODEL_RX = /^gemini-[a-z0-9]+([.-][a-z0-9]+)*$/;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 20_000;

function blocked(reason, status = 503) {
  return new Response(JSON.stringify({ error: "gemini_request_blocked", reason }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function geminiMonthlyCap() {
  const raw = String(process.env["GEMINI_MONTHLY_REQUEST_CAP"] || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const cap = Number(raw);
  return Number.isSafeInteger(cap) ? cap : null;
}

function ledgerConfig() {
  const raw = String(process.env["SUPABASE_URL"] || process.env["NEXT_PUBLIC_SUPABASE_URL"] || "")
    .trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = String(process.env["SUPABASE_SERVICE_ROLE_KEY"] || "").trim();
  return url && key ? { url, key } : null;
}

function validPayload(model, bodyObj, apiKey) {
  if (typeof apiKey !== "string" || !apiKey.trim()) return "missing_provider_credentials";
  if (typeof model !== "string" || !MODEL_RX.test(model.trim()) || model.length > 100) return "invalid_model";
  if (!bodyObj || typeof bodyObj !== "object" || Array.isArray(bodyObj)) return "invalid_payload";
  if (!Array.isArray(bodyObj.contents) || !bodyObj.contents.length || bodyObj.contents.length > 20) return "invalid_contents";
  for (const turn of bodyObj.contents) {
    if (!turn || typeof turn !== "object" || !Array.isArray(turn.parts) || !turn.parts.length || turn.parts.length > 20) {
      return "invalid_content_parts";
    }
    for (const part of turn.parts) {
      if (!part || typeof part !== "object" || typeof part.text !== "string" || !part.text.trim()) {
        return "empty_content_part";
      }
    }
  }
  const gen = bodyObj.generationConfig;
  if (!gen || typeof gen !== "object" || Array.isArray(gen)) return "missing_generation_config";
  if (!Number.isInteger(gen.maxOutputTokens) || gen.maxOutputTokens < 1 || gen.maxOutputTokens > MAX_OUTPUT_TOKENS) {
    return "invalid_max_output_tokens";
  }
  const serialized = JSON.stringify(bodyObj);
  if (new TextEncoder().encode(serialized).byteLength > MAX_REQUEST_BYTES) return "invalid_body_size";
  return null;
}

async function takeGrant(cap, sku = GEMINI_SKU, inheritedSignal) {
  const config = ledgerConfig();
  if (!config) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_500);
  try {
    const response = await fetch(config.url + "/rest/v1/rpc/wf_spend_take", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.key, Authorization: "Bearer " + config.key },
      body: JSON.stringify({ p_sku: sku, p_cap: cap }),
      cache: "no-store",
      redirect: "error",
      signal: inheritedSignal ? AbortSignal.any([controller.signal, inheritedSignal]) : controller.signal,
    });
    return response.ok && (await response.json()) === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send one validated Gemini generateContent request after an atomic monthly
 * ledger grant. Always resolves to a Fetch Response so callers use standard
 * `.ok`, `.status`, `.json()`, and `.text()` handling.
 *
 * @param {{ model?: string, apiKey: string, body: object, signal?: AbortSignal }} req
 * @param {{ sku: string, cap: number, timeoutMs?: number }} [lane]
 */
export async function paidGeminiRequest(req, lane) {
  if (!req || typeof req !== "object") return blocked("invalid_request", 400);
  const model = String(req.model || GEMINI_DEFAULT_MODEL).trim();
  const apiKey = String(req.apiKey || "").trim();
  const invalid = validPayload(model, req.body, apiKey);
  if (invalid) return blocked(invalid, 400);

  if (model.startsWith(CARBON_EDITORIAL_MODEL) || lane?.sku === CARBON_EDITORIAL_LANE.sku) {
    const body = req.body;
    const allowedFields = ["systemInstruction", "contents", "generationConfig"];
    const allowedGenerationFields = ["responseMimeType", "maxOutputTokens", "thinkingConfig"];
    if (model !== CARBON_EDITORIAL_MODEL || lane?.sku !== CARBON_EDITORIAL_LANE.sku || lane.cap !== CARBON_EDITORIAL_LANE.cap
      || body.generationConfig.maxOutputTokens > CARBON_EDITORIAL_MAX_OUTPUT_TOKENS
      || new TextEncoder().encode(JSON.stringify(body)).byteLength > CARBON_EDITORIAL_MAX_BYTES
      || Object.keys(body).some((field) => !allowedFields.includes(field))
      || Object.keys(body.generationConfig).some((field) => !allowedGenerationFields.includes(field))) {
      return blocked("carbon_requires_editorial_budget", 400);
    }
  }

  if (gateMode() === "shut") return blocked("gate_shut");

  let cap = null;
  let sku = GEMINI_SKU;
  let timeoutMs = REQUEST_TIMEOUT_MS;
  if (lane !== undefined) {
    const laneCap = Number(lane && lane.cap);
    if (!lane || typeof lane.sku !== "string" || !/^[a-z0-9_]{1,64}$/.test(lane.sku) || !Number.isSafeInteger(laneCap) || laneCap < 1) {
      return blocked("invalid_lane");
    }
    sku = lane.sku;
    cap = laneCap;
    if (lane.timeoutMs !== undefined) {
      const tm = Number(lane.timeoutMs);
      if (!Number.isInteger(tm) || tm < 1 || tm > 50_000) return blocked("invalid_lane");
      timeoutMs = tm;
    }
  } else {
    cap = geminiMonthlyCap();
  }

  if (!cap) return blocked("missing_or_invalid_GEMINI_MONTHLY_REQUEST_CAP");
  if (req.signal?.aborted) return blocked("provider_unreachable");
  if (!(await takeGrant(cap, sku, req.signal))) return blocked("monthly_request_cap_reached_or_ledger_unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = req.signal ? AbortSignal.any([controller.signal, req.signal]) : controller.signal;

  const endpoint = `${GEMINI_API_ORIGIN}/${encodeURIComponent(model)}:generateContent`;
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(req.body),
      signal,
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return blocked("provider_unreachable");
  } finally {
    clearTimeout(timeout);
  }
}

/** Extract concatenated text from a Gemini generateContent response payload. */
export function extractGeminiText(data) {
  const parts = data && Array.isArray(data.candidates) && data.candidates[0] && data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)
    ? data.candidates[0].content.parts
    : [];
  return parts
    .filter((p) => p && typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
}
