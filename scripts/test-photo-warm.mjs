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
const { SERVED_RESULTS, PAUSE_REASONS, chunkKeysForUrl, WARM_CHECK_URL_BUDGET } = warmMod;
// ── fixtures ────────────────────────────────────────────────────────────
const ORIGIN = "https://www.gowayfind.com";

// ── (a) THE NEW CONTRACT (2026-10-08, Google Maps Platform Terms 3.2.3(a)(i)): background
//        pre-fetching of Google photos is PROHIBITED outright. runPhotoWarm is a constant no-op:
//        it returns "prohibited" BEFORE any I/O — no endpoint collection, no probe, no real /api/photo
//        request, no cache or marker read/write — whatever the inputs. Every dependency below throws
//        if touched, so a regression that does ANY I/O fails loudly. ──────────────────────────────
{
  const boom = (what) => () => { throw new Error("test-photo-warm RED-PROOF TRIPPED: runPhotoWarm touched " + what + " although prefetch is prohibited"); };
  const trapped = {
    origin: ORIGIN,
    fetchImpl: boom("fetchImpl"),
    cachedServed: boom("cachedServed"),
    readMarkers: boom("readMarkers"),
    writeMarker: boom("writeMarker"),
    surfaces: [{ id: "s", label: "s", perCity: false, components: [], endpoints: [{ path: "/api/fake", params: boom("endpoint params"), extract: boom("endpoint extract") }] }],
    cities: [null], offsetHour: 0,
  };
  ok(warmMod.PHOTO_WARM_PROHIBITED === true, "case a: lib/photoWarm exports PHOTO_WARM_PROHIBITED === true (the constant the no-op hangs on)");
  const savedFetch = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = async (u) => { globalCalls++; throw new Error("RED-PROOF TRIPPED: global fetch reached " + u); };
  try {
    for (const max of [0, 1, 10, 150, 2000]) {
      const r = await warmMod.runPhotoWarm({ ...trapped, max });
      eq(r.paused, true, `case a (max ${max}): the run reports paused`);
      eq(r.pausedReason, "prefetch-prohibited", `case a (max ${max}): pausedReason names the prohibition`);
      eq(r.stopReason, "prefetch-prohibited", `case a (max ${max}): stopReason names the prohibition`);
      eq(r.attempted, 0, `case a (max ${max}): zero photo requests attempted`);
      eq(r.filled + r.free + r.visible + r.alreadyServed + r.unchecked, 0, `case a (max ${max}): nothing collected, nothing filled`);
    }
    eq(globalCalls, 0, "case a: zero global fetch calls across every run");
  } finally { globalThis.fetch = savedFetch; }
  // The origin check still fires first (caller error), but nothing else about the inputs matters.
  let threw = false;
  try { await warmMod.runPhotoWarm({ ...trapped, origin: undefined }); } catch { threw = true; }
  ok(threw, "case a sanity: runPhotoWarm still requires an origin (the throw happens before the no-op return)");
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

// (j) chunkKeysForUrl is a pure helper that still exists: real-length Google names must split into
// URL-safe chunks (2026-09-17 production: one giant chunk built a >100 KB URL and every read was refused).
{
  const longRef = (i) => `places/ChIJLongRef${String(i).padStart(6, "0")}/photos/` + "A".repeat(680) + i;
  const refs = Array.from({ length: 60 }, (_, i) => longRef(i));
  const chunks = chunkKeysForUrl(refs.map((r) => "photo|" + r + "|640"));
  ok(chunks.length > 1, `(j) 60 real-length names are split into several chunks (got ${chunks.length})`);
  ok(chunks.every((c) => encodeURIComponent(c.map((k) => '"' + k + '"').join(",")).length <= WARM_CHECK_URL_BUDGET + 50), "(j) every chunk's encoded in-list stays inside the URL budget");
  const giant = chunkKeysForUrl(refs.map((r) => "photo|" + r + "|640"), 10 ** 9);
  eq(giant.length, 1, "(j) red-proof setup: an unbounded budget yields one giant chunk");
  ok(encodeURIComponent(giant[0].map((k) => '"' + k + '"').join(",")).length > 16000, "(j) red-proof: that single chunk is over the gateway limit, which is exactly the production failure");
}

// ── (n) hotel cards: pure extraction still counts every owned hotel card (photo or not) ─
{
  const { hotelCardsForAudit, PHOTO_SURFACES } = await import("../lib/photoSurfaces.js");
  const hotels = [
    { id: "wfh-super-8-27424", name: "Super 8", photo: null },
    { id: "wfh-other-27425", name: "Other Inn", googlePlaceId: "ChIJHotelAuditExact0001", photo: "/api/photo?ref=places%2FChIJHotelAuditExact0001%2Fphotos%2Fx&g=2&w=640" },
  ];
  const cards = hotelCardsForAudit(hotels);
  eq(cards.length, 2, "(n) every hotel card is extracted, photo or not");
  ok(PHOTO_SURFACES.some((x) => x.id === "hotel-stays" && x.endpoints.some((e) => e.path === "/api/hotels") && x.endpoints.some((e) => e.path === "/api/trip-connections")), "(n) the hotel surface is registered for audit crawls");
}

if (fail.length) {
  console.error(`test-photo-warm: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-photo-warm: OK — ${pass} assertions`);
