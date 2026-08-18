#!/usr/bin/env node
// Executes the homepage trend-module contract with synthetic places. No network,
// database, environment, or real source data is read.

import { readFileSync } from "node:fs";
import { EXPLODING_NEARBY_UNIVERSE, EXPLODING_NEARBY_KEYS, CONCEPTS } from "../lib/trendTaxonomy.js";
import { governedTrendPlace, hasSpecificTrendEvidence, matchAvailabilityAllows, selectExplodingNearby } from "../lib/explodingNearby.js";
import { matchConcept, MATCH_CODES } from "../lib/trendMatch.js";
import { TREND_EVENTS, SUCCESS_METRICS } from "../lib/trendTelemetry.js";
import { recommendationIds, uniqueRecommendations } from "../lib/recommendationDedupe.js";
import { loadProvidedTrendList, placeFromGoogle, SCHEDULE_REQUIRED, launchTrendsForBucket, LAUNCH_MAX_TRENDS } from "../lib/explodingLaunchSearch.js";
import { TIME_BUCKETS } from "../lib/nowContext.js";

let pass = 0;
const fail = (m) => { console.error("test-exploding-nearby: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const EXPECTED = [
  "Smash burgers", "Elevated ramen and noodle bowls", "Caribbean curry bowls", "Miso and umami seafood",
  "Functional smoothies and a\u00e7a\u00ed bowls", "High-protein grab-and-go", "Fiber and gut-health food",
  "Fermented and pickled flavors", "Matcha and specialty coffee", "Zero-proof and low-ABV cocktails",
  "Savory cocktails", "Food halls", "Experiential dining", "Reformer Pilates and Lagree",
  "Cold plunge and sauna recovery", "Social wellness clubs", "Soft clubbing and coffee raves",
  "Listening bars", "Pickleball and padel", "Golf simulators and social play",
];
ok(EXPLODING_NEARBY_UNIVERSE.length === 20, `the launch universe has exactly 20 trends, got ${EXPLODING_NEARBY_UNIVERSE.length}`);
ok(JSON.stringify(EXPLODING_NEARBY_UNIVERSE.map((t) => t.label)) === JSON.stringify(EXPECTED), "the 20 labels and the owner's rank order are exact");
const ranks = EXPLODING_NEARBY_UNIVERSE.map((t) => t.rank);
ok(ranks.length === new Set(ranks).size && Math.min(...ranks) === 1 && Math.max(...ranks) === 20, "owner ranks are 1..20 and unique");
for (const t of EXPLODING_NEARBY_UNIVERSE) {
  ok(TIME_BUCKETS.includes(t.primaryBucket), `${t.key} declares a real primary daypart`);
  ok(Array.isArray(t.alsoBuckets) && t.alsoBuckets.every((b) => TIME_BUCKETS.includes(b)) && !t.alsoBuckets.includes(t.primaryBucket),
    `${t.key} also-works windows are real buckets and never repeat the primary`);
}
ok(JSON.stringify(launchTrendsForBucket("night").map((t) => t.rank)) === JSON.stringify([1, 2, 4, 8, 10, 11, 13, 18, 20, 3, 12, 19]),
  "night eligibility is primary-night trends by owner rank, then also-works trends by owner rank");
ok(JSON.stringify(launchTrendsForBucket("morning").map((t) => t.rank)) === JSON.stringify([5, 6, 7, 9, 14, 15, 16, 17, 19]),
  "morning eligibility follows the owner's daypart table");
ok(JSON.stringify(launchTrendsForBucket("afternoon").map((t) => t.rank)) === JSON.stringify([3, 12, 19, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20]),
  "afternoon leads with its primary trends and then admits every also-works trend by rank");
ok(EXPLODING_NEARBY_KEYS.length === new Set(EXPLODING_NEARBY_KEYS).size, "every launch concept key is unique");
ok(SCHEDULE_REQUIRED.has("soft_clubbing") && SCHEDULE_REQUIRED.has("puppy_yoga") && SCHEDULE_REQUIRED.has("candlelight_concerts"),
  "event-shaped trends cannot be inferred from a place search without a dated occurrence");
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
const googlePlace = (id, name, types, lat = 27.337) => ({
  id, displayName: { text: name }, location: { latitude: lat, longitude: -82.531 },
  rating: 4.8, userRatingCount: 700, businessStatus: "OPERATIONAL", types,
  photos: [{ name: `places/${id}/photos/one` }],
});
ok(placeFromGoogle(googlePlace("plain-cafe", "Main Street Coffee", ["cafe", "coffee_shop"]), "hojicha_lattes", center) == null,
  "an exact Google query still cannot turn a generic cafe into a hojicha match");
ok(placeFromGoogle(googlePlace("smash-live", "Smashburger", ["hamburger_restaurant", "restaurant"]), "smash_burgers", center)?.governedScore > 0,
  "a correctly typed Google result whose own identity proves the offering receives the governed score");
// Proof cases for the new top-20 concepts: type proof and name proof.
ok(placeFromGoogle(googlePlace("ramen-type", "Kazu Kitchen", ["ramen_restaurant", "restaurant"]), "elevated_ramen", center)?.governedScore > 0,
  "a dedicated Google type proves the offering even when the name says nothing (types are truth)");
ok(placeFromGoogle(googlePlace("ramen-none", "Joe's Diner", ["restaurant"]), "elevated_ramen", center) == null,
  "a generic restaurant with no ramen identity is refused for the ramen trend");
ok(placeFromGoogle(googlePlace("matcha-name", "Blossom Matcha Bar", ["cafe"]), "matcha_specialty_coffee", center)?.governedScore > 0,
  "a cafe whose own identity names matcha is admitted by name proof");
ok(placeFromGoogle(googlePlace("matcha-chain", "Starbucks", ["coffee_shop", "cafe"]), "matcha_specialty_coffee", center) == null,
  "a generic coffee chain is not a matcha or specialty answer without proof");
ok(placeFromGoogle(googlePlace("golf-shop", "Golf Galaxy", ["sporting_goods_store", "store"]), "golf_simulators", center) == null,
  "a golf shop selling clubs is vetoed by type: names lie");
ok(placeFromGoogle(googlePlace("curry-wrong", "Curry Palace Indian Cuisine", ["indian_restaurant", "restaurant"]), "caribbean_curry_bowls", center) == null,
  "an Indian curry house is not a Caribbean curry answer: the word curry alone is not identity");

const searchCalls = [];
const liveByQuery = [
  [/smash burger/i, googlePlace("live-smash", "Smashburger", ["hamburger_restaurant", "restaurant"])],
  [/ramen/i, googlePlace("live-ramen", "Kazu Kitchen", ["ramen_restaurant", "restaurant"])],
  [/golf simulator/i, googlePlace("live-golf", "Five Iron Golf", ["amusement_center", "bar"])],
  // Morning trends: present in the fixture so a leak would be caught, below.
  [/cold plunge|sauna/i, googlePlace("live-sauna", "Perspire Sauna Studio", ["spa", "wellness_center"])],
  [/pilates/i, googlePlace("live-pilates", "Club Pilates Sarasota", ["pilates_studio", "gym"])],
];
const fakeFetch = async (url) => {
  searchCalls.push(String(url));
  const q = new URL(String(url), "https://wayfind.test").searchParams.get("q") || "";
  const row = liveByQuery.find(([re]) => re.test(q));
  return { ok: true, status: 200, json: async () => ({ places: row ? [row[1]] : [] }) };
};
const liveList = await loadProvidedTrendList({ center, city: "Sarasota", bucket: "night", fetchImpl: fakeFetch });
ok(liveList.status === "ok" && liveList.source === "provided-20-trend-list" && liveList.bucket === "night",
  "the launch feed reads the supplied list rather than a Semrush API and names the daypart it served");
ok(JSON.stringify(liveList.trends.map((t) => t.conceptKey)) === JSON.stringify(["smash_burgers", "elevated_ramen", "golf_simulators"]),
  "night answers surface in the owner's rank order");
ok(searchCalls.length === 12 && searchCalls.every((u) => u.startsWith("/api/places/search?")),
  "exactly the 12 night-eligible trends are searched through the shared Google-search cache, never a trend-provider API");
ok(!searchCalls.some((u) => /pilates|sauna|matcha|acai/i.test(decodeURIComponent(u))),
  "a morning trend is never searched at night: the daypart trigger is also the cost gate");
ok(typeof liveList.trends[0].stat === "string" && /650%/.test(liveList.trends[0].stat),
  "a launch trend still carries its owner-supplied search-data stat when one exists");

const morningCalls = [];
const morningFetch = async (url) => {
  morningCalls.push(String(url));
  const q = new URL(String(url), "https://wayfind.test").searchParams.get("q") || "";
  const row = liveByQuery.find(([re]) => re.test(q));
  return { ok: true, status: 200, json: async () => ({ places: row ? [row[1]] : [] }) };
};
const morningList = await loadProvidedTrendList({ center, city: "Sarasota", bucket: "morning", fetchImpl: morningFetch });
ok(JSON.stringify(morningList.trends.map((t) => t.conceptKey)) === JSON.stringify(["pilates_reformer", "cold_plunge_sauna"]),
  "morning serves the morning trends in owner rank order (#14 before #15)");
ok(morningCalls.length === 8, "8 searchable morning trends: 9 eligible minus schedule-required soft clubbing");
ok(!morningCalls.some((u) => /smash|golf|martini/i.test(decodeURIComponent(u))), "a night trend is never searched in the morning");

// The ranked walk stops at ten modules (owner: "top 10 ideally, work our way down").
const PROOF_PLACE = {
  smash_burgers: ["Smashburger", ["hamburger_restaurant"]],
  elevated_ramen: ["Kazu Kitchen", ["ramen_restaurant"]],
  caribbean_curry_bowls: ["Island Spice Jamaican Kitchen", ["restaurant"]],
  miso_umami_seafood: ["Sora Sushi", ["sushi_restaurant"]],
  functional_smoothie_acai: ["Beach Bowls Acai", ["acai_shop"]],
  high_protein_grab_and_go: ["Fuel Nutrition", ["juice_shop"]],
  gut_health_food: ["Culture Kombucha Taproom", ["cafe"]],
  fermented_pickled: ["Seoul Garden", ["korean_restaurant"]],
  matcha_specialty_coffee: ["Blossom Matcha Bar", ["cafe"]],
  mocktail_bar: ["The Dry Bar", ["bar"]],
  savory_cocktails: ["Velvet Martini Lounge", ["bar"]],
  food_hall: ["Sarasota Public Market", ["food_court"]],
  immersive_dining: ["Ember Immersive Dining", ["restaurant", "event_venue"]],
  pilates_reformer: ["Club Pilates Sarasota", ["pilates_studio"]],
  cold_plunge_sauna: ["Perspire Sauna Studio", ["spa", "wellness_center"]],
  social_wellness_clubs: ["Reset Social Wellness Club", ["wellness_center", "social_club"]],
  listening_bar: ["Analog Listening Room", ["bar"]],
  pickleball: ["The Pickle Yard", ["sports_complex"]],
  golf_simulators: ["Five Iron Golf", ["amusement_center", "bar"]],
};
const queryToKey = Object.fromEntries(Object.keys(PROOF_PLACE).map((k) => [CONCEPTS[k].query.replace("{metro}", "Sarasota"), k]));
const capCalls = [];
const capFetch = async (url) => {
  capCalls.push(String(url));
  const q = new URL(String(url), "https://wayfind.test").searchParams.get("q") || "";
  const key = queryToKey[q];
  const spec = key && PROOF_PLACE[key];
  return { ok: true, status: 200, json: async () => ({ places: spec ? [googlePlace("cap-" + key, spec[0], spec[1])] : [] }) };
};
const capList = await loadProvidedTrendList({ center, city: "Sarasota", bucket: "afternoon", fetchImpl: capFetch });
ok(capList.trends.length === LAUNCH_MAX_TRENDS,
  "the afternoon walk stops at ten modules, the TOP of the owner's list");
ok(JSON.stringify(capList.trends.map((t) => t.conceptKey)) === JSON.stringify([
  "caribbean_curry_bowls", "food_hall", "pickleball", "smash_burgers", "elevated_ramen",
  "miso_umami_seafood", "functional_smoothie_acai", "high_protein_grab_and_go", "gut_health_food", "fermented_pickled",
]), "the ten winners are the primary-afternoon trends and then the highest-ranked also-works trends");
ok(capCalls.length === 12, "the ranked walk stops searching once the display budget is met, never sweeping all nineteen");
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
ok(selected.length === 3, `every locally actionable RANKED trend surfaces, got ${selected.length}`);
ok(JSON.stringify(selected.map((g) => g.conceptKey)) === JSON.stringify(["smash_burgers", "cold_plunge_sauna", "pilates_reformer"]),
  "topic momentum plus verified inventory orders the modules");
ok(!selected.some((g) => g.conceptKey === "hojicha_lattes"),
  "a concept outside the owner's ranked top-20 universe never renders a module, even with a verified match");
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
// RE-POINTED v8.12 (owner, 2026-08-18: "the exploding trends do not have the
// 20 top trending items"). The route now serves TWO lawful bases: the
// provider snapshot (cadence-gated, exactly as before — but only when a
// snapshot actually exists) and the OWNER LIST (EXPLODING_NEARBY_UNIVERSE
// through the same evidence-gated matcher). The old assertion pinned
// cadence-validation-before-anything, which is precisely what turned an
// import that never ran into a permanent 503 over the owner's own licensed
// list. What is pinned now:
//   1. the snapshot basis still validates cadence BEFORE reading its private
//      tables;
//   2. only TrendConfigError falls through to the owner basis — real errors
//      still throw;
//   3. the owner basis runs the SAME matcher (matchTopicToInventory), so
//      nothing serves without evidence;
//   4. a stale snapshot is still refused loudly (console.error), never used.
ok(getRoute.indexOf("const cadence = importCadence()") > -1 && getRoute.indexOf("const cadence = importCadence()") < getRoute.indexOf("wf_trend_snapshots"), "the snapshot basis validates freshness configuration before its private trend tables are read");
ok(/instanceof TrendConfigError\)\) throw e/.test(getRoute), "only an unconfigured provider import falls through to the owner basis — every other error still throws");
ok(/matchTopicToInventory\(t\.key, inventory, \{ metro \}\)/.test(getRoute), "the owner basis runs the SAME evidence-gated matcher — nothing serves without proof");
ok(/EXPLODING_NEARBY_UNIVERSE\.map/.test(getRoute), "owner-basis topics come from the owner's licensed universe, in his rank order");
ok(!/RIGHTS_MODE|RIGHTS_REF|requireCapability|rightsReference/.test(route), "the serving route contains no retired external-approval gate");
ok(/refused a stale snapshot/.test(route), "a stale snapshot is refused loudly, never served");
ok(!/canonical_topic/.test(route), "raw source topic names never leave the serving route");
ok(read("middleware.js").includes('"/api/trends/nearby"'), "the service-role trend-data route is same-origin and rate-limit guarded");

const ui = read("app/components/ExplodingNearby.js");
ok(ui.includes("loadProvidedTrendList") && !ui.includes("/api/trends/nearby"),
  "the homepage consumes the supplied 20-trend list and does not wait for a provider snapshot");
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
// ── RE-POINTED 2026-08-16. WHAT MOVED: the section was REMOVED from the
// homepage. Everything this file asserts about lib/explodingNearby.js, the
// API route and the component itself is untouched and still runs — that
// pipeline is intact and correct. What changed is only that BestNearby.js no
// longer MOUNTS it, because no trend snapshot has ever been imported
// (EXPLODING_TOPICS_IMPORT_CADENCE set in no environment; wf_trend_snapshots,
// wf_trend_topics and wf_trend_place_matches all zero rows), so every render
// produced "Trend recommendations are temporarily unavailable" in the first
// slot of the page, opened by default.
//
// The three assertions below become CONDITIONAL rather than deleted: if the
// section is ever mounted again it must still lead, must still carry exactly
// one fire emoji, and must still head the venue-claim chain. Deleting them
// would let a future restore reintroduce the duplicated-emoji header and the
// broken claim order that they were written for.
const expMounted = /<ExplodingNearby[\s/>]/.test(home);
ok(!expMounted || home.indexOf("<ExplodingNearby") < home.indexOf('data-rail="top40"'),
  "if mounted, Exploding Near You is still the first answer in the discovery accordion");
ok(!expMounted || (/label: "Exploding Trends Near You"[^}]*emoji: "🔥"/.test(home) && !/label: "🔥 Exploding Trends Near You"/.test(home)),
  "if mounted, the Exploding header tile renders one real fire emoji without duplicating it in the title");
// The CHAIN itself is not conditional — it must hold either way. Only its head
// moved: with Exploding gone the Top 40 claims first and nothing precedes it.
ok(/uniqueRecommendations\(top40, (?:\[\]|[A-Za-z_$][\w$]*), TOP40_MAX\)/.test(home) &&
  /uniqueRecommendations\(rows\.eat, eatClaimedBefore, 10\)/.test(home) &&
  /excludePlaceIds=\{excludeBySection\[sdef\.id\] \|\| \[\]\}/.test(home),
  "the homepage still wires the answer → later menus as one ordered venue-claim chain, whatever sits at its head");
for (const copy of ["The Best Around You", "Actually Worth Eating", "What Should We Do Today?", "Places You'd Never Find", "Locals Know", "Events Near You", "Tonight's Move", "Worth the Drive"]) {
  ok(home.includes(copy), `the renamed hierarchy includes ${copy}`);
}
const collapse = read("lib/railCollapse.js");
// RE-POINTED with the same move: "best" LEFT the collapsed list, because with
// Exploding removed it is the only thing a new visitor lands on already open.
// Pinning the literal array head would have gone green on a homepage where
// every single section starts closed.
ok(/DEFAULT_COLLAPSED_RAILS\s*=\s*\["eat", "quickbite", "todo"/.test(collapse),
  "everything below the leading answer is collapsed for a first-time visitor, and the answer itself is not in the list");
ok(!/DEFAULT_COLLAPSED_RAILS[^;]*"exploding"/.test(collapse), "Exploding Near You is expanded by default");

for (const key of ["EXPLODING_SECTION_IMPRESSION", "PRIMARY_TREND_CARD_CLICK", "SIGNUP_AFTER_INTERACTION", "RETURN_VISIT"]) {
  ok(!!TREND_EVENTS[key], `${key} is declared in the central trend event vocabulary`);
}
for (const metric of ["exploding_to_place_ctr", "interaction_within_12_seconds_rate", "median_time_to_first_meaningful_interaction"]) {
  ok(SUCCESS_METRICS.some((m) => m.metric === metric && m.denominator), `${metric} has an explicit denominator`);
}

console.log(`test-exploding-nearby: OK — ${pass} assertions (20-topic taxonomy, evidence gates, lawful place order, UI hierarchy, analytics)`);
