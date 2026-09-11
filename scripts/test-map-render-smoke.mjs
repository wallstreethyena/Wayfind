#!/usr/bin/env node
/**
 * test-map-render-smoke — actually RENDER the Map screen, don't grep it.
 *
 * THE INCIDENT (2026-08-11, prod, owner screenshot): scoreLabel() returns
 * { s, word } and the map preview card rendered the OBJECT as a React child —
 * minified React #31 on EVERY pin tap, straight to the error boundary. Six
 * guards were green throughout because, as with #486, nothing ever CALLED the
 * component: check-map-place-card greps source text, check:jsx checks syntax,
 * next build bundles without executing. Same lesson, same cure: this file
 * MOUNTS MapScreen (via the ctx-injection seam it already has) in every state
 * a user can put it in, so an object-child, an unbound name, or a throw in
 * any of those states is a red suite, not a production screenshot.
 */
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const entry = fileURLToPath(new URL("../app/components/screens/Map.js", import.meta.url));
// Apple map data now lives in component state, not ctx.view. Seed only the
// emitted test module's state initializers to represent a completed area fetch;
// the real selectMapPlaces, drawer, card and score rendering still execute.
// Product source is untouched, and exact initializer counts prevent an empty
// injection from turning a loaded-drawer assertion into an empty-screen test.
const mod = await loadComponent(entry, REPO, { onGraph(graph) {
  const compiled = graph.get(entry);
  if (!compiled) throw new Error("MapScreen was not emitted");
  let source = readFileSync(compiled, "utf8");
  const seeds = [
    [/const \[areaPlaces, setAreaPlaces\] = useState\(\[\]\);/g, 'const [areaPlaces, setAreaPlaces] = useState(ctx.__mapSmokePlaces);'],
    [/const \[areaStatus, setAreaStatus\] = useState\("loading"\);/g, 'const [areaStatus, setAreaStatus] = useState(ctx.__mapSmokeStatus);'],
  ];
  for (const [pattern, replacement] of seeds) {
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Expected one map state initializer, found ${matches.length}: ${pattern}`);
    source = source.replace(pattern, replacement);
  }
  writeFileSync(compiled, source);
} });
const MapScreen = mod.default;
ok(typeof MapScreen === "function", "MapScreen has a default export");

const noop = () => {};
const P = (o) => ({ id: "ChIJsmoke", name: "Smoke Cafe", lat: 27.5, lng: -82.5, photo: null, cuisine: "Cafe", type: "cafe", distMi: 1.2, price: "$$", wfScore: 92, governed_score: 92, category: "food", trending: false, ...o });
const EV = { id: "ev1", name: "Smoke Show", venue: "Smoke Hall", lat: 27.5, lng: -82.5, date: "2026-08-12", time: "8 PM", image: null, dest: "https://tickets.example/e", destKind: "external" };

function ctxFor(over = {}) {
  return {
    searchMapArea: noop, mapMode: "places", setMapMode: noop, mapBrowse: true, setMapBrowse: noop,
    mapPool: [], mapListOverride: null, map3D: false, setMap3D: noop, mapRetryKey: 0, setMapRetryKey: noop,
    cat: "food", setCat: noop, sub: "all", setSub: noop, setVibe: noop, sortBy: "fit",
    center: { lat: 27.5, lng: -82.5 }, deviceLoc: null, mapFocus: null, setMapFocus: noop, setMapSearchOpen: noop,
    events: [], eventsLoading: false, eventsUnavailable: false, mapDate: "all", setMapDate: noop,
    mapPreview: null, setMapPreview: noop, mapDrawer: false, setMapDrawer: noop, eventPreview: null, setEventPreview: noop,
    suggested: [], places: [], liked: {}, disliked: {}, view: [P()], featuredBoost: () => 0,
    FallbackImg: (p) => createElement("span", null),
    iconForPlace: () => "📍", liveOpen: () => true, logEvent: noop, loadEvents: noop,
    openDetail: noop, openVenue: noop, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 },
    recenterToMe: noop, isBeach: () => false, beachSignals: {},
    PlaceCard: () => createElement("div", null, "place-card"), isSaved: () => false,
    toggleLike: noop, toggleDislike: noop, quickSaveFavorite: noop, addShared: noop, giveawayMark: noop,
    blurbs: {}, openExperience: noop, openCuisine: noop, cityNow: "Sarasota",
    mapDefaultAppliedRef: { current: true },
    __mapSmokePlaces: [P()], __mapSmokeStatus: "ready",
    ...over,
  };
}

// Every state a user can put the screen in. The crash lived in state 1.
const STATES = [
  // v7.16: the bottom slot renders the shared IconicPlaceCard (owner:
  // "i want the results to be our iconic place card"). A real score renders
  // the real WayfindScoreBadge; no score renders NO badge (the shared card
  // derives only from wfScore/rating, and this fixture carries neither).
  ["pin tapped: preview card with a real score", { mapPreview: P() }, (h) => h.includes("data-iconic-place-card") && h.includes("9.2") && h.includes("wayfind-score-badge")],
  ["preview card, place with NO score (score law: badge absent, no fabrication)", { mapPreview: P({ wfScore: null, governed_score: null }) }, (h) => !h.includes("wayfind-score-badge") && h.includes("data-iconic-place-card")],
  ["preview card, sparse place (no price/photo/distance)", { mapPreview: P({ price: null, distMi: null, cuisine: null }) }, (h) => h.includes("data-iconic-place-card")],
  ["collapsed list strip", {}, (h) => h.includes("Wayfind Score 9.2+") && h.includes("Browse list")],
  ["open drawer renders the real PlaceCard seam", { mapDrawer: true }, (h) => h.includes("place-card")],
  ["loaded empty area stays honest", { __mapSmokePlaces: [], mapDrawer: true }, (h) => h.includes("No 9.2+") && !h.includes("place-card")],
  ["below-floor rows are filtered before the drawer", { __mapSmokePlaces: [P({ wfScore: 91, governed_score: 91 })], mapDrawer: true }, (h) => h.includes("No 9.2+") && !h.includes("place-card")],
  ["partial area failure is explicitly labelled", { __mapSmokeStatus: "error", mapDrawer: true }, (h) => h.includes("could not finish loading") && h.includes("partial results") && h.includes("place-card")],
  ["events mode with an event preview", { mapMode: "events", eventPreview: EV, events: [EV] }, (h) => h.includes("Smoke Show")],
];

for (const [label, over, check] of STATES) {
  let html = null, err = null;
  try { html = renderToStaticMarkup(createElement(MapScreen, { ctx: ctxFor(over) })); } catch (e) { err = e; }
  ok(!err, `${label}: renders without throwing${err ? " — " + String(err && err.message).slice(0, 120) : ""}`);
  ok(!!html && check(html), `${label}: renders the expected content`);
}

// The exact regression, asserted by name: no render path may hand the
// scoreLabel OBJECT to React. (The render above already proves it; this line
// documents WHICH bug this smoke was born from.)
const one = renderToStaticMarkup(createElement(MapScreen, { ctx: ctxFor({ mapPreview: P() }) }));
ok(one.includes("9.2") && one.includes("wayfind-score-badge") && !one.includes("[object Object]"), "the score renders through the real WayfindScoreBadge, never the {s, word} object");

if (fail.length) { console.error(`test-map-render-smoke: ${fail.length} FAILURE(S)`); for (const f of fail) console.error("  ✗ " + f); process.exit(1); }
console.log(`test-map-render-smoke: OK — ${pass} assertions; MapScreen MOUNTED in ${STATES.length} states (pin-tap card with score/none/sparse, strip, drawer, events) — the #31 object-child class can no longer ship`);
