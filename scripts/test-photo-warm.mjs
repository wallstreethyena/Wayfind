#!/usr/bin/env node
/**
 * scripts/test-photo-warm.mjs — hermetic lock on the self-healing photo-warm
 * cron (lib/photoWarm.js's runPhotoWarm + app/api/cron/photo-warm/route.js).
 *
 * WHY THIS EXISTS. Production must now warm its own missing place photos,
 * hourly, by calling its OWN gated /api/photo route the way a real card does
 * — never a second, parallel spend path. Every safety property that makes
 * that acceptable (never spends outside production, never double-charges a
 * place already served, stops the instant the shared ledger/quota/gate says
 * no, never exceeds its own paid-attempt bound) is proved here by EXECUTING
 * the real functions against an injected fetch and clock — never by
 * regexing source for behaviour, except the two purely structural checks
 * (auth shape, vercel.json) called out below.
 *
 * HERMETIC: fetch and the wall clock are both injected into runPhotoWarm();
 * the route-level cases (auth, non-production) trap the global `fetch` for
 * the duration of one call and restore it immediately after, the same
 * fetch-trap shape scripts/test-photo-repair-deadline.mjs and friends use, so
 * this file makes no real network request under any circumstance. No
 * process.env read decides a verdict — every env value used below is SET by
 * this file for the one call it drives, then restored (scripts/check-guard-
 * hermeticity.mjs).
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

register("./lib/nodeResolveHook.mjs", import.meta.url);

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

const { runPhotoWarm, DEFAULT_PHOTO_WARM_MAX, SERVED_RESULTS, PAUSE_REASONS } = await import("../lib/photoWarm.js");

// ── fixtures ────────────────────────────────────────────────────────────
const ORIGIN = "https://www.gowayfind.com";

function place(id, ref) {
  return { placeId: id, photoRef: ref, photo: null, name: id };
}

/** A fake PHOTO_SURFACES-shaped surface whose endpoint just returns a fixed places array. */
function fakeSurface(id, places, { perCity = false, endpointPath = "/api/fake" } = {}) {
  return {
    id,
    label: id,
    perCity,
    components: [],
    endpoints: [{ path: endpointPath, params: () => ({}), extract: (json) => (json && json.places) || [] }],
  };
}

function jsonResponse(body) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), headers: { get: () => null } };
}

function photoResponse(resultHeader, status = 302) {
  return { ok: true, status, headers: { get: (k) => (String(k).toLowerCase() === "x-wayfind-photo-result" ? resultHeader : null) } };
}

/**
 * A fetchImpl that:
 *  - answers the surface endpoint(s) with their fixed JSON,
 *  - answers a /api/photo URL according to `photoPlan[ref] = {check, real}`
 *    (either half omitted means "must never be called" — calling it anyway
 *    throws, which is this suite's red-proof mechanism: a regression that
 *    makes a forbidden call fails LOUDLY, not silently passes),
 *  - records every call as {url, probe} in `calls`.
 */
function makeFetch({ endpoints = {}, photoPlan = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const probe = !!(opts.headers && opts.headers["x-wayfind-photo-probe"] === "1");
    calls.push({ url, probe });
    for (const [prefix, body] of Object.entries(endpoints)) {
      if (url.startsWith(ORIGIN + prefix)) return jsonResponse(body);
    }
    const m = /[?&]ref=([^&]+)/.exec(url);
    const ref = m ? decodeURIComponent(m[1]) : null;
    const plan = ref && photoPlan[ref];
    if (!plan) throw new Error(`test-photo-warm fixture: unexpected fetch to ${url} (probe=${probe}) — no plan configured`);
    const half = probe ? plan.check : plan.real;
    if (!half) throw new Error(`test-photo-warm RED-PROOF TRIPPED: a ${probe ? "check" : "real"} request reached ${url}, which this fixture explicitly says must never happen`);
    return photoResponse(half);
  };
  return { fetchImpl, calls };
}

// ── (a) empty places get exactly one real request each; served get zero,
//        AND a red-proof: the fixture throws if the already-served place's
//        real (non-probe) leg is ever reached. ───────────────────────────
{
  const p1 = place("ChIJserved00000000000001", "places/ChIJserved00000000000001/photos/x");
  const p2 = place("ChIJempty000000000000002", "places/ChIJempty000000000000002/photos/x");
  const p3 = place("ChIJempty000000000000003", "places/ChIJempty000000000000003/photos/x");
  const { fetchImpl, calls } = makeFetch({
    endpoints: { "/api/fake": { places: [p1, p2, p3] } },
    photoPlan: {
      [p1.photoRef]: { check: "cache" }, // served on probe — .real intentionally absent: reaching it is the red-proof
      [p2.photoRef]: { check: "no-photo", real: "google" },
      [p3.photoRef]: { check: "owned-miss", real: "owned-free" },
    },
  });
  const result = await runPhotoWarm({
    origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 10,
  });
  eq(result.visible, 3, "case a: three distinct places seen");
  eq(result.alreadyServed, 1, "case a: exactly one place was already served");
  eq(result.attempted, 2, "case a: exactly one REAL request per empty place (2 empty places -> 2 real requests)");
  eq(result.filled, 1, "case a: the google-filled place counts as filled");
  eq(result.free, 1, "case a: the owned-free-filled place counts as free");
  const p1Calls = calls.filter((c) => c.url.includes(encodeURIComponent(p1.photoRef)));
  eq(p1Calls.length, 1, "case a red-proof: the already-served place got exactly one fetch total (the check) — a second call would have thrown");
  ok(p1Calls[0].probe === true, "case a: the one call made for the served place carried the probe header");
}

// ── (b) stop at the first quota-open/spend-denied, AND a red-proof: the
//        fixture throws if either subsequent place is touched AT ALL. ──────
for (const pauseReason of ["quota-open", "spend-denied", "gate-shut", "unconfigured"]) {
  const p1 = place("ChIJpause0000000000000a1", "places/ChIJpause0000000000000a1/photos/x");
  const p2 = place("ChIJpause0000000000000a2", "places/ChIJpause0000000000000a2/photos/x");
  const p3 = place("ChIJpause0000000000000a3", "places/ChIJpause0000000000000a3/photos/x");
  const { fetchImpl, calls } = makeFetch({
    endpoints: { "/api/fake": { places: [p1, p2, p3] } },
    photoPlan: {
      [p1.photoRef]: { check: "no-photo", real: pauseReason },
      // p2 and p3 carry NO plan at all — any touch throws (the red-proof).
    },
  });
  const result = await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 10 });
  ok(PAUSE_REASONS.has(pauseReason), `case b sanity: ${pauseReason} is in PAUSE_REASONS`);
  eq(result.paused, true, `case b (${pauseReason}): run reports paused`);
  eq(result.pausedReason, pauseReason, `case b (${pauseReason}): pausedReason is the exact reason that stopped it`);
  eq(result.attempted, 1, `case b (${pauseReason}): exactly one real attempt was made before stopping`);
  const touchedP2orP3 = calls.some((c) => c.url.includes(encodeURIComponent(p2.photoRef)) || c.url.includes(encodeURIComponent(p3.photoRef)));
  ok(!touchedP2orP3, `case b (${pauseReason}) red-proof: neither later place was touched at all after the pause — the fixture would have thrown otherwise`);
}

// ── (c) PHOTO_WARM_MAX bounds paid attempts ─────────────────────────────
{
  const places = Array.from({ length: 5 }, (_, i) => place(`ChIJmax0000000000000${i}0`, `places/ChIJmax0000000000000${i}0/photos/x`));
  const photoPlan = {};
  for (const p of places) photoPlan[p.photoRef] = { check: "no-photo", real: "google" };
  const { fetchImpl } = makeFetch({ endpoints: { "/api/fake": { places } }, photoPlan });
  const result = await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 2 });
  eq(result.attempted, 2, "case c: attempted stops exactly at PHOTO_WARM_MAX (2), never at the 5 visible empty places");
  eq(result.stopReason, "max", "case c: stopReason records the bound that stopped it");
  ok(DEFAULT_PHOTO_WARM_MAX === 150, "case c sanity: DEFAULT_PHOTO_WARM_MAX is 150 (the documented default)");
}

// ── (e) a place appearing on SEVERAL surfaces/cities is requested once ──
{
  const shared = place("ChIJshared0000000000001", "places/ChIJshared0000000000001/photos/x");
  const onlyOnB = place("ChIJonlyb00000000000002", "places/ChIJonlyb00000000000002/photos/x");
  const surfaces = [
    fakeSurface("a", null, { endpointPath: "/api/a" }),
    fakeSurface("b", null, { endpointPath: "/api/b" }),
  ];
  surfaces[0].endpoints[0].extract = () => [shared];
  surfaces[1].endpoints[0].extract = () => [shared, onlyOnB];
  const { fetchImpl, calls } = makeFetch({
    endpoints: { "/api/a": {}, "/api/b": {} },
    photoPlan: {
      [shared.photoRef]: { check: "no-photo", real: "google" },
      [onlyOnB.photoRef]: { check: "cache" },
    },
  });
  const result = await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces, cities: [null], offsetHour: 0, max: 10 });
  eq(result.visible, 2, "case e: the shared place is counted once across two surfaces, not twice");
  eq(result.attempted, 1, "case e: the shared place gets exactly one real request total, not one per surface");
  const sharedFetches = calls.filter((c) => c.url.includes(encodeURIComponent(shared.photoRef)));
  eq(sharedFetches.length, 2, "case e: the shared place's photo URL is touched exactly twice total (one check, one real, since it probes empty) - appearing on a second surface adds NO extra fetch, proving dedupe ran before any request");
}

// ── (f) the probe header is never sent on the real request and always sent
//        on the check ──────────────────────────────────────────────────
{
  const p = place("ChIJheader000000000000f1", "places/ChIJheader000000000000f1/photos/x");
  const { fetchImpl, calls } = makeFetch({
    endpoints: { "/api/fake": { places: [p] } },
    photoPlan: { [p.photoRef]: { check: "no-photo", real: "google" } },
  });
  await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 10 });
  const photoCalls = calls.filter((c) => c.url.includes(encodeURIComponent(p.photoRef)));
  eq(photoCalls.length, 2, "case f: exactly two calls reached this place's photo URL (check, then real)");
  ok(photoCalls[0].probe === true, "case f: the FIRST call (the check) carried the probe header");
  ok(photoCalls[1].probe === false, "case f: the SECOND call (the real request) carried NO probe header");
}

// ── (d) non-production makes zero requests, AND a red-proof: any fetch call
//        made in this mode throws. Route-level: traps the global fetch. ────
{
  const ROUTE_URL = new URL("../app/api/cron/photo-warm/route.js", import.meta.url);
  const routeSrc = readFileSync(ROUTE_URL, "utf8");
  const route = await import(ROUTE_URL.href);

  const savedFetch = globalThis.fetch;
  const savedSecret = process.env.CRON_SECRET;
  const savedEnv = process.env.VERCEL_ENV;
  const savedMax = process.env.PHOTO_WARM_MAX;
  let calls = 0;
  globalThis.fetch = async (...a) => { calls++; throw new Error("RED-PROOF TRIPPED: photo-warm made a network call outside production: " + a[0]); };
  process.env.CRON_SECRET = "test-secret";
  process.env.VERCEL_ENV = "preview";
  delete process.env.PHOTO_WARM_MAX;
  try {
    const req = { headers: { get: (k) => (String(k).toLowerCase() === "authorization" ? "Bearer test-secret" : null) }, url: "https://preview.gowayfind.com/api/cron/photo-warm" };
    const res = await route.GET(req);
    const body = await res.json();
    eq(res.status, 200, "case d: non-production still answers 200");
    eq(body.skipped, true, "case d: non-production reports skipped:true");
    eq(calls, 0, "case d red-proof: zero fetch calls were made — any call at all would have thrown inside the trap");
  } finally {
    globalThis.fetch = savedFetch;
    if (savedSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret;
    if (savedEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = savedEnv;
    if (savedMax === undefined) delete process.env.PHOTO_WARM_MAX; else process.env.PHOTO_WARM_MAX = savedMax;
  }

  // ── (g) auth: missing/wrong CRON_SECRET is refused, before any network ──
  {
    const savedSecret2 = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "right-secret";
    let authCalls = 0;
    globalThis.fetch = async () => { authCalls++; throw new Error("must not fetch on an auth failure"); };
    try {
      const noAuth = { headers: { get: () => null }, url: "https://www.gowayfind.com/api/cron/photo-warm" };
      const wrongAuth = { headers: { get: (k) => (String(k).toLowerCase() === "authorization" ? "Bearer wrong" : null) }, url: "https://www.gowayfind.com/api/cron/photo-warm" };
      const r1 = await route.GET(noAuth);
      const r2 = await route.GET(wrongAuth);
      eq(r1.status, 401, "case g: a missing CRON_SECRET header is refused with 401");
      eq(r2.status, 401, "case g: a wrong bearer token is refused with 401");
      eq(authCalls, 0, "case g: an auth failure makes zero fetch calls");

      delete process.env.CRON_SECRET;
      const r3 = await route.GET(wrongAuth);
      eq(r3.status, 401, "case g: an UNSET CRON_SECRET also refuses (fail-closed, never fail-open)");
    } finally {
      globalThis.fetch = savedFetch;
      if (savedSecret2 === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret2;
    }
  }

  // ── structural: the route matches scripts/check-cron-failclosed.mjs's own
  // fail-closed shape (belt + suspenders — the executed cases above are the
  // real proof; this just keeps the file honest about why they pass). ─────
  ok(/CRON_SECRET/.test(routeSrc) && /if \(!secret\b/.test(routeSrc) && /Bearer/.test(routeSrc) && /401/.test(routeSrc),
    "case g structural: route.js carries the exact fail-closed shape scripts/check-cron-failclosed.mjs requires");
}

// ── (h) the new cron is present in vercel.json ──────────────────────────
{
  const vercel = JSON.parse(readFileSync(path.join(REPO, "vercel.json"), "utf8"));
  const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
  const entry = crons.find((c) => c.path === "/api/cron/photo-warm");
  ok(!!entry, "case h: vercel.json schedules /api/cron/photo-warm");
  ok(entry && /^\d+ \* \* \* \*$/.test(entry.schedule), `case h: photo-warm runs hourly (got schedule=${entry && entry.schedule})`);
}

// ── sanity: PAUSE_REASONS and SERVED_RESULTS match the documented contract
// (this repo's CONTEXT header: probe never spends; these are the exact
// x-wayfind-photo-result values that mean served vs a global pause). ──────
{
  eq([...SERVED_RESULTS].sort().join(","), ["cache", "google", "inventory", "inventory-ref-cache", "owned-free", "same-place-cache"].sort().join(","),
    "sanity: SERVED_RESULTS matches the documented probe contract exactly");
  eq([...PAUSE_REASONS].sort().join(","), ["gate-shut", "quota-open", "spend-denied", "unconfigured"].sort().join(","),
    "sanity: PAUSE_REASONS matches the documented pause contract exactly");
}

// (i) BATCHED PRE-CHECK: a place whose canonical cache row is fresh costs zero HTTP photo requests.
{
  const REF_A = "places/ChIJWarmBatchAAAAAA/photos/AAA";
  const REF_B = "places/ChIJWarmBatchBBBBBB/photos/BBB";
  const surface = { id: "t-batch", perCity: false, components: [], endpoints: [{ path: "/api/t-batch", extract: () => [
    { placeId: "ChIJWarmBatchAAAAAA", photoRef: REF_A }, { placeId: "ChIJWarmBatchBBBBBB", photoRef: REF_B },
    { placeId: "ChIJWarmBatchDirect", photo: "https://cdn.example/owned.jpg" },
  ] }] };
  const photoCalls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/api/t-batch")) return { ok: true, status: 200, text: async () => "{}", headers: { get: () => null } };
    photoCalls.push({ u, probe: !!(opts.headers && opts.headers["x-wayfind-photo-probe"]) });
    return { ok: false, status: 404, headers: { get: (k) => (k === "x-wayfind-photo-result" ? (opts.headers && opts.headers["x-wayfind-photo-probe"] ? "probe-no-spend" : "google") : null) } };
  };
  const res = await runPhotoWarm({ origin: "https://site.test", surfaces: [surface], cities: [], fetchImpl, cachedServed: async (refs) => new Set(refs.filter((r) => r === REF_A)), max: 10 });
  eq(photoCalls.filter((c) => c.u.includes("ChIJWarmBatchAAAAAA")).length, 0, "(i) a cached place is settled by the batch read with ZERO photo requests");
  eq(photoCalls.filter((c) => c.u.includes("ChIJWarmBatchBBBBBB")).length, 2, "(i) an uncached place gets one probe and one real request");
  eq(photoCalls.filter((c) => c.u.includes("cdn.example")).length, 0, "(i) a card with a direct owned URL is never requested");
  eq(res.alreadyServed, 2, "(i) cached + direct-owned both count as already served");
  eq(res.filled, 1, "(i) the one true miss is filled");
  // red-proof: a cachedServed that settles nothing forces a request for the cached place
  photoCalls.length = 0;
  await runPhotoWarm({ origin: "https://site.test", surfaces: [surface], cities: [], fetchImpl, cachedServed: async () => new Set(), max: 10 });
  ok(photoCalls.some((c) => c.u.includes("ChIJWarmBatchAAAAAA")), "(i) red-proof: without the batch read the cached place IS requested, so the zero above is load-bearing");
}

if (fail.length) {
  console.error(`test-photo-warm: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-photo-warm: OK — ${pass} assertions`);
