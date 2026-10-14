#!/usr/bin/env node
// scripts/test-photo-credit-capture.mjs — the live photo lane returns the credit Google already sent,
// tied to the EXACT photo it fetched, and keeps NOTHING (2026-10-08 contract change).
//
// WAS (2026-10-01): the fresh-first lookup / stale-name heal handed the Details `?fields=photos` response
// to a credit KEEPER that wrote wf_photo_credit, and cached the image under the exact fetched name, so
// /api/photo-credits could pair them later. Google Maps Platform Terms 3.2.3 + Place Photos ("You cannot
// cache a photo name") forbid that, so storing is gone.
//
// NOW, locked here BY CALLING the real resolver with a scripted Google double (zero network):
//   1. on a credited surface (googleSurface) the credit of the photo actually fetched (photos[0] of the
//      SAME free Details response, no extra Google call or grant) rides back on the result, live;
//   2. NOTHING is kept: the cache write dep and a legacy keepCredits keeper are traps that must never fire,
//      and the result is `private, no-store`;
//   3. no credit is borrowed from an un-fetched photo; an empty authorAttributions yields no invented author;
//   4. a probe and a non-credited surface never reach Google, and carry no credit.
//
// RED-PROOF: make the resolver call a keeper / cacheSet again, take the credit from the wrong photo, or
// serve Google off a non-credited surface, and this guard fails.
import { readFileSync } from "node:fs";
import { resolvePlacePhoto, placeDiscoveryRef } from "../lib/placePhotoServe.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const eq = (a, e, m) => ok(a === e, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(e)})`);

const DAY = 24 * 60 * 60 * 1000;
const FAKE = { breakerOpen: async () => null, tripBreaker: async () => true, refund: async () => true, retryDelayMs: 0, inventoryGet: async () => null };

function authorizer() {
  const log = [];
  const fn = async (sku) => { log.push(sku); return true; };
  fn.count = (sku) => log.filter((s) => s === sku).length;
  return fn;
}
function memCache() {
  const store = new Map();
  return {
    store,
    cacheGet: async (k) => (store.has(k) ? { v: store.get(k), stale: false, ageMs: 0 } : null),
    cacheSet: async (k, v) => { store.set(k, v); },
  };
}
// Scripted Google: url -> kind; `healedSub` routes the fresh name's media call.
function googleStub(script, healedSub) {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://places.googleapis.com/v1/")) throw new Error("test bug: unexpected url " + u);
    const healed = healedSub ? u.includes(healedSub) : false;
    let kind;
    if (u.includes("?fields=photos")) kind = "details";
    else if (u.includes("skipHttpRedirect=true")) kind = healed ? "healedSkip" : "skip";
    else throw new Error("test bug: unclassified url " + u);
    const list = script[kind];
    if (!list || !list.length) throw new Error("test bug: no scripted " + kind);
    calls.push(kind);
    const step = list.shift();
    return { ok: step.status >= 200 && step.status < 300, status: step.status, url: "", json: async () => step.body ?? {} };
  };
  return { fn, calls };
}
const author = (n) => ({ displayName: n, uri: "https://maps.google.com/maps/contrib/" + n.length, photoUri: "https://lh3.googleusercontent.com/a/" + n.length });
const liveNamesFrom = (store) => {
  const live = new Set();
  for (const k of store.keys()) { const m = /^photo\|(places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+)\|640$/.exec(k); if (m) live.add(m[1]); }
  return live;
};

const PLACE = "ChIJCreditCaptureTest0001";
const REF = `places/${PLACE}/photos/STOREDOLDNAME`;
const FRESH = `places/${PLACE}/photos/FRESHCURRENTNAME`;
const SECOND = `places/${PLACE}/photos/SECONDPHOTO`;
const OWNED = "https://lh3.googleusercontent.com/p/credit-capture-owned";
const detailsBody = (first = FRESH, attrs = [author("Ana Photographer")]) => ({ photos: [
  { name: first, authorAttributions: attrs, googleMapsUri: "https://maps.google.com/?cid=1", widthPx: 1200, heightPx: 800 },
  { name: SECOND, authorAttributions: [author("Someone Else")] },
] });

const trapCache = () => { const writes = []; return { writes, cacheGet: async () => null, cacheSet: async (k) => { writes.push(k); throw new Error("RED-PROOF TRIPPED: the live photo lane wrote a cache row " + k); } }; };
const keeperTrap = () => { throw new Error("RED-PROOF TRIPPED: a credit keeper was called"); };
const live = (extra = {}) => ({ place: PLACE, ref: placeDiscoveryRef(PLACE), w: 640, serverKey: "k", googleSurface: true, keepCredits: keeperTrap, ...extra });

/* ── 1. credited surface: credit of the FETCHED photo returned live, from the same Details response; nothing stored ── */
{
  const auth = authorizer();
  const cache = trapCache();
  const stub = googleStub({ details: [{ status: 200, body: detailsBody() }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FRESHCURRENTNAME");
  const r = await resolvePlacePhoto(live({ authorizeSpend: auth }), { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: stub.fn });
  eq(r.type, "redirect", "1: served");
  eq(r.reason, "google", "1: reason is google (a live, ledger-granted photo)");
  eq(r.location, OWNED, "1: the live Google photo URL is returned");
  eq(stub.calls.join(","), "details,healedSkip", "1: no extra Google call — the same one Details lookup + one media call");
  eq(auth.count("details_ids_only"), 1, "1: one IDs-only grant");
  ok(r.credit && r.credit.name === "Ana Photographer", "1: the credit is the fetched photo's own author (photos[0] of the same response): " + JSON.stringify(r.credit));
  ok(r.credit && /^https:\/\//.test(r.credit.uri || "") && /^https:\/\//.test(r.credit.mapsUri || ""), "1: author profile link and Google Maps link ride with the credit");
  ok(!JSON.stringify(r.credit).includes("Someone Else"), "1: no credit is borrowed from an un-fetched photo");
  ok(/no-store/.test(r.cacheControl || ""), "1: the live Google result is never cacheable: " + r.cacheControl);
  eq(cache.writes.length, 0, "1: no cache row of any kind was written (keeper and cacheSet traps never fired)");
  ok(!JSON.stringify(r).includes(FRESH) && !JSON.stringify(r).includes("FRESHCURRENTNAME"), "1: the real photo NAME is not part of the result (only the place-only pseudo-ref exists outside the call)");
}

/* ── 2. a stored real photo name in the request is never sent to Google ── */
{
  const cache = trapCache();
  const urls = [];
  const stub = googleStub({ details: [{ status: 200, body: detailsBody() }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FRESHCURRENTNAME");
  const spy = async (u, o) => { urls.push(String(u)); return stub.fn(u, o); };
  const r = await resolvePlacePhoto(live({ ref: REF, authorizeSpend: authorizer() }), { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: spy });
  eq(r.type, "redirect", "2: served");
  ok(!urls.some((u) => u.includes("STOREDOLDNAME")), "2: the stored (cached) photo name STOREDOLDNAME is never sent to Google — only the place ID is taken from a ref");
}

/* ── 3. probe: never fetches, carries no credit ── */
{
  let calls = 0;
  const r = await resolvePlacePhoto(live({ authorizeSpend: authorizer(), probe: true }),
    { ...FAKE, cacheGet: async () => null, cacheSet: async () => {}, fetchImpl: async () => { calls++; throw new Error("probe must not fetch"); } });
  eq(calls, 0, "3: a probe makes no Google call");
  ok(r.type === "miss" && !r.credit, "3: a probe is a miss with no credit");
}

/* ── 4. non-credited surface (cards, rails, lists): Google is never asked, no credit ── */
{
  let calls = 0;
  const auth = authorizer();
  const r = await resolvePlacePhoto(live({ authorizeSpend: auth, googleSurface: false }),
    { ...FAKE, cacheGet: async () => null, cacheSet: async () => {}, fetchImpl: async () => { calls++; throw new Error("a card must not reach Google"); } });
  eq(calls, 0, "4: no Google call off a credited surface");
  eq(r.reason, "not-google-surface", "4: honest miss, reason not-google-surface");
  eq(auth.count("photos") + auth.count("details_ids_only"), 0, "4: no ledger grant either");
}

/* ── 5. empty authorAttributions: the photo is served, but no author is invented ── */
{
  const stub = googleStub({ details: [{ status: 200, body: detailsBody(FRESH, []) }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FRESHCURRENTNAME");
  const r = await resolvePlacePhoto(live({ authorizeSpend: authorizer() }), { ...FAKE, ...trapCache(), fetchImpl: stub.fn });
  eq(r.type, "redirect", "5: served");
  ok(r.credit && r.credit.name === "", "5: an unnamed author yields an EMPTY name, never an invented one (the renderer shows a generic 'Google Maps' credit): " + JSON.stringify(r.credit));
}

/* ── 6. the credit follows the photo that was fetched: first photo of the response, not the second ── */
{
  const stub = googleStub({ details: [{ status: 200, body: { photos: [
    { name: SECOND, authorAttributions: [author("Second Author")] },
    { name: FRESH, authorAttributions: [author("Ana Photographer")] },
  ] } }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "SECONDPHOTO");
  const r = await resolvePlacePhoto(live({ authorizeSpend: authorizer() }), { ...FAKE, ...trapCache(), fetchImpl: stub.fn });
  ok(r.credit && r.credit.name === "Second Author", "6: the media call used photos[0] (SECONDPHOTO) and the credit is photos[0]'s author, not a later photo's: " + JSON.stringify(r.credit));
}

/* ── 7. route wiring (WEAKER — source read: the route imports next/server and Supabase, so it is not invoked here) ── */
{
  const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(!/photoCredits|keepPhotoCredits|keepCredits/.test(route), "7: WEAKER (source): /api/photo no longer imports or passes any credit keeper");
  ok(/googleSurface/.test(route) && /GOOGLE_SURFACES\s*=\s*new Set\(\["detail", "card"\]\)/.test(route) && route.includes('searchParams.get("s") !== "card" || wantJson'), "7: WEAKER (source): only detail and credited card JSON may ask Google");
  ok(/fmt["']?\)\s*===\s*["']json["']/.test(route) && /credit:\s*\{\s*name:\s*c\.name/.test(route), "7: WEAKER (source): fmt=json returns the credit with the photo");
}

if (fail.length) {
  console.error("test-photo-credit-capture: FAIL\n  - " + fail.join("\n  - "));
  process.exit(1);
}
console.log(`test-photo-credit-capture: OK — ${pass} assertions; real resolver called with a scripted Google double: live credit of the fetched photo returned, nothing cached or kept, probe and non-credited surfaces never reach Google`);
