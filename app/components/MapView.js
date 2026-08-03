"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { distanceRingData, MAP_RING_MILES, MAP_RING_MILES_ZOOMED_OUT } from "../../lib/mapExplorer";

// Below this zoom level the map is showing enough area that the 15mi ring
// is basically hugging the edge of the viewport, so the outer ring expands
// to 30mi (matching the remembered "zoom of 30 miles out... expanded to the
// last line 30"). 9.5 sits below both fixed init zooms (11 / 11.55) so
// normal framing never triggers it; it only kicks in once the user
// deliberately zooms out.
const RING_EXPAND_ZOOM_THRESHOLD = 9.5;

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
const MAP_STYLES = {
  bright: "https://tiles.openfreemap.org/styles/bright",
  "3d": "https://tiles.openfreemap.org/styles/3d",
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

function MapFallback({ count }) {
  return <div style={{ position: "absolute", inset: 0, background: "linear-gradient(145deg, #17212E 0%, #0A111B 72%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, padding: 22, textAlign: "center" }}>
    <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(148,163,184,.14)", border: "1px solid rgba(148,163,184,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{count ? `${count} places ready to explore` : "Map preview"}</div>
    <div style={{ maxWidth: 240, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>The map could not load right now. Your ranked results are still available below.</div>
  </div>;
}

// v6.94 (owner: "we do not have the pin we used to") — the MapLibre rewrite
// ("design release 01") dropped the actual pin SHAPES this app used with
// real Google Maps and replaced both with plain flat circles. Recovered
// verbatim from git history (commit 989e2d6, the original MapView.js) rather
// than redrawn from memory — same teardrop paths, same face detail on the
// origin pin, same purple event pin. Ranked PLACE pins are deliberately left
// as the existing native MapLibre circle+label layers below (not converted
// to teardrop DOM markers) — those were ALSO plain circles in the original
// Google Maps version (see medalColor()), so there is no regression there,
// and keeping them as one cheap vector layer instead of N DOM markers is
// what keeps the map fast to load with many places on screen.
// Color-parameterized (unlike the original, which only ever rendered orange
// for a real device GPS fix): current MapView also falls back to this same
// pin for the SEARCH CENTER when no device location is known, and that is a
// meaningfully different claim ("this is roughly where we're searching", not
// "this is you") — worth keeping visually distinct rather than collapsing
// both into one hardcoded color.
function originPinSvg(color) {
  return "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='40' viewBox='0 0 30 40'>" +
    "<path d='M15 1.5 C8 1.5 2.7 6.7 2.7 13.6 C2.7 22.5 15 38 15 38 C15 38 27.3 22.5 27.3 13.6 C27.3 6.7 22 1.5 15 1.5 Z' fill='" + color + "' stroke='#ffffff' stroke-width='1.2'/>" +
    "<circle cx='15' cy='13.4' r='8.2' fill='#0D1117'/>" +
    "<rect x='10.4' y='9.8' width='9.2' height='5.4' rx='1' fill='#ffffff'/>" +
    "<rect x='13' y='7.6' width='4' height='2.6' rx='0.6' fill='#ffffff'/>" +
    "<rect x='11.6' y='11.1' width='2' height='2.3' fill='#0D1117'/>" +
    "<rect x='16.4' y='11.1' width='2' height='2.3' fill='#0D1117'/>" +
    "<rect x='10.7' y='15.2' width='1.7' height='1.7' fill='#ffffff'/>" +
    "<rect x='13.6' y='15.2' width='1.7' height='1.7' fill='#ffffff'/>" +
    "<rect x='16.5' y='15.2' width='1.7' height='1.7' fill='" + color + "'/>" +
    "</svg>";
}
const WF_EVENT_PIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='34' viewBox='0 0 26 34'>" +
  "<path d='M13 1 C7 1 2.3 5.5 2.3 11.5 C2.3 19 13 32 13 32 C13 32 23.7 19 23.7 11.5 C23.7 5.5 19 1 13 1 Z' fill='#A78BFA' stroke='#0D1117' stroke-width='1.3'/>" +
  "<circle cx='13' cy='11.5' r='4.4' fill='#0D1117'/>" +
  "</svg>";

function markerNode({ label, color, kind, selected }) {
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.setAttribute("aria-label", label);
  if (kind === "origin" || kind === "event") {
    const w = kind === "origin" ? 30 : 26, h = kind === "origin" ? 40 : 34;
    el.style.cssText = "width:" + w + "px;height:" + h + "px;cursor:pointer;filter:drop-shadow(0 4px 8px rgba(0,0,0,.4));" + (selected ? "filter:drop-shadow(0 4px 8px rgba(0,0,0,.4)) drop-shadow(0 0 0 3px rgba(255,255,255,.35));" : "");
    el.innerHTML = kind === "origin" ? originPinSvg(color || "#F97316") : WF_EVENT_PIN_SVG;
    return el;
  }
  el.style.cssText = [
    "width:34px", "height:34px", "border-radius:50%", "border:2px solid rgba(255,255,255,.96)",
    "background:" + color,
    "box-shadow:0 5px 14px rgba(0,0,0,.34),0 0 " + (selected ? "4px" : "2px") + " rgba(255,255,255,.2)",
    "color:#fff;font:800 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "display:grid;place-items:center;padding:0;cursor:pointer",
  ].join(";");
  el.textContent = label.replace(/^\D*(\d+).*$/, "$1");
  return el;
}

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit, rings, compact = false, styleMode = "bright" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const lastOriginRef = useRef("");
  const placesByIdRef = useRef(new Map());
  const ringZoomedOutRef = useRef(false);
  const [failed, setFailed] = useState(false);

  const clearMarkers = () => {
    markersRef.current.forEach((marker) => { try { marker.remove(); } catch (e) {} });
    markersRef.current = [];
  };

  const redraw = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    clearMarkers();
    const bounds = new LngLatBounds();
    const ranked = (places || []).filter((p) => p && p.lat != null && p.lng != null).slice(0, 24);
    const eventList = (events || []).filter((e) => e && e.lat != null && e.lng != null);

    const placeFeatures = [];
    placesByIdRef.current = new Map();
    ranked.forEach((place, index) => {
      const categoryColor = { food: "#F97316", nightlife: "#A855F7", attractions: "#0EA5E9", family: "#14B8A6", hotels: "#6366F1", shopping: "#EC4899" }[category] || "#F97316";
      const color = place.openNow === false ? "#64748B" : index === 0 ? "#FBBF24" : categoryColor;
      const id = String(place.id || `map-place-${index}`);
      placesByIdRef.current.set(id, place);
      placeFeatures.push({ type: "Feature", properties: { id, rank: index + 1, color, name: place.name || "Place" }, geometry: { type: "Point", coordinates: [place.lng, place.lat] } });
      bounds.extend([place.lng, place.lat]);
    });
    const placeSource = map.getSource("wf-places");
    if (placeSource) placeSource.setData({ type: "FeatureCollection", features: placeFeatures });
    if (map.getLayer("wf-place-clusters")) {
      const clusterColor = { food: "#F97316", nightlife: "#A855F7", attractions: "#0EA5E9", family: "#14B8A6", hotels: "#6366F1", shopping: "#EC4899" }[category] || "#F97316";
      map.setPaintProperty("wf-place-clusters", "circle-color", clusterColor);
    }
    eventList.forEach((event) => {
      const node = markerNode({ label: event.venue || event.name || "Event", color: "#8B5CF6", kind: "event" });
      node.addEventListener("click", (e) => { e.stopPropagation(); onSelectEvent && onSelectEvent(event); });
      markersRef.current.push(new Marker({ element: node, anchor: "bottom" }).setLngLat([event.lng, event.lat]).addTo(map));
      bounds.extend([event.lng, event.lat]);
    });

    const origin = deviceLoc || center;
    if (origin && origin.lat != null && origin.lng != null) {
      const node = markerNode({ label: deviceLoc ? "Your location" : "Search center", color: deviceLoc ? "#3B82F6" : "#F97316", kind: "origin" });
      markersRef.current.push(new Marker({ element: node, anchor: "bottom" }).setLngLat([origin.lng, origin.lat]).addTo(map));
      if (fit) bounds.extend([origin.lng, origin.lat]);
    }

    const ringSource = map.getSource("wf-rings");
    const ringMiles = ringZoomedOutRef.current ? MAP_RING_MILES_ZOOMED_OUT : MAP_RING_MILES;
    const ringData = origin && rings ? distanceRingData(origin, ringMiles) : { type: "FeatureCollection", features: [] };
    if (ringSource) ringSource.setData(ringData);

    if (fit && !bounds.isEmpty()) map.fitBounds(bounds, { padding: { top: 64, right: 36, bottom: 92, left: 36 }, maxZoom: ranked.length <= 1 ? 14 : 12, duration: 550 });
    else if (origin) {
      const originKey = `${Number(origin.lat).toFixed(5)}|${Number(origin.lng).toFixed(5)}`;
      if (originKey !== lastOriginRef.current) {
        lastOriginRef.current = originKey;
        map.easeTo({ center: [origin.lng, origin.lat], zoom: rings ? 11.55 : 11, duration: 450 });
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const startingPoint = center || { lat: 27.5689, lng: -82.4393 };
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLES[styleMode] || MAP_STYLES.bright,
      center: [startingPoint.lng, startingPoint.lat],
      zoom: rings ? 11.55 : 11,
      pitch: styleMode === "3d" ? 55 : 0,
      attributionControl: true,
      // 3D needs pitch/rotation to actually read as 3D; the default flat
      // style keeps the simpler fixed-north interaction model this map
      // shipped with rather than defaulting everyone into rotate gestures.
      dragRotate: styleMode === "3d",
      pitchWithRotate: styleMode === "3d",
      cooperativeGestures: true,
    });
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
    const armWatchdog = () => { clearWatchdog(); watchdog = setTimeout(() => { watchdog = null; if (!map.loaded()) setFailed(true); }, 15000); };
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
      map.addSource("wf-places", { type: "geojson", cluster: true, clusterMaxZoom: 14, clusterRadius: 38, data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "wf-place-clusters", type: "circle", source: "wf-places", filter: ["has", "point_count"], paint: { "circle-color": "#F97316", "circle-radius": ["step", ["get", "point_count"], 19, 10, 23, 20, 27], "circle-stroke-width": 3, "circle-stroke-color": "rgba(255,255,255,.94)", "circle-opacity": .94 } });
      map.addLayer({ id: "wf-place-cluster-count", type: "symbol", source: "wf-places", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-allow-overlap": true }, paint: { "text-color": "#FFFFFF" } });
      map.addLayer({ id: "wf-place-pins", type: "circle", source: "wf-places", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["get", "color"], "circle-radius": 17, "circle-stroke-width": 3, "circle-stroke-color": "rgba(255,255,255,.96)", "circle-opacity": .96 } });
      map.addLayer({ id: "wf-place-ranks", type: "symbol", source: "wf-places", filter: ["!", ["has", "point_count"]], layout: { "text-field": ["to-string", ["get", "rank"]], "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": "#FFFFFF" } });
      map.addSource("wf-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "wf-rings-glow", type: "line", source: "wf-rings", filter: ["==", ["get", "kind"], "ring"], paint: { "line-color": "#F97316", "line-width": 6, "line-opacity": .18 } });
      map.addLayer({ id: "wf-rings-line", type: "line", source: "wf-rings", filter: ["==", ["get", "kind"], "ring"], paint: { "line-color": "#FDBA74", "line-width": 1.6, "line-opacity": .82 } });
      map.addLayer({ id: "wf-rings-label", type: "symbol", source: "wf-rings", filter: ["==", ["get", "kind"], "label"], layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, -.7], "text-allow-overlap": true }, paint: { "text-color": "#FFF7ED", "text-halo-color": "#111827", "text-halo-width": 2 } });
      redraw();
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
    map.on("error", (event) => { if (event && event.error && /style|tile|network/i.test(String(event.error.message || event.error))) { clearWatchdog(); setFailed(true); } });
    return () => { clearWatchdog(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility); clearMarkers(); map.remove(); mapRef.current = null; };
    // The map is intentionally created only once; state is projected in redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { redraw(); }, [places, center, category, deviceLoc, events, fit, rings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom-responsive ring expansion: when the user zooms out past
  // RING_EXPAND_ZOOM_THRESHOLD, swap the 5/10/15mi rings for 5/10/30mi;
  // swap back once they zoom back in. `zoom` fires continuously during a
  // drag-zoom, so the handler itself is cheap (just reads map.getZoom())
  // and only touches the source — recomputing the ring polygons — via a
  // trailing debounce, and only when the threshold is actually crossed.
  useEffect(() => {
    const map = mapRef.current;
    const origin = deviceLoc || center;
    if (!map || !rings || !origin || origin.lat == null || origin.lng == null) return undefined;
    let debounceId = null;
    const applyRingsForZoom = () => {
      const source = map.getSource("wf-rings");
      if (!source) return;
      const zoomedOut = map.getZoom() < RING_EXPAND_ZOOM_THRESHOLD;
      if (zoomedOut === ringZoomedOutRef.current) return;
      ringZoomedOutRef.current = zoomedOut;
      source.setData(distanceRingData(origin, zoomedOut ? MAP_RING_MILES_ZOOMED_OUT : MAP_RING_MILES));
    };
    const onZoom = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(applyRingsForZoom, 120);
    };
    map.on("zoom", onZoom);
    if (map.isStyleLoaded()) applyRingsForZoom();
    return () => {
      if (debounceId) clearTimeout(debounceId);
      map.off("zoom", onZoom);
    };
  }, [deviceLoc, center, rings]); // eslint-disable-line react-hooks/exhaustive-deps

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
      map.setStyle(MAP_STYLES[styleMode] || MAP_STYLES.bright);
      map.dragRotate[styleMode === "3d" ? "enable" : "disable"]();
      map.touchPitch[styleMode === "3d" ? "enable" : "disable"]();
      map.easeTo({ pitch: styleMode === "3d" ? 55 : 0, duration: 500 });
    } catch (e) {}
  }, [styleMode]);

  if (failed) return <MapFallback count={(places || []).length} />;
  // v6.99 — "bright" is a real light basemap (cream/white land, colored
  // parks and buildings), not the near-black "dark" style the filter/overlay
  // below used to be tuned for. A dark multiply overlay on a light style
  // would just muddy exactly the color/detail this was switched TO for, so
  // it is gone; a very small contrast lift is kept so the map still reads
  // crisply on OLED phone screens, same reasoning as before, opposite
  // direction.
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#F3F0E8" }}>
    <div ref={containerRef} style={{ position: "absolute", inset: 0, filter: "contrast(1.04) saturate(1.05)" }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", border: "1px solid rgba(15,23,42,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.4)" }} />
  </div>;
}
