// lib/paidAi.js — the single fail-closed path to Anthropic's Messages API.
//
// Every provider attempt takes one atomic monthly ledger grant. A provider
// response that asks a caller to retry is a new attempt and therefore needs a
// new grant too. Missing configuration never turns into an unlimited request.
import { gateMode } from "./spendGate.js";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const SKU = "anthropic_requests";
// Bound input cost as well as request count. A one-million-byte prompt behind a
// request counter is still an avoidable spend amplifier.
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 20_000;

function blocked(reason, status = 503) {
  return new Response(JSON.stringify({ error: "anthropic_request_blocked", reason }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function monthlyCap() {
  const raw = String(process.env.ANTHROPIC_MONTHLY_REQUEST_CAP || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const cap = Number(raw);
  return Number.isSafeInteger(cap) ? cap : null;
}

function ledgerConfig() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

function validRequest(init) {
  if (!init || typeof init !== "object" || String(init.method || "").toUpperCase() !== "POST") return "invalid_method";
  if (typeof init.body !== "string" || !init.body.length || new TextEncoder().encode(init.body).byteLength > MAX_REQUEST_BYTES) return "invalid_body_size";
  let body;
  try { body = JSON.parse(init.body); } catch { return "invalid_json"; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return "invalid_payload";
  if (typeof body.model !== "string" || !body.model.trim() || body.model.length > 160) return "invalid_model";
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > MAX_OUTPUT_TOKENS) return "invalid_max_tokens";
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 50) return "invalid_messages";
  if (body.system !== undefined && typeof body.system !== "string" && !Array.isArray(body.system)) return "invalid_system";
  for (const message of body.messages) {
    if (!message || typeof message !== "object" || !["user", "assistant"].includes(message.role)) return "invalid_message_role";
    if (typeof message.content === "string") { if (!message.content.trim()) return "empty_message"; continue; }
    if (!Array.isArray(message.content) || !message.content.length || message.content.length > 100) return "invalid_message_content";
  }
  const headers = new Headers(init.headers || {});
  if (!/^application\/json\b/i.test(headers.get("content-type") || "")) return "invalid_content_type";
  if (!headers.get("x-api-key")?.trim() || !headers.get("anthropic-version")?.trim()) return "missing_provider_credentials";
  return null;
}

async function takeGrant(cap) {
  const config = ledgerConfig();
  if (!config) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_500);
  try {
    const response = await fetch(config.url + "/rest/v1/rpc/wf_spend_take", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.key, Authorization: "Bearer " + config.key },
      body: JSON.stringify({ p_sku: SKU, p_cap: cap }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    return response.ok && (await response.json()) === true;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

/**
 * Send one validated Anthropic Messages request after an atomic monthly grant.
 * Always resolves to a Fetch Response so existing call sites keep their normal
 * `.ok`, `.status`, `.json()` and `.text()` handling on failure paths.
 */
export async function paidAnthropicRequest(init) {
  const invalid = validRequest(init);
  if (invalid) return blocked(invalid, 400);

  // Only the two documented enabled modes may reach the ledger. Unset, shut,
  // and typos all resolve to shut in the shared gate parser.
  if (gateMode() === "shut") return blocked("gate_shut");
  const cap = monthlyCap();
  if (!cap) return blocked("missing_or_invalid_ANTHROPIC_MONTHLY_REQUEST_CAP");
  if (!(await takeGrant(cap))) return blocked("monthly_request_cap_reached_or_ledger_unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const inheritedSignal = init.signal;
  const abortInherited = () => controller.abort();
  if (inheritedSignal) {
    if (inheritedSignal.aborted) controller.abort();
    else inheritedSignal.addEventListener("abort", abortInherited, { once: true });
  }
  try {
    return await fetch(MESSAGES_URL, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
  } catch {
    return blocked("provider_unreachable");
  } finally {
    clearTimeout(timeout);
    inheritedSignal?.removeEventListener?.("abort", abortInherited);
  }
}
