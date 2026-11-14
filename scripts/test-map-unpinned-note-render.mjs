#!/usr/bin/env node
/**
 * test-map-unpinned-note-render: the on-screen "N places not pinned" count must
 * equal the accounting, in every state where the note can stand, INCLUDING while
 * the "Search this area" pill is up.
 *
 * THE INCIDENT (synthetic-monitor RED for weeks, last 2026-11-03):
 *   the on-screen unpinned count matches the accounting - expected 19, got 0
 *   (list 39, pins 20, no-permitted-coordinate 19).
 * Map.js hid the note whenever `areaOffer && searchMapArea` (the "Search this
 * area" pill). Every list-scoped map fits to its pins, the fit moves the centre
 * more than 2.5mi off the search origin (lib/mapExplorer.js areaMoved), so the
 * offer is up almost immediately and the reader was told nothing about 19
 * unpinned places. The note stays now and the wrapper lifts clear of the pill.
 *
 * This guard MOUNTS the real MapScreen (the same ctx-injection seam as
 * test-map-render-smoke.mjs) with N rows the map may not draw and reads the
 * count back out of the rendered markup.
 */
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { SEARCH_PILL_NOTE_LIFT, MAP_NOTE_OFFSET } from "../lib/mapSafeArea.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const REPO = fileURLToPath(new URL("..", import.meta.url));
const entry = fileURLToPath(new URL("../app/components/screens/Map.js", import.meta.url));
const mod = await loadComponent(entry, REPO, { onGraph(graph) {
  const compiled = graph.get(entry);
  if (!compiled) throw new Error("MapScreen was not emitted");
  let source = readFileSync(compiled, "utf8");
  const seeds = [
    [/const \[areaPlaces, setAreaPlaces\] = useState\(\[\]\);/g, 'const [areaPlaces, setAreaPlaces] = useState(ctx.__mapSmokePlaces);'],
    [/const \[areaStatus, setAreaStatus\] = useState\("loading"\);/g, 'const [areaStatus, setAreaStatus] = useState(ctx.__mapSmokeStatus);'],
    [/const \[areaOffer, setAreaOffer\] = useState\(null\);/g, 'const [areaOffer, setAreaOffer] = useState(ctx.__mapSmokeAreaOffer || null);'],
  ];
  for (const [pattern, replacement] of seeds) {
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) throw new Error(`Expected one map state initializer, found ${matches.length}: ${pattern}`);
    source = source.replace(pattern, replacement);
  }
  writeFileSync(compiled, source);
  const runtimeEntry = fileURLToPath(new URL("../lib/appleMapsRuntime.js", import.meta.url));
  const runtimeCompiled = graph.get(runtimeEntry);
  if (!runtimeCompiled) throw new Error("Apple MapKit runtime was not emitted");
  writeFileSync(runtimeCompiled, "export const loadAppleMapKit = () => new Promise(() => {});\n");
} });
const MapScreen = mod.default;

const noop = () => {};
const P = (o) => ({ id: "ChIJpinned", name: "Pinned Cafe", lat: 27.5, lng: -82.5, photo: null, cuisine: "Cafe", type: "cafe", distMi: 1.2, price: "$$", wfScore: 92, governed_score: 92, category: "food", trending: false, ...o });
const ctxFor = (over = {}) => ({
  searchMapArea: noop, mapMode: "places", setMapMode: noop, mapBrowse: true, setMapBrowse: noop,
  mapPool: [], mapListOverride: null, map3D: false, setMap3D: noop, mapRetryKey: 0, setMapRetryKey: noop,
  cat: "food", setCat: noop, sub: "all", setSub: noop, setVibe: noop, sortBy: "fit",
  center: { lat: 27.5, lng: -82.5 }, deviceLoc: null, mapFocus: null, setMapFocus: noop, setMapSearchOpen: noop,
  events: [], eventsLoading: false, eventsUnavailable: false, mapDate: "all", setMapDate: noop,
  mapPreview: null, setMapPreview: noop, mapDrawer: false, setMapDrawer: noop, eventPreview: null, setEventPreview: noop,
  suggested: [], places: [], liked: {}, disliked: {}, featuredBoost: () => 0,
  MapView: () => null, CategoryMenu: () => null, FallbackImg: () => createElement("span", null),
  iconForPlace: () => "x", liveOpen: () => true, logEvent: noop, loadEvents: noop,
  openDetail: noop, openVenue: noop, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 },
  recenterToMe: noop, isBeach: () => false, beachSignals: {},
  PlaceCard: () => createElement("div", null, "place-card"), isSaved: () => false,
  toggleLike: noop, toggleDislike: noop, quickSaveFavorite: noop, addShared: noop, giveawayMark: noop,
  blurbs: {}, openExperience: noop, openCuisine: noop, cityNow: "Parrish",
  mapDefaultAppliedRef: { current: true },
  ...over,
});

const N = 19;
const unpinned = Array.from({ length: N }, (_, i) => P({ id: `ChIJnocoord${i}`, name: `No Coord ${i}`, mapCoord: { ok: false } }));
const pinnedRow = P({ coordAttribution: "\u00a9 OpenStreetMap contributors (ODbL)" });
const base = { view: [pinnedRow, ...unpinned], __mapSmokePlaces: [pinnedRow], __mapSmokeStatus: "ready" };
const OFFER = { lat: 27.6, lng: -82.3, bounds: null };

globalThis.window = {};
const render = (over) => {
  globalThis.window = {};
  const html = renderToStaticMarkup(createElement(MapScreen, { ctx: ctxFor(over) }));
  const list = globalThis.window.__wfMapList;
  const count = list?.counts?.["no-permitted-coordinate"] || 0;
  const text = list?.unpinnedNote || null;
  return { html, note: count > 0 && text ? { count, text } : null };
};

// A. Internal telemetry records N unpinned rows while customer-facing HTML stays clean.
let r0 = render(base);
let n = r0.note;
ok(!!n && n.count === N, `A: ${N} no-permitted-coordinate rows record ${N} in window.__wfMapList (got ${n ? n.count : "no note"})`);
ok(!!n && new RegExp(`^${N} of ${N + 1} places not pinned`).test(n.text), `A: telemetry note says "${N} of ${N + 1} places not pinned" (got ${n ? JSON.stringify(n.text) : "none"})`);
ok(!!n && /pinned/.test(n.text) && !/not pinned|confirming locations|data-wf-map-unpinned/i.test(r0.html), "A: telemetry keeps the word 'pinned' while customer-facing HTML never renders unpinned disclosures");
ok(!!n && !/[—–]/.test(n.text), "A: no dashes in the telemetry summary");

// B. With the Search-this-area pill up, telemetry still tracks the count and the ODbL credit wrapper lifts clear.
const rOffer = render({ ...base, searchMapArea: noop, __mapSmokeAreaOffer: OFFER });
const html = rOffer.html;
ok(/Search this area/.test(html), "B: probe finds the Search this area pill in this state (positive control)");
n = rOffer.note;
ok(!!n && n.count === N && !/data-wf-map-unpinned/.test(html), `B: with the Search-this-area pill up telemetry still reads ${N} and customer HTML stays clean`);
const wrap = html.match(/data-wf-map-notes[^>]*style="([^"]*)"/);
const bottomPx = wrap ? Number((wrap[1].match(/bottom:\s*(\d+)px/) || [])[1]) : NaN;
ok(bottomPx === MAP_NOTE_OFFSET.bottom + SEARCH_PILL_NOTE_LIFT, `B: the credit note wrapper lifts ${SEARCH_PILL_NOTE_LIFT}px clear of the pill (bottom ${bottomPx})`);

// C. no offer: wrapper sits at the base offset (the lift is only for the pill).
const plain = render(base).html.match(/data-wf-map-notes[^>]*style="([^"]*)"/);
ok(plain && Number((plain[1].match(/bottom:\s*(\d+)px/) || [])[1]) === MAP_NOTE_OFFSET.bottom, "C: without the pill the credit note sits at the base offset");

// D. every count tracks the accounting, not a constant.
for (const k of [1, 7, 38]) {
  const rows = Array.from({ length: k }, (_, i) => P({ id: `ChIJk${k}_${i}`, mapCoord: { ok: false } }));
  const r = render({ ...base, view: [pinnedRow, ...rows], __mapSmokeAreaOffer: OFFER });
  ok(!!r.note && r.note.count === k && !/not pinned/i.test(r.html), `D: ${k} unpinned rows record ${k} in telemetry with zero customer-facing disclosure`);
}

// E. nothing unpinned: no telemetry note at all.
ok(render({ ...base, view: [pinnedRow], __mapSmokeAreaOffer: OFFER }).note === null, "E: zero unpinned rows produce null unpinnedNote");

// F. customer-facing HTML never renders unpinned notes when drawer is open either.
ok(!/data-wf-map-unpinned|not pinned/i.test(render({ ...base, mapDrawer: true }).html), "F: open drawer customer HTML stays free of internal unpinned disclosures");

if (fail.length) { console.error(`FAIL ${fail.length}/${pass + fail.length}\n  ` + fail.join("\n  ")); process.exit(1); }
console.log(`ok: ${pass} assertions. The real MapScreen was mounted with ${N} no-permitted-coordinate rows, verifying internal telemetry accounting and zero customer-facing unpinned disclosures.`);
