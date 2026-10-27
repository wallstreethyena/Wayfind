// Live Bo chat for /halloween-in-florida. The Anthropic request goes through
// lib/paidAi.js (one ledger grant, fail closed). A missing key, a shut gate,
// a tripped billing breaker, a rate limit, or an ungrounded model payload
// returns Bo's deterministic catalog fallback so the ticket buttons still render.
import { aiKey } from "../../../lib/aiKey.js";
import { paidAnthropicRequest } from "../../../lib/paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../../../lib/providerHealth.js";
import { halloweenHauntModel } from "../../../lib/halloweenHauntVault.js";
import {
  BO_MAX_INPUT_CHARS,
  BO_WRAP_TURN,
  boCards,
  boGagFallback,
  boGagPrompt,
  boHauntFallback,
  boPageKind,
  boPrompt,
  boWrapReply,
  normalizeBoQuery,
  parseBoGag,
  parseBoReply,
  sanitizeAntic,
  sanitizeBoTurn,
  sanitizePageContext,
} from "../../../lib/boHauntChat.js";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 10;

const responseCache = new Map();
const ipBuckets = new Map();

function clientIp(req) {
  try {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim().slice(0, 64) || "anon";
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64) || "anon";
  } catch { /* ignore */ }
  return "anon";
}

function isRateLimited(ip, now = Date.now()) {
  const cutoff = now - RATE_WINDOW_MS;
  const prev = (ipBuckets.get(ip) || []).filter((ts) => ts > cutoff);
  if (prev.length >= RATE_MAX_REQUESTS) {
    ipBuckets.set(ip, prev);
    return true;
  }
  prev.push(now);
  ipBuckets.set(ip, prev);
  if (ipBuckets.size > 500) {
    for (const [key, timestamps] of ipBuckets.entries()) {
      if (!timestamps.some((ts) => ts > cutoff)) ipBuckets.delete(key);
    }
  }
  return false;
}

function readCachedReply(cacheKey, now = Date.now()) {
  const hit = responseCache.get(cacheKey);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }
  return hit.value;
}

function writeCachedReply(cacheKey, value, now = Date.now()) {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, { at: now, value });
}

function answer(body) {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

let gagSeed = 0;
async function gagResponse(page, req) {
  const kind = boPageKind(page);
  const model = halloweenHauntModel();
  const localGag = () => answer({ ...boGagFallback(page, gagSeed++), source: "fallback" });
  const cacheKey = "gag:" + (model.catalogVersion || "v1") + ":" + kind;
  const cached = readCachedReply(cacheKey);
  if (cached) return answer({ ...cached, source: "claude", cached: true });
  const key = aiKey();
  if (!key) return localGag();
  if (isRateLimited(clientIp(req))) return localGag();
  try {
    if (await breakerOpen("anthropic")) return localGag();
  } catch { return localGag(); }
  const prompt = boGagPrompt(page);
  let res;
  try {
    res = await paidAnthropicRequest({
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: prompt.model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
  } catch { return localGag(); }
  if (!res || !res.ok) {
    let errText = "";
    try { errText = await res.text(); } catch { errText = ""; }
    const failKind = classifyProviderFailure(res ? res.status : 0, errText);
    if (failKind) { try { await tripBreaker("anthropic", failKind, errText); } catch { /* fail soft */ } }
    return localGag();
  }
  let data = {};
  try { data = await res.json(); } catch { return localGag(); }
  const parsed = parseBoGag((data.content || [])[0]?.text || "");
  if (!parsed) return localGag();
  writeCachedReply(cacheKey, parsed);
  return answer({ ...parsed, source: "claude" });
}

export async function POST(req) {
  const model = halloweenHauntModel();
  let message = "";
  let page = null;
  let turn = 1;
  let mode = "";
  try {
    const body = await req.json();
    message = String(body && body.message || "").trim().slice(0, BO_MAX_INPUT_CHARS);
    page = sanitizePageContext(body && body.page);
    turn = sanitizeBoTurn(body && body.turn);
    mode = body && body.mode === "gag" ? "gag" : "";
  } catch { message = ""; }
  if (mode === "gag" && !message) return gagResponse(page, req);
  const fallback = () => answer({ ...boHauntFallback(message, model), source: "fallback" });

  // Wrap turn: deterministic goodbye that pushes the ticket buttons. No model
  // call, no ledger grant, no rate bucket: it costs nothing.
  if (turn >= BO_WRAP_TURN) {
    const picks = boHauntFallback(message, model).recommendedIds;
    return answer({
      reply: boWrapReply(turn),
      recommendedIds: picks,
      cards: boCards(picks, model),
      wrap: true,
      antic: "bow",
      source: "wrap",
    });
  }

  if (!message) return fallback();

  const norm = normalizeBoQuery(message);
  if (!norm) return fallback();
  // Coarse page kind only (halloween page vs other), never the full path.
  const cacheKey = (model.catalogVersion || "v1") + ":" + boPageKind(page) + ":" + norm;
  const cached = readCachedReply(cacheKey);
  if (cached) {
    return answer({ ...cached, source: "claude", cached: true });
  }

  const key = aiKey();
  if (!key) return fallback();

  const ip = clientIp(req);
  if (isRateLimited(ip)) return fallback();

  try {
    if (await breakerOpen("anthropic")) return fallback();
  } catch { return fallback(); }

  const prompt = boPrompt(model, message, { page, turn });
  let res;
  try {
    res = await paidAnthropicRequest({
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: prompt.model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
  } catch { return fallback(); }

  if (!res || !res.ok) {
    let errText = "";
    try { errText = await res.text(); } catch { errText = ""; }
    const kind = classifyProviderFailure(res ? res.status : 0, errText);
    if (kind) { try { await tripBreaker("anthropic", kind, errText); } catch { /* fail soft */ } }
    return fallback();
  }

  let data = {};
  try { data = await res.json(); } catch { return fallback(); }
  const text = (data.content || [])[0]?.text || "";
  const parsed = parseBoReply(text, model, message);
  if (!parsed) return fallback();

  const out = { ...parsed, antic: sanitizeAntic(parsed.antic), cards: boCards(parsed.recommendedIds, model), wrap: false };
  writeCachedReply(cacheKey, out);
  return answer({ ...out, source: "claude" });
}
