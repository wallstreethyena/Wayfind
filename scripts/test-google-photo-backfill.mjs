#!/usr/bin/env node
// Hermetic proof for the one off Google cover photo backfill (owner, 2026-11-23:
// "turns Google photos on only for the empty cards, capped at $45").
//
// Laws, each executed against the production modules (fetch stubbed, no network):
//   A. FAIL CLOSED. No switch, no cap, a garbled cap, no month, another month or
//      a garbled per hour value buys nothing and never reaches the ledger.
//   B. ALLOWLIST ONLY. A place not on lib/googlePhotoBackfillAllowlist.js, or a
//      request by photo name (?ref=) instead of place id, can never take a grant.
//   C. CAP. The month row is asked for at most 6,400 whatever the env says, a
//      simulated ledger grants exactly 6,400 and then refuses ($44.80), the hour
//      line is asked for its own ceiling first, and a month refusal gives the hour
//      tick back. The main `photos` row is never asked and never refunded.
//   D. COVER. preferLandscape picks the first landscape photo and the credit of
//      that same photo; without it every place keeps photos[0].
//   E. CHRISTMAS. A held event at a backfill venue paints the designed tile while
//      the backfill is off, and asks for its venue cover (tile kept as fallback)
//      while it is on. A venue that is not on the list never changes.
//   F. NO PREFETCH. Neither backfill module calls Google or is imported by a cron.
//   G. ROUTE. The real app/api/photo/route.js, executed with injected doubles: the
//      backfill is asked only after the main allowance refused, only for a listed
//      place asked for by place id, and its refunds never land on `photos`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKFILL_SKU, BACKFILL_HARD_MAX, BACKFILL_DEFAULT_PER_HOUR, googlePhotoBackfillConfig, googlePhotoBackfillEnabled,
  googlePhotoBackfillEligible, takeGoogleBackfillPhotoGrant, refundGoogleBackfillPhotoGrant, backfillHourSku,
  christmasBackfillVenuePhotoSrc, isChristmasBackfillVenue,
} from "../lib/googlePhotoBackfill.js";
import { BACKFILL_BROWSE_PLACE_IDS, BACKFILL_CHRISTMAS_VENUE_PLACE_IDS, GOOGLE_PHOTO_BACKFILL_PLACE_COUNT, isGooglePhotoBackfillPlace } from "../lib/googlePhotoBackfillAllowlist.js";
import { coverPhotoIndex, liveCreditFrom, resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { CHRISTMAS_EVENT_VENUE_PLACE_IDS } from "../lib/christmasPool.js";

let failures = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; return; } failures++; console.error("google-photo-backfill: FAIL " + m); };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOV = new Date("2026-11-23T19:30:00Z");
const DEC = new Date("2026-12-02T10:00:00Z");
const ON = { WAYFIND_PHOTOS_BACKFILL: "1", GOOGLE_PHOTOS_BACKFILL_CAP: "6400", GOOGLE_PHOTOS_BACKFILL_MONTH: "2026-11" };
const LISTED = BACKFILL_BROWSE_PLACE_IDS[0];
const XMAS = BACKFILL_CHRISTMAS_VENUE_PLACE_IDS[0];
const UNLISTED = "ChIJunlistedPlaceNotOnTheBackfill00";

// ── allowlist shape ───────────────────────────────────────────────────────────
ok(BACKFILL_BROWSE_PLACE_IDS.length > 5000 && BACKFILL_BROWSE_PLACE_IDS.length <= 5724, "browse list is the swept empty set (5,724 priced, fewer once venue photos filled)");
eq(BACKFILL_CHRISTMAS_VENUE_PLACE_IDS.length, 38, "38 Christmas venue ids");
ok(Object.isFrozen(BACKFILL_BROWSE_PLACE_IDS) && Object.isFrozen(BACKFILL_CHRISTMAS_VENUE_PLACE_IDS), "both lists are frozen");
ok([...BACKFILL_BROWSE_PLACE_IDS, ...BACKFILL_CHRISTMAS_VENUE_PLACE_IDS].every((id) => /^ChIJ[A-Za-z0-9_-]{10,}$/.test(id)), "every entry is a Google place id");
eq(new Set(BACKFILL_BROWSE_PLACE_IDS).size, BACKFILL_BROWSE_PLACE_IDS.length, "no duplicate browse ids");
ok(GOOGLE_PHOTO_BACKFILL_PLACE_COUNT <= 5724 + 38, "the whole allowlist fits the priced set");
ok(GOOGLE_PHOTO_BACKFILL_PLACE_COUNT <= BACKFILL_HARD_MAX, "one cover each for every listed place fits under the 6,400 cap");
ok(isGooglePhotoBackfillPlace(LISTED) && isGooglePhotoBackfillPlace(XMAS) && !isGooglePhotoBackfillPlace(UNLISTED) && !isGooglePhotoBackfillPlace(""), "membership is exact");
ok(!isGooglePhotoBackfillPlace(LISTED.toLowerCase()) && !isGooglePhotoBackfillPlace(" " + LISTED), "no fuzzy membership");

// ── A. fail closed config ─────────────────────────────────────────────────────
const cfgOf = (env, now = NOV) => googlePhotoBackfillConfig(env, now);
eq(cfgOf({}).reason, "off", "A: nothing set is off");
eq(cfgOf({ ...ON, WAYFIND_PHOTOS_BACKFILL: "true" }).reason, "off", "A: only the literal 1 enables");
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_CAP: undefined }).reason, "cap-invalid", "A: a missing cap is off");
for (const bad of ["6,400", "6.4k", "0", "-5", "abc", "64e2", "6 400"]) {
  eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_CAP: bad }).reason, "cap-invalid", `A: cap ${JSON.stringify(bad)} is off`);
}
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_MONTH: undefined }).reason, "month-invalid", "A: a missing month is off");
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_MONTH: "2026-13" }).reason, "month-invalid", "A: a garbled month is off");
eq(cfgOf(ON, DEC).reason, "month", "A: November's switch buys nothing in December (the cap is a total, not monthly)");
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_PER_HOUR: "4/h" }).reason, "per-hour-invalid", "A: a garbled per hour value is off, not a default");
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_PER_HOUR: "401" }).reason, "per-hour-invalid", "A: per hour above 400 is off");
eq(cfgOf(ON).perHour, BACKFILL_DEFAULT_PER_HOUR, "A: per hour defaults to 4");
eq(BACKFILL_DEFAULT_PER_HOUR * 24 < 100, true, "A: the default day (96) fits a 100 a day Google quota");
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_CAP: "64000" }).cap, 6400, "A: a typo cap of 64,000 is clamped to 6,400");
eq(cfgOf({ ...ON, GOOGLE_PHOTOS_BACKFILL_CAP: "500" }).cap, 500, "A: a smaller cap is honoured");
eq(BACKFILL_HARD_MAX * 7 / 1000 <= 45, true, "A: 6,400 photos at $7 per 1,000 is at most $45");
ok(googlePhotoBackfillEnabled(ON, NOV) && !googlePhotoBackfillEnabled({}, NOV), "A: enabled mirrors config");

// A fake ledger: real wf_spend_take semantics (used < cap, then used++), keyed by sku.
function fakeLedger() {
  const rows = new Map(), asks = [], refunds = [];
  return {
    rows, asks, refunds,
    take: async (sku, cap) => { asks.push([sku, cap]); const u = rows.get(sku) || 0; if (u >= cap) return { ok: false, reason: "cap" }; rows.set(sku, u + 1); return { ok: true, reason: "granted" }; },
    refund: async (sku, n) => { refunds.push([sku, n]); rows.set(sku, Math.max(0, (rows.get(sku) || 0) - n)); return true; },
  };
}
const base = (L, extra = {}) => ({ env: ON, now: NOV, take: L.take, refund: L.refund, nonprodBlocked: () => false, mode: () => "free", ...extra });

{
  for (const env of [{}, { ...ON, GOOGLE_PHOTOS_BACKFILL_CAP: "6,400" }, { ...ON, GOOGLE_PHOTOS_BACKFILL_MONTH: "2026-12" }]) {
    const L = fakeLedger();
    const g = await takeGoogleBackfillPhotoGrant(LISTED, base(L, { env }));
    ok(!g.ok && L.asks.length === 0, `A: ${g.reason}: refused before any ledger call`);
  }
  const L = fakeLedger();
  ok(!(await takeGoogleBackfillPhotoGrant(LISTED, base(L, { mode: () => "shut" }))).ok && L.asks.length === 0, "A: WAYFIND_GATE=shut buys nothing");
  ok(!(await takeGoogleBackfillPhotoGrant(LISTED, base(L, { nonprodBlocked: () => true }))).ok && L.asks.length === 0, "A: preview or dev buys nothing");
  const thrown = await takeGoogleBackfillPhotoGrant(LISTED, base(L, { take: async () => { throw new Error("ledger down"); } }));
  ok(!thrown.ok, "A: a ledger that throws is a refusal");
}

// ── B. allowlist only ─────────────────────────────────────────────────────────
{
  const L = fakeLedger();
  const g = await takeGoogleBackfillPhotoGrant(UNLISTED, base(L));
  ok(!g.ok && g.reason === "not-allowlisted" && L.asks.length === 0, "B: an unlisted place never reaches the ledger");
  ok(!googlePhotoBackfillEligible({ placeId: LISTED, ref: "places/" + LISTED + "/photos/abc" }), "B: a request by photo name is not a cover request");
  ok(googlePhotoBackfillEligible({ placeId: LISTED, ref: "" }) && !googlePhotoBackfillEligible({ placeId: UNLISTED, ref: "" }), "B: eligibility is the allowlist");
}

// ── C. cap and hour line ──────────────────────────────────────────────────────
{
  const L = fakeLedger();
  const g = await takeGoogleBackfillPhotoGrant(LISTED, base(L));
  ok(g.ok && g.sku === BACKFILL_SKU && g.hourSku === backfillHourSku(NOV), "C: a grant names its month and hour rows");
  eq(JSON.stringify(L.asks), JSON.stringify([[backfillHourSku(NOV), 4], [BACKFILL_SKU, 6400]]), "C: hour line first, then the month cap");
  ok(L.asks.every(([sku]) => sku !== "photos"), "C: the main photos row is never asked");
  ok(/^[a-z0-9_:-]{1,64}$/.test(backfillHourSku(NOV)) && /^[a-z0-9_:-]{1,64}$/.test(BACKFILL_SKU), "C: both sku names pass the ledger's own sku check");
  // Hour line: the 5th grant inside one hour is refused, and never asks the month row.
  for (let i = 0; i < 3; i++) await takeGoogleBackfillPhotoGrant(LISTED, base(L));
  const before = L.asks.length;
  const fifth = await takeGoogleBackfillPhotoGrant(LISTED, base(L));
  ok(!fifth.ok && fifth.reason === "hour-cap" && L.asks.length === before + 1, "C: the hour line refuses the 5th photo in an hour without touching the month row");
  const nextHour = await takeGoogleBackfillPhotoGrant(LISTED, base(L, { now: new Date(NOV.getTime() + 3600_000) }));
  ok(nextHour.ok, "C: the next hour opens again");
  // Refund goes to the backfill rows only.
  const r = fakeLedger(); const gg = await takeGoogleBackfillPhotoGrant(LISTED, base(r));
  await refundGoogleBackfillPhotoGrant(gg, { refund: r.refund });
  eq(JSON.stringify(r.refunds), JSON.stringify([[BACKFILL_SKU, 1], [gg.hourSku, 1]]), "C: a refund returns one photo to the backfill and hour rows");
  ok(!(await refundGoogleBackfillPhotoGrant({ ok: true, sku: "photos" }, { refund: r.refund })) && r.refunds.length === 2, "C: refund refuses anything that is not a backfill grant");
}
{
  // Month cap: with a wide hour line, 7,000 asks across hours grant exactly 6,400.
  const L = fakeLedger();
  const env = { ...ON, GOOGLE_PHOTOS_BACKFILL_CAP: "99999", GOOGLE_PHOTOS_BACKFILL_PER_HOUR: "400" };
  let granted = 0;
  for (let i = 0; i < 7000; i++) {
    // 400 asks per UTC day (one hour row each), all inside November.
    const g = await takeGoogleBackfillPhotoGrant(LISTED, base(L, { env, now: new Date(Date.UTC(2026, 10, 1 + Math.floor(i / 400), 0)) }));
    if (g.ok) granted++;
  }
  eq(granted, 6400, "C: the month row grants exactly 6,400 photos, then refuses");
  ok(L.asks.filter(([s]) => s === BACKFILL_SKU).every(([, cap]) => cap === 6400), "C: the month cap sent to the ledger is never above 6,400");
  eq((granted * 7 / 1000).toFixed(2), "44.80", "C: the most this can bill is $44.80");
  const hourRefunds = L.refunds.filter(([s]) => s.startsWith("photos_backfill_1123_h")).length;
  eq(hourRefunds, 600, "C: every refused month ask gave its hour tick back");
}
{
  // Through the real spendGate ledger client, with fetch stubbed.
  const saved = { ...process.env }; const savedFetch = globalThis.fetch;
  const asks = [];
  try {
    for (const k of ["WF_GUARD_SUITE"]) delete process.env[k];
    Object.assign(process.env, ON, { SUPABASE_URL: "https://ledger.test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-key", VERCEL_ENV: "production", WAYFIND_GATE: "free" });
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (!u.startsWith("https://ledger.test.invalid/rest/v1/rpc/")) throw new Error("unexpected network call");
      const b = JSON.parse(init.body); asks.push([u.split("/").pop(), b.p_sku, b.p_cap ?? b.p_n]);
      return { ok: true, status: 200, json: async () => true };
    };
    const g = await takeGoogleBackfillPhotoGrant(LISTED, { now: NOV });
    ok(g.ok, "C: real ledger client grants");
    ok(asks.length === 2 && asks.every(([rpc, sku]) => rpc === "wf_spend_take" && sku !== "photos"), "C: real ledger client asks only the backfill rows");
    process.env.VERCEL_ENV = "preview"; asks.length = 0;
    ok(!(await takeGoogleBackfillPhotoGrant(LISTED, { now: NOV })).ok && asks.length === 0, "C: a preview deployment never asks the ledger");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved); globalThis.fetch = savedFetch;
  }
}

// ── D. cover choice and credit ────────────────────────────────────────────────
{
  const pid = LISTED;
  const photos = [
    { name: `places/${pid}/photos/portrait`, widthPx: 3024, heightPx: 4032, authorAttributions: [{ displayName: "Portrait Author", uri: "https://maps.google.com/contrib/1" }], googleMapsUri: "https://maps.google.com/p1" },
    { name: `places/${pid}/photos/square`, widthPx: 1000, heightPx: 1000, authorAttributions: [{ displayName: "Square Author" }] },
    { name: `places/${pid}/photos/wide`, widthPx: 4000, heightPx: 3000, authorAttributions: [{ displayName: "Wide Author", uri: "https://maps.google.com/contrib/3" }], googleMapsUri: "https://maps.google.com/p3" },
  ];
  eq(coverPhotoIndex(photos, true), 2, "D: the first landscape photo is chosen");
  eq(coverPhotoIndex(photos, false), 0, "D: without the flag every place keeps photos[0]");
  eq(coverPhotoIndex(photos.slice(0, 2), true), 0, "D: no landscape photo falls back to the first");
  eq(coverPhotoIndex([{ widthPx: 2, heightPx: 1 }, photos[2]], true), 0, "D: a landscape first photo stays first (no skip heuristic)");
  eq(liveCreditFrom({ photos }, 2).name, "Wide Author", "D: the credit is the chosen photo's author");
  eq(liveCreditFrom({ photos }).name, "Portrait Author", "D: default credit is still photos[0]");

  const run = async (preferLandscape) => {
    const calls = [];
    const fetchImpl = async (url) => {
      const u = String(url); calls.push(u);
      if (u.includes("?fields=photos")) return { ok: true, status: 200, json: async () => ({ photos }) };
      if (u.includes("/media")) return { ok: true, status: 200, json: async () => ({ photoUri: "https://lh3.googleusercontent.com/p/test=" + (u.includes("/wide/") ? "wide" : "other") }) };
      throw new Error("unexpected " + u);
    };
    const r = await resolvePlacePhoto({ place: pid, w: 1280, googleSurface: true, serverKey: "test", preferLandscape, authorizeSpend: async () => ({ ok: true }) },
      { fetchImpl, inventoryGet: async () => null, breakerOpen: async () => null, tripBreaker: async () => {}, refund: async () => true });
    return { r, calls };
  };
  const wide = await run(true);
  ok(wide.calls.some((u) => u.includes("/photos/wide/media")) && !wide.calls.some((u) => u.includes("/photos/portrait/media")), "D: the resolver fetches the landscape photo for a backfill place");
  eq(wide.r.credit && wide.r.credit.name, "Wide Author", "D: the answer carries the landscape photo's own credit");
  ok(wide.r.credit && wide.r.credit.mapsUri === "https://maps.google.com/p3", "D: the Google Maps link of that same photo rides along");
  const first = await run(false);
  ok(first.calls.some((u) => u.includes("/photos/portrait/media")), "D: any other place is unchanged (photos[0])");
}

// ── E. Christmas cards ────────────────────────────────────────────────────────
{
  ok(BACKFILL_CHRISTMAS_VENUE_PLACE_IDS.every(isChristmasBackfillVenue), "E: every Christmas venue id is recognised");
  eq(christmasBackfillVenuePhotoSrc(XMAS, {}, NOV), "", "E: off means no backfill photo");
  eq(christmasBackfillVenuePhotoSrc(UNLISTED, ON, NOV), "", "E: an unlisted venue never gets one");
  ok(christmasBackfillVenuePhotoSrc(XMAS, ON, NOV).startsWith("/api/photo?place=" + XMAS + "&"), "E: on means the venue cover request");
  const mapped = Object.values(CHRISTMAS_EVENT_VENUE_PLACE_IDS);
  eq(mapped.filter(isChristmasBackfillVenue).length >= 20, true, "E: the name matched venues are in the code map");
  const heldId = "boyd-hill-smores-with-santa-2026";
  const pid = CHRISTMAS_EVENT_VENUE_PLACE_IDS[heldId];
  ok(isChristmasBackfillVenue(pid), "E: Boyd Hill is a backfill venue");
  const ev = { event_id: heldId, slug: heldId, event_name: "S'mores with Santa", short_title: "S'mores with Santa", city: "St. Petersburg", place_id: pid, tags: ["christmas"], start_date: "2026-12-12", end_date: "2026-12-12" };
  const saved = { ...process.env };
  try {
    for (const k of Object.keys(ON)) delete process.env[k];
    const off = christmasEventCard(ev, { today: "2026-11-23" });
    ok(!off.image && off.placeholder, "E: switched off, the held card keeps its designed tile");
    const now = new Date(); const month = now.toISOString().slice(0, 7);
    Object.assign(process.env, ON, { GOOGLE_PHOTOS_BACKFILL_MONTH: month });
    const on = christmasEventCard(ev, { today: "2026-11-23" });
    ok(String(on.image || "").startsWith("/api/photo?place=" + pid + "&"), "E: switched on, the card asks for its venue cover");
    ok(!!on.placeholder, "E: the designed tile stays as the fallback");
    const other = christmasEventCard({ ...ev, event_id: "x-not-mapped-2026", slug: "x-not-mapped-2026", place_id: UNLISTED }, { today: "2026-11-23" });
    ok(!String(other.image || "").includes(UNLISTED) || other.image === "/api/photo?place=" + UNLISTED + "&g=2&w=640", "E: an unlisted venue is untouched by the backfill");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

// ── G. the real route, executed (imports replaced by injected doubles) ───────
{
  const routeSrc = readFileSync(path.join(ROOT, "app/api/photo/route.js"), "utf8");
  const L = fakeLedger();
  const seen = [];
  const T = globalThis.__wfBackfillRoute = {
    gateShut: () => false,
    spendAllow: async () => false,
    spendAllowPhotos: async () => false,
    mainAsks: 0,
    spendAllowPhotosDetailed: async () => { T.mainAsks++; return { ok: false, reason: "cap" }; },
    photosCeiling: () => 950,
    mainRefunds: [],
    refundToLedger: async (sku, n) => { T.mainRefunds.push([sku, n]); return true; },
    FALLBACK_PATH: "/wf-photo-fallback.svg",
    PHOTO_REF_RX: /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/,
    placeIdFromRef: (r) => (/^places\/([A-Za-z0-9_-]+)\/photos\//.exec(String(r || "")) || [])[1] || "",
    // A resolver double that asks for ONE photos grant, then reports it unbilled.
    resolvePlacePhoto: async (input, deps) => {
      const g = await input.authorizeSpend("photos");
      seen.push({ input, grant: g });
      if (g && g.ok && deps && typeof deps.refund === "function") await deps.refund("photos", 1);
      return { type: "miss", location: null, cacheControl: "private, no-store", reason: g && g.ok ? "owned-miss" : "spend-denied", ledgerReason: g && g.reason, ref: "", upstream: "quota", retried: false, refunded: g && g.ok ? 1 : 0 };
    },
    findFreePhoto: async () => null,
    LICENSED_SOURCES: new Set(),
    recordPhotoOutcome: async () => {}, recordPhotoDeniedCeiling: async () => {}, ledgerOutcomeClass: (r) => "ledger-" + (r || "x"),
    purchases: [],
    recordPhotoPurchase: async (row) => { T.purchases.push(row); },
    bucketHash: () => null, idempotencyKey: () => "k", uaClass: () => "browser",
    recordReaderPhotoMiss: async () => {},
    isAutomatedPhotoReader: () => false,
    creditedRequest: () => true,
    googlePhotoBackfillEligible,
    takeGoogleBackfillPhotoGrant: (placeId) => takeGoogleBackfillPhotoGrant(placeId, base(L)),
    refundGoogleBackfillPhotoGrant: (grant) => refundGoogleBackfillPhotoGrant(grant, { refund: L.refund }),
  };
  const names = ["gateShut", "spendAllow", "spendAllowPhotos", "spendAllowPhotosDetailed", "photosCeiling", "refundToLedger", "FALLBACK_PATH", "PHOTO_REF_RX", "placeIdFromRef", "resolvePlacePhoto", "findFreePhoto", "LICENSED_SOURCES", "recordPhotoOutcome", "recordPhotoDeniedCeiling", "ledgerOutcomeClass", "recordPhotoPurchase", "bucketHash", "idempotencyKey", "uaClass", "recordReaderPhotoMiss", "isAutomatedPhotoReader", "creditedRequest", "googlePhotoBackfillEligible", "takeGoogleBackfillPhotoGrant", "refundGoogleBackfillPhotoGrant"];
  const prelude = `
    const NextResponse = {
      json(value, init = {}) { return new Response(JSON.stringify(value), { status: (init && init.status) || 200, headers: init && init.headers }); },
      redirect(url, init = {}) { const h = new Headers((init && init.headers) || {}); h.set("location", String(url)); return new Response(null, { status: (init && init.status) || 307, headers: h }); },
    };
    const waitUntil = (p) => p;
    const T = globalThis.__wfBackfillRoute;
    ${names.map((n) => `const ${n} = (typeof T.${n} === "function" && !(T.${n} instanceof RegExp)) ? (...a) => T.${n}(...a) : T.${n};`).join("\n    ")}
  `;
  const stripped = routeSrc.replace(/^import[^;]+;\n/gm, "");
  ok(!/^import /m.test(stripped), "G: every route import was replaced");
  const mod = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));
  const get = (qs) => mod.GET(new Request("https://wayfind.test/api/photo?" + qs, { headers: { "user-agent": "Mozilla/5.0 (iPhone)", "sec-fetch-site": "same-origin" } }));
  const saved = { ...process.env };
  try {
    process.env.GOOGLE_MAPS_SERVER_KEY = "test";
    await get(`place=${LISTED}&s=card&fmt=json&w=1200`);
    ok(seen.length === 1 && seen[0].grant && seen[0].grant.ok && seen[0].grant.reason === "granted-backfill", "G: a listed cover request is granted from the backfill after the main allowance said cap");
    ok(seen[0].input.preferLandscape === true, "G: a backfill place asks for the landscape cover");
    eq(T.mainAsks, 1, "G: the main allowance was asked first");
    eq(JSON.stringify(L.asks.map(([sku]) => sku)), JSON.stringify([backfillHourSku(NOV), BACKFILL_SKU]), "G: the route took one hour tick and one backfill photo");
    eq(JSON.stringify(L.refunds.map(([sku]) => sku)), JSON.stringify([BACKFILL_SKU, backfillHourSku(NOV)]), "G: the unbilled grant went back to the backfill rows");
    eq(T.mainRefunds.length, 0, "G: nothing was refunded into the main photos row");
    eq(T.purchases.at(-1) && T.purchases.at(-1).ledgerReason, "granted-backfill", "G: the purchase log names the backfill");

    seen.length = 0; L.asks.length = 0;
    await get(`place=${UNLISTED}&s=card&fmt=json&w=1200`);
    ok(seen.length === 1 && !seen[0].grant.ok && seen[0].grant.reason === "cap" && L.asks.length === 0, "G: an unlisted place keeps the main refusal and never reaches the backfill");
    ok(seen[0].input.preferLandscape === false, "G: an unlisted place keeps Google's first photo");

    seen.length = 0; L.asks.length = 0;
    await get(`ref=${encodeURIComponent("places/" + LISTED + "/photos/abc")}&s=detail&w=1200`);
    ok(seen.length === 1 && !seen[0].grant.ok && L.asks.length === 0, "G: a photo name request (detail gallery) for a listed place never uses the backfill");

    seen.length = 0; L.asks.length = 0;
    T.spendAllowPhotosDetailed = async () => ({ ok: true, reason: "granted" });
    await get(`place=${LISTED}&s=card&fmt=json&w=1200`);
    ok(seen.length === 1 && seen[0].grant.ok && seen[0].grant.reason === "granted" && L.asks.length === 0, "G: while the main allowance has room the backfill is untouched");
    eq(JSON.stringify(T.mainRefunds.map(([sku]) => sku)), JSON.stringify(["photos"]), "G: a main grant is refunded to the main row as before");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

// ── F. no prefetch, no direct Google call ────────────────────────────────────
{
  for (const f of ["lib/googlePhotoBackfill.js", "lib/googlePhotoBackfillAllowlist.js", "lib/googlePhotoBackfillChristmas.js"]) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    ok(!src.includes("places.googleapis.com") && !/\bfetch\(/.test(src), `F: ${f} never calls Google or the network itself`);
  }
  const cronDir = path.join(ROOT, "app/api/cron");
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const crons = walk(cronDir).filter((p) => p.endsWith(".js"));
  ok(crons.length > 0 && crons.every((p) => !/googlePhotoBackfill/.test(readFileSync(p, "utf8"))), "F: no cron imports the backfill (Terms 3.2.3(a)(i): no pre fetch)");
  const route = readFileSync(path.join(ROOT, "app/api/photo/route.js"), "utf8");
  ok(/googlePhotoBackfillEligible\(\{ placeId: place, ref \}\)/.test(route), "F: the route asks eligibility with the place id and the ref");
  ok(/spendAllowPhotosDetailed\(\)\.then\(async \(main\) => \{\s*if \(\(main && main\.ok\) \|\| !backfillEligible\) return main;/.test(route), "F: the backfill is asked only after the main allowance refused, and only when eligible");
  ok(/if \(shut\) return \{ ok: false, reason: "shut" \};\s*if \(sku === "photos" && free\)/.test(route), "F: a shut gate and a free photo still refuse first");
}

console.log(`google-photo-backfill: ${failures ? "FAIL" : "OK"} (${passes} passed, ${failures} failed)`);
process.exit(failures ? 1 : 0);
