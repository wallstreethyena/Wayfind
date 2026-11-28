// lib/paidOpenAi.js — the single fail-closed path to OpenAI's Chat Completions API.
//
// Mirrors lib/paidAi.js (Anthropic) and lib/paidGemini.js (Google) so OpenAI can
// never spend unmetered:
//   1. Every attempt validates payload shape, model name, output token cap,
//      byte cap, and credentials BEFORE touching the ledger or network.
//   2. WAYFIND_GATE=shut (or unset/typo) blocks before ledger or network.
//   3. Missing or invalid OPENAI_MONTHLY_REQUEST_CAP fails closed (no default).
//   4. Every attempt takes one atomic monthly ledger grant via Supabase
//      wf_spend_take (SKU: openai_requests, or an explicit validated lane).
//   5. Uses redirect:"error", cache:"no-store", and a strict request timeout.
import { gateMode } from "./spendGate.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_SKU = "openai_requests";
export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const MODEL_RX = /^(gpt-[a-z0-9]+([.-][a-z0-9]+)*|o[1-9][a-z0-9.-]*)$/;
const VALID_ROLES = new Set(["system", "user", "assistant", "developer"]);
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 20_000;

function blocked(reason, status = 503) {
  return new Response(JSON.stringify({ error: "openai_request_blocked", reason }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function openaiMonthlyCap() {
  const raw = String(process.env["OPENAI_MONTHLY_REQUEST_CAP"] || "").trim();
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
  if (!Array.isArray(bodyObj.messages) || !bodyObj.messages.length || bodyObj.messages.length > 20) return "invalid_messages";
  for (const msg of bodyObj.messages) {
    if (!msg || typeof msg !== "object" || !VALID_ROLES.has(msg.role) || typeof msg.content !== "string" || !msg.content.trim()) {
      return "invalid_message_item";
    }
  }
  const maxOut = bodyObj.max_completion_tokens ?? bodyObj.max_tokens;
  if (!Number.isInteger(maxOut) || maxOut < 1 || maxOut > MAX_OUTPUT_TOKENS) {
    return "invalid_max_tokens";
  }
  const serialized = JSON.stringify({ ...bodyObj, model });
  if (new TextEncoder().encode(serialized).byteLength > MAX_REQUEST_BYTES) return "invalid_body_size";
  return null;
}

async function takeGrant(cap, sku = OPENAI_SKU, inheritedSignal) {
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
 * Send one validated OpenAI chat completions request after an atomic monthly
 * ledger grant. Always resolves to a Fetch Response.
 *
 * @param {{ model?: string, apiKey: string, body: object, signal?: AbortSignal }} req
 * @param {{ sku: string, cap: number, timeoutMs?: number }} [lane]
 */
export async function paidOpenAiRequest(req, lane) {
  if (!req || typeof req !== "object") return blocked("invalid_request", 400);
  const model = String(req.model || (req.body && req.body.model) || OPENAI_DEFAULT_MODEL).trim();
  const apiKey = String(req.apiKey || "").trim();
  const invalid = validPayload(model, req.body, apiKey);
  if (invalid) return blocked(invalid, 400);

  if (gateMode() === "shut") return blocked("gate_shut");

  let cap = null;
  let sku = OPENAI_SKU;
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
    cap = openaiMonthlyCap();
  }

  if (!cap) return blocked("missing_or_invalid_OPENAI_MONTHLY_REQUEST_CAP");
  if (req.signal?.aborted) return blocked("provider_unreachable");
  if (!(await takeGrant(cap, sku, req.signal))) return blocked("monthly_request_cap_reached_or_ledger_unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = req.signal ? AbortSignal.any([controller.signal, req.signal]) : controller.signal;

  try {
    return await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...req.body, model }),
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

/** Extract assistant message text from an OpenAI chat completions payload. */
export function extractOpenAiText(data) {
  const msg = data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message;
  return typeof (msg && msg.content) === "string" ? msg.content.trim() : "";
}
