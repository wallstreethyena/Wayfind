// The map is an exploration surface, not a six-query loading screen. It opens
// on Food, draws local 5/10/15-mile context immediately, and keeps category
// changes inside the same map instead of falling back to the old mixed pool.
//
// v6.89 (owner: "the map used to be 5, 10 and 15 miles... it had a nice zoom
// of 30 miles out"): this guard used to assert [1, 2, 3] — a regression from
// whenever the rings were tightened down to a radius too small to be useful
// for a things-to-do-near-you app. Updated to lock in the restored values
// instead of re-baking the bug in as the "correct" behavior.
//
// v6.100 (concurrent session, "you ar epissing e off" + a live screenshot of
// the load-failure fallback): the 15s watchdog timeout was tuned against the
// old "dark" style; "bright" evaluates ~2.3x more style layers per frame, so
// it was bumped to 26s, and the fallback's "Try again" button now remounts
// <MapView> from scratch via a retry key (mapRetryKey in home.js) instead of
// being a dead end.
//
// v7.0 (owner, 2026-08-03: "the default zoom setting should be the 30 miles
// radius looking at all of the activites... the menu is not working i click
// on it and it does not open the submenu"): layered on top of v6.100 rather
// than replacing it -- (a) an error is now only fatal if the map has NEVER
// successfully loaded (post-load noise like a dropped tile while panning no
// longer kills an already-working map), (b) the map now OPENS already
// zoomed out far enough to frame the whole 5/10/15/20mi ring set (MAP_DEFAULT_ZOOM sits below
// RING_EXPAND_ZOOM_THRESHOLD on purpose) instead of opening tight on
// 5/10/15mi, (c) the map's category bar now shows its sub-filter row
// (Museums/Beaches/Family/Tours/etc under Activities) same as Home and
// Itinerary, instead of the compact "highlights the active category but
// never expands" mode a prior session deliberately shipped and this guard
// used to lock in, and (d) the map opens defaulted to Activities the first
// time it is visited in a session. The floating Near-me/Events/Compass/2D
// buttons were pushed down (+60px, measured live off the rendered
// sub-filter row's real height) so they clear the now-taller header.
import { readFileSync } from "node:fs";
import { MAP_DEFAULT_CATEGORY, MAP_RING_MILES, distanceRingData } from "../lib/mapExplorer.js";

let pass = 0;
const fail = (message) => { console.error("test-map-explorer: FAIL — " + message); process.exit(1); };
const ok = (condition, message) => { if (!condition) fail(message); pass += 1; };

ok(MAP_DEFAULT_CATEGORY === "food", "Food is the explicit app-wide default category");
// v8.23.3 (owner: "remove the 30 mile ring make it 5 10 15 and 20 mile ring").
// WAS two sets — [5,10,15] tight and [5,10,30] zoomed out — swapped by a zoom
// threshold. A distance ring is a MEASUREMENT, and one whose outer value
// silently changes from 15 to 30 as you pinch is a measurement the reader
// cannot rely on. One scale now, at every zoom.
ok(JSON.stringify(MAP_RING_MILES) === JSON.stringify([5, 10, 15, 20]), "rings are exactly 5, 10, 15 and 20 miles");
ok(MAP_RING_MILES.every((m, i, a) => i === 0 || m > a[i - 1]), "rings ascend, or the labels contradict the circles");

const data = distanceRingData({ lat: 28.5383, lng: -81.3792 });
// Derived from MAP_RING_MILES, not hardcoded: a count literal is exactly how a
// ring set can change while its own test keeps passing.
ok(data.features.filter((f) => f.properties.kind === "ring").length === MAP_RING_MILES.length, MAP_RING_MILES.length + " ring lines are generated, one per declared radius");
ok(data.features.filter((f) => f.properties.kind === "label").map((f) => f.properties.label).join("|") === MAP_RING_MILES.map((m) => m + " mi").join("|"), "each ring has a readable distance label naming its own radius");
ok(data.features.every((f) => f.geometry && Array.isArray(f.geometry.coordinates)), "ring geometry is valid GeoJSON");

// v8.23.3 — the zoomed-out ring assertions went with the second ring set.

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/const \[cat, setCat\] = useState\(MAP_DEFAULT_CATEGORY\)/.test(home), "Food is the app-wide selected category on first render");
ok(/useState\(true\);\s*\/\/ Map opens on Food/.test(home), "map category browsing is active on first render");
ok(!/Promise\.all\(CATEGORIES\.map\(\(c\) => searchPlaces/.test(home), "opening the map no longer launches every category search");
// P0 location honesty: do not require "around you" before a city is known.
// Lock the ring-preview chrome (concentric orange rings + "Setting the map") instead.
ok(/Setting the map/.test(home) && /boxShadow: "0 0 0 28px rgba\(249,115,22/.test(home), "the first paint shows an intentional local-ring preview instead of an empty map");
ok(!/Setting the map around you/.test(home), "map loading chrome must not claim \"around you\" before a city is known");
ok(/mapDefaultAppliedRef/.test(home), "a one-time-per-session guard exists so the map defaults to Activities on first open without fighting a later deliberate category choice");
ok(/mapRetryKey/.test(home), "a retry key exists so a failed map can be remounted from scratch instead of being a dead end");

const screen = readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8");
ok(!/showSubs=\{false\}/.test(screen) && /activeCat=\{cat\}/.test(screen), "the map's category bar shows its sub-filter row, same as Home and Itinerary");
ok(/setCat\("attractions"\)/.test(screen) && /MAP_DEFAULT_CATEGORY/.test(screen), "the map opens defaulted to Activities (attractions) the first time it is visited in a session");
ok(/key=\{mapRetryKey\}/.test(screen) && /onRetry=\{/.test(screen), "the map view remounts on retry via a key change");
ok(!/Numbered by rank/.test(screen), "the bulky map legend is gone; numbered pins and the result drawer carry that meaning");
ok(/bottom: 76/.test(screen) && /Browse list/.test(screen), "the result drawer floats above bottom navigation and remains discoverable");
// FLOATING CONTROLS CLEAR THE HEADER — asserted as the INVARIANT, not as three
// pixel coordinates (owner-approved rewrite, 2026-08-06).
//
// This previously read:
//   /top: 164, right: 12/ && /top: 216, left: 12/ && /top: 268, left: 12/
// which were the recenter button, THE COMPASS and the 3D toggle. It pinned the
// implementation rather than the property it was written to protect, so it
// failed the moment the compass was removed — a change that cannot affect
// whether the surviving controls clear the header. A guard that breaks on a
// change it does not measure is a guard that gets edited to pass, which is worse
// than not having it.
//
// The property: every absolutely-positioned floating control on the map sits
// BELOW the header chrome, and no two of them overlap. Both survive the controls
// being removed, added, or repositioned.
const HEADER_CLEAR_PX = 150;  // work order 2026-08-06: the filter panel is capped here
const CONTROL_BOX_PX = 56;    // largest control footprint, for the overlap check
// Scoped to the floating CONTROLS specifically — `zIndex: 5` is what the map's
// control layer uses, and matching bare `position:absolute` also caught the
// panel and overlay wrappers at top:0/top:7, which are supposed to be up there.
const tops = [...screen.matchAll(/position:\s*"absolute",\s*top:\s*(\d+),\s*(left|right):\s*(\d+),\s*zIndex:\s*5\b/g)]
  .map((m) => ({ top: Number(m[1]), side: m[2] }));
ok(tops.length >= 2, `the map renders ${tops.length} absolutely-positioned controls — under 2 means this assertion is reading nothing and would pass vacuously`);
const tooHigh = tops.filter((t) => t.top < HEADER_CLEAR_PX);
ok(tooHigh.length === 0, `a floating map control sits at top:${tooHigh.map((t) => t.top).join(",")} px, inside the header band (must clear ${HEADER_CLEAR_PX}px) — it would be covered by the filter panel`);
for (const side of ["left", "right"]) {
  const col = tops.filter((t) => t.side === side).map((t) => t.top).sort((a, b) => a - b);
  for (let i = 1; i < col.length; i++) {
    ok(col[i] - col[i - 1] >= CONTROL_BOX_PX,
      `two ${side}-side controls at top:${col[i - 1]} and top:${col[i]} are ${col[i] - col[i - 1]}px apart and would overlap (need ${CONTROL_BOX_PX}px)`);
  }
}

const view = readFileSync(new URL("../app/components/MapView.js", import.meta.url), "utf8");
ok(/distanceRingData\(origin,/.test(view), "MapView renders the shared immediate ring geometry");
ok(!/MAP_RING_MILES_ZOOMED_OUT/.test(view), "MapView still imports a second ring set — there is one scale now (v8.23.3)");
ok(!/RING_EXPAND_ZOOM_THRESHOLD\s*=/.test(view), "the zoom-swap threshold is back — it recomputed every ring polygon on pinch to change one number");
ok(/distanceRingData\(origin, MAP_RING_MILES\)/.test(view), "MapView must draw the one ring set directly");
ok(/const MAP_DEFAULT_ZOOM = 9\.15/.test(view), "the map opens zoomed out to the 30mi ring tier instead of the tight 5\/10\/15mi crop");
ok(/zoom: rings \? MAP_DEFAULT_ZOOM : 11/.test(view), "ring mode opens at the 30mi-radius default zoom, both on mount and on recenter");
// v8.23.3 — WAS: the zoomed-out tier must be the starting state, so the map did
// not open on the tight rings and then visibly correct itself. With one ring set
// there is no tier to start in and no correction to avoid: the rings are set
// once, next to the markers. What is still worth pinning is that they are drawn
// on first paint rather than waiting for an event.
ok(!/ringZoomedOutRef/.test(view), "the ring-tier ref is back — there is one scale now, so there is nothing to track");
ok(/const ringData = origin && rings \? distanceRingData\(origin, MAP_RING_MILES\)/.test(view),
   "rings must be built in the same pass as the markers, not deferred to a zoom handler");
ok(/cluster:\s*true/.test(view) && /wf-place-cluster-count/.test(view), "dense results collapse into readable count bubbles instead of overlapping pins");
ok(/onRetry/.test(view) && /Try again/.test(view), "a failed map load offers a retry instead of a permanent dead end for the rest of the page session");
ok(/\}, 26000\);/.test(view), "the load watchdog gives the heavier bright style a realistic 26s window before giving up");
ok(/event\.error && !map\.loaded\(\) &&/.test(view), "an error after the map has already rendered once is treated as normal map noise, not a load failure");

console.log(`test-map-explorer: OK — ${pass} assertions (Activities-first map open, zoomed out to frame the whole 5/10/15/20mi ring set, sub-filters visible, resilient remount-based retry)`);
