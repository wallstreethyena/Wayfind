// lib/popularity.js — Tier-2 popularity fetchers (owner handoff, 2026-07-21).
// Each source drops ONE oriented number (higher = more popular) per place
// into wf_place_popularity; wf_place_popularity_scored normalizes; the
// wf_best_picks ranker auto-blends. This module never invents a metric:
// no match above the confidence floor, or a missing field, means NO row.
//
// Implemented sources (keys verified in Preview + Production):
//   yelp        — review_count            (food) — SEE v8.99.15 note
//                 below: the stored key is currently the wrong length and
//                 every call short-circuits before touching the network.
//   foursquare  — popularity 0..1         (all categories; only when the
//                 API actually returns the field — never derived)
//   tripadvisor — RETIRED 2026-09-06, see v8.99.15 note on fetchTripadvisor.
//   wikipedia   — 30-day pageviews        (attractions + beaches; keyless)
// Documented follow-ups, deliberately NOT wired:
//   besttime    — needs a street address; wf_inventory stores none. Wiring
//                 it on name+coords returns wrong venues — worse than empty.
//   ticketmaster/predicthq — event demand, not place popularity; they join
//                 when the event→venue mapping lands (#231).
// v8.29.14 — FOURSQUARE JOINS THE CAP. TripAdvisor was capped from the start;
// Foursquare was not, and sourcesFor() returns it for EVERY category — so it took
// the whole 100-place batch every run, 12 runs a day, ~1,200 calls daily. Seven
// days of that returned http_429 on every one: 8,400 attempts, zero successes,
// zero rows in wf_place_popularity. A bad token returns 401 here (verified by
// call), so 429 means the key is fine and the VOLUME is not. 30/run is
// deliberately conservative — the cap is what lets a burned quota recover.
// v8.99.15 — tripadvisor's cap is gone with the fetcher: retired (see
// fetchTripadvisor) means no request ever leaves this process for it, so a
// per-run call budget has nothing left to bound.
// v9.0 (2026-09-07) — YELP JOINS THE CAP. The stale-batch selector went
// per-source (see 20260907_wf_popularity_attempt_ledger.sql): yelp now gets
// its OWN dedicated batch of up to 100 food/nightlife places every run,
// instead of "whatever food/nightlife happened to be in the one shared
// batch". Measured: 12,290 of 20,086 eligible places are food/nightlife, so
// an uncapped dedicated batch could legitimately reach 100 real calls/run —
// x 12 runs/day = 1,200/day against Yelp's ~500/day free tier, the exact
// shape that already burned Foursquare's quota (v8.29.14, below). 40/run x
// 12 = 480/day leaves headroom under the 500 ceiling.
export const SOURCE_CAPS = { foursquare: 30, yelp: 40 }; // per cron run, per source
import { fsqAttemptChain, fsqRequest, FSQ_BREAKER, FSQ_BREAKER_COOLDOWN_MS } from "./foursquare.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "./providerHealth.js";

export const CONFIDENCE_FLOOR = 0.55;

const T = 4500;

// ── per-source outcome diagnostics (2026-08-08) ─────────────────────────────
// The trend-signal audit found the popularity table fed by wikipedia ALONE:
// every yelp/foursquare/tripadvisor call skipped as an indistinguishable
// "no_data" while the Foursquare legacy v3 host had been SUNSET (2026-05-15)
// for months. A pipeline whose failures all look like "quiet venue" cannot be
// operated. Every fetcher now notes WHY it yielded nothing (no_key /
// http_<status> / network / no_match / no_field / ok) and the cron logs the
// tally — so the next silent source names itself in the very next run.
export const POP_DIAG = {};
export function resetPopDiag() { for (const k of Object.keys(POP_DIAG)) delete POP_DIAG[k]; }
export const notePop = (src, outcome) => { const s = (POP_DIAG[src] = POP_DIAG[src] || {}); s[outcome] = (s[outcome] || 0) + 1; };

// `onFail(status)` is an optional 4th hook, called (in addition to the normal
// notePop diagnostic) with the real HTTP status on a non-ok response — never on
// a network/timeout throw, where there IS no status. Only fetchFoursquare's
// CURRENT-generation attempt uses it (the quota breaker below); every other
// call site passes nothing and behaves exactly as before.
const jf = async (url, init, diagSrc, onFail) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), T);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) { if (diagSrc) notePop(diagSrc, "http_" + r.status); if (onFail) await onFail(r.status); return null; }
    return await r.json();
  } catch { if (diagSrc) notePop(diagSrc, "network"); return null; } finally { clearTimeout(t); }
};

// ── matching ────────────────────────────────────────────────────────────────
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export function nameSim(a, b) {
  const ta = new Set(norm(a).split(" ").filter(Boolean));
  const tb = new Set(norm(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.max(ta.size, tb.size);
}
const R = 3958.8;
export function distMi(a, b, c, d) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(c - a), dLng = rad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
// 70% name, 30% proximity (full credit ≤0.15mi, zero ≥1mi). A candidate with
// no coordinates leans on the name alone, scaled down — never up.
export function matchConfidence(place, cand) {
  const n = nameSim(place.name, cand.name);
  if (cand.lat == null || cand.lng == null) return n * 0.7;
  const d = distMi(place.lat, place.lng, cand.lat, cand.lng);
  const prox = d <= 0.15 ? 1 : d >= 1 ? 0 : 1 - (d - 0.15) / 0.85;
  return 0.7 * n + 0.3 * prox;
}
export function bestMatch(place, cands) {
  let best = null, bc = 0;
  for (const c of cands || []) {
    const conf = matchConfidence(place, c);
    if (conf > bc) { bc = conf; best = c; }
  }
  return best && bc >= CONFIDENCE_FLOOR ? { cand: best, confidence: Math.round(bc * 100) / 100 } : null;
}

// ── routing ─────────────────────────────────────────────────────────────────
export function sourcesFor(category) {
  // v8.6 — FOOD AND NIGHTLIFE WERE ROUTED TO THREE SOURCES THAT HAVE NEVER
  // WRITTEN A ROW, AND DENIED THE ONLY ONE THAT WORKS.
  //
  // Measured on production: wf_place_popularity holds 164 rows and every single
  // one is `wikipedia`. Yelp, Foursquare and TripAdvisor are all wired as
  // FETCHERS and none has ever produced a row — Foursquare because v3 sunset,
  // the other two for reasons not yet established (no_key vs no_match is
  // undetermined; POP_DIAG is not persisted anywhere readable).
  //
  // So routing food/nightlife to exactly those three made restaurants and bars
  // STRUCTURALLY incapable of popularity coverage, which is why the trending
  // rail — whose pools are things-to-do, restaurants and nightlife — could
  // never fill from two of its three pools.
  //
  // wikipedia is added as the LAST source for every category, not the first: it
  // genuinely covers parks, beaches and landmarks and genuinely does not cover
  // most restaurants, so it will simply miss on those rather than inventing
  // anything. A miss is a null row, not a wrong one. Nothing is loosened and no
  // threshold moves — a category that had a working source keeps its order.
  if (category === "food" || category === "nightlife") return ["yelp", "foursquare", "tripadvisor", "wikipedia"];
  if (category === "attractions" || category === "beach") return ["wikipedia", "foursquare", "tripadvisor"];
  return ["foursquare", "tripadvisor", "wikipedia"];
}

// v9.0 (2026-09-07) — the INVERSE of sourcesFor(), kept immediately next to
// it on purpose so the two cannot drift silently apart. This is the ONLY
// place that decides which places are even OFFERED to a source's stale-batch
// selection (app/api/cron/popularity passes the result straight through to
// wf_popularity_stale_batch's p_categories). wikipedia, foursquare and
// tripadvisor appear in EVERY branch above, including the default arm, so
// they are universal — null means "no category restriction", not "none".
// yelp appears in exactly one branch (food, nightlife) — restrict to that.
// A category this repo adds later automatically stays universal for the
// other three sources without anyone touching this function; only a NEW
// yelp-only-style restriction would ever need an edit here.
export function categoriesForSource(source) {
  return source === "yelp" ? ["food", "nightlife"] : null;
}

// v9.1 (2026-09-07) — WIKIPEDIA ELIGIBILITY PRE-FILTER. Audit
// (claude/wayfind-AUDIT-wikipedia-enrichment-failure-population-2026-09-07):
// of a 180-row sample of the failing population, 156 (86.7%) are
// independent local businesses that structurally CANNOT have a Wikipedia
// article — asking is the wrong question, not a matcher defect. Measured on
// the same sample: primary_type restricted to the attraction class ALONE
// keeps 30/180 rows and 8/10 achievable correct matches (27% precision);
// adding reviews >= 400 keeps 19/180 (10.6%) and the SAME 8/10 (42%
// precision, ~89% fewer lookups). The two matches this loses (Majordomo,
// Magpie Café) are real notable restaurants outside the attraction class —
// recovered later via an explicit allowlist, per the owner, never by
// loosening this list or CONFIDENCE_FLOOR.
//
// Composes with categoriesForSource() (immediately above) rather than
// fighting it: wf_popularity_stale_batch (see the 2026-09-07 eligibility
// migration) takes p_primary_types/p_min_reviews as TWO MORE optional,
// source-driven restrictions on top of p_categories — both default null (no
// restriction) for every source except wikipedia, so nothing else in this
// file's routing changes.
export const WIKI_ATTRACTION_TYPES = [
  "museum", "art_museum", "history_museum", "zoo", "wildlife_park", "wildlife_refuge", "aquarium",
  "state_park", "national_park", "botanical_garden", "historical_landmark", "landmark", "monument",
  "tourist_attraction", "nature_preserve", "art_gallery", "visitor_center", "amusement_park",
  "amusement_center", "water_park", "library", "university", "stadium", "arena",
  "performing_arts_theater", "beach", "city_park", "castle", "fort", "observatory", "historical_place",
];
export const WIKI_MIN_REVIEWS = 400;

export function primaryTypesForSource(source) {
  return source === "wikipedia" ? WIKI_ATTRACTION_TYPES : null;
}
export function minReviewsForSource(source) {
  return source === "wikipedia" ? WIKI_MIN_REVIEWS : null;
}

// v8.99.15 — YELP KEY FORMAT GUARD (2026-09-06). Production ran 1,014 calls
// this period at 0 successes, every one HTTP 400. Live-probed against the
// REAL production key (a gated diagnostic route, deleted after use — never
// printed): Yelp's own error is
//   "'Bearer [key]' does not match '(?i)^Bearer [A-Za-z0-9\-_]{128}$'"
// The stored YELP_API_KEY is 127 characters — one short of the 128 Yelp's
// Fusion API requires. term/latitude/longitude/radius were never the
// rejected field; nothing about the REQUEST is wrong. This is a corrupted
// credential, not a code bug, and it is not this fetcher's place to paper
// over it — but it also should not keep spending 1,000+ real HTTP round
// trips a period to relearn the same 400. The shape is checked BEFORE the
// call, same "no data, tell me why" contract as no_key, one field over:
// a malformed key gets its own outcome (bad_key_format) instead of an
// indistinguishable http_400, so job-watch names the actual cause instead
// of a request bug that was never there. Once the owner repastes a real
// 128-char key in Vercel, this fetcher needs no further change — the
// request it builds already matches Yelp's current Fusion API exactly.
const YELP_KEY_RE = /^[A-Za-z0-9_-]{128}$/;

// Run once before selecting candidates. Unconfigured/retired providers have
// observed no places, so they must not consume the attempt ledger.
export function popularityAvailability(source, env) {
  if (source === 'tripadvisor') return { ready: false, failure: false, reason: 'retired_sunset_20260831' };
  if (source === 'yelp') {
    const key = String(env.YELP_API_KEY || '').trim();
    if (!key) return { ready: false, failure: false, reason: 'no_key' };
    if (!YELP_KEY_RE.test(key)) return { ready: false, failure: true, reason: 'configuration: bad_key_format' };
  }
  if (source === 'foursquare' && !String(env.FOURSQUARE_API_KEY || '').trim()) return { ready: false, failure: false, reason: 'no_key' };
  return { ready: true };
}

// ── fetchers: each returns {external_id, metric_value, raw, match_confidence} or null ──
export async function fetchYelp(place) {
  const key = (process.env["YELP_API_KEY"] || "").trim();
  if (!key) { notePop("yelp", "no_key"); return null; }
  if (!YELP_KEY_RE.test(key)) { notePop("yelp", "bad_key_format"); return null; }
  const d = await jf(`https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(place.name)}&latitude=${place.lat}&longitude=${place.lng}&radius=1600&limit=3`, { headers: { Authorization: "Bearer " + key } }, "yelp");
  const cands = (d && d.businesses || []).map((b) => ({ id: b.id, name: b.name, lat: b.coordinates && b.coordinates.latitude, lng: b.coordinates && b.coordinates.longitude, reviews: b.review_count }));
  const m = bestMatch(place, cands);
  if (!m || m.cand.reviews == null) { if (d) notePop("yelp", "no_match"); return null; }
  notePop("yelp", "ok");
  return { external_id: m.cand.id, metric_value: m.cand.reviews, raw: { review_count: m.cand.reviews }, match_confidence: m.confidence };
}

export async function fetchFoursquare(place) {
  const key = (process.env["FOURSQUARE_API_KEY"] || "").trim();
  if (!key) { notePop("foursquare", "no_key"); return null; }
  // QUOTA/BILLING BREAKER (2026-09-06) — see FSQ_BREAKER in lib/foursquare.js
  // for the full incident. wf_job_pulse showed this exact fetcher (already on
  // the proven key-prefix chain since #892) taking http_429 on ALL ~30
  // calls/run for 3+ continuous days at unchanged volume — a persistent 429
  // with a verified-valid key names the ACCOUNT's quota/plan as exhausted, not
  // the request rate. Checking first, before spending the 100-place batch's
  // worth of doomed requests, is what saves the ~360/day this cron would
  // otherwise keep burning against a quota that only recovers on its own
  // schedule. Shared with /api/fsq/search and /api/sources/compare: one
  // provider's discovery closes the breaker for all three at once.
  const held = await breakerOpen(FSQ_BREAKER);
  if (held) { notePop("foursquare", (held.kind || "quota") + ": breaker_open"); return null; }
  const q = `query=${encodeURIComponent(place.name)}&ll=${place.lat},${place.lng}&radius=1600&limit=3`;
  // BOTH Foursquare key generations, same proven pattern as /api/fsq/search:
  // legacy v3 (fsq3… keys, plain Authorization) first — SUNSET 2026-05-15,
  // which is exactly why this fetcher produced ZERO rows for months while
  // wikipedia carried the whole table — then the 2025+ Places API (service
  // keys, Bearer + X-Places-Api-Version; no fields param = all plan fields,
  // parsed defensively for either shape).
  // v8.29.14 — the legacy v3 probe now runs ONLY for a legacy key. v3 was sunset
  // 2026-05-15, so for a modern service key this was a guaranteed-dead round trip
  // fired before every real call: 100 places x 12 runs = ~1,200 wasted requests a
  // day to a host that cannot answer. Legacy `fsq3…` keys still get their attempt,
  // because for those it is the only endpoint that ever worked.
  // v8.96 — the host order, headers and key-generation test now live ONCE, in
  // lib/foursquare.js, shared with /api/fsq/search and /api/sources/compare.
  // This fetcher was repaired alone in v8.29.14 (#892) and the repair never
  // reached the two HTTP routes, which stayed blind to the post-sunset 429 for
  // four more months. jf() still runs each attempt so per-generation outcomes
  // keep landing in POP_DIAG and a dead source still names itself.
  let d = null;
  for (const gen of fsqAttemptChain(key)) {
    const { url, init } = fsqRequest(gen, q, key, { fields: "fsq_id,name,geocodes,popularity" });
    // Only the CURRENT generation's status names account health — v3 is
    // PERMANENTLY gone post-sunset and its 429 is that fixed "gone" response,
    // not a quota signal (tripping on it would arm the breaker on every
    // legacy-key call regardless of whether the account can serve current
    // requests). classifyProviderFailure needs message text to recognise
    // "quota" generically; Foursquare's 429 body carries none we have
    // verified, so — exactly like OpenWebNinja's breaker in
    // app/api/events/route.js — a current-generation 429 is treated as
    // deterministic quota exhaustion directly.
    const onFail = gen === "current"
      ? async (status) => { if (status === 429) await tripBreaker(FSQ_BREAKER, classifyProviderFailure(429, "") || "quota", "http 429 on foursquare popularity fetch (current generation) — not retried for " + Math.round(FSQ_BREAKER_COOLDOWN_MS / 60000) + " min", FSQ_BREAKER_COOLDOWN_MS); }
      : null;
    d = await jf(url, init, gen === "v3" ? "foursquare_v3" : "foursquare", onFail);
    if (d) break; // a usable answer ends the chain; ANY failure advances it
  }
  const cands = (d && d.results || []).map((r) => ({
    id: r.fsq_place_id || r.fsq_id,
    name: r.name,
    lat: r.latitude != null ? r.latitude : r.geocodes && r.geocodes.main && r.geocodes.main.latitude,
    lng: r.longitude != null ? r.longitude : r.geocodes && r.geocodes.main && r.geocodes.main.longitude,
    popularity: r.popularity,
  }));
  const m = bestMatch(place, cands);
  if (!m || typeof m.cand.popularity !== "number") { if (d) notePop("foursquare", m ? "no_field" : "no_match"); return null; } // field is tier-gated: absent -> no row, never derived
  notePop("foursquare", "ok");
  return { external_id: m.cand.id, metric_value: m.cand.popularity, raw: { popularity: m.cand.popularity }, match_confidence: m.confidence };
}

// v8.99.15 — TRIPADVISOR RETIRED (2026-09-06). The v8.29.14 fix above added the
// Referer/Origin headers TripAdvisor's IP/domain-restriction doc calls for.
// Production still ran 480 calls this period at 0 successes, 100% http_403.
// Live-probed against the REAL production key (a gated diagnostic route,
// deleted after use — never printed): the Content API returns the BYTE-
// IDENTICAL 403 body, "User is not authorized to access this resource with
// an explicit deny in an identity-based policy", WITH the headers and
// WITHOUT them — ruling out headers, referer and domain restriction as the
// cause, since changing them changed nothing.
//
// TripAdvisor's own migration docs (docs.terra.tripadvisor.com/docs/faq,
// checked 2026-09-06) say why: the legacy Content API this fetcher calls
// (api.content.tripadvisor.com, ?key= query-param auth) "will be sunset and
// API keys deprecated on August 31, 2026" — six days before this
// measurement — and moving to its replacement (Terra) means opening a NEW
// account; "your existing Content API account and key will not be
// associated with the new one." An "explicit deny" on a deprecated key on a
// sunset host is not a header problem headers can fix.
//
// So this is retired, not left spinning: no request leaves this process,
// and the outcome is named for what it is, not folded into a generic
// no_match/no_key. Reviving TripAdvisor needs a NEW Terra account (a plan
// decision — Terra's free tier is 1,000 calls/mo vs the old 5,000) and a
// rewritten fetcher: Terra authenticates via an `X-API-KEY` header instead
// of a `?key=` param, on a different host, with a different response shape
// (docs.terra.tripadvisor.com/reference). Left for the owner to decide —
// not attempted blind, without real Terra credentials to verify against.
export async function fetchTripadvisor() {
  notePop("tripadvisor", "retired_sunset_20260831");
  return null;
}

const WIKI_UA = { headers: { "user-agent": "WayfindBot/1.0 (https://www.gowayfind.com; hello@gowayfind.com)", "api-user-agent": "WayfindBot/1.0 (https://www.gowayfind.com; hello@gowayfind.com)" } };

// v8.99.15 — QUALIFIER STRIPPING (2026-09-06). Measured against production
// telemetry (2,394/2,400 wikipedia attempts this period landed no_match) and
// a live sample pulled from wf_popularity_stale_batch: MediaWiki's opensearch
// is prefix-oriented — a query carrying ANY trailing qualifier word the real
// title doesn't have returns an EMPTY result set, not a fuzzy near-match.
// wf_inventory names commonly carry exactly that qualifier, live-verified
// (2026-09-06) to return ZERO candidates as stored, and a correct, sim=1.00
// match the moment the qualifier is removed:
//   "Museum of Illusions - Las Vegas"                  -> "Museum of Illusions"
//   "Shark Reef Aquarium at Mandalay Bay"               -> "Shark Reef Aquarium"
//   "Harrah's Pompano Beach - A Caesars Rewards ..."    -> "Harrah's Pompano Beach"
// This never invents a match: stripping only ever removes TRAILING text, so
// the query is always a prefix of the real name, and a false strip can at
// worst still find nothing — confirmed live: "Puttshack - Dania Beach"
// strips to "Puttshack" and correctly still finds no article (no chain-wide
// page exists), rather than matching something wrong.
//
// Known limitation, not fixed here: a chain business whose OWN name (not
// just the qualifier) matches a chain-wide Wikipedia article — e.g. "Crunch
// Fitness - Pompano Beach" strips to "Crunch Fitness" and matches the
// company's page — gets that brand's national pageviews, not a signal
// specific to this one location. This is the same name-identity tradeoff
// every fetcher in this file already accepts at CONFIDENCE_FLOOR (nothing
// here stores a street address to disambiguate a branch from its brand);
// it is not a new risk this change introduces.
function stripWikiQualifier(name) {
  let n = String(name || "");
  n = n.replace(/\s*\([^)]*\)\s*$/, ""); // trailing "(...)"
  n = n.replace(/,\s*[A-Za-z .]{2,25}$/, ""); // trailing ", City[, ST]"
  n = n.replace(/\s+-\s+.+$/, ""); // trailing " - qualifier"
  n = n.replace(/\s+at\s+.+$/i, ""); // trailing " at venue"
  return n.trim();
}

// v8.99.15 — score every candidate, not just index 0. yelp/foursquare/
// tripadvisor already run every candidate through matchConfidence and keep
// the best (bestMatch, above); this fetcher took opensearch's first result
// unconditionally, on the unstated assumption its top hit is always the
// right one. opensearch's own ranking is not a confidence signal — nameSim
// against OUR place name is the only one this module trusts anywhere else,
// so it is applied here too. limit=5 costs nothing extra (still one call);
// it only gives this a fair set to choose from.
function bestWikiTitle(query, titles) {
  let best = null, bestSim = 0;
  for (const t of titles || []) {
    const sim = nameSim(query, t);
    if (sim > bestSim) { bestSim = sim; best = t; }
  }
  return best && bestSim >= CONFIDENCE_FLOOR ? { title: best, sim: bestSim } : null;
}

async function wikiOpensearch(q) {
  return jf(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=5&namespace=0&format=json&origin=*`, WIKI_UA, "wikipedia");
}

// v9.1 (2026-09-07) — IDENTITY VERIFICATION. Owner: "title similarity is not
// entity identity. An exact title match like June, Petrichor or Annapurna
// cannot automatically become confidence 1.0." Audit
// (claude/wayfind-AUDIT-wikipedia-enrichment-failure-population-2026-09-07):
// of 61 matches a deliberately loose matcher accepted, only 10 were the
// correct venue — 7 were the national chain, 7 were disambiguation pages,
// 37 were flat wrong (The Drunken Clam -> Quahog (Family Guy); House of
// Lasagna -> House of Lusignan, a medieval dynasty; Cafe Sorella -> Cape
// Sorell, a Tasmanian headland). Junk to signal, 4.4 to 1. Lowering
// CONFIDENCE_FLOOR is explicitly NOT the fix — of 4 candidates the current
// 0.55 floor rejected, all 4 were correct rejections, and loosening the
// audit's matcher below it is what produced the 4.4:1 ratio above. These
// checks run in ADDITION to the floor, on every candidate that already
// cleared it, using ONE extra MediaWiki call (pageprops + coordinates +
// categories + a short extract, redirects auto-resolved):
//
//   1. disambiguation — action=query&prop=pageprops carries a
//      `disambiguation` key on a disambig page (mechanically detectable,
//      7/61 accepted were exactly this).
//   2. redirect-target similarity — MediaWiki silently resolves a redirect
//      before this call ever sees it; if it did, the RESOLVED title must
//      still clear nameSim() against our place name, at the same floor.
//      14/61 accepted involved a redirect and "mostly resolved away from
//      the subject" (Cali Coffee -> Kopi luwak, nameSim 0; Predalina ->
//      Xenomorph, nameSim 0) — a redirect is a hazard, never itself a
//      confidence signal.
//   3. chain-brand — Wikidata's own short description (pageprops
//      wikibase-shortdesc) or the page's categories say "chain"/
//      "franchise" (Panera Bread: "American restaurant chain"; Ross
//      Stores/dd's DISCOUNTS: "American chain of discount department
//      stores", live-verified 2026-09-07). A national article gives NO
//      signal about ONE outlet, and its pageviews would swamp a real local
//      one — SUPPRESSED the same way a missing field already is elsewhere
//      in this file: no row, not a wrong one.
//   4. geographic agreement — action=query&prop=coordinates, when Wikipedia
//      carries them. wf_inventory holds lat/lng for every place; an article
//      whose coordinates are farther than WIKI_GEO_GATE_MI from the venue is
//      not that venue (Annapurna: real coordinates, ~7,800 miles from every
//      venue it matched). WIKI_GEO_GATE_MI mirrors the existing 80-mile geo
//      gate at app/guides/[slug]/page.js (guide-card resolution) — the same
//      precedent radius for "is this even the same place", not a new
//      invented number.
//   5. place-type evidence (only when Wikipedia has NO coordinates) —
//      require a POSITIVE signal the article is about a place at all:
//      WIKI_PLACE_TYPE_RE against the short description or non-maintenance
//      categories. A pure name match with neither coordinates nor a
//      place-type signal is precisely the owner's stated failure mode
//      (Petrichor: no coordinates, categories are "Olfaction"/"Rain"/
//      "Soil" — no place evidence anywhere) and is rejected regardless of
//      string similarity.
//
// Re-audited against the stored population this same session (413 wikipedia
// rows): running every ORIGINALLY-STORED match through these checks live,
// 177 (42.9%) still pass, 236 fail — disambiguation 49, redirect_unrelated
// 58, chain_brand 40, geo_mismatch 34, no_place_evidence 55. All 22 rows
// quarantined by 20260907_wf_wikipedia_popularity_quarantine.sql fail at
// least one of these checks, 22/22 — the mechanical quarantine predicate and
// these per-fetch checks agree independently.
const WIKI_GEO_GATE_MI = 80; // precedent: app/guides/[slug]/page.js guide-card resolution

const WIKI_CHAIN_RE = /\bchain(s)?\b|\bfranchise[sd]?\b/i;

// Wikipedia maintenance/quality-tracking categories ("...stubs", "Pages
// using...", "CS1 errors...") carry incidental English words that collide
// with WIKI_PLACE_TYPE_RE — live-caught in this same audit: "theatre"
// inside "2010s play (theatre) stubs" nearly passed an Australian PLAY
// (Angela's Kitchen) as a place. Filtered out before the place-type check;
// genuine topical categories ("Museums in...", "Beer brewing companies
// based in...") are unaffected.
const WIKI_MAINTENANCE_CATEGORY_RE = /stub|pages using|cs1 |wikipedia article|webarchive|use \w+ (english|dates|mdy)|all articles/i;

// Nouns overwhelmingly place-referring in a Wikidata short description or
// Wikipedia category ("Zoo in San Diego...", "Museums in Yakima County...").
// Deliberately excludes ambiguous common-English words that produced a real
// false positive during this audit (bare "falls"/"hall"/"center"/"market"/
// "structure" all matched ordinary sentences, not places — see git history
// of this constant's authoring session, 2026-09-07, for the caught case).
// v9.1.1 (2026-09-07) — PLURAL CATEGORY NAMES. First cut of this regex
// required an exact singular \b...\b match, so it silently missed the
// standard Wikipedia category-naming convention ("Museums in Yakima
// County, Washington", "Zoos in X", "Observatories in Y") — \bmuseum\b
// cannot match "Museums" (no boundary between the "m" and the following
// "s"). Caught by this fix's own guard (check-wikipedia-identity-
// verification.mjs) failing its Yakima Valley Museum positive control.
// This under-covered legitimate no-coordinate matches (a false NEGATIVE,
// never a false positive — it could only make this check stricter, never
// looser), but is fixed properly rather than left as an accepted gap.
// Regular "+s"/"+es" plurals get an optional suffix; the four nouns that
// pluralize irregularly (observatory/cemetery/aviary/conservatory,
// y->ies; college campus -> campuses) are spelled out explicitly.
const WIKI_PLACE_TYPE_RE = /\b(museums?|zoos?|aquariums?|beaches?|landmarks?|monuments?|theatres?|theaters?|parks?|gardens?|stadiums?|arenas?|preserves?|refuges?|sanctuar(?:y|ies)|attractions?|recreation areas?|historic (?:sites?|landmarks?|districts?|houses?|places?)|historical (?:sites?|landmarks?|districts?)|hotels?|resorts?|restaurants?|caf[eé]s?|brewer(?:y|ies)|marinas?|winer(?:y|ies)|distiller(?:y|ies)|universit(?:y|ies)|college campus(?:es)?|observator(?:y|ies)|amusement parks?|water parks?|wildlife|shopping malls?|forts?|plantations?|piers?|boardwalks?|lighthouses?|memorials?|palaces?|castles?|fairgrounds?|cemeter(?:y|ies)|planetariums?|stepwells?|caverns?|cave systems?|visitor centers?|squares?|plazas?|shipwrecks?|aviar(?:y|ies)|arboretums?|conservator(?:y|ies))\b/i;

async function wikiPageInfo(title) {
  return jf(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops%7Ccoordinates%7Ccategories%7Cextracts&clshow=%21hidden&cllimit=50&exintro=1&explaintext=1&exsentences=2&redirects=1&titles=${encodeURIComponent(title)}&origin=*`, WIKI_UA, "wikipedia");
}

// Pure decision logic, separated from the fetch above so it can be unit
// tested against fixtures without a network call (see
// scripts/check-wikipedia-identity-verification.mjs).
export function verifyWikiIdentity(place, queryTitle, page, wasRedirected) {
  if (!page || page.missing != null) return { ok: false, reason: "missing_page" };
  const finalTitle = page.title || queryTitle;
  if (wasRedirected) {
    const rsim = nameSim(place.name, finalTitle);
    if (rsim < CONFIDENCE_FLOOR) return { ok: false, reason: "redirect_unrelated", finalTitle };
  }
  const pageprops = page.pageprops || {};
  if (Object.prototype.hasOwnProperty.call(pageprops, "disambiguation")) return { ok: false, reason: "disambiguation", finalTitle };
  const shortdesc = pageprops["wikibase-shortdesc"] || "";
  const extract = page.extract || "";
  const cats = (page.categories || []).map((c) => c.title).filter((t) => !WIKI_MAINTENANCE_CATEGORY_RE.test(t));
  const catstr = cats.join(" | ");
  if (WIKI_CHAIN_RE.test(shortdesc) || WIKI_CHAIN_RE.test(extract.slice(0, 200)) || WIKI_CHAIN_RE.test(catstr)) {
    return { ok: false, reason: "chain_brand", finalTitle };
  }
  const coords = page.coordinates;
  if (coords && coords[0] && coords[0].lat != null && coords[0].lon != null) {
    const dist = distMi(place.lat, place.lng, coords[0].lat, coords[0].lon);
    if (dist > WIKI_GEO_GATE_MI) return { ok: false, reason: "geo_mismatch", finalTitle, dist };
    return { ok: true, finalTitle };
  }
  if (WIKI_PLACE_TYPE_RE.test(shortdesc) || WIKI_PLACE_TYPE_RE.test(catstr)) {
    return { ok: true, finalTitle };
  }
  return { ok: false, reason: "no_place_evidence", finalTitle };
}

export async function fetchWikipedia(place) {
  // keyless: find the article, sum 30 days of pageviews
  // Wikimedia's API policy requires a descriptive User-Agent; datacenter IPs
  // (Vercel) without one get rejected — the silent 0/50 in the first prod
  // harvest. Local runs passed because residential IPs are exempt in practice.
  const s1 = await wikiOpensearch(place.name);
  let m = bestWikiTitle(place.name, s1 && s1[1]);
  let s2 = null;
  if (!m) {
    const stripped = stripWikiQualifier(place.name);
    if (stripped && stripped.toLowerCase() !== place.name.toLowerCase()) {
      s2 = await wikiOpensearch(stripped);
      m = bestWikiTitle(stripped, s2 && s2[1]);
    }
  }
  // v8.29.14 — WIKIPEDIA NEVER INSTRUMENTED ITSELF. Every other fetcher calls
  // notePop; this one called it nowhere, so the cron pulsed
  // popularity:wikipedia as attempted=2400 succeeded=0 note=null and job-watch
  // read the ONLY WORKING SOURCE as a dead one. Ground truth on 2026-08-21:
  // wf_place_popularity holds 268 wikipedia rows, 115 of them in the last seven
  // days, newest that morning — while yelp, foursquare and tripadvisor have
  // written ZERO rows ever. The alarm was pointed at the survivor.
  if (!m) { if (s1 || s2) notePop("wikipedia", "no_match"); return null; }

  // v9.1 (2026-09-07) — IDENTITY VERIFICATION runs BEFORE the pageviews call
  // (see the long comment above verifyWikiIdentity for the evidence): a
  // candidate that clears the name-similarity floor is not yet proven to be
  // the SAME entity, so nothing is stored — and no pageviews call is even
  // spent — until it clears disambiguation/redirect/chain-brand/geo/
  // place-type too. finalTitle may differ from m.title when MediaWiki
  // silently resolved a redirect; the pageviews call below uses finalTitle
  // so a redirect stub's near-zero own view count never masks the real
  // target's, and external_id records the entity actually verified.
  const info = await wikiPageInfo(m.title);
  const infoPages = info && info.query && info.query.pages;
  const page = infoPages && Object.values(infoPages)[0];
  const wasRedirected = !!(info && info.query && info.query.redirects && info.query.redirects.length);
  const verified = verifyWikiIdentity(place, m.title, page, wasRedirected);
  if (!verified.ok) { if (info) notePop("wikipedia", "identity_" + verified.reason); return null; }
  const title = verified.finalTitle;

  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 30);
  const fmt = (dt) => dt.toISOString().slice(0, 10).replace(/-/g, "");
  const pv = await jf(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, "_"))}/daily/${fmt(start)}/${fmt(end)}`, WIKI_UA, "wikipedia");
  const total = (pv && pv.items || []).reduce((a, x) => a + (x.views || 0), 0);
  if (!total) { notePop("wikipedia", "no_views"); return null; }
  notePop("wikipedia", "ok");
  return { external_id: title, metric_value: total, raw: { pageviews_30d: total }, match_confidence: Math.round(m.sim * 100) / 100 };
}

export const FETCHERS = { yelp: fetchYelp, foursquare: fetchFoursquare, tripadvisor: fetchTripadvisor, wikipedia: fetchWikipedia };
