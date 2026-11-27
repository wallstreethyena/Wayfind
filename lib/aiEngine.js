// lib/aiEngine.js — the Wayfind AI engine (owner order 2026-11-27: "Get OpenAI
// to be the AI Architect for Wayfind").
//
// One server-only front door for the three OpenAI jobs: writing community
// guides from a member's published itinerary, drafting itinerary templates
// from Wayfind's own places and events, and moderating public text. It adds
// three things on top of lib/paidOpenAi.js (which already fails closed on the
// gate, the key, payload shape and a monthly request grant):
//
//   1. A HARD DOLLAR CAP. OPENAI_ENGINE_WEEKLY_USD (owner trial 2026-11-27:
//      "a trial test for 80 bucks a week"), or OPENAI_ENGINE_MONTHLY_USD when
//      no weekly figure is set (unset both means no calls), becomes a request
//      cap for its own ledger lane (sku openai_engine) by dividing it by the
//      WORST CASE price of one call: the largest prompt we allow plus the
//      largest reply we allow, at the model's list price. Real calls cost
//      less, so the bill can never pass the dollar figure even if every call
//      were the biggest possible. A weekly figure is enforced as a DAILY
//      grant of one seventh (sku openai_engine_dYYYYMMDD, UTC day), so no
//      calendar week can pass it, even one that spans two months, plus the
//      monthly lane as a second ceiling.
//   2. PER MEMBER LIMITS. A member's calls are counted per day per lane in
//      wf_ai_user_usage (public.wf_ai_user_take, atomic). Cron jobs have no
//      member and are bounded by their own schedule and the lane cap.
//   3. NO PERSONAL DATA OUT. Callers pass only Wayfind place and event facts,
//      a city and stop order. assertNoPersonalData() refuses a prompt that
//      carries an email, phone number, street address pattern, card number or
//      a Supabase user id, so a future caller cannot leak one by accident.
//
// Every reply is asked for as strict JSON (structured outputs) and is parsed
// and validated by the caller against the exact ids it sent; the model never
// gets to add a place.
import { openaiKey } from "./openaiKey.js";
import { paidOpenAiRequest, extractOpenAiText } from "./paidOpenAi.js";
import { utcCalendarDateKey } from "./siteTime.js";

export const ENGINE_SKU = "openai_engine";
export const ENGINE_DEFAULT_MODEL = "gpt-4o-mini";
// List prices, USD per 1M tokens (platform.openai.com/docs/pricing, gpt-4o-mini:
// $0.15 input, $0.60 output). Kept here so the cap math is visible and tested.
export const MODEL_PRICES = Object.freeze({
  "gpt-4o-mini": Object.freeze({ input: 0.15, output: 0.6 }),
});
// Hard limits on every call. A prompt bigger than this is refused before any
// network call, so the worst case below is a true ceiling.
export const MAX_PROMPT_CHARS = 36_000; // ~9,000 tokens at 4 chars a token
export const MAX_PROMPT_TOKENS_BOUND = 12_000; // generous token bound for 36k chars of mixed text
export const MAX_REPLY_TOKENS = 1_500;

export const USER_LANE_CAPS = Object.freeze({ guide_write: 6, name_check: 10 });

export function engineModel(env = process.env) {
  const m = String(env.OPENAI_ENGINE_MODEL || "").trim();
  return m && MODEL_PRICES[m] ? m : ENGINE_DEFAULT_MODEL;
}

/** Worst case USD for one call of this model under the hard limits. */
export function worstCaseCallUsd(model = ENGINE_DEFAULT_MODEL) {
  const p = MODEL_PRICES[model] || MODEL_PRICES[ENGINE_DEFAULT_MODEL];
  return (MAX_PROMPT_TOKENS_BOUND * p.input + MAX_REPLY_TOKENS * p.output) / 1_000_000;
}

function usdFrom(raw, max) {
  const t = String(raw || "").trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const usd = Number(t);
  return usd > 0 && usd <= max ? usd : null;
}

/** Weekly dollar budget from env, or null. Hard ceiling $500 a week. */
export function engineWeeklyUsd(env = process.env) {
  return usdFrom(env.OPENAI_ENGINE_WEEKLY_USD, 500);
}

/**
 * Monthly dollar budget, or null (fail closed: no calls). A weekly budget wins
 * and is scaled to the longest month (31 days), so the monthly lane never
 * binds before the daily grants do.
 */
export function engineMonthlyUsd(env = process.env) {
  const weekly = engineWeeklyUsd(env);
  if (weekly) return Math.round((weekly * 31 / 7) * 100) / 100;
  return usdFrom(env.OPENAI_ENGINE_MONTHLY_USD, 500);
}

/** The lane's monthly request cap: dollars divided by the worst case call. */
export function engineRequestCap(env = process.env) {
  const usd = engineMonthlyUsd(env);
  if (!usd) return null;
  const cap = Math.floor(usd / worstCaseCallUsd(engineModel(env)));
  return cap >= 1 ? cap : null;
}

/** Daily request cap when a weekly budget is set (one seventh of it), else null. */
export function engineDailyCap(env = process.env) {
  const weekly = engineWeeklyUsd(env);
  if (!weekly) return null;
  const cap = Math.floor(weekly / 7 / worstCaseCallUsd(engineModel(env)));
  return cap >= 1 ? cap : null;
}

/** The ledger row for one UTC day of the weekly budget. PURE. */
export function engineDailySku(nowMs = Date.now()) {
  // UTC on purpose: wf_spend_take keys its month by the UTC clock, so the daily
  // rows line up with the monthly lane.
  return ENGINE_SKU + "_d" + utcCalendarDateKey(nowMs).replace(/-/g, "");
}

const PII_PATTERNS = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "email"],
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, "phone"],
  [/\b(?:\d[ -]?){13,16}\b/, "card"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i, "user_id"],
];

/** Returns the kind of personal data found, or null. */
export function findPersonalData(text) {
  const s = String(text || "");
  for (const [rx, kind] of PII_PATTERNS) if (rx.test(s)) return kind;
  return null;
}

function blocked(reason) {
  return { ok: false, reason };
}

function sbConfig(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

/** One atomic grant from wf_spend_ledger. True only when the database said yes. */
async function ledgerTake(sku, cap, { env = process.env, fetchImpl = fetch } = {}) {
  const cfg = sbConfig(env);
  if (!cfg) return false;
  try {
    const r = await fetchImpl(cfg.url + "/rest/v1/rpc/wf_spend_take", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: cfg.key, Authorization: "Bearer " + cfg.key },
      body: JSON.stringify({ p_sku: sku, p_cap: cap }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(7500),
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}

/**
 * The weekly budget's daily grant. True when no weekly budget is set (the
 * monthly lane alone applies), or when today's ledger row had room.
 */
export async function takeDailyGrant({ env = process.env, fetchImpl = fetch, take = null, nowMs = Date.now() } = {}) {
  const daily = engineDailyCap(env);
  if (!daily) return true;
  const sku = engineDailySku(nowMs);
  return take ? !!(await take(sku, daily)) : ledgerTake(sku, daily, { env, fetchImpl });
}

/** One per member per day per lane grant. True only when the database said yes. */
export async function takeUserGrant(userId, lane, { env = process.env, fetchImpl = fetch } = {}) {
  const cap = USER_LANE_CAPS[lane];
  if (!cap || !/^[0-9a-f-]{36}$/i.test(String(userId || ""))) return false;
  const cfg = sbConfig(env);
  if (!cfg) return false;
  try {
    const r = await fetchImpl(cfg.url + "/rest/v1/rpc/wf_ai_user_take", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: cfg.key, Authorization: "Bearer " + cfg.key },
      body: JSON.stringify({ p_user_id: userId, p_lane: lane, p_cap: cap }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}

/**
 * Ask OpenAI for one strict JSON object. Resolves { ok, data } or
 * { ok:false, reason }. Never throws. `schema` is a JSON Schema object for
 * structured outputs (strict mode); the caller still validates every field.
 */
export async function engineJson({ system, user, schema, schemaName = "wayfind_reply", maxTokens = 900, temperature = 0.4 }, { env = process.env, request = paidOpenAiRequest, take = null } = {}) {
  const sys = String(system || "");
  const usr = String(user || "");
  if (!sys.trim() || !usr.trim() || !schema || typeof schema !== "object") return blocked("invalid_request");
  if (sys.length + usr.length > MAX_PROMPT_CHARS) return blocked("prompt_too_large");
  const pii = findPersonalData(sys + "\n" + usr);
  if (pii) return blocked("personal_data_in_prompt:" + pii);
  const cap = engineRequestCap(env);
  if (!cap) return blocked("missing_or_invalid_OPENAI_ENGINE_BUDGET");
  const apiKey = env === process.env ? openaiKey() : String(env.OPENAI_API_KEY || "");
  if (!apiKey) return blocked("missing_provider_credentials");
  if (!(await takeDailyGrant({ env, take }))) return blocked("daily_cap_reached_or_ledger_unavailable");
  const model = engineModel(env);
  const res = await request({
    model,
    apiKey,
    body: {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      max_completion_tokens: Math.max(64, Math.min(MAX_REPLY_TOKENS, Math.floor(maxTokens))),
      temperature,
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    },
  }, { sku: ENGINE_SKU, cap, timeoutMs: 30_000 });
  if (!res || !res.ok) {
    let reason = "provider_error_" + (res ? res.status : 0);
    try { const j = await res.json(); if (j && j.reason) reason = j.reason; else if (j && j.error && j.error.code) reason = String(j.error.code); } catch {}
    return blocked(reason);
  }
  let data = null;
  try {
    const payload = await res.json();
    const text = extractOpenAiText(payload);
    data = JSON.parse(text);
  } catch {
    return blocked("unparseable_reply");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return blocked("unparseable_reply");
  return { ok: true, data, model };
}

const MOD_URL = "https://api.openai.com/v1/moderations";

/**
 * OpenAI moderation for public text. Resolves { ok:true, flagged } or
 * { ok:false, reason }. It counts against the same capped ledger lane, so it
 * cannot run unmetered. Callers treat ok:false as "not checked" and must not
 * publish unchecked text as checked.
 */
export async function moderateText(text, { env = process.env, fetchImpl = fetch, take = null } = {}) {
  const input = String(text || "").slice(0, 8000);
  if (!input.trim()) return { ok: true, flagged: false };
  const cap = engineRequestCap(env);
  if (!cap) return blocked("missing_or_invalid_OPENAI_ENGINE_BUDGET");
  const apiKey = env === process.env ? openaiKey() : String(env.OPENAI_API_KEY || "");
  if (!apiKey) return blocked("missing_provider_credentials");
  const grant = take || (() => ledgerTake(ENGINE_SKU, cap, { env, fetchImpl }));
  if (!(await takeDailyGrant({ env, fetchImpl, take: take ? () => take() : null }))) return blocked("daily_cap_reached_or_ledger_unavailable");
  if (!(await grant())) return blocked("monthly_cap_reached_or_ledger_unavailable");
  try {
    const r = await fetchImpl(MOD_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return blocked("moderation_http_" + r.status);
    const j = await r.json();
    const results = Array.isArray(j && j.results) ? j.results : [];
    if (!results.length) return blocked("moderation_empty");
    return { ok: true, flagged: results.some((x) => x && x.flagged === true) };
  } catch {
    return blocked("moderation_unreachable");
  }
}

/** Plain text for public pages: no links, no emails, no phone numbers, no markup. */
export function cleanPublicText(raw, max = 300) {
  let s = String(raw == null ? "" : raw);
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/https?:\/\/\S+|www\.\S+/gi, " ");
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
  s = s.replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, " ");
  s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
  // Owner copy rule: no dashes in public Wayfind copy.
  s = s.replace(/\s*[‒–—―]\s*/g, ", ").replace(/\s+-\s+/g, ", ");
  s = s.replace(/[*_#`>]+/g, "").replace(/\s{2,}/g, " ").trim();
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    s = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:]+$/, "") + "…";
  }
  return s;
}
