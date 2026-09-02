#!/usr/bin/env node
/**
 * test-session-map-parity — WF-004: home / map / list share one near-me query.
 *
 * THE INCIDENT: Shopping → All on the homepage produced no organic results
 * in the same session that map Shopping → All showed 15 ranked places.
 * Stays → All on home was empty except a national car-rental affiliate.
 *
 * Home browse, the map, and the explore list already share cat/sub/center/
 * places/view. This test executes the shared query object and pins the
 * wiring so home starts that search when a category is selected, fail-closes
 * without a center (no Sarasota fill), and does not paper over empty organic
 * with an unrelated affiliate.
 */
import { readFileSync } from "node:fs";
import { DEFAULT_CENTER } from "../lib/locationHonesty.js";
import { nearMeQuery, queryKey, hasSearchCenter, HOME_ALL_IS_DISCOVERY, NEAR_ME_DEFAULT_RADIUS_M } from "../lib/nearMeQuery.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const map = readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const HOME = strip(home);
const MAP = strip(map);

const tampa = { lat: 27.9506, lng: -82.4572 };

/* ── executed: one query object, three surfaces ─────────────────────────── */
const homeQ = nearMeQuery({ cat: "shopping", sub: "all", vibe: "all", center: tampa, radiusM: NEAR_ME_DEFAULT_RADIUS_M });
const mapQ = nearMeQuery({ cat: "shopping", sub: "all", vibe: "all", center: tampa, radiusM: NEAR_ME_DEFAULT_RADIUS_M });
const listQ = nearMeQuery({ cat: "shopping", sub: "all", vibe: "all", center: tampa, radiusM: NEAR_ME_DEFAULT_RADIUS_M });
ok(!!homeQ && queryKey(homeQ) === queryKey(mapQ) && queryKey(mapQ) === queryKey(listQ),
  "home, map, and list build the identical shopping/all query");

const staysHome = nearMeQuery({ cat: "hotels", sub: "all", center: tampa });
const staysMap = nearMeQuery({ cat: "hotels", sub: "all", center: tampa });
ok(queryKey(staysHome) === queryKey(staysMap) && staysHome.cat === "hotels" && staysHome.sub === "all",
  "Stays → All is the same hotels/all query on home and map");

ok(homeQ.radiusM === NEAR_ME_DEFAULT_RADIUS_M && NEAR_ME_DEFAULT_RADIUS_M === 27359, "the shared query opens at the 17-mile default");
ok(/export const DEFAULT_RADIUS_M = 27359/.test(readFileSync(new URL("../lib/google.js", import.meta.url), "utf8")), "NEAR_ME_DEFAULT_RADIUS_M stays lockstep with google.js DEFAULT_RADIUS_M");
ok(homeQ.lat === tampa.lat && homeQ.lng === tampa.lng, "the query uses the visitor center, not a seed");

/* ── fail-closed: no center, no Sarasota/Parrish fill ───────────────────── */
ok(nearMeQuery({ cat: "shopping", sub: "all", center: null }) === null, "no center → no query");
ok(nearMeQuery({ cat: "shopping", sub: "all", center: {} }) === null, "empty center → no query");
ok(nearMeQuery({ cat: "shopping", sub: "all" }) === null, "missing center → no query");
ok(nearMeQuery({ cat: "shopping", center: DEFAULT_CENTER }) !== null,
  "a real coordinate pair is accepted even if it happens to equal the seed — the fill is the missing-center case, not the number");
ok(!hasSearchCenter(null) && !hasSearchCenter({ lat: "x", lng: -82 }),
  "hasSearchCenter rejects a missing or non-numeric center");
ok(nearMeQuery({ cat: "", center: tampa }) === null, "no category → no query");

/* ── documented difference: home All is discovery, not a seventh category ─ */
ok(HOME_ALL_IS_DISCOVERY === true, "home All is the mixed discovery feed by contract");
// RE-POINTED v8.14 (owner, 2026-08-18: "instead of those categories there,
// which is weird, I want that place to show the previous location and to
// house the current-location feature"). The scope DROPDOWN this line matched
// is gone by owner directive — the search bar's left slot is now the location
// control, and the six tabs remain the one category writer. The INVARIANT
// this line protected is unchanged and still asserted: nothing anywhere
// invents a cat="all" search — All/discovery is the ABSENCE of a category,
// never a seventh one.
// Scoped to the NEAR-ME query this file is about: /api/experiences takes a
// legitimate cat=all param of its own (the Viator products API), so a bare
// substring sweep would fire on correct code. The invariant is that the
// ORGANIC near-me search never receives "all" as a category.
{
  const nmCalls = HOME.match(/nearMeQuery\(\{[\s\S]{0,200}?\}\)/g) || [];
  ok(nmCalls.length > 0, "positive control — home really calls nearMeQuery, so the ban below can fail");
  ok(nmCalls.every((c) => !/["']all["']/.test(c)),
    "no nearMeQuery call invents a cat='all' search — discovery is browseCat null, not a seventh category");
}
ok(/>\s*Current location\s*</.test(HOME) && /wf_recent_locs/.test(HOME), // v8.19: one-line label
  "…and the slot that held the duplicate category dropdown now houses the owner's location control (precise current fix + previous locations)");
ok(!/CATEGORY_TILES[\s\S]{0,200}id: "all"/.test(readFileSync(new URL("../lib/categories.js", import.meta.url), "utf8")),
  "the map's category tiles have no All — map always searches a real category");

/* ── home starts the same search when the category is selected ──────────── */
ok(/from "\.\.\/lib\/nearMeQuery"/.test(home) && /nearMeQuery\(\{ cat, sub, vibe, center/.test(HOME),
  "the home/map/list search effect builds the shared nearMeQuery");
ok(/if \(keyMissing \|\| !q \|\| searchMode\) return/.test(HOME),
  "the search effect fail-closes when nearMeQuery returns null — no Sarasota fill");
// v8.41 — the four setters moved OUT of the onNavOpen body and INTO openBrowse,
// the one entry point every off-feed category control now shares (the Itinerary
// row had its own copy and dispatched to a screen that does not exist). The
// invariant is identical — a tab tap starts the same near-me search the map
// starts — so the probe follows the call rather than assuming the body is
// inline, and asserts BOTH halves: the setters exist, and the tab reaches them.
ok(/if \(browseCat !== id\) \{ setMoodPick\(id\); setBrowseCat\(id\); setCat\(id\); setSub\("all"\); setVibe\("all"\); \}/.test(HOME),
  "openBrowse starts the same cat/sub search the map starts on tap");
{
  const navOpen = HOME.split("onNavOpen={")[1]?.split("onNavSub={")[0] || "";
  ok(navOpen.length > 0, "positive control — the onNavOpen handler is really in home.js, so the assertion below can fail");
  ok(/openBrowse\(/.test(navOpen),
    "selecting a home category tab goes through openBrowse, which is where those setters now live");
}
ok(/setMapBrowse\(true\); setCat\(id\); setSub\("all"\); setVibe\("all"\)/.test(MAP),
  "map category tap still writes the same cat/sub/vibe the home path writes");

/* ── empty organic is not papered over with an unrelated affiliate ──────── */
ok(/browseCat === "hotels" && center && view\.length > 0 && <UnifiedBrowseCommerceRail cat="hotels"/.test(HOME),
  "Stays commerce rail mounts only when organic results exist");
ok(/browseCat === "shopping" && center && view\.length > 0 && <UnifiedBrowseCommerceRail cat="shopping"/.test(HOME),
  "Shopping commerce rail mounts only when organic results exist");
ok(/categories=\{\["stays"\]\}/.test(HOME) && !/categories=\{\["stays", "travel"\]\}/.test(HOME),
  "Stays no longer attaches the national car-rental (travel) rail as a stand-in for empty hotels");

if (fail.length) {
  console.error(`test-session-map-parity: ${fail.length} FAILURE(S)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-session-map-parity: OK — ${pass} assertions (shared query, fail-closed center, home category starts search, no affiliate over empty organic)`);
