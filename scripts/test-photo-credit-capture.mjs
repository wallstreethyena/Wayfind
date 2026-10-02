#!/usr/bin/env node
// scripts/test-photo-credit-capture.mjs — the photo lane keeps the credit
// Google already sent, tied to the EXACT photo it fetched (2026-10-01).
//
// THE GAP. lib/placePhotoServe.js's fresh-first lookup and stale-name heal
// both read a Place Details `?fields=photos` response (IDs Only, free) that
// carries every photo's authorAttributions, kept only photos[0].name, and
// cached the image under the REQUESTED ref, not the name it was fetched with.
// /api/photo-credits joins cache rows and wf_photo_credit by exact photo
// name, so a freshly fetched Google photo could never be credited — and the
// blog fails closed on an uncredited Google photo.
//
// THE FIX, locked here BY CALLING the real resolver with a scripted Google
// double (zero network):
//   1. the Details response the resolver already received is handed to the
//      caller's credit keeper — no extra Google call, no extra grant;
//   2. the image is also cached under the exact fetched name, same place only;
//   3. end to end, pickCachedCredits pairs the credit with THAT name only —
//      the stale requested ref is never credited (no borrowed credit);
//   4. a probe never reaches the keeper; an empty authorAttributions stores
//      nothing (fail closed); another place's photo is never cached or credited.
//
// RED-PROOF: drop either creditsFrom(placeId, j) call, the `name:` on a
// successful flush, or the second remember() in resolvePlacePhoto, and this
// guard fails.
import { readFileSync } from "node:fs";
import { photoCacheKey, resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { extractPhotoCredits, pickCachedCredits } from "../lib/photoCredits.js";

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

/* ── 1. fresh-first: credit kept from the SAME Details response, image cached under the exact name ── */
{
  const auth = authorizer();
  const cache = memCache();
  const kept = [];
  const stub = googleStub({ details: [{ status: 200, body: detailsBody() }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FRESHCURRENTNAME");
  const r = await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: auth, freshFirst: true, keepCredits: (pid, photos) => kept.push({ pid, photos }) },
    { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: stub.fn },
  );
  eq(r.type, "redirect", "1: served");
  eq(stub.calls.join(","), "details,healedSkip", "1: no extra Google call — the same one Details lookup + one media call");
  eq(auth.count("details_ids_only"), 1, "1: one IDs-only grant, as before");
  eq(kept.length, 1, "1: the keeper received the Details response exactly once");
  eq(kept[0] && kept[0].pid, PLACE, "1: keeper is told the place the response belongs to");
  ok(cache.store.has(photoCacheKey(FRESH, 640)), "1: the image is cached under the EXACT fetched name");
  ok(cache.store.has(photoCacheKey(REF, 640)), "1: the requested ref still gets its row (existing card lookups keep hitting)");
  // End to end through the real credit code.
  const rows = extractPhotoCredits([{ id: kept[0].pid, photos: kept[0].photos }], 30 * DAY);
  const shown = pickCachedCredits(rows, liveNamesFrom(cache.store));
  eq(shown.length, 1, "1: exactly one credit pairs with a live cached image");
  eq(shown[0] && shown[0].photo_name, FRESH, "1: the credit is the one for the photo actually fetched");
  eq(shown[0] && shown[0].author_name, "Ana Photographer", "1: the fetched photo's own author");
  ok(!shown.some((c) => c.photo_name === REF || c.photo_name === SECOND), "1: no credit is borrowed by the stale ref or an un-fetched photo");
}

/* ── 2. stale-name heal: same capture on the heal path ── */
{
  const cache = memCache();
  const kept = [];
  const stub = googleStub({ skip: [{ status: 404, body: { error: { status: "NOT_FOUND" } } }], details: [{ status: 200, body: detailsBody() }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FRESHCURRENTNAME");
  const r = await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: authorizer(), keepCredits: (pid, photos) => kept.push({ pid, photos }) },
    { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: stub.fn },
  );
  eq(r.type, "redirect", "2: healed and served");
  eq(stub.calls.join(","), "skip,details,healedSkip", "2: heal makes no extra Google call");
  eq(kept.length, 1, "2: heal path hands its Details response to the keeper");
  ok(cache.store.has(photoCacheKey(FRESH, 640)), "2: healed image cached under the exact healed name");
  const shown = pickCachedCredits(extractPhotoCredits([{ id: PLACE, photos: kept[0].photos }], 30 * DAY), liveNamesFrom(cache.store));
  eq(shown.map((c) => c.photo_name).join(), FRESH, "2: only the healed photo's own credit is shown");
}

/* ── 3. stored name works: no Details call, no keeper call, no extra row ── */
{
  const cache = memCache();
  let keeps = 0;
  const stub = googleStub({ skip: [{ status: 200, body: { photoUri: OWNED } }] });
  const r = await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: authorizer(), keepCredits: () => keeps++ },
    { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: stub.fn },
  );
  eq(r.type, "redirect", "3: served from the stored name");
  eq(stub.calls.join(","), "skip", "3: no Details call when the stored name works");
  eq(keeps, 0, "3: nothing to keep (no Details response was received)");
  eq([...cache.store.keys()].filter((k) => k.startsWith("photo|")).length, 1, "3: exactly one cache row (requested ref == fetched name)");
}

/* ── 4. probe: never fetches, never keeps ── */
{
  let keeps = 0, calls = 0;
  await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: authorizer(), freshFirst: true, probe: true, keepCredits: () => keeps++ },
    { ...FAKE, cacheGet: async () => null, cacheSet: async () => {}, fetchImpl: async () => { calls++; throw new Error("probe must not fetch"); } },
  );
  eq(calls + keeps, 0, "4: a probe makes no Google call and keeps no credit");
}

/* ── 5. verified-empty authorAttributions: nothing stored, nothing shown (fail closed) ── */
{
  const cache = memCache();
  const kept = [];
  const stub = googleStub({ details: [{ status: 200, body: detailsBody(FRESH, []) }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FRESHCURRENTNAME");
  await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: authorizer(), freshFirst: true, keepCredits: (pid, photos) => kept.push({ pid, photos }) },
    { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: stub.fn },
  );
  const shown = pickCachedCredits(extractPhotoCredits([{ id: PLACE, photos: kept[0].photos }], 30 * DAY), liveNamesFrom(cache.store));
  eq(shown.length, 0, "5: a photo with no author yields no credit (blog keeps failing closed)");
}

/* ── 6. another place's photo: never cached under that name, never credited ── */
{
  const cache = memCache();
  const kept = [];
  const FOREIGN = "places/ChIJSomeOtherPlace9999/photos/FOREIGNNAME";
  const stub = googleStub({ details: [{ status: 200, body: detailsBody(FOREIGN) }], healedSkip: [{ status: 200, body: { photoUri: OWNED } }] }, "FOREIGNNAME");
  await resolvePlacePhoto(
    { ref: REF, w: 640, serverKey: "k", authorizeSpend: authorizer(), freshFirst: true, keepCredits: (pid, photos) => kept.push({ pid, photos }) },
    { ...FAKE, cacheGet: cache.cacheGet, cacheSet: cache.cacheSet, fetchImpl: stub.fn },
  );
  ok(!cache.store.has(photoCacheKey(FOREIGN, 640)), "6: a photo name of another place is never cached as this place's image");
  const rows = extractPhotoCredits([{ id: PLACE, photos: (kept[0] || {}).photos || [] }], 30 * DAY);
  ok(!rows.some((x) => x.photo_name === FOREIGN), "6: another place's photo is never credited to this place");
}

/* ── 7. route wiring (WEAKER — source read: the route imports next/server and Supabase, so it is not invoked here) ── */
{
  const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(/import\s*\{\s*keepPhotoCredits\s*\}\s*from\s*"[./]+lib\/photoCredits"/.test(route), "7: WEAKER (source): /api/photo imports keepPhotoCredits");
  ok(/keepCredits:\s*\(placeId,\s*photos\)\s*=>\s*keepPhotoCredits\(\[\{\s*id:\s*placeId,\s*photos\s*\}\]/.test(route), "7: WEAKER (source): /api/photo passes a keepCredits that pins the place id");
}

if (fail.length) {
  console.error("test-photo-credit-capture: FAIL\n  - " + fail.join("\n  - "));
  process.exit(1);
}
console.log(`test-photo-credit-capture: OK — ${pass} assertions; real resolver called with a scripted Google double on fresh-first, heal, stored-name, probe, empty-author and foreign-photo paths; credit paired by exact name end to end`);
