// lib/ownedHotelIdentity.js — GOOGLE IDENTITY BACKFILL for owned hotels with
// no place id (2026-09-22).
//
// WHY THIS EXISTS. lib/ownedHotels.json holds 452 lodging properties; only 77
// carry a Google place id (gpid). lib/hotelImage.js (owned by another lane,
// never touched here) refuses to show a photo for a property it cannot
// identify — it never guesses a Google place by name alone — so 199 hotel
// cards were found showing the branded fallback in production. Matching the
// other 353 against our own wf_inventory found only 4 usable hits, so a
// Google lookup is the only path left, and it must be FREE:
//
//   - Text Search Essentials (IDs Only), field mask exactly `places.id`, has
//     an UNLIMITED free monthly allowance (verified against Google's pricing
//     pages 2026-09-22).
//   - Place Details Essentials (fields location, formattedAddress, types)
//     costs $5/1000 with a 10,000/month free allowance the project was not
//     otherwise using — a few hundred calls a month is $0. Google bills a
//     request at its HIGHEST field tier, so this mask must never carry a Pro
//     field (displayName, businessStatus, primaryType are Pro) — do not widen
//     DETAILS_FIELD_MASK without an explicit owner spend decision, the same
//     rule lib/placeDetails.js's FIELDS comment already keeps.
//
// OFF BY DEFAULT. The whole backfill runs only when
// process.env.WAYFIND_HOTEL_IDENTITY === "1" (see ownedHotelIdentityEnabled /
// runOwnedHotelIdentityIfEnabled below). With the flag unset, zero counts are
// returned and NO network call is made — not the ledger, not Google, nothing.
//
// SPEND METERING. Per lib/promoteThrottle.js's own established pattern ("the
// route and the worker BOTH ask spendAllowCapped() once per place before the
// Details call"), THE CALLER takes the ledger grant, not the fetcher: a
// search or a details fetch happens only after allowSearch()/allowDetails()
// (wrapping lib/spendGate.js's spendAllowCapped with the "text_ids_only" /
// "details_essentials" SKUs) has already said yes. Splitting grant-taking
// from the network call this way means one HTTP round trip never takes two
// ledger grants, and it makes the pure runner's searchDenied/detailsDenied
// counts exact and fully hermetic (no fake ledger needed to test denial
// handling — inject `allowSearch: async () => false` and a `searchIds` that
// throws if ever called; the red-proof is built into the test).
//
// PURE, INJECTABLE CORE. runOwnedHotelIdentityBackfill takes every
// dependency — the clock, the row list, the two Google callers, the two
// spend gates, the marker cache reads/writes — as a parameter. It has no
// top-level side effects and never imports next/server. The module-level
// defaults below (defaultSearchIds, defaultPlaceDetails, allowSearchIds,
// allowPlaceDetails, defaultReadMark, defaultWriteMark) are the PRODUCTION
// wiring, used only by runOwnedHotelIdentityIfEnabled, which the cron route
// calls; scripts/test-owned-hotel-identity.mjs never touches them.
//
// FAIL CLOSED, NEVER WIDENED. verifyCandidate is deliberately narrow — exact
// distance + type + street-number rules, never loosened to raise the hit
// rate — and the file logs no place id, photo ref, URL with a key, or
// Google error text anywhere. Counts, never content.
//
// MARKERS. lib/serverCache's shared cache (same style as lib/photoWarm.js's
// warm markers), key `hotelid|<slug>` -> { gpid, at }, kept 365 days (Google's
// ToS allows keeping a place id indefinitely — this is the ONLY field this
// module ever caches beyond the general 30-day content limit, and it is the
// ONLY field this module ever caches at all: no name, address, types, or
// photo ref rides along), and a miss marker `hotelidmiss|<slug>` kept 14 days
// so a stubborn row is not re-queried every run.

import { readFileSync } from "node:fs";
import path from "node:path";
import { cget, cgetMany, cset, DAY } from "./serverCache.js";
import { spendAllowCapped, gateShut } from "./spendGate.js";
import { fetchDeadline, NET_DEADLINE_MS } from "./fetchDeadline.js";

// Read via fs, not a static `import ... from "./ownedHotels.json"` — same
// pattern lib/atlasPlaceAllowlist.js uses ("Literal paths so Next's file
// tracer ... keep the files in the serverless bundle"), and it is what lets a
// plain-node guard (scripts/test-owned-hotel-identity.mjs) import this whole
// module directly: a bare ESM JSON import needs an explicit `with { type:
// "json" }` attribute the rest of this codebase's guard tooling does not
// carry. Lazy (module load must have no side effects that can throw) and
// memoized so a hot lambda does not re-read the file every call.
const OWNED_HOTELS_FILE = path.resolve(process.cwd(), "lib/ownedHotels.json");
let _ownedHotelsRows = null;
function ownedHotelsRows() {
  if (_ownedHotelsRows) return _ownedHotelsRows;
  try {
    const data = JSON.parse(readFileSync(OWNED_HOTELS_FILE, "utf8"));
    _ownedHotelsRows = Array.isArray(data) ? data : [];
  } catch { _ownedHotelsRows = []; }
  return _ownedHotelsRows;
}

// ── junk filter — MUST mirror lib/hotels.js's isJunkHotel exactly (that file
// is owned by another lane and is not imported here to avoid coupling this
// pure module to its React/rendering-adjacent exports). ~10% of the ingested
// list is not a bookable hotel — a bare street address used as a name, or a
// vacation-rental listing — and those rows are excluded from the backfill the
// same way lib/hotels.js excludes them from what is served. ────────────────
function isJunkOwnedHotel(h) {
  const n = ((h && h.name) || "").trim();
  if (!n) return true;
  if (/^\d+\s+[A-Za-z]/.test(n)) return true; // name is a bare street address
  return /\bvacation rental|\brentals\b|\bby owner\b|redawning/i.test(n);
}

/** The owned rows with no Google place id yet, junk excluded. Pure. */
export function unresolvedOwnedHotels(list) {
  return (Array.isArray(list) ? list : []).filter((h) => h && !h.gpid && !isJunkOwnedHotel(h));
}

// ── identity query — "<name>, <address>, <city> FL" built from the row's own
// fields only (never widened with guessed data). ───────────────────────────
export function identityQuery(row) {
  const name = String((row && row.name) || "").trim();
  const address = String((row && row.address) || "").trim();
  const city = String((row && row.city) || "").trim();
  const parts = [name];
  if (address) parts.push(address);
  parts.push(city ? `${city} FL` : "FL");
  return parts.filter(Boolean).join(", ");
}

// ── verifyCandidate — the fail-closed rule. Never widen this to resolve a
// stubborn row. ─────────────────────────────────────────────────────────────
export const VERIFY_DISTANCE_M = 200;
// Lodging types only. `campground` is deliberately NOT in this set — a
// campground is not a hotel card and must never verify one.
export const ACCEPTED_LODGING_TYPES = new Set([
  "lodging", "hotel", "motel", "resort_hotel", "bed_and_breakfast",
  "guest_house", "extended_stay_hotel", "inn",
]);
const EARTH_RADIUS_M = 6371000;
function haversineMeters(lat1, lng1, lat2, lng2) {
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
function leadingStreetNumber(s) {
  const m = /^\s*(\d+)/.exec(String(s || ""));
  return m ? m[1] : null;
}

/**
 * true ONLY when ALL hold:
 *   - details carries a location within VERIFY_DISTANCE_M of the row's own lat/lng
 *   - details.types includes at least one accepted lodging type
 *   - when the row's own address has a leading street number, details'
 *     formattedAddress leading street number matches it exactly
 * Missing location or empty types fail closed (false), never treated as a pass.
 */
export function verifyCandidate(row, details) {
  if (!row || !details) return false;
  const loc = details.location;
  if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return false;
  const rowLat = Number(row.lat), rowLng = Number(row.lng);
  if (!Number.isFinite(rowLat) || !Number.isFinite(rowLng)) return false;
  const distM = haversineMeters(rowLat, rowLng, loc.latitude, loc.longitude);
  if (!(distM <= VERIFY_DISTANCE_M)) return false;
  const types = Array.isArray(details.types) ? details.types : [];
  if (!types.length) return false;
  if (!types.some((t) => ACCEPTED_LODGING_TYPES.has(t))) return false;
  const rowNum = leadingStreetNumber(row.address);
  if (rowNum) {
    const detNum = leadingStreetNumber(details.formattedAddress);
    if (detNum !== rowNum) return false;
  }
  return true;
}

// ── marker keys — same shared cache lib/photoWarm.js's warm markers use. ───
export const MARK_PREFIX_GPID = "hotelid|";
export const MARK_PREFIX_MISS = "hotelidmiss|";
export const MARK_TTL_MS_GPID = 365 * DAY; // Google ToS: a place id may be kept indefinitely
export const MARK_TTL_MS_MISS = 14 * DAY;  // a stubborn row is retried, not queried every run
function slugify(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
}
/** Same id formula lib/hotels.js's toPlace() uses, so a marker keys off the exact card id. */
export function ownedRowKey(row) {
  const lat = Number(row && row.lat);
  const suffix = Number.isFinite(lat) ? Math.round(lat * 1000) : 0;
  return "wfh-" + slugify(row && row.name) + "-" + suffix;
}

// ── the pure, injectable runner ─────────────────────────────────────────────
export const DEFAULT_IDENTITY_LIMIT = 12;
export const DEFAULT_IDENTITY_DEADLINE_MS = 8000;
export const SEARCH_RADIUS_M = 200;
// THE BIAS RADIUS IS NOT THE MATCH RADIUS (2026-09-22, same day, caught on the
// live pulse: "ident: tried=9 ok=0 miss=9" on every run). The first version
// sent the 200 m circle as `locationRestriction`, which Text Search (New)
// accepts ONLY as a rectangle and ONLY for categorical queries — so every
// request was rejected, every row came back a miss, and the 14-day miss marker
// then hid the rows from the next run. Google's own wording: locationBias
// "Specify the region as a rectangular Viewport or as a circle"; the
// restriction field takes a Viewport. So the circle is a BIAS now, wide enough
// (1.5 km) that Google will actually return the property, and correctness is
// enforced where it always was: verifyCandidate's 200 m + lodging-type +
// street-number check on the Details answer. Widening the bias can never
// loosen the match.
export const SEARCH_BIAS_RADIUS_M = 1500;
export const SEARCH_MAX_RESULT_COUNT = 3;

const ZERO_COUNTS = Object.freeze({ attempted: 0, resolved: 0, missed: 0, skipped: 0, searchDenied: 0, detailsDenied: 0 });

/**
 * One bounded backfill pass. Every dependency is injected so tests are
 * hermetic. Stops at `limit` attempts or `deadlineAt`, whichever comes
 * first; a denied spend gate (allowSearch/allowDetails returning false)
 * stops the WHOLE run cleanly (never throws) rather than hammering an
 * exhausted ledger row by row — the same "stop immediately" posture
 * lib/photoWarm.js's PAUSE_REASONS uses.
 *
 * @returns {{attempted:number, resolved:number, missed:number, skipped:number,
 *   searchDenied:number, detailsDenied:number}}
 */
export async function runOwnedHotelIdentityBackfill({
  limit = DEFAULT_IDENTITY_LIMIT,
  deadlineAt = Date.now() + DEFAULT_IDENTITY_DEADLINE_MS,
  now = Date.now,
  rows = [],
  searchIds,
  placeDetails,
  readMark,
  readMarks = null,
  writeMark,
  allowSearch = async () => true,
  allowDetails = async () => true,
} = {}) {
  const counts = { ...ZERO_COUNTS };
  const safeLimit = Math.max(0, Number(limit) || 0);
  const candidates = unresolvedOwnedHotels(rows);

  // PREFETCH EVERY MARKER FIRST (2026-09-22). See defaultReadMarks: reading
  // them one row at a time spent the entire 8s budget walking past hotels that
  // were already done. When no batch reader is supplied (older callers, and
  // the tests that exercise a single-row reader on purpose) the loop below
  // falls back to the per-row reads, so behaviour is identical either way.
  let marks = null;
  if (typeof readMarks === "function") {
    const wanted = [];
    for (const row of candidates) {
      const k = ownedRowKey(row);
      wanted.push(MARK_PREFIX_GPID + k, MARK_PREFIX_MISS + k);
    }
    try { marks = await readMarks(wanted); } catch { marks = null; }
    if (!(marks instanceof Map)) marks = null;
  }

  for (const row of candidates) {
    if (now() >= deadlineAt) break;
    if (counts.attempted >= safeLimit) break;

    const key = ownedRowKey(row);
    const gpidKey = MARK_PREFIX_GPID + key;
    const missKey = MARK_PREFIX_MISS + key;

    let already = null;
    if (marks) already = marks.get(gpidKey) || null;
    else { try { already = await readMark(gpidKey); } catch { already = null; } }
    if (already && already.gpid) { counts.skipped++; continue; }

    let miss = null;
    if (marks) miss = marks.get(missKey) || null;
    else { try { miss = await readMark(missKey); } catch { miss = null; } }
    if (miss) { counts.skipped++; continue; }

    counts.attempted++;

    let permitSearch = false;
    try { permitSearch = await allowSearch(); } catch { permitSearch = false; }
    if (!permitSearch) { counts.searchDenied++; break; } // ledger said no: stop the whole run, never retry-hammer

    let ids = [];
    try { ids = (await searchIds(identityQuery(row), row)) || []; } catch { ids = []; }
    if (!Array.isArray(ids)) ids = [];

    let winner = null;
    let stoppedOnDenial = false;
    for (const id of ids.slice(0, SEARCH_MAX_RESULT_COUNT)) {
      if (!id) continue;
      let permitDetails = false;
      try { permitDetails = await allowDetails(); } catch { permitDetails = false; }
      if (!permitDetails) { counts.detailsDenied++; stoppedOnDenial = true; break; }
      let details = null;
      try { details = await placeDetails(id); } catch { details = null; }
      if (details && verifyCandidate(row, details)) { winner = id; break; }
    }
    if (stoppedOnDenial) break; // never write a marker for a row we couldn't fully evaluate

    if (winner) {
      counts.resolved++;
      try { await writeMark(gpidKey, { gpid: winner, at: now() }, MARK_TTL_MS_GPID); } catch { /* best effort */ }
    } else {
      counts.missed++;
      try { await writeMark(missKey, { at: now() }, MARK_TTL_MS_MISS); } catch { /* best effort */ }
    }
  }

  return counts;
}

// ── production wiring: the real network callers + real gates ───────────────
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL_BASE = "https://places.googleapis.com/v1/places/";
const SEARCH_FIELD_MASK = "places.id";
const DETAILS_FIELD_MASK = "id,location,formattedAddress,types";
// Mirrors lib/spendGate.js's CAPS.text_ids_only / CAPS.details_essentials —
// kept in sync by hand since CAPS itself is not exported; both are safety
// rails under Google's published free allowances, not verified paid-tier lines.
const TEXT_IDS_ONLY_CAP = 9500;
const DETAILS_ESSENTIALS_CAP = 1500;

/** One atomic ledger grant for one Text Search (IDs Only) call. */
export async function allowSearchIds() {
  // THE KILL SWITCH COMES FIRST (2026-09-22). WAYFIND_GATE=shut is the owner's
  // one-flip "stop calling Google at all" control, and it has to mean that even
  // for a SKU that is free today: a free allowance is free only until it is
  // exhausted, and a backfill loop is exactly the shape of thing that would
  // keep running past it. Asking the ledger first would also count a grant the
  // caller can no longer spend. scripts/check-spend-guard.mjs enforces that
  // every file reaching places.googleapis.com honours this.
  if (gateShut()) return false;
  return await spendAllowCapped("text_ids_only", TEXT_IDS_ONLY_CAP);
}
/** One atomic ledger grant for one Place Details (Essentials) call. */
export async function allowPlaceDetails() {
  if (gateShut()) return false; // same kill switch, same reason as above
  return await spendAllowCapped("details_essentials", DETAILS_ESSENTIALS_CAP);
}

// fetchGoogle — never retries more than once, and only on a network error or
// a 5xx; a 4xx/429 is treated as empty immediately (retrying a rate limit or
// a bad request only spends more of the free allowance for no benefit).
async function fetchGoogle(url, init) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await fetchDeadline(url, init, NET_DEADLINE_MS);
    } catch {
      if (attempt === 0) continue;
      return null;
    }
    if (r.ok) return r;
    if (r.status >= 500 && attempt === 0) continue;
    return null;
  }
  return null;
}

/**
 * Text Search Essentials (IDs Only). Assumes the caller already took the
 * ledger grant (allowSearchIds) — this function performs no gating itself,
 * so one HTTP call never takes two grants. Never logs the query, the ids, or
 * any Google error text.
 */
export async function defaultSearchIds(query, row) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return [];
  const body = { textQuery: String(query || ""), maxResultCount: SEARCH_MAX_RESULT_COUNT };
  const lat = Number(row && row.lat), lng = Number(row && row.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: SEARCH_BIAS_RADIUS_M } };
  }
  const r = await fetchGoogle(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": SEARCH_FIELD_MASK },
    body: JSON.stringify(body),
  });
  if (!r) return [];
  let json;
  try { json = await r.json(); } catch { return []; }
  const places = Array.isArray(json && json.places) ? json.places : [];
  return places.map((p) => p && p.id).filter(Boolean);
}

/**
 * Place Details Essentials IDs. Assumes the caller already took the ledger
 * grant (allowPlaceDetails). Field mask is exactly id,location,
 * formattedAddress,types — never widen it to a Pro field (see this file's
 * header) or every call bills at Google's top SKU.
 */
export async function defaultPlaceDetails(id) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || !id) return null;
  const r = await fetchGoogle(DETAILS_URL_BASE + encodeURIComponent(id), {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  });
  if (!r) return null;
  try { return await r.json(); } catch { return null; }
}

/**
 * Read every marker for this run in ONE round trip (2026-09-22, second day).
 * The row-at-a-time reader cost TWO network reads per already-finished hotel
 * BEFORE the run could reach an unfinished one, and the run has only eight
 * seconds. With markers accumulating at the front of the list, throughput was
 * collapsing toward zero: the live pulse showed `ident: tried=0` on runs that
 * spent their whole budget reading markers for rows that were already done.
 * One batched read makes skipping a finished row free, so the budget is spent
 * on hotels that still need an answer. Chunked by URL LENGTH, not key count,
 * for the same reason lib/photoWarm.js chunks that way: cgetMany puts every
 * key in one PostgREST `k=in.(...)` query string and an over-long URL is
 * refused outright, which would look exactly like "no markers exist" and
 * re-ask Google for every row.
 */
const MARK_URL_BUDGET = 6000;
export function chunkMarkKeys(keys, budget = MARK_URL_BUDGET) {
  const chunks = [];
  let cur = [], len = 0;
  for (const k of keys) {
    const cost = encodeURIComponent('"' + String(k).replace(/"/g, '""') + '"').length + 3;
    if (cur.length && len + cost > budget) { chunks.push(cur); cur = []; len = 0; }
    cur.push(k); len += cost;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
async function defaultReadMarks(keys) {
  const out = new Map();
  const chunks = chunkMarkKeys(Array.isArray(keys) ? keys : []);
  for (const chunk of chunks) {
    let hits;
    try { hits = await cgetMany(chunk); } catch { hits = new Map(); }
    for (const k of chunk) {
      const h = hits.get(k);
      if (h && h.v) out.set(k, h.v);
    }
  }
  return out;
}

async function defaultReadMark(key) {
  try {
    const row = await cget(key);
    return row && row.v ? row.v : null;
  } catch { return null; }
}
async function defaultWriteMark(key, value, ttlMs) {
  try { await cset(key, value, ttlMs); } catch { /* best effort, same as lib/photoWarm.js's writeMarker */ }
}

/** true only when the operator has explicitly turned the backfill on. */
export function ownedHotelIdentityEnabled() {
  return process.env.WAYFIND_HOTEL_IDENTITY === "1";
}

/**
 * The entry point the cron route calls. With the flag unset, returns zeroed
 * counts and makes NO network call at all — not even a ledger read. Read at
 * CALL TIME, never cached at module load, same posture as
 * lib/spendGate.js's spendAllowPhotosNonprodBlocked().
 */
export async function runOwnedHotelIdentityIfEnabled(opts = {}) {
  if (!ownedHotelIdentityEnabled()) return { ...ZERO_COUNTS, enabled: false };
  const result = await runOwnedHotelIdentityBackfill({
    rows: ownedHotelsRows(),
    searchIds: defaultSearchIds,
    placeDetails: defaultPlaceDetails,
    readMark: defaultReadMark,
    readMarks: defaultReadMarks,
    writeMark: defaultWriteMark,
    allowSearch: allowSearchIds,
    allowDetails: allowPlaceDetails,
    ...opts,
  });
  return { ...result, enabled: true };
}
