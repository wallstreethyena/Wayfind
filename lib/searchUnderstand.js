// lib/searchUnderstand.js — optional Claude filter for searches the phrase map missed.
//
// Off unless WAYFIND_SEARCH_UNDERSTAND is exactly "on". The model returns
// strict JSON from an allowlist. It does not name places, does not write
// anything the reader sees, and does not order results. A timeout, a bad
// payload, a missing key, or the monthly cap all fall back to the phrase map
// and the index. Nothing here writes Vercel env.

import { paidAnthropicRequest } from "./paidAi.js";
import { COVERED_CITIES } from "./landingCities.js";

export const UNDERSTAND_MODEL = "claude-haiku-4-5";
export const UNDERSTAND_TIMEOUT_MS = 1500;
export const UNDERSTAND_MAX_TOKENS = 120;
export const UNDERSTAND_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export const CATEGORY_ALLOWLIST = Object.freeze(["food", "nightlife", "attractions", "beach", "hotels", "shopping", "events", "guides", "coupons"]);
export const PRICE_ALLOWLIST = Object.freeze(["free", "$", "$$", "$$$", "$$$$"]);
export const WHEN_ALLOWLIST = Object.freeze(["today", "tonight", "weekend", "anytime"]);
export const KEYWORD_ALLOWLIST = Object.freeze([
  "beach", "brunch", "breakfast", "coffee", "pizza", "seafood", "tacos", "barbecue",
  "museum", "park", "garden", "zoo", "aquarium", "trail", "kayak", "boat", "fishing",
  "manatee", "dolphin", "wildlife", "hiking", "outdoor", "indoor", "rainy", "family",
  "kids", "romantic", "nightlife", "bar", "halloween", "festival", "market", "cheap",
  "free", "art", "history", "shopping", "hotel", "sunset", "brewery", "dessert",
  "burger", "sushi", "mexican", "italian", "cuban", "bakery", "springs", "theater",
  "sports", "golf", "picnic",
]);

const FILTER_KEYS = ["city", "category", "price", "when", "kid_friendly", "keywords"];
const CITY_SLUGS = new Set(Object.keys(COVERED_CITIES));
const CATEGORIES = new Set(CATEGORY_ALLOWLIST);
const PRICES = new Set(PRICE_ALLOWLIST);
const WHENS = new Set(WHEN_ALLOWLIST);
const KEYWORDS = new Set(KEYWORD_ALLOWLIST);

export function searchUnderstandEnabled(env = process.env) {
  return String((env || {}).WAYFIND_SEARCH_UNDERSTAND || "").trim() === "on";
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function understandCacheKey(query, citySlug) {
  return `${normalize(query).slice(0, 160)}|${citySlug || ""}`;
}

export function understandRequestParts(query, citySlug) {
  const system = [
    "Convert one Wayfind search into filters. Return one JSON object and nothing else.",
    "Never name a business, venue, address, or person. Never rank, sort, or recommend.",
    "Keys, and only these keys: city, category, price, when, kid_friendly, keywords.",
    `city is null or one of: ${[...CITY_SLUGS].join(", ")}.`,
    `category is null or one of: ${CATEGORY_ALLOWLIST.join(", ")}.`,
    `price is null or one of: ${PRICE_ALLOWLIST.join(", ")}.`,
    `when is null or one of: ${WHEN_ALLOWLIST.join(", ")}.`,
    "kid_friendly is true, false, or null.",
    `keywords is an array of 0 to 4 strings, each exactly one of: ${KEYWORD_ALLOWLIST.join(", ")}.`,
    "Use null and [] when unsure.",
  ].join(" ");
  const user = `query: ${String(query || "").trim().slice(0, 160)}\nselected_city: ${citySlug || "none"}`;
  return { system, user, maxTokens: UNDERSTAND_MAX_TOKENS, model: UNDERSTAND_MODEL };
}

/** Exact request size. Tokens are the published ~4 characters per English token, not a live count. */
export function measureUnderstandRequest(query, citySlug) {
  const parts = understandRequestParts(query, citySlug);
  const inputChars = parts.system.length + parts.user.length;
  return {
    inputChars,
    inputTokens: Math.ceil(inputChars / 4),
    maxOutputTokens: parts.maxTokens,
  };
}

export function parseUnderstandFilters(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const keys = Object.keys(obj);
  if (keys.some((key) => !FILTER_KEYS.includes(key))) return null;
  if (obj.city != null && (typeof obj.city !== "string" || !CITY_SLUGS.has(obj.city))) return null;
  if (obj.category != null && !CATEGORIES.has(obj.category)) return null;
  if (obj.price != null && !PRICES.has(obj.price)) return null;
  if (obj.when != null && !WHENS.has(obj.when)) return null;
  if (obj.kid_friendly != null && typeof obj.kid_friendly !== "boolean") return null;
  const keywords = obj.keywords == null ? [] : obj.keywords;
  if (!Array.isArray(keywords) || keywords.length > 4) return null;
  if (keywords.some((word) => typeof word !== "string" || !KEYWORDS.has(word))) return null;
  return {
    city: obj.city || null,
    category: obj.category || null,
    price: obj.price || null,
    when: obj.when || null,
    kid_friendly: obj.kid_friendly == null ? null : obj.kid_friendly,
    keywords,
  };
}

function supabaseConfig(env) {
  const raw = String((env && (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)) || "").trim().replace(/\/+$/, "");
  const url = raw ? (raw.startsWith("http") ? raw : `https://${raw}`) : "";
  const key = String((env && env.SUPABASE_SERVICE_ROLE_KEY) || "").trim();
  return url && key ? { url, key } : null;
}

async function readCache(config, cacheKey, fetchImpl, nowMs) {
  if (!config) return null;
  const url = new URL("/rest/v1/wf_search_understand_cache", config.url);
  url.searchParams.set("select", "filters");
  url.searchParams.set("cache_key", `eq.${cacheKey}`);
  url.searchParams.set("expires_at", `gte.${new Date(nowMs).toISOString()}`);
  url.searchParams.set("limit", "1");
  try {
    const response = await fetchImpl(url, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      cache: "no-store",
    });
    if (!response || !response.ok) return null;
    const rows = await response.json();
    const filters = rows && rows[0] && rows[0].filters;
    return filters && typeof filters === "object" ? parseUnderstandFilters(JSON.stringify(filters)) : null;
  } catch {
    return null;
  }
}

async function writeCache(config, cacheKey, filters, fetchImpl, nowMs) {
  if (!config || !filters) return;
  try {
    await fetchImpl(new URL("/rest/v1/wf_search_understand_cache", config.url), {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        filters,
        created_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + UNDERSTAND_CACHE_MS).toISOString(),
      }),
      cache: "no-store",
    });
  } catch {
    // A missed cache write still returns the filters for this request.
  }
}

function textFromMessage(payload) {
  const blocks = payload && Array.isArray(payload.content) ? payload.content : [];
  return blocks.map((block) => (block && block.type === "text" ? block.text : "")).join("");
}

/**
 * Validated filters, or null. `reason` is a short code. The model text is never returned.
 */
export async function understandSearch({ query, city, env = process.env, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (!searchUnderstandEnabled(env)) return { filters: null, reason: "flag_off", called: false };
  const cacheKey = understandCacheKey(query, city && city.slug);
  const config = supabaseConfig(env);
  const cached = await readCache(config, cacheKey, fetchImpl, nowMs);
  if (cached) return { filters: cached, reason: "cache", called: false };
  const apiKey = String(env.ANTHROPIC_API_KEY || env.LLM_API_KEY || "").trim();
  if (!apiKey) return { filters: null, reason: "not_configured", called: false };
  const parts = understandRequestParts(query, city && city.slug);
  const signal = AbortSignal.timeout(UNDERSTAND_TIMEOUT_MS);
  let response;
  try {
    response = await paidAnthropicRequest({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: parts.model,
        max_tokens: parts.maxTokens,
        system: parts.system,
        messages: [{ role: "user", content: parts.user }],
      }),
      signal,
    });
  } catch {
    return { filters: null, reason: signal.aborted ? "timeout" : "failed", called: true };
  }
  if (signal.aborted) return { filters: null, reason: "timeout", called: true };
  if (!response || !response.ok) {
    let reason = "failed";
    try {
      const body = await response.json();
      const code = body && body.reason;
      if (code === "monthly_request_cap_reached_or_ledger_unavailable") reason = "cap";
      else if (code === "missing_or_invalid_ANTHROPIC_MONTHLY_REQUEST_CAP") reason = "cap";
      else if (typeof code === "string" && code) reason = "blocked";
    } catch { /* ignore */ }
    return { filters: null, reason, called: reason !== "cap" && reason !== "blocked" };
  }
  let payload;
  try { payload = await response.json(); } catch { return { filters: null, reason: "invalid", called: true }; }
  const filters = parseUnderstandFilters(textFromMessage(payload));
  if (!filters) return { filters: null, reason: "invalid", called: true };
  await writeCache(config, cacheKey, filters, fetchImpl, nowMs);
  return { filters, reason: "ok", called: true };
}
