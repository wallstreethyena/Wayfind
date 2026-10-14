#!/usr/bin/env node
// scripts/test-photo-same-origin-spend.mjs — the paid Google photo lane needs a
// PAGE-ORIGINATED request (2026-10-14).
//
// THE INVARIANT: a bare URL (curl, script, cross-site embed) carrying
// s=detail or s=card&fmt=json must never reach authorizeSpend / Google. It still
// gets the FREE rungs (owned inventory, wf_place_photo) and a neutral miss named
// `not-page-request`. Every legitimate purchase is a fetch() from
// lib/photoAnswers.js: Sec-Fetch-Site same-origin in modern browsers, or (header
// absent, older Safari) the x-wayfind-photo-surface header that file sends.
//
// METHOD. Hermetic, no network, no env verdicts, lib/spendGate.js is NOT imported.
// The REAL app/api/photo/route.js text is sourced (imports stripped) and run as a
// data: module, as scripts/test-free-photo-serving.mjs does; the REAL
// creditedRequest (lib/apiGuard.js) is bound in. resolvePlacePhoto is a double
// that mirrors the resolver contract (googleSurface false => not-google-surface
// with ZERO authorizer calls; true => asks authorizeSpend once). The money question
// is answered by COUNTING authorizeSpend -> spendAllowPhotosDetailed calls.
import { readFileSync } from "node:fs";
import { creditedRequest } from "../lib/apiGuard.js";
import { getPlacePhoto, resetPhotoAnswers } from "../lib/photoAnswers.js";

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("test-photo-same-origin-spend: FAIL — " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const PID = "ChIJAAAA11112222333344";
const T = (globalThis.__wfSameOriginTest = {
  grants: 0, outcomes: [], free: null,
  creditedRequest,
  FALLBACK_PATH: "/photo-fallback.svg",
  PHOTO_REF_RX: /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/,
  placeIdFromRef: (r) => (/^places\/([A-Za-z0-9_-]+)\/photos\//.exec(String(r || ""))?.[1] || ""),
  gateShut: () => false,
  spendAllow: async () => { T.grants++; return { ok: true }; },
  spendAllowPhotos: async () => { T.grants++; return true; },
  spendAllowPhotosDetailed: async () => { T.grants++; return { ok: true }; },
  photosCeiling: () => 10000,
  ledgerOutcomeClass: () => "ledger-denied",
  isAutomatedPhotoReader: () => false,
  recordPhotoOutcome: async (c) => { T.outcomes.push(c); return true; },
  recordPhotoDeniedCeiling: async () => true,
  recordReaderPhotoMiss: async () => false,
  findFreePhoto: async () => T.free,
  // Resolver contract (lib/placePhotoServe.js): no credited surface => honest miss
  // BEFORE any grant; credited => ask the authorizer exactly once, then a google redirect.
  resolvePlacePhoto: async (input) => {
    if (!input.googleSurface) return { type: "miss", location: null, cacheControl: "private, no-store", reason: "not-google-surface", ref: "", upstream: null, retried: false, refunded: 0 };
    if (input.probe) return { type: "miss", location: null, cacheControl: "private, no-store", reason: "probe-no-spend", ref: "", upstream: null, retried: false, refunded: 0 };
    const g = await input.authorizeSpend("photos");
    if (!(g && g.ok)) return { type: "miss", location: null, cacheControl: "private, no-store", reason: "spend-denied", ref: "", upstream: null, retried: false, refunded: 0 };
    return { type: "redirect", location: "https://lh3.example/p.jpg", cacheControl: "private, no-store", reason: "google", ref: "", upstream: "ok", retried: false, refunded: 0, credit: { name: "A" } };
  },
});

const raw = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
const prelude = `
  const NextResponse = {
    json(v, init = {}) { return new Response(JSON.stringify(v), { status: (init && init.status) || 200, headers: init && init.headers }); },
    redirect(url, init = {}) { const h = new Headers((init && init.headers) || {}); h.set("location", String(url)); return new Response(null, { status: (init && init.status) || 307, headers: h }); },
  };
  const t = () => globalThis.__wfSameOriginTest;
  const FALLBACK_PATH = t().FALLBACK_PATH, PHOTO_REF_RX = t().PHOTO_REF_RX;
  const placeIdFromRef = (...a) => t().placeIdFromRef(...a);
  const resolvePlacePhoto = (...a) => t().resolvePlacePhoto(...a);
  const findFreePhoto = (...a) => t().findFreePhoto(...a);
  const recordReaderPhotoMiss = (...a) => t().recordReaderPhotoMiss(...a);
  const recordPhotoOutcome = (...a) => t().recordPhotoOutcome(...a);
  const recordPhotoDeniedCeiling = (...a) => t().recordPhotoDeniedCeiling(...a);
  const gateShut = (...a) => t().gateShut(...a);
  const spendAllow = (...a) => t().spendAllow(...a);
  const spendAllowPhotos = (...a) => t().spendAllowPhotos(...a);
  const spendAllowPhotosDetailed = (...a) => t().spendAllowPhotosDetailed(...a);
  const photosCeiling = (...a) => t().photosCeiling(...a);
  const ledgerOutcomeClass = (...a) => t().ledgerOutcomeClass(...a);
  const isAutomatedPhotoReader = (...a) => t().isAutomatedPhotoReader(...a);
  const creditedRequest = (...a) => t().creditedRequest(...a);
`;
const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + raw.replace(/^import[^;]+;\n/gm, "")));

const FREE = { url: "https://upload.example/free.jpg", source: "wikimedia", attributionText: "J", attributionUrl: "https://c.example", license: "CC" };
async function hit(qs, headers = {}, free = null) {
  T.grants = 0; T.outcomes = []; T.free = free;
  const res = await route.GET(new Request("https://www.gowayfind.com/api/photo?" + qs, { headers }));
  let body = null; try { body = await res.clone().json(); } catch { /* redirect */ }
  return { res, body, grants: T.grants, result: res.headers.get("x-wayfind-photo-result") };
}
const CARD = `place=${PID}&s=card&fmt=json&w=1200`;
const DETAIL = `place=${PID}&s=detail&fmt=json&w=1200`;

// Real helper truth table.
eq(creditedRequest({ "sec-fetch-site": "same-origin" }), true, "helper: same-origin");
eq(creditedRequest({ "sec-fetch-site": "same-site" }), true, "helper: same-site");
eq(creditedRequest({ "sec-fetch-site": "cross-site" }), false, "helper: cross-site");
eq(creditedRequest({ "sec-fetch-site": "none" }), false, "helper: none (typed URL)");
eq(creditedRequest({ "sec-fetch-site": "cross-site", "x-wayfind-photo-surface": "card" }), false, "helper: surface header cannot launder a cross-site request");
eq(creditedRequest({}), false, "helper: no signal");
eq(creditedRequest({ "x-wayfind-photo-surface": "detail" }), true, "helper: absent Sec-Fetch-Site + surface header");
eq(creditedRequest({ referer: "https://www.gowayfind.com/" }), false, "helper: a bare Referer is not enough");

for (const [label, qs] of [["card", CARD], ["detail", DETAIL]]) {
  // Cross-site: zero grants, neutral miss, named reason + outcome.
  let r = await hit(qs, { "sec-fetch-site": "cross-site" });
  eq(r.grants, 0, `${label}: cross-site takes 0 grants`);
  eq(r.result, "not-page-request", `${label}: cross-site miss is named not-page-request`);
  eq(r.body && r.body.src, null, `${label}: cross-site neutral miss has no src`);
  ok(T.outcomes.includes("not-page-request"), `${label}: outcome class not-page-request recorded`);
  // Cross-site with a free photo: still served free, still 0 grants.
  r = await hit(qs, { "sec-fetch-site": "cross-site" }, FREE);
  eq(r.grants, 0, `${label}: cross-site + free photo takes 0 grants`);
  eq(r.body && r.body.src, FREE.url, `${label}: cross-site still gets the free photo`);
  // No headers at all (curl).
  r = await hit(qs, {});
  eq(r.grants, 0, `${label}: absent Sec-Fetch-Site without surface header takes 0 grants`);
  // Same-origin: reaches the authorizer exactly once (positive control).
  r = await hit(qs, { "sec-fetch-site": "same-origin" });
  eq(r.grants, 1, `${label}: same-origin reaches authorizeSpend exactly once`);
  eq(r.result, "google", `${label}: same-origin purchase proceeds`);
  // Older Safari: header absent, surface header present.
  r = await hit(qs, { "x-wayfind-photo-surface": label });
  eq(r.grants, 1, `${label}: absent Sec-Fetch-Site + surface header is reachable`);
}

// A monitor probe (no page-origin headers) keeps its exact reason: probe-no-spend, 0 grants.
{
  const r = await hit(DETAIL, { "x-wayfind-photo-probe": "1" });
  eq(r.grants, 0, "probe: 0 grants");
  eq(r.result, "probe-no-spend", "probe: reason unchanged (not relabelled not-page-request)");
}

// <img src=?ref=> (crawlers/OG): unchanged, never spends, reason stays not-google-surface.
for (const h of [{}, { "sec-fetch-site": "same-origin" }]) {
  const r = await hit(`ref=places/${PID}/photos/AXCiabcdefghijklmnop123456&w=800`, h);
  eq(r.grants, 0, "img ?ref=: takes 0 grants");
  eq(r.result, "not-google-surface", "img ?ref=: reason unchanged (not-google-surface)");
  ok(!T.outcomes.includes("not-page-request"), "img ?ref=: not relabelled");
}

// The client half: getPlacePhoto must send the surface header the route accepts.
for (const surface of ["card", "detail"]) {
  resetPhotoAnswers();
  let seen = null;
  await getPlacePhoto(PID, { surface, fetchImpl: async (u, init) => { seen = init; return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ src: null }) }; } });
  eq(seen && seen.headers && seen.headers["x-wayfind-photo-surface"], surface, `client: getPlacePhoto(${surface}) sends x-wayfind-photo-surface`);
  ok(seen && creditedRequest(seen.headers), `client: ${surface} headers qualify as a credited request when Sec-Fetch-Site is absent`);
}

delete globalThis.__wfSameOriginTest;
if (failures) { console.error(`test-photo-same-origin-spend: FAIL — ${failures} assertion(s) failed`); process.exit(1); }
console.log("test-photo-same-origin-spend: OK — cross-site and header-less paid-lane requests take 0 grants and still get free photos with a not-page-request miss; same-origin and surface-header requests reach authorizeSpend exactly once; ?ref= images unchanged; getPlacePhoto sends the surface header");
