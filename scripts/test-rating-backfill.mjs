// scripts/test-rating-backfill.mjs - locks the owner-approved paid rating backfill (2026-11-20)
// and the enterprise check keeping the rating it already pays for.
//
// CALL assertions (import + invoke), plus source checks for the route's switches:
//   1. planEnterprise stores Google's rating/reviews; a missing value never blanks one;
//      an out-of-range value is ignored; no score field is ever written.
//   2. ratingBackfillCap is off unless BOTH switches are valid.
//   3. effectiveCap gives the backfill SKU exactly its operator cap in free mode, null in shut,
//      and leaves details_enterprise's free line unchanged.
//   4. selectBackfillTargets keeps only unrated, unlocked, servable rows inside a held town.
//   5. The route is not scheduled, checks gateShut, and grants every call from its own SKU.
import { readFileSync } from "node:fs";

let n = 0;
const fail = (m) => { console.error("test-rating-backfill: FAIL - " + m); process.exit(1); };
const ok = (c, m) => { n++; if (!c) fail(m); };

process.env.WAYFIND_GATE = "free";
const { planEnterprise } = await import("../lib/inventoryGoogleCheck.js");
const gate = await import("../lib/spendGate.js");
const { selectBackfillTargets, HELD_TOWNS, HELD_RADIUS_MI, milesBetween } = await import("../lib/ratingBackfill.js");

// 1. planEnterprise keeps the rating it bought.
const NOW = Date.parse("2026-11-20T12:00:00Z");
const row = { place_id: "pX", locked: false, signals: { price: "$" }, lat: 27.49, lng: -81.44, refreshed_at: "2026-11-01T00:00:00Z" };
const patch = { lat: 27.49, lng: -81.44, refreshed_at: new Date(NOW).toISOString() };
const p1 = planEnterprise(row, { kind: "ok", place: { id: "pX", rating: 4.6, userRatingCount: 212.0 } }, patch, NOW);
ok(p1 && p1.update.signals.rating === 4.6, "enterprise plan dropped Google's rating");
ok(p1.update.signals.reviews === 212, "enterprise plan dropped Google's review count");
ok(p1.update.signals.price === "$", "enterprise plan lost an existing signal");
ok(p1.update.signals.google_check_tier === "enterprise", "enterprise plan lost its tier stamp");
ok(!("score" in p1.update.signals) && !("wayfind_score" in p1.update.signals) && !("score" in p1.update), "enterprise plan wrote a score (the score is computed at read time)");
const rated = { ...row, signals: { rating: 4.1, reviews: 90 } };
const p2 = planEnterprise(rated, { kind: "ok", place: { id: "pX" } }, patch, NOW);
ok(p2.update.signals.rating === 4.1 && p2.update.signals.reviews === 90, "a Google answer without a rating blanked the stored one");
const p3 = planEnterprise(row, { kind: "ok", place: { id: "pX", rating: 7, userRatingCount: -3 } }, patch, NOW);
ok(!("rating" in p3.update.signals) && !("reviews" in p3.update.signals), "an out-of-range rating or count was stored");
const p4 = planEnterprise({ ...row, locked: true }, { kind: "ok", place: { id: "pX", rating: 4.6, userRatingCount: 5 } }, patch, NOW);
ok(!p4 || !p4.update.signals || p4.update.signals.rating === undefined, "a locked row took content");

// 2. Switches.
const capOf = (env) => gate.ratingBackfillCap(env);
ok(capOf({}) === null, "backfill on with no switches");
ok(capOf({ RATING_BACKFILL_PAID: "1" }) === null, "backfill on without a cap");
ok(capOf({ RATING_BACKFILL_MONTH_CAP: "450" }) === null, "backfill on without the enable");
for (const bad of ["0", "01", "1.5", "-4", "abc", " "]) ok(capOf({ RATING_BACKFILL_PAID: "1", RATING_BACKFILL_MONTH_CAP: bad }) === null, "cap accepted " + JSON.stringify(bad));
ok(capOf({ RATING_BACKFILL_PAID: "on", RATING_BACKFILL_MONTH_CAP: "450" }) === null, "enable accepted a value other than 1");
ok(capOf({ RATING_BACKFILL_PAID: "1", RATING_BACKFILL_MONTH_CAP: "450" }) === 450, "valid switches did not give the cap");

// 3. Ledger ceilings.
ok(gate.RATING_BACKFILL_SKU === "details_enterprise_backfill", "backfill SKU renamed");
ok(gate.effectiveCap(gate.RATING_BACKFILL_SKU, 450) === 450, "free mode did not honour the backfill's explicit cap");
ok(gate.effectiveCap("details_enterprise", 5000) === 950, "details_enterprise free line moved");
process.env.WAYFIND_GATE = "shut";
ok(gate.effectiveCap(gate.RATING_BACKFILL_SKU, 450) === null, "shut still grants the backfill");
process.env.WAYFIND_GATE = "free";

// 4. Target selection.
const sebring = HELD_TOWNS.find((t) => t.slug === "sebring");
ok(HELD_TOWNS.length === 5 && sebring && HELD_RADIUS_MI === 19.55, "held towns or radius changed");
const base = { lat: sebring.lat + 0.05, lng: sebring.lng, status: "OPERATIONAL", signals: {} };
const rows = [
  { ...base, place_id: "keep-att", category: "attractions" },
  { ...base, place_id: "keep-food", category: "food" },
  { ...base, place_id: "keep-food", category: "food" },
  { ...base, place_id: "rated", category: "food", signals: { rating: 4.2, reviews: 30 } },
  { ...base, place_id: "locked", category: "food", locked: true },
  { ...base, place_id: "closed", category: "food", status: "CLOSED_PERMANENTLY" },
  { ...base, place_id: "excluded", category: "food", excluded: true },
  { ...base, place_id: "far", category: "food", lat: sebring.lat + 0.5 },
  { ...base, place_id: "nocoord", category: "food", lat: null },
];
ok(milesBetween(sebring.lat, sebring.lng, sebring.lat + 0.5, sebring.lng) > HELD_RADIUS_MI, "test fixture 'far' is not outside the radius");
const picked = selectBackfillTargets(rows).map((r) => r.place_id);
ok(JSON.stringify(picked) === JSON.stringify(["keep-food", "keep-att"]), "target selection wrong: " + JSON.stringify(picked));

// 5. Route switches.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = strip(readFileSync("app/api/cron/rating-backfill/route.js", "utf8"));
ok(/gateShut\(\)/.test(route), "route never checks gateShut()");
ok(/ratingBackfillCap\(\)/.test(route) && /cap == null/.test(route), "route does not stop when the switches are off");
ok(/spendAllowCapped\(RATING_BACKFILL_SKU,\s*cap\)/.test(route), "route does not grant each call from its own SKU");
ok(/refundToLedger\(RATING_BACKFILL_SKU/.test(route), "route does not refund unbilled calls");
ok(/planEnterprise\(/.test(route), "route does not write through the refresh's enterprise plan");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
ok(Array.isArray(vercel.crons) && vercel.crons.length > 0, "vercel.json crons unreadable");
ok(!vercel.crons.some((c) => /rating-backfill/.test(c.path)), "the paid backfill was scheduled (it must stay operator-run)");

console.log(`test-rating-backfill: OK - ${n} assertions (enterprise plan keeps rating/reviews, switches fail closed, own ledger SKU, held-town targets, route unscheduled)`);
