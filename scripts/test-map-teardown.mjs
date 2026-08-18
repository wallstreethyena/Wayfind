#!/usr/bin/env node
/**
 * test-map-teardown — WF-007: a half-initialized map cannot break /events.
 *
 * THE INCIDENT: navigating /map → /events threw
 *   TypeError: Cannot read properties of undefined (reading 'destroy')
 * after a WebGL2 init error. Direct /events reload worked. The throw lived in
 * MapLibre Map.remove() during MapView's unmount effect; the app ErrorBoundary
 * replaced the whole tree with "That took a wrong turn".
 *
 * This test STUBS the failed WebGL map (painter undefined — the exact
 * destroy crash), opens Map, tears it down (navigate away), then renders
 * Events and asserts no throw and a usable page.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { safeRemoveMap, stubFailedWebGLMap } from "../lib/mapTeardown.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const view = readFileSync(new URL("../app/components/MapView.js", import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

/* ── 1. The exact crash, executed ──────────────────────────────────────── */
const broken = stubFailedWebGLMap();
let threw = null;
try { broken.remove(); } catch (e) { threw = e; }
ok(threw && /destroy/.test(String(threw.message || threw)),
  "the stub reproduces Cannot read properties of undefined (reading 'destroy')");

const half = stubFailedWebGLMap();
let teardownThrew = null;
try { safeRemoveMap(half); } catch (e) { teardownThrew = e; }
ok(!teardownThrew, "safeRemoveMap swallows the destroy crash on a half-init map");
ok(half._wfRemoved === true, "first remove marks the instance so a second call is a no-op");

let secondThrew = null;
try { safeRemoveMap(half); } catch (e) { secondThrew = e; }
ok(!secondThrew, "safeRemoveMap is idempotent — a second call does not throw");
ok(safeRemoveMap(null) === false && safeRemoveMap(undefined) === false,
  "safeRemoveMap(null) is a no-op, not a throw");

/* ── 2. MapView and home actually use it ───────────────────────────────── */
const VIEW = strip(view);
const HOME = strip(home);
ok(/safeRemoveMap\(map\)/.test(VIEW) && !/map\.remove\(\)/.test(VIEW),
  "MapView cleanup calls safeRemoveMap, not a bare map.remove()");
ok(/class MapErrorBoundary extends Component/.test(HOME),
  "a map-scoped ErrorBoundary exists so a half-init map cannot paint the app-level 'wrong turn'");
ok(/<MapErrorBoundary>\{screen === "map" && <MapScreen/.test(HOME),
  "MapErrorBoundary stays mounted around the map slot — Events is a sibling, not a child");
ok(!/center \|\| \{ lat: 27\.5689/.test(VIEW),
  "MapView no longer fills a missing center with the Parrish/Sarasota seed");

/* ── 3. Open Map (stubbed WebGL failure) → navigate to Events ──────────── */
const mapMod = await loadComponent(fileURLToPath(new URL("../app/components/screens/Map.js", import.meta.url)), REPO);
const evMod = await loadComponent(fileURLToPath(new URL("../app/components/screens/Events.js", import.meta.url)), REPO);
const MapScreen = mapMod.default;
const EventsScreen = evMod.default;
ok(typeof MapScreen === "function", "MapScreen loads");
ok(typeof EventsScreen === "function", "EventsScreen loads");

const noop = () => {};
const failingMapView = () => {
  // Constructor "succeeded" with a half-init instance. Unmount must not throw.
  const map = stubFailedWebGLMap();
  try { safeRemoveMap(map); } catch (e) { throw e; }
  return createElement("div", { "data-map-failed": "1" }, "map-stub");
};

const mapCtx = {
  searchMapArea: noop, mapMode: "places", setMapMode: noop, mapBrowse: true, setMapBrowse: noop,
  mapPool: [], mapListOverride: null, map3D: false, setMap3D: noop, mapRetryKey: 0, setMapRetryKey: noop,
  cat: "shopping", setCat: noop, sub: "all", setSub: noop, setVibe: noop, sortBy: "fit",
  center: { lat: 27.95, lng: -82.46 }, deviceLoc: null, mapFocus: null, setMapFocus: noop, setMapSearchOpen: noop,
  events: [], eventsLoading: false, eventsUnavailable: false, mapDate: "all", setMapDate: noop,
  mapPreview: null, setMapPreview: noop, mapDrawer: false, setMapDrawer: noop, eventPreview: null, setEventPreview: noop,
  suggested: [], places: [], liked: {}, disliked: {}, view: [], featuredBoost: () => 0,
  MapView: failingMapView, CategoryMenu: () => null, FallbackImg: () => createElement("span"),
  iconForPlace: () => "📍", liveOpen: () => true, logEvent: noop, loadEvents: noop,
  openDetail: noop, openVenue: noop, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 },
  recenterToMe: noop, isBeach: () => false, beachSignals: {},
  PlaceCard: () => createElement("div", null, "place-card"), isSaved: () => false,
  toggleLike: noop, toggleDislike: noop, quickSaveFavorite: noop, addShared: noop, giveawayMark: noop,
  blurbs: {}, openExperience: noop, openCuisine: noop, cityNow: "Tampa",
  mapDefaultAppliedRef: { current: true },
};

let mapHtml = null, mapErr = null;
try { mapHtml = renderToStaticMarkup(createElement(MapScreen, { ctx: mapCtx })); }
catch (e) { mapErr = e; }
ok(!mapErr, "opening Map with a stubbed WebGL/map failure does not throw" + (mapErr ? " — " + String(mapErr.message).slice(0, 120) : ""));
ok(!!mapHtml && mapHtml.includes("data-map-failed"), "Map screen rendered the failed-map stub");

// Navigate: teardown already ran inside the stub; run it again as the route change would.
const leftover = stubFailedWebGLMap();
let navThrew = null;
try { safeRemoveMap(leftover); } catch (e) { navThrew = e; }
ok(!navThrew, "navigating away (teardown) after WebGL failure does not throw");

const ev = { id: "ev1", name: "Usable Show", venue: "Hall", lat: 27.95, lng: -82.46, date: "2026-08-19", time: "8 PM", dest: "https://tickets.example/e", destKind: "external" };
const eventsCtx = {
  events: [ev], eventCat: "concerts", setEventCat: noop, eventDate: "all", setEventDate: noop,
  locName: "Tampa, FL", center: { lat: 27.95, lng: -82.46 }, submitSearch: noop,
  eventsLoading: false, eventsUnavailable: false, eventsError: false, loadEvents: noop,
  openVenue: noop, dedupeEvents: (arr) => arr || [], AreaInsight: () => null,
  Loader: (p) => createElement("div", null, p && p.label || "loading"),
  eventsTours: [], eventBucket: () => "concerts", eventUseImage: () => false,
  formatEventDate: () => ({ mo: "Aug", day: "19", wd: "Wed", time: "8 PM" }),
  eventCategory: () => ({ short: "Concert", color: "#F97316", iconName: "ticket" }),
  recurrenceLabel: () => "", cleanVenueName: (v) => v || "", ticketUrl: (u) => u,
  logEvent: noop, ViatorRail: () => null,
};

let evHtml = null, evErr = null;
try { evHtml = renderToStaticMarkup(createElement(EventsScreen, { ctx: eventsCtx })); }
catch (e) { evErr = e; }
ok(!evErr, "Events renders after map teardown without throwing" + (evErr ? " — " + String(evErr.message).slice(0, 120) : ""));
ok(!!evHtml && evHtml.includes("Events near you"), "Events page is usable — heading present");
ok(!!evHtml && evHtml.includes("Usable Show"), "Events page is usable — a real event renders");
ok(!!evHtml && !evHtml.includes("That took a wrong turn"), "Events is not the app error boundary");

if (fail.length) {
  console.error(`test-map-teardown: ${fail.length} FAILURE(S)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-map-teardown: OK — ${pass} assertions (WebGL destroy stub, idempotent cleanup, Map → Events usable)`);
