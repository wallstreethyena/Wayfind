// Live Santa chat (site wide companion, Nov 1 to Dec 31). Santa helps a
// visitor find what they are looking for on Wayfind: the message runs through
// Wayfind's own search first (/api/search, free owned inventory + library),
// and Claude only chooses among those results (lib/santaFinder.js). The
// Anthropic request goes through lib/paidAi.js (one ledger grant, fail closed).
// A missing key, a shut gate, a tripped breaker, a rate limit or an ungrounded
// model payload returns the top search results with a stock Santa line, so the
// visitor always gets real Wayfind options.
import { aiKey } from "../../../lib/aiKey.js";
import { paidAnthropicRequest } from "../../../lib/paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../../../lib/providerHealth.js";
import { BO_MAX_INPUT_CHARS, BO_WRAP_TURN, boSmallTalk, normalizeBoQuery, sanitizeBoTurn, sanitizePageContext } from "../../../lib/boHauntChat.js";
import { mergeCandidates, parseSantaReply, santaCandidates, santaFallback, santaPrompt, santaQueries, santaWrap, SANTA_HELLO } from "../../../lib/santaFinder.js";
import { GET as siteSearch } from "../search/route.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
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
  if (prev.length >= RATE_MAX_REQUESTS) { ipBuckets.set(ip, prev); return true; }
  prev.push(now);
  ipBuckets.set(ip, prev);
  if (ipBuckets.size > 500) {
    for (const [key, stamps] of ipBuckets.entries()) if (!stamps.some((ts) => ts > cutoff)) ipBuckets.delete(key);
  }
  return false;
}

function readCached(key, now = Date.now()) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) { responseCache.delete(key); return null; }
  return hit.value;
}

function writeCached(key, value, now = Date.now()) {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, { at: now, value });
}

const answer = (body) => Response.json(body, { headers: { "cache-control": "no-store" } });

// Coordinates are untrusted: finite, on Earth, rounded to ~1 km before use.
function sanitizePoint(point) {
  const lat = Number(point && point.lat);
  const lng = Number(point && point.lng);
  if (!point || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

async function searchOnce(q, point) {
  const qs = new URLSearchParams({ q });
  if (point) { qs.set("lat", String(point.lat)); qs.set("lng", String(point.lng)); }
  try {
    const res = await siteSearch(new Request("https://wayfind.internal/api/search?" + qs.toString()));
    return santaCandidates(await res.json());
  } catch { return []; }
}

// Most specific keyword query first (lib/santaFinder santaQueries); stop once
// there are enough real options. At most 3 searches, all on the free owned
// inventory path.
async function findCandidates(queries, point) {
  const lists = [];
  for (const q of queries.slice(0, 3)) {
    lists.push(await searchOnce(q, point));
    if (mergeCandidates(lists).length >= 3) break;
  }
  return mergeCandidates(lists);
}

export async function POST(req) {
  let message = "", page = null, turn = 1, point = null;
  try {
    const body = await req.json();
    message = String(body && body.message || "").trim().slice(0, BO_MAX_INPUT_CHARS);
    page = sanitizePageContext(body && body.page);
    turn = sanitizeBoTurn(body && body.turn);
    point = sanitizePoint(body && body.point);
  } catch { message = ""; }
  if (!message) return answer({ ...santaFallback("", []), source: "fallback" });

  // Small talk never searches and never calls the model. The shared detector
  // answers in Boo's voice, so Santa uses his own line.
  const queries = santaQueries(message);
  if (!queries.length || boSmallTalk(message, 0)) return answer({ ...SANTA_HELLO, source: "smalltalk" });

  const candidates = await findCandidates(queries, point);
  if (turn >= BO_WRAP_TURN) return answer({ ...santaWrap(turn, candidates), source: "wrap" });
  const fallback = () => answer({ ...santaFallback(message, candidates, turn), source: "fallback" });
  if (!candidates.length) return fallback();

  const norm = normalizeBoQuery(message);
  const cacheKey = (point ? point.lat + "," + point.lng : "nopoint") + ":" + norm;
  const cached = norm ? readCached(cacheKey) : null;
  if (cached) return answer({ ...cached, source: "claude", cached: true });

  const key = aiKey();
  if (!key || isRateLimited(clientIp(req))) return fallback();
  try { if (await breakerOpen("anthropic")) return fallback(); } catch { return fallback(); }

  const prompt = santaPrompt(candidates, message, { page, turn });
  let res;
  try {
    res = await paidAnthropicRequest({
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: prompt.model, max_tokens: prompt.maxTokens, system: prompt.system, messages: [{ role: "user", content: prompt.user }] }),
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
  const text = (data.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("");
  const parsed = parseSantaReply(text, candidates);
  if (!parsed) return fallback();
  if (norm) writeCached(cacheKey, parsed);
  return answer({ ...parsed, source: "claude" });
}
