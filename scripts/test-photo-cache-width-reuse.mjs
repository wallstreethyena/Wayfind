#!/usr/bin/env node
// scripts/test-photo-cache-width-reuse.mjs — 800 cards may reuse a fresh
// same-ref 640 cache row. Exact 800 still wins. No fake 800 write, no extra
// Google spend on a warm reuse.
//
// THE LIVE BUG (2026-09-11): cache key is photo|{ref}|{w}. cacheLookup and
// requestedWidths tried [w, 640] only when w < 640, else exact [w]. A warm
// |640 Googleusercontent URI for the same photo ref was ignored when the
// card asked for w=800, so the request fell through to spend or initials.
//
// SPEND EFFICIENCY (2026-09-16, #photo-spend-efficiency): Google Cloud
// metrics showed cards asking for the SAME photo at eight different widths
// (240/280/400/480/600/640/720/800, plus 1200 heroes), each its own paid
// fetch. Two changes on top of the 2026-09-11 fix:
//   - The WRITE side now canonicalizes: any card request <=800 fetches (and
//     caches) at 640 (canonicalPhotoWidth, lib/photoCacheRecovery.js),
//     applied by lib/placePhotoServe.js's remember(). A cold request no
//     longer writes its own exact-width row unless it is a >800 hero.
//   - The READ side (photoCacheCandidateWidths, this file's subject) widened
//     to match: exact, then canonical, then every OTHER common width this
//     codebase has ever written a photo at, so the THOUSANDS of rows already
//     sitting in the cache at the old per-width keys (written before this
//     change) are harvested for free instead of re-fetched. This changes two
//     of this file's own cases from before: case 6 (a fresh 400 row now DOES
//     satisfy an 800 request) and case 7 (a 1200 hero now ALSO gets an
//     800/720/640 fallback, not exact-only) — both updated below, with a
//     negative control alongside each so the new rule is not open-ended.
//
// HERMETIC: injected cache / inventory / fetchOwnedUri / authorizeSpend.
// No live Google, no ledger, no production writes.
import {
  photoCacheKey,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";
import {
  canonicalPhotoWidth,
  photoCacheCandidateWidths,
  selectSamePlaceCachedPhoto,
} from "../lib/photoCacheRecovery.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("photo-cache-width-reuse: FAIL — " + message);
};
const eq = (actual, expected, message) => {
  ok(actual === expected, `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
};

const PLACE = "ChIJWidthReuseTest01";
const REF = `places/${PLACE}/photos/SAMEPHOTOREFAAAA`;
const OTHER_PLACE = "ChIJWidthReuseOther02";
const OTHER_REF = `places/${OTHER_PLACE}/photos/DIFFERENTPHOTOBBBB`;
const URI_640 = "https://lh3.googleusercontent.com/p/width-reuse-640";
const URI_800 = "https://lh3.googleusercontent.com/p/width-reuse-800";
const URI_400 = "https://lh3.googleusercontent.com/p/width-reuse-400";
const URI_OTHER = "https://lh3.googleusercontent.com/p/width-reuse-other-ref";
const NOW = Date.parse("2026-09-11T18:00:00.000Z");
const FRESH_EXP = new Date(NOW + 10 * 86400000).toISOString();
const STALE_EXP = new Date(NOW - 86400000).toISOString();
const FRESH_EXP_MS = Date.parse(FRESH_EXP);

function cacheFromMap(map, { now = Date.now() } = {}) {
  const reads = [];
  const fn = async (key) => {
    reads.push(key);
    const hit = map[key];
    if (!hit) return null;
    if (hit.expMs != null && hit.expMs <= now) return null;
    return { uri: hit.uri };
  };
  fn.reads = reads;
  return fn;
}

function tracker() {
  const state = {
    authorize: 0,
    fetchOwned: 0,
    cacheWrites: 0,
    writtenKeys: [],
    inventory: 0,
  };
  const deps = {
    cacheSet: async (key) => {
      state.cacheWrites++;
      state.writtenKeys.push(key);
    },
    inventoryGet: async () => {
      state.inventory++;
      return null;
    },
    fetchOwnedUri: async () => {
      state.fetchOwned++;
      return "https://lh3.googleusercontent.com/p/should-not-run";
    },
  };
  const authorizeSpend = async () => {
    state.authorize++;
    return true;
  };
  return { state, deps, authorizeSpend };
}

function recoveryRow(ref, width, uri, exp) {
  return {
    k: photoCacheKey(ref, width),
    v: { uri },
    exp,
  };
}

// ── helper contract (call the function, do not grep the body) ────────────
{
  // canonicalPhotoWidth: the WRITE-side rule. <=800 -> 640; >800 stays itself.
  eq(canonicalPhotoWidth(800), 640, "canonical: 800 canonicalizes to 640");
  eq(canonicalPhotoWidth(640), 640, "canonical: 640 canonicalizes to 640");
  eq(canonicalPhotoWidth(220), 640, "canonical: a thumbnail width canonicalizes to 640");
  eq(canonicalPhotoWidth(63), 640, "canonical: sub-64 clamps to 640 (invalid input default)");
  eq(canonicalPhotoWidth(1200), 1200, "canonical: a hero width (>800) stays itself");
  eq(canonicalPhotoWidth(2000), 1600, "canonical: over-cap clamps to 1600 first, THEN stays itself (1600>800)");

  // photoCacheCandidateWidths: the READ-side rule. Exact, then canonical,
  // then the other common card widths (<=800) or hero fallbacks (>800).
  eq(photoCacheCandidateWidths(800).join(","), "800,640,720,600,480,400", "helper: 800 tries exact, canonical 640, then the other card widths");
  eq(photoCacheCandidateWidths(1200).join(","), "1200,800,720,640", "helper: 1200 (hero, >800) now ALSO gets an 800/720/640 fallback");
  eq(photoCacheCandidateWidths(400).join(","), "400,640,800,720,600,480", "helper: 400 tries exact, canonical 640, then the other card widths");
  eq(photoCacheCandidateWidths(640).join(","), "640,800,720,600,480,400", "helper: 640 (already canonical) still gets the other-card-width fallback");
  eq(photoCacheCandidateWidths(220).join(","), "220,640,800,720,600,480,400", "helper: a thumbnail tries exact, canonical 640, then the rest");
  eq(photoCacheCandidateWidths("800").join(","), "800,640,720,600,480,400", "helper: string \"800\" behaves identically to number 800");
  eq(photoCacheCandidateWidths(63).join(","), "640,800,720,600,480,400", "helper: sub-64 clamps to 640 before the candidate list is built (no bare 63 entry)");
}

// ── 1. VALID EXACT 800 wins over 640 ─────────────────────────────────────
{
  const { state, deps, authorizeSpend } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 800)]: { uri: URI_800 },
    [photoCacheKey(REF, 640)]: { uri: URI_640 },
  });
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, authorizeSpend,
  }, { ...deps, cacheGet });
  eq(r.type, "redirect", "1: exact 800 is a redirect");
  eq(r.reason, "cache", "1: exact 800 is labelled cache");
  eq(r.location, URI_800, "1: exact 800 URI wins over the same-ref 640");
  eq(state.authorize, 0, "1: exact 800 consumes zero spend");
  eq(state.fetchOwned, 0, "1: exact 800 performs zero Google fetches");
  eq(state.cacheWrites, 0, "1: exact 800 does not rewrite cache");
  ok(cacheGet.reads[0] === photoCacheKey(REF, 800), "1: cacheLookup asks for exact 800 first");
}

{
  const later640 = new Date(NOW + 20 * 86400000).toISOString();
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, URI_640, later640),
    recoveryRow(REF, 800, URI_800, FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit && hit.uri, URI_800, "1b: recovery prefers exact 800 even when 640 expires later");
  eq(hit && hit.width, 800, "1b: recovery selected width is 800");
}

// ── 2 + 3. 640 → 800 FALLBACK, ZERO EXTRA SPEND, no fake 800 write ───────
{
  const { state, deps, authorizeSpend } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 640)]: { uri: URI_640, expMs: FRESH_EXP_MS },
  });
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, authorizeSpend,
  }, { ...deps, cacheGet });
  eq(r.type, "redirect", "2: fresh same-ref 640 satisfies 800");
  eq(r.reason, "cache", "2: 640→800 reuse is still a cache hit");
  eq(r.location, URI_640, "2: 800 request returns the warm 640 URI");
  eq(state.authorize, 0, "3: 640→800 fallback does not call authorizeSpend");
  eq(state.fetchOwned, 0, "3: 640→800 fallback does not call fetchOwnedUri / Google");
  eq(state.cacheWrites, 0, "3: 640→800 fallback does not mint a fake 800 cache row");
  ok(!state.writtenKeys.some((k) => k === photoCacheKey(REF, 800)),
    "3: no photo|{ref}|800 write on 640 reuse");
  ok(cacheGet.reads.includes(photoCacheKey(REF, 800)) && cacheGet.reads.includes(photoCacheKey(REF, 640)),
    "2: cacheLookup tried exact 800 then same-ref 640");

  const probe = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, probe: true,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet });
  eq(probe.reason, "cache", "2c: a probe also sees the 640→800 cache reuse");
  eq(state.authorize, 0, "3c: a probe on the fallback path still asks for zero grants");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, URI_640, FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit && hit.uri, URI_640, "2b: recovery can select a fresh same-place 640 for an 800 request");
  eq(hit && hit.width, 640, "2b: recovery reports the source width 640");
  const ttl = Math.floor((FRESH_EXP_MS - NOW) / 1000);
  eq(hit && hit.ttlSeconds, ttl, "2b: recovery inherits the source row remaining TTL");
  // 2026-09-15 (liveness): the downstream header is the SMALLER of the remaining
  // TTL and one day — a rented Google uri was measured dying inside a week, so a
  // 10-day CDN replay of a recovered 302 is the same bug this row exists to stop.
  // Still never a fresh 30-day clock, and never longer than the source row.
  const bounded = Math.min(ttl, 86400);
  ok(hit && hit.cacheControl.includes(`max-age=${bounded}`) && !/immutable/.test(hit.cacheControl),
    "2b: Cache-Control is min(remaining TTL, 1 day) — never a fresh 30d clock, never immutable");
}

// ── 4. STALE 640 does not satisfy 800 ────────────────────────────────────
{
  const { state, deps, authorizeSpend } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 640)]: { uri: URI_640, expMs: NOW - 1000 },
  }, { now: NOW });
  const deny = async () => { state.authorize++; return false; };
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, authorizeSpend: deny,
  }, { ...deps, cacheGet });
  eq(r.reason, "spend-denied", "4: expired 640 is a miss, not a reuse");
  eq(r.type, "miss", "4: stale 640 yields an honest miss");
  eq(state.fetchOwned, 0, "4: stale 640 does not fetch Google after the miss");
  ok(r.location == null, "4: stale 640 has no redirect location");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, URI_640, STALE_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit, null, "4b: recovery refuses an expired 640 for an 800 request");
}

// ── 5. WRONG REF: a different Google photo ref cannot satisfy ─────────────
{
  const { state, deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(OTHER_REF, 640)]: { uri: URI_OTHER, expMs: FRESH_EXP_MS },
    [photoCacheKey(OTHER_REF, 800)]: { uri: URI_OTHER, expMs: FRESH_EXP_MS },
  });
  const deny = async () => { state.authorize++; return false; };
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, authorizeSpend: deny,
  }, { ...deps, cacheGet });
  eq(r.reason, "spend-denied", "5: another photo ref's 640 cannot satisfy this ref's 800");
  eq(r.location, null, "5: wrong-ref reuse has no location");
  eq(state.fetchOwned, 0, "5: wrong-ref miss does not fetch Google when spend is denied");
  ok(!cacheGet.reads.includes(photoCacheKey(OTHER_REF, 640)),
    "5: cacheLookup is per photoRef — it never reads the other ref's key");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(OTHER_REF, 640, URI_OTHER, FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit, null, "5b: recovery still requires the Place ID encoded in the row, never a neighbour");
}

// ── 6. 400 NOW SUBSTITUTES for 800 (widened harvest list) ────────────────
// SPEND EFFICIENCY (2026-09-16): a bare 400 row (written under the OLD,
// per-exact-width regime, before this change) is a candidate the resolver
// harvests for free rather than paying for a fresh canonical-640 fetch.
{
  const { state, deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 400)]: { uri: URI_400, expMs: FRESH_EXP_MS },
  });
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet });
  eq(r.type, "redirect", "6: a fresh 400 row now satisfies an 800 request");
  eq(r.reason, "cache", "6: still labelled a plain cache hit");
  eq(r.location, URI_400, "6: the 400 row's own uri is served");
  eq(state.authorize, 0, "6: harvesting the 400 row consumes zero spend");
  eq(state.fetchOwned, 0, "6: harvesting the 400 row performs zero Google fetches");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 400, URI_400, FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit && hit.uri, URI_400, "6b: recovery now selects a fresh 400 row for an 800 request");
  eq(hit && hit.width, 400, "6b: recovery reports the source width 400");
}

// ── 6c (negative control). 280 is a width this codebase used to write, but
// it is NOT in the declared widened fallback list ([800,720,600,480,400]) —
// so it must NOT substitute, proving the widening is a specific list, not
// "anything goes".
{
  const { state, deps } = tracker();
  const URI_280 = "https://lh3.googleusercontent.com/p/width-reuse-280";
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 280)]: { uri: URI_280, expMs: FRESH_EXP_MS },
  });
  const deny = async () => { state.authorize++; return false; };
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, authorizeSpend: deny,
  }, { ...deps, cacheGet });
  eq(r.reason, "spend-denied", "6c: a 280-only cache does not satisfy 800 — 280 is not in the widened list");
  ok(!cacheGet.reads.includes(photoCacheKey(REF, 280)),
    "6c: cacheLookup never asks for 280 when the request is 800");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 280, "https://lh3.googleusercontent.com/p/width-reuse-280", FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit, null, "6d: recovery does not select 280 for an 800 request");
}

// ── 7. 1200 (hero) NOW ALSO gets an 800/720/640 fallback ─────────────────
// SPEND EFFICIENCY (2026-09-16): previously 1200 stayed exact-only. The
// widened list now tries 800/720/640 as a last resort for a hero request
// too — cache lookup runs BEFORE the gate-shut check, so a warm 640 is
// served even with the gate shut (case 7c below proves gate-shut still
// applies when nothing at all is cached).
{
  const { state, deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 640)]: { uri: URI_640, expMs: FRESH_EXP_MS },
  });
  const r = await resolvePlacePhoto({
    ref: REF, w: 1200, serverKey: "test-key", gateShut: true,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet });
  eq(r.type, "redirect", "7: a fresh 640 row now satisfies a 1200 hero request");
  eq(r.reason, "cache", "7: labelled a cache hit even though the gate is shut — cache runs first");
  eq(r.location, URI_640, "7: the 640 row's uri is served to the hero slot");
  eq(state.authorize, 0, "7: harvesting the 640 row for a hero consumes zero spend");
  ok(cacheGet.reads.includes(photoCacheKey(REF, 1200)), "7: 1200 still asks for exact 1200 first");
  ok(cacheGet.reads.includes(photoCacheKey(REF, 640)), "7: …and now falls through to 640 too");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, URI_640, FRESH_EXP),
  ], { placeId: PLACE, width: 1200, now: NOW });
  eq(hit && hit.uri, URI_640, "7b: recovery now applies the 640 fallback to a 1200 hero request too");
}

// ── 7c (negative control). Gate-shut with NOTHING cached at all is still
// an honest miss — the widened fallback only harvests what actually exists.
{
  const { state, deps } = tracker();
  const r = await resolvePlacePhoto({
    ref: REF, w: 1200, serverKey: "test-key", gateShut: true,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet: async () => null });
  eq(r.type, "miss", "7c: nothing cached at all is still an honest miss");
  eq(r.reason, "gate-shut", "7c: gate-shut reason, unaffected by the widened fallback when there is nothing to harvest");
  eq(state.authorize, 0, "7c: gate-shut asks for zero grants");
}

// ── 8. COLD PHOTO now fetches AND writes at the CANONICAL width ──────────
// SPEND EFFICIENCY (2026-09-16): the write side canonicalizes. A cold 800
// request asks Google for 640 (canonicalPhotoWidth(800)) and writes
// photo|{ref}|640 — never its own exact-width row — so the NEXT card asking
// for 480, or 720, of the SAME photo lands on this same free row instead of
// paying for its own fetch.
{
  const { state, deps } = tracker();
  let fetchedW = null;
  deps.fetchOwnedUri = async (ref, w) => {
    state.fetchOwned++;
    fetchedW = w;
    return URI_800;
  };
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet: async () => null });
  eq(r.reason, "google", "8: a cold 800 still takes the existing Google path");
  eq(state.authorize, 1, "8: cold 800 asks authorizeSpend exactly once");
  eq(state.fetchOwned, 1, "8: cold 800 reaches fetchOwnedUri once");
  eq(fetchedW, 640, "8: cold fetch now asks Google for the CANONICAL 640, not the raw 800");
  eq(state.cacheWrites, 1, "8: a real Google hit writes exactly one cache row");
  eq(state.writtenKeys[0], photoCacheKey(REF, 640), "8: the cold write is photo|{ref}|640 (canonical), never photo|{ref}|800");
}

// ── 8b (control). A cold HERO (>800) fetches and writes at its OWN exact
// width — canonicalPhotoWidth only folds widths <=800 down to 640.
{
  const { state, deps } = tracker();
  let fetchedW = null;
  deps.fetchOwnedUri = async (ref, w) => {
    state.fetchOwned++;
    fetchedW = w;
    return URI_800;
  };
  const r = await resolvePlacePhoto({
    ref: REF, w: 1200, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet: async () => null });
  eq(r.reason, "google", "8b: a cold 1200 hero still takes the existing Google path");
  eq(fetchedW, 1200, "8b: a hero (>800) is NOT canonicalized — it fetches its own exact width");
  eq(state.writtenKeys[0], photoCacheKey(REF, 1200), "8b: the cold hero write is photo|{ref}|1200, its own exact width");
}

// ── 9. SPEND DENIED is an honest miss ────────────────────────────────────
{
  const { state, deps } = tracker();
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => { state.authorize++; return false; },
  }, { ...deps, cacheGet: async () => null });
  eq(r.type, "miss", "9: denied + no cache is an honest miss");
  eq(r.reason, "spend-denied", "9: reason stays spend-denied");
  eq(r.location, null, "9: denied miss has no shared fallback location");
  eq(state.fetchOwned, 0, "9: denied spend performs zero Google fetches");
  eq(state.cacheWrites, 0, "9: denied spend writes no cache");
}

// ── 10. Inventory-owned (existing free rung) still wins on a cache miss ──
{
  const { state, deps } = tracker();
  const owned = "https://lh3.googleusercontent.com/p/inventory-owned";
  deps.inventoryGet = async () => {
    state.inventory++;
    return { signals: { photo_url: owned } };
  };
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet: async () => null });
  eq(r.reason, "inventory", "10: an owned inventory URL still wins when cache misses");
  eq(r.location, owned, "10: inventory URI is the place's own photo");
  eq(state.authorize, 0, "10: inventory hit consumes zero spend");
  eq(state.fetchOwned, 0, "10: inventory hit performs zero Google fetches");
}

// ── 11. Rejected / invalid 640 stays rejected ────────────────────────────
{
  const { state, deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 640)]: { uri: "https://images.pexels.com/photos/123/stock.jpg" },
  });
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => { state.authorize++; return false; },
  }, { ...deps, cacheGet });
  eq(r.reason, "spend-denied", "11: a stock/Pexels 640 is not a permitted reuse");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, "https://upload.wikimedia.org/wikipedia/commons/a/aa/Other.jpg", FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit, null, "11b: recovery still requires an owned googleusercontent URI");
}

// ── 12. INITIALS: no permitted image is still a miss (RailCard unchanged) ─
{
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, spendAllowed: false,
  }, {
    cacheGet: async () => null,
    cacheSet: async () => {},
    inventoryGet: async () => null,
    fetchOwnedUri: async () => { throw new Error("12 must not fetch"); },
  });
  eq(r.type, "miss", "12: no permitted image is a miss so the card initials path can fire");
  eq(r.location, null, "12: miss has no shared SVG location");
  eq(r.reason, "spend-denied", "12: distinguishable from a genuinely photoless place");
}

// ── 13. CHAIN SAFETY: no other-place / other-ref image is introduced ─────
{
  const { deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(OTHER_REF, 640)]: { uri: URI_OTHER, expMs: FRESH_EXP_MS },
  });
  deps.inventoryGet = async () => ({ photo_ref: OTHER_REF, signals: {} });
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false,
    authorizeSpend: async () => false,
  }, { ...deps, cacheGet });
  eq(r.reason, "spend-denied", "13: a different place's cached photo cannot dress this ref");
  eq(r.location, null, "13: chain/neighbour image is refused");
}

// ── 14. EXISTING 640 requests, including w<640 reuse of 640 ──────────────
{
  const { state, deps, authorizeSpend } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 640)]: { uri: URI_640, expMs: FRESH_EXP_MS },
  });
  const exact = await resolvePlacePhoto({
    ref: REF, w: 640, serverKey: "test-key", gateShut: false, authorizeSpend,
  }, { ...deps, cacheGet });
  eq(exact.location, URI_640, "14: a normal 640 request still hits the 640 cache");
  eq(exact.reason, "cache", "14: 640 request is a cache hit");

  const thumb = await resolvePlacePhoto({
    ref: REF, w: 220, serverKey: "test-key", gateShut: false, authorizeSpend,
  }, { ...deps, cacheGet });
  eq(thumb.location, URI_640, "14: existing w<640 reuse of 640 still works");
  eq(thumb.reason, "cache", "14: thumbnail reuse is still a cache hit");
  eq(state.authorize, 0, "14: existing 640 paths consume zero spend");
  eq(state.cacheWrites, 0, "14: existing 640 reuse does not rewrite cache");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, URI_640, FRESH_EXP),
  ], { placeId: PLACE, width: 220, now: NOW });
  eq(hit && hit.uri, URI_640, "14b: recovery still reuses 640 for a thumbnail request");
}

{
  const exact400 = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 400, URI_400, FRESH_EXP),
    recoveryRow(REF, 640, URI_640, new Date(NOW + 20 * 86400000).toISOString()),
  ], { placeId: PLACE, width: 400, now: NOW });
  eq(exact400 && exact400.uri, URI_400, "14c: exact 400 still beats 640 when both exist");
}

if (failures) {
  console.error(`photo-cache-width-reuse: ${failures} failing assertion(s)`);
  process.exit(1);
}
console.log("test-photo-cache-width-reuse: OK — exact width always wins; the widened harvest list lets 400/640 satisfy 800 and 800/720/640 satisfy a 1200 hero; a cold fetch canonicalizes to 640 (heroes keep their own exact width); 280/stale/wrong-ref never substitute; zero extra spend on any harvest; no fake cache write");
