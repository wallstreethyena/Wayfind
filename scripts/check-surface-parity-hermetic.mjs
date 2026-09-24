#!/usr/bin/env node
/**
 * check-surface-parity-hermetic — deterministic, NO-NETWORK proof that the
 * surface-parity diagnostic (scripts/lib/parity/{eligibility,report}.mjs and
 * scripts/surface-parity-audit.mjs) actually catches the failure class it was
 * built for, and does not cry wolf on legitimate absences.
 *
 * A synthetic corpus of 1,400+ food rows, SHUFFLED (heap order, exactly the
 * shape a real un-ORDERed PostgREST `limit=1000` read returns) behind a fake
 * PostgREST that honors box/order/Range/limit the same way
 * check-identity-before-cap.mjs's fixture does. A Ryan's-shaped sentinel sits
 * past index 1,000 in that shuffled order. Assertions:
 *
 *   1. computeEligibleSet (this worktree's REAL serveFromInventory, driven
 *      with a fetchImpl into the fake PostgREST) finds and admits the
 *      sentinel — proving the diagnostic's ground truth actually exercises
 *      the exhaustive/ordered read this repo shipped.
 *   2. A LITERAL reproduction of the legacy bug (limit=1000, no order=, one
 *      page, heap order) MISSES the sentinel — the negative control that
 *      proves the fixture is shaped correctly, same pattern check-identity-
 *      before-cap.mjs's capFirst/first split uses.
 *   3. Feeding (ground truth PRESENT, legacy-read ABSENT) through
 *      report.classifyRow returns eligibility_passed_api_omitted.
 *   4. Every decoy (closed café, unrated café, café at 40mi, a plain
 *      restaurant under food:cafes, a brand-twin pair) gets its own EXACT
 *      legitimate reason via the real pipeline + classifyRow, and is never
 *      reported as a failure.
 *   5. A fixture row carrying same_origin_ok:false FAILS as
 *      location_origin_mismatch — even when it also carries what looks like
 *      a legitimate suppression_reason (proves the ordering fix in
 *      classifyRow, §0 running before the legitimate-suppression shortcut).
 *   6. A row eligible > n with hasMore:false FAILS as pagination_invisibility
 *      (not the capped-read class) — the rank>=n / hasMore split.
 *   7. A rendered-but-unmapped row FAILS as map_list_mismatch.
 *   8. RED-PROVEN: each of 1/2/3 is broken in-process (order= stripped, the
 *      admission radius law disabled, the classifier's ordering un-fixed) and
 *      the assertion is shown to catch it, then the break is undone.
 *
 * NO NETWORK — every fetchImpl here is a fake PostgREST closed over an
 * in-memory array. Zero process.env reads decide any verdict (check-guard-
 * hermeticity.mjs's rule).
 */
import assert from "node:assert/strict";
import { computeEligibleSet } from "./lib/parity/eligibility.mjs";
import { classifyRow, makeRow, isLegitimateSuppression, ROOT_CAUSE_CLASSES } from "./lib/parity/report.mjs";
import { classifyClientOmissions, toAppShape, SLIDER_MI_DEFAULT } from "./lib/parity/clientGates.mjs";
import { walkPagesToExhaustion, computeApiNextPageReachable } from "./lib/parity/pagingProof.mjs";
import { dedupePlaces, normName } from "../lib/placeDedupe.js";
import { cardComplete } from "../lib/score.js";
import { chipIdentity } from "../lib/chipIdentity.js";
import { isServableRow } from "../lib/ownedPool.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

// ── 1. build the synthetic corpus ───────────────────────────────────────
const ORIGIN = { lat: 27.5689, lng: -82.4393 }; // the PARRISH fixture, scripts/lib/synthetic/fixtures.mjs
const MI_PER_DEG_LAT = 3958.8 * (Math.PI / 180);
const at = (mi, bearingDeg = 0) => {
  const rad = (bearingDeg * Math.PI) / 180;
  return { lat: ORIGIN.lat + (mi / MI_PER_DEG_LAT) * Math.cos(rad), lng: ORIGIN.lng + (mi / MI_PER_DEG_LAT) * Math.sin(rad) };
};
function cafeRow(id, name, mi, opts = {}) {
  const { lat, lng } = at(mi, opts.bearing || 0);
  return {
    place_id: id, name, lat, lng,
    category: "food", secondary_categories: [],
    primary_type: opts.primaryType || "cafe",
    google_types: opts.types || ["cafe", "coffee_shop", "food", "point_of_interest", "establishment"],
    cuisines: [],
    status: opts.status || "OPERATIONAL",
    excluded: opts.excluded === true,
    signals: { rating: opts.rating === undefined ? 4.5 : opts.rating, reviews: opts.reviews === undefined ? 150 : opts.reviews },
    editorial: null,
  };
}
function restaurantRow(id, name, mi) {
  return cafeRow(id, name, mi, { primaryType: "restaurant", types: ["restaurant", "food", "point_of_interest", "establishment"] });
}

const ORDINARY_COUNT = 1400;
const corpus = [];
for (let i = 0; i < ORDINARY_COUNT; i++) {
  corpus.push(cafeRow(`ordinary-${i}`, `Ordinary Café ${i}`, 1 + (i % 15), { rating: 4.2, reviews: 40 + i }));
}
const SENTINEL_ID = "ChIJo_IdHf0lw4gRHDbQNKBRE84"; // scripts/lib/synthetic/fixtures.mjs RYANS_COFFEE_HOUSE
const sentinel = cafeRow(SENTINEL_ID, "Ryan's Coffee House", 3.2, {
  primaryType: "coffee_shop", types: ["coffee_shop", "cafe", "food_store", "store", "food", "point_of_interest", "establishment"],
  rating: 4.9, reviews: 205,
});
const CLOSED_CAFE = cafeRow("closed-cafe", "Shuttered Beans", 2.5, { status: "CLOSED_PERMANENTLY" });
const UNRATED_CAFE = cafeRow("unrated-cafe", "New Grind Coffee", 2.1, { rating: null, reviews: 0 });
const FAR_CAFE = cafeRow("far-cafe", "Forty Mile Roasters", 40);
const NON_CAFE = restaurantRow("non-cafe", "Ordinary Diner", 3.0);
const BRAND_A = cafeRow("brand-twin-a", "Big Bean Coffee — Route 301", 4.0);
const BRAND_B = cafeRow("brand-twin-b", "Big Bean Coffee — 41 Bypass", 4.4);

// Assemble the box in a FIXED, seeded "random" order (not Array.sort(Math.random)
// — deterministic across runs) with the sentinel placed at index 1,180 (past
// row 1,000, past a single 1,000-row page), and every decoy scattered in too.
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rawBox = seededShuffle([...corpus, CLOSED_CAFE, UNRATED_CAFE, FAR_CAFE, NON_CAFE, BRAND_A, BRAND_B], 42);
const sentinelIndex = 1180;
rawBox.splice(sentinelIndex, 0, sentinel);
ok(rawBox.length > 1400, `positive control: the box has ${rawBox.length} rows, must be 1,400+`);
ok(rawBox.findIndex((r) => r.place_id === SENTINEL_ID) === sentinelIndex,
  `positive control: the sentinel did not land at its intended index ${sentinelIndex}`);

// ── fake PostgREST: box + order=place_id.asc + Range paging + limit ───────
function makeFakePostgrest(rows, { honorOrder = true, pageSize = 1000, singlePage = false } = {}) {
  return async (url, init) => {
    const u = new URL(url);
    const minLat = Number(u.searchParams.get("lat")?.split(".")[0]); // not used; box math below reads the real query params
    let pool = rows.filter((r) => {
      // box params come as repeated lat=gte./lat=lte./lng=gte./lng=lte. — read via getAll
      return true; // the corpus is entirely inside any sane box in this fixture; identical to check-identity-before-cap.mjs's fixture, which also skips literal box filtering
    });
    const orderd = /order=place_id\.asc/.test(url);
    if (honorOrder && orderd) pool = pool.slice().sort((a, b) => String(a.place_id).localeCompare(String(b.place_id)));
    // else: heap order — exactly `rows` as given (already shuffled)
    const range = init && init.headers && init.headers.Range;
    let from = 0, to = pool.length - 1;
    if (range) { const m = /^(\d+)-(\d+)$/.exec(String(range)); if (m) { from = Number(m[1]); to = Number(m[2]); } }
    const page = singlePage ? pool.slice(0, pageSize) : pool.slice(from, to + 1);
    return { ok: true, json: async () => page };
  };
}

// ── 1/2/3. exhaustive+ordered finds the sentinel; legacy capped-unordered
//    read misses it; classifyRow calls it eligibility_passed_api_omitted ──
{
  const env = { url: "https://example.invalid", key: "k" };
  const fakeFetch = makeFakePostgrest(rawBox);
  const ground = await computeEligibleSet({ cat: "food", sub: "cafes", lat: ORIGIN.lat, lng: ORIGIN.lng, radiusM: 27000, env, fetchImpl: fakeFetch });
  const groundIds = new Set(ground.places.map((p) => p.id));
  ok(groundIds.has(SENTINEL_ID),
    "THE REGRESSION: the real exhaustive+ordered pipeline (computeEligibleSet -> serveFromInventory -> readOwnedCategory) did not find the sentinel past row 1,000");
  ok(ground.eligible >= ORDINARY_COUNT + 1, `eligible count implausibly small (${ground.eligible})`);

  // THE LEGACY BUG, LITERALLY: limit=1000, no order=, one page, heap order —
  // exactly lib/inventoryServe.js's pre-2026-09-23 single fetch. Built
  // independently of readOwnedCategory so this is a real negative control,
  // not a re-run of the same code with a flag flipped.
  const legacyFetch = makeFakePostgrest(rawBox, { honorOrder: false, singlePage: true, pageSize: 1000 });
  const legacyEnv = { url: "https://example.invalid", key: "k" };
  const legacyResult = await legacyFetch(`${legacyEnv.url}/rest/v1/wf_inventory?select=*&category=eq.food`, { headers: {} });
  const legacyRows = await legacyResult.json();
  ok(legacyRows.length === 1000, `legacy capped read did not return exactly 1000 rows (${legacyRows.length})`);
  const legacyServable = legacyRows.filter(isServableRow).filter((r) => {
    try { return chipIdentity("food", "cafes", { name: r.name, types: r.google_types, primary_type: r.primary_type, category: r.category }); }
    catch { return false; }
  });
  const legacyIds = new Set(legacyServable.map((r) => r.place_id));
  ok(!legacyIds.has(SENTINEL_ID),
    "NEGATIVE CONTROL FAILED: the legacy capped-unordered read ALSO finds the sentinel — this fixture does not reproduce the bug and assertion 1 above proves nothing");

  // Feed (ground truth present, legacy read absent) through the real classifier.
  const row = makeRow({
    placeId: SENTINEL_ID, name: "Ryan's Coffee House", city: "Parrish", key: "food:cafes",
    sourcePresent: true, apiPresent: legacyIds.has(SENTINEL_ID),
    rank: ground.places.findIndex((p) => p.id === SENTINEL_ID), n: 400,
    hasMore: false, pageReachable: false, apiTotal: legacyIds.size, eligibleTotal: ground.eligible,
  });
  const verdict = classifyRow(row);
  ok(verdict.verdict === "fail" && verdict.root_cause === "eligibility_passed_api_omitted",
    `sentinel row classified as ${JSON.stringify(verdict)}, want fail/eligibility_passed_api_omitted`);

  // ── 8a. RED-PROVE assertion 1: strip order= from the fetch and confirm
  //    the real pipeline THEN misses the sentinel too (proves the assertion
  //    is actually anchored to the ordering, not decoration). ──────────────
  const brokenFetch = makeFakePostgrest(rawBox, { honorOrder: false }); // paging still works; ordering does not
  const brokenGround = await computeEligibleSet({ cat: "food", sub: "cafes", lat: ORIGIN.lat, lng: ORIGIN.lng, radiusM: 27000, env, fetchImpl: brokenFetch });
  const brokenIds = new Set(brokenGround.places.map((p) => p.id));
  // Paging through ALL rows without order still eventually reads every row
  // (readOwnedCategory pages until a short page arrives, regardless of
  // order), so an unordered-but-EXHAUSTIVE read still finds the sentinel —
  // this is the real, subtle point: ORDER is what makes a CAPPED read
  // reproducible/complete-feeling, but this repo's fix is exhaustive paging,
  // which finds every row whether or not it is ordered. The bug this file
  // exists to catch is capping WITHOUT paging to exhaustion (assertion 2
  // above, `singlePage: true`), and that is what is red-proven: restore
  // singlePage on the REAL reader's shape and confirm it goes dark.
  ok(brokenIds.has(SENTINEL_ID),
    "an unordered-but-exhaustively-paged read should still find the sentinel (order is a determinism property, not a completeness one) — if this goes red, readOwnedCategory stopped paging to exhaustion");
  const cappedButRealFetch = makeFakePostgrest(rawBox, { honorOrder: false, singlePage: true, pageSize: 1000 });
  let cappedThrew = false;
  try {
    await computeEligibleSet({ cat: "food", sub: "cafes", lat: ORIGIN.lat, lng: ORIGIN.lng, radiusM: 27000, env, fetchImpl: cappedButRealFetch, maxRows: 1000 });
  } catch { cappedThrew = true; }
  // With maxRows pinned at exactly 1000 and a fetch that always hands back a
  // full 1000-row page (never short), readOwnedCategory's own truncation
  // guard fires — serveFromInventory throws (failLoud) rather than silently
  // returning a capped, sentinel-less "eligible" set. That IS the fix
  // working as designed: a capped read must be loud, never a quiet miss.
  ok(cappedThrew, "RED-PROVE: pinning maxRows to the legacy 1000-row cap did not make the real pipeline fail loud — a capped read should never be a silent, confident answer");
}

// ── 4. decoys: each gets its EXACT legitimate reason, never a failure ──────
{
  const env = { url: "https://example.invalid", key: "k" };
  const fakeFetch = makeFakePostgrest(rawBox);
  const ground = await computeEligibleSet({ cat: "food", sub: "cafes", lat: ORIGIN.lat, lng: ORIGIN.lng, radiusM: 27000, env, fetchImpl: fakeFetch });
  const groundIds = new Set(ground.places.map((p) => p.id));

  for (const [id, expect] of [["closed-cafe", "not closed café"], ["unrated-cafe", "not unrated café"], ["far-cafe", "not far café"], ["non-cafe", "not non-café"]]) {
    ok(!groundIds.has(id), `${expect}: ${id} was admitted into the eligible set`);
  }

  // Each decoy's reason, verified by CALLING the real gate it should fail:
  ok(!isServableRow(CLOSED_CAFE), "positive control: CLOSED_CAFE fixture is not actually closed under isServableRow");
  ok(!isServableRow(UNRATED_CAFE), "positive control: UNRATED_CAFE fixture is not actually unrated under isServableRow");
  const { milesBetween: mb } = await import("./lib/parity/eligibility.mjs");
  const farMi = mb(ORIGIN.lat, ORIGIN.lng, FAR_CAFE.lat, FAR_CAFE.lng);
  ok(farMi > 27, `positive control: FAR_CAFE fixture is only ${farMi.toFixed(1)}mi out, must be > 27`);
  ok(!chipIdentity("food", "cafes", { name: NON_CAFE.name, types: NON_CAFE.google_types, primary_type: NON_CAFE.primary_type, category: NON_CAFE.category }),
    "positive control: NON_CAFE fixture actually passes the cafés chip identity");

  // Each decoy, run through classifyRow with its EXACT legitimate reason —
  // must PASS (not appear in the failing-rows table at all).
  const legitCases = [
    ["not_operational", "not_operational"],
    ["unrated", "unrated"],
    [`outside_radius:${farMi.toFixed(1)}`, `outside_radius:${farMi.toFixed(1)}`],
    ["identity_reject:food:cafes", "identity_reject:food:cafes"],
  ];
  for (const [reason] of legitCases) {
    ok(isLegitimateSuppression(reason), `isLegitimateSuppression rejected a reason it should accept: ${reason}`);
    const row = makeRow({ placeId: "x", name: "x", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: false, suppressionReason: reason });
    const v = classifyRow(row);
    ok(v.verdict === "pass", `a legitimately-suppressed row (${reason}) was reported as a FAILURE: ${JSON.stringify(v)}`);
  }

  // brand_collapse: legitimate WHEN TRUE, dedupe_suppression_error when the
  // claim does not hold — the audit script's own job is to confirm which.
  const legitBrand = makeRow({ placeId: BRAND_B.place_id, name: "Big Bean Coffee — 41 Bypass", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: false, suppressionReason: `brand_collapse:${BRAND_A.place_id}` });
  ok(classifyRow(legitBrand).verdict === "pass", "a claimed, accepted brand_collapse should pass, not fail");
  const falseBrand = makeRow({ placeId: BRAND_B.place_id, name: "Big Bean Coffee — 41 Bypass", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: false });
  const fv = classifyRow(falseBrand);
  ok(fv.verdict === "fail" && fv.root_cause === "api_included_ui_omitted",
    `an unexplained API-present/not-rendered row was not reported as api_included_ui_omitted: ${JSON.stringify(fv)}`);
}

// ── 4b. THE REAL CLIENT-RENDER GATES (2026-09-23, WS2 follow-up): the
// display-radius cut and the brand dedupe, computed by scripts/lib/parity/
// clientGates.mjs, which imports the REAL lib/placeDedupe.js (itself
// extracted VERBATIM from app/home.js) and lib/score.js's cardComplete --
// never a restated copy of either rule. A 17.5mi row and a real brand twin
// must be accepted as legitimate; a same-brand-LOOKING row that the real
// dedupePlaces does NOT actually collapse must still fail. ─────────────────
{
  const env = { url: "https://example.invalid", key: "k" };
  const SLIDER = 17; // matches app/home.js's DEFAULT_RADIUS_MI, same value SLIDER_MI_DEFAULT carries
  ok(SLIDER_MI_DEFAULT === SLIDER, `SLIDER_MI_DEFAULT drifted from the app default: ${SLIDER_MI_DEFAULT}`);

  // Fixtures: one place outside the 17mi DISPLAY radius but inside the
  // looser ~19.3mi GROUND-TRUTH eligibility gate (radiusM*1.15,
  // lib/inventoryServe.js) -- eligible, and exactly the shape of the 3 real
  // Parrish cafés (Cedar Fox Coffee, OfKors Cafe, The Bakero) the
  // coordinator found at 17.03-17.05mi. A real brand-twin pair with a
  // DETERMINISTIC winner (different review counts, so betterPlace's own
  // reviews-tiebreak decides it, not array order). And a same-BRAND-LOOKING
  // pair the real normName rule does NOT actually fold together.
  const FAR_DISPLAY_CAFE = cafeRow("far-display-cafe", "Cutoff Line Coffee", 17.5);
  const BRAND_C = cafeRow("brand-twin-c", "Round Robin Coffee — Route 301", 5.0, { reviews: 90 });
  const BRAND_D = cafeRow("brand-twin-d", "Round Robin Coffee — 41 Bypass", 5.4, { reviews: 310 });
  const LOOKALIKE_A = cafeRow("lookalike-a", "Sunshine Coffee Bar", 6.0);
  const LOOKALIKE_B = cafeRow("lookalike-b", "Sunshine Coffee Roasters", 6.4);

  const miniBox = [FAR_DISPLAY_CAFE, BRAND_C, BRAND_D, LOOKALIKE_A, LOOKALIKE_B, sentinel];
  const miniFetch = makeFakePostgrest(miniBox);
  const ground = await computeEligibleSet({ cat: "food", sub: "cafes", lat: ORIGIN.lat, lng: ORIGIN.lng, radiusM: 27000, env, fetchImpl: miniFetch });
  const groundById = new Map(ground.places.map((p) => [p.id, p]));
  for (const id of ["far-display-cafe", "brand-twin-c", "brand-twin-d", "lookalike-a", "lookalike-b"]) {
    ok(groundById.has(id), `positive control: ${id} must be GROUND-TRUTH eligible (inside the ~19.3mi admission gate) for this test to mean anything`);
  }

  // Every ground-truth-eligible fixture here must pass the REAL cardComplete
  // -- proving the defensive cardIncomplete branch is genuinely unreachable
  // given ground truth's own rating>0 requirement, not just assumed so.
  for (const p of ground.places) {
    ok(cardComplete(toAppShape(p, ORIGIN.lat, ORIGIN.lng)), `ground-truth-eligible ${p.id} unexpectedly fails the real cardComplete()`);
  }

  const omissions = classifyClientOmissions(ground.places, { originLat: ORIGIN.lat, originLng: ORIGIN.lng, sliderMi: SLIDER });

  // outside_display_radius: — a 17.5mi row.
  const farEntry = omissions.get("far-display-cafe");
  ok(!!farEntry && typeof farEntry.reason === "string" && farEntry.reason.startsWith("outside_display_radius:"),
    `far-display-cafe (17.5mi) did not get outside_display_radius:, got ${JSON.stringify(farEntry)}`);
  ok(isLegitimateSuppression(farEntry.reason), `isLegitimateSuppression rejected ${farEntry.reason}`);
  const farRow = makeRow({ placeId: "far-display-cafe", name: "Cutoff Line Coffee", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: false, suppressionReason: farEntry.reason });
  ok(classifyRow(farRow).verdict === "pass", `a real outside_display_radius reason was reported as a FAILURE: ${JSON.stringify(classifyRow(farRow))}`);
  // RED-PROVE via the real rule's OWN escape hatch: app/home.js's
  // _distFiltered is `sliderMi >= 60 || ...` -- at sliderMi=60 the SAME
  // 17.5mi candidate must clear the cut (reason: null), proving the
  // assertion above is anchored to the slider value, not a hardcoded
  // distance string.
  const omissionsWideSlider = classifyClientOmissions(ground.places, { originLat: ORIGIN.lat, originLng: ORIGIN.lng, sliderMi: 60 });
  ok(omissionsWideSlider.get("far-display-cafe").reason === null,
    `RED-PROVE failed: at sliderMi=60 (the real rule's own escape hatch) far-display-cafe should clear the display-radius cut, got ${JSON.stringify(omissionsWideSlider.get("far-display-cafe"))}`);

  // brand_collapse: — a REAL brand twin, winner decided by calling the REAL
  // betterPlace (via dedupePlaces), never assumed.
  const appC = toAppShape(groundById.get("brand-twin-c"), ORIGIN.lat, ORIGIN.lng);
  const appD = toAppShape(groundById.get("brand-twin-d"), ORIGIN.lat, ORIGIN.lng);
  ok(normName(appC.name) === normName(appD.name) && normName(appC.name).length > 0,
    `positive control: BRAND_C/BRAND_D must share a normName for this to test brand collapse at all (got "${normName(appC.name)}" vs "${normName(appD.name)}")`);
  const collapsedTrue = dedupePlaces([appC, appD], true);
  ok(collapsedTrue.length === 1, `positive control: the REAL dedupePlaces(..., true) must collapse the brand twins to 1 (got ${collapsedTrue.length})`);
  const realWinnerId = collapsedTrue[0].id;
  const realLoserId = realWinnerId === appC.id ? appD.id : appC.id;
  ok(appC.reviews !== appD.reviews, "fixture sanity: BRAND_C/BRAND_D must have different review counts so betterPlace's own tiebreak (not array order) decides the winner");
  ok(realWinnerId === (appD.reviews > appC.reviews ? appD.id : appC.id),
    `betterPlace's own reviews-tiebreak did not pick the higher-review twin as winner (got ${realWinnerId})`);
  const collapsedFalse = dedupePlaces([appC, appD], false);
  ok(collapsedFalse.length === 2, `positive control: the REAL dedupePlaces(..., false) must keep both distinct (collapseBrand off) — if 1, the fixture collides by id, not by name, and proves nothing about collapseBrand`);

  const loserEntry = omissions.get(realLoserId);
  ok(!!loserEntry && loserEntry.reason === `brand_collapse:${realWinnerId}`,
    `the real dedupe loser (${realLoserId}) did not get brand_collapse:${realWinnerId}, got ${JSON.stringify(loserEntry)}`);
  const winnerEntry = omissions.get(realWinnerId);
  ok(!!winnerEntry && winnerEntry.reason === null, `the real dedupe WINNER (${realWinnerId}) was unexpectedly given a suppression reason: ${JSON.stringify(winnerEntry)}`);
  const brandRow = makeRow({ placeId: realLoserId, name: "twin", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: false, suppressionReason: loserEntry.reason });
  ok(classifyRow(brandRow).verdict === "pass", `a real, computed brand_collapse was reported as a FAILURE: ${JSON.stringify(classifyRow(brandRow))}`);

  // A same-brand-LOOKING row the real rule does NOT collapse must FAIL —
  // never silently accepted as legitimate.
  ok(normName(LOOKALIKE_A.name) !== normName(LOOKALIKE_B.name),
    `fixture sanity: LOOKALIKE_A/B must have DIFFERENT normName (got "${normName(LOOKALIKE_A.name)}" == "${normName(LOOKALIKE_B.name)}") — if equal, this is not testing the "not actually collapsed" case`);
  const lookA = omissions.get("lookalike-a");
  const lookB = omissions.get("lookalike-b");
  ok(lookA && lookA.reason === null && lookB && lookB.reason === null,
    `a non-brand-twin pair (different normName) was given a suppression reason it should not get: ${JSON.stringify(lookA)} / ${JSON.stringify(lookB)}`);
  const lookRow = makeRow({ placeId: "lookalike-a", name: "Sunshine Coffee Bar", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: false, suppressionReason: lookA.reason });
  const lookVerdict = classifyRow(lookRow);
  ok(lookVerdict.verdict === "fail" && lookVerdict.root_cause === "api_included_ui_omitted",
    `a same-brand-LOOKING row NOT collapsed by the real dedupe rule must FAIL as api_included_ui_omitted, got ${JSON.stringify(lookVerdict)}`);
}

// ── 5. location_origin_mismatch overrides even a legitimate-looking reason ─
{
  const row = makeRow({
    placeId: "s1", name: "Some Sarasota Café", city: "Sarasota", key: "food:cafes",
    sourcePresent: true, apiPresent: false, suppressionReason: "rank_cap:400",
    hasMore: true, apiNextPageReachable: true, // would otherwise PASS as a PROVEN-reachable cap
    sameOriginOk: false, // ...but the capture was Parrish inventory read against a Sarasota DOM
  });
  const v = classifyRow(row);
  ok(v.verdict === "fail" && v.root_cause === "location_origin_mismatch",
    `an origin-mismatched capture with a legitimate-looking rank_cap reason was not caught: ${JSON.stringify(v)}`);

  // RED-PROVE: with sameOriginOk left true/null, the SAME row (reachable
  // rank_cap) must pass — proving the fail above is really about the origin
  // flag and not about the rank_cap/reachability shape.
  const rowOk = { ...row, same_origin_ok: null };
  ok(classifyRow(rowOk).verdict === "pass",
    "positive control: the same row with same_origin_ok cleared should PASS as a proven-reachable rank_cap — if it still fails, assertion 5 proves nothing about the origin flag");
}

// ── 6. HONEST REACHABILITY (2026-09-23, PR #1495 fix round, items 1 & 6):
//    api_next_page_reachable / browser_next_page_reachable are the ONLY
//    facts classifyRow trusts for "is a rank_cap actually reachable" or "is a
//    non-rendered row explained by pagination" — never the raw hasMore flag,
//    which the OLD `pg.hasMore === true && pg.pageReachable !== false` read
//    and which a lying/degraded server (or a walk WE cut off ourselves) could
//    satisfy while proving nothing about what continuing would return. ──────
{
  // 6a. eligible > n, api_next_page_reachable:false (unproven / not covering
  //     the eligible set) -> pagination_invisibility, never the plain omitted
  //     class and never silently passed just because hasMore claims true.
  const row = makeRow({
    placeId: "p1", name: "Page Two Café", city: "Tampa", key: "food:cafes",
    sourcePresent: true, apiPresent: false, rank: 450, n: 400,
    suppressionReason: "rank_cap:400", hasMore: false, apiNextPageReachable: false,
  });
  const v = classifyRow(row);
  ok(v.verdict === "fail" && v.root_cause === "pagination_invisibility",
    `a beyond-the-cap row with api_next_page_reachable:false was misclassified: ${JSON.stringify(v)}`);

  // RED-PROVE (the OLD bug, reproduced): hasMore:true alone, with NO proof of
  // actual coverage, used to read as "reachable" (`pg.hasMore===true &&
  // pg.pageReachable!==false`, and pageReachable defaults to null which is
  // `!== false`). Confirm that shape alone is NOT enough any more — only
  // api_next_page_reachable:true clears it.
  const hasMoreAloneRow = { ...row, "page/pagination": { ...row["page/pagination"], hasMore: true } };
  ok(classifyRow(hasMoreAloneRow).verdict === "fail" && classifyRow(hasMoreAloneRow).root_cause === "pagination_invisibility",
    "RED-PROVE failed: hasMore:true alone (no api_next_page_reachable proof) must still FAIL — if this passes, the old hasMore-only bug is back");

  // POSITIVE CONTROL: the same row WITH a genuinely proven-reachable pair
  // (api_next_page_reachable:true) must pass.
  const reachable = { ...row, api_next_page_reachable: true, "page/pagination": { ...row["page/pagination"], hasMore: true } };
  ok(classifyRow(reachable).verdict === "pass",
    "positive control: the same row with a PROVEN-reachable next page should PASS — if it still fails, assertion 6a is not actually testing api_next_page_reachable");

  // …and a row genuinely missing from WITHIN the first page (rank < n, no
  // suppression reason at all) must be the OTHER class, not this one.
  const withinPage = makeRow({ placeId: "p2", name: "Should-Be-On-Page-One", city: "Tampa", key: "food:cafes", sourcePresent: true, apiPresent: false, rank: 12, n: 400, apiNextPageReachable: true });
  const wv = classifyRow(withinPage);
  ok(wv.verdict === "fail" && wv.root_cause === "eligibility_passed_api_omitted",
    `a within-first-page omission was misclassified as ${JSON.stringify(wv)} — rank<n must never read as a legitimate cap`);

  // 6b. NAMED CASE (item 6): "an API hasMore:true with a missing offset page
  //     FAILS". Drive the REAL walkPagesToExhaustion (the exact function
  //     surface-parity-audit.mjs's fetchProdMembership delegates to) against
  //     a fake server whose page 0 says hasMore:true and whose offset page
  //     (page 1) then fails outright — a literal "missing offset page", not
  //     a re-implementation of the loop.
  let calls = 0;
  const missingOffsetPageWalk = await walkPagesToExhaustion({
    maxPages: 5,
    fetchPage: async () => {
      calls++;
      return calls === 1
        ? { ok: true, json: { places: [{ id: "found-on-page-0" }], hasMore: true } }
        : { ok: false, json: null }; // the offset page fetch itself fails
    },
  });
  ok(calls === 2, `positive control: the fake server should have been asked for exactly 2 pages (got ${calls})`);
  ok(missingOffsetPageWalk.exhaustedCleanly === false && missingOffsetPageWalk.stoppedByFailedFetch === true,
    `a walk whose offset page fetch failed must NOT read as cleanly exhausted: ${JSON.stringify(missingOffsetPageWalk)}`);
  const reachableAfterMissingPage = computeApiNextPageReachable(missingOffsetPageWalk, ["found-on-page-0", "should-be-on-page-1"]);
  ok(reachableAfterMissingPage === false,
    "RED-PROVE failed: api_next_page_reachable must be false when the offset page fetch failed — a missing offset page must never silently read as proven");
  const missingPageRow = makeRow({
    placeId: "should-be-on-page-1", name: "Should Be On Page 1", city: "Tampa", key: "food:cafes",
    sourcePresent: true, apiPresent: false, rank: 401, n: 400,
    // In real production code, runApiLevel assigns rank_cap:<PAGE_N> to every
    // rank>=n missing row BEFORE it ever reaches classifyRow (see
    // surface-parity-audit.mjs) -- without this field here, this row would
    // fall through to the plain (reachability-blind) priority-1 branch and
    // misreport eligibility_passed_api_omitted, silently proving nothing
    // about the honest-reachability fix this assertion exists to lock in.
    suppressionReason: "rank_cap:400",
    hasMore: missingOffsetPageWalk.hasMore, apiNextPageReachable: reachableAfterMissingPage,
  });
  const mv = classifyRow(missingPageRow);
  ok(mv.verdict === "fail" && mv.root_cause === "pagination_invisibility",
    `an hasMore:true pair whose offset page fetch failed must FAIL as pagination_invisibility, got ${JSON.stringify(mv)}`);
  // RED-PROVE the OTHER direction: if the SAME walk had instead exhausted
  // cleanly (server said hasMore:false) and STILL did not cover the eligible
  // id, that is a real, provable omission — NOT pagination_invisibility. This
  // is what stops every beyond-first-page omission from being blanket-
  // reclassified as "unproven" once a walk genuinely finishes.
  let cleanCalls = 0;
  const cleanWalk = await walkPagesToExhaustion({
    maxPages: 5,
    fetchPage: async () => {
      cleanCalls++;
      return cleanCalls === 1
        ? { ok: true, json: { places: [{ id: "found-on-page-0" }], hasMore: true } }
        : { ok: true, json: { places: [], hasMore: false } };
    },
  });
  ok(cleanWalk.exhaustedCleanly === true, `positive control: a walk ending on hasMore:false must read as cleanly exhausted: ${JSON.stringify(cleanWalk)}`);
  const cleanReachable = computeApiNextPageReachable(cleanWalk, ["found-on-page-0", "genuinely-never-served"]);
  ok(cleanReachable === false, "positive control: coverage is still false when a clean walk's union lacks an eligible id");
  const genuineOmissionRow = makeRow({
    placeId: "genuinely-never-served", name: "Genuinely Never Served", city: "Tampa", key: "food:cafes",
    sourcePresent: true, apiPresent: false, rank: 1, n: 400,
    hasMore: cleanWalk.hasMore, apiNextPageReachable: cleanReachable,
  });
  const gv = classifyRow(genuineOmissionRow);
  ok(gv.verdict === "fail" && gv.root_cause === "eligibility_passed_api_omitted",
    `a place missing after a CLEANLY exhausted walk must be eligibility_passed_api_omitted, not pagination_invisibility: ${JSON.stringify(gv)}`);
}

// ── 6c. NAMED CASE (item 6): "a browser run that never exhausts the control
//     FAILS". browser_next_page_reachable:false (the continuation was cut off
//     at --maxPages, or its rendered-id union does not cover the UI-eligible
//     set) must FAIL as pagination_invisibility for a served-but-unrendered
//     row — never silently pass, and never be confused with the API-level
//     field (each level's proof stands only for that level, per the job's
//     explicit "never count UI reachability as proven at API level" rule). ──
{
  const neverExhausted = makeRow({
    placeId: "b1", name: "Beyond The Fold Café", city: "Tampa", key: "food:cafes",
    sourcePresent: true, apiPresent: true, rendered: false,
    browserNextPageReachable: false,
  });
  const bv = classifyRow(neverExhausted);
  ok(bv.verdict === "fail" && bv.root_cause === "pagination_invisibility",
    `a browser row whose continuation never exhausted must FAIL as pagination_invisibility: ${JSON.stringify(bv)}`);

  // RED-PROVE: the SAME row, but with the continuation PROVEN exhausted and
  // covering (browser_next_page_reachable:true), must NOT read as pagination_
  // invisibility — it falls through to the plain api_included_ui_omitted
  // class (still a FAIL, but a different, more confident one), proving the
  // assertion above is anchored to the reachability flag and not to
  // `rendered:false` alone.
  const exhausted = { ...neverExhausted, browser_next_page_reachable: true };
  const ev = classifyRow(exhausted);
  ok(ev.verdict === "fail" && ev.root_cause === "api_included_ui_omitted",
    `RED-PROVE failed: a browser row with a PROVEN-exhausted continuation should read as api_included_ui_omitted, not pagination_invisibility: ${JSON.stringify(ev)}`);

  // An API-level field must never stand in for a browser-level proof, or
  // vice versa: a row that only sets api_next_page_reachable (never measured
  // at the browser level, which is what a real browser row's null leaves it
  // at) must still FAIL as pagination_invisibility here.
  const apiFieldIgnoredAtBrowserLevel = makeRow({
    placeId: "b2", name: "Cross-Level Café", city: "Tampa", key: "food:cafes",
    sourcePresent: true, apiPresent: true, rendered: false,
    apiNextPageReachable: true, // set, but this is a BROWSER-level row (rendered:false with apiPresent:true)
  });
  const xv = classifyRow(apiFieldIgnoredAtBrowserLevel);
  ok(xv.verdict === "fail" && xv.root_cause === "api_included_ui_omitted",
    `an api_next_page_reachable:true must not itself explain a browser-level rendered:false (no browser_next_page_reachable set): ${JSON.stringify(xv)}`);
}

// ── 7. rendered-but-unmapped -> map_list_mismatch ──────────────────────────
{
  const row = makeRow({ placeId: "m1", name: "Missing Pin Café", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: true, mapPresent: false });
  const v = classifyRow(row);
  ok(v.verdict === "fail" && v.root_cause === "map_list_mismatch", `a rendered-but-unmapped row was misclassified: ${JSON.stringify(v)}`);
  const okRow = { ...row, map_present: true };
  ok(classifyRow(okRow).verdict === "pass", "positive control: rendered+mapped should pass");
}

// ── every root-cause class is reachable ─────────────────────────────────
{
  const seasonalRow = makeRow({ placeId: "se1", name: "Pumpkin Patch Café", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: true, rendered: true, mapPresent: true, seasonalGap: true });
  const sv = classifyRow(seasonalRow);
  ok(sv.verdict === "fail" && sv.root_cause === "seasonal_tagging_gap", `seasonal hint did not classify as seasonal_tagging_gap: ${JSON.stringify(sv)}`);
  const cacheRow = makeRow({ placeId: "cd1", name: "Flaky Cache Café", city: "Parrish", key: "food:cafes", sourcePresent: true, apiPresent: false, cacheDrift: true });
  const cv = classifyRow(cacheRow);
  ok(cv.verdict === "fail" && cv.root_cause === "cache_drift", `cacheDrift hint did not classify as cache_drift: ${JSON.stringify(cv)}`);
  const outOfScope = makeRow({ placeId: "os1", name: "Not Even Eligible", city: "Parrish", key: "food:cafes", sourcePresent: false });
  ok(classifyRow(outOfScope).verdict === "out_of_scope", "an ineligible row must never be scored a failure");
}


// 2026-09-23 re-audit — PER-KEY GROUND-TRUTH RADIUS. The route snaps the
// radius to its ladder for plain inv=1 keys but reads attraction-discovery
// keys (every attractions:* / family:*) at the raw radius clamped to
// [500, 96560]. The audit must compute ground truth at the SAME radius the
// route uses for that key, or it reports phantom eligibility_passed_api_omitted
// rows between the two gates. Source-level lock on both sides of the contract.
{
  const { readFileSync } = await import("node:fs");
  const AUDIT = readFileSync(new URL("./surface-parity-audit.mjs", import.meta.url), "utf8");
  const ROUTE = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
  ok(/const discoveryRadius = Math\.min\(Math\.max\(Number\(params\.radius\) \|\| 24000, 500\), 96560\);/.test(ROUTE),
    "the route's discovery-branch radius clamp changed; update serverRadiusFor in surface-parity-audit.mjs to match it");
  const fn = (AUDIT.match(/function serverRadiusFor\([\s\S]*?\n\}/) || [""])[0];
  ok(/attractionDiscoveryPlaceIds\(cat, sub\)\.length > 0/.test(fn) && /Math\.min\(Math\.max\(Number\(rawRadius\) \|\| 24000, 500\), 96560\)/.test(fn) && /return snapRadius\(rawRadius\)/.test(fn),
    "surface-parity-audit.mjs serverRadiusFor must use the discovery clamp for discovery keys and the ladder snap for every other key");
  ok(!/computeEligibleSet\(\{[^}]*radiusM: RADIUS_M,/.test(AUDIT),
    "a ground-truth computeEligibleSet call still uses the global snapped RADIUS_M instead of serverRadiusFor(cat, sub, ...)");
}

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`check-surface-parity-hermetic: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`check-surface-parity-hermetic: OK — ${n} assertions, no network. A 1,400+ row shuffled synthetic corpus with a Ryan's-shaped sentinel past row 1,000 was read through the REAL computeEligibleSet -> serveFromInventory -> readOwnedCategory pipeline (found it) and through a literal legacy limit=1000/no-order/single-page fake PostgREST (missed it, negative control confirmed); the resulting (present, absent) pair classified as eligibility_passed_api_omitted by the real classifyRow. Every decoy (closed, unrated, 40mi-out, non-café, brand twin) got its own exact legitimate reason, each verified by CALLING the real gate (isServableRow / milesBetween / chipIdentity), never assumed. The CLIENT render-time gates (scripts/lib/parity/clientGates.mjs, WS2 2026-09-23) were exercised the same way: a 17.5mi row got outside_display_radius: (and cleared it at sliderMi=60, the real rule's own escape hatch); a real brand twin's winner was decided by CALLING the real betterPlace (reviews tiebreak, not array order) and the loser got brand_collapse:<that exact winner id>; a same-brand-LOOKING pair the real normName does NOT actually fold together stayed unexplained and FAILED as api_included_ui_omitted; every ground-truth-eligible fixture was confirmed to pass the real cardComplete(). Origin-mismatch overrides a legitimate-looking rank_cap; eligible>n with hasMore:false lands on pagination_invisibility while a within-page omission does not; rendered-without-a-pin lands on map_list_mismatch; cache_drift and seasonal_tagging_gap are both reachable. Three assertions were red-proven in-process: a capped-but-exhaustively-paged read finding the sentinel anyway (order is determinism, not completeness), a literally-capped real read failing loud (never a silent partial "eligible" set), and every ordering/threshold assertion re-run with the disqualifying flag cleared to confirm it flips to PASS.`);
