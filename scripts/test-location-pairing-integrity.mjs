#!/usr/bin/env node
/**
 * test-location-pairing-integrity — the city the header names, the point the
 * ranking runs on, and the point the map shows must describe ONE active fix.
 *
 * THE AUDIT (2026-09-08, after the 2026-09-07 "near Cortez" incident). The
 * chain GPS → center → reverse-geocode label → header → /api/rails city= →
 * "near X" was traced end to end. The boundary math is clean: executed over a
 * 0.01° grid of Manatee County, no point inside Parrish or Ellenton resolves
 * to the cortez slug; the nearest cortez point is 14 miles from Parrish's
 * centroid, and the client always sends city= from the EXACT (unsnapped)
 * point, which the route honours over its own coarse nearestCity. Two real
 * gaps remained, both pinned here:
 *
 *   1. AUTOSUGGEST PLACE TAP kept the OLD header label whenever
 *      centerAgreesWithLabel() (PAIRING_MAX_MI = 40, sized for a Florida label
 *      on a North Carolina pin) said the pair was plausible — and inside one
 *      metro every covered town is inside 40 miles of every other. Tap a
 *      Cortez restaurant from Parrish: center, map and rails move to Cortez,
 *      header keeps "Parrish", writer effect persists the mismatched pair.
 *      Fix: the label follows the coordinates in the same commit, from the
 *      locality Google's formattedAddress already names.
 *   2. STORED PIN WITH NO TIMESTAMP was trusted forever (`!ts ||`) by both
 *      readers of wf_center. Fix: storedPinFresh() requires a finite ts.
 *
 * Executed where executable (the two helpers, on real production address
 * shapes and on a real LANDING_CITIES pair proven to sit inside
 * PAIRING_MAX_MI), structural where it is a call site in app/home.js.
 *
 * Red-proved 2026-09-08: (a) reverting the tap handler to the bare
 * centerAgreesWithLabel rule, (b) restoring `!c.ts ||` in the hydration,
 * (c) making localityFromFormattedAddress return the street segment — each
 * turned exactly its assertion red.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  localityFromFormattedAddress, storedPinFresh, STORED_PIN_TTL_MS,
  centerAgreesWithLabel, PAIRING_MAX_MI, cityLabel,
} from "../lib/locationHonesty.js";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { nearestCoveredCity, COVERAGE_MI } from "../lib/railCoverage.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log("  ✓ " + msg); else { fails++; console.error("  ✗ " + msg); } };
console.log("test-location-pairing-integrity");

/* ── 1. The locality parser, executed on production address shapes ───────── */
ok(localityFromFormattedAddress("12321 Cortez Rd W, Cortez, FL 34215, USA") === "Cortez, FL", "a Cortez business address names Cortez, FL (the live tap that kept 'Parrish')");
ok(localityFromFormattedAddress("8825 US-301 N, Parrish, FL 34219, USA") === "Parrish, FL", "positive control: a Parrish address names Parrish, FL");
ok(localityFromFormattedAddress("1 Main St, Boston, MA 02108, USA") === "Boston, MA", "a non-Florida US address still parses (state is read, not assumed)");
ok(localityFromFormattedAddress("Anna Maria, FL 34216, USA") === "Anna Maria, FL", "an address with no street line still names the town");
ok(localityFromFormattedAddress("123 Elm, FL 33333, USA") === "", "a street line cannot be mistaken for a town (digits → no city, honest empty)");
ok(localityFromFormattedAddress("Carrer de Mallorca, 401, 08013 Barcelona, Spain") === "", "a non-US address yields no city rather than a guess");
ok(localityFromFormattedAddress("") === "" && localityFromFormattedAddress(null) === "" && localityFromFormattedAddress(42) === "", "garbage yields the honest empty, never a throw");
ok(cityLabel(localityFromFormattedAddress("12321 Cortez Rd W, Cortez, FL 34215, USA")) === "Cortez", "…and the header's cityLabel() reads the parsed label as a named city");

/* ── 2. The 40-mile pairing rule really is too loose inside a metro — this is
       WHY the label must follow the coordinates, proven on the live table ── */
const parrish = LANDING_CITIES.parrish, cortez = LANDING_CITIES.cortez;
ok(!!parrish && !!cortez, "LANDING_CITIES carries parrish and cortez");
if (parrish && cortez) {
  ok(centerAgreesWithLabel({ lat: cortez.lat, lng: cortez.lng }, "Parrish, FL"),
    `the OLD rule accepts a Cortez pin under a Parrish label (inside PAIRING_MAX_MI=${PAIRING_MAX_MI}) — so the tap handler cannot rely on it to clear the header`);
  ok(nearestCoveredCity(LANDING_CITIES, cortez.lat, cortez.lng, COVERAGE_MI) === "cortez"
    && nearestCoveredCity(LANDING_CITIES, parrish.lat, parrish.lng, COVERAGE_MI) === "parrish",
    "…while the rail would resolve those same pins to two different slugs: the exact mismatch the header must not hide");
  ok(nearestCoveredCity(LANDING_CITIES, 27.60, -82.42, COVERAGE_MI) === "parrish" && nearestCoveredCity(LANDING_CITIES, 27.5217, -82.5273, COVERAGE_MI) !== "cortez",
    "boundary control: Parrish and Ellenton points never resolve to cortez (circumstance 5 is not a defect)");
}

/* ── 3. storedPinFresh, executed ─────────────────────────────────────────── */
const now = 1_800_000_000_000;
ok(storedPinFresh({ lat: 27.6, lng: -82.4, ts: now - 60_000 }, now), "a one-minute-old pin is fresh");
ok(!storedPinFresh({ lat: 27.6, lng: -82.4 }, now), "a pin with NO timestamp is NOT fresh (was: trusted forever)");
ok(!storedPinFresh({ lat: 27.6, lng: -82.4, ts: now - STORED_PIN_TTL_MS - 1 }, now), "a pin older than the TTL is stale");
ok(!storedPinFresh({ lat: 27.6, lng: -82.4, ts: now + 60_000 }, now), "a pin from the future is not trusted");
ok(!storedPinFresh({ lat: "x", lng: -82.4, ts: now }, now) && !storedPinFresh(null, now), "garbage is not fresh");
ok(STORED_PIN_TTL_MS === 6 * 3600 * 1000, "the TTL is the six hours both readers always used");

/* ── 4. The call sites in app/home.js ────────────────────────────────────── */
const HOME = code(read("app/home.js"));
ok(/import\s*\{[^}]*\blocalityFromFormattedAddress\b[^}]*\bstoredPinFresh\b[^}]*\}\s*from\s*.\.\.\/lib\/locationHonesty./.test(HOME)
  || /import\s*\{[^}]*\bstoredPinFresh\b[^}]*\blocalityFromFormattedAddress\b[^}]*\}\s*from\s*.\.\.\/lib\/locationHonesty./.test(HOME),
  "home imports both helpers from the honesty module");
const tap = (HOME.match(/wfScore: null,\s*\};[\s\S]*?openDetail\x28placeObj\x29/) || [])[0] || "";
ok(tap.length > 0, "home: the autosuggest PLACE tap handler was found");
ok(/setCenter\x28\{ lat, lng \}\x29[\s\S]*?const placeCity = localityFromFormattedAddress\x28place\.formattedAddress\x29;\s*if \x28placeCity\x29 setLocName\x28placeCity\x29;/.test(tap),
  "place tap: after moving the centre, the header label is set from the place's own locality in the same commit");
ok(/else if \x28!centerAgreesWithLabel\x28\{ lat, lng \}, locName\x29\x29 setLocName\x28..\x29;/.test(tap),
  "place tap: when the address carries no locality, the old rule still clears an implausible label (no name beats a wrong name)");
ok(!/\n\s*if \x28!centerAgreesWithLabel\x28\{ lat, lng \}, locName\x29\x29 setLocName\x28..\x29;/.test(tap),
  "place tap: the bare 40-mile rule is no longer the ONLY thing deciding the header");
ok(/if \x28c && c\.manual && storedPinFresh\x28c\x29\x29 \{/.test(HOME), "manual-pin hydration trusts a stored record only through storedPinFresh");
ok(/savedOk = storedPinFresh\x28saved\x29;/.test(HOME), "the GPS saved-anchor shortcut trusts a stored record only through storedPinFresh");
ok(!/!c\.ts \|\|/.test(HOME) && !/!saved\.ts \|\|/.test(HOME), "no reader of wf_center accepts a record with no timestamp any more");
ok(/setDeviceLoc\x28c\x29;\s*deviceLocAtRef\.current = Date\.now\x28\x29;\s*if \x28manualRef\.current\x29 return;/.test(HOME),
  "a fresh GPS fix under a manual pin is recorded (deviceLoc + time) and does NOT move the searched centre — a deliberate search is the active fix until the reader taps Current location");

/* ── 5. Observability: the rail event carries the header's city ──────────── */
const RAIL = code(read("app/components/DaypartRail.js"));
const railOpen = (RAIL.match(/logEvent\x28.rail_open., \{([\s\S]*?)\}\x29;/) || [])[1] || "";
ok(railOpen.length > 0, "DaypartRail: rail_open event found");
ok(/city: shown\.citySlug/.test(railOpen) && /header_city: honestCityLabel\x28locName\x29 \|\| null/.test(railOpen),
  "rail_open reports BOTH the rail's slug and the header's city, so a disagreement is queryable after the fact");
ok(/\}, \[railById, daypart, shown, order, locName, selected\]\x29;/.test(RAIL), "…and open() re-binds on locName so the event never reports a stale header");

if (fails) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
console.log("  all green");
