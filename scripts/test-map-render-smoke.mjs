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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const mod = await loadComponent(fileURLToPath(new URL("../app/components/screens/Map.js", import.meta.url)), REPO);
const MapScreen = mod.default;
ok(typeof MapScreen === "function", "MapScreen has a default export");

const noop = () => {};
const P = (o) => ({ id: "ChIJsmoke", name: "Smoke Cafe", lat: 27.5, lng: -82.5, photo: null, cuisine: "Cafe", type: "cafe", distMi: 1.2, price: "$$", wfScore: 92, trending: false, ...o });
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
    MapView: () => null, CategoryMenu: () => null, FallbackImg: (p) => createElement("span", null),
    iconForPlace: () => "📍", liveOpen: () => true, logEvent: noop, loadEvents: noop,
    openDetail: noop, openVenue: noop, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 },
    recenterToMe: noop, isBeach: () => false, beachSignals: {},
    PlaceCard: () => createElement("div", null, "place-card"), isSaved: () => false,
    toggleLike: noop, toggleDislike: noop, quickSaveFavorite: noop, addShared: noop, giveawayMark: noop,
    blurbs: {}, openExperience: noop, openCuisine: noop, cityNow: "Sarasota",
    mapDefaultAppliedRef: { current: true },
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
  ["preview card, place with NO score (score law: badge absent, no fabrication)", { mapPreview: P({ wfScore: null }) }, (h) => !h.includes("wayfind-score-badge") && h.includes("data-iconic-place-card")],
  ["preview card, sparse place (no price/photo/distance)", { mapPreview: P({ price: null, distMi: null, cuisine: null }) }, (h) => h.includes("data-iconic-place-card")],
  ["collapsed list strip", {}, (h) => h.includes("ranked by fit")],
  ["open drawer renders the real PlaceCard seam", { mapDrawer: true }, (h) => h.includes("place-card")],
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
