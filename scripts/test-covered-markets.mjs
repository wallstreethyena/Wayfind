#!/usr/bin/env node
// scripts/test-covered-markets.mjs — locks the COVERED vs PUBLISHED split in
// lib/landingCities.js (2026-10-01).
//
// Owner report: typing "saint pete" in the search box offered only a
// restaurant named "Saint Pete Salt Room" — never the city — and Jacksonville,
// Pensacola, Tallahassee, Destin and Naples readers got the out-of-coverage
// homepage. Cause: LANDING_CITIES was the ONLY city table, so a city with
// owned inventory but no published landing page did not exist to search, the
// Location box, or /api/rails.
//
// What this proves, by CALLING the code (not grepping it):
//   1. every covered market is a Florida city, distinct from the published set;
//   2. search suggests it by name and by alias (the reported "saint pete");
//   3. the Location box resolves it locally (no provider call);
//   4. /api/rails' resolver lands a reader in the market on the market itself;
//   5. the rail loader accepts the slug (not the honest-empty branch);
//   6. a market mints NO page link, NO page route param, NO sitemap URL;
//   7. Panhandle markets get Central time.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANDING_CITIES, MARKET_CITIES, COVERED_CITIES, CITY_ALIASES } from "../lib/landingCities.js";
import { localCitySuggestions } from "../lib/searchExperience.js";
import { knownCityGeocode } from "../lib/knownCityGeocode.js";
import { splitCityQualifier } from "../lib/directSearch.js";
import { nearestCoveredCity, COVERAGE_MI } from "../lib/railCoverage.js";
import { resolveRailCity } from "../lib/locationHonesty.js";
import { railHref } from "../lib/dayparts.js";
import { tzForPoint } from "../lib/nowContext.js";

let asserts = 0;
const ok = (cond, msg) => { asserts++; assert.ok(cond, msg); };
const markets = Object.entries(MARKET_CITIES);

// 1. Shape. A market that is also a landing slug would be published twice over.
ok(markets.length >= 20, `the major Florida markets are covered (found ${markets.length})`);
for (const [slug, city] of markets) {
  ok(!LANDING_CITIES[slug], `${slug} is a market OR a published city, never both`);
  ok(city.state === "FL" && city.lat > 24 && city.lat < 31.1 && city.lng > -87.7 && city.lng < -79.9, `${slug} is a Florida point`);
  ok(COVERED_CITIES[slug] === city, `${slug} is in COVERED_CITIES`);
}
for (const slug of Object.keys(LANDING_CITIES)) ok(COVERED_CITIES[slug] === LANDING_CITIES[slug], `published ${slug} stays covered`);
for (const slug of Object.keys(CITY_ALIASES)) ok(!!COVERED_CITIES[slug], `alias owner ${slug} is a covered city`);

// 2. Search suggestions — the reported query first.
for (const query of ["saint pete", "Saint Pete", "St. Pete", "st pete, fl", "St. Petersburg, Florida"]) {
  ok(localCitySuggestions(query)[0]?.placeId === "city:st-petersburg", `"${query}" suggests St. Petersburg`);
}
for (const [slug, city] of markets) {
  const hit = localCitySuggestions(`${city.name}, ${city.state}`);
  ok(hit.length === 1 && hit[0].placeId === `city:${slug}` && hit[0].city.lat === city.lat, `${city.name}, FL suggests exactly ${slug}`);
}
for (const [slug, aliases] of Object.entries(CITY_ALIASES)) {
  for (const alias of aliases) ok(localCitySuggestions(alias).some((c) => c.placeId === `city:${slug}`), `alias "${alias}" suggests ${slug}`);
}
// Negative controls: an explicit other state or country never borrows a Florida market.
for (const query of ["Naples, Italy", "Jacksonville, NC", "Hollywood, CA", "Melbourne Australia", "Destin TX"]) {
  ok(localCitySuggestions(query).length === 0, `"${query}" is not a Florida market`);
  ok(knownCityGeocode(query) === null, `"${query}" does not geocode to a Florida market`);
}

// 3. Location box: exact, local, no provider.
ok(knownCityGeocode("st pete")?.lat === MARKET_CITIES["st-petersburg"].lat, "the Location box resolves 'st pete' locally");
ok(knownCityGeocode("Jacksonville, FL")?.isArea === true, "the Location box resolves Jacksonville as an area");
ok(knownCityGeocode("Saint Pete Salt Room") === null, "a business containing a city alias is not the city");

// Server search: a trailing market qualifies the query to that city.
ok(splitCityQualifier("pizza st pete").city?.name === "St. Petersburg", "\"pizza st pete\" scopes to St. Petersburg");
ok(splitCityQualifier("pizza st pete").text === "pizza", "the qualifier is stripped from the venue text");

// 4. Feed resolution — the reader standing in each market gets that market.
for (const [slug, city] of markets) {
  ok(nearestCoveredCity(COVERED_CITIES, city.lat, city.lng, COVERAGE_MI) === slug, `a reader in ${city.name} resolves to ${slug}`);
}
// Positive control on the defect: before this table, these readers were out of coverage or borrowed a neighbour.
ok(nearestCoveredCity(LANDING_CITIES, MARKET_CITIES.jacksonville.lat, MARKET_CITIES.jacksonville.lng, COVERAGE_MI) === null, "control: LANDING_CITIES alone leaves Jacksonville uncovered");
ok(nearestCoveredCity(LANDING_CITIES, MARKET_CITIES["st-petersburg"].lat, MARKET_CITIES["st-petersburg"].lng, COVERAGE_MI) === "tampa", "control: LANDING_CITIES alone hands St. Pete readers Tampa");
// Out of state stays out of coverage.
ok(nearestCoveredCity(COVERED_CITIES, 33.749, -84.388, COVERAGE_MI) === null, "Atlanta is still out of coverage");

// 5. Rail loader accepts a market slug (lib/railsData.js railMenuData's first line).
ok(resolveRailCity("jacksonville", COVERED_CITIES) === "jacksonville", "railMenuData resolves a market slug");
const railsSrc = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
ok(/resolveRailCity\(citySlug, COVERED_CITIES\)/.test(railsSrc), "railMenuData resolves over COVERED_CITIES");
ok(/rankedForCenter\(cat, COVERED_CITIES\[city\], opts, city\)/.test(railsSrc), "a market ranks its own centre (rankedFor() resolves published slugs only)");
// Every rails rank call is inventoryOnly — a market feed never reaches Google.
const rankCalls = [...railsSrc.matchAll(/rank\(cat, city, \{([^}]*)\}/g)];
ok(rankCalls.length >= 1 && rankCalls.every((m) => /inventoryOnly: true/.test(m[1])), `every rails rank call is inventoryOnly (${rankCalls.length} found)`);

// 6. No page for a market: no link, no route param, no sitemap URL.
for (const href of ["/things-to-do", "/restaurants", "/nightlife", "/best-beaches"]) {
  ok(railHref({ href }, "fl", "jacksonville") === null, `railHref(${href}) emits no link for a market`);
}
ok(railHref({ href: "/restaurants" }, "fl", "tampa") === "/restaurants/tampa", "control: a published city still links");
const strip = (src) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
for (const route of ["app/things-to-do/[city]/page.js", "app/restaurants/[city]/page.js", "app/nightlife/[city]/page.js", "app/beaches/[city]/page.js", "app/sitemap.js", "app/events/[city]/page.js"]) {
  const src = strip(readFileSync(new URL(`../${route}`, import.meta.url), "utf8"));
  ok(/LANDING_CITIES/.test(src), `${route} reads LANDING_CITIES (positive control)`);
  ok(!/COVERED_CITIES|MARKET_CITIES/.test(src), `${route} never publishes from the covered table`);
}

// 7. Central time on the Panhandle; controls stay Eastern.
for (const slug of ["pensacola", "destin", "panama-city-beach"]) {
  const c = MARKET_CITIES[slug];
  ok(tzForPoint(c.lat, c.lng) === "America/Chicago", `${slug} is Central time`);
}
for (const slug of ["tallahassee", "jacksonville", "st-petersburg"]) {
  const c = MARKET_CITIES[slug];
  ok(tzForPoint(c.lat, c.lng) === "America/New_York", `${slug} stays Eastern`);
}
ok(tzForPoint(29.8119, -85.303) === "America/New_York", "Port St. Joe (Gulf County, Eastern) stays Eastern");

console.log(`test-covered-markets: ${asserts} assertions OK — ${markets.length} Florida markets searchable, geocodable and feed-covered; zero pages minted; Panhandle on Central time`);
