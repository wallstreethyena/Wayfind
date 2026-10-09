// lib/atlasWebLane.js - pure helpers for the Atlas paid lane's WEB source path.
//
// The lane makes ZERO Google calls. Facts come from pages Claude itself fetched with
// the server-side web_search / web_fetch tools inside ONE Messages call. The corpus the
// verifier checks against is the text of the pages actually fetched, never search
// snippets. Before a card can publish, an identity gate proves the fetched pages are
// about THIS place (name tokens + a geocoded address near our pin).
import { pageText } from "./atlasVerify.js";
import { hostOfUrl, isDeniedHost } from "./nightlifeRail.js";

export const METRO_CITY = Object.freeze({ tampa: "Tampa", orlando: "Orlando", "manatee-sarasota": "Sarasota" });
// Other city names acceptable for the no-geocode fallback.
const METRO_ALT = Object.freeze({ "manatee-sarasota": ["Bradenton"] });

// Hosts the lane may never fetch or cite: the Disney entity (AGENTS.md section 7) plus
// review/social aggregators that are not a venue's own word.
export const LANE_BLOCKED_DOMAINS = Object.freeze([
  "disney.com", "disney.go.com", "disneyworld.com", "disneyland.com", "disneysprings.com",
  "mydisneyexperience.com", "shopdisney.com",
  "yelp.com", "tripadvisor.com", "facebook.com", "instagram.com", "google.com",
]);

// Sonnet 5.5 list prices, verified on platform.claude.com/pricing 2026-10-07. Used only to
// meter dry-sample runs against a dollar ceiling; update them if the model/prices change.
export const PRICE_INPUT_PER_MTOK = 2;
export const PRICE_OUTPUT_PER_MTOK = 10;
export const PRICE_CACHE_WRITE_MULT = 1.25;
export const PRICE_CACHE_READ_MULT = 0.1;
export const PRICE_WEB_SEARCH_EACH = 0.01;

/** Actual dollar cost of one Messages response from its `usage` block. */
export function laneCostUsd(usage) {
  const u = usage || {};
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
  const input = n(u.input_tokens) + n(u.cache_creation_input_tokens) * PRICE_CACHE_WRITE_MULT + n(u.cache_read_input_tokens) * PRICE_CACHE_READ_MULT;
  const searches = n(u.server_tool_use && u.server_tool_use.web_search_requests);
  return (input * PRICE_INPUT_PER_MTOK + n(u.output_tokens) * PRICE_OUTPUT_PER_MTOK) / 1e6 + searches * PRICE_WEB_SEARCH_EACH;
}

/**
 * PROVABLE worst-case USD for ONE Messages request with this exact body, or null when no
 * bound can be proven. The dry meter reserves this amount BEFORE the request is sent.
 *
 * Anthropic docs, verified 2026-10-08: Sonnet 5.5 (claude-sonnet-5-5) is $2/MTok input and
 * $10/MTok output with a 1M-token context window. Web search is $10 per 1000 searches PLUS
 * the result tokens billed as input; the docs give NO limit on search-result size and NO
 * documented iteration count for the server-side tool loop (pause_turn exists). So a body
 * carrying ANY tool (web_search / web_fetch, or any entry with a `type`, i.e. a server
 * tool) has no provable bound below ~1M input tokens per iteration: it is UNBOUNDED -> null.
 *
 * Without tools the bill is exactly input + output: countedInputTokens (a real count of
 * this body, a positive safe integer) at the input price plus body.max_tokens (a positive
 * integer, the hard output ceiling) at the output price. Anything not provable -> null.
 */
export function laneWorstCaseUsd(body, countedInputTokens) {
  if (!body || typeof body !== "object") return null;
  if (body.tools !== undefined && !(Array.isArray(body.tools) && body.tools.length === 0)) return null;
  if (body.tool_choice !== undefined) return null;
  if (!Number.isSafeInteger(countedInputTokens) || countedInputTokens <= 0) return null;
  const maxOut = body.max_tokens;
  if (!Number.isSafeInteger(maxOut) || maxOut <= 0) return null;
  return (countedInputTokens * PRICE_INPUT_PER_MTOK + maxOut * PRICE_OUTPUT_PER_MTOK) / 1e6;
}

export const LANE_MAX_CORPUS_CHARS = 20000;
export const LANE_MAX_TOKENS = 2000;
export const LANE_NAME_MATCH = 0.6;
export const LANE_KM_DEFAULT = 1.5;
export const LANE_KM_WIDE = 5; // attractions / beach / parks are large

export function metroCity(metro) { return METRO_CITY[metro] || null; }

export function hasDash(s) { return /[–—]| - /.test(String(s || "")); }

export function haversineKm(lat1, lng1, lat2, lng2) {
  const v = [lat1, lng1, lat2, lng2].map(Number);
  if (v.some((x) => !Number.isFinite(x))) return null;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(v[2] - v[0]), dLng = rad(v[3] - v[1]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(v[0])) * Math.cos(rad(v[2])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The body of the lane's single Messages call (before JSON.stringify). */
export function laneRequestBody(place, model, systemBlocks, cityHint) {
  const city = cityHint || metroCity(place && place.metro) || "Florida";
  const tool = { blocked_domains: [...LANE_BLOCKED_DOMAINS] };
  const ctx = { name: place.name, category: place.category, lat: place.lat, lng: place.lng, metro_city: city };
  return {
    model, max_tokens: LANE_MAX_TOKENS, temperature: 0.4, system: systemBlocks,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", city, region: "Florida", country: "US" }, ...tool },
      { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, max_content_tokens: 8000, ...tool },
    ],
    messages: [{
      role: "user",
      content: "Write the atlas-590-v1 editorial for this exact place. Search the web, then fetch the pages, and write ONLY from the fetched pages (never from search snippets); every facts[].source must be a URL you fetched. "
        + "In the JSON also return found_address (the street address of this place exactly as printed on a fetched page) and found_city. "
        + 'If no official, government, tourism or news page confirms this exact place, return exactly {"pending":true}. Do not use dashes in prose.\n\n' + JSON.stringify(ctx),
    }],
  };
}

/** Parse a Messages response into the last text block, fetched pages and search count. */
export function extractLaneResult(json) {
  const blocks = Array.isArray(json && json.content) ? json.content : [];
  let text = "";
  for (const b of blocks) if (b && b.type === "text" && typeof b.text === "string" && b.text.trim()) text = b.text;
  const fetched = [], seen = new Set();
  let budget = LANE_MAX_CORPUS_CHARS;
  for (const b of blocks) {
    if (!b || b.type !== "web_fetch_tool_result") continue;
    const c = b.content;
    if (!c || c.type !== "web_fetch_result" || typeof c.url !== "string") continue;
    const src = c.content && c.content.source;
    if (!src || src.type !== "text" || typeof src.data !== "string") continue;
    if (seen.has(c.url) || budget <= 0) continue;
    const t = pageText(src.data, budget);
    if (!t) continue;
    seen.add(c.url); budget -= t.length;
    fetched.push({ url: c.url, text: t });
  }
  const searches = Number(json && json.usage && json.usage.server_tool_use && json.usage.server_tool_use.web_search_requests) || 0;
  return { text, fetched, searches, costUsd: laneCostUsd(json && json.usage) };
}

/** Section 7: any fetched page on a denied host. */
export function deniedFetched(fetched) {
  return (fetched || []).some((f) => isDeniedHost(hostOfUrl(f.url)));
}

const STOP = new Set(["the", "of", "and", "at", "in", "on", "a", "an", "to", "for", "by"]);
const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const stem = (w) => w.replace(/ies$/, "y").replace(/(es|s)$/, "");
export function nameTokens(name) {
  return [...new Set(fold(name).split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map(stem))];
}
const pageWords = (t) => new Set(fold(t).split(" ").map(stem));

function addressInPage(addr, text) {
  const a = fold(addr), p = " " + fold(text) + " ";
  if (!a) return false;
  const m = a.match(/^(\d+)\s+(?:(?:n|s|e|w|north|south|east|west)\s+)?([a-z0-9]+)/);
  if (!m) return p.includes(" " + a + " ");
  return new RegExp(`\\s${m[1]}\\s+(?:(?:n|s|e|w|north|south|east|west)\\s+)?${m[2]}`).test(p);
}

const WIDE_RX = /park|beach|attraction|garden|zoo|museum/i;
export function maxKmFor(place) {
  return WIDE_RX.test(String(place && place.category || "")) || /park|beach/i.test(String(place && place.primary_type || "")) ? LANE_KM_WIDE : LANE_KM_DEFAULT;
}

/**
 * Identity gate. Returns [] when the fetched pages are provably about this place,
 * else a list of reasons (each becomes `identity:<reason>`). `geo` is {lat,lng} from the
 * Census geocoder, or null when it failed (then the metro city must appear in the text).
 */
export function identityProblems(parsed, fetched, place, geo) {
  const out = [];
  const pages = Array.isArray(fetched) ? fetched : [];
  if (!pages.length) return ["no-fetched-pages"];
  const addr = parsed && typeof parsed.found_address === "string" ? parsed.found_address.trim() : "";
  const city = parsed && typeof parsed.found_city === "string" ? parsed.found_city.trim() : "";
  if (!addr) out.push("missing-found-address");
  if (!city) out.push("missing-found-city");
  const all = pages.map((p) => p.text).join(" ");
  if (addr && !pages.some((p) => addressInPage(addr, p.text))) out.push("address-not-in-pages");
  if (city && !(" " + fold(all) + " ").includes(" " + fold(city) + " ")) out.push("city-not-in-pages");

  const toks = nameTokens(place && place.name);
  if (toks.length) {
    const best = Math.max(...pages.map((p) => { const w = pageWords(p.text); return toks.filter((t) => w.has(t)).length; }));
    if (best / toks.length < LANE_NAME_MATCH) out.push(`name-tokens:${best}/${toks.length}`);
  }

  if (geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lng))) {
    const km = haversineKm(place.lat, place.lng, geo.lat, geo.lng);
    if (km == null) out.push("no-pin");
    else if (km > maxKmFor(place)) out.push(`distance:${km.toFixed(1)}km`);
  } else {
    const names = [METRO_CITY[place && place.metro], ...(METRO_ALT[place && place.metro] || [])].filter(Boolean);
    const hay = " " + fold(all) + " ";
    const zip = place && /^\d{5}$/.test(String(place.zip || "")) ? String(place.zip) : null;
    if (!(names.some((c) => hay.includes(" " + fold(c) + " ")) || (zip && hay.includes(" " + zip + " ")))) out.push("geocode-failed-and-metro-absent");
  }
  return out;
}

/** Lane-only prose rule: no em/en dash or spaced hyphen in hook / why_here. */
export function dashProblems(parsed) {
  return ["hook", "why_here"].filter((f) => hasDash(parsed && parsed[f])).map((f) => `dash:${f}`);
}

/** Free US Census geocoder. No key, 5s timeout, fail-soft (null). `fetchImpl` is injectable for tests. */
export async function geocodeCensus(address, fetchImpl = globalThis.fetch, timeoutMs = 5000) {
  const a = String(address || "").trim();
  if (!a) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=" + encodeURIComponent(a) + "&benchmark=Public_AR_Current&format=json", { signal: ctrl.signal, cache: "no-store" });
    if (!r || !r.ok) return null;
    const j = await r.json();
    const c = j && j.result && j.result.addressMatches && j.result.addressMatches[0] && j.result.addressMatches[0].coordinates;
    const lat = Number(c && c.y), lng = Number(c && c.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch { return null; } finally { clearTimeout(t); }
}
