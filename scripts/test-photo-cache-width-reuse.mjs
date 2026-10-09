#!/usr/bin/env node
// scripts/test-photo-cache-width-reuse.mjs — NO GOOGLE PHOTO IS CACHED, SO NO
// WIDTH, REF OR PLACE CAN REUSE ONE.
//
// HISTORY. 2026-09-11: an 800 card could reuse a fresh same-ref 640 cache row
// (cacheLookup tried [w, 640]). 2026-09-16 (spend efficiency): the READ side
// widened to harvest every legacy per-width row, the WRITE side canonicalized
// every card width <=800 to ONE row at 640.
//
// 2026-10-08 CONTRACT CHANGE (COMPLIANT PHOTOS, Google Maps Platform terms
// 3.2.3: no pre-fetching, storing or caching of Google Maps Content; Places
// 14.3: only the place ID may be kept; Place Photos: "you cannot cache a photo
// name"). The resolver (lib/placePhotoServe.js) no longer reads or writes ANY
// photo| row, so there is nothing for a width to reuse. This file keeps its
// name and now locks the OPPOSITE invariants, executed through
// resolvePlacePhoto with a fully-warm legacy cache OFFERED at every width:
//   1. a warm cache row at the exact width, at 640, at 400, or for another ref
//      or another place is NEVER served and cacheGet is never even called;
//   2. a non-credited surface (card, rail) is an honest no-spend miss at every
//      width, with zero ledger asks and zero Google calls;
//   3. a credited surface (s=detail) is a LIVE attempt at every width: the
//      served URL is what Google just returned, never a legacy URL, it takes
//      its own grant, and it asks Google for the canonical width (<=800 -> 640,
//      a hero keeps its own) so the Google-side request count stays minimal;
//   4. a live result is `private, no-store` and nothing is written back;
//   5. a denied credited request is an honest miss (never a legacy URL);
//   6. an inventory-owned NON-Google photo still wins at every width, free;
//   7. the retired recovery lookup (findSamePlaceCachedPhoto) is a constant
//      null that issues no query even when handed a warm fixture.
// The pure width helpers (canonicalPhotoWidth / photoCacheCandidateWidths) keep
// their documented contract; the live path uses canonicalPhotoWidth.
//
// HERMETIC: injected cache / inventory / fetchOwnedUri / authorizeSpend /
// probeUri. No live Google, no ledger, no production writes.
import {
  photoCacheKey,
  resolvePlacePhoto,
  placeDiscoveryRef,
} from "../lib/placePhotoServe.js";
import {
  canonicalPhotoWidth,
  photoCacheCandidateWidths,
  findSamePlaceCachedPhoto,
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
const LIVE = "https://lh3.googleusercontent.com/p/width-reuse-LIVE";
const LEGACY = (tag) => "https://lh3.googleusercontent.com/p/width-reuse-legacy-" + tag;
const WIDTHS = [220, 400, 640, 720, 800, 1200];

// A cache that has EVERYTHING warm (every width of this ref, and another ref and
// place) — and counts every read. The resolver must never touch it.
function warmCache() {
  const reads = [], writes = [];
  const rows = {};
  for (const w of [220, 280, 400, 480, 600, 640, 720, 800, 1200]) {
    rows[photoCacheKey(REF, w)] = { uri: LEGACY("same-" + w) };
    rows[photoCacheKey(OTHER_REF, w)] = { uri: LEGACY("other-" + w) };
  }
  return {
    reads, writes,
    cacheGet: async (key) => { reads.push(key); return rows[key] ? { v: rows[key], stale: false, ageMs: 1000 } : null; },
    cacheSet: async (key) => { writes.push(key); },
  };
}

function tracker({ grant = true } = {}) {
  const state = { authorize: 0, fetched: 0, fetchedRefs: [], fetchedWidths: [] };
  const deps = {
    inventoryGet: async () => null,
    probeUri: async () => null,
    fetchOwnedUri: async (ref, w) => {
      state.fetched++; state.fetchedRefs.push(ref); state.fetchedWidths.push(w);
      return { uri: LIVE, upstream: "ok", credit: { name: "Live Author", uri: null, mapsUri: null } };
    },
  };
  const authorizeSpend = async () => { state.authorize++; return grant; };
  return { state, deps, authorizeSpend };
}

// ── helper contract (pure functions kept for legacy direct importers) ─────
{
  eq(canonicalPhotoWidth(800), 640, "canonical: 800 canonicalizes to 640");
  eq(canonicalPhotoWidth(640), 640, "canonical: 640 canonicalizes to 640");
  eq(canonicalPhotoWidth(220), 640, "canonical: a thumbnail width canonicalizes to 640");
  eq(canonicalPhotoWidth(63), 640, "canonical: sub-64 clamps to 640 (invalid input default)");
  eq(canonicalPhotoWidth(1200), 1200, "canonical: a hero width (>800) stays itself");
  eq(canonicalPhotoWidth(2000), 1600, "canonical: over-cap clamps to 1600 first, THEN stays itself (1600>800)");
  eq(photoCacheCandidateWidths(800).join(","), "800,640,720,600,480,400", "helper: 800 candidate widths are unchanged (pure legacy helper)");
  eq(photoCacheCandidateWidths(1200).join(","), "1200,800,720,640", "helper: 1200 candidate widths are unchanged (pure legacy helper)");
}

// ── 1 + 2. A fully warm legacy cache is NEVER served; a card is a free miss ─
for (const w of WIDTHS) {
  const cache = warmCache();
  const { state, deps, authorizeSpend } = tracker();
  const r = await resolvePlacePhoto({ ref: REF, w, serverKey: "test-key", gateShut: false, authorizeSpend }, { ...deps, ...cache });
  eq(r.type, "miss", `2(w=${w}): a non-credited surface is an honest miss even with a fully warm legacy cache`);
  eq(r.reason, "not-google-surface", `2(w=${w}): reason is not-google-surface`);
  eq(r.location, null, `2(w=${w}): no location — no legacy URL is served`);
  eq(cache.reads.length, 0, `2(w=${w}): cacheGet is never called (the resolver does not read a Google photo cache)`);
  eq(cache.writes.length, 0, `2(w=${w}): cacheSet is never called`);
  eq(state.authorize, 0, `2(w=${w}): zero ledger asks`);
  eq(state.fetched, 0, `2(w=${w}): zero Google calls`);
}

// ── 3 + 4. A credited surface is a LIVE attempt at every width ─────────────
for (const w of WIDTHS) {
  const cache = warmCache();
  const { state, deps, authorizeSpend } = tracker();
  const r = await resolvePlacePhoto({ ref: REF, w, serverKey: "test-key", gateShut: false, googleSurface: true, authorizeSpend }, { ...deps, ...cache });
  eq(r.type, "redirect", `3(w=${w}): a credited request is a redirect`);
  eq(r.reason, "google", `3(w=${w}): labelled a live Google fetch, never "cache"`);
  eq(r.location, LIVE, `3(w=${w}): the served URL is what Google just returned, never a warm legacy row`);
  ok(!String(r.location).includes("legacy"), `3(w=${w}): no legacy URL leaks into the answer`);
  eq(state.authorize, 1, `3(w=${w}): exactly one ledger grant for the one live fetch`);
  eq(state.fetched, 1, `3(w=${w}): exactly one Google fetch`);
  eq(state.fetchedWidths[0], canonicalPhotoWidth(w), `3(w=${w}): Google is asked for the canonical width`);
  eq(state.fetchedRefs[0], placeDiscoveryRef(PLACE), `3(w=${w}): only the place ID is sent on — the stored photo name is replaced by the discovery marker`);
  eq(r.cacheControl, "private, no-store", `4(w=${w}): a live Google redirect is private, no-store`);
  eq(r.credit && r.credit.name, "Live Author", `4(w=${w}): the credit rides with the photo`);
  eq(cache.reads.length + cache.writes.length, 0, `4(w=${w}): nothing read from or written to the cache`);
}

// ── 3b. Another ref / another place's warm rows can never dress this ref ───
{
  const cache = warmCache();
  const { state, deps } = tracker({ grant: false });
  const r = await resolvePlacePhoto({ ref: REF, w: 800, serverKey: "test-key", gateShut: false, googleSurface: true, authorizeSpend: async () => { state.authorize++; return false; } }, {
    ...deps, ...cache,
    inventoryGet: async () => ({ photo_ref: OTHER_REF, signals: {} }),
  });
  eq(r.reason, "spend-denied", "5: a denied credited request is an honest miss");
  eq(r.location, null, "5: no neighbour / other-ref / legacy image is substituted");
  eq(cache.reads.length, 0, "5: the other place's cache rows are never consulted");
}

// ── 6. Inventory-owned NON-Google photo still wins at every width, free ────
for (const w of WIDTHS) {
  const { state, deps, authorizeSpend } = tracker();
  const cache = warmCache();
  const r = await resolvePlacePhoto({ ref: REF, w, serverKey: "test-key", gateShut: false, googleSurface: true, authorizeSpend }, {
    ...deps, ...cache,
    inventoryGet: async () => ({ signals: { photo_url: "https://cdn.example.test/place-owned.jpg" } }),
  });
  eq(r.reason, "inventory", `6(w=${w}): the owned photo wins`);
  eq(r.location, "https://cdn.example.test/place-owned.jpg", `6(w=${w}): the owned URL is served`);
  eq(state.authorize + state.fetched, 0, `6(w=${w}): zero spend and zero Google calls`);
}

// ── 6b. A Google-hosted inventory URL is NOT served at any width ───────────
for (const w of [640, 1200]) {
  const { state, deps, authorizeSpend } = tracker();
  const r = await resolvePlacePhoto({ ref: REF, w, serverKey: "test-key", gateShut: false, authorizeSpend }, {
    ...deps,
    inventoryGet: async () => ({ signals: { photo_url: LEGACY("inventory-hosted") } }),
  });
  eq(r.type, "miss", `6b(w=${w}): a Google-hosted inventory photo_url is ignored`);
  eq(r.location, null, `6b(w=${w}): and never served`);
  eq(state.authorize + state.fetched, 0, `6b(w=${w}): without spending`);
}

// ── 7. The retired recovery lookup issues no query and returns null ────────
{
  let queries = 0;
  const fetchImpl = async () => { queries++; return { ok: true, json: async () => [{ k: photoCacheKey(REF, 640), v: { uri: LEGACY("recovery") }, exp: new Date(Date.now() + 864e5).toISOString() }] }; };
  const env = { SUPABASE_URL: "https://stub.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "stub-key-not-real" };
  const viaOptions = await findSamePlaceCachedPhoto({ placeId: PLACE, width: 220, fetchImpl, env });
  eq(viaOptions, null, "7: findSamePlaceCachedPhoto returns null even when a fresh warm row exists");
  eq(queries, 0, "7: and issues zero lookups");
  await fetchImpl();
  eq(queries, 1, "7 (control): the stub fetch does count a call, so the 0 above is meaningful");
}

if (failures) {
  console.error(`photo-cache-width-reuse: ${failures} failing assertion(s)`);
  process.exit(1);
}
console.log("test-photo-cache-width-reuse: OK — with a fully warm legacy cache offered at every width, no stored Google photo is ever read or served (cacheGet 0 calls); a card is a free not-google-surface miss; a credited request is a live, granted, private/no-store attempt at the canonical width with only the place ID sent; the retired same-place recovery returns null with zero lookups");
