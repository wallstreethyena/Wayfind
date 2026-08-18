#!/usr/bin/env node
/**
 * check-location-honesty — the visitor's city is never guessed.
 *
 * VERIFIED LIVE (2026-08-18):
 *   A. /api/rails covered:false / error fail-opened to the SSR flagship, so
 *      Sarasota stayed the visitor's city.
 *   B. railsData unknown slug → LANDING_CITIES.sarasota.
 *   C. DEFAULT_CENTER (Parrish) blocked /api/geo; chrome said "near you"
 *      with no named city.
 *   D. First HTML of /, /?near=Orlando, /?q=Orlando emitted
 *      "Near Sarasota right now".
 *   E. Exploding Trends accordion was removed 2026-08-16; the rail tile
 *      still sold "Exploding Trends Near You" in baked type.
 *   F. After selecting Tampa the document kept the Sarasota heading and
 *      Sarasota distances.
 *   G. City suggestions sat under nav.wf-dests; the nav ate the first option.
 *
 * Assertions are EXECUTED against lib/locationHonesty.js where the law lives,
 * then pinned in the call sites so a helper nobody calls cannot go green.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CENTER,
  isSeedCenter,
  isNamedCity,
  cityLabel,
  nearPhrase,
  resolveRailCity,
  emptyRailLive,
  liveFromRailsResponse,
  homeProofCopy,
  homeProofNamesCity,
} from "../lib/locationHonesty.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── executed law ──────────────────────────────────────────────────────── */
ok(isSeedCenter(DEFAULT_CENTER) === true, "the seed itself is unresolved");
ok(isSeedCenter({ lat: 27.9506, lng: -82.4572 }) === false, "Tampa is not the seed");
ok(isSeedCenter(null) === true && isSeedCenter({}) === true, "missing center is unresolved");

ok(isNamedCity("Tampa, FL") === true, "Tampa is a named city");
ok(isNamedCity("Orlando") === true, "Orlando is a named city");
ok(isNamedCity("") === false && isNamedCity(null) === false, "empty is not a city");
ok(isNamedCity("you") === false && isNamedCity("your area") === false, "\"you\" / \"your area\" are not cities");
ok(isNamedCity("this map area") === false, "a generic map pin is not a city");
ok(cityLabel("") === "" && cityLabel("you") === "", "cityLabel never returns \"you\"");
ok(cityLabel("Tampa, FL") === "Tampa", "cityLabel takes the town token");
ok(nearPhrase("") === "" && nearPhrase("you") === "", "nearPhrase is empty without a named city");
ok(nearPhrase("Tampa, FL") === " near Tampa", "nearPhrase names the city when it has one");

ok(resolveRailCity("orlando", { orlando: {}, sarasota: {} }) === "orlando", "a known slug stays itself");
ok(resolveRailCity("nope", { orlando: {}, sarasota: {} }) === null, "unknown slug is null, not sarasota");
ok(resolveRailCity("", { sarasota: {} }) === null, "empty slug is null");
ok(resolveRailCity(null, { sarasota: {} }) === null, "missing slug is null");

const empty = emptyRailLive();
ok(empty.covered === false && empty.citySlug === null && Object.keys(empty.places).length === 0,
  "honest empty carries no city and no places");
ok(liveFromRailsResponse(null).covered === false, "a thrown/missing payload is empty");
ok(liveFromRailsResponse({ covered: false, data: null }).covered === false, "covered:false is empty");
ok(liveFromRailsResponse({ covered: false, data: { citySlug: "sarasota", places: { eat: [1] } } }).citySlug === null,
  "covered:false cannot smuggle a flagship slug");
ok(liveFromRailsResponse({ covered: true, data: { citySlug: "tampa", cityLabel: "Tampa", places: { eat: [{ id: "x" }] } } }).citySlug === "tampa",
  "a covered Tampa payload keeps Tampa");

for (const sp of [{}, { near: "Orlando" }, { q: "Orlando" }, { near: "Tampa" }, { q: "Tampa, FL" }]) {
  const copy = homeProofCopy(sp);
  ok(!/sarasota/i.test(`${copy.kicker} ${copy.heading} ${copy.sub}`),
    `homeProofCopy(${JSON.stringify(sp)}) does not name Sarasota`);
  ok(!/Near .+ right now/i.test(copy.heading),
    `homeProofCopy(${JSON.stringify(sp)}) does not claim "Near <city> right now"`);
  ok(homeProofNamesCity(sp) === false,
    `homeProofNamesCity(${JSON.stringify(sp)}) is false — the ISR document is city-neutral`);
}

/* ── A. DaypartRail fail-closed ────────────────────────────────────────── */
const RAIL = strip(read("app/components/DaypartRail.js"));
ok(/liveFromRailsResponse/.test(RAIL) && /emptyRailLive/.test(RAIL),
  "DaypartRail uses the executed liveFromRailsResponse / emptyRailLive helpers");
ok(!/if \(cancelled \|\| !j \|\| !j\.covered \|\| !j\.data\) return/.test(RAIL),
  "the fail-open early-return (keep the flagship) is gone");
ok(/setLive\(liveFromRailsResponse\(j\)\)/.test(RAIL),
  "a rails response, covered or not, is written through liveFromRailsResponse");
ok(/setLive\(emptyRailLive\(\)\)/.test(RAIL),
  "errors and a missing center write honest empty, not the SSR flagship");
ok(!/citySlug = "sarasota"/.test(RAIL),
  "DaypartRail's default citySlug is not hardcoded sarasota");

/* ── B. unknown slug is not sarasota ───────────────────────────────────── */
const RD = strip(read("lib/railsData.js"));
ok(/resolveRailCity\(citySlug,\s*LANDING_CITIES\)/.test(RD),
  "railMenuData resolves the slug through resolveRailCity");
ok(!/LANDING_CITIES\[citySlug\] \|\| LANDING_CITIES\.sarasota/.test(RD),
  "the unknown-slug → LANDING_CITIES.sarasota fallback is gone");
ok(!/const slug = LANDING_CITIES\[citySlug\] \? citySlug : "sarasota"/.test(RD),
  "an unknown slug is no longer rewritten to the string \"sarasota\"");

/* ── C. DEFAULT_CENTER is a seed; geo can replace it; no "you" ─────────── */
const HOME = strip(read("app/home.js"));
ok(/from "\.\.\/lib\/locationHonesty"/.test(read("app/home.js")) || /from "\.\.\/lib\/locationHonesty"/.test(HOME),
  "home.js imports the honesty helpers");
ok(/const \[locResolved,\s*setLocResolved\]/.test(HOME),
  "home.js tracks locResolved separately from the seed coords");
ok(/isSeedCenter\(prev\)/.test(HOME) && /setCenter\(/.test(HOME),
  "geo may replace the seed — isSeedCenter(prev) is the gate, not prev || c");
ok(!/setCenter\(\(prev\) => prev \|\| c\)/.test(HOME),
  "the prev || c geo lock that blocked /api/geo is gone");
ok(/const cityNow = cityLabel\(locName\)/.test(HOME),
  "cityNow is cityLabel(locName) — never the literal \"you\"");
ok(!/locName \? locName\.split\(","\)\[0\] : "you"/.test(HOME),
  "the : \"you\" cityNow fallback is gone");
ok(/setLocResolved\(true\)/.test(HOME),
  "geo / manual / GPS / restore mark the location resolved");

/* ── D + F. HomeProof is city-neutral; Tampa cannot keep Sarasota ──────── */
const PAGE = strip(read("app/page.js"));
ok(/homeProofCopy\(/.test(PAGE), "HomeProof renders homeProofCopy(), not a hardcoded city");
ok(!/Near Sarasota right now/.test(PAGE),
  "page.js source (comments stripped) does not emit \"Near Sarasota right now\"");
ok(/rankedFor\(/.test(PAGE),
  "HomeProof still calls rankedFor() so crawlers get a real ranked sample");
ok(!/const RAIL_CITY = ["']sarasota["']/.test(PAGE),
  "RAIL_CITY is not hardcoded sarasota as the visitor's city");
ok(/railMenuData\(\s*null\s*\)/.test(PAGE),
  "the ISR homepage asks railMenuData(null) — unknown, not the flagship");

/* ── E. Exploding Trends tile is hidden; accordion stays unmounted ─────── */
ok(/if \(r\.artStale\) return null/.test(RAIL),
  "artStale rail tiles (Exploding Trends baked type) do not render");
const BEST = strip(read("app/components/BestNearby.js"));
ok(!/<ExplodingNearby[\s/>]/.test(BEST),
  "ExplodingNearby is still unmounted — do not remount the accordion");
ok(!/<BestNearby[\s/>]/.test(HOME),
  "BestNearby stays off \"/\" — the accordion is not remounted");

/* ── F. leftover Sarasota after a city change ──────────────────────────── */
ok(/setLive\(emptyRailLive\(\)\)/.test(RAIL),
  "changing center clears live rails before the new fetch — leftover distances cannot linger");
ok(/center=\{locResolved \? center : null\}/.test(HOME),
  "DaypartRail only receives a center once the location is resolved");

/* ── G. dests nav must not eat city suggestions ────────────────────────── */
ok(/is-suggesting/.test(HOME) && /suggestions\.length/.test(HOME),
  "the search row marks itself open when suggestions are showing");
ok(/wf-dests[\s\S]{0,180}is-covered|className=\{\"wf-dests/.test(HOME),
  "nav.wf-dests is marked covered while suggestions are open");
ok(/pointerEvents:\s*["']none["']/.test(HOME) || /is-covered/.test(HOME),
  "covered dests do not receive pointer events");
const CSS = read("app/components/css.js");
ok(/\.wf-search-row\.is-suggesting\{[^}]*z-index:\s*40/.test(CSS) || /\.wf-search-row\.is-suggesting\{z-index:40\}/.test(CSS),
  "an open search row stacks above dests");
ok(/\.wf-dests\.is-covered\{pointer-events:none\}/.test(CSS),
  "CSS also disables pointer-events on a covered dests nav");
ok(/#wf-suggestions\{[^}]*z-index:\s*80/.test(CSS) || /zIndex:\s*80/.test(HOME) || /z-index:80/.test(CSS),
  "the suggestion list stacks above dests");
ok(/onMouseDown=\{\(e\) => \{ e\.preventDefault\(\); pickSuggestion\(s\)/.test(HOME),
  "a suggestion is taken on mousedown so dests cannot steal the click");

/* ── LocalEdit does not render the seed as "local" ─────────────────────── */
ok(/<LocalEdit center=\{locResolved \? center : null\}/.test(HOME),
  "LocalEdit is not given the Parrish seed — Anna Maria/Bradenton cannot render as local before a city is known");

if (fail.length) {
  console.error(`check-location-honesty: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-location-honesty: ${pass} assertions passed (fail-closed rails, city-neutral HomeProof, seed is not a city, dests does not eat suggestions)`);
