#!/usr/bin/env node
// scripts/check-place-city.mjs — the ONE city ladder every place surface uses.
//
// lib/placeCity.js placeCity() feeds the /places/[id] <title>, the OG hero
// &loc=, the share text, the LocalBusiness PostalAddress addressLocality
// (lib/placeSchema.js) and the card / rail / detail header
// (lib/locationHonesty.js storedPlaceHeader). This guard IMPORTS AND CALLS
// those functions — no source regex — against real rows:
//   - Gatorland: Census locality "Southchase", postal_city "Orlando"
//   - the ten locality/postal_city conflict rows + Scream-A-Geddon
//   - "Gulf Drive" (a bare street) and "Gulf Drive, Florida"
//   - an Atlas street-only address ("6100 N LOCKWOOD RIDGE RD")
// and proves a state, county, ZIP or coverage slug is never a city at any rung.
import { readFileSync } from "node:fs";
import {
  placeCity, placeCityPick, cityOf, cityValue, structuredAddressCity,
  placePageTitle, placeShareText, nameCarriesCity, placeCountyLabel,
} from "../lib/placeCity.js";
import { placePostalAddress, placeLocalBusinessLd } from "../lib/placeSchema.js";
import { storedPlaceHeader, detailLocationLine } from "../lib/locationHonesty.js";

let pass = 0;
const fail = [];
function ok(cond, msg) { if (cond) pass++; else fail.push(msg); }
function eq(got, want, msg) { ok(got === want, `${msg} — want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }

// 0. The module stays import-free: plain-node guards and lib/placeSchema.js load it.
const src = readFileSync(new URL("../lib/placeCity.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
ok(/^\s*import\s/m.test("import { x } from './y.js';"), "positive control: the import probe matches a real import line");
ok(!/^\s*import\s/m.test(src) && !/\brequire\(/.test(src), "lib/placeCity.js must stay import-free");

// 1. A bare street is never a city.
eq(placeCity({ address: "Gulf Drive", locality: "Holmes Beach" }), "Holmes Beach", "street-only address falls to locality");
eq(placeCity({ address: "Gulf Drive" }), null, "a bare street alone is no city");
eq(placeCity({ address: "Gulf Drive, Florida", locality: "Holmes Beach" }), "Holmes Beach", "street + state falls to locality");
eq(placeCity({ address: "Gulf Drive, Florida" }), null, "street + state alone is no city");
eq(cityOf("Gulf Drive, Florida"), null, "cityOf never returns the state or the street");

// 2. Gatorland — the structured address and postal_city agree; locality alone is the Census place.
const GATOR_ADDR = "14501 S Orange Blossom Trl, Orlando, FL 32837, USA";
eq(placeCity({ address: GATOR_ADDR, locality: "Southchase", postal_city: "Orlando" }), "Orlando", "Gatorland with address");
eq(placeCityPick({ address: GATOR_ADDR, locality: "Southchase", postal_city: "Orlando" }).rung, "address", "a structured address is the strongest rung");
eq(placeCity({ locality: "Southchase", postal_city: "Orlando" }), "Orlando", "Gatorland without address -> postal_city");
eq(placeCity({ locality: "Southchase", postalCity: "Orlando" }), "Orlando", "postalCity (camel) is read too");
eq(placeCity({ locality: "Southchase" }), "Southchase", "Gatorland with only locality -> Census place");
eq(structuredAddressCity("14501 S Orange Blossom Trl, Orlando, Florida 32837"), "Orlando", "a full state name fills the state slot");
eq(structuredAddressCity("180 Greenwich St, New York, NY"), "New York", "a 2-letter slot wins over a city that shares a state name");

// 3. The ten conflict rows: Census locality vs verified postal city, no address -> postal city.
const CONFLICTS = [
  ["Gulf Breeze Zoo", "Woodlawn Beach", "Gulf Breeze"],
  ["Mercato", "Pelican Marsh", "Naples"],
  ["KEG Social Orlando", "Alafaya", "Orlando"],
  ["Gatorland", "Southchase", "Orlando"],
  ["Children's Planet", "Edgewood", "Orlando"],
  ["American Social Orlando", "Doctor Phillips", "Orlando"],
  ["1912 Ocean Bar & Rooftop", "Sawgrass", "Ponte Vedra Beach"],
  ["Riverview Performing Arts Center", "Ridge Wood Heights", "Sarasota"],
  ["World Golf Village Renaissance", "World Golf Village", "St. Augustine"],
  ["Downtown Wellen Park", "North Port", "Venice"],
];
ok(CONFLICTS.length === 10, "all ten conflict rows are covered");
for (const [name, locality, postal] of CONFLICTS) {
  const row = { name, locality, postal_city: postal, county: "X" };
  eq(placeCity(row), postal, `${name}: postal_city outranks the Census locality`);
  eq(placePageTitle(row), nameCarriesCity(name, postal) ? `${name} | Wayfind` : `${name} in ${postal} | Wayfind`, `${name}: title names the postal city (unless the name already does)`);
  eq(placePostalAddress(row)?.addressLocality, postal, `${name}: PostalAddress addressLocality is the same postal city`);
}
const scream = { name: "Scream-A-Geddon", locality: null, county: "Pasco", postal_city: "Dade City", metro: "tampa-bay" };
eq(placeCity(scream), "Dade City", "Scream-A-Geddon: postal_city with no locality");

// 4. Negatives — never a city at any rung.
const NEVER = ["Pasco County", "33525", "manatee-sarasota", "florida", "Florida", "FL", "USA", "tampa-bay"];
for (const bad of NEVER) {
  eq(cityValue(bad), null, `cityValue rejects "${bad}"`);
  eq(placeCity({ postal_city: bad }), null, `postal_city "${bad}" is not a city`);
  eq(placeCity({ locality: bad }), null, `locality "${bad}" is not a city`);
  eq(placeCity({ guideCity: bad }), null, `guide city "${bad}" is not a city`);
  eq(placeCity({ address: bad }), null, `address "${bad}" is not a city`);
  eq(placeCity({ address: `1 Main St, ${bad}, FL 34205, USA` }), null, `structured slot "${bad}" is not a city`);
}
eq(placeCity({ address: "123 Main St, FL, USA" }), null, "a state can never fill the city slot");
eq(placeCity({ guideCity: "Florida" }), null, "a statewide guide region is not a city");
eq(placeCity({ guideCity: "Key West" }), "Key West", "a guide region that is a real city still counts");
eq(placeCity({ metro: "orlando", county: "Orange County" }), null, "metro and county are never read as a city");
eq(placeCity({ address: "6100 N LOCKWOOD RIDGE RD", locality: "Sarasota" }), "Sarasota", "Atlas street-only address falls to locality");
eq(cityOf("6100 N LOCKWOOD RIDGE RD"), null, "a street-only Atlas address alone is no city");
for (const real of ["St. Augustine", "Port St. Lucie", "Lake Placid", "Ponte Vedra Beach", "Town 'n' Country", "Holmes Beach"]) {
  eq(cityValue(real), real, `"${real}" stays a city`);
}
for (const street of ["Gulf Drive", "Main St", "Ocean Blvd", "Orange Blossom Trl", "Palm Coast Pkwy", "Boulevard of the Arts", "Sunset Way"]) {
  eq(cityValue(street), null, `"${street}" is a street, not a city`);
}

// 5. Every consumer renders cleanly with no city.
const bare = { name: "Children's Planet" };
eq(placePageTitle(bare), "Children's Planet | Wayfind", "no city -> no dangling \" in \" in the title");
eq(placeShareText(bare), "Children's Planet. Found on Wayfind.", "no city -> clean share text");
eq(placePageTitle({ name: "Children's Planet", guideCity: "Florida" }), "Children's Planet | Wayfind", "a state never reaches the title");
eq(placePostalAddress(bare), undefined, "no address and no city -> no PostalAddress");
eq(placeLocalBusinessLd({ name: "X", guideCity: "Florida" }, "https://x.test").address, undefined, "LocalBusiness never claims addressLocality Florida");
const full = placePostalAddress({ address: GATOR_ADDR, locality: "Southchase", postal_city: "Orlando" });
ok(full && full.streetAddress === "14501 S Orange Blossom Trl" && full.addressLocality === "Orlando" && full.addressRegion === "FL"
  && full.postalCode === "32837" && full.addressCountry === "US", `full Gatorland PostalAddress — got ${JSON.stringify(full)}`);
const streetOnly = placePostalAddress({ address: "6100 N LOCKWOOD RIDGE RD", locality: "Sarasota" });
ok(streetOnly && streetOnly.addressLocality === "Sarasota" && !("addressCountry" in streetOnly) && !("addressRegion" in streetOnly),
  `street-only PostalAddress claims only held parts — got ${JSON.stringify(streetOnly)}`);

// 6. Card / detail headers share the ladder: postal city before Census locality,
// stored city before the nearest-covered-city fallback.
const ORL = { lat: 28.3554, lng: -81.4026 };
eq(storedPlaceHeader({ ...ORL, locality: "Southchase", postal_city: "Orlando" }), "Orlando, FL", "Gatorland header names the postal city");
eq(storedPlaceHeader({ ...ORL, locality: "Southchase" }), "Southchase, FL", "locality alone still heads the card");
eq(storedPlaceHeader({ ...ORL, city: "florida" }), "", "a coverage slug never heads a card");
eq(detailLocationLine({ lat: 27.47, lng: -82.70, address: "Gulf Drive", locality: "Holmes Beach" }), "Holmes Beach, FL", "detail line: a bare street yields to the stored city");

// 2026-11-04 live check: "Holmes Beach in Holmes Beach". A name that already
// names the city drops the "in <City>" prose; the PostalAddress keeps it.
eq(placePageTitle({ name: "Holmes Beach", locality: "Holmes Beach" }), "Holmes Beach | Wayfind", "a beach named after its town does not repeat the town");
eq(placeShareText({ name: "Holmes Beach", locality: "Holmes Beach" }), "Holmes Beach. Found on Wayfind.", "share text drops the repeat too");
eq(placePageTitle({ name: "KEG SOCIAL ORLANDO - Dining & Entertainment", postal_city: "Orlando" }), "KEG SOCIAL ORLANDO - Dining & Entertainment | Wayfind", "a name carrying its city (any case) does not repeat it");
eq(placePageTitle({ name: "World Golf Village Renaissance St. Augustine Resort", postal_city: "St. Augustine" }), "World Golf Village Renaissance St. Augustine Resort | Wayfind", "St./Saint spelling is the same city");
eq(placePageTitle({ name: "Scream-A-Geddon Horror Park", postal_city: "Dade City" }), "Scream-A-Geddon Horror Park in Dade City | Wayfind", "a name without the city keeps it");
eq(placePageTitle({ name: "Sarasotan Cafe", locality: "Sarasota" }), "Sarasotan Cafe in Sarasota | Wayfind", "only whole words count: Sarasotan is not Sarasota");
ok(nameCarriesCity("Holmes Beach", "Holmes Beach") && !nameCarriesCity("Gatorland", "Orlando") && !nameCarriesCity("x", ""), "nameCarriesCity: whole-word match, empty city never matches");
eq(placePostalAddress({ name: "Holmes Beach", locality: "Holmes Beach" })?.addressLocality, "Holmes Beach", "the PostalAddress still names the city");
// The page model gets the inventory city even when its skeleton is the
// wf_place_ids index row (which has neither field): source check on the one
// place that fills it, because loadPlace needs a live database to execute.
{
  const src = readFileSync(new URL("../lib/placeData.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/if \(page && !page\.postalCity && !page\.inventoryCity\) \{[\s\S]{0,200}const row = inv \|\| await getInventoryIdentity\(id\);[\s\S]{0,200}page\.postalCity = row\.postal_city;[\s\S]{0,120}page\.inventoryCity = row\.locality;/.test(src), "loadPlace fills postalCity/inventoryCity from wf_inventory when the skeleton lacks them (STRUCTURAL: loadPlace needs a live database)");
}

// ── County fallback (2026-11-12): an unincorporated place says its COUNTY, as a county ──
// ~3,066 Florida rows sit in no city per the Census (county set, locality empty).
// Their title said nothing ("The Grove at Wesley Chapel | Wayfind"). The title and
// share text now say "in Pasco County, FL"; the PostalAddress locality never does.
const uninc = { name: "The Grove at Wesley Chapel", locality: null, postal_city: null, county: "Pasco" };
eq(placeCity(uninc), null, "county fallback: a county is still never a city");
eq(placeCountyLabel(uninc), "Pasco County, FL", "county fallback: the county is named as a county");
eq(placePageTitle(uninc), "The Grove at Wesley Chapel in Pasco County, FL | Wayfind", "county fallback: title names the county when no city is held");
eq(placeShareText(uninc), "The Grove at Wesley Chapel in Pasco County, FL. Found on Wayfind.", "county fallback: share text names the county");
eq(placePageTitle({ name: "Gatcha", inventoryCounty: "Orange" }), "Gatcha in Orange County, FL | Wayfind", "county fallback: the page's inventoryCounty field is read");
eq(placePageTitle({ name: "X", county: "Miami-Dade County" }), "X in Miami-Dade County, FL | Wayfind", "county fallback: a stored ' County' suffix is not doubled");
eq(placePageTitle({ name: "Y", county: "St. Lucie" }), "Y in St. Lucie County, FL | Wayfind", "county fallback: punctuation in a real county survives");
eq(placePageTitle({ name: "Scream-A-Geddon", county: "Pasco", postal_city: "Dade City" }), "Scream-A-Geddon in Dade City | Wayfind", "county fallback: a real city always wins over the county");
eq(placePageTitle({ name: "Z", county: "Kings" }), "Z | Wayfind", "county fallback: a county outside Florida's 67 is never shown");
eq(placePageTitle({ name: "Z", county: "orlando" }), "Z | Wayfind", "county fallback: a metro slug is never shown as a county");
eq(placeCountyLabel(null), null, "county fallback: no place, no label");
{
  const pa = placePostalAddress(uninc);
  ok(!pa || !/county/i.test(JSON.stringify(pa)), "county fallback: PostalAddress never carries the county as a locality");
}
if (fail.length) {
  console.error(`check-place-city: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-place-city: ${pass} passed — one city ladder (address -> postal_city -> locality -> guide) across title, share, PostalAddress and headers; ${CONFLICTS.length + 1} real conflict rows, ${NEVER.length} never-a-city values at 6 rungs each`);
