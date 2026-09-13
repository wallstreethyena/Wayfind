#!/usr/bin/env node
// scripts/test-photo-cache-width-reuse.mjs — 800 cards may reuse a fresh
// same-ref 640 cache row. Exact 800 still wins. 1200 stays exact-only.
// 400 never substitutes for 800. No fake 800 write, no extra Google spend.
//
// THE LIVE BUG (2026-09-11): cache key is photo|{ref}|{w}. cacheLookup and
// requestedWidths tried [w, 640] only when w < 640, else exact [w]. A warm
// |640 Googleusercontent URI for the same photo ref was ignored when the
// card asked for w=800, so the request fell through to spend or initials.
//
// HERMETIC: injected cache / inventory / fetchOwnedUri / authorizeSpend.
// No live Google, no ledger, no production writes.
import {
  photoCacheKey,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";
import {
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
  eq(photoCacheCandidateWidths(800).join(","), "800,640", "helper: 800 also tries 640");
  eq(photoCacheCandidateWidths(1200).join(","), "1200", "helper: 1200 stays exact-only");
  eq(photoCacheCandidateWidths(400).join(","), "400,640", "helper: existing thumbnail reuse of 640 remains");
  eq(photoCacheCandidateWidths(640).join(","), "640", "helper: a 640 request is exact 640 only");
  eq(photoCacheCandidateWidths(220).join(","), "220,640", "helper: w<640 still tries exact then 640");
  eq(photoCacheCandidateWidths("800").join(","), "800,640", "helper: string 800 is the card-size fallback");
  eq(photoCacheCandidateWidths(63).join(","), "640", "helper: sub-64 clamps to 640, not an 800 fallback");
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
  ok(hit && hit.cacheControl.includes(`max-age=${ttl}`), "2b: Cache-Control uses remaining TTL, not a fresh 30d clock");
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

// ── 6. 400 DOES NOT SUBSTITUTE for 800 ───────────────────────────────────
{
  const { state, deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 400)]: { uri: URI_400, expMs: FRESH_EXP_MS },
  });
  const deny = async () => { state.authorize++; return false; };
  const r = await resolvePlacePhoto({
    ref: REF, w: 800, serverKey: "test-key", gateShut: false, authorizeSpend: deny,
  }, { ...deps, cacheGet });
  eq(r.reason, "spend-denied", "6: a 400-only cache does not satisfy 800");
  ok(!cacheGet.reads.includes(photoCacheKey(REF, 400)),
    "6: cacheLookup never asks for 400 when the request is 800");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 400, URI_400, FRESH_EXP),
  ], { placeId: PLACE, width: 800, now: NOW });
  eq(hit, null, "6b: recovery does not select 400 for an 800 request");
}

// ── 7. 1200 UNCHANGED — no new 640 fallback ──────────────────────────────
{
  const { state, deps } = tracker();
  const cacheGet = cacheFromMap({
    [photoCacheKey(REF, 640)]: { uri: URI_640, expMs: FRESH_EXP_MS },
  });
  const r = await resolvePlacePhoto({
    ref: REF, w: 1200, serverKey: "test-key", gateShut: true,
    authorizeSpend: async () => { state.authorize++; return true; },
  }, { ...deps, cacheGet });
  eq(r.type, "miss", "7: 1200 does not reuse 640");
  eq(r.reason, "gate-shut", "7: 1200 + warm 640 + shut gate is still gate-shut");
  eq(state.authorize, 0, "7: gate-shut 1200 asks for zero grants");
  ok(cacheGet.reads.includes(photoCacheKey(REF, 1200)), "7: 1200 asked for exact 1200");
  ok(!cacheGet.reads.includes(photoCacheKey(REF, 640)), "7: 1200 did not fall through to 640");
}

{
  const hit = selectSamePlaceCachedPhoto([
    recoveryRow(REF, 640, URI_640, FRESH_EXP),
  ], { placeId: PLACE, width: 1200, now: NOW });
  eq(hit, null, "7b: recovery does not apply the new 640 fallback to 1200");
}

// ── 8. COLD PHOTO still reaches existing spend authorization ─────────────
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
  eq(fetchedW, 800, "8: cold fetch still asks Google for the requested 800");
  eq(state.cacheWrites, 1, "8: a real Google hit may write the requested-width cache (not a 640 reuse write)");
  eq(state.writtenKeys[0], photoCacheKey(REF, 800), "8: the cold write is photo|{ref}|800, never a forged row from 640");
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
console.log("test-photo-cache-width-reuse: OK — exact 800 wins; fresh same-ref 640 may satisfy 800; 400/1200/stale/wrong-ref do not; zero extra spend; no fake cache write");
