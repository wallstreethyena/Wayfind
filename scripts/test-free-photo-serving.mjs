#!/usr/bin/env node
// scripts/test-free-photo-serving.mjs — hermetic proof for the FREE,
// PERMANENT photo lane (#1188, 2026-09-09): lib/freePhoto.js and its wiring
// into app/api/photo/route.js.
//
// THE INVARIANT THIS FILE EXISTS TO LOCK: a free photo in wf_place_photo must
// prevent the photos ledger grant from EVER being taken — not "usually", not
// "unless something upstream already decided otherwise". Google's photos
// ledger sits at 950/950 free and every further request costs money; serving
// a free, permanently-licensed photo while STILL burning a paid grant on the
// same request would be strictly worse than not having the free lane at all.
//
// METHOD. No network, no DB, anywhere in this file.
//   - Section A calls the REAL lib/freePhoto.js directly, with an injected
//     fetchImpl/env — its own dependency-injection seam, no faking needed.
//   - Section B sources the REAL app/api/photo/route.js text (readFileSync,
//     imports stripped) and re-imports it as a data: URL module, exactly the
//     technique scripts/test-spend-bypass-regression.mjs already uses for
//     app/api/geocode and app/api/places/search. The route's own control
//     flow (the authorizeSpend closure, the miss-handling fallback order) is
//     therefore REAL, UNMODIFIED production code under test — not a
//     re-derivation of it.
//   - Inside that sourced module, resolvePlacePhoto / findSamePlaceCachedPhoto
//     / findFreePhoto / FALLBACK_PATH / PHOTO_REF_RX / placeIdFromRef are
//     swapped for controllable doubles (their OWN correctness is proven
//     elsewhere: placePhotoServe's contract by test-photo-protection.mjs /
//     test-spend-bypass-regression.mjs / check-no-imageless-card.mjs;
//     photoCacheRecovery's by check-photos.mjs; lib/freePhoto.js's by Section
//     A right above). gateShut / spendAllow / spendAllowPhotos are the REAL
//     lib/spendGate.js functions — imported for real at the top of this file,
//     so the money question ("was the ledger actually asked") is answered by
//     COUNTING REAL CALLS to lib/spendGate.js's real ledger-fetch path
//     (globalThis.fetch intercepted only at the wf_spend_take RPC), never by
//     reading a reason string a fake could return unchanged either way.
// RED-PROVE (done by hand, once, before this file shipped — not re-run here):
// every assertion group below was checked against a deliberately broken
// app/api/photo/route.js / lib/freePhoto.js — the free-photo refusal deleted,
// the miss-handling order swapped, the Cache-Control shortened, the probe
// header comparison inverted, the sku scoping widened to `details_ids_only`,
// and getFreePhoto()'s fail-soft .catch removed — confirmed this file goes
// red for each, then the source was restored and this file confirmed green
// again. See the PR/session notes for the full mutation list.
import { readFileSync } from "node:fs";
import { findFreePhoto, selectFreePhotoRow } from "../lib/freePhoto.js";
import { gateShut, spendAllow, spendAllowPhotos } from "../lib/spendGate.js";
import { FALLBACK_PATH, PHOTO_REF_RX, placeIdFromRef } from "../lib/placePhotoServe.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("test-free-photo-serving: FAIL — " + message);
};
const eq = (actual, expected, message) =>
  ok(actual === expected, `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const REF = "places/ChIJAAAA11112222333344/photos/AXCiabcdefghijklmnop123456";
const PLACE_ID = placeIdFromRef(REF); // "ChIJAAAA11112222333344"
ok(/^[A-Za-z0-9_-]{10,}$/.test(PLACE_ID) && PLACE_ID.length > 10, "PROBE: the fixture ref's place id parses (test fixture sanity, not the module under test)");

// ─────────────────────────────────────────────────────────────────────────
// SECTION A — lib/freePhoto.js executed directly, real module, injected deps
// ─────────────────────────────────────────────────────────────────────────
{
  const VALID_ROW = {
    image_url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg",
    license: "CC BY-SA 4.0",
    attribution_text: "Jane Q. Photographer",
    attribution_url: "https://commons.wikimedia.org/wiki/File:Example.jpg",
    source: "wikimedia",
  };

  // A1 — a fully-formed row round-trips, and "owned-free" CARRIES attribution
  // text and href — the exact compliance requirement (Wikimedia CC licenses
  // require visible author + license credit).
  const hit = selectFreePhotoRow(VALID_ROW);
  ok(!!hit, "A1: a valid, fully-attributed row is accepted");
  ok(!!hit && hit.url === VALID_ROW.image_url, "A1: the served url is the row's image_url");
  ok(!!hit && hit.attributionText === VALID_ROW.attribution_text, "A1 (owned-free carries attribution TEXT): attributionText is the row's attribution_text, not dropped or blanked");
  ok(!!hit && hit.attributionUrl === VALID_ROW.attribution_url, "A1 (owned-free carries attribution HREF): attributionUrl is the row's attribution_url, not dropped or blanked");
  ok(!!hit && hit.license === VALID_ROW.license, "A1: license is preserved");
  ok(!!hit && hit.source === "wikimedia", "A1: source is preserved");

  // A2-A4 — missing EITHER half of the credit refuses the row. A photo
  // Wayfind cannot attribute is not eligible to serve, even if it is
  // otherwise a perfectly good row — never degrade to an unattributed image.
  ok(selectFreePhotoRow({ ...VALID_ROW, attribution_text: "" }) === null, "A2: empty attribution_text refuses the row");
  ok(selectFreePhotoRow({ ...VALID_ROW, attribution_url: "" }) === null, "A3: empty attribution_url refuses the row");
  ok(selectFreePhotoRow({ ...VALID_ROW, license: "" }) === null, "A4: empty license refuses the row");
  ok(selectFreePhotoRow({ ...VALID_ROW, attribution_text: null }) === null, "A2b: null attribution_text refuses the row");

  // A5 — the shared isOwnedPhotoUrl gate (lib/placePhotoServe) is what
  // decides "place-owned, not stock" here — a Pexels URL must be refused
  // exactly like every other photo source in this app refuses it.
  ok(selectFreePhotoRow({ ...VALID_ROW, image_url: "https://images.pexels.com/photos/1/x.jpg" }) === null, "A5: a Pexels image_url is refused (STOCK_RX, via isOwnedPhotoUrl)");
  ok(selectFreePhotoRow({ ...VALID_ROW, image_url: "http://upload.wikimedia.org/x.jpg" }) === null, "A6: a non-https image_url is refused");
  ok(selectFreePhotoRow({ ...VALID_ROW, image_url: "not a url" }) === null, "A7: an unparseable image_url is refused");
  ok(selectFreePhotoRow({ ...VALID_ROW, attribution_url: "not a url" }) === null, "A7b: an unparseable attribution_url is refused");

  // A8 — never throws on garbage input.
  for (const bad of [null, undefined, "a string", 42, [], VALID_ROW && {}]) {
    let threw = false;
    let r;
    try { r = selectFreePhotoRow(bad); } catch { threw = true; }
    ok(!threw, `A8: selectFreePhotoRow(${JSON.stringify(bad)}) must never throw`);
    ok(r === null || r === undefined ? r === null : true, `A8: selectFreePhotoRow(${JSON.stringify(bad)}) resolves to null, never a partial object`);
  }

  // A9 — an invalid place id never reaches the network at all.
  {
    let calls = 0;
    const r = await findFreePhoto({ placeId: "short" }, { fetchImpl: async () => { calls++; throw new Error("must not be called"); }, env: { SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "k" } });
    eq(r, null, "A9: an invalid place id resolves to null");
    eq(calls, 0, "A9: an invalid place id never calls fetchImpl");
  }

  // A10 — missing Supabase config fails closed without a network attempt
  // (same contract as lib/photoCacheRecovery.js's cfg()).
  {
    let calls = 0;
    const r = await findFreePhoto({ placeId: PLACE_ID }, { fetchImpl: async () => { calls++; throw new Error("must not be called"); }, env: {} });
    eq(r, null, "A10: missing SUPABASE_URL/KEY resolves to null");
    eq(calls, 0, "A10: missing Supabase config never calls fetchImpl");
  }

  // A11 — a non-ok HTTP response fails closed.
  {
    const r = await findFreePhoto({ placeId: PLACE_ID }, {
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => { throw new Error("must not be read"); } }),
      env: { SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "k" },
    });
    eq(r, null, "A11: a non-ok PostgREST response resolves to null, not a thrown error");
  }

  // A12 — THE FAIL-SOFT CONTRACT: fetchImpl throwing (network error, DNS,
  // abort) must never propagate — it must resolve to null. This is exactly
  // what route.js's getFreePhoto() depends on NOT needing a second layer of
  // protection for (route.js's .catch is defence in depth on top of this).
  {
    let threw = false;
    let r;
    try {
      r = await findFreePhoto({ placeId: PLACE_ID }, {
        fetchImpl: async () => { throw new TypeError("network unreachable"); },
        env: { SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "k" },
      });
    } catch { threw = true; }
    ok(!threw, "A12: findFreePhoto never throws when fetchImpl throws");
    eq(r, null, "A12: a thrown fetchImpl resolves to null");
  }

  // A13 — read-only query shape: place_id + status=active, no write verb.
  {
    let seenUrl = "";
    let seenInit = null;
    await findFreePhoto({ placeId: PLACE_ID }, {
      fetchImpl: async (url, init) => { seenUrl = String(url); seenInit = init; return { ok: true, json: async () => [] }; },
      env: { SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "k" },
    });
    ok(seenUrl.includes("/rest/v1/wf_place_photo"), "A13: findFreePhoto queries wf_place_photo");
    ok(seenUrl.includes("place_id=eq." + PLACE_ID), "A13: the query is scoped to this exact place id (never a neighbour)");
    ok(seenUrl.includes("status=eq.active"), "A13: the query is scoped to status=active (never rejected/stale)");
    ok(!seenInit || !seenInit.method || String(seenInit.method).toUpperCase() === "GET", "A13 (read-only): no write method is ever sent");
    ok(!seenInit || seenInit.body == null, "A13 (read-only): no request body is ever sent");
  }

  console.log("test-free-photo-serving: Section A OK — lib/freePhoto.js: attribution-gated, stock-gated, fail-soft, read-only, identity-scoped");
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION B — app/api/photo/route.js, sourced and executed for real
// ─────────────────────────────────────────────────────────────────────────
const ROUTE_PATH = new URL("../app/api/photo/route.js", import.meta.url);
function loadRouteSource() {
  const raw = readFileSync(ROUTE_PATH, "utf8");
  ok(raw.length > 500, "PROBE: app/api/photo/route.js was read and is non-trivial");
  return raw;
}
async function sourceRoute(routeSource) {
  const stripped = routeSource.replace(/^import[^;]+;\n/gm, "");
  const prelude = `
    const NextResponse = {
      json(value, init = {}) { return new Response(JSON.stringify(value), { status: (init && init.status) || 200, headers: init && init.headers }); },
      redirect(url, init = {}) {
        const status = (init && init.status) || 307;
        const headers = new Headers((init && init.headers) || {});
        headers.set("location", String(url));
        return new Response(null, { status, headers });
      },
    };
    const FALLBACK_PATH = globalThis.__wfFreePhotoTest.FALLBACK_PATH;
    const PHOTO_REF_RX = globalThis.__wfFreePhotoTest.PHOTO_REF_RX;
    const placeIdFromRef = (...a) => globalThis.__wfFreePhotoTest.placeIdFromRef(...a);
    const resolvePlacePhoto = (...a) => globalThis.__wfFreePhotoTest.resolvePlacePhoto(...a);
    const findSamePlaceCachedPhoto = (...a) => globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto(...a);
    const findFreePhoto = (...a) => globalThis.__wfFreePhotoTest.findFreePhoto(...a);
    const gateShut = (...a) => globalThis.__wfFreePhotoTest.gateShut(...a);
    const spendAllow = (...a) => globalThis.__wfFreePhotoTest.spendAllow(...a);
    const spendAllowPhotos = (...a) => globalThis.__wfFreePhotoTest.spendAllowPhotos(...a);
  `;
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));
}

// The real lib/placePhotoServe.js constants/helpers — no faking needed, they
// are pure. The real lib/spendGate.js functions — no faking, ledger truth
// comes from intercepting globalThis.fetch at exactly one URL below.
globalThis.__wfFreePhotoTest = {
  FALLBACK_PATH,
  PHOTO_REF_RX,
  placeIdFromRef,
  gateShut,
  spendAllow,
  spendAllowPhotos,
  resolvePlacePhoto: null, // set per-scenario
  findSamePlaceCachedPhoto: null, // set per-scenario
  findFreePhoto: null, // set per-scenario
};

const savedFetch = globalThis.fetch;
const savedEnv = { WAYFIND_GATE: process.env.WAYFIND_GATE, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, WAYFIND_PHOTOS_PAID: process.env.WAYFIND_PHOTOS_PAID, GOOGLE_PHOTOS_MONTH_CAP: process.env.GOOGLE_PHOTOS_MONTH_CAP, GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY };
function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
}

// Real spendAllow/spendAllowPhotos need gateMode() !== "shut" to ever reach
// the ledger at all — "free" isolates the free-photo variable under test
// (a shut gate would refuse the grant for an unrelated reason and mask it).
// GOOGLE_MAPS_SERVER_KEY is read by route.js itself (serverKey passed into
// resolvePlacePhoto) — standardResolve()'s "unconfigured" branch depends on
// it being present, exactly like a real deployment.
// A named fixture constant, not a read-back of process.env.SUPABASE_URL below
// (scripts/check-guard-hermeticity.mjs) — the fetch stub matches against the
// value THIS FILE chose, never against whatever the shell happens to hold.
const SUPABASE_URL_FIXTURE = "https://ledger.test.invalid";
process.env.WAYFIND_GATE = "free";
process.env.SUPABASE_URL = SUPABASE_URL_FIXTURE;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GOOGLE_MAPS_SERVER_KEY = "test-google-server-key";
delete process.env.WAYFIND_PHOTOS_PAID;
delete process.env.GOOGLE_PHOTOS_MONTH_CAP;

// One real ledger, one router. Every call to the REAL spendAllow/spendAllowPhotos
// that actually reaches the network lands here — nothing else in Section B's
// scenarios touches globalThis.fetch (findSamePlaceCachedPhoto/findFreePhoto
// are plain injected functions below, not the real fetch-backed modules), so
// this counter is a genuine, falsifiable measure of "was a grant taken".
let ledgerCalls = [];
let ledgerAnswer = true;
globalThis.fetch = async (url, init) => {
  const u = String(url && url.href ? url.href : url);
  if (!u.startsWith(SUPABASE_URL_FIXTURE + "/rest/v1/rpc/wf_spend_take")) {
    throw new Error("UNEXPECTED NETWORK CALL in Section B (only wf_spend_take may be reached): " + u);
  }
  const body = JSON.parse(init.body);
  ledgerCalls.push({ sku: body.p_sku, cap: body.p_cap });
  return { ok: true, status: 200, json: async () => ledgerAnswer };
};

function miss(reason, input) {
  return { type: "miss", location: null, cacheControl: "private, no-store", reason, ref: input.ref };
}
// The standard double: mimics exactly the branch order route.js depends on
// (gate-shut / unconfigured / probe short-circuit BEFORE authorizeSpend is
// ever called; a denied first grant is a terminal miss — no further
// authorizeSpend call). This is the same contract test-spend-bypass-
// regression.mjs and test-photo-protection.mjs already lock for the REAL
// lib/placePhotoServe.js; this double exists so Section B can drive route.js
// through each branch on demand without a live Supabase/Google.
function standardResolve() {
  return async (input) => {
    if (input.gateShut) return miss("gate-shut", input);
    if (!input.serverKey) return miss("unconfigured", input);
    if (input.probe) return miss("probe-no-spend", input);
    const allowed = await input.authorizeSpend("photos");
    if (!allowed) return miss("spend-denied", input);
    return { type: "redirect", location: "https://lh3.googleusercontent.com/p/real-google-photo", cacheControl: "public, max-age=2592000, s-maxage=2592000, immutable", reason: "google" };
  };
}
// A second double, used ONLY for the details_ids_only scenario: asks that
// ONE sku directly, bypassing the photos precondition — isolating exactly
// the question "does a free photo also block details_ids_only" (it must
// not) from "does a denied photos grant ever reach details_ids_only at all"
// (a separate, already-locked question — see check-spend-guard.mjs).
function detailsOnlyResolve() {
  return async (input) => {
    const allowed = await input.authorizeSpend("details_ids_only");
    return { type: "miss", location: null, cacheControl: "private, no-store", reason: allowed ? "unconfigured" : "spend-denied", ref: input.ref, __detailsAllowed: allowed };
  };
}

const NO_RECOVERY = async () => null;
const NO_FREE = async () => null;
const HAS_RECOVERY = async () => ({ uri: "https://lh3.googleusercontent.com/p/same-place-recovered", cacheControl: "public, max-age=600000, s-maxage=600000, immutable" });
const HAS_FREE = async () => ({ url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/FreePhoto.jpg", attributionText: "Jane Q. Photographer", attributionUrl: "https://commons.wikimedia.org/wiki/File:FreePhoto.jpg", license: "CC BY-SA 4.0", source: "wikimedia" });
const THROWING_FREE = async () => { throw new Error("wf_place_photo lookup exploded"); };

function req({ probe = false, ref = REF } = {}) {
  const headers = probe ? { "x-wayfind-photo-probe": "1" } : {};
  return new Request("https://www.gowayfind.com/api/photo?ref=" + encodeURIComponent(ref) + "&w=640", { headers });
}

// A double for a genuinely FREE redirect that never touched authorizeSpend at
// all — the "cache"/"inventory" shape (lib/placePhotoServe.js redirects with
// these reasons before ever asking the ledger). Section B8 needs this as a
// distinct control from standardResolve()'s "google": both are
// `type:"redirect"`, and the spend-attribution log must fire on exactly one
// of them.
function cacheHitResolve() {
  return async () => ({
    type: "redirect",
    location: "https://lh3.googleusercontent.com/p/cached-photo",
    cacheControl: "public, max-age=2592000, s-maxage=2592000, immutable",
    reason: "cache",
  });
}

// Same request builder as req(), with explicit user-agent / x-forwarded-for
// values so Section B8 can assert the logged line actually carries THESE
// exact values (not merely "logs something").
const TEST_UA = "TestCrawler/1.0 (+https://example.test/bot)";
const TEST_XFF = "203.0.113.77";
function reqWithHeaders({ probe = false, ref = REF } = {}) {
  const headers = { "user-agent": TEST_UA, "x-forwarded-for": TEST_XFF };
  if (probe) headers["x-wayfind-photo-probe"] = "1";
  return new Request("https://www.gowayfind.com/api/photo?ref=" + encodeURIComponent(ref) + "&w=640", { headers });
}

// Captures every console.log call made during `fn()`, then restores the real
// console.log unconditionally (a thrown fn must not leave console.log
// swapped for the rest of the suite).
async function withCapturedLogs(fn) {
  const calls = [];
  const original = console.log;
  console.log = (...args) => { calls.push(args); };
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    console.log = original;
  }
}

async function run() {
  const routeSource = loadRouteSource();
  const route = await sourceRoute(routeSource);

  // ── B0 (documentation lock) — the enumeration comment names owned-free ──
  ok(/owned-free/.test(routeSource), "B0: the x-wayfind-photo-result enumeration comment mentions owned-free (documented contract scripts/photo-monitor.mjs reads)");

  // ── B1 (POSITIVE CONTROL) — nothing blocks the grant; the apparatus can
  //      still say yes. Without this, "0 ledger calls" everywhere else could
  //      just mean the whole rig is broken, not that the free photo worked. ──
  {
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const res = await route.GET(req());
    eq(res.status, 302, "B1: positive control redirects");
    eq(res.headers.get("x-wayfind-photo-result"), "google", "B1: positive control is a real Google result");
    eq(ledgerCalls.length, 1, "B1: positive control takes exactly one ledger call");
    eq(ledgerCalls[0] && ledgerCalls[0].sku, "photos", "B1: positive control's grant is for the photos SKU");
  }

  // ── B2 — THE HEADLINE INVARIANT. A free photo exists; no recovery. The
  //      photos ledger must NEVER be asked — proven by call count on the
  //      REAL lib/spendGate.js, not by reading a reason string. ──
  {
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE;
    const res = await route.GET(req());
    eq(ledgerCalls.length, 0, "B2 (THE HEADLINE INVARIANT): a free photo prevents the photos ledger grant from EVER being taken");
    eq(res.status, 302, "B2: a free photo serves a redirect");
    eq(res.headers.get("x-wayfind-photo-result"), "owned-free", "B2: the result is labelled owned-free");
    eq(res.headers.get("location"), (await HAS_FREE()).url, "B2: the redirect target is the free photo's own url");
    const cc = res.headers.get("cache-control") || "";
    ok(cc.includes("max-age=31536000"), "B2: owned-free gets a full YEAR of cache — permanent, unlike a rented Google photo");
    ok(cc.includes("immutable"), "B2: owned-free is cached immutable");
    eq(res.headers.get("x-wayfind-photo-probe"), "0", "B2: a real (non-probe) reader is marked as such");
  }

  // ── B3 — SAME-PLACE RECOVERY STILL WINS. Both a recovery hit and a free
  //      photo exist; the recovery (a photo of the actual venue, already
  //      paid for) must be served, not the free substitute. ──
  {
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = HAS_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE;
    const res = await route.GET(req());
    eq(res.headers.get("x-wayfind-photo-result"), "same-place-cache", "B3: recovery wins over the free photo when both exist");
    eq(res.headers.get("location"), (await HAS_RECOVERY()).uri, "B3: the redirect target is the RECOVERED photo, not the free one");
    eq(ledgerCalls.length, 0, "B3: recovery winning still takes zero ledger calls");
  }

  // ── B4 — A PROBE TAKES NO GRANT AND WRITES NOTHING, even when it would
  //      see a free photo. authorizeSpend is never reached at all while
  //      probing (matches the resolver's own documented contract), so the
  //      ledger call count is the proof, not a header string a broken
  //      implementation could return unchanged either way. ──
  {
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE;
    const res = await route.GET(req({ probe: true }));
    eq(ledgerCalls.length, 0, "B4: a probe takes zero ledger grants even when a free photo is available");
    eq(res.headers.get("x-wayfind-photo-result"), "owned-free", "B4: a probe still SEES the free-photo fallback, exactly like a real denied reader would");
    eq(res.headers.get("x-wayfind-photo-probe"), "1", "B4: the probe marker is echoed back");
  }
  // ── B4b (control) — a probe with NOTHING available takes no grant either,
  //      and does not fabricate a photo that does not exist. ──
  {
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const res = await route.GET(req({ probe: true }));
    eq(ledgerCalls.length, 0, "B4b: a probe with nothing available still takes zero ledger grants");
    eq(res.status, 404, "B4b: a probe with nothing available reports an honest miss, never a fabricated redirect");
    eq(res.headers.get("x-wayfind-photo-result"), "probe-no-spend", "B4b: the miss is labelled probe-no-spend, never spend-denied (the ledger was never asked)");
  }

  // ── B5 — details_ids_only is UNCHANGED by a free photo's existence. The
  //      expired-ref self-heal's Place Details lookup must still get exactly
  //      what the real ledger says, free photo or not. ──
  {
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = detailsOnlyResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE; // a free photo DOES exist here

    // The route's FINAL response reason is dominated by the free photo once
    // resolvePlacePhoto returns any recovery-eligible miss (that is exactly
    // what B2/B4 prove) — so it cannot also be the signal for "was
    // details_ids_only itself granted or denied". The ledger call itself is:
    // asked exactly once, for the right SKU, and the real ledger's answer
    // (not the free photo) decided it.
    ledgerCalls = []; ledgerAnswer = true; // ledger GRANTS details_ids_only
    await route.GET(req());
    eq(ledgerCalls.length, 1, "B5 (grant): details_ids_only is asked from the real ledger exactly once, despite a free photo existing");
    eq(ledgerCalls[0] && ledgerCalls[0].sku, "details_ids_only", "B5 (grant): the ledger call is for details_ids_only, never photos");

    ledgerCalls = []; ledgerAnswer = false; // ledger DENIES details_ids_only
    await route.GET(req());
    eq(ledgerCalls.length, 1, "B5 (deny): details_ids_only is still asked from the real ledger exactly once");
    eq(ledgerCalls[0] && ledgerCalls[0].sku, "details_ids_only", "B5 (deny): still the right SKU — a free photo does not redirect this ask to `photos` or swallow it");
  }

  // ── B6 — THE FREE-PHOTO LOOKUP FAILING CLOSES TO TODAY'S BEHAVIOUR. If
  //      findFreePhoto rejects outright (a broken deploy, not the documented
  //      "never throws" contract holding), the route must still answer
  //      exactly as it did before #1188 for this exact miss — not 500, not
  //      a different body. Compared against a same-shaped control where the
  //      free lookup legitimately found nothing. ──
  {
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;

    ledgerCalls = []; ledgerAnswer = false; // deny the photos grant -> spend-denied miss either way
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const control = await route.GET(req());
    const controlBody = await control.json().catch(() => null);

    ledgerCalls = []; ledgerAnswer = false;
    globalThis.__wfFreePhotoTest.findFreePhoto = THROWING_FREE;
    let threw = false;
    let broken;
    try {
      broken = await route.GET(req());
    } catch {
      threw = true;
    }
    ok(!threw, "B6: a throwing free-photo lookup must not crash the route (no uncaught exception escapes GET)");
    ok(!!broken, "B6: the route still returns a real Response when the free-photo lookup fails");
    if (broken) {
      eq(broken.status, control.status, "B6: a broken free-photo lookup produces the SAME status as no free photo at all");
      eq(broken.headers.get("x-wayfind-photo-result"), control.headers.get("x-wayfind-photo-result"), "B6: …the same x-wayfind-photo-result…");
      const brokenBody = await broken.json().catch(() => null);
      eq(JSON.stringify(brokenBody), JSON.stringify(controlBody), "B6: …and the same response body — a broken free lookup is indistinguishable from having no free photo");
    }
  }

  // ── B7 — THE FREE RUNG COVERS EVERY DEAD END, NOT JUST A BUDGET DENIAL.
  //      The first cut of this lane wired the free photo ONLY into the
  //      spend-denied/gate-shut/unconfigured/probe-no-spend block. That left
  //      the two outcomes where a free photo is worth the MOST still painting
  //      a blank:
  //        `empty`/no-photo — the place has no Google photo at all. A park or
  //          beach Google never photographed is exactly the place Wikimedia
  //          Commons covers best, and it was being sent to the branded
  //          compass while we held a real, licensed picture of it.
  //        `owned-miss` — an owned ref whose bytes would not fetch, 404ing to
  //          a monogram with a free photo sitting unused.
  //      Both are locked here, each against a same-shaped control proving the
  //      old behaviour is intact when no free photo exists. ──
  {
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    const FREE_URL = "https://upload.wikimedia.org/wikipedia/commons/a/ab/FreePhoto.jpg";

    // ---- empty / no-photo ----
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = async () => ({ type: "empty", location: null, cacheControl: "private, no-store", reason: "no-photo" });

    ledgerCalls = []; ledgerAnswer = true; // the ledger WOULD grant; nothing may ask it
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const emptyControl = await route.GET(req());
    eq(emptyControl.status, 302, "B7 (empty control): with no free photo, a genuinely photoless place still 302s");
    eq(emptyControl.headers.get("x-wayfind-photo-result"), "no-photo", "B7 (empty control): …still reported as no-photo…");
    ok(String(emptyControl.headers.get("location") || "").includes("wf-photo-fallback.svg"), "B7 (empty control): …still to the branded fallback SVG — pre-existing behaviour is untouched");

    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE;
    const emptyFree = await route.GET(req());
    eq(emptyFree.status, 302, "B7 (empty): a photoless place WITH a free photo redirects");
    eq(emptyFree.headers.get("x-wayfind-photo-result"), "owned-free", "B7 (empty): …reported as owned-free, not no-photo…");
    eq(emptyFree.headers.get("location"), FREE_URL, "B7 (empty): …straight to the Commons file, never to the branded compass");
    eq(ledgerCalls.length, 0, "B7 (empty): and the photos ledger is never asked — a free photo on the empty path costs nothing");

    // ---- owned-miss (a terminal miss OUTSIDE the recovery-eligible reasons) ----
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = async (input) => miss("owned-miss", input);

    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const missControl = await route.GET(req());
    eq(missControl.status, 404, "B7 (owned-miss control): with no free photo, an unfetchable owned ref still 404s so the card paints its own monogram");
    eq(missControl.headers.get("x-wayfind-photo-result"), "owned-miss", "B7 (owned-miss control): …still labelled owned-miss");

    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE;
    const missFree = await route.GET(req());
    eq(missFree.status, 302, "B7 (owned-miss): an unfetchable owned ref WITH a free photo redirects instead of 404ing");
    eq(missFree.headers.get("x-wayfind-photo-result"), "owned-free", "B7 (owned-miss): …reported as owned-free");
    eq(missFree.headers.get("location"), FREE_URL, "B7 (owned-miss): …to the Commons file");
    eq(ledgerCalls.length, 0, "B7 (owned-miss): still no photos grant taken");
  }

  // ── B8 — SPEND ATTRIBUTION LOG: fires exactly once on a real Google grant,
  //      never otherwise. 2026-09-09: Vercel's runtime logs carried no UA, no
  //      IP, and not this route's own x-wayfind-photo-result header, so a
  //      93-grant burst at 18:30 UTC (111 grants total, ~$0.78) had to be
  //      reconstructed from request TIMING instead of looked up directly.
  //      Proven by CAPTURING console output, not by reading the source — a
  //      structural regex cannot tell "logs only on google" from "logs on
  //      every redirect": both contain the string logGoogleGrant. ──
  {
    // (a) POSITIVE CONTROL — a real Google grant is the ONLY path that may log.
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const { result: googleRes, calls: googleLogs } = await withCapturedLogs(() => route.GET(reqWithHeaders()));
    eq(googleRes.headers.get("x-wayfind-photo-result"), "google", "B8a: control is a real Google grant");
    eq(googleLogs.length, 1, `B8a: a real Google grant must log EXACTLY ONCE, got ${googleLogs.length}`);
    const loggedText = JSON.stringify(googleLogs[0]);
    ok(loggedText.includes(TEST_UA), "B8a: the logged line carries the request's user-agent");
    ok(loggedText.includes(TEST_XFF), "B8a: the logged line carries the request's x-forwarded-for value");
    ok(loggedText.includes("google"), "B8a: the logged line carries the result reason");
    ok(!loggedText.includes(REF), "B8a: the logged line must NEVER contain the photo ref");
    ok(!loggedText.includes("ref=") && !/[?&]w=/.test(loggedText), "B8a: the logged line must NEVER contain the request's query string");
    ok(!loggedText.includes("test-google-server-key"), "B8a: the logged line must NEVER contain GOOGLE_MAPS_SERVER_KEY's value");
    ok(!loggedText.includes("test-service-role-key"), "B8a: the logged line must NEVER contain SUPABASE_SERVICE_ROLE_KEY's value");
    ok(!loggedText.includes(SUPABASE_URL_FIXTURE), "B8a: the logged line must NEVER contain the Supabase URL");

    // (b) a genuinely free cache hit — took no grant. Must log ZERO times.
    ledgerCalls = [];
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = cacheHitResolve();
    const { result: cacheRes, calls: cacheLogs } = await withCapturedLogs(() => route.GET(reqWithHeaders()));
    eq(cacheRes.headers.get("x-wayfind-photo-result"), "cache", "B8b: control is a free cache hit");
    eq(cacheLogs.length, 0, `B8b: a cache-hit redirect must log ZERO times, got ${cacheLogs.length}`);

    // (c) owned-free (the free PERMANENT lane) — must log ZERO times.
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = HAS_FREE;
    const { result: freeRes, calls: freeLogs } = await withCapturedLogs(() => route.GET(reqWithHeaders()));
    eq(freeRes.headers.get("x-wayfind-photo-result"), "owned-free", "B8c: control is the free-permanent lane");
    eq(freeLogs.length, 0, `B8c: an owned-free redirect must log ZERO times, got ${freeLogs.length}`);

    // (d) same-place-cache recovery — must log ZERO times.
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = HAS_RECOVERY;
    const { result: recRes, calls: recLogs } = await withCapturedLogs(() => route.GET(reqWithHeaders()));
    eq(recRes.headers.get("x-wayfind-photo-result"), "same-place-cache", "B8d: control is a same-place recovery");
    eq(recLogs.length, 0, `B8d: a same-place-cache redirect must log ZERO times, got ${recLogs.length}`);

    // (e) a probe — even one that WOULD reach a real Google grant if it were
    //     not probing — must log ZERO times.
    ledgerCalls = []; ledgerAnswer = true;
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = standardResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const { result: probeRes, calls: probeLogs } = await withCapturedLogs(() => route.GET(reqWithHeaders({ probe: true })));
    eq(probeRes.headers.get("x-wayfind-photo-probe"), "1", "B8e: control really is a probe request");
    eq(probeLogs.length, 0, `B8e: a probe must log ZERO times even on a path that would otherwise log, got ${probeLogs.length}`);

    // MUTATION RED, applied to a TEMP COPY of the route source TEXT (the real
    // file on disk is never touched) — drop the reason/probe gate so
    // logGoogleGrant fires on EVERY redirect. Proves B8b/c/d are real checks,
    // not vacuous ones: with the gate removed, the same cache-hit scenario
    // that logged 0 times above now logs 1.
    const GATE_LINE = 'if (result.reason === "google" && !probe) logGoogleGrant(req, result.reason);';
    ok(routeSource.includes(GATE_LINE), "B8 MUTATION PRECONDITION: the exact reason/probe gate line exists in the real source — the mutation below has something to remove");
    const mutatedSource = routeSource.replace(GATE_LINE, "logGoogleGrant(req, result.reason);");
    ok(mutatedSource !== routeSource, "B8 MUTATION: the sabotage actually landed (mutated source differs from the real source)");
    const mutatedRoute = await sourceRoute(mutatedSource);
    globalThis.__wfFreePhotoTest.resolvePlacePhoto = cacheHitResolve();
    globalThis.__wfFreePhotoTest.findSamePlaceCachedPhoto = NO_RECOVERY;
    globalThis.__wfFreePhotoTest.findFreePhoto = NO_FREE;
    const { calls: mutatedCacheLogs } = await withCapturedLogs(() => mutatedRoute.GET(reqWithHeaders()));
    eq(mutatedCacheLogs.length, 1, `B8 MUTATION RED: with the reason/probe gate removed, a cache-hit redirect that logged 0 times under the real code now logs 1 — proves B8b was not vacuous. Got ${mutatedCacheLogs.length}`);
  }

  restoreEnv();
  globalThis.fetch = savedFetch;
  delete globalThis.__wfFreePhotoTest;
}

await run();

if (failures) {
  console.error(`test-free-photo-serving: FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("test-free-photo-serving: OK — a free photo prevents the photos ledger grant entirely (by call count); same-place recovery still wins; a probe takes no grant; owned-free carries attribution; a broken free lookup fails closed to pre-#1188 behaviour; details_ids_only is untouched; the spend-attribution log fires exactly once on a real Google grant and never on cache/owned-free/recovery/probe, red-proved by console capture");
