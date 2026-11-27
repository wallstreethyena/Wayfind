// lib/openAiCopy.js — one small, fail-closed path for Wayfind's OpenAI copy
// features (plan my day, event "why go" blurbs, review summaries).
//
// Owner decision 2026-11-27 ("Both"): build the three OpenAI features on a
// small, cheap model and SAVE each answer instead of generating it on every
// visit. This module is the money gate those features share:
//
//   1. Every request goes through lib/paidOpenAi.js (WAYFIND_GATE, payload
//      shape, model allowlist, output cap, strict timeout, redirect:"error").
//   2. Each feature has its OWN monthly request lane (an atomic wf_spend_take
//      grant per request) with a hard default cap, so one feature can never
//      drain the credit the others need. An env var may LOWER or RAISE a lane
//      only with a positive integer; anything else falls back to the default.
//   3. The account-wide OPENAI_MONTHLY_REQUEST_CAP is still honored: when it is
//      missing, invalid, or already used up, every lane fails closed.
//   4. A deterministic provider refusal (billing / hard quota) trips the shared
//      "openai" breaker, so a dead account costs one call, not hundreds.
//   5. Nothing here throws. Every failure resolves to { ok:false, reason } and
//      the caller renders the page WITHOUT AI text (never a broken page).
//
// Worst case at the default caps on gpt-4o-mini (about $0.15 per million input
// tokens, $0.60 per million output tokens; each request is input-capped by
// paidOpenAi's 64 KB body limit and output-capped per call below):
//   plan_day 4000 x ~$0.0009, why_go 1500 x ~$0.0004, review_summary 3000 x
//   ~$0.0006, so under $6 a month even if every lane is used to the last grant.
import { openaiKey } from "./openaiKey.js";
import { paidOpenAiRequest, extractOpenAiText, openaiMonthlyCap, OPENAI_SKU, OPENAI_DEFAULT_MODEL } from "./paidOpenAi.js";
import { readLedgerUsed } from "./spendGate.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "./providerHealth.js";

export const OPENAI_COPY_MODEL = OPENAI_DEFAULT_MODEL; // gpt-4o-mini: the small, cheap model already proven in this repo
export const OPENAI_BREAKER = "openai";

// Feature lanes. sku is the wf_spend_ledger row; env names the optional override.
export const OPENAI_COPY_LANES = Object.freeze({
  plan_day: Object.freeze({ sku: "openai_plan_day", env: "OPENAI_PLAN_DAY_MONTHLY_CAP", defaultCap: 4000, maxTokens: 700 }),
  why_go: Object.freeze({ sku: "openai_why_go", env: "OPENAI_WHY_GO_MONTHLY_CAP", defaultCap: 1500, maxTokens: 160 }),
  review_summary: Object.freeze({ sku: "openai_review_summary", env: "OPENAI_REVIEW_SUMMARY_MONTHLY_CAP", defaultCap: 3000, maxTokens: 260 }),
});

/** The monthly request cap for one lane. PURE (reads only the passed env). */
export function laneCap(laneName, env = process.env) {
  const lane = OPENAI_COPY_LANES[laneName];
  if (!lane) return null;
  const raw = String((env && env[lane.env]) || "").trim();
  if (/^[1-9]\d{0,6}$/.test(raw)) return Number(raw);
  return lane.defaultCap;
}

async function accountCapLeft() {
  const cap = openaiMonthlyCap();
  if (!cap) return false; // fail closed: no account-wide cap configured
  try {
    const used = await readLedgerUsed(OPENAI_SKU);
    // Unreadable ledger: the lane grant below reads the same ledger and fails
    // closed on its own, so this read-only check need not block twice.
    if (used == null) return true;
    return Number(used) < cap;
  } catch {
    return false;
  }
}

/** Strip a ```json fence and parse. Returns null on anything but a JSON object. */
export function parseJsonObject(text) {
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!t.startsWith("{")) {
    const i = t.indexOf("{");
    const j = t.lastIndexOf("}");
    if (i < 0 || j <= i) return null;
    t = t.slice(i, j + 1);
  }
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * One metered OpenAI call for a copy lane. Resolves { ok, text?, json?, reason? }.
 * @param {"plan_day"|"why_go"|"review_summary"} laneName
 * @param {{ system: string, user: string, json?: boolean, temperature?: number, signal?: AbortSignal }} req
 */
export async function openAiCopy(laneName, { system, user, json = true, temperature = 0.4, signal } = {}) {
  try {
    const lane = OPENAI_COPY_LANES[laneName];
    if (!lane) return { ok: false, reason: "unknown_lane" };
    const key = openaiKey();
    if (!key) return { ok: false, reason: "no_key" };
    if (await breakerOpen(OPENAI_BREAKER)) return { ok: false, reason: "breaker_open" };
    if (!(await accountCapLeft())) return { ok: false, reason: "account_cap" };
    const body = {
      max_tokens: lane.maxTokens,
      temperature,
      messages: [
        { role: "system", content: String(system || "").slice(0, 6000) },
        { role: "user", content: String(user || "").slice(0, 40000) },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    };
    const r = await paidOpenAiRequest(
      { model: OPENAI_COPY_MODEL, apiKey: key, body, signal },
      { sku: lane.sku, cap: laneCap(laneName), timeoutMs: 15_000 },
    );
    if (!r.ok) {
      let detail = "";
      try { detail = await r.text(); } catch { /* ignore */ }
      if (/openai_request_blocked/.test(detail)) return { ok: false, reason: "blocked" };
      const kind = classifyProviderFailure(r.status, detail);
      if (kind) await tripBreaker(OPENAI_BREAKER, kind, `openai ${r.status}`);
      return { ok: false, reason: kind ? kind : "http_" + r.status };
    }
    const data = await r.json();
    const text = extractOpenAiText(data);
    if (!text) return { ok: false, reason: "empty" };
    if (!json) return { ok: true, text };
    const parsed = parseJsonObject(text);
    return parsed ? { ok: true, text, json: parsed } : { ok: false, reason: "bad_json" };
  } catch {
    return { ok: false, reason: "exception" };
  }
}

// ── Shared copy hygiene ─────────────────────────────────────────────────────
// Wayfind's editorial ban list (docs/editorial-standard.md) plus pushy
// commands. Owner rule 2026-10-24: "people don't like being told what to do,
// they like options" — so no "must", "don't miss", "you need to".
const BANNED_RX = /hidden gem|nestled|boasts|stunning|must[- ]see|must[- ]try|must[- ]visit|iconic|vibrant|bustling|elevate|unforgettable|world[- ]class|breathtaking|magical experience|don'?t miss|you need to|you have to|you must|\bmust\b|best ever|guaranteed|\bAI\b|as an ai|language model/i;
export function hasBannedCopy(s) {
  return BANNED_RX.test(String(s || ""));
}

/** Plain, single-line text: collapse whitespace, drop wrapping quotes. */
export function cleanLine(s, max = 400) {
  const t = String(s || "").replace(/\s+/g, " ").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return t.length > max ? "" : t;
}

/**
 * Every number in the output must appear in the evidence. Stops invented
 * prices, times, distances, years and counts. PURE.
 */
export function numbersGrounded(text, evidenceText) {
  const ev = String(evidenceText || "");
  const nums = String(text || "").match(/\d+(?:[.,:]\d+)?/g) || [];
  return nums.every((n) => ev.includes(n));
}

const NAME_OK = new Set([
  "florida", "christmas", "holiday", "holidays", "wayfind", "santa", "new", "year", "years", "eve", "day",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "i", "it", "its", "it's", "a", "an", "the", "this", "that", "these", "those", "for", "if", "when", "with", "you", "your", "or", "and", "pick", "choose", "good", "great", "expect", "plan", "families", "kids", "couples",
  "gulf", "coast", "bay", "beach", "downtown",
]);

/**
 * Capitalized words that are not the first word of a sentence must come from
 * the evidence (or a tiny allowlist). Stops invented performers, dishes,
 * neighborhoods and people. PURE.
 */
export function namesGrounded(text, evidenceText) {
  const ev = String(evidenceText || "").toLowerCase();
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    for (let i = 1; i < words.length; i += 1) {
      const w = words[i].replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, "");
      if (!w || !/^[A-Z]/.test(w)) continue;
      const low = w.toLowerCase().replace(/[’']s$/, "");
      if (NAME_OK.has(low)) continue;
      if (!ev.includes(low)) return false;
    }
  }
  return true;
}
