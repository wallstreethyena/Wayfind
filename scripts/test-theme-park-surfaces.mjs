#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { themeParkIntent } from "../lib/themeParks.js";
import { placeAllowed } from "../lib/placeFilter.js";
import { chipCommerce } from "../lib/browseCommerceMap.js";

assert.equal(themeParkIntent("Universal Epic Universe")?.park?.key, "epic_universe",
  "the real search resolver identifies Epic Universe exactly");
assert.equal(themeParkIntent("Disney parks")?.operator, "disney",
  "the real search resolver identifies the Disney park set");
assert.equal(placeAllowed("attractions", "themeparks", { name: "Magic Kingdom Park", primaryType: "theme_park", types: ["theme_park"] }), true,
  "the real chip filter admits a typed park");
assert.equal(placeAllowed("attractions", "themeparks", { name: "Theme Park Hotel", primaryType: "hotel", types: ["hotel"] }), false,
  "the real chip filter refuses a misleading hotel name");
assert.deepEqual(chipCommerce("attractions", "themeparks"), {
  key: "attractions:themeparks", catalogs: ["theme"], concepts: ["family"],
  catalogParam: "theme,concept:family", query: "theme park tickets", fullCatalog: false, known: true, noExperiences: false,
}, "the real commerce planner keeps Theme Parks on its declared ticket catalogs");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const family = readFileSync(new URL("../app/components/FamilyDayPage.js", import.meta.url), "utf8");
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const filters = readFileSync(new URL("../lib/placeFilter.js", import.meta.url), "utf8");
const commerce = readFileSync(new URL("../lib/browseCommerceMap.js", import.meta.url), "utf8");

assert.match(home, /nextDynamic\(\(\) => import\("\.\/components\/ThemeParkRail"\)/,
  "the statewide rail stays in its own client chunk");
assert.ok(home.indexOf("<HomeAffiliateActivityRail") < home.indexOf('<ThemeParkRail\n                        mode="flagship"'),
  "the homepage keeps Bookable near the reader first, then Florida's Biggest Parks");
assert.match(home, /browseCat === "family" && <ThemeParkRail mode="family"/,
  "Family browse has the permanent park rail");
assert.match(home, /browseCat === "attractions" && \(!sub \|\| sub === "all" \|\| sub === "themeparks"\) && <ThemeParkRail/,
  "Activities All and Theme Parks have the park rail");
assert.match(home, /Culture\.resolveMetro\(locName\) === "orlando" \? "orlando" : "flagship"/,
  "Orlando uses its dedicated park mode while other cities keep the honest Florida label");

const intentIndex = home.indexOf("const parkIntent = themeParkIntent(q)");
const areaIndex = home.indexOf("const area = await geoTry(q)", intentIndex);
assert.ok(intentIndex > 0 && areaIndex > intentIndex,
  "theme park intent resolves before the generic area and nearby search ladder");
assert.match(home, /parkIntent\.kind === "exact"[\s\S]{0,180}openDetail\(parkRows\[0\], "theme_park_search"\)/,
  "an exact park search opens that verified place card directly");
assert.match(home, /parkIntent\.kind === "operator"[\s\S]{0,500}places: parkRows/,
  "Disney, Universal, and broad park searches open the verified scored set");

assert.ok(family.indexOf('<ThemeParkRail mode="family"') < family.indexOf("FAMILY_DAY_RAILS.map"),
  "the dedicated Family page leads its local family rails with Theme Parks");
assert.match(google, /\{ id: "themeparks", label: "Theme Parks", query: "theme parks and amusement parks" \}/,
  "Activities exposes the permanent Theme Parks chip");
assert.match(filters, /TYPE_ONLY_SUBS[^;]+"attractions:themeparks"/,
  "the Theme Parks chip cannot be rescued by a misleading place name");
assert.match(filters, /"attractions:themeparks": \/amusement_park\|theme_park\/i/,
  "the Theme Parks chip requires a real park type");
assert.match(commerce, /"attractions:themeparks": C\(\["theme"\], \["family"\], "theme park tickets"\)/,
  "the Theme Parks chip has its own commerce contract");

console.log("test-theme-park-surfaces: OK — Home, Family, Activities, Orlando, and exact search are wired to the verified park system");
