#!/usr/bin/env node
/**
 * check-location-fail-open — P0: do not present a flagship city, a seed
 * coordinate, or a dark Exploding Trends surface as the visitor's location.
 *
 * THE BUGS THIS PINS (measured 2026-08-18)
 *
 *   A. DaypartRail used `live || { places, citySlug }` and on
 *      /api/rails {covered:false} or throw it kept the SSR Sarasota flagship
 *      as the visitor's city. api/rails already returned {covered:false}
 *      outside 90mi or on throw; the client was the fail-open.
 *
 *   B. lib/railsData.js railMenuData() did
 *        LANDING_CITIES[citySlug] || LANDING_CITIES.sarasota
 *      so an unknown slug silently became Sarasota.
 *
 *   C. app/home.js seeded center at DEFAULT_CENTER (Parrish) and
 *      setCenter((prev) => prev || c) after /api/geo could not replace the
 *      truthy seed. Chrome then said "near you" / "you" with no named city.
 *
 *   D. Exploding Trends accordion was removed 2026-08-16 in BestNearby.js.
 *      The homepage hero tile still advertised "EXPLODING TRENDS NEAR YOU"
 *      via stale trending art. Do not remount the accordion; hide the tile.
 *
 * Comments are stripped before every assertion. A guard that reads raw source
 * fails on its own rationale (repo lesson, 2026-07-30).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = (m) => { console.error("check-location-fail-open: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const RAIL = strip(read("app/components/DaypartRail.js"));
const RAILS_DATA = strip(read("lib/railsData.js"));
const RAILS_API = strip(read("app/api/rails/route.js"));
const HOME = strip(read("app/home.js"));
const RAILS_META = strip(read("lib/rails.js"));
const BEST = strip(read("app/components/BestNearby.js"));

/* ── A. Honest empty when rails uncovered or errored ─────────────────────── */
ok(/emptyRailLive/.test(RAIL) || /emptyLive\s*=\s*\(/.test(RAIL) || /covered:\s*false/.test(RAIL),
  "DaypartRail has an explicit uncovered/empty live payload — not just live || ssr");
ok(/setLive\(emptyRailLive\(\)\)/.test(RAIL) || /setLive\(emptyLive\(\)\)/.test(RAIL) || /setLive\(\{[^}]*covered:\s*false/.test(RAIL),
  "DaypartRail writes the empty payload when /api/rails is uncovered or errored");
ok(!/keep the flagship/.test(RAIL),
  "DaypartRail no longer comments-or-codes a keep-the-flagship fallback");
ok(/onCoverage/.test(RAIL),
  "DaypartRail tells the parent when coverage failed so CityGate can open");
ok(/railsCoverage === "uncovered"/.test(HOME) && /<CityGate/.test(HOME),
  "home.js mounts CityGate when rails are uncovered — never Sarasota-as-you");
ok(/liveFromRailsResponse/.test(RAIL) || /!j \|\| !j\.covered \|\| !j\.data/.test(RAIL),
  "the live fetch still treats covered:false / missing data as a miss");
ok(/\.catch\(\(\) => \{[\s\S]{0,180}setLive\(emptyRailLive\(\)\)/.test(RAIL)
  || /\.catch\(\(\) => \{[\s\S]{0,180}setLive\(emptyLive\(\)\)/.test(RAIL)
  || /\.catch\(\(\) => \{[\s\S]{0,180}covered:\s*false/.test(RAIL),
  "a thrown /api/rails must empty the flagship, not .catch(() => {})");
ok(/covered:\s*false/.test(RAILS_API) && /COVERAGE_MI/.test(RAILS_API),
  "api/rails still fail-closes outside coverage instead of inventing a town");

/* ── B. Unknown city slug must not silently become Sarasota ──────────────── */
ok(!/LANDING_CITIES\[citySlug\]\s*\|\|\s*LANDING_CITIES\.sarasota/.test(RAILS_DATA),
  "railMenuData no longer falls back to LANDING_CITIES.sarasota on an unknown slug");
ok(!/const slug = LANDING_CITIES\[citySlug\] \? citySlug : "sarasota"/.test(RAILS_DATA),
  "railMenuData no longer rewrites an unknown slug to the string \"sarasota\"");
ok(/covered:\s*false/.test(RAILS_DATA) && /if \(!city\)/.test(RAILS_DATA),
  "railMenuData fail-closes an unknown slug (covered:false) instead of borrowing Sarasota");

/* ── C. DEFAULT_CENTER is unresolved until a real source adopts a center ─── */
ok(/const \[center, setCenter\] = useState\(null\)/.test(HOME),
  "center starts null — DEFAULT_CENTER is a named seed, not a visitor location");
ok(/const DEFAULT_CENTER = \{ lat: 27\.5689, lng: -82\.4393/.test(HOME),
  "DEFAULT_CENTER still exists as the documented seed (events primer lockstep)");
ok(!/setCenter\(\(\s*prev\s*\)\s*=>\s*prev\s*\|\|\s*c\s*\)/.test(HOME),
  "/api/geo must replace the seed; setCenter((prev) => prev || c) cannot, because the seed was truthy");
ok(/fetch\("\/api\/geo"/.test(HOME) && /setCenter\(c\)/.test(HOME),
  "/api/geo writes setCenter(c) so a real IP fix replaces the unresolved seed");
ok(!/const cityNow = locName \? locName\.split\(","\)\[0\] : "you"/.test(HOME),
  "cityNow must not fall back to \"you\" when locName is empty");
ok(/const cityNow = cityLabel\(locName\)/.test(HOME)
  || /const cityNow = locName \? locName\.split\(","\)\[0\] : ""/.test(HOME),
  "cityNow is the named city, or empty — never a fake \"you\"");
ok(!/where=\{locName \? locName\.split\(","\)\[0\] : "you"\}/.test(HOME),
  "SortControl chrome must not say \"you\" without a named city");
ok(!/Setting the map around you/.test(HOME),
  "map loading chrome must not claim \"around you\" before a city is known");

/* ── D. Hero must not advertise Exploding Trends while the accordion is dark */
ok(!/<ExplodingNearby[\s/>]/.test(BEST),
  "BestNearby must not remount <ExplodingNearby> — the accordion stays dark");
ok(/artStale:\s*true/.test(RAILS_META),
  "the trending rail still declares artStale while its art reads EXPLODING TRENDS");
ok(/!r\.artStale/.test(RAIL) && /artStale/.test(RAIL),
  "DaypartRail hides artStale tiles — the stale Exploding Trends hero is not shown");
ok(!/<ExplodingNearby[\s/>]/.test(HOME),
  "the homepage does not remount the Exploding Trends accordion");

/* ── F. After Tampa, leftover Sarasota heading / distances cannot linger ── */
ok(/setLive\(emptyRailLive\(\)\)/.test(RAIL) || /setLive\(emptyLive\(\)\)/.test(RAIL),
  "changing center clears live rails before the new fetch — leftover Sarasota distances cannot linger");
ok(/center=\{locResolved \? center : null\}/.test(HOME),
  "DaypartRail and LocalEdit only receive a center once the location is resolved");
ok(!/Near Sarasota right now/.test(strip(read("app/page.js"))),
  "HomeProof no longer hardcodes \"Near Sarasota right now\" into the ISR document");

/* ── G. nav.wf-dests must not eat the first city suggestion ─────────────── */
ok(/is-suggesting/.test(HOME) && /is-covered/.test(HOME),
  "the search row marks itself open and dests as covered while suggestions show");
ok(/pointerEvents:\s*["']none["']/.test(HOME),
  "covered dests do not receive pointer events");
ok(/onMouseDown=\{\(e\) => \{ e\.preventDefault\(\); pickSuggestion\(s\)/.test(HOME),
  "a suggestion is taken on mousedown so dests cannot steal the click");
const CSS = read("app/components/css.js");
ok(/\.wf-search-row\.is-suggesting\{z-index:40\}/.test(CSS),
  "an open search row stacks above dests");
ok(/\.wf-dests\.is-covered\{pointer-events:none\}/.test(CSS),
  "CSS disables pointer-events on a covered dests nav");

console.log(`check-location-fail-open: OK — ${pass} assertions (A fail-closed rails, B unknown slug, C unresolved seed, D dark Exploding Trends hero hidden, F leftover city cleared, G dests do not eat suggestions)`);
