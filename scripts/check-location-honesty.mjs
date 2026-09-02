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
  landingSlugFromLoc,
  resolveLocationContext,
  locationSurface,
  categoryNavHrefs,
  centerAgreesWithLabel,
  milesBetween,
  cityOriginsWire,
  firstPaintRailOrigin,
} from "../lib/locationHonesty.js";
import { nearestCoveredCity, railDistanceMi } from "../lib/railCoverage.js";

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
ok(landingSlugFromLoc("Orlando, FL") === "orlando", "Orlando maps to the orlando landing slug");
ok(landingSlugFromLoc("Tampa, FL") === "tampa", "Tampa maps to the tampa landing slug");
ok(landingSlugFromLoc("Miami, FL") === "miami", "Miami maps to the miami landing slug");
ok(landingSlugFromLoc("Gulfport, FL") === null, "an unknown town is not silently Sarasota");
ok(landingSlugFromLoc("") === null && landingSlugFromLoc("you") === null, "no named city → no landing slug");

ok(resolveRailCity("orlando", { orlando: {}, sarasota: {} }) === "orlando", "a known slug stays itself");
ok(resolveRailCity("nope", { orlando: {}, sarasota: {} }) === null, "unknown slug is null, not sarasota");
ok(resolveRailCity("", { sarasota: {} }) === null, "empty slug is null");
ok(resolveRailCity(null, { sarasota: {} }) === null, "missing slug is null");

const COVERAGE_FIXTURE = {
  sarasota: { lat: 27.3364, lng: -82.5307 },
  orlando: { lat: 28.5384, lng: -81.3789 },
  miami: { lat: 25.7617, lng: -80.1918 },
};
ok(nearestCoveredCity(COVERAGE_FIXTURE, 25.7617, -80.1918) === "miami",
  "downtown Miami resolves to Miami, not covered:false");
ok(nearestCoveredCity(COVERAGE_FIXTURE, 26.1224, -80.1373) === "miami",
  "Fort Lauderdale is inside the explicit Miami coverage radius");
ok(nearestCoveredCity(COVERAGE_FIXTURE, 24.5551, -81.7800) === null,
  "Key West stays unsupported — adding Miami does not erase the 90-mile boundary");
ok(nearestCoveredCity(COVERAGE_FIXTURE, NaN, -80.19) === null,
  "invalid coordinates never invent a covered city");
ok(railDistanceMi(25.7617, -80.1918, 25.7617, -80.1918) === 0,
  "the coverage distance law is executable");

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
const LANDING = strip(read("lib/landing.js"));
const RAILS_API = strip(read("app/api/rails/route.js"));
ok(/resolveRailCity\(citySlug,\s*LANDING_CITIES\)/.test(RD),
  "railMenuData resolves the slug through resolveRailCity");
ok(!/LANDING_CITIES\[citySlug\] \|\| LANDING_CITIES\.sarasota/.test(RD),
  "the unknown-slug → LANDING_CITIES.sarasota fallback is gone");
ok(!/const slug = LANDING_CITIES\[citySlug\] \? citySlug : "sarasota"/.test(RD),
  "an unknown slug is no longer rewritten to the string \"sarasota\"");
ok(/"miami":\s*\{\s*name:\s*"Miami"/.test(LANDING),
  "Miami is an explicit landing/rail market, backed by its own coordinates");
ok(/miami:\s*\["miami"\]/.test(RD),
  "Miami has its own rail pool and never borrows Orlando or Sarasota");
ok(/nearestCoveredCity\(LANDING_CITIES,\s*lat,\s*lng,\s*COVERAGE_MI\)/.test(RAILS_API),
  "/api/rails calls the executed coverage law");

/* ── C. DEFAULT_CENTER is a seed; geo can replace it; no "you" ─────────── */
const HOME = strip(read("app/home.js"));
ok(/from "\.\.\/lib\/locationHonesty"/.test(read("app/home.js")) || /from "\.\.\/lib\/locationHonesty"/.test(HOME),
  "home.js imports the honesty helpers");
ok(/const \[locResolved,\s*setLocResolved\]/.test(HOME),
  "home.js tracks locResolved separately from the seed coords");
ok(/isSeedCenter\(centerRef\.current\)/.test(HOME) && /setCenter\(/.test(HOME),
  "geo may replace the seed — isSeedCenter(the committed center) is the gate, not prev || c");
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
ok(/if \(r\.artStale \|\| r\.retiredInto\) return null/.test(RAIL),
  "artStale and retired rail tiles do not render");
const BEST = strip(read("app/components/BestNearby.js"));
ok(!/<ExplodingNearby[\s/>]/.test(BEST),
  "ExplodingNearby is still unmounted — do not remount the accordion");
ok(!/<BestNearby[\s/>]/.test(HOME),
  "BestNearby stays off \"/\" — the accordion is not remounted");

/* ── F. leftover Sarasota after a city change ──────────────────────────── */
ok(/setLive\(emptyRailLive\(\)\)/.test(RAIL),
  "changing center clears live rails before the new fetch — leftover distances cannot linger");
ok(/<LocalEdit center=\{locResolved \? center : null\}/.test(HOME),
  "LocalEdit still waits for locResolved — the seed is not a visitor city");
ok(/center=\{railCenter\}/.test(HOME) && /firstPaintRailOrigin\(/.test(HOME),
  "DaypartRail gets firstPaintRailOrigin at first paint so /api/rails does not wait on locResolved");
ok(!/<DaypartRail[\s\S]{0,800}center=\{locResolved \? center : null\}/.test(HOME),
  "DaypartRail no longer waits on locResolved before a rails origin");

/* ── H. THE PAIRING LAW (v8.46) ─────────────────────────────────────────
 * The label and the coordinates are two halves of ONE fact. Measured on the
 * owner's browser 2026-08-23, localStorage.wf_center held
 *   { lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL", manual: true }
 * — a pin outside Gastonia, NORTH CAROLINA under the name of a Florida town
 * 570 miles away. /api/rails answers covered:false there, so every rail on the
 * homepage emptied while the chrome confidently said "Parrish".
 *
 * Executed first, then pinned at every writer and reader of wf_center.
 */
const PARRISH = { lat: 27.5859, lng: -82.4254 };
const GASTONIA = { lat: 35.2619678, lng: -81.126481 };
ok(centerAgreesWithLabel(PARRISH, "Parrish, FL") === true,
  "a Parrish pin under a Parrish label agrees");
ok(centerAgreesWithLabel(GASTONIA, "Parrish, FL") === false,
  "THE BUG: a North Carolina pin under \"Parrish, FL\" is a corrupt pair");
ok(centerAgreesWithLabel({ lat: 27.3364, lng: -82.5307 }, "Parrish, FL") === true,
  "Sarasota coords under a Parrish label still agree — 19mi is the same metro, not corruption");
ok(centerAgreesWithLabel(GASTONIA, "Gulfport, FL") === true,
  "a town we hold no pin for cannot be contradicted — the law never discards on a hunch");
ok(centerAgreesWithLabel(null, "Parrish, FL") === false && centerAgreesWithLabel({}, "Tampa") === false,
  "a missing point is not a location");
{
  const seed = firstPaintRailOrigin({});
  ok(Math.abs(seed.lat - DEFAULT_CENTER.lat) < 1e-6 && Math.abs(seed.lng - DEFAULT_CENTER.lng) < 1e-6,
    "firstPaintRailOrigin with no hint is DEFAULT_CENTER — a fetch origin, not a visitor city");
  const won = firstPaintRailOrigin({ locResolved: true, resolved: { lat: 27.9506, lng: -82.4572 }, prime: DEFAULT_CENTER });
  ok(Math.abs(won.lat - 27.9506) < 1e-6, "a resolved visitor point wins over the seed / prime");
  const corrupt = firstPaintRailOrigin({ locResolved: false, stored: { lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL" } });
  ok(Math.abs(corrupt.lat - DEFAULT_CENTER.lat) < 1e-6,
    "a corrupt wf_center is not a rails origin — pairing law still holds");
}
ok(Math.round(milesBetween(PARRISH, GASTONIA)) > 500,
  "milesBetween measures the real distance the corrupt pair spanned");

// WRITERS. wf_center and wf_recent_locs are only written for a coherent pair —
// guarding the read side alone would let every session re-mint the corruption.
ok(/centerAgreesWithLabel\(center, locName\)[\s\S]{0,240}setLocal\("wf_center"/.test(HOME),
  "wf_center is only written when the label and the coordinates agree");
ok(/centerAgreesWithLabel\(center, locName\)[\s\S]{0,400}wf_recent_locs/.test(HOME),
  "wf_recent_locs is only written when the label and the coordinates agree");

// READERS. Every consumer of the shared pin validates before trusting it.
ok(/centerAgreesWithLabel\(\{ lat: c\.lat, lng: c\.lng \}, c\.loc\)/.test(HOME),
  "home.js validates a restored wf_center pair before applying it");
ok(/centerAgreesWithLabel\(\{ lat: r\.lat, lng: r\.lng \}, r\.loc\)/.test(HOME),
  "home.js drops incoherent rows out of the recent-locations list on hydration");
for (const [rel, why] of [
  // app/order-in/OrderInClient.js was in this list until 2026-08-26 — the
  // page was deleted with Uber Eats (owner directive).
  ["app/components/shareIntentSheet.js", "an invite bakes these coordinates into a link a friend opens"],
]) {
  const SRC = strip(read(rel));
  ok(/wf_center/.test(SRC) ? /centerAgreesWithLabel\(/.test(SRC) : true,
    `${rel} validates the wf_center pair before trusting it — ${why}`);
}

// THE PRE-HYDRATION PRIMER (v8.46.1). app/layout.js reads wf_center before
// React exists, and its `city` param is BOTH a server cache key and the literal
// text query two event providers run — so a corrupt pair asked Google for one
// city's events while the geo providers searched another, and cached the blend.
const LAYOUT = strip(read("app/layout.js"));
ok(/cityOriginsWire\(\)/.test(LAYOUT) && /PAIRING_MAX_MI/.test(LAYOUT),
  "the events primer INTERPOLATES the city pins from lib/locationHonesty — never retyped, so the inline copy cannot drift from the law");
ok(/agrees\(o\)\)c=\{lat:o\.lat/.test(LAYOUT),
  "the events primer only adopts a stored wf_center whose label and coordinates agree");
const wire = cityOriginsWire();
ok(Array.isArray(wire.parrish) && Math.abs(wire.parrish[0] - 27.586) < 0.01,
  "cityOriginsWire carries real pins");
ok(!!wire["siesta-key"] && !!wire["new-york"] && !wire["new york"],
  "cityOriginsWire keys are slugs — the shape the inline script derives from a label");
{
  // EXECUTED against the inline script's own arithmetic, so the copy and the
  // module cannot disagree about the owner's actual record.
  const slug = (l) => String(l || "").split(",")[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const inlineAgrees = (o) => {
    const p = wire[slug(o.loc)];
    if (!p) return true;
    const a = (p[0] - o.lat) * 69, b = (p[1] - o.lng) * 69 * Math.cos((o.lat * Math.PI) / 180);
    return Math.sqrt(a * a + b * b) <= 40;
  };
  ok(inlineAgrees({ lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL" }) === false,
    "the inline primer check rejects the owner's real corrupt record");
  ok(inlineAgrees({ lat: 27.5859, lng: -82.4254, loc: "Parrish, FL" }) === true,
    "the inline primer check keeps a real Parrish pin");
  ok(inlineAgrees({ lat: 35.2619678, lng: -81.126481, loc: "Gulfport, FL" }) === true,
    "the inline primer check cannot contradict a town we hold no pin for");
}

// PRODUCERS. The two known divergence shapes must not come back.
ok(!/setLocName\(\(prev\) => prev \|\| d\.name\)/.test(HOME),
  "ipFallback no longer moves the NAME under a different condition than the CENTER");
ok(!/setLocName\(await reverseGeocode\(/.test(HOME),
  "recenterToMe resolves the name BEFORE committing the point — an awaited setLocName can strand the old city on the new pin");

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

/* ── WF-001 / WF-002 leftover city honesty ─────────────────────────────── */
{
  const ctx = resolveLocationContext({
    urlCity: "New York",
    stored: { lat: 42.3601, lng: -71.0589, loc: "Boston, MA" },
  });
  const surface = locationSurface(ctx);
  ok(ctx.city === "New York" && surface.headingCity === "New York",
    "stored Boston cannot override a New York URL city");
  ok(Math.abs(surface.resultsOrigin.lat - 40.7128) < 0.02,
    "organic origin follows New York, not Boston");
  ok(surface.offersCity === "New York" && surface.links.bestOf.includes("New%20York"),
    "offers and generated links agree on New York");
}
ok(categoryNavHrefs("New York").length === 0 && categoryNavHrefs("Boston").length === 0,
  "NY/Boston dynamic nav emits no category hrefs");
ok(!categoryNavHrefs("Orlando").some((h) => /sarasota/i.test(h)),
  "Orlando nav does not emit /restaurants/sarasota");
ok(!/href="\/restaurants\/sarasota"/.test(PAGE) && !/href="\/restaurants\/sarasota"/.test(strip(read("app/layout.js"))),
  "shared homepage/footer HTML does not hardcode /restaurants/sarasota");

if (fail.length) {
  console.error(`check-location-honesty: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-location-honesty: ${pass} assertions passed (fail-closed rails, city-neutral HomeProof, seed is not a city, dests does not eat suggestions)`);
