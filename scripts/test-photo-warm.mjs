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

const warmMod = await import("../lib/photoWarm.js");
const { DEFAULT_PHOTO_WARM_MAX, SERVED_RESULTS, PAUSE_REASONS, chunkKeysForUrl, WARM_CHECK_URL_BUDGET, warmMarkerKey, DEFINITIVE_EMPTY } = warmMod;
// Hermetic by default: marker reads/writes are stubbed so no case can touch a
// real cache table even when a Vercel build has production Supabase env set.
// Cases that test markers pass their own stubs; case (j) exercises the real
// batched read through its own trapped fetch.
const NO_MARKS = async () => ({ ok: new Set(), miss: new Set() });
const NO_WRITE = async () => {};
const runPhotoWarm = (o) => warmMod.runPhotoWarm({ readMarkers: NO_MARKS, writeMarker: NO_WRITE, ...o });

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
  // The job's own pulse row (lib/jobPulse.js, a Supabase PostgREST write) is
  // bookkeeping, not warm work, and it IS made when Supabase env is present,
  // as it is on the Vercel build that runs this suite (2026-09-17: the first
  // preview build of this guard failed here for exactly that reason). Only a
  // request to the site itself (an endpoint or /api/photo) counts, and trips.
  globalThis.fetch = async (...a) => {
    if (/\/rest\/v1\//.test(String(a[0]))) return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
    calls++;
    throw new Error("RED-PROOF TRIPPED: photo-warm made a network call outside production: " + a[0]);
  };
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
  const mins = entry ? String(entry.schedule).split(" ")[0].split(",") : [];
  ok(entry && /^[\d,]+ \* \* \* \*$/.test(entry.schedule) && mins.length >= 4, `case h: photo-warm runs at least four times an hour (got schedule=${entry && entry.schedule})`);
  const routeSrcH = readFileSync(path.join(REPO, "app/api/cron/photo-warm/route.js"), "utf8");
  ok(/offsetHour: Math\.floor\(startedAt \/ 900_000\)/.test(routeSrcH), "case h: the route rotates its starting surface per quarter hour, not per hour");
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

// (j) THE DEFAULT BATCHED CHECK REALLY WORKS WITH REAL-LENGTH GOOGLE NAMES.
// 2026-09-17 production: chunks of 150 ~700-char names built a >100 KB URL,
// every read was refused, and the run settled nothing. Exercise the REAL
// default path (lib/serverCache.js cgetMany) against a trapped PostgREST.
{
  const longRef = (i) => `places/ChIJLongRef${String(i).padStart(6, "0")}/photos/` + "A".repeat(680) + i;
  const refs = Array.from({ length: 60 }, (_, i) => longRef(i));
  const chunks = chunkKeysForUrl(refs.map((r) => "photo|" + r + "|640"));
  ok(chunks.length > 1, `(j) 60 real-length names are split into several chunks (got ${chunks.length})`);
  ok(chunks.every((c) => encodeURIComponent(c.map((k) => '"' + k + '"').join(",")).length <= WARM_CHECK_URL_BUDGET + 50), "(j) every chunk's encoded in-list stays inside the URL budget");
  const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const urlLens = [];
  const cachedEven = new Set(refs.filter((_, i) => i % 2 === 0));
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/rest/v1/wf_places_cache")) {
      urlLens.push(u.length);
      if (u.length > 16000) return new Response("URI too long", { status: 414 });
      const m = decodeURIComponent(u.split("k=in.(")[1].split(")&select")[0]);
      const keys = m.split('","').map((x) => x.replace(/^"|"$/g, ""));
      const rows = keys.filter((k) => cachedEven.has(k.slice(6, -4))).map((k) => ({ k, v: { uri: "https://lh3.googleusercontent.com/x" }, exp: new Date(Date.now() + 864e5).toISOString(), wrote_at: new Date().toISOString() }));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    }
    const probe = /\/api\/photo/.test(u);
    return { ok: !probe, status: probe ? 404 : 200, text: async () => "{}", headers: { get: (h) => (h === "x-wayfind-photo-result" ? "probe-no-spend" : null) } };
  };
  try {
    const surface = { id: "t-long", perCity: false, components: [], endpoints: [{ path: "/api/t-long", extract: () => refs.map((r, i) => ({ placeId: "ChIJLongRef" + i, photoRef: r })) }] };
    const res = await runPhotoWarm({ origin: "https://site.test", surfaces: [surface], cities: [], max: 0 });
    ok(urlLens.length > 1 && urlLens.every((n) => n <= 16000), `(j) every PostgREST read stays under the gateway limit (lengths ${Math.max(...urlLens)})`);
    eq(res.alreadyServed, 30, "(j) the 30 cached names are settled by the default batched read");
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
  // red-proof: one giant chunk (the shipped bug) is refused and settles nothing
  const giant = chunkKeysForUrl(refs.map((r) => "photo|" + r + "|640"), 10 ** 9);
  eq(giant.length, 1, "(j) red-proof setup: an unbounded budget yields one giant chunk");
  ok(encodeURIComponent(giant[0].map((k) => '"' + k + '"').join(",")).length > 16000, "(j) red-proof: that single chunk is over the gateway limit, which is exactly the production failure");
}

// ── (k) warm markers: served and settled-empty cards are skipped next run ─
{
  const pOk = place("ChIJmarkOk00000000000001", "places/ChIJmarkOk00000000000001/photos/x");
  const pMiss = place("ChIJmarkMiss000000000002", "places/ChIJmarkMiss000000000002/photos/x");
  const pNew = place("ChIJmarkNew0000000000003", "places/ChIJmarkNew0000000000003/photos/x");
  const pSame = place("ChIJmarkSame000000000004", "places/ChIJmarkSame000000000004/photos/x");
  const pGone = place("ChIJmarkGone000000000005", "places/ChIJmarkGone000000000005/photos/x");
  const pFlaky = place("ChIJmarkFlky000000000006", "places/ChIJmarkFlky000000000006/photos/x");
  const { fetchImpl, calls } = makeFetch({
    endpoints: { "/api/fake": { places: [pOk, pMiss, pNew, pSame, pGone, pFlaky] } },
    photoPlan: {
      // pOk and pMiss have NO plan: any request for them throws (the red-proof).
      [pNew.photoRef]: { check: "owned-miss", real: "google" },
      [pSame.photoRef]: { check: "same-place-cache" },
      [pGone.photoRef]: { check: "owned-miss", real: "no-photo" },
      [pFlaky.photoRef]: { check: "owned-miss", real: "upstream-error" },
    },
  });
  const pathOf = (pl) => calls.find((c) => c.url.includes(encodeURIComponent(pl.photoRef)))?.url.slice(ORIGIN.length);
  const writes = [];
  const readMarkers = async (paths) => ({
    ok: new Set(paths.filter((x) => x.includes(encodeURIComponent(pOk.photoRef)))),
    miss: new Set(paths.filter((x) => x.includes(encodeURIComponent(pMiss.photoRef)))),
  });
  const res = await warmMod.runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 10, cachedServed: async () => new Set(), readMarkers, writeMarker: async (kind, p) => { writes.push([kind, p]); } });
  eq(res.visible, 6, "(k) six visible places");
  eq(res.alreadyServed, 2, "(k) the ok-marked card and the probe-served card count as served");
  eq(res.knownEmpty, 1, "(k) the miss-marked card is counted as a known blank, not re-requested");
  eq(res.attempted, 3, "(k) only the three unmarked, unserved cards get a real request");
  eq(res.filled, 1, "(k) one real Google fill");
  eq(res.unchecked, 0, "(k) nothing is left unchecked");
  eq(res.empty, 3, "(k) empty = the settled blank + the two real misses");
  const w = (kind, pl) => writes.some(([k, p]) => k === kind && p === pathOf(pl));
  ok(w("ok", pSame), "(k) a probe-served card writes an ok marker");
  ok(w("ok", pNew), "(k) a real fill writes an ok marker");
  ok(w("miss", pGone), "(k) a definitive no-photo writes a miss marker");
  ok(!writes.some(([, p]) => p === pathOf(pFlaky)), "(k) a transient failure writes NO marker, so the next run retries it");
  eq(writes.length, 3, "(k) exactly three marker writes");
  ok(DEFINITIVE_EMPTY.has("no-photo") && !DEFINITIVE_EMPTY.has("quota-open") && !DEFINITIVE_EMPTY.has("spend-denied"), "(k) a pause is never treated as a settled blank");
  const k1 = warmMarkerKey("ok", "/api/photo?ref=" + "x".repeat(700));
  ok(k1.length < 50 && k1 === warmMarkerKey("ok", "/api/photo?ref=" + "x".repeat(700)) && k1 !== warmMarkerKey("miss", "/api/photo?ref=" + "x".repeat(700)), "(k) marker keys are short, stable, and kind-specific");
  // red-proof: without markers the ok-marked card IS requested (and the fixture throws).
  const before = calls.length;
  await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 10, cachedServed: async () => new Set() });
  const again = calls.slice(before);
  ok(again.some((c) => c.url.includes(encodeURIComponent(pOk.photoRef))) && again.some((c) => c.url.includes(encodeURIComponent(pMiss.photoRef))),
    "(k) red-proof: with no markers the marked cards are requested again, so the skip above is load-bearing");
  eq(calls.slice(0, before).filter((c) => c.url.includes(encodeURIComponent(pOk.photoRef)) || c.url.includes(encodeURIComponent(pMiss.photoRef))).length, 0,
    "(k) with markers, the marked cards got zero photo requests");
}

// ── (k2) a paused run writes no markers ───────────────────────────────────
{
  const p = place("ChIJmarkPause00000000001", "places/ChIJmarkPause00000000001/photos/x");
  const { fetchImpl } = makeFetch({ endpoints: { "/api/fake": { places: [p] } }, photoPlan: { [p.photoRef]: { check: "owned-miss", real: "quota-open" } } });
  const writes = [];
  const res = await warmMod.runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces: [fakeSurface("s", null)], cities: [null], offsetHour: 0, max: 10, cachedServed: async () => new Set(), readMarkers: NO_MARKS, writeMarker: async (k, x) => { writes.push(k); } });
  eq(res.paused, true, "(k2) the quota pause still stops the run");
  eq(writes.length, 0, "(k2) a paused place is not marked, so it is retried after the reset");
}

// ── (l) collection runs endpoints in parallel, results stay deterministic ─
{
  let inFlight = 0, peak = 0;
  const surfaces = Array.from({ length: 8 }, (_, i) => fakeSurface("p" + i, null, { endpointPath: "/api/par" + i }));
  const fetchImpl = async (url) => {
    const m = /\/api\/par(\d+)/.exec(url);
    if (!m) throw new Error("(l) unexpected photo request " + url);
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 20));
    inFlight--;
    const i = Number(m[1]);
    return jsonResponse({ places: [{ placeId: "ChIJParallel" + i, photoRef: null, photo: "https://cdn.example/" + i + ".jpg", name: "P" + i }] });
  };
  const res = await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces, cities: [null], offsetHour: 0, max: 10, cachedServed: async () => new Set() });
  eq(res.visible, 8, "(l) every endpoint's place is collected");
  ok(peak > 1 && peak <= warmMod.WARM_COLLECT_CONCURRENCY, `(l) endpoints are fetched concurrently within the cap (peak ${peak})`);
  const serial = await runPhotoWarm({ origin: ORIGIN, fetchImpl, surfaces, cities: [null], offsetHour: 0, max: 10, cachedServed: async () => new Set(), collectConcurrency: 1 });
  eq(JSON.stringify(serial), JSON.stringify(res), "(l) parallel and serial collection give identical results");
}

if (fail.length) {
  console.error(`test-photo-warm: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-photo-warm: OK — ${pass} assertions`);
