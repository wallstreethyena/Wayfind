"use client";
import { paintMapPin, mapPinSvg, pinCategory } from "../../lib/mapPinStandard.js";
import MapCategoryPin from "./MapCategoryPin.js";
import { eventMapFamily } from "../../lib/eventMapPlaces.js";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { pinImageKey } from "../../lib/mapPinGlyph.js";
import { areaMoved, distanceRingData, MAP_RING_MILES } from "../../lib/mapExplorer";
import { safeRemoveMap } from "../../lib/mapTeardown";

// v8.23.3 — RING_EXPAND_ZOOM_THRESHOLD is GONE with the second ring set. See
// lib/mapExplorer.js: there is one scale now (5/10/15/20) and it does not
// change under the reader.
//
// Owner ask (2026-08-03): the map OPENS already framing its full radius rather
// than a tight ~10mi crop. Solved empirically then and unchanged now — at zoom
// 11.55 a 10mi ring spans roughly 40% of a phone viewport, so the full ring set
// needs about 2.3 levels further out to sit comfortably on screen. 9.15 still
// frames all four rings with room around the outermost; it was chosen for a
// 30mi outer ring, so a 20mi outer ring simply sits further inside the frame,
// which is the safe direction to be wrong in.
const MAP_DEFAULT_ZOOM = 9.15;

// v6.99 (owner: live Tripsy/Apple-Maps reference screenshots, "it needs to
// look amazing... smooth and have detail and easy to see not dark") — went
// through liberty (light, force-darkened with CSS filters — a lossy
// compensation that muddied the basemap) and dark (OpenFreeMap's own
// minimal near-black style — genuinely flat by design, no building fills,
// near-invisible water/parks even after repainting individual layers) before
// landing here. OpenFreeMap serves six public styles at this same free,
// unlimited, no-API-key CDN (confirmed live: positron, bright, liberty,
// dark, fiord, 3d) — "bright" is the rich one: ~150 layers, buildings
// rendered as their own fill layer, landuse split out by type (parks,
// schools, residential, commercial...), water and roads colored and
// hierarchied like a real consumer map, not a flat backdrop. That is the
// actual gap between "dark" and what Google Maps/Apple Maps look like — not
// a light/dark question, a DETAIL question. "3d" is the same free tier with
// extruded buildings, offered as an explicit user toggle (see styleMode)
// rather than the default, since it needs pitch/rotation enabled and this
// map's default interaction model is deliberately flat/simple.
// v7.19 — OpenFreeMap REMOVED its "3d" style (the URL 404s now; verified by
// curl 2026-08-11). Toggling 3D fetched a dead style, setStyle never loaded,
// and the watchdog dropped users onto the fallback (owner screenshot). 3D is
// now NATIVE: same bright style that already ships building footprints, plus
// a fill-extrusion layer + pitch — no second style fetch to die on.
const MAP_STYLES = {
  bright: "https://tiles.openfreemap.org/styles/bright",
  "3d": "https://tiles.openfreemap.org/styles/bright",
};
const MAP_STYLE = MAP_STYLES.bright;

// v6.43 — THE BLANK MAP. maplibre-gl v6 is ESM-only and derives its Web Worker
// URL from `import.meta.url`. Next 14's client webpack output replaces that
// with a build-time `file:///vercel/path0/...` literal; maplibre's own
// `/^https?:/` guard rejects it and falls back to "", and `new Worker("")`
// resolves against the document base — so the "worker" was the HTML page.
// All vector tile decoding happens in that worker, so the map drew nothing,
// and because no request actually failed, the error handler below never fired
// and users got a silent blank panel instead of MapFallback.
// Pointing maplibre at a real same-origin file fixes it. The file is vendored
// into public/maplibre/ by scripts/sync-maplibre-worker.mjs and guarded by
// scripts/test-map-worker.mjs in prebuild.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

function MapFallback({ count, onRetry }) {
  // v6.100 (owner: "you ar epissing e off", live screenshot of this exact
  // fallback right after the Bright-style ship) -- this used to be a dead
  // end: no way back to a working map short of a full page reload. onRetry
  // (wired by the parent via a remount key) tears down the stuck MapLibre
  // instance and gives it a fresh container + a fresh watchdog window, so a
  // transient failure -- slow cell connection, a backgrounded-tab stall --
  // recovers with one tap instead of stranding the user on this screen.
  return <div style={{ position: "absolute", inset: 0, background: "linear-gradient(145deg, #17212E 0%, #0A111B 72%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, padding: 22, textAlign: "center" }}>
    <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(148,163,184,.14)", border: "1px solid rgba(148,163,184,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{count ? `${count} places ready to explore` : "Map preview"}</div>
    <div style={{ maxWidth: 240, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>The map could not load right now. Your ranked results are still available below.</div>
    {onRetry ? <button onClick={onRetry} style={{ marginTop: 4, padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(249,115,22,.5)", background: "rgba(249,115,22,.14)", color: "#FB923C", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Try again</button> : null}
  </div>;
}

function ensureOriginPinCss() {
  if (typeof document === "undefined" || document.getElementById("wf-origin-pin-css")) return;
  const st = document.createElement("style");
  st.id = "wf-origin-pin-css";
  // OPACITY, NOT FILTER. The glow used to animate drop-shadow, which repaints
  // the marker forever — including while the map is idle — and drop-shadow is
  // one of the most expensive filters there is. A pulsing halo behind a static
  // shadow gets the same read for a compositor-only opacity animation.
  st.textContent = "@keyframes wfOriginGlow{0%,100%{opacity:.35}50%{opacity:.9}}"
    + ".wf-origin-pin{filter:drop-shadow(0 2px 3px rgba(15,23,35,.35))}"
    + ".wf-origin-pin:before{content:\"\";position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;"
    + "border-radius:50%;background:radial-gradient(circle,rgba(252,95,6,.85) 0%,rgba(252,95,6,0) 70%);"
    + "animation:wfOriginGlow 2.6s ease-in-out infinite;pointer-events:none;will-change:opacity}"
    + "@media (prefers-reduced-motion: reduce){.wf-origin-pin{animation:none}}";
  document.head.appendChild(st);
}

// v7.16 (owner, 2026-08-11, with a Google Maps reference screenshot: "can
// the location be more precise perhaps just a pin icon like the emoji
// because the circle covers too much… i want it to look more like image 3
// identically"). Place results are now PIN-shaped sprites — a small
// teardrop whose TIP sits on the exact coordinate (icon-anchor: bottom),
// like Google's saved-place pins — instead of 29-33px score circles whose
// body covered a neighborhood block. The score moved to the bottom card
// where it renders as the full Wayfind badge; the map's job is WHERE.
//
// Sprites are drawn once per color on a 2x canvas and registered with
// map.addImage (pixelRatio 2), so the pins stay ONE cheap symbol layer that
// clusters natively — never N DOM markers (the perf rule this file has
// always kept for places).
// THE PIN WAS AUTHORED AT 2x AND DRAWN AT UP TO 1.77x THAT. On a DPR-3 phone
// the SELECTED pin renders at 28 x 1.18 x 3 = 99 device pixels from a 56px
// source — a bilinear upscale, which is the blur and the doubled-looking edge
// the owner photographed (the 2.4px white stroke smeared over the offset drop
// shadow). Author at the real device ratio instead of assuming 2.
// v8.89 — 28x38 -> 34x46 (owner, 2026-08-29: "you cannot see the icon in
// these"). The head is what had to grow: at 28px the white disc was 14.4px
// across and the emoji inside it was drawn at 10px, then scaled to 0.9 by the
// layer — about nine device-independent pixels of picture. Nothing is legible
// at nine pixels.
//
// At 34 the head disc is 19px and the glyph 14px: roughly DOUBLE the drawn
// area. The pin is still smaller than a fingertip and the layer still collides
// and clusters exactly as before, so density is unchanged — this trades white
// space inside the pin for a picture, not screen space for pins.
const PIN_W = 34, PIN_H = 46;
const PIN_DPR = (() => {
  try {
    const d = typeof window !== "undefined" ? window.devicePixelRatio : 2;
    return Math.max(2, Math.min(3, Math.ceil(d || 2)));
  } catch (e) { return 2; }
})();
// Shared geometry and white category symbols also power Apple maps and legends.
function drawPinImageData(color, { selected = false, glyph = null, kind = "glyph" } = {}) {
  const W = PIN_W * PIN_DPR, H = PIN_H * PIN_DPR;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");
  g.scale(PIN_DPR, PIN_DPR);
  paintMapPin(g, glyph || "other", selected);
  return g.getImageData(0, 0, W, H);
}
function ensurePinImage(map, key, color, opts) {
  try {
    if (!map.hasImage(key)) map.addImage(key, drawPinImageData(color, opts), { pixelRatio: PIN_DPR });
  } catch (e) {}
}

function markerNode({ label, color, kind, selected }) {
  ensureOriginPinCss();
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("aria-label", label);
  if (kind === "origin" || kind === "event") {
    el.style.cssText = "width:34px;height:46px;cursor:pointer;position:relative;";
    el.className = kind === "origin" ? "wf-origin-pin" : "wf-event-pin";
    el.innerHTML = mapPinSvg(kind === "origin" ? (label === "Your location" ? "location" : "other") : "shows");
    return el;
  }

  el.style.cssText = "width:34px;height:46px;cursor:pointer;";
  el.innerHTML = mapPinSvg("other", { selected: !!selected });
  return el;
}

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit, rings, compact = false, styleMode = "bright", onRetry, selectedId = null, onAreaChange = null, showOrigin = true }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const lastOriginRef = useRef("");
  // v7.17 — "Search this area": the moveend listener is registered once, so
  // the live origin and callback ride refs rather than stale closures.
  const searchOriginRef = useRef(null);
  const onAreaChangeRef = useRef(null);
  const placesByIdRef = useRef(new Map());
  const [failed, setFailed] = useState(false);

  const clearMarkers = () => {
    markersRef.current.forEach((marker) => { try { marker.remove(); } catch (e) {} });
    markersRef.current = [];
  };

  searchOriginRef.current = deviceLoc || center || null;
  onAreaChangeRef.current = onAreaChange;

  const redraw = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    clearMarkers();
    const bounds = new LngLatBounds();
    // v7.16 — the owner called the old top-10/24 cap "thin… a lazy get
    // strategy". The pool is ALREADY fetched and ranked (no new API cost);
    // small pins can carry real density, so the map used to show up to 60.
    //
    // 2026-09-23 — THAT CAP IS GONE. The pin layer is a clustered GeoJSON
    // source (wf-places / wf-place-clusters below), not one DOM marker per
    // place, so hundreds of pins cost one setData call and cluster natively
    // at zoomed-out levels — there was never a rendering reason for 60. The
    // real reason to keep it was PARITY: the list this map sits beside can
    // now page past 400 rows (server offset paging, lib/inventoryServe.js),
    // and a map capped below the list's length would show fewer places than
    // the cards under it claim exist — the same "confident partial" failure
    // shape the read-side fix (Ryan's Coffee House, Parrish) exists to close,
    // just on the map instead of the shelf. The map now draws every place the
    // caller loaded; it is the caller's job to decide how many that is.
    const ranked = (places || []).filter((p) => p && p.lat != null && p.lng != null);
    const eventList = (events || []).filter((e) => e && e.lat != null && e.lng != null);

    const placeFeatures = [];
    placesByIdRef.current = new Map();
    ranked.forEach((place, index) => {
      const family = eventMapFamily(place, category);
      const color = pinCategory(family).color;
      const id = String(place.id || `map-place-${index}`);
      placesByIdRef.current.set(id, place);
      const rank = index + 1;
      const sel = selectedId != null && String(id) === String(selectedId) ? 1 : 0;
      // Every rank retains its category. Selection changes size, never category color.
      const mark = { text: family, kind: "category" };
      const img = pinImageKey(color, mark.text, !!sel);
      placeFeatures.push({ type: "Feature", properties: {
        id, rank, color, img, name: place.name || "Place",
        // Carried so the pin can be described to a screen reader and so a
        // future surface can read the same decision rather than re-deriving it.
        mark: mark.text, markKind: mark.kind,
        sel, anySel: selectedId != null ? 1 : 0,
      }, geometry: { type: "Point", coordinates: [place.lng, place.lat] } });
      bounds.extend([place.lng, place.lat]);
    });
    // Register a sprite for every (colour x mark x selected) this frame uses,
    // idempotently, BEFORE the data lands so no icon is ever missing. A
    // screenful is typically 8-12 distinct images — still ONE symbol layer,
    // which is the perf rule this file has kept for places since it was
    // written (never N DOM markers).
    for (const f of placeFeatures) {
      const p = f.properties;
      ensurePinImage(map, p.img, p.color, { selected: !!p.sel, glyph: p.mark, kind: p.markKind });
    }
    const placeSource = map.getSource("wf-places");
    if (placeSource) placeSource.setData({ type: "FeatureCollection", features: placeFeatures });
    // Diagnostic only, never a UI change — 2026-09-23. Lets a live check (or a
    // person with devtools open) confirm the map's pin membership matches the
    // list it sits beside for the same query/origin, without adding anything
    // a reader can see. Best-effort: a page without `window` (SSR) or a
    // hardened environment that blocks property writes must never break the
    // render over this.
    try {
      if (typeof window !== "undefined") {
        window.__wfMapPins = { ids: placeFeatures.map((f) => f.properties.id), at: Date.now() };
      }
    } catch (e) {}
    if (map.getLayer("wf-place-clusters")) {
      const clusterColor = { food: "#F97316", nightlife: "#A855F7", attractions: "#0EA5E9", family: "#14B8A6", hotels: "#6366F1", shopping: "#EC4899" }[category] || "#F97316";
      map.setPaintProperty("wf-place-clusters", "circle-stroke-color", clusterColor);
    }
    eventList.forEach((event) => {
      const node = markerNode({ label: event.venue || event.name || "Event", color: "#8B5CF6", kind: "event" });
      node.addEventListener("click", (e) => { e.stopPropagation(); onSelectEvent && onSelectEvent(event); });
      markersRef.current.push(new Marker({ element: node, anchor: "bottom" }).setLngLat([event.lng, event.lat]).addTo(map));
      bounds.extend([event.lng, event.lat]);
    });

    const origin = deviceLoc || center;
    // showOrigin=false — v8.94, the creator map. That surface has no search
    // centre and no device fix: its `center` is a CENTROID computed from the
    // creator's own pins purely so this map can be created at all (the init
    // effect below is keyed on having one). Dropping an "origin" pin there
    // would label a derived average as a place, which is the one thing a map
    // must never do. The pin is a claim; only draw it when it is true.
    if (showOrigin && origin && origin.lat != null && origin.lng != null) {
      const node = markerNode({ label: deviceLoc ? "Your location" : "Search center", color: deviceLoc ? "#3B82F6" : "#F97316", kind: "origin" });
      markersRef.current.push(new Marker({ element: node, anchor: "bottom" }).setLngLat([origin.lng, origin.lat]).addTo(map));
      if (fit) bounds.extend([origin.lng, origin.lat]);
    }

    const ringSource = map.getSource("wf-rings");
    const ringData = origin && rings ? distanceRingData(origin, MAP_RING_MILES) : { type: "FeatureCollection", features: [] };
    if (ringSource) ringSource.setData(ringData);

    if (fit && !bounds.isEmpty()) map.fitBounds(bounds, { padding: { top: 64, right: 36, bottom: 92, left: 36 }, maxZoom: ranked.length <= 1 ? 14 : 12, duration: 550 });
    else if (origin) {
      const originKey = `${Number(origin.lat).toFixed(5)}|${Number(origin.lng).toFixed(5)}`;
      if (originKey !== lastOriginRef.current) {
        lastOriginRef.current = originKey;
        map.easeTo({ center: [origin.lng, origin.lat], zoom: rings ? MAP_DEFAULT_ZOOM : 11, duration: 450 });
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    // Fail-closed: no visitor center → no map instance (and no Parrish/Sarasota
    // seed fill). hasCenter in the dep list re-runs this once a real center
    // arrives; later center refinements do not remount (hasCenter stays true).
    const startingPoint = center;
    if (!startingPoint || !Number.isFinite(Number(startingPoint.lat)) || !Number.isFinite(Number(startingPoint.lng))) return undefined;
    let map;
    try {
    map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLES[styleMode] || MAP_STYLES.bright,
      center: [startingPoint.lng, startingPoint.lat],
      zoom: rings ? MAP_DEFAULT_ZOOM : 11,
      pitch: styleMode === "3d" ? 55 : 0,
      attributionControl: true,
      // 3D needs pitch/rotation to actually read as 3D; the default flat
      // style keeps the simpler fixed-north interaction model this map
      // shipped with rather than defaulting everyone into rotate gestures.
      dragRotate: styleMode === "3d",
      pitchWithRotate: styleMode === "3d",
      // NO COOPERATIVE GESTURES ON THE FULL-SCREEN MAP. Owner: "the map
      // continues to be glitchy… moving around the screen is laggy."
      //
      // It was not lag. cooperativeGestures is a hard gate, not a hint: with
      // it on, maplibre refuses any drag with fewer than two touch points AND
      // its stylesheet relaxes the canvas to touch-action:pan-x pan-y, so the
      // browser takes a one-finger drag as a page scroll. The map does not
      // move, and a full-screen black scrim flashes up reading "Use two
      // fingers to move the map". Drag, nothing, flash, drag harder.
      //
      // It exists to stop a map embedded mid-article from eating the page
      // scroll. That is the `compact` preview's problem, not this one's — the
      // Map tab is the whole screen and has no page scroll to protect.
      cooperativeGestures: !!compact,
    });
    } catch (e) {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    if (!compact) map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    // Watchdog: the blank-map bug above produced NO error event, so `failed`
    // never flipped and users saw an empty panel with no explanation. If the
    // style has not loaded well after any plausible slow-network load, show
    // the fallback (which still lists the ranked results) rather than nothing.
    //
    // v6.96 (owner: "the map still not working, so many bugs") — reproduced
    // live on gowayfind.com/map: style, sprite, and tile requests all
    // succeeded (verified 200s down to the byte), yet the watchdog still
    // fired "could not load" every time. Root cause, traced into MapLibre's
    // own source (node_modules/maplibre-gl _render()): the "load" event and
    // the loaded()/_fullyLoaded flag this watchdog polls are BOTH only set
    // from inside the requestAnimationFrame-driven render loop — and Chrome
    // (and iOS Safari more aggressively) throttles or fully suspends rAF for
    // a tab that is backgrounded or not the active tab. So a real, fully-
    // fetched map can sit one unrendered frame away from "load" forever if
    // the tab isn't in the foreground for the first 15s — confirmed directly:
    // document.hidden was true in exactly this stuck state. That is not an
    // edge case on a phone: screen lock, an app switch, or just opening the
    // Map tab from a backgrounded PWA all do it, and once `failed` flips true
    // the container unmounts, so even coming back to the tab afterward can't
    // save the already-orphaned map.
    // Fix: don't run the countdown while the tab isn't visible (a user who
    // isn't looking hasn't experienced a failure yet), and when the tab
    // becomes visible again mid-load, force one repaint to un-stick the
    // render loop and hand it a fresh window instead of counting the
    // backgrounded time against it.
    let watchdog = null;
    const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };
    // v6.100 -- 15s was tuned against the old "dark" style (47 layers, ~21KB
    // style JSON). "bright" evaluates 119 layers (~48KB JSON, same tile
    // source/network cost, but real building/landuse/water detail to paint)
    // -- more CPU-bound style-layer work per frame before loaded() can flip,
    // which matters most on exactly the lower-end/cellular devices most
    // likely to hit this watchdog at all. Verified via curl: bright style
    // JSON is 48713 bytes vs dark's 20959 (2.3x), 119 vs 47 layers (2.5x);
    // the shared sprite atlas is byte-identical, so this is real render
    // headroom, not guessed. 26s gives roughly that same multiple of margin
    // over the original 15s tuned for dark.
    const armWatchdog = () => { clearWatchdog(); watchdog = setTimeout(() => { watchdog = null; if (!map.loaded()) setFailed(true); }, 26000); };
    const isHidden = () => typeof document !== "undefined" && document.hidden;
    if (!isHidden()) armWatchdog();
    const onVisibility = () => {
      if (isHidden()) { clearWatchdog(); return; }
      if (!map.loaded()) { try { map.triggerRepaint(); } catch (e) {} armWatchdog(); }
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    // OpenFreeMap's "dark" style references a couple of sprite icons (e.g.
    // "wood-pattern") its own sprite atlas doesn't ship — a third-party style
    // gap, not ours to fix upstream. Left unhandled it just logs a console
    // warning per missing icon; supplying a blank 1x1 here is the documented
    // MapLibre pattern for "this icon doesn't exist, render nothing" and
    // keeps the console clean without touching anything we actually draw.
    map.on("styleimagemissing", (e) => {
      try { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); } catch (err) {}
    });
    map.on("load", () => {
      clearWatchdog();
      // v6.99: "bright" ships proper per-layer colors already (water, parks,
      // buildings, roads all distinct out of the box, verified against the
      // live style JSON) — the v6.94/v6.98 water repaints above were working
      // around "dark"'s near-invisible flat palette and do not apply here.
      // Native 3D: extrude the bright style's own building footprints. Height
      // attrs where OSM has them, a believable 12m fallback where it doesn't.
      try {
        if (!map.getLayer("wf-3d-buildings")) map.addLayer({
          id: "wf-3d-buildings", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
          layout: { visibility: styleMode === "3d" ? "visible" : "none" },
          paint: {
            "fill-extrusion-color": "#D8D0C3",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.82,
          },
        });
      } catch (e) {}
      map.addSource("wf-places", { type: "geojson", cluster: true, clusterMaxZoom: 14, clusterRadius: 30, data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "wf-place-clusters", type: "circle", source: "wf-places", filter: ["has", "point_count"], paint: { "circle-color": "rgba(255,255,255,.97)", "circle-radius": ["step", ["get", "point_count"], 19, 10, 23, 20, 27], "circle-stroke-width": 3, "circle-stroke-color": "#F97316", "circle-opacity": .97 } });
      map.addLayer({ id: "wf-place-cluster-count", type: "symbol", source: "wf-places", filter: ["has", "point_count"], layout: { "text-field": ["concat", ["get", "point_count_abbreviated"], " spots"], "text-size": 10.5, "text-allow-overlap": true }, paint: { "text-color": "#0B0F14" } });
      // v7.16 — GOOGLE-STYLE PIN SPRITES (see drawPinImageData above).
      // One symbol layer, tip-on-coordinate, small footprint, native
      // clustering. Score text/halo/pointer layers are gone: the score
      // renders in the bottom card as the full Wayfind badge. Selected pin
      // swaps to the orange sprite and grows; when anything is selected the
      // rest drop back so the card reads as anchored to ONE place.
      const OPACITY = ["case", ["==", ["get", "sel"], 1], 1, ["==", ["get", "anySel"], 1], .5, .97];
      map.addLayer({ id: "wf-place-pins", type: "symbol", source: "wf-places", filter: ["!", ["has", "point_count"]], layout: {
        // v8.85 — the sprite key is resolved per feature (colour x mark x
        // selected) rather than rebuilt in an expression, because the mark is
        // now part of the identity of the image and a `concat` of an emoji
        // into an image id is not something to rely on.
        "icon-image": ["get", "img"],
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        // The top five carry a numeral, so they need the room to read it; the
        // rest sit back. 0.86 was tuned for a pin with a 4px dot in it.
        "icon-size": ["case", ["==", ["get", "sel"], 1], 1.1, ["<=", ["get", "rank"], 5], 1.0, 0.88],
      }, paint: { "icon-opacity": OPACITY } });
      map.addSource("wf-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "wf-rings-glow", type: "line", source: "wf-rings", filter: ["==", ["get", "kind"], "ring"], paint: { "line-color": "#F97316", "line-width": 6, "line-opacity": .18 } });
      map.addLayer({ id: "wf-rings-line", type: "line", source: "wf-rings", filter: ["==", ["get", "kind"], "ring"], paint: { "line-color": "#FDBA74", "line-width": 1.6, "line-opacity": .82 } });
      map.addLayer({ id: "wf-rings-label", type: "symbol", source: "wf-rings", filter: ["==", ["get", "kind"], "label"], layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, -.7], "text-allow-overlap": true }, paint: { "text-color": "#FFF7ED", "text-halo-color": "#111827", "text-halo-width": 2 } });
      redraw();
    });
    map.on("moveend", () => {
      const cb = onAreaChangeRef.current;
      if (!cb) return;
      try {
        const c = map.getCenter();
        const here = { lat: c.lat, lng: c.lng };
        cb(areaMoved(searchOriginRef.current, here) ? here : null);
      } catch (e) {}
    });
    map.on("click", "wf-place-clusters", (event) => {
      const feature = event.features && event.features[0];
      const clusterId = feature && feature.properties && feature.properties.cluster_id;
      const source = map.getSource("wf-places");
      if (clusterId == null || !source || typeof source.getClusterExpansionZoom !== "function") return;
      source.getClusterExpansionZoom(clusterId).then((zoom) => map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 420 })).catch(() => {});
    });
    map.on("click", "wf-place-pins", (event) => {
      const feature = event.features && event.features[0];
      const place = feature && placesByIdRef.current.get(String(feature.properties && feature.properties.id));
      if (place && onSelect) onSelect(place);
    });
    for (const layer of ["wf-place-clusters", "wf-place-pins"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
    // Owner ask (2026-08-03), layered on top of the retry/timeout fix above:
    // once the map has genuinely rendered once, a LATER error (a dropped
    // tile request while panning, a missing glyph, a flaky reconnect) is
    // normal map operation, not "the map could not load" -- only a failure
    // before the map's first successful load should ever trip the fallback.
    map.on("error", (event) => { if (event && event.error && !map.loaded() && /style|tile|network/i.test(String(event.error.message || event.error))) { clearWatchdog(); setFailed(true); } });
    return () => { clearWatchdog(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility); clearMarkers(); safeRemoveMap(map); mapRef.current = null; };
    // Created once a real center exists; hasCenter stays true so GPS refine
    // does not remount. Cleanup is idempotent — a half-init WebGL map cannot
    // throw on the way to /events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!(center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng)))]);

  useEffect(() => { redraw(); }, [places, center, category, deviceLoc, events, fit, rings, selectedId, showOrigin]); // eslint-disable-line react-hooks/exhaustive-deps

  // v8.23.3 — the zoom-responsive ring-expansion effect was REMOVED here. It
  // listened to every "zoom" event, debounced 120ms, and recomputed all the
  // ring polygons whenever the reader crossed 9.5 — work that existed only to
  // swap a 15mi ring for a 30mi one. With one fixed scale the rings are set
  // once alongside the markers and never recomputed on zoom at all.


  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || focus.lat == null || focus.lng == null) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 14), duration: 650, essential: true });
  }, [focus && focus.ts]);

  // v6.99 — 3D toggle: live-swap the style instead of remounting the whole
  // map (setStyle() keeps the camera/markers logic intact; only the source
  // effects above re-fire once the new style's "load" fires, which is why
  // they are keyed off map.on("load") rather than assumed to have already
  // run). Pitch/rotation only make sense once there is something to look at
  // from an angle, so they flip together with the style rather than always
  // being on.
  const prevStyleModeRef = useRef(styleMode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevStyleModeRef.current === styleMode) return;
    prevStyleModeRef.current = styleMode;
    try {
      // v7.19: both modes share ONE loaded style, so the swap is instant and
      // cannot fail a network fetch — flip the extrusion layer and the camera.
      if (map.getLayer("wf-3d-buildings")) map.setLayoutProperty("wf-3d-buildings", "visibility", styleMode === "3d" ? "visible" : "none");
      map.dragRotate[styleMode === "3d" ? "enable" : "disable"]();
      map.touchPitch[styleMode === "3d" ? "enable" : "disable"]();
      map.easeTo({ pitch: styleMode === "3d" ? 55 : 0, duration: 500 });
    } catch (e) {}
  }, [styleMode]);

  if (failed) return <MapFallback count={(places || []).length} onRetry={onRetry} />;
  // v6.99 — "bright" is a real light basemap (cream/white land, colored
  // parks and buildings), not the near-black "dark" style the filter/overlay
  // below used to be tuned for. A dark multiply overlay on a light style
  // would just muddy exactly the color/detail this was switched TO for, so
  // it is gone; a very small contrast lift is kept so the map still reads
  // crisply on OLED phone screens, same reasoning as before, opposite
  // direction.
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#F3F0E8" }}>
    {/* NO CSS FILTER ON THE CANVAS. A filter over a continuously repainting
        WebGL surface forces its own compositing layer and a full-viewport
        filter pass EVERY FRAME, and iOS commonly rasterizes filtered layers
        below device pixel ratio — which softened every pin as well as costing
        the frame budget. The 4% contrast lift is not worth either. */}
    {((places || []).length > 0 || (events || []).length > 0) && <div aria-label="Map category legend" style={{ position: "absolute", top: 10, left: 10, right: 54, zIndex: 2, display: "flex", gap: 12, overflowX: "auto", overscrollBehaviorX: "contain", padding: "6px 10px", borderRadius: 12, background: "rgba(10,15,23,.88)", color: "#fff", fontSize: 12 }}>
      {[...new Set((places || []).filter(p => p && p.lat != null && p.lng != null).slice(0, 60).map(p => eventMapFamily(p, category)))].map(family => <span key={family} style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><MapCategoryPin family={family} height={28} />{pinCategory(family).label}</span>)}
      {(events || []).length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}><MapCategoryPin family="shows" height={28} />Events</span>}
    </div>}
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", border: "1px solid rgba(15,23,42,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.4)" }} />
  </div>;
}
