#!/usr/bin/env node
// scripts/test-photo-spend-efficiency.mjs — Google photo calls are metered, so
// every outbound call must be as cheap as it can be and never repeated.
//
// HISTORY (2026-09-16/17) AND THE 2026-10-08 CONTRACT CHANGE. This guard was
// written when a Google photo URL was cached for 30 days (width dedup into ONE
// cache row, a 24h negative cache, stored-name self-heal). The owner's
// COMPLIANT PHOTOS decision (Google Maps Platform terms: no pre-fetching,
// storing or caching of Google Maps Content; a photo name may not be cached)
// REMOVED that machinery. The assertions that protected it are replaced here by
// the OPPOSITE invariants, and the spend protections that survive are still
// executed through resolvePlacePhoto with googleSurface:true:
//   1. Width: every card width <=800 asks Google for ONE canonical width (640),
//      a >800 hero keeps its own width. (No cache row to share any more: each
//      credited request is its own live, fully-granted attempt.)
//   2. Singleflight: concurrent same-place callers share ONE attempt (one
//      photos grant, one Details grant, one media call). RED-PROVED against a
//      mutated COPY of the real module.
//   3. A stale (404) or client-400 media answer on the CURRENT name never
//      follows and never heals: stored names are not sent to Google at all.
//   4. An unowned 2xx still follows (the one class that can differ).
//   5. NO cache: the resolver never reads or writes a photo|/photoneg| row. A
//      miss (nophoto, quota) is NOT remembered, so the next request asks again
//      through the ledger.
//   6. spendAllowPhotos() refuses outright outside production unless
//      WAYFIND_ALLOW_NONPROD_PHOTO_SPEND=1.
//   7. Fresh-name-first is the only order: free Details IDs Only, then exactly
//      ONE billed media call; a failed lookup is a miss, never a stored-name
//      fallback.
//   8. Place-only discovery: the pseudo-name is never sent to the media endpoint.
//
// HERMETIC: zero network. Every scenario injects deps.fetchImpl (a scripted
// Google stub), deps.authorizeSpend, deps.breakerOpen/deps.tripBreaker (fake,
// in-memory, NEVER the real lib/providerHealth.js breaker) and deps.refund
// (fake). Section 6 (the nonprod spend block) stubs globalThis.fetch around the
// REAL lib/spendGate.js spendAllowPhotos(), like scripts/test-photos-paid-cap.mjs.
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalPhotoWidth } from "../lib/photoCacheRecovery.js";
import {
  placeDiscoveryRef,
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

// A scripted Google double (kinds: details / skip / follow).
function googleStub(script) {
  const calls = [];
  const urls = [];
  const fn = async (url) => {
    const u = String(url);
    urls.push(u);
    if (!u.startsWith("https://places.googleapis.com/v1/")) throw new Error("test bug: unexpected url " + u);
    let kind;
    if (u.includes("?fields=photos")) kind = "details";
    else if (u.includes("skipHttpRedirect=true")) kind = "skip";
    else if (u.includes("/media?")) kind = "follow";
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
  return { fn, calls, urls };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const FAKE_DEPS = { breakerOpen: async () => null, tripBreaker: async () => true, refund: async () => true, retryDelayMs: 0 };

const DET = (name) => ({ details: [{ status: 200, body: { photos: [{ name }] } }] });
const VIA = { googleSurface: true };

/* ── 1. WIDTH: every card width asks Google for ONE canonical width ─────── */
{
  const PLACE = "ChIJSpendEfficiencyWidths01";
  const FRESH = `places/${PLACE}/photos/WIDTHDEDUP`;
  const OWNED = "https://lh3.googleusercontent.com/p/width-dedup-owned";
  const widths = {};
  for (const w of [240, 400, 480, 640, 720, 800, 1200]) {
    const stub = googleStub({ ...DET(FRESH), skip: [{ status: 200, body: { photoUri: OWNED } }] });
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const r = await resolvePlacePhoto({ place: PLACE, w, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...FAKE_DEPS, inventoryGet: async () => null, fetchImpl: stub.fn });
    eq(r.type, "redirect", `1: w=${w} redirects`);
    eq(auth.granted("photos"), 1, `1: w=${w} takes exactly ONE photos grant`);
    eq(stub.calls.join(","), "details,skip", `1: w=${w} is one Details + ONE media call`);
    widths[w] = (stub.urls[1].match(/maxWidthPx=(\d+)/) || [])[1];
  }
  for (const w of [240, 400, 480, 640, 720, 800]) eq(widths[w], "640", `1: card width ${w} asks Google for the canonical 640, never the raw width`);
  eq(widths[1200], "1200", "1: a >800 hero keeps its own 1200 (control: the fold is not unconditional)");
}

/* ── 2. SINGLEFLIGHT: concurrent same-place callers share ONE paid attempt ─ */
const SF_PLACE = "ChIJSpendEfficiencyConcurrency01";
const SF_FRESH = `places/${SF_PLACE}/photos/CONCURRENCYTEST`;
const SF_OWNED = "https://lh3.googleusercontent.com/p/concurrency-owned";
async function singleflightScenario(resolveFn) {
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  let fetchCalls = 0;
  const gate = deferred();
  const fetchImpl = async (url) => {
    fetchCalls++;
    await gate.promise; // held open until BOTH callers have reached the paid section
    if (String(url).includes("?fields=photos")) return { ok: true, status: 200, url: "", json: async () => ({ photos: [{ name: SF_FRESH }] }) };
    return { ok: true, status: 200, url: "", json: async () => ({ photoUri: SF_OWNED }) };
  };
  const deps = { ...FAKE_DEPS, inventoryGet: async () => null, fetchImpl };
  // Different raw widths (480, 720) that BOTH canonicalize to 640 — the
  // singleflight key is the CANONICAL width, not the raw one.
  const p1 = resolveFn({ place: SF_PLACE, w: 480, serverKey: "k", authorizeSpend: auth, ...VIA }, deps);
  const p2 = resolveFn({ place: SF_PLACE, w: 720, serverKey: "k", authorizeSpend: auth, ...VIA }, deps);
  for (let i = 0; i < 20; i++) await Promise.resolve(); // let both callers' inventory awaits settle
  gate.resolve();
  const [r1, r2] = await Promise.all([p1, p2]);
  return { auth, fetchCalls, r1, r2 };
}
{
  const { auth, fetchCalls, r1, r2 } = await singleflightScenario(resolvePlacePhoto);
  eq(auth.granted("photos"), 1, "2: two concurrent callers (same canonical 640) take exactly ONE photos grant combined");
  eq(auth.granted("details_ids_only"), 1, "2: and exactly ONE Details grant");
  eq(fetchCalls, 2, "2: one Details call + ONE media call for both callers");
  eq(r1.type, "redirect", "2: caller 1 gets a redirect");
  eq(r2.type, "redirect", "2: caller 2 gets a redirect");
  eq(r1.location, r2.location, "2: both callers get the SAME redirect target");
  eq(r1.location, SF_OWNED, "2: the shared redirect target is the real photo");
}
// RED-PROOF (real module, mutated COPY): with the in-flight lookup removed the same two
// callers take TWO photos grants — the exact waste singleflight removes.
{
  const src = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8");
  const needle = "  if (inflight) return inflight;\n";
  ok(src.includes(needle), "2 red-proof setup: the in-flight lookup line was found in lib/placePhotoServe.js");
  const mutated = src.replace(needle, "");
  ok(mutated !== src, "2 red-proof: the mutation applied");
  const libUrl = new URL("../lib/", import.meta.url);
  const rewritten = mutated.replace(/from "\.\/([^"]+)"/g, (_, f) => `from ${JSON.stringify(new URL(f, libUrl).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-spend-eff-mut-")), "placePhotoServe.mjs");
  writeFileSync(tmp, rewritten);
  try {
    const M = await import(pathToFileURL(tmp).href);
    const { auth, fetchCalls } = await singleflightScenario(M.resolvePlacePhoto);
    eq(auth.granted("photos"), 2, "2 RED-PROOF: without the in-flight lookup, two concurrent callers take TWO photos grants (so the 1-grant assertion above is falsifiable)");
    ok(fetchCalls > 2, "2 RED-PROOF: and make more outbound calls (" + fetchCalls + ")");
  } finally {
    try { unlinkSync(tmp); } catch { /* cleanup */ }
  }
}

/* ── 3. A STALE / 400 MEDIA ANSWER NEVER FOLLOWS AND NEVER HEALS ─────────── */
{
  const PLACE = "ChIJSpendEfficiencyHeal01";
  const STORED = `places/${PLACE}/photos/OLDNAME`;
  const FRESH = `places/${PLACE}/photos/NEWNAME`;
  for (const status of [404, 400]) {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const stub = googleStub({ ...DET(FRESH), skip: [{ status }] });
    const result = await resolvePlacePhoto({ ref: STORED, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...FAKE_DEPS, inventoryGet: async () => null, fetchImpl: stub.fn });
    eq(stub.calls.join(","), "details,skip", `3(${status}): one Details + one media call — no follow, no heal`);
    eq(result.type, "miss", `3(${status}): an honest miss`);
    eq(auth.granted("details_ids_only"), 1, `3(${status}): exactly one Details grant (a second lookup would be the old heal)`);
    eq(auth.granted("photos"), 1, `3(${status}): exactly one photos grant (a follow would be a second)`);
    ok(!stub.urls.some((u) => u.includes("OLDNAME")), `3(${status}): the stored name is never sent to Google`);
  }
}

/* ── 4. UNOWNED 2xx STILL FOLLOWS (positive control) ─────────────────────── */
{
  const PLACE = "ChIJSpendEfficiencyUnowned01";
  const FRESH = `places/${PLACE}/photos/UNOWNEDTEST`;
  const OWNED = "https://lh3.googleusercontent.com/p/unowned-then-owned";
  const auth = authorizer({ photos: 99, details_ids_only: 99 });
  const stub = googleStub({
    ...DET(FRESH),
    skip: [{ status: 200, body: { photoUri: "http://not-owned.example/x.jpg" } }],
    follow: [{ status: 200, url: OWNED }],
  });
  const result = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...FAKE_DEPS, inventoryGet: async () => null, fetchImpl: stub.fn });
  eq(stub.calls.join(","), "details,skip,follow", "4: unowned 2xx still follows — the ONE class that does");
  eq(result.type, "redirect", "4: the follow succeeds");
  eq(result.location, OWNED, "4: the followed uri is served");
}

/* ── 5. NO CACHE, NO NEGATIVE CACHE ──────────────────────────────────────── */
// The removed 24h negative cache is replaced by its opposite: nothing about a
// miss is remembered, so the next request goes through the ledger again.
{
  const PLACE = "ChIJSpendEfficiencyNegCache01";
  const cacheCalls = [];
  const trap = { cacheGet: async (k) => { cacheCalls.push("get:" + k); return { v: { uri: "https://lh3.googleusercontent.com/p/legacy" }, stale: false, ageMs: 1 }; }, cacheSet: async (k) => { cacheCalls.push("set:" + k); } };
  // First: the place has no photo (an old negative cache would now suppress the second ask).
  const auth1 = authorizer({ photos: 99, details_ids_only: 99 });
  const stub1 = googleStub({ details: [{ status: 200, body: { photos: [] } }] });
  const first = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth1, ...VIA }, { ...FAKE_DEPS, ...trap, inventoryGet: async () => null, fetchImpl: stub1.fn });
  eq(first.type, "miss", "5: first request is a genuine miss");
  eq(first.upstream, "fresh-nophoto", "5: classified fresh-nophoto");
  const auth2 = authorizer({ photos: 99, details_ids_only: 99 });
  const stub2 = googleStub({ details: [{ status: 200, body: { photos: [] } }] });
  const second = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth2, ...VIA }, { ...FAKE_DEPS, ...trap, inventoryGet: async () => null, fetchImpl: stub2.fn });
  eq(second.reason, "owned-miss", "5: the second request is NOT answered from a negative cache");
  ok(auth2.asked("photos") >= 1 && stub2.calls.length === 1, "5: the second request asks the ledger and Google again (nothing was remembered)");
  eq(cacheCalls.length, 0, "5: the resolver made ZERO cacheGet/cacheSet calls, even with a legacy warm row offered");
  // A quota outcome is likewise not remembered.
  const auth3 = authorizer({ photos: 99, details_ids_only: 99 });
  const stub3 = googleStub({ ...DET(`places/${PLACE}/photos/Q`), skip: [{ status: 429 }] });
  const q1 = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth3, ...VIA }, { ...FAKE_DEPS, ...trap, inventoryGet: async () => null, fetchImpl: stub3.fn });
  eq(q1.upstream, "fresh-failed:quota", "5: classified quota");
  eq(cacheCalls.length, 0, "5: a quota outcome writes no marker anywhere");
  // Static: the resolver module's executable code touches no photo cache at all.
  const src = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  ok(!/\b(?:cacheGet|cacheSet|cacheDel|cget|cset)\s*\(/.test(src) && !/\bd\.cache(?:Get|Set|Del)\b/.test(src), "5: lib/placePhotoServe.js contains no cache read/write call (comment-stripped)");
  ok(/export function photoCacheKey/.test(src), "5 positive control: the stripped probe still sees the legacy key helper it targets");
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

// RED-PROOF 1 — follow-on-stale must stay gone (rule simulation; the real path is
// executed in section 3, where a follow would show up as a third call).
{
  const realFollowEligible = (skipCls) => skipCls === "unowned";
  const mutatedFollowEligible = (skipCls, status) => skipCls === "unowned" || skipCls === "stale" || (skipCls === "client" && status === 400);
  eq(realFollowEligible("stale"), false, "red-proof control: the real rule refuses to follow a stale skip");
  eq(mutatedFollowEligible("stale", 404), true, "red-proof: the OLD rule would still follow a stale skip");
  ok(realFollowEligible("stale") !== mutatedFollowEligible("stale", 404),
    "RED-PROOF 1: re-enabling follow-on-stale changes the verdict — this guard's own case 3 (details,skip only) would fail under it");
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
    "RED-PROOF 3: dropping the width fold changes the verdict — this guard's own case 1 (every card width asks Google for 640) would fail under it");
}

/* 7. FRESH NAME FIRST IS THE ONLY ORDER: one free IDs-only lookup, then exactly ONE billed media call */
// 2026-09-17: the first five visible cards filled after v8.56.20 all carried
// expired stored names, so each paid a billed dead-name call before healing.
// 2026-10-08: the stored-name fallback is gone altogether (a stored photo name
// is never sent to Google), so a failed lookup is a miss.
{
  const PLACE = "ChIJSpendEfficiencyFresh0001";
  const REF = `places/${PLACE}/photos/STOREDOLDNAME`;
  const FRESH = `places/${PLACE}/photos/FRESHCURRENTNAME`;
  const OWNED = "https://lh3.googleusercontent.com/p/fresh-first-owned";
  const base = { ...FAKE_DEPS, inventoryGet: async () => null };

  // 7a: fresh name found -> details then ONE media call on the fresh name; the stored name is never tried
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const stub = googleStub({ ...DET(FRESH), skip: [{ status: 200, body: { photoUri: OWNED } }] });
    const r = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...base, fetchImpl: stub.fn });
    eq(stub.calls.join(","), "details,skip", "7a: the free lookup, then one media call on the FRESH name");
    ok(stub.urls[1].includes("FRESHCURRENTNAME") && !stub.urls.some((u) => u.includes("STOREDOLDNAME")), "7a: the media call carries the fresh name; the stored name is never sent");
    eq(r.type, "redirect", "7a: served");
    eq(auth.granted("photos"), 1, "7a: exactly one photos grant (one billed media call)");
    eq(auth.granted("details_ids_only"), 1, "7a: one IDs-only grant");
  }
  // 7b: the place has no photo now -> no media call at all, the resolver's photos grant is refunded
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const refunds = [];
    const stub = googleStub({ details: [{ status: 200, body: { photos: [] } }] });
    const r = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...base, fetchImpl: stub.fn, refund: async (sku, n) => { refunds.push(sku + ":" + n); return true; } });
    eq(stub.calls.join(","), "details", "7b: no media call when Google reports no photo");
    eq(r.upstream, "fresh-nophoto", "7b: classified fresh-nophoto");
    ok(refunds.includes("photos:1"), `7b: the unused photos grant is refunded (refunds: ${JSON.stringify(refunds)})`);
  }
  // 7c: lookup fails -> NO stored-name fallback (the opposite of the old rule), nothing billed left over
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const stub = googleStub({ details: [{ status: 503 }], skip: [{ status: 200, body: { photoUri: OWNED } }] });
    const r = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...base, fetchImpl: stub.fn });
    eq(stub.calls.join(","), "details", "7c: a failed lookup does NOT fall back to the stored name");
    eq(r.type, "miss", "7c: honest miss");
    eq(r.upstream, "place-lookup-failed", "7c: classified place-lookup-failed");
    eq(stub.urls.some((u) => u.includes("STOREDOLDNAME")), false, "7c: the stored name never reaches Google");
  }
  // 7d: fresh media call hits the daily quota -> classified and the breaker trips
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const trips = [];
    const stub = googleStub({ ...DET(FRESH), skip: [{ status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } }] });
    const r = await resolvePlacePhoto({ ref: REF, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...base, fetchImpl: stub.fn, tripBreaker: async (...a) => { trips.push(a[1]); return true; } });
    eq(r.upstream, "fresh-failed:quota", "7d: quota on the fresh name is classified");
    eq(trips.join(","), "quota", "7d: and trips the daily breaker");
  }
  // 7e: the route hands the resolver the surface decision (and nothing about stored names)
  {
    const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
    ok(/googleSurface,/.test(route), "7e: app/api/photo/route.js passes googleSurface to the resolver");
    const cur = route.replace(/\/\/[^\n]*/g, "").match(/currentRef:\s*([^,\n]+)/);
    ok(!!cur && cur[1].trim() === '""', "7e: the route never forwards a stored photo ref anywhere (currentRef is the empty string; the probe found it: " + (cur && cur[1].trim()) + ")");
  }
}

/* 8. PLACE-ONLY DISCOVERY: a `?place=` request asks Google through the same gate, only on the credited surface */
{
  const PLACE = "ChIJSpendEfficiencyPlaceOnly01";
  const FRESH = `places/${PLACE}/photos/DISCOVEREDNAME`;
  const OWNED = "https://lh3.googleusercontent.com/p/place-only-owned";
  const noInv = { ...FAKE_DEPS, inventoryGet: async () => null };
  // 8a: probe reports an honest miss that needs work (not "no-photo") and spends nothing
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    let calls = 0;
    const r = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth, probe: true, ...VIA }, { ...noInv, fetchImpl: async () => { calls++; throw new Error("probe must not fetch"); } });
    eq(r.reason, "probe-no-spend", "8a: a place-only probe is a probe-no-spend miss, not no-photo");
    eq(calls + auth.asked(), 0, "8a: the probe asks for nothing");
  }
  // 8b: real request: free lookup, then ONE media call on the discovered name; NOT cached
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const stub = googleStub({ ...DET(FRESH), skip: [{ status: 200, body: { photoUri: OWNED } }, { status: 200, body: { photoUri: OWNED } }], details: [{ status: 200, body: { photos: [{ name: FRESH }] } }, { status: 200, body: { photos: [{ name: FRESH }] } }] });
    const deps = { ...noInv, fetchImpl: stub.fn };
    const r = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, deps);
    eq(stub.calls.join(","), "details,skip", "8b: one free lookup, then one media call on the discovered name");
    eq(r.type, "redirect", "8b: served");
    eq(auth.granted("photos"), 1, "8b: exactly one photos grant");
    eq(r.cacheControl, "private, no-store", "8b: the live redirect is never cacheable");
    const again = await resolvePlacePhoto({ place: PLACE, w: 400, serverKey: "k", authorizeSpend: auth, ...VIA }, deps);
    eq(again.reason, "google", "8b: the next request is a NEW live attempt, not a cache hit");
    eq(stub.calls.length, 4, "8b: and pays its own lookup + media call (no cached copy exists)");
    eq(auth.granted("photos"), 2, "8b: through its own photos grant");
  }
  // 8c: Google has no photo for the place -> no media call, grant refunded
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const refunds = [];
    const stub = googleStub({ details: [{ status: 200, body: {} }] });
    const r = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...noInv, fetchImpl: stub.fn, refund: async (sku, n) => { refunds.push(sku + ":" + n); return true; } });
    eq(stub.calls.join(","), "details", "8c: no media call when the place has no photo");
    eq(r.upstream, "fresh-nophoto", "8c: classified fresh-nophoto");
    ok(refunds.includes("photos:1"), "8c: the unused photos grant is refunded");
  }
  // 8d: the lookup fails -> the pseudo name is NEVER sent to the media endpoint
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const refunds = [];
    const stub = googleStub({ details: [{ status: 503 }] });
    const r = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth, ...VIA }, { ...noInv, fetchImpl: stub.fn, refund: async (sku, n) => { refunds.push(sku + ":" + n); return true; } });
    eq(stub.calls.join(","), "details", "8d: a failed lookup never sends the discovery pseudo-name to the media endpoint");
    eq(r.upstream, "place-lookup-failed", "8d: classified place-lookup-failed (transient)");
    ok(refunds.includes("photos:1"), "8d: the unused photos grant is refunded");
    eq(stub.urls.some((u) => u.includes("wfplacediscovery")), false, "8d: the pseudo segment never appears in an outbound URL");
  }
  // 8e: CONTROL: on a non-credited surface a place-only request asks for nothing
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const r = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", authorizeSpend: auth }, { ...noInv, fetchImpl: async () => { throw new Error("no fetch without the credited surface"); } });
    eq(r.reason, "not-google-surface", "8e: control: no credited surface keeps an honest no-spend miss");
    eq(auth.asked(), 0, "8e: control: no grant asked");
  }
  // 8f: the resolver stays place-only, and the placeOnly stop exists before any stored-name attempt
  {
    const src = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8");
    ok(/placeOnly:\s*true/.test(src), "8f: the resolver always calls the fetcher in placeOnly mode");
    ok(/if \(opts && opts\.placeOnly\) \{\s*return flush/.test(src), "8f red-proof anchor: the placeOnly stop exists before the stored-name attempt (8d proves by call log that removing it would call the media endpoint with the pseudo-name)");
    ok(placeDiscoveryRef(PLACE).endsWith("/photos/wfplacediscovery"), "8f: the pseudo segment is the fixed discovery marker");
  }
}


/* hermetic breaker: a fake upstream never reads production's breaker */
// 2026-09-17: the v8.56.20 Vercel preview build ran this suite with the
// production Supabase env present while the real google-photos-quota breaker
// was still open, and check-no-imageless-card failed on a quota-open that had
// nothing to do with the code under test. The breaker below is tripped in THIS
// process's memory (no Supabase env here), reproducing that exact state.
{
  const { tripBreaker, breakerOpen, resetBreaker } = await import("../lib/providerHealth.js");
  await tripBreaker("google-photos-quota", "quota", "hermetic-breaker control", 60 * 60 * 1000);
  ok(!!(await breakerOpen("google-photos-quota")), "hermetic control: the in-process breaker really is open for this case");
  let fetches = 0;
  const faked = await resolvePlacePhoto({ ref: "places/ChIJHermeticPlaceXYZ/photos/HERMETICREF", w: 640, spendAllowed: true, serverKey: "test-key", googleSurface: true }, {
    inventoryGet: async () => null,
    fetchOwnedUri: async () => { fetches++; return "https://lh3.googleusercontent.com/place-photos/hermetic"; },
  });
  eq(faked.type, "redirect", "HERMETIC: a caller with an injected fake Google is not blocked by the live breaker");
  eq(fetches, 1, "HERMETIC: the injected fake Google was actually called once");
  let grants = 0;
  const real = await resolvePlacePhoto({ ref: "places/ChIJHermeticPlaceXYZ/photos/HERMETICREF", w: 640, serverKey: "test-key", googleSurface: true, authorizeSpend: async () => { grants++; return true; } }, {
    inventoryGet: async () => null,
  });
  eq(real.reason, "quota-open", "CONTROL: the production shape (no injected fetcher) still honours an open breaker");
  eq(grants, 0, "CONTROL: an open breaker still asks the ledger for zero grants");
  await resetBreaker("google-photos-quota");
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
console.log(`test-photo-spend-efficiency: OK — ${pass} assertions; every card width folds to ONE canonical fetch, concurrent same-place callers share ONE paid attempt (red-proved on a mutated copy), a stale/400 skip never follows or heals, unowned still follows, nothing is cached or negative-cached (resolver makes zero cache calls), a failed Details lookup never falls back to a stored name, a Preview/dev deployment cannot spend the production ledger, and the red-proofs confirm the invariants are falsifiable`);
