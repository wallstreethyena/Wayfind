#!/usr/bin/env node
// Executes the homepage trend-module contract with synthetic places. No network,
// database, environment, or real source data is read.

import { readFileSync } from "node:fs";
import { EXPLODING_NEARBY_UNIVERSE, EXPLODING_NEARBY_KEYS, CONCEPTS } from "../lib/trendTaxonomy.js";
import { governedTrendPlace, hasSpecificTrendEvidence, matchAvailabilityAllows, selectExplodingNearby } from "../lib/explodingNearby.js";
import { matchConcept, MATCH_CODES } from "../lib/trendMatch.js";
import { TREND_EVENTS, SUCCESS_METRICS } from "../lib/trendTelemetry.js";
import { recommendationIds, uniqueRecommendations } from "../lib/recommendationDedupe.js";

let pass = 0;
const fail = (m) => { console.error("test-exploding-nearby: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const EXPECTED = [
  "Smash burgers", "Soft clubbing", "Cold-plunge saunas", "Social wellness clubs", "Puppy yoga",
  "Hojicha lattes", "Candlelight concerts", "Immersive Gamebox", "Dubai chocolate", "Black-sesame lattes",
  "Hwachae", "Tanghulu", "Kunafa", "Protein ice cream", "Immersive dining", "Pilates reformer",
  "Rucking", "Breathwork", "Forest bathing", "Kintsugi",
];
ok(EXPLODING_NEARBY_UNIVERSE.length === 20, `the launch universe has exactly 20 trends, got ${EXPLODING_NEARBY_UNIVERSE.length}`);
ok(JSON.stringify(EXPLODING_NEARBY_UNIVERSE.map((t) => t.label)) === JSON.stringify(EXPECTED), "the 20 labels and their supplied order are exact");
ok(EXPLODING_NEARBY_KEYS.length === new Set(EXPLODING_NEARBY_KEYS).size, "every launch concept key is unique");
for (const key of EXPLODING_NEARBY_KEYS) {
  const c = CONCEPTS[key];
  ok(!!c, `${key} is a controlled concept, not a raw topic string`);
  ok(c.evidenceFloor >= 0.75, `${key} requires strong concept-specific evidence (floor ${c.evidenceFloor})`);
  ok(c.tagEvidence.length > 0 && c.query.includes("{metro}"), `${key} declares evidence and a metro-scoped controlled query`);
}

const now = new Date().toISOString();
const genericCafe = {
  place_id: "place-generic-cafe", name: "Main Street Coffee", category: "food", metro: "manatee-sarasota",
  lat: 27.336, lng: -82.531, status: "OPERATIONAL", primary_type: "cafe", google_types: ["cafe", "coffee_shop"],
  tags: ["coffee"], refreshed_at: now, editorial: { verified: true, facts: [], hook: "Espresso and pastries downtown." },
};
const falseHojicha = matchConcept("hojicha_lattes", genericCafe, { metro: "manatee-sarasota" });
ok(!falseHojicha.matched && falseHojicha.code === MATCH_CODES.NO_SPECIFIC_EVIDENCE,
  "a cafe is not a hojicha result without menu/product evidence");
const provenHojicha = matchConcept("hojicha_lattes", { ...genericCafe, tags: ["hojicha"] }, { metro: "manatee-sarasota" });
ok(provenHojicha.matched, "the same cafe can match after controlled hojicha evidence exists");
const testNow = Date.parse("2026-08-10T16:00:00Z");
ok(!hasSpecificTrendEvidence({ match_evidence: [{ kind: "officialSource" }] }, "candlelight_concerts", testNow),
  "an event venue or official page is not a current Candlelight event without a dated occurrence");
ok(hasSpecificTrendEvidence({ match_evidence: [{ kind: "scheduledEvent", startsAt: "2026-08-12T23:00:00Z" }] }, "candlelight_concerts", testNow),
  "a dated future event is eligible evidence");
ok(!matchAvailabilityAllows({ match_evidence: [{ kind: "menu", unavailableUntil: "2026-08-25T00:00:00Z" }] }, testNow),
  "a verified offering that is temporarily unavailable is still excluded until it reopens");

const center = { lat: 27.336, lng: -82.531 };
const inv = (id, name, category, rating, reviews, lat, primaryType) => ({
  place_id: id, name, category, metro: "manatee-sarasota", lat, lng: -82.531,
  status: "OPERATIONAL", needs_review: false, primary_type: primaryType,
  google_types: [primaryType], signals: { rating, reviews, priceNum: 2 }, photo_ref: "places/test/photos/ref",
});
const inventory = [
  inv("smash-a", "Better Smash", "food", 4.8, 900, 27.337, "hamburger_restaurant"),
  inv("smash-b", "Good Smash", "food", 4.5, 500, 27.338, "hamburger_restaurant"),
  inv("cold-a", "Recovery Club", "attractions", 4.9, 300, 27.339, "wellness_center"),
  inv("pilates-a", "Reformer Studio", "attractions", 4.7, 450, 27.340, "pilates_studio"),
  inv("tea-a", "Tea Counter", "food", 5.0, 1000, 27.341, "cafe"),
];
const topics = [
  { topic_key: "t-smash", concept_key: "smash_burgers", strength: 0.95, eligible: true },
  { topic_key: "t-cold", concept_key: "cold_plunge_sauna", strength: 0.9, eligible: true },
  { topic_key: "t-pilates", concept_key: "pilates_reformer", strength: 0.85, eligible: true },
  { topic_key: "t-tea", concept_key: "hojicha_lattes", strength: 0.1, eligible: true },
];
const conceptForTopic = Object.fromEntries(topics.map((t) => [t.topic_key, t.concept_key]));
const matches = [
  ["smash-a", "t-smash"], ["smash-b", "t-smash"], ["cold-a", "t-cold"], ["pilates-a", "t-pilates"], ["tea-a", "t-tea"],
].map(([place_id, topic_key]) => ({
  place_id, topic_key, concept_key: conceptForTopic[topic_key], semantic_confidence: 0.95,
  match_evidence: [{ kind: "officialSource" }], public_explanation: "Verified offering", manual_state: "allow",
}));
const selected = selectExplodingNearby({ topics, matches, inventory, center });
ok(selected.length === 3, `exactly three locally actionable trends surface, got ${selected.length}`);
ok(JSON.stringify(selected.map((g) => g.conceptKey)) === JSON.stringify(["smash_burgers", "cold_plunge_sauna", "pilates_reformer"]),
  "topic momentum plus verified inventory selects the expected three modules");
ok(selected[0].matches[0].name === "Better Smash", "inside a trend, the higher governed Wayfind Score leads");
ok(!Object.prototype.hasOwnProperty.call(selected[0], "trendStrength"), "raw strength is used server-side and never returned to the card");

const sharedMatches = matches.concat({
  place_id: "smash-a", topic_key: "t-cold", concept_key: "cold_plunge_sauna", semantic_confidence: 0.99,
  match_evidence: [{ kind: "officialSource" }], public_explanation: "Verified offering", manual_state: "allow",
});
const uniqueSelected = selectExplodingNearby({ topics, matches: sharedMatches, inventory, center });
const shownIds = uniqueSelected.flatMap((g) => g.matches.map((p) => p.id));
ok(shownIds.length === new Set(shownIds).size,
  "one venue is claimed by its strongest Exploding trend and never repeats under a second trend");

const firstMenu = uniqueRecommendations([{ id: "a" }, { id: "b" }, { id: "b" }], [], 10);
const secondMenu = uniqueRecommendations([{ id: "b" }, { id: "c" }, { id: "d" }], recommendationIds(firstMenu), 10);
ok(JSON.stringify(recommendationIds(firstMenu)) === JSON.stringify(["a", "b"]),
  "a menu removes its own duplicate venue without changing rank order");
ok(JSON.stringify(recommendationIds(secondMenu)) === JSON.stringify(["c", "d"]),
  "a later menu backfills past venues already claimed by an earlier menu");

const scoreAtLowMomentum = governedTrendPlace(inventory[0], center).governedScore;
const scoreAtHighMomentum = governedTrendPlace({ ...inventory[0], trend_strength: 1, strength: 1 }, center).governedScore;
ok(scoreAtLowMomentum === scoreAtHighMomentum, "topic momentum cannot change a place's displayed governed score");

const route = read("app/api/trends/nearby/route.js");
const getRoute = route.slice(route.indexOf("export async function GET"));
ok(getRoute.indexOf("const cadence = importCadence()") > -1 && getRoute.indexOf("const cadence = importCadence()") < getRoute.indexOf("const s = serverEnv()"), "freshness configuration is validated before private trend data is read");
ok(!/RIGHTS_MODE|RIGHTS_REF|requireCapability|rightsReference/.test(route), "the serving route contains no retired external-approval gate");
ok(/trend_snapshot_stale/.test(route) && /status: "trend_snapshot_missing"/.test(route), "missing and stale snapshots are loud operator states, never ordinary empty inventory");
ok(!/canonical_topic/.test(route), "raw source topic names never leave the serving route");
ok(read("middleware.js").includes('"/api/trends/nearby"'), "the service-role trend-data route is same-origin and rate-limit guarded");

const ui = read("app/components/ExplodingNearby.js");
for (const event of [
  "exploding_section_impression", "trend_impression", "trend_expand", "primary_trend_card_click",
  "trend_horizontal_scroll", "additional_trend_place_click", "place_detail_view", "trend_card_save",
  "trend_card_share", "directions", "time_to_first_meaningful_interaction", "interaction_within_12_seconds",
]) ok(ui.includes(`"${event}"`), `the UI emits ${event}`);
ok(ui.includes("<RailCard") && ui.includes("wf-exploding-primary") && ui.includes("wf-rail-exploding"),
  "the primary vertical answers and optional horizontal rail reuse Wayfind's real place card");
ok(!/trending place|this place is exploding/i.test(ui), "the UI never converts a topic claim into a place-level claim");
ok(ui.includes("Trend momentum selects experiences. Wayfind Score ranks places. No paid placement."),
  "the score/trend boundary and no-paid-placement promise are visible beside the recommendations");

const home = read("app/components/BestNearby.js");
ok(home.indexOf("<ExplodingNearby") < home.indexOf('data-rail="top40"'), "Exploding Near You is the first answer in the existing discovery accordion");
ok(/icon: "fire", line: true/.test(home) && /fire: <path/.test(read("app/components/kit.js")),
  "the Exploding header tile renders a real fire glyph instead of an empty square");
ok(/uniqueRecommendations\(top40, explodingClaimed, TOP40_MAX\)/.test(home) &&
  /uniqueRecommendations\(rows\.eat, eatClaimedBefore, 10\)/.test(home) &&
  /excludePlaceIds=\{excludeBySection\[sdef\.id\] \|\| \[\]\}/.test(home),
  "the homepage wires Exploding → Best → later menus as one ordered venue-claim chain");
for (const copy of ["The Best Around You", "Actually Worth Eating", "What Should We Do Today?", "Places You'd Never Find", "Locals Know", "Events Near You", "Tonight's Move", "Worth the Drive"]) {
  ok(home.includes(copy), `the renamed hierarchy includes ${copy}`);
}
const collapse = read("lib/railCollapse.js");
ok(/DEFAULT_COLLAPSED_RAILS\s*=\s*\["best", "eat", "todo"/.test(collapse), "everything below Exploding Near You is collapsed for a first-time visitor");
ok(!/DEFAULT_COLLAPSED_RAILS[^;]*"exploding"/.test(collapse), "Exploding Near You is expanded by default");

for (const key of ["EXPLODING_SECTION_IMPRESSION", "PRIMARY_TREND_CARD_CLICK", "SIGNUP_AFTER_INTERACTION", "RETURN_VISIT"]) {
  ok(!!TREND_EVENTS[key], `${key} is declared in the central trend event vocabulary`);
}
for (const metric of ["exploding_to_place_ctr", "interaction_within_12_seconds_rate", "median_time_to_first_meaningful_interaction"]) {
  ok(SUCCESS_METRICS.some((m) => m.metric === metric && m.denominator), `${metric} has an explicit denominator`);
}

console.log(`test-exploding-nearby: OK — ${pass} assertions (20-topic taxonomy, evidence gates, lawful place order, UI hierarchy, analytics)`);
