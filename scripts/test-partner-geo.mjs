// scripts/test-partner-geo.mjs — partner/affiliate city rails use dest ID or
// coordinates, never title tokens. The live leak: NYC events included
// "The Big Apple Coaster / Mad Apple at New York New York Hotel and Casino"
// (Las Vegas, Viator d684) because city mode admitted title.includes("york").
import { readFileSync } from "fs";
import { offerBelongsToRequestedCity, filterOffersForCity } from "../lib/partnerGeo.js";
import { MARKETS } from "../lib/destinations.js";
import { coarseCat, venueLean } from "../lib/ranking.js";
import { primaryCategory, classify } from "../lib/placeCategory.js";

let pass = 0;
const fail = (m) => { console.error("test-partner-geo: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const NYC = { destId: MARKETS.nyc.viator.id, lat: MARKETS.nyc.lat, lng: MARKETS.nyc.lng };
const VEGAS = { destId: MARKETS.lasvegas.viator.id, lat: MARKETS.lasvegas.lat, lng: MARKETS.lasvegas.lng };

ok(NYC.destId === "d687" && VEGAS.destId === "d684", "NYC d687 and Las Vegas d684 stay the verified dest ids");

const vegasNyny = {
  title: "The Big Apple Coaster / Mad Apple at New York New York Hotel and Casino",
  destinations: [{ ref: "d684" }],
  lat: 36.102, lng: -115.174,
};

ok(offerBelongsToRequestedCity(vegasNyny, NYC) === false,
  "a Vegas New York New York product must not appear in a New York City events/experiences rail");
ok(offerBelongsToRequestedCity(vegasNyny, VEGAS) === true,
  "the same product is admitted in Las Vegas by dest id");

ok(offerBelongsToRequestedCity({
  title: "The Big Apple Coaster / Mad Apple at New York New York Hotel and Casino",
}, NYC) === false,
  "title-only (no dest id, no coords) fails closed — never title-token match");

ok(offerBelongsToRequestedCity({
  title: "Statue of Liberty and Ellis Island Tour",
  destinations: [{ ref: "d687" }],
}, NYC) === true,
  "a real NYC dest-id product is admitted even if the title is unrelated to tokens");

ok(offerBelongsToRequestedCity({
  title: "Helicopter over Manhattan",
  lat: 40.758, lng: -73.985,
}, NYC) === true,
  "coords inside the NYC radius admit when dest id is missing");

ok(offerBelongsToRequestedCity({
  title: "Grand Canyon day trip from New York New York",
  lat: 36.102, lng: -115.174,
}, NYC) === false,
  "Vegas coords + NYC request hide the affiliate (organic city and offer city disagree)");

ok(filterOffersForCity([vegasNyny, { title: "NYC walking tour", destinations: [{ destinationId: "687" }] }], NYC).length === 1
  && filterOffersForCity([vegasNyny], NYC).length === 0,
  "rail filter drops the Vegas product and keeps the NYC dest-id product");

const route = readFileSync(new URL("../app/api/viator/tours/route.js", import.meta.url), "utf8");
ok(/offerBelongsToRequestedCity/.test(route), "city-mode tours route calls the shared geo gate");
ok(!/nameOk/.test(route), "title-token nameOk admission is gone from the tours route");
ok(!/regionTokens\.some\(\(t\) => title\.includes\(t\)\)/.test(route),
  "city mode must not admit on title.includes(region token)");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/MARKETS\[mk\.key\]/.test(home), "city-mode dest lookup uses marketForLocation().key, not the object as a map key");
ok(!/MARKETS\[mk\] && MARKETS\[mk\]\.viator/.test(home), "the MARKETS[{key,mi}] miss that dropped destId is gone");

// WF-008 — One World Observatory must not get Food / coffee treatment.
const owo = { name: "One World Observatory", types: ["cafe", "restaurant", "tourist_attraction", "observation_deck"] };
ok(primaryCategory(owo) !== "Food", "classifier: One World Observatory is not Food");
ok(classify(owo).section !== "Food", "classify(): One World Observatory is not Food");
ok(coarseCat(owo) !== "Food", "coarseCat: One World Observatory is not Food (food keywords must not beat observation identity)");
ok(venueLean(owo).lean !== "indoor" || coarseCat(owo) === "Activities",
  "observation identity is not given cafe/coffee indoor treatment before ranking");
ok(primaryCategory(owo) === "Activities" || primaryCategory(owo) == null,
  "One World Observatory uses Activities or a neutral/excluded category, never Food");

console.log(`test-partner-geo: OK — ${pass} assertions (Vegas NYNY blocked from NYC; dest/coords only; One World not Food)`);
