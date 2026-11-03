// scripts/test-promote-details.mjs — offline tests for lib/promoteDetails.js and
// the gate-mode arithmetic of spendAllowCapped (lib/spendGate.js). NO network:
// the ledger call is stubbed by pointing fetch at a local function.
import { CORE_DETAILS_MASK, RATING_DETAILS_MASK, PROMOTE_SKU, RATING_SKU, withIndexSignals, maskTier, hasIndexRating, classifyDetailsFailure, minutesUntilQuotaReset } from "../lib/promoteDetails.js";
import { buildInventoryRow } from "../lib/seedPlaces.js";
import { toWriteRow } from "../lib/promoteIndex.js";

let pass = 0;
const fail = (m) => { console.error("test-promote-details: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (g, w, m) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail(`${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); pass++; };

// ── mask tier ───────────────────────────────────────────────────────────────
eq(maskTier(CORE_DETAILS_MASK), "pro", "the core mask bills at Pro");
eq(maskTier(RATING_DETAILS_MASK), "enterprise", "the rating mask bills at Enterprise (not Atmosphere: no editorialSummary)");
eq(RATING_SKU, "details_enterprise", "the rating SKU matches the rating mask tier");
ok(!RATING_DETAILS_MASK.includes("editorialSummary") && !RATING_DETAILS_MASK.includes("priceLevel"), "the rating mask adds only the stars");

// ── hasIndexRating — the per-place mask decision ────────────────────────────
eq(hasIndexRating({ rating: 4.6, reviews: 312 }), true, "a numeric rating on the index -> CORE");
eq(hasIndexRating({ rating: null, reviews: 0 }), false, "the live no-rating shape {rating:null,reviews:0} -> buy the stars");
eq(hasIndexRating({ rating: "4.6" }), false, "a string rating is not a rating");
eq(hasIndexRating(null), false, "no signals -> buy the stars");
eq(hasIndexRating(undefined), false, "missing index row -> buy the stars");
eq(hasIndexRating({ rating: NaN }), false, "NaN is not a rating");
eq(maskTier("id,location,types,photos"), "essentials", "ids+geo+types+photos alone is Essentials");
eq(maskTier(CORE_DETAILS_MASK + ",rating"), "enterprise", "adding rating raises the tier to Enterprise");
eq(maskTier(CORE_DETAILS_MASK + ",editorialSummary"), "enterprise", "adding editorialSummary raises the tier (Atmosphere)");
eq(maskTier(CORE_DETAILS_MASK + ",priceLevel"), "enterprise", "adding priceLevel raises the tier");
eq(PROMOTE_SKU, "details_pro", "the ledger SKU matches the mask tier");

// ── withIndexSignals ────────────────────────────────────────────────────────
const core = { id: "p1", displayName: { text: "Cafe X" }, location: { latitude: 27.5, longitude: -82.4 }, types: ["cafe"], primaryType: "cafe", businessStatus: "OPERATIONAL", photos: [{ name: "places/p1/photos/a" }] };
const hydrated = withIndexSignals(core, { rating: 4.6, reviews: 312 });
eq(hydrated.rating, 4.6, "index rating lands on the resource");
eq(hydrated.userRatingCount, 312, "index reviews land as userRatingCount");
ok(!("rating" in core), "input is not mutated");
eq(withIndexSignals(core, null), core, "null signals: same shape, no invented fields (deep-equal)");
eq(withIndexSignals(core, { rating: "4.6", reviews: -3 }).rating, undefined, "a string rating is not a number — ignored");
eq(withIndexSignals(core, { rating: "4.6", reviews: -3 }).userRatingCount, undefined, "a negative review count is ignored");
eq(withIndexSignals({ ...core, rating: 4.9, userRatingCount: 10 }, { rating: 4.6, reviews: 312 }).rating, 4.9, "a value Google returned is never overwritten");
eq(withIndexSignals(core, { rating: 4.2, reviews: 7.8 }).userRatingCount, 7, "fractional review counts floor");
eq(withIndexSignals(null, { rating: 4 }), null, "non-object input passes through");

// ── the promoter sees the same row it always did ────────────────────────────
const nowIso = "2026-09-01T00:00:00.000Z";
const built = buildInventoryRow(hydrated, "manatee-sarasota", { nowIso });
ok(built.row, "a hydrated core resource builds a row");
eq(built.row.signals.rating, 4.6, "signals.rating comes from the index");
eq(built.row.signals.reviews, 312, "signals.reviews comes from the index");
eq(built.row.signals.price, null, "price is null (enrichment, not bought at promotion)");
eq(built.row.editorial, null, "editorial is null (enrichment, not bought at promotion)");
// 2026-10-08 (Maps Terms 3.2.3, "cannot cache a photo name"): the row keeps only the place-only
// pseudo-ref (presence = Google reported a photo), never the real name `.../photos/a`.
eq(built.row.photo_ref, "places/p1/photos/wfplacediscovery", "photo presence is kept as the place-only pseudo-ref (Essentials, free), never the real photo name");
eq(JSON.stringify(built.row).indexOf("/photos/a\""), -1, "the built inventory row carries no real Google photo name anywhere");
const written = toWriteRow({ ...built.row, photo_ref: "places/p1/photos/REAL" }, nowIso);
eq(written.photo_ref, "places/p1/photos/wfplacediscovery", "toWriteRow collapses a real photo name to the pseudo-ref before it reaches wf_inventory");
eq(toWriteRow({ ...built.row, photo_ref: null }, nowIso).photo_ref, null, "toWriteRow keeps 'no photo' as null");
eq(built.row.status, "OPERATIONAL", "businessStatus still gates closed listings");
const bare = buildInventoryRow(withIndexSignals(core, null), "manatee-sarasota", { nowIso });
eq(bare.row.signals.rating, null, "no index signal -> rating null (never invented)");
eq(bare.row.signals.reviews, 0, "no index signal -> reviews 0, same as a place Google has no rating for");

// ── spendAllowCapped: mode arithmetic, ledger stubbed ────────────────────────
process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_stub";
// The build environment may carry the promotion-only paid switch (owner-approved
// 2026-09-28). These cases pin the FREE/OPEN arithmetic, so clear it; the paid
// ceiling has its own proof in scripts/test-promote-paid-cap.mjs.
delete process.env.WAYFIND_PROMOTE_PAID;
delete process.env.PROMOTE_DETAILS_MONTH_CAP;
const { spendAllowCapped } = await import("../lib/spendGate.js");
const takes = [];
globalThis.fetch = async (url, init) => {
  takes.push(JSON.parse(init.body));
  return { ok: true, json: async () => true };
};
const withMode = async (mode, fn) => { process.env.WAYFIND_GATE = mode; try { return await fn(); } finally { delete process.env.WAYFIND_GATE; } };

takes.length = 0;
eq(await withMode("shut", () => spendAllowCapped("details_pro", 7500)), false, "shut: always false");
eq(takes.length, 0, "shut: the ledger is never even asked");

takes.length = 0;
eq(await withMode("free", () => spendAllowCapped("details_pro", 7500)), true, "free: grant flows through the ledger");
eq(takes[0], { p_sku: "details_pro", p_cap: 4800 }, "free: cap is clamped to the free tier, whatever month_cap says");

takes.length = 0;
eq(await withMode("free", () => spendAllowCapped("details_pro", 1200)), true, "free: a cap below the free tier is honored");
eq(takes[0].p_cap, 1200, "free: min(month_cap, free tier)");

takes.length = 0;
eq(await withMode("open", () => spendAllowCapped("details_pro", 7500)), true, "open: grant flows through the ledger");
eq(takes[0], { p_sku: "details_pro", p_cap: 7500 }, "open: month_cap IS the cap — never unlimited");

for (const bad of [0, -1, null, undefined, "", "x", NaN, Infinity]) {
  takes.length = 0;
  eq(await withMode("open", () => spendAllowCapped("details_pro", bad)), false, `open: cap ${String(bad)} fails closed`);
  eq(takes.length, 0, `open: cap ${String(bad)} never reaches the ledger`);
}
takes.length = 0;
eq(await withMode("free", () => spendAllowCapped("not_a_sku", 100)), false, "free: unknown SKU fails closed");

globalThis.fetch = async () => ({ ok: false, json: async () => true });
eq(await withMode("open", () => spendAllowCapped("details_pro", 7500)), false, "ledger HTTP failure -> false (fail-closed)");
globalThis.fetch = async () => { throw new Error("net"); };
eq(await withMode("open", () => spendAllowCapped("details_pro", 7500)), false, "ledger network failure -> false (fail-closed)");
globalThis.fetch = async () => ({ ok: true, json: async () => false });
eq(await withMode("open", () => spendAllowCapped("details_pro", 7500)), false, "ledger says no -> false");

// ── Google quota 429s never burn a place's attempts (2026-11-01) ───────────
// The live body from the incident, verbatim prefix.
const DAILY_429 = '{\n  "error": {\n    "code": 429,\n    "message": "Quota exceeded for quota metric \'GetPlaceRequest\' and limit \'GetPlaceRequest per day\' of service \'places.googlea';
eq(classifyDetailsFailure(429, DAILY_429), "quota_daily", "the live per-day 429 is a daily quota, not a retry");
eq(classifyDetailsFailure(429, "Quota exceeded for quota metric 'GetPlaceRequest' and limit 'GetPlaceRequest per minute'"), "rate_limited", "a per-minute 429 is a short backoff");
eq(classifyDetailsFailure(429, ""), "rate_limited", "a bare 429 is a short backoff");
eq(classifyDetailsFailure(404, "NOT_FOUND"), "terminal", "a 404 is still a verdict about the place");
eq(classifyDetailsFailure(400, "INVALID_ARGUMENT"), "terminal", "a 400 is still terminal");
eq(classifyDetailsFailure(503, "UNAVAILABLE"), "transient", "a 5xx is still a retry");
// 17:25 UTC on 2026-11-01 is 09:25 PST (DST ended that morning): 14h35m to midnight PT, +10m buffer.
eq(minutesUntilQuotaReset(Date.parse("2026-11-01T17:25:00Z")), 14 * 60 + 35 + 10, "parks until midnight Pacific plus buffer (PST)");
// 2026-07-01 12:00 UTC = 05:00 PDT -> 19h to midnight, +10.
eq(minutesUntilQuotaReset(Date.parse("2026-07-01T12:00:00Z")), 19 * 60 + 10, "DST-aware (PDT)");
// 07:59 UTC Nov 2 = 23:59 PST -> 1m + 10.
eq(minutesUntilQuotaReset(Date.parse("2026-11-02T07:59:00Z")), 11, "just before reset still waits for it");
ok(minutesUntilQuotaReset(Date.parse("2026-11-02T08:00:30Z")) <= 1440, "never exceeds the release function's 1440m clamp");
eq(minutesUntilQuotaReset(NaN), 60, "a bad clock falls back to an hour, never 0 or unbounded");

// The cron must route a quota 429 to wf_promotion_release (attempt refunded),
// never to wf_promotion_complete(p_ok:false) (attempt kept -> max attempts reject).
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/api/cron/promote-index/route.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(/classifyDetailsFailure\(\s*r\.status/.test(src), "details() classifies the Google failure before retrying");
  ok(/if \(d\.quota\)\s*\{[^}]*quotaReleased\.push\(item\.place_id\)/.test(src), "a quota answer parks the place in quotaReleased");
  ok(/for \(const id of quotaReleased\) settle\.push\(rpc\(s, "wf_promotion_release"/.test(src), "quota-parked places settle through wf_promotion_release (refund)");
  ok(!/quotaReleased[\s\S]{0,80}wf_promotion_complete/.test(src), "quota-parked places never settle through wf_promotion_complete");
}

console.log(`test-promote-details: OK (${pass} checks)`);
