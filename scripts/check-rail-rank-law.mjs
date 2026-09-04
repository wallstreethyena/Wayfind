#!/usr/bin/env node
// scripts/check-rail-rank-law.mjs — THE guard that ends the ring-before-score
// class, not just the two instances of it that were reported.
//
// THE OWNER'S COMPLAINT (2026-09-03, third time asking), Night Out → Clubs &
// Dancing near Parrish:
//
//   1. Joyland  8.5/10  16.8 mi
//   2. La Jaula 7.7/10  14.9 mi
//   3. Enigma   9.0/10  18 mi
//
// A 9.0 sat below a 7.7 because lib/nightOutIntent.js (and, identically,
// lib/fallIntentRails.js) sorted by a DISTANCE RING before the score.
// scripts/test-rail-score-order.mjs already existed for this exact complaint
// but targeted only lib/experiencesData.js's rankExperiences() — it asserted
// nothing about any poster-rail composer and was scoped BY NAME, so it could
// never catch a sibling bug in a different file, let alone one written after
// it shipped. This guard is built to not repeat that mistake:
//
//   1. it ENUMERATES rail composers from the filesystem — glob, not a
//      hand-written list — so a new lib/xyzRails.js with a `composeXyzRails`
//      export FAILS the build the moment it lands without a fixture here,
//      instead of shipping unguarded like every composer written since
//      2026-08-05 did;
//   2. for every covered composer it runs the OWNER'S REAL NUMBERS through
//      the REAL composer function (assert on the call, not the string) and
//      checks the emitted order, not the source text;
//   3. it bans the SHAPE (a distance/ring/boost term evaluated ahead of the
//      score term) by red-proving: reinserting the exact ring this incident
//      shipped into a scratch copy of the fixed file and asserting this
//      guard's own fixture check goes red against it — proving the mutation
//      actually applied and that the check can detect the bug class, not
//      merely today's two instances of it.
//
// THE LAW (lib/railRank.js, RAIL_RANK_LAW): Wayfind Score DESC, reviews DESC,
// distance ASC, place_id ASC — distance is a tie-break only, never a
// pre-empting term.

import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { railScoreOf, RAIL_RANK_LAW } from "../lib/railRank.js";

let pass = 0;
const failures = [];
const ok = (condition, message) => { if (condition) pass += 1; else failures.push(message); };

console.log(`check-rail-rank-law: THE LAW — ${RAIL_RANK_LAW}`);

/* ------------------------------------------------------------ enumeration */
// glob lib/*Intent*.js, lib/*Rails*.js — the exact patterns named in the work
// order, applied as real filesystem globbing (readdirSync + regex on the
// basename), not a hand-typed file list.
const libDir = new URL("../lib/", import.meta.url);
const libFiles = readdirSync(libDir).filter((name) => name.endsWith(".js") && (/Intent/.test(name) || /Rails/.test(name)));
ok(libFiles.length >= 8, `the lib/*Intent*.js + lib/*Rails*.js glob finds a plausible number of files (got ${libFiles.length}: ${libFiles.join(", ")})`);

// A file matching the glob counts as a composer ONLY for the exported names
// that actually compose a rail — compose*/split*/rank* — never every export
// (an isX predicate, a radius constant or a metadata table matching the
// filename glob is not a ranking-owning composer and must not be forced into
// this guard's coverage map).
const COMPOSER_NAME_RX = /^(compose|split|rank)[A-Za-z0-9]*$/;

const modules = new Map(); // relPath -> imported module namespace
const discovered = []; // { relPath, name }
for (const file of libFiles) {
  const relPath = `lib/${file}`;
  const mod = await import(new URL(file, libDir).href);
  modules.set(relPath, mod);
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === "function" && COMPOSER_NAME_RX.test(name)) discovered.push({ relPath, name });
  }
}
ok(discovered.length >= 8, `the glob discovers a plausible number of composer exports (got ${discovered.length}: ${discovered.map((d) => `${d.relPath}:${d.name}`).join(", ")})`);

// THE COVERAGE MAP. Every composer below has a hand-built fixture further
// down this file. A composer this loop finds that is NOT in this set FAILS
// the build — that is what makes the next new rail arrive guarded instead of
// silently unguarded, which is exactly the hole that let nightOut and fall
// ship broken while test-rail-score-order stayed green the whole time.
const COVERED = new Set([
  "lib/nightOutIntent.js:composeNightOutRails",
  "lib/fallIntentRails.js:composeFallIntentRails",
  "lib/dateNightIntent.js:composeDateNightRails",
  "lib/birthdayIntent.js:composeBirthdayRails",
  "lib/todayDiscoveryRails.js:composeTodayDiscoveryRails",
  "lib/lunchBreakRails.js:composeLunchBreakRails",
  "lib/worthEatingRails.js:composeWorthEatingRails",
  "lib/breakfastRails.js:splitBreakfastRails",
]);

const uncovered = discovered.filter((d) => !COVERED.has(`${d.relPath}:${d.name}`));
ok(uncovered.length === 0, uncovered.length
  ? `every rail composer found on the filesystem must have a fixture in this guard — UNCOVERED: ${uncovered.map((d) => `${d.relPath}:${d.name}`).join(", ")}`
  : "every enumerated composer is covered");
// Positive control on the enumeration itself: a composer NOT actually a rail
// ranker (isKnownIntent, intentRadiusMi — lib/momentIntents.js) must not
// spuriously appear in `discovered`, or this guard would be forcing coverage
// of things that were never the bug's shape.
ok(!discovered.some((d) => d.relPath === "lib/momentIntents.js"), "lib/momentIntents.js (metadata only, no compose/split/rank export) is correctly excluded from the composer list");

/* ---------------------------------------------------------- shared fixture */
// THE OWNER'S REAL NUMBERS, verbatim from the 2026-09-03 screenshot.
const OWNER_FIXTURE = [
  { id: "joyland", name: "Joyland", wfScore: 85, distMi: 16.8 },
  { id: "la-jaula", name: "La Jaula", wfScore: 77, distMi: 14.9 },
  { id: "enigma", name: "Enigma", wfScore: 90, distMi: 18 },
];
const LEADER = "enigma"; // the 9.0 — must lead every rail it lands in

// Fall's near/far ring sits at 27mi (FALL_NEAR_MI), not Night Out's 17 — the
// owner's raw 16.8/14.9/18mi numbers never cross it, so they cannot exercise
// the ring either way. Same three scores, distances rescaled so Enigma sits
// past the ring and Joyland/La Jaula sit inside it, landing in a rail (farms,
// 45mi radius) wide enough to admit all three past that ring boundary.
const FALL_FIXTURE = [
  { id: "joyland", name: "Joyland", wfScore: 85, distMi: 26.8, fallRail: "farms" },
  { id: "la-jaula", name: "La Jaula", wfScore: 77, distMi: 24.9, fallRail: "farms" },
  { id: "enigma", name: "Enigma", wfScore: 90, distMi: 28, fallRail: "farms" },
];

function railsArrayOf(result) {
  return Array.isArray(result) ? result : (result && Array.isArray(result.rails) ? result.rails : []);
}
function cardsOf(rail) {
  return Array.isArray(rail?.cards) ? rail.cards : Array.isArray(rail?.places) ? rail.places : [];
}
function assertLeads(label, orderedIds) {
  ok(orderedIds[0] === LEADER, `${label}: the 9.0 fixture ("${LEADER}") leads regardless of ring (got order ${orderedIds.join("|")})`);
}
function assertMonotonic(label, result) {
  for (const rail of railsArrayOf(result)) {
    const rows = cardsOf(rail);
    for (let i = 1; i < rows.length; i += 1) {
      const prev = railScoreOf(rows[i - 1]);
      const cur = railScoreOf(rows[i]);
      const prevVal = prev == null ? -Infinity : prev;
      const curVal = cur == null ? -Infinity : cur;
      ok(prevVal >= curVal, `${label}: rail "${rail.id}" is score-monotonic-non-increasing at position ${i} (${prev} then ${cur})`);
    }
  }
}

/* --------------------------------------------------- per-composer fixtures */
{
  const { composeNightOutRails } = modules.get("lib/nightOutIntent.js");
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "night_club", description: "Nightclub dance floor and DJ" }));
  const composed = composeNightOutRails([], places, {});
  const rail = railsArrayOf(composed).find((r) => r.id === "clubs");
  ok(!!rail, "nightOutIntent: the fixture lands in the Clubs rail");
  if (rail) assertLeads("nightOutIntent (clubs)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("nightOutIntent", composed);
}
{
  const { composeFallIntentRails } = modules.get("lib/fallIntentRails.js");
  const composed = composeFallIntentRails([], FALL_FIXTURE, { lat: 27.95, lng: -82.46, today: "2026-09-01", now: new Date("2026-09-01T12:00:00Z") });
  const rail = railsArrayOf(composed).find((r) => r.id === "farms");
  ok(!!rail, "fallIntentRails: the fixture lands in the Farms rail");
  if (rail) assertLeads("fallIntentRails (food)", cardsOf(rail).map((c) => c.id));
  assertMonotonic("fallIntentRails", composed);
}
{
  const { composeDateNightRails } = modules.get("lib/dateNightIntent.js");
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "beach" }));
  const signals = { weatherKnown: true, outdoorOK: true, beachShow: true };
  const composed = composeDateNightRails(places, signals, {});
  const rail = railsArrayOf(composed).find((r) => r.id === "beach");
  ok(!!rail, "dateNightIntent: the fixture lands in the Beach rail");
  if (rail) assertLeads("dateNightIntent (beach)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("dateNightIntent", composed);
}
{
  const { composeBirthdayRails } = modules.get("lib/birthdayIntent.js");
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "bar", editorial: "Rooftop bar with skyline views", rating: 4.6, reviews: 200 }));
  const composed = composeBirthdayRails(places, {});
  const rail = railsArrayOf(composed).find((r) => r.id === "rooftops");
  ok(!!rail, "birthdayIntent: the fixture lands in the Rooftops rail");
  if (rail) assertLeads("birthdayIntent (rooftops)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("birthdayIntent", composed);
}
{
  const { composeTodayDiscoveryRails } = modules.get("lib/todayDiscoveryRails.js");
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "beach" }));
  const composed = composeTodayDiscoveryRails(places, { city: "Test" });
  const rail = railsArrayOf(composed).find((r) => r.id === "beaches");
  ok(!!rail, "todayDiscoveryRails: the fixture lands in the Beaches rail");
  if (rail) assertLeads("todayDiscoveryRails (beaches)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("todayDiscoveryRails", composed);
}
{
  const { composeLunchBreakRails } = modules.get("lib/lunchBreakRails.js");
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "hamburger_restaurant" }));
  const composed = composeLunchBreakRails(places);
  const rail = railsArrayOf(composed).find((r) => r.id === "burgers");
  ok(!!rail, "lunchBreakRails: the fixture lands in the Burgers rail");
  if (rail) assertLeads("lunchBreakRails (burgers)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("lunchBreakRails", composed);
}
{
  const { composeWorthEatingRails } = modules.get("lib/worthEatingRails.js");
  // cuisinesForPlace reads google_types/types[] through classifyCuisine, not
  // primary_type directly — the one exception is PRIMARY_CUISINE_OVERRIDES
  // (tex_mex_restaurant -> mexican), the simplest reliable route to a named
  // rail without also needing a types[] array shaped for the classifier.
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primary_type: "tex_mex_restaurant", rating: 4.8, reviews: 1000 }));
  const composed = composeWorthEatingRails(places);
  const rail = railsArrayOf(composed).find((r) => r.id === "mexican-latin");
  ok(!!rail, "worthEatingRails: the fixture lands in the Mexican & Latin American rail");
  if (rail) assertLeads("worthEatingRails (mexican-latin)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("worthEatingRails", composed);
}
{
  const { splitBreakfastRails } = modules.get("lib/breakfastRails.js");
  const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "restaurant", name: `${f.name} Breakfast House` }));
  const composed = splitBreakfastRails(places);
  const rail = railsArrayOf(composed).find((r) => r.id === "breakfast-restaurants");
  ok(!!rail, "breakfastRails: the fixture lands in the Best Breakfast rail");
  if (rail) assertLeads("breakfastRails (breakfast-restaurants)", cardsOf(rail).map((p) => p.id));
  assertMonotonic("breakfastRails", composed);
}

console.log(`check-rail-rank-law: ${failures.length ? "fixtures FAILING, see below" : "all 8 covered composers pass silently — positive control: this guard does not fire on correct code"}`);

/* --------------------------------------------------------- ban the shape */
// A distance/ring/boost term may never be evaluated ahead of the score term
// in ANY rail comparator. Red-prove it: reinsert the EXACT ring this
// incident shipped into a scratch copy of the fixed file, run the SAME
// fixture through the mutated composer, and assert the check goes red. If
// reinserting the ring does not break the order, this guard's fixture check
// is not actually testing the thing it claims to — that is the failure mode
// CLAUDE.md calls out ("a guard that fires on correct code is worse than no
// guard", and its mirror: a check that cannot go red is not a check).
async function redProve(label, sourcePath, targetSnippet, ringedReplacement, extraImport, run) {
  const url = new URL(sourcePath, import.meta.url);
  const original = readFileSync(url, "utf8");
  if (!original.includes(targetSnippet)) {
    failures.push(`${label} red-prove: mutation target text not found in ${sourcePath} — this guard's mutation site is stale and must be updated to match the current file`);
    return;
  }
  let mutated = original.replace(targetSnippet, ringedReplacement);
  if (extraImport && !mutated.includes(extraImport)) {
    mutated = mutated.replace(/(\nimport [^\n]+;\n)/, `$1${extraImport}\n`);
  }
  if (mutated === original) {
    failures.push(`${label} red-prove: the mutation did not change the file content — sabotage never applied`);
    return;
  }
  if (!mutated.includes("NIGHT_OUT_NEAR_MI") && !mutated.includes("FALL_NEAR_MI") && !/ring\s*=/.test(mutated)) {
    failures.push(`${label} red-prove: the mutated source does not contain a ring term — the replacement text itself is wrong`);
    return;
  }
  const scratchPath = new URL(`../lib/.railRankLaw.redProve.${label}.mjs`, import.meta.url);
  writeFileSync(scratchPath, mutated, "utf8");
  try {
    const mutatedModule = await import(`${scratchPath.href}?bust=${Date.now()}-${Math.random()}`);
    const leaderStillLeads = run(mutatedModule);
    ok(leaderStillLeads === false, `${label} red-prove: reinserting the shipped distance ring breaks score-first order (the guard's own fixture check correctly goes red on the exact bug class)`);
  } catch (err) {
    failures.push(`${label} red-prove: the mutated scratch module failed to import/run (${err && err.message}) — cannot prove the guard detects the ring`);
  } finally {
    try { unlinkSync(scratchPath); } catch { /* best-effort cleanup */ }
  }
}

await redProve(
  "nightOutIntent",
  "../lib/nightOutIntent.js",
  "const rankedPlaces = rankRailPlaces;",
  [
    "function scoreOf(place) {",
    "  const score = Number(place?.wfScore ?? wayfindScore(place?.rating, place?.reviews));",
    "  return Number.isFinite(score) ? score : -1;",
    "}",
    "function rankedPlaces(rows) {",
    "  const names = new Set();",
    "  return rows.slice().sort((a, b) => {",
    "    const ring = (a.distMi > NIGHT_OUT_NEAR_MI) - (b.distMi > NIGHT_OUT_NEAR_MI);",
    "    return ring || (scoreOf(b) - scoreOf(a)) || (a.distMi - b.distMi);",
    "  }).filter((place) => {",
    '    const key = lower(place?.name).replace(/[^a-z0-9]+/g, " ").trim();',
    "    if (!key || names.has(key)) return false;",
    "    names.add(key);",
    "    return true;",
    "  });",
    "}",
  ].join("\n"),
  'import { wayfindScore } from "./wayfindScore.js";',
  (mutatedModule) => {
    const places = OWNER_FIXTURE.map((f) => ({ ...f, primaryType: "night_club", description: "Nightclub dance floor and DJ" }));
    const composed = mutatedModule.composeNightOutRails([], places, {});
    const rail = railsArrayOf(composed).find((r) => r.id === "clubs");
    const order = cardsOf(rail).map((p) => p.id);
    return order[0] === LEADER;
  },
);

await redProve(
  "fallIntentRails",
  "../lib/fallIntentRails.js",
  [
    "function rankCards(a, b, ctx) {",
    "  const av = normalizedCardScore(a, ctx);",
    "  const bv = normalizedCardScore(b, ctx);",
    "  if (av == null && bv != null) return 1;",
    "  if (bv == null && av != null) return -1;",
    "  if (av != null && bv != null && av !== bv) return bv - av;",
    "  const aMiles = itemDistance(a, ctx);",
    "  const bMiles = itemDistance(b, ctx);",
    "  return (Number.isFinite(aMiles) ? aMiles : Infinity) - (Number.isFinite(bMiles) ? bMiles : Infinity);",
    "}",
  ].join("\n"),
  [
    "function rankEvent(event, ctx) {",
    "  return scoreEvent(event, ctx);",
    "}",
    "function rankPlace(place) {",
    "  return Number(place?.wfScore || 0);",
    "}",
    "function rankCards(a, b, ctx) {",
    "  const aMiles = itemDistance(a, ctx);",
    "  const bMiles = itemDistance(b, ctx);",
    "  const ring = (aMiles > FALL_NEAR_MI) - (bMiles > FALL_NEAR_MI);",
    "  if (ring) return ring;",
    "  const av = a.kind === \"event\" ? rankEvent(a, ctx) : rankPlace(a);",
    "  const bv = b.kind === \"event\" ? rankEvent(b, ctx) : rankPlace(b);",
    "  return (bv - av) || (aMiles - bMiles);",
    "}",
  ].join("\n"),
  null,
  (mutatedModule) => {
    const composed = mutatedModule.composeFallIntentRails([], FALL_FIXTURE, { lat: 27.95, lng: -82.46, today: "2026-09-01", now: new Date("2026-09-01T12:00:00Z") });
    const rail = railsArrayOf(composed).find((r) => r.id === "farms");
    const order = cardsOf(rail).map((c) => c.id);
    return order[0] === LEADER;
  },
);

if (failures.length) {
  console.error("check-rail-rank-law: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}

// FALSE-POSITIVE SURFACE: this guard scans lib/*Intent*.js + lib/*Rails*.js
// (8 files this run), requires every compose*/split*/rank* export among them
// to carry a fixture here, runs the owner's real 8.5/16.8·7.7/14.9·9.0/18
// numbers through all 8 covered composers and checks BOTH the leader and
// full monotonic order on every rail each one returns, and red-proves the
// check itself by reinserting the exact shipped ring into nightOutIntent and
// fallIntentRails and confirming the check goes red both times.
console.log(`check-rail-rank-law: OK — ${pass} assertions. ${libFiles.length} files enumerated (${discovered.length} composer exports), ${COVERED.size} covered with the owner's real fixture, 0 uncovered, 2 red-proves confirmed red. A new lib/*Intent*.js or lib/*Rails*.js composer that lands without a fixture here FAILS this guard by name.`);
