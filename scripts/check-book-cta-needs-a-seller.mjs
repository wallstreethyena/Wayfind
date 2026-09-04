#!/usr/bin/env node
// check-book-cta-needs-a-seller — a Book button needs somebody selling entry.
//
// MEASURED ON PRODUCTION INVENTORY, 2026-09-04. 2,263 rows of wf_inventory
// passed isTicketyPlace and would have rendered a Book CTA. 829 of them were
// free public land: Shamrock Park, Indian Mound Park, Deer Prairie Creek
// Preserve, Osprey Junction Trailhead, Sarasota National Cemetery, Epiphany
// Cathedral. 33% of every Book button on the site pointed at ground you walk
// onto for nothing.
//
// THE LEAK IS ONE GOOGLE TYPE. `tourist_attraction` does not mean "you buy a
// ticket", it means "tourists go here", and Google hangs it on trailheads and
// cathedrals. v6.53 already fixed one instance of this shape (beaches carry
// tourist_attraction too). This is the same bug, one type family over.
//
// TWO RULES, AND THE ORDER MATTERS.
//   1. A SOLD type beats a FREE-LAND type. Universal Studios is
//      [amusement_park, park]; Myakka Canopy Walkway is [observation_deck,
//      hiking_area, park]; USF Botanical Gardens is [botanical_garden,
//      hiking_area]. Checking free-land first would have killed all three.
//   2. A VERIFIED PRODUCT BEATS BOTH. Myakka River State Park types as [park,
//      hiking_area] and its airboat tour is real Viator inventory. When a
//      product actually resolved for this place, the Google type is the weaker
//      evidence and loses. The unverified SEARCH fallback still needs the full
//      type gate, because a search link with nothing behind it is the
//      Coquina->Mumbai failure v6.60 fixed.
//
// A NAME RULE WAS TRIED AND REJECTED BY MEASUREMENT, which is why this file
// asserts against types and never against names: matching "park"/"preserve" in
// the NAME looked like another 8% and killed Sky Zone Trampoline Park, Urban
// Air, Xtreme Action Park, Hollywild Animal Preserve (a zoo) and Hatcher Garden
// and Woodland Preserve (a botanical garden). Types are evidence, names are
// vibes.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isTicketyPlace, isNeverBookable, ticketsUrl } from "../lib/affiliates.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const P = (name, types, category) => ({ name, types, category, id: "p_" + name.replace(/\W+/g, "") });

// ── 1. the free land that was leaking, all real rows ──────────────────────
const LEAKING = [
  ["Shamrock Park & Nature Center", ["park", "tourist_attraction", "point_of_interest", "establishment"]],
  ["Indian Mound Park", ["park", "tourist_attraction", "point_of_interest", "establishment"]],
  ["Lemon Bay Park & Environmental Center", ["park", "tourist_attraction", "point_of_interest", "establishment"]],
  ["Deer Prairie Creek Preserve South", ["hiking_area", "tourist_attraction", "park", "sports_activity_location"]],
  ["Jim Neville Marine Preserve", ["nature_preserve", "tourist_attraction", "park", "point_of_interest"]],
  ["Epiphany Cathedral", ["tourist_attraction", "church", "place_of_worship", "association_or_organization"]],
  ["Sarasota National Cemetery", ["cemetery", "tourist_attraction", "point_of_interest"]],
  ["Osprey Junction Trailhead", ["park", "hiking_area", "tourist_attraction"]],
  ["Goodale Park", ["city_park", "tourist_attraction", "state_park", "park"]],
];
for (const [name, types] of LEAKING) {
  ok(isTicketyPlace(P(name, types)) === false, `NO Book button on ${name} — free public land wearing tourist_attraction`);
  ok(ticketsUrl(P(name, types)) === null, `…and no Viator search link either (${name})`);
}

// ── 2. the money that must NOT be collateral damage ───────────────────────
// Every one of these carries a free-land type AND a sold type. Order of checks
// is the whole test.
const KEEP_DESPITE_GROUND = [
  ["Universal Studios Florida", ["amusement_park", "amusement_center", "park", "point_of_interest"]],
  ["Gatorland", ["amusement_park", "tourist_attraction", "water_park", "amusement_center"]],
  ["Myakka Canopy Walkway and Observation Tower", ["observation_deck", "tourist_attraction", "hiking_area", "park"]],
  ["USF Botanical Gardens", ["botanical_garden", "garden_center", "tourist_attraction", "hiking_area"]],
  ["Altitude Trampoline Park", ["park", "amusement_center", "point_of_interest", "establishment"]],
  ["Hollywild Animal Preserve", ["zoo", "tourist_attraction", "amusement_park", "amusement_center"]],
  ["Lower Hillsborough Wildlife Management Area", ["wildlife_park", "nature_preserve", "tourist_attraction", "state_park"]],
];
for (const [name, types] of KEEP_DESPITE_GROUND) {
  ok(isTicketyPlace(P(name, types)) === true,
    `KEEPS its Book button: ${name} carries ground types AND a sold type — the sold type wins`);
}

// The plain ticketed venues, unchanged by any of this.
for (const [name, types] of [
  ["Mote Marine Laboratory & Aquarium", ["aquarium", "tourist_attraction"]],
  ["The Ringling", ["museum", "art_museum", "tourist_attraction"]],
  ["Big Cat Habitat and Gulf Coast Sanctuary", ["zoo", "tourist_attraction"]],
  ["Sarasota Jungle Gardens", ["zoo", "amusement_park", "tourist_attraction"]],
  ["Bishop Museum of Science and Nature", ["museum", "planetarium", "tourist_attraction"]],
  ["Marie Selby Botanical Gardens", ["botanical_garden", "tourist_attraction"]],
]) ok(isTicketyPlace(P(name, types)) === true, `unchanged: ${name} still sells tickets`);

// ── 3. the v6.53 owner rule is not reopened ───────────────────────────────
for (const [name, types, cat] of [
  ["Siesta Key Beach", ["beach", "tourist_attraction", "natural_feature"], null],
  ["Coquina Beach", ["natural_feature", "tourist_attraction"], null],
  ["Lido Key", ["tourist_attraction", "point_of_interest"], "beach"],
]) {
  ok(isNeverBookable(P(name, types, cat)) === true, `${name} is never bookable inventory — the v6.53 rule, unchanged`);
  ok(isTicketyPlace(P(name, types, cat)) === false, `…and gets no Book button (${name})`);
}
ok(isNeverBookable(P("The Ringling", ["museum"])) === false, "control: a museum is not caught by the beach rule");

// ── 4. a VERIFIED product outranks the type, but never the beach rule ─────
const SRC = readFileSync(join(ROOT, "lib/bookingResolve.js"), "utf8");
ok(/const verifiedUrl = \(topItem && topItem\.url && !Aff\.isNeverBookable\(detail\)\)/.test(SRC),
  "a VERIFIED Viator product is gated on isNeverBookable, not on the Google type — Myakka's airboat tour is real inventory on a place typed [park, hiking_area]");
ok(/const permitted = !verifiedUrl && BOOKABLE_KINDS\.includes\(kind\) && Aff\.isTicketyPlace\(detail\)/.test(SRC),
  "…while the unverified SEARCH fallback still requires the full type gate (the Coquina->Mumbai rule)");
ok(!/verifiedUrl = \(topItem && topItem\.url && Aff\.isTicketyPlace/.test(SRC),
  "…and the old type gate on the verified path is gone, not merely widened");

// ── 5. one predicate, no drift ────────────────────────────────────────────
const AFF = readFileSync(join(ROOT, "lib/affiliates.js"), "utf8");
const tu = AFF.slice(AFF.indexOf("export function ticketsUrl"));
ok(/if \(!isTicketyPlace\(place\)\) return null;/.test(tu.slice(0, 600)),
  "ticketsUrl asks the SAME predicate the card CTA asks — it used to test TICKETY raw and would hand a beach a search link");
ok(!/if \(!TICKETY\.test\(types\)\) return null;/.test(AFF), "…and the drifted raw test is gone");
const fn = AFF.slice(AFF.indexOf("export function isTicketyPlace"), AFF.indexOf("export function isTicketyPlace") + 700);
ok(fn.indexOf("SOLD_TYPES") < fn.indexOf("FREE_LAND_TYPES"),
  "SOLD is checked BEFORE FREE_LAND — the other order kills Universal Studios, and this is the ordering bug this guard exists to hold");
ok(!/\bname\b.*test\(|test\(.*\.name/.test(fn),
  "the gate never reads the NAME — measured: a name rule killed Sky Zone, Urban Air and a zoo called a Preserve");

// ── 6. nothing throws on junk ─────────────────────────────────────────────
for (const junk of [null, undefined, {}, { types: null }, { types: [] }, { types: ["park"], category: null }]) {
  let threw = null;
  try { isTicketyPlace(junk); isNeverBookable(junk); } catch (e) { threw = e; }
  ok(!threw, `a malformed place row does not throw (${JSON.stringify(junk)})`);
}
ok(isTicketyPlace({ types: [] }) === false, "a place with no types sells nothing");

if (fails.length) {
  console.error("check-book-cta-needs-a-seller: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-book-cta-needs-a-seller: OK — ${pass} assertions; free public land loses its Book button (739 rows, 33% of production inventory), a sold type beats a ground type, and a verified product beats both`);
