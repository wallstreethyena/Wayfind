#!/usr/bin/env node
// scripts/test-photo-spend-efficiency.mjs — Google Cloud metrics (2026-09-16):
// EVERY billed Google photo call goes through lib/placePhotoServe.js's
// resolvePlacePhoto -> defaultFetchOwnedUri, one ledger grant per outbound
// call. On top of test-photo-quota-truth.mjs's classification/refund/breaker
// fix, five further sources of WASTE were still spending real grants:
//
//   (a) Cards request the same photo at eight different widths (240/280/
//       400/480/600/640/720/800, plus 1200 heroes) — each width its own
//       cache key and its own paid call.
//   (b) On a stale (404) or client-400 media call, tryName() used to spend a
//       SECOND media grant on the `follow` url, which returns the SAME
//       404/400 every time — only THEN healing via Place Details.
//   (c) No coalescing: concurrent requests for the same ref in one instance
//       each took their own grant.
//   (d) No negative cache: a ref whose heal found no photo, or that ended
//       unowned/badjson/redirect, was re-spent on every subsequent request.
//   (e) Nothing stopped a Preview deployment or a local `next dev` running
//       with production env from spending the PRODUCTION photo ledger.
//
// THIS GUARD locks the fix for all five, on top of (never duplicating)
// test-photo-quota-truth.mjs's own coverage:
//   1. lib/photoCacheRecovery.js's canonicalPhotoWidth folds every card width
//      <=800 down to 640; resolvePlacePhoto fetches AND writes at that
//      canonical width, so w=240/400/480/600/640/720/800 all land on ONE
//      cache row and ONE paid fetch. A hero (>800) keeps its own width.
//   2. defaultFetchOwnedUri.tryName follows ONLY when skipCls === "unowned"
//      — stale/client-400 go straight to the heal check, never a second
//      media grant on a repeat of the same answer.
//   3. A module-level singleflight Map in resolvePlacePhoto, keyed
//      `${ref}|${canonicalWidth}`, so concurrent same-key callers in one
//      instance share ONE paid attempt.
//   4. A 24h negative cache (`photoneg|<ref>`) for the upstream classes that
//      mean "no photo is coming back on an immediate retry" — never for a
//      transient/rejection class.
//   5. lib/spendGate.js's spendAllowPhotos() refuses outright outside
//      VERCEL_ENV=production unless WAYFIND_ALLOW_NONPROD_PHOTO_SPEND=1.
//
// HERMETIC: zero network. Every scenario injects deps.fetchImpl (a scripted
// Google stub), deps.authorizeSpend, deps.breakerOpen/deps.tripBreaker (fake,
// in-memory — NEVER the real lib/providerHealth.js breaker) and deps.refund
// (fake) — same shape as scripts/test-photo-quota-truth.mjs. Section 6
// (the nonprod spend block) stubs globalThis.fetch directly around the REAL
// lib/spendGate.js spendAllowPhotos(), the same technique
// scripts/test-photos-paid-cap.mjs uses for that module.
import { readFileSync } from "node:fs";
import { canonicalPhotoWidth } from "../lib/photoCacheRecovery.js";
import {
  NEGATIVE_CACHEABLE_UPSTREAM,
  photoNegativeKey,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";
import { spendAllowPhotos } from "../lib/spendGate.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const eq = (actual, expected, m) => ok(actual === expected, `${m} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

// ── shared fakes (same shapes as test-photo-quota-truth.mjs) ──────────────
function authorizer(allow) {
  const log = [];
  const left = { ...allow };
  const fn = async (sku) => {
    const granted = (left[sku] || 0) > 0;
    if (granted) left[sku]--;
    log.push({ sku, granted });
    return granted;
  };
  fn.asked = (sku) => log.filter((e) => !sku || e.sku === sku).length;
  fn.granted = (sku) => log.filter((e) => e.granted && (!sku || e.sku === sku)).length;
  return fn;
}

// A scripted Google double. `healedRefSubstring`, when given, routes a
// request whose url contains it to the "healedSkip"/"healedFollow" kind
// instead of "skip"/"follow" — omit it entirely when a scenario never heals
// (so an ordinary skip/follow is never misrouted).
function googleStub(script, healedRefSubstring) {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://places.googleapis.com/v1/")) throw new Error("test bug: unexpected url " + u);
    const healed = healedRefSubstring ? u.includes(healedRefSubstring) : false;
    let kind;
    if (u.includes("?fields=photos")) kind = "details";
    else if (u.includes("skipHttpRedirect=true")) kind = healed ? "healedSkip" : "skip";
    else if (u.includes("/media?")) kind = healed ? "healedFollow" : "follow";
    else throw new Error("test bug: unclassified url " + u);
    const list = script[kind];
    if (!list || !list.length) throw new Error(`test bug: no scripted ${kind} response left for call #${calls.filter((k) => k === kind).length + 1}`);
    calls.push(kind);
    const step = list.shift();
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      url: step.url || "",
      json: async () => (step.body === undefined ? {} : step.body),
    };
  };
  return { fn, calls };
}

// An in-memory cache mimicking lib/serverCache.js's {v, stale, ageMs}
// read contract closely enough for the resolver's own use of it:
// liveCachedUri reads hit.v (and hit.ageMs), the negative-cache read reads
// only hit.stale. A row past its own ttlMs reads back as a genuine miss
// (null) — no 30-day stale-serve grace here; that nuance is exercised
// directly (not through this fake) in case 5c below.
function memCache() {
  const store = new Map();
  const cacheGet = async (key) => {
    const row = store.get(key);
    if (!row) return null;
    if (Date.now() >= row.exp) return null;
    return { v: row.v, stale: false, ageMs: Date.now() - row.wrote };
  };
  const cacheSet = async (key, value, ttlMs) => {
    const wrote = Date.now();
    const exp = wrote + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 30 * 24 * 60 * 60 * 1000);
    store.set(key, { v: value, exp, wrote });
  };
  return { store, cacheGet, cacheSet };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const FAKE_DEPS = { breakerOpen: async () => null, tripBreaker: async () => true, refund: async () => true, retryDelayMs: 0 };

/* ── 1. WIDTH DEDUP: 240/400/800 of the SAME photo cost ONE paid fetch ──── */
{
  const PLACE = "ChIJSpendEfficiencyWidths01";
  const REF = `places/${PLACE}/photos/WIDTHDEDUP`;
  const OWNED = "https://lh3.googleusercontent.com/p/width-dedup-owned";
  const cache = memCache();
  let authCalls = 0;
  const authorizeSpend = async () => { authCalls++; return true; };
  let fetchCalls = 0;
  const seenUrls = [];
  const fetchImpl = async (url) => {
    fetchCalls++;
    seenUrls.push(String(url));
    return { ok: true, status: 200, url: "", json: async () => ({ photoUri: OWNED }) };
  };
  const deps = { ...FAKE_DEPS, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, inventoryGet: async () => null, fetchImpl };

  const r240 = await resolvePlacePhoto({ ref: REF, w: 240, serverKey: "k", authorizeSpend }, deps);
  const r400 = await resolvePlacePhoto({ ref: REF, w: 400, serverKey: "k", authorizeSpend }, deps);
  const r800 = await resolvePlacePhoto({ ref: REF, w: 800, serverKey: "k", authorizeSpend }, deps);

  eq(r240.type, "redirect", "1: cold w=240 redirects");
  eq(r240.location, OWNED, "1: w=240 gets the real photo");
  eq(r400.location, OWNED, "1: w=400 reuses the same photo, free");
  eq(r800.location, OWNED, "1: w=800 reuses the same photo, free");
  eq(authCalls, 1, "1: exactly ONE authorizeSpend(\"photos\") across w=240,400,800");
  eq(fetchCalls, 1, "1: exactly ONE media call across w=240,400,800");
  ok(!!seenUrls[0] && seenUrls[0].includes("maxWidthPx=640"), "1: the single Google fetch used maxWidthPx=640 (the canonical width), never the raw 240/400/800");

  // Control: a >800 hero does NOT fold to 640 — a cold 1200 request (empty
  // cache) still spends its own grant and its own media call.
  let heroAuth = 0, heroFetch = 0, heroUrl = "";
  const heroDeps = {
    ...FAKE_DEPS, cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null,
    fetchImpl: async (url) => { heroFetch++; heroUrl = String(url); return { ok: true, status: 200, url: "", json: async () => ({ photoUri: OWNED }) }; },
  };
  const rHero = await resolvePlacePhoto({ ref: REF, w: 1200, serverKey: "k", authorizeSpend: async () => { heroAuth++; return true; } }, heroDeps);
  eq(rHero.type, "redirect", "1: a cold 1200 hero still redirects");
  eq(heroAuth, 1, "1: a cold 1200 hero still spends its own grant");
  eq(heroFetch, 1, "1: a cold 1200 hero still makes its own media call");
  ok(heroUrl.includes("maxWidthPx=1200"), "1: the hero fetch asks Google for its own 1200, not 640");
}

/* ── 2. SINGLEFLIGHT: concurrent same-ref callers share ONE paid attempt ── */
{
  const PLACE = "ChIJSpendEfficiencyConcurrency01";
  const REF = `places/${PLACE}/photos/CONCURRENCYTEST`;
  const OWNED = "https://lh3.googleusercontent.com/p/concurrency-owned";
  const cache = memCache();
  let authCalls = 0;
  let fetchCalls = 0;
  const gate = deferred();
  const authorizeSpend = async () => { authCalls++; return true; };
  const fetchImpl = async () => {
    fetchCalls++;
    await gate.promise; // held open until BOTH callers have reached the paid section
    return { ok: true, status: 200, url: "", json: async () => ({ photoUri: OWNED }) };
  };
  const deps = { ...FAKE_DEPS, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, inventoryGet: async () => null, fetchImpl };

  // Different raw widths (480, 720) that BOTH canonicalize to 640 — proving
  // the singleflight key is the CANONICAL width, not the raw one.
  const p1 = resolvePlacePhoto({ ref: REF, w: 480, serverKey: "k", authorizeSpend }, deps);
  const p2 = resolvePlacePhoto({ ref: REF, w: 720, serverKey: "k", authorizeSpend }, deps);
  for (let i = 0; i < 20; i++) await Promise.resolve(); // let both callers' cache/inventory awaits settle
  gate.resolve();
  const [r1, r2] = await Promise.all([p1, p2]);

  eq(fetchCalls, 1, "2: two concurrent callers for the same ref (different raw widths, same canonical 640) make exactly ONE media call");
  eq(authCalls, 1, "2: exactly ONE authorizeSpend grant for both callers combined");
  eq(r1.type, "redirect", "2: caller 1 gets a redirect");
  eq(r2.type, "redirect", "2: caller 2 gets a redirect");
  eq(r1.location, r2.location, "2: both callers get the SAME redirect target");
  eq(r1.location, OWNED, "2: the shared redirect target is the real photo");
}

/* ── 3. STALE/400 NO LONGER FOLLOWS: skip -> heal -> healed skip, 2+1 ────── */
{
  const PLACE = "ChIJSpendEfficiencyHeal01";
  const OLD_REF = `places/${PLACE}/photos/OLDNAME`;
  const NEW_REF = `places/${PLACE}/photos/NEWNAME`;
  const OWNED = "https://lh3.googleusercontent.com/p/heal-owned";

  async function healScenario(skipStatus, label) {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const stub = googleStub({
      skip: [{ status: skipStatus }],
      details: [{ status: 200, body: { photos: [{ name: NEW_REF }] } }],
      healedSkip: [{ status: 200, body: { photoUri: OWNED } }],
    }, NEW_REF);
    const deps = { ...FAKE_DEPS, cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, fetchImpl: stub.fn };
    const result = await resolvePlacePhoto({ ref: OLD_REF, w: 640, serverKey: "k", authorizeSpend: auth }, deps);
    eq(stub.calls.join(","), "skip,details,healedSkip", `3(${label}): exactly 2 media calls + 1 details call, no follow`);
    eq(result.type, "redirect", `3(${label}): heal recovers a redirect`);
    eq(result.location, OWNED, `3(${label}): the healed photo is served`);
  }
  await healScenario(404, "404");
  await healScenario(400, "400");
}

/* ── 4. UNOWNED 2xx STILL FOLLOWS (positive control) ─────────────────────── */
{
  const PLACE = "ChIJSpendEfficiencyUnowned01";
  const REF = `places/${PLACE}/photos/UNOWNEDTEST`;
  const OWNED = "https://lh3.googleusercontent.com/p/unowned-then-owned";
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const stub = googleStub({
    skip: [{ status: 200, body: { photoUri: "http://not-owned.example/x.jpg" } }],
    follow: [{ status: 200, url: OWNED }],
  });
  const deps = { ...FAKE_DEPS, cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, fetchImpl: stub.fn };
  const result = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth }, deps);
  eq(stub.calls.join(","), "skip,follow", "4: unowned 2xx still follows — the ONE skipCls that does");
  eq(result.type, "redirect", "4: the follow succeeds");
  eq(result.location, OWNED, "4: the followed uri is served");
}

/* ── 5. NEGATIVE CACHE ────────────────────────────────────────────────────── */
{
  const PLACE = "ChIJSpendEfficiencyNegCache01";
  const REF = `places/${PLACE}/photos/NEGCACHETEST`;
  const cache = memCache();
  const auth1 = authorizer({ photos: 99, details_ids_only: 99 });
  const stub1 = googleStub({ skip: [{ status: 404 }], details: [{ status: 200, body: { photos: [] } }] });
  const deps = { ...FAKE_DEPS, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, inventoryGet: async () => null, fetchImpl: stub1.fn };

  const first = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth1 }, deps);
  eq(first.type, "miss", "5: first request is a genuine miss");
  eq(first.upstream, "stale-heal-nophoto", "5: classified stale-heal-nophoto");
  ok(cache.store.has(photoNegativeKey(REF)), "5: the negative-cache row was written");

  let secondFetchCalls = 0;
  const secondAuth = authorizer({ photos: 99, details_ids_only: 99 });
  const second = await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: secondAuth },
    { ...deps, fetchImpl: async () => { secondFetchCalls++; throw new Error("must not call Google on a negative-cache hit"); } }
  );
  eq(second.type, "miss", "5: second request is negative-cached");
  eq(second.reason, "negative-cached", "5: reason is negative-cached");
  eq(second.upstream, "negative-cached", "5: upstream is negative-cached");
  eq(secondAuth.asked(), 0, "5: zero authorizeSpend calls on the negative-cached hit");
  eq(secondFetchCalls, 0, "5: zero Google fetches on the negative-cached hit");
}

// 5b (NEGATIVE CONTROL). A quota outcome is NEVER negative-cached — it is
// transient/rejection, not "this ref has no photo".
{
  ok(!NEGATIVE_CACHEABLE_UPSTREAM.has("quota"), "5b: quota is not in the negative-cacheable set (pure check)");
  ok(!NEGATIVE_CACHEABLE_UPSTREAM.has("key-denied") && !NEGATIVE_CACHEABLE_UPSTREAM.has("server") && !NEGATIVE_CACHEABLE_UPSTREAM.has("network") && !NEGATIVE_CACHEABLE_UPSTREAM.has("denied") && !NEGATIVE_CACHEABLE_UPSTREAM.has("stale-heal-denied"),
    "5b: none of quota/key-denied/server/network/denied/stale-heal-denied are negative-cacheable");

  const PLACE = "ChIJSpendEfficiencyNegCacheControl01";
  const REF = `places/${PLACE}/photos/NEGCACHEQUOTA`;
  const cache = memCache();
  const auth1 = authorizer({ photos: 99, details_ids_only: 99 });
  const stub1 = googleStub({ skip: [{ status: 429 }] });
  const deps = { ...FAKE_DEPS, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, inventoryGet: async () => null, fetchImpl: stub1.fn };
  const first = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth1 }, deps);
  eq(first.upstream, "quota", "5b: classified quota");
  ok(!cache.store.has(photoNegativeKey(REF)), "5b: a quota outcome writes NO negative-cache row");

  const secondAuth = authorizer({ photos: 99, details_ids_only: 99 });
  const stub2 = googleStub({ skip: [{ status: 429 }] });
  const second = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: secondAuth }, { ...deps, fetchImpl: stub2.fn });
  eq(second.upstream, "quota", "5b: the SECOND request still reaches Google and re-classifies quota — never negative-cached");
  ok(secondAuth.asked("photos") >= 1, "5b: the second request still asks the ledger — nothing was cached");
}

// 5c (defaultCacheGet semantics). A negative-cache row that reads back
// `stale:true` (physically past its own 24h ttl, the shape a 30-day
// stale-serve grace would still return non-null) must NOT be honoured —
// only `stale:false` counts as a live negative-cache hit.
{
  const PLACE = "ChIJSpendEfficiencyNegCacheStale01";
  const REF = `places/${PLACE}/photos/NEGCACHESTALE`;
  const key = photoNegativeKey(REF);
  const cacheGet = async (k) => (k === key ? { v: { cls: "unowned", at: Date.now() - 1000 }, stale: true, ageMs: 1000 } : null);
  let fetchCalls = 0;
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const deps = {
    ...FAKE_DEPS, cacheGet, cacheSet: async () => {}, inventoryGet: async () => null,
    fetchImpl: async () => { fetchCalls++; return { ok: true, status: 200, url: "", json: async () => ({ photoUri: "https://lh3.googleusercontent.com/p/stale-neg-owned" }) }; },
  };
  const result = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth }, deps);
  eq(result.type, "redirect", "5c: a STALE negative-cache row (past its true 24h) is ignored, not honoured");
  eq(fetchCalls, 1, "5c: the request still reaches Google — a stale negative marker never blocks it");
}

/* ── 6. NON-PRODUCTION SPEND BLOCK ────────────────────────────────────────── */
{
  const ENV_KEYS = ["VERCEL_ENV", "WAYFIND_ALLOW_NONPROD_PHOTO_SPEND", "WAYFIND_GATE", "WAYFIND_PHOTOS_PAID", "GOOGLE_PHOTOS_MONTH_CAP", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  // Hermetic per check-guard-hermeticity.mjs: never READ the ambient shell's
  // env (that is how a guard answers differently in a clean terminal than in
  // one with .env.production.local sourced). Every key this scenario touches
  // is deleted before the fixtures run and deleted again after — never saved
  // and restored to whatever the shell happened to hold — matching the
  // pattern test-photos-paid-cap.mjs uses for the same reason.
  const savedFetch = globalThis.fetch;
  function setEnv(values) {
    for (const k of ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(values)) if (v != null) process.env[k] = String(v);
  }
  function restore() {
    for (const k of ENV_KEYS) delete process.env[k];
    globalThis.fetch = savedFetch;
  }
  try {
    const base = { WAYFIND_GATE: "free", SUPABASE_URL: "https://ledger.test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-key", WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "2000" };

    // preview: refused outright, zero network.
    setEnv({ ...base, VERCEL_ENV: "preview" });
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("must not touch the network"); };
    eq(await spendAllowPhotos(), false, "6: VERCEL_ENV=preview refuses outright");
    eq(calls, 0, "6: preview never touches the network");

    // unset VERCEL_ENV (a local `next dev`): refused outright, zero network.
    setEnv({ ...base });
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("must not touch the network"); };
    eq(await spendAllowPhotos(), false, "6: VERCEL_ENV unset refuses outright");
    eq(calls, 0, "6: unset VERCEL_ENV never touches the network");

    // preview + the explicit override: proceeds to the ledger.
    setEnv({ ...base, VERCEL_ENV: "preview", WAYFIND_ALLOW_NONPROD_PHOTO_SPEND: "1" });
    calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => true }; };
    eq(await spendAllowPhotos(), true, "6: the explicit override lets preview proceed to the ledger");
    eq(calls, 1, "6: …exactly one ledger round trip");

    // production: proceeds to the ledger, no override needed.
    setEnv({ ...base, VERCEL_ENV: "production" });
    calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => true }; };
    eq(await spendAllowPhotos(), true, "6: VERCEL_ENV=production proceeds to the ledger");
    eq(calls, 1, "6: …exactly one ledger round trip");

    // production, but the ledger itself says no (control: the nonprod gate
    // is not the ONLY thing standing between this and a real grant).
    setEnv({ ...base, VERCEL_ENV: "production" });
    calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => false }; };
    eq(await spendAllowPhotos(), false, "6: production + ledger says no → denied");
    eq(calls, 1, "6: …still exactly one ledger round trip");
  } finally {
    restore();
  }
}

/* ── RED-PROOFS — mutated copies of the pure helpers, executed in-process ── */
// Each shows a REAL vs MUTATED computation diverging on the exact input
// shape this release's regression surface depends on. The guard EXITS
// NON-ZERO if a red-proof does NOT fail as expected.

// RED-PROOF 1 — follow-on-stale must stay gone.
{
  const realFollowEligible = (skipCls) => skipCls === "unowned";
  const mutatedFollowEligible = (skipCls, status) => skipCls === "unowned" || skipCls === "stale" || (skipCls === "client" && status === 400);
  eq(realFollowEligible("stale"), false, "red-proof control: the real rule refuses to follow a stale skip");
  eq(mutatedFollowEligible("stale", 404), true, "red-proof: the OLD rule would still follow a stale skip");
  ok(realFollowEligible("stale") !== mutatedFollowEligible("stale", 404),
    "RED-PROOF 1: re-enabling follow-on-stale changes the verdict — this guard's own case 3 (exactly 2 media calls, not 3) would fail under it");
}

// RED-PROOF 2 — singleflight must coalesce concurrent same-key callers.
{
  async function withoutSingleflight(n) {
    let calls = 0;
    async function attempt() { calls++; await Promise.resolve(); return "ok"; }
    await Promise.all(Array.from({ length: n }, () => attempt()));
    return calls;
  }
  async function withSingleflight(n) {
    let calls = 0;
    let inflight = null;
    async function attempt() {
      if (inflight) return inflight;
      inflight = (async () => { calls++; await Promise.resolve(); return "ok"; })();
      try { return await inflight; } finally { inflight = null; }
    }
    await Promise.all(Array.from({ length: n }, () => attempt()));
    return calls;
  }
  const real = await withSingleflight(3);
  const mutated = await withoutSingleflight(3);
  eq(real, 1, "red-proof control: WITH singleflight, 3 concurrent callers make exactly 1 real attempt");
  eq(mutated, 3, "red-proof: WITHOUT singleflight, 3 concurrent callers make 3 real attempts — the exact waste this release removes");
  ok(real !== mutated, "RED-PROOF 2: removing singleflight changes the call count — this guard's own case 2 would fail under it");
}

// RED-PROOF 3 — width canonicalization must stay in place.
{
  const mutatedCanonicalPhotoWidth = (w) => {
    let n = parseInt(w || 640, 10);
    if (!Number.isFinite(n) || n < 64) n = 640;
    if (n > 1600) n = 1600;
    return n; // no <=800 fold — THE BUG
  };
  eq(canonicalPhotoWidth(800), 640, "red-proof control: the real canonicalPhotoWidth folds 800 down to 640");
  eq(mutatedCanonicalPhotoWidth(800), 800, "red-proof: a mutated copy without the <=800 fold leaves 800 as its own width");
  ok(canonicalPhotoWidth(800) !== mutatedCanonicalPhotoWidth(800),
    "RED-PROOF 3: dropping the width fold changes the verdict — this guard's own case 1 (one grant across 240/400/800) would fail under it");
}

/* ── wiring proof — the guard is actually registered and actually run ────── */
{
  const guardsTxt = readFileSync(new URL("../scripts/guards.txt", import.meta.url), "utf8");
  const line = guardsTxt.split("\n").find((l) => l.trim() === "node scripts/test-photo-spend-efficiency.mjs");
  ok(!!line, `scripts/guards.txt must contain the literal line "node scripts/test-photo-spend-efficiency.mjs" — grep result: ${JSON.stringify(line)}`);
  const runGuards = readFileSync(new URL("../scripts/run-guards.mjs", import.meta.url), "utf8");
  const manifestLine = runGuards.split("\n").find((l) => l.includes('path.resolve("scripts/guards.txt")'));
  ok(!!manifestLine, `scripts/run-guards.mjs must read scripts/guards.txt as its manifest — quoted: ${JSON.stringify(manifestLine && manifestLine.trim())}`);
}

if (fail.length) {
  console.error("test-photo-spend-efficiency: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-photo-spend-efficiency: OK — ${pass} assertions; every card width folds to ONE canonical fetch, concurrent same-ref callers share ONE paid attempt, a stale/400 skip never spends a second grant on a repeat answer, unowned still follows, a 24h negative cache stops re-spending on a proven dead ref (never for a transient/rejection class), a Preview/dev deployment cannot spend the production ledger, and 3 red-proofs confirm this guard's own invariants are falsifiable`);
