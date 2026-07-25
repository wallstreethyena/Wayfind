// scripts/test-city-search.mjs — SEARCHING A CITY MUST MOVE THE APP.
//
// The owner-visible failure this locks: type a city, press Enter, and the feed
// stays on the previous city ("I searched and the cards stayed on Parrish").
// Two independent defects produced it, and this guard covers BOTH so neither
// can come back quietly:
//
//   1. submitSearch ran a 20-mile nearby-BUSINESS search FIRST and returned on
//      any hit. A nearby city name matches businesses containing that word
//      ("Sarasota" -> Sarasota Memorial, Sarasota Bradenton Airport), so the
//      city never recentered. AREA resolution must come BEFORE the nearby
//      business search.
//   2. The Enter key auto-picked suggestions[0] whenever the dropdown was open,
//      even with nothing highlighted (sugIdx === -1) — so the same keystroke
//      did something different depending on what Google happened to rank first.
//      Enter must only take a suggestion the user actually arrowed onto.
//
// Plus the geocoder contract they both rely on: geocodeCity must report whether
// the result is an AREA, and must prefer an area hit over a biased first result.
import { readFileSync } from "fs";
// REAL behavioural import — lib/geoAreaTypes is dependency-free on purpose so
// this cannot silently degrade into a no-op the way importing lib/google did.
import { isAreaResult, GEO_AREA_TYPES } from "../lib/geoAreaTypes.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-city-search: FAIL — " + m); fails++; } };

// ── the geocoder exposes area-ness, and prefers a real area hit ──────────────
const g = readFileSync(join(ROOT, "lib/google.js"), "utf8");
ok(/from "\.\/geoAreaTypes"/.test(g), "lib/google sources the predicate from the pure, testable module");
ok(/isArea:\s*isAreaResult\(types\)/.test(g), "geocodeCity returns an isArea flag");
ok(/results\.find\(\(x\) => isAreaResult\(x\.types\)\) \|\| results\[0\]/.test(g),
   "geocodeCity prefers an AREA result over Google's biased first result");
for (const t of ["locality", "administrative_area_level_1", "neighborhood", "postal_code"]) {
  ok(GEO_AREA_TYPES.includes(t), `area types include ${t}`);
}

// ── behavioural: the predicate itself, executed for real ─────────────────────
ok(typeof isAreaResult === "function", "isAreaResult is importable in plain Node (guard cannot silently no-op)");
ok(isAreaResult(["locality", "political"]), "a locality is an area (Sarasota, FL)");
ok(isAreaResult(["neighborhood"]), "a neighborhood is an area (South Beach)");
ok(isAreaResult(["postal_code"]), "a zip is an area");
ok(!isAreaResult(["restaurant", "food", "point_of_interest"]), "a restaurant is NOT an area");
ok(!isAreaResult(["airport", "establishment"]), "an airport is NOT an area (Sarasota Bradenton)");
ok(!isAreaResult(["lodging", "establishment"]), "a hotel is NOT an area");
ok(!isAreaResult([]), "no types is NOT an area");
ok(!isAreaResult(null), "null types is NOT an area (never throws)");
ok(!isAreaResult("locality"), "a bare string is NOT an area (type-safe)");

const home = readFileSync(join(ROOT, "app/home.js"), "utf8");

// ── 1) ORDER: area resolution must come BEFORE the nearby-business search ────
const iArea = home.indexOf("const area = await geoTry(q);");
const iNearby = home.indexOf("const nearby = await searchNearbyPlaces(q, searchCenter");
ok(iArea > 0, "submitSearch resolves an area via geoTry");
ok(iNearby > 0, "submitSearch still supports nearby-business search (McDonald's etc)");
ok(iArea < iNearby, "AREA resolution runs BEFORE the nearby-business search (the actual bug)");
ok(/if \(area && area\.isArea\) \{ goTo\(area\); return; \}/.test(home),
   "a real city short-circuits straight to recentering");

// ── the recenter helper actually moves the app (center + name + exits search) ─
ok(/const goTo = \(g\) => \{[\s\S]{0,320}setCenter\(g\)/.test(home), "goTo sets the center");
ok(/const goTo = \(g\) => \{[\s\S]{0,320}setLocName\(/.test(home), "goTo updates the location name");
ok(/const goTo = \(g\) => \{[\s\S]{0,320}setSearchMode\(false\)/.test(home), "goTo leaves search mode so the feed shows");

// ── 2) ENTER must not auto-pick an unhighlighted suggestion ──────────────────
ok(!/pickSuggestion\(suggestions\[sugIdx >= 0 \? sugIdx : 0\]\)/.test(home),
   "Enter no longer auto-picks suggestions[0] when nothing is highlighted");
ok(/if \(sugIdx >= 0 && suggestions\[sugIdx\]\) pickSuggestion\(suggestions\[sugIdx\]\);\s*\n\s*else submitSearch\(\);/.test(home),
   "Enter picks ONLY an arrowed-onto suggestion, otherwise runs a real search");

// ── 3) search bias must follow the location the USER CHOSE, not raw GPS ──────
ok(/const userPickedLocation = manualRef\.current;/.test(home),
   "submitSearch captures whether the user chose the current location");
ok(/const searchCenter = \(userPickedLocation && center\)/.test(home),
   "a user-chosen center outranks raw device GPS when biasing search");

// ── 4) an experience LABEL containing a city name must not swallow the city ──
// "Sarasota" used to match the "Best of Sarasota" label via lab.includes(ql),
// open that sheet, and return before the area-first search ever ran — the
// recenter fix existed but was unreachable. Exact key/label match only.
{
  const m = home.match(/const expHit = Object\.keys\(EXPERIENCES\)\.find\(\(k\) => \{[\s\S]{0,900}?\}\);/);
  ok(!!m, "the experience-shortcut matcher exists");
  ok(m && !/lab\.includes\(ql\)/.test(m[0]),
     "experience shortcut never substring-matches the LABEL (a city inside a label must fall through to area search)");
}

if (fails) process.exit(1);
console.log("test-city-search: OK — a city always recenters the feed; Enter is deterministic; search follows the chosen location");
