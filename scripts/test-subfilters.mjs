// scripts/test-subfilters.mjs — v6.39 regression tests for the Tours /
// On-the-water contracts (the "Florida Railroad under Tours" bug) and the
// Delivery subfilter (Order In in the main menu).
//
// ROOT CAUSE locked down: SUB_ALLOW regexes run against the Google `types`
// string, and the old tours pattern began /\btour|…/ — which matches
// "tourist_attraction", the type carried by nearly EVERY generic attraction.
// Deliberately TEXT-BASED (readFileSync + extract the regex literals), like
// the check-* guards: lib/google.js imports @googlemaps/js-api-loader and an
// extensionless ./businessStatus, so importing it from a bare-node test would
// crash prebuild.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-subfilters: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const pf = readFileSync(new URL("../lib/placeFilter.js", import.meta.url), "utf8");
const gg = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");

function rxFor(key) {
  const m = pf.match(new RegExp('"' + key + '":\\s*/((?:[^/\\\\]|\\\\.)+)/([a-z]*)'));
  if (!m) fail("SUB_ALLOW contract missing: " + key);
  return new RegExp(m[1], m[2]);
}

// ── tours: "tourist_attraction" alone must NOT satisfy the contract ─────────
const tours = rxFor("attractions:tours");
ok(!tours.test("tourist_attraction"), "bare tourist_attraction does NOT match tours (the railroad bug)");
ok(!tours.test("museum tourist_attraction"), "museum + tourist_attraction types do NOT match tours");
ok(!tours.test("Florida Railroad Museum"), "railroad museum NAME does not match tours");
ok(tours.test("tour_agency"), "tour_agency type matches tours");
ok(tours.test("boat_tour"), "boat_tour type matches tours");
ok(tours.test("Tampa Bay Boat Tours"), "\"Boat Tours\" name matches tours");
ok(tours.test("Old Town Trolley Tours"), "trolley tours name matches tours");
ok(tours.test("sightseeing"), "sightseeing matches tours");
ok(tours.test("Sunset Sail Sarasota"), "sunset sail operator matches tours");
ok(tours.test("Jet Ski Tour Tampa"), "jet ski tour matches tours");

// ── on the water: water SPORTS are first-class, not just docks ──────────────
const water = rxFor("attractions:marinas");
ok(water.test("jet_ski"), "jet ski matches On the water");
ok(water.test("Jet-Ski Rentals of Tampa"), "hyphenated jet-ski name matches");
ok(water.test("paddleboard rentals"), "paddleboard matches On the water");
ok(water.test("kayak launch"), "kayak matches On the water");
ok(water.test("parasailing adventures"), "parasail matches On the water");
ok(water.test("marina"), "marinas still match (they belong, just not exclusively)");

// ── the queries actually ask Google for the fun stuff ───────────────────────
const toursQ = gg.match(/id:\s*"tours",\s*label:\s*"Tours",\s*query:\s*"([^"]+)"/);
const waterQ = gg.match(/id:\s*"marinas",\s*label:\s*"On the water",\s*query:\s*"([^"]+)"/);
ok(toursQ && /guided/i.test(toursQ[1]) && /boat tours/i.test(toursQ[1]), "tours query asks for guided + boat tours");
ok(waterQ && /jet ski/i.test(waterQ[1]) && /paddle/i.test(waterQ[1]) && /sunset/i.test(waterQ[1]), "water query asks for jet ski + paddle + sunset cruises");
ok(waterQ && !/^marinas/i.test(waterQ[1].trim()), "water query no longer LEADS with marinas");

// ── v6.39: Delivery is a first-class Food subfilter (Order In in the menu) ──
const delQ = gg.match(/id:\s*"delivery",\s*label:\s*"Delivery",\s*query:\s*"([^"]+)"/);
ok(!!delQ, "food has a Delivery subfilter");
ok(delQ && /delivery/i.test(delQ[1]) && /takeout/i.test(delQ[1]), "delivery query asks for delivery + takeout (got: " + (delQ && delQ[1]) + ")");
const foodBlock = (gg.match(/food:\s*\[([\s\S]*?)\]/) || [])[1] || "";
ok(/quickbites/.test(foodBlock) && /delivery/.test(foodBlock), "Delivery sits in the Food subfilter row with Quick bites");

console.log(`test-subfilters: OK — ${pass} assertions (tours honest, water sports first-class, Delivery in the Food menu)`);
