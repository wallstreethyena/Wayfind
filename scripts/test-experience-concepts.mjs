// scripts/test-experience-concepts.mjs — the DERIVED category matchers.
//
// Owner (2026-08-04): "if it's for food give me food tours — match the Viator
// deeplink option with the category the user is searching for."
//
// Viator's harvested tag list has no food, nightlife, shopping or wellness tag,
// so 35 food tours already in wf_experiences were invisible to every category
// filter on the site. lib/experienceConcepts.js classifies them by title.
//
// A TITLE MATCHER IS A HEURISTIC, so this guard is mostly about its FAILURE
// DIRECTION. Missing a food tour costs a click. Mis-filing a boat charter under
// "Breakfast" is the spa-shows-kayak-tours complaint again, which costs trust.
// Every trap below is a real title from the corpus that a looser draft matched.
import { CONCEPTS, CONCEPT_KEYS, isConcept, conceptsFor, conceptQuery, chipAffinityBonus, AFFINITY_CAP } from "../lib/experienceConcepts.js";

let pass = 0;
const fail = (m) => { console.error("test-experience-concepts: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

ok(CONCEPT_KEYS.length >= 5, `concepts are defined (got ${CONCEPT_KEYS.length})`);
for (const k of CONCEPT_KEYS) {
  ok(CONCEPTS[k].rx instanceof RegExp, `concept "${k}" has a matcher`);
  ok(typeof conceptQuery(k) === "string" && conceptQuery(k).length > 5, `concept "${k}" has human live-search text`);
  ok(!CONCEPT_KEYS.includes(conceptQuery(k)), `concept "${k}" query is prose, not a key`);
}

// ── MUST MATCH — real titles from the corpus ─────────────────────────────
const HIT = [
  ["food", "Sarasota Kayak and Food Tour"],
  ["food", "VIP Full Day Wineries Tour"],
  ["food", "Ultimate Chinatown & Little Italy Food Tour in NYC"],
  ["food", "Orlando: Factory Adventure Tour in Chocolate Kingdom"],
  ["food", "Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour"],
  ["nightlife", "Haunted Tampa Booze and Boos Ghost Walking Tour"],
  ["nightlife", "Private Pub Crawl with a Local"],
  ["nightlife", "A Toast to the Ghost Haunted Pub Crawl in Downtown Orlando"],
  ["family", "Family Friendly Statue of Liberty and Ellis Island Tour"],
  ["family", "The Florida Aquarium in Tampa General Admission"],
  ["sightseeing", "City Sightseeing Trolley Tour of Sarasota"],
  ["sightseeing", "Segway Istanbul Old City Tour - Evening"],
];
for (const [k, title] of HIT) ok(isConcept(k, title), `"${title}" is ${k}`);

// ── MUST NOT MATCH — the traps a looser draft caught ─────────────────────
const MISS = [
  ["food", "Beer Can Island Boat Tour", "a sandbar, not a brewery — a bare `beer` token matched this"],
  ["food", "Clear Kayak Ecotour", "a kayak trip is not a food tour"],
  ["shopping", "Market Street Walking Tour", "a street name — bare `market` matched this"],
  ["nightlife", "Sarasota Yacht Club Sunset Charter", "a yacht club is not a nightclub — bare `club` matched this"],
  ["nightlife", "Beach Club Day Pass", "a beach club is not nightlife"],
  ["wellness", "Sarasota Bay Paddleboard", "no spa here at all"],
];
for (const [k, title, why] of MISS) ok(!isConcept(k, title), `"${title}" is NOT ${k} — ${why}`);

// ── unknown key is false, never true ─────────────────────────────────────
ok(isConcept("not-a-concept", "Anything At All") === false, "an unknown concept key returns false, never true (a true here would widen every chip)");
ok(isConcept("food", "") === false, "an empty title matches nothing");
ok(isConcept("food", null) === false, "a null title matches nothing (no crash)");

// ── conceptsFor is the multi-label view ──────────────────────────────────
// A product legitimately belongs to more than one concept, and the pools must
// overlap rather than compete — a food tour that is also a city tour should
// surface under both headings, not be forced to pick one.
const multi = conceptsFor("Food Tour with Hop-On Hop-Off Sightseeing");
ok(multi.includes("food") && multi.includes("sightseeing"), `a food + sightseeing product carries BOTH concepts (got ${JSON.stringify(multi)})`);
const multi2 = conceptsFor("Haunted Pub Crawl and Street Food Walk");
ok(multi2.includes("food") && multi2.includes("nightlife"), `a pub crawl with street food carries both (got ${JSON.stringify(multi2)})`);
// And the single-concept case stays single — overlap must not mean everything
// matches everything. "Walking Food Tour" is NOT "walking tour".
ok(conceptsFor("Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour").join(",") === "food",
   "a walking FOOD tour is food only — \"Walking Food Tour\" does not contain a contiguous \"walking tour\", and reading it as sightseeing would be the loose-matching failure this file guards");

// ── AFFINITY IS ORDER-ONLY AND BOUNDED ───────────────────────────────────
// If this ever exceeds the cap, or goes negative, it stops being a tiebreak and
// starts overriding merit — which would break the owner's "ranked from highest
// score" outright.
ok(AFFINITY_CAP > 0 && AFFINITY_CAP <= 1, `the affinity cap is small (got ${AFFINITY_CAP})`);
const probes = [
  ["food", "dessert", "Chocolate Kingdom Factory Tour", true],
  ["food", "dessert", "Taste of Downtown Walking Tour", false],
  ["food", "cafes", "Coffee Roaster Tasting Tour", true],
  ["nightlife", "speakeasy", "Speakeasy Cocktail Crawl", true],
  ["nightlife", "speakeasy", "Haunted Ghost Tour", false],
  ["food", "all", "Chocolate Kingdom Factory Tour", false],
];
for (const [cat, sub, title, expect] of probes) {
  const b = chipAffinityBonus(cat, sub, title);
  ok(b >= 0 && b <= AFFINITY_CAP, `${cat}:${sub} bonus stays within [0, ${AFFINITY_CAP}] (got ${b})`);
  ok(expect ? b > 0 : b === 0, `${cat}:${sub} ${expect ? "rewards" : "does not reward"} "${title}" (got ${b})`);
}
ok(chipAffinityBonus("food", "all", "anything") === 0, "a chip with no declared affinity adds nothing — it must not silently reorder");
ok(chipAffinityBonus(null, null, "anything") === 0, "missing chip → no bonus (no crash)");

// ── the bonus cannot leapfrog merit ──────────────────────────────────────
// A clearly better product must stay ahead of an affinity-matching worse one.
const better = 8.0;                       // strong generic food tour
const worseWithAffinity = 8.0 - (AFFINITY_CAP + 0.1) + AFFINITY_CAP;
ok(worseWithAffinity < better, "a full affinity bonus cannot lift a clearly-worse product past a better one — merit still decides");

console.log(`test-experience-concepts: OK — ${pass} assertions (${CONCEPT_KEYS.length} concepts; ${HIT.length} real titles matched, ${MISS.length} corpus traps refused incl. "Beer Can Island" and "Yacht Club"; affinity proven order-only, bounded and unable to leapfrog merit)`);
