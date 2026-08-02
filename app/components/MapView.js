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

// Was "https://tiles.openfreemap.org/styles/liberty" — liberty is a LIGHT
// basemap (background #f8f4f0, light-blue water) that this component then
// force-darkened with CSS filters (brightness .72-.73, a dark multiply
// overlay) to fit the app's near-black theme. That's a lossy compensation:
// it muddies the basemap and, worse, competes for attention with the vivid
// per-category pin colors and orange rings drawn on top. OpenFreeMap (same
// CDN, no API key, confirmed reachable) also serves "dark", a genuinely
// separate style (verified: distinct byte-for-byte JSON, near-black
// rgb(12,12,12) background, monochrome grayscale roads/water/parks — a
// dark-matter-style basemap purpose-built as a neutral backdrop for color
// overlays). Swapping to it needs far less corrective filtering below and
// lets the orange/purple/teal/pink pins and rings read clearly, which is
// what "pins were more beautiful, I could easily see things" is describing.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

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

function markerNode({ label, color, kind, selected }) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.style.cssText = [
    "width:" + (kind === "origin" ? 24 : kind === "event" ? 30 : 34) + "px",
    "height:" + (kind === "origin" ? 24 : kind === "event" ? 30 : 34) + "px",
    "border-radius:50%",
    "border:2px solid rgba(255,255,255,.96)",
    "background:" + color,
    "box-shadow:0 5px 14px rgba(0,0,0,.34),0 0 0 " + (kind === "origin" ? "7px rgba(249,115,22,.2)" : (selected ? "4px" : "2px") + " rgba(255,255,255,.2)"),
    "color:#fff;font:800 " + (kind === "origin" ? "0" : "12px") + "/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "display:grid;place-items:center;padding:0;cursor:pointer",
  ].join(";");
  if (kind === "event") el.innerHTML = "<span style='font-size:14px;line-height:1'>✦</span>";
  else if (kind !== "origin") el.textContent = label.replace(/^\D*(\d+).*$/, "$1");
  return el;
}

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit, rings, compact = false }) {
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
      markersRef.current.push(new Marker({ element: node, anchor: "center" }).setLngLat([event.lng, event.lat]).addTo(map));
      bounds.extend([event.lng, event.lat]);
    });

    const origin = deviceLoc || center;
    if (origin && origin.lat != null && origin.lng != null) {
      const node = markerNode({ label: deviceLoc ? "Your location" : "Search center", color: deviceLoc ? "#3B82F6" : "#F97316", kind: "origin" });
      markersRef.current.push(new Marker({ element: node, anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map));
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
      style: MAP_STYLE,
      center: [startingPoint.lng, startingPoint.lat],
      zoom: rings ? 11.55 : 11,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    if (!compact) map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    // Watchdog: the blank-map bug above produced NO error event, so `failed`
    // never flipped and users saw an empty panel with no explanation. If the
    // style has not loaded well after any plausible slow-network load, show
    // the fallback (which still lists the ranked results) rather than nothing.
    let watchdog = setTimeout(() => { watchdog = null; if (!map.loaded()) setFailed(true); }, 15000);
    const clearWatchdog = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };
    map.on("load", () => {
      clearWatchdog();
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
    return () => { clearWatchdog(); clearMarkers(); map.remove(); mapRef.current = null; };
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

  if (failed) return <MapFallback count={(places || []).length} />;
  // Filters below used to force a LIGHT basemap (liberty) dark: heavy
  // brightness reduction (.72-.73) plus a dark multiply overlay. Now that
  // MAP_STYLE is natively a near-black, grayscale basemap, that same heavy
  // dimming would crush it toward pure black and make roads/labels hard to
  // read — the opposite of "I could easily see things". Contrast/sharpness
  // is kept (slightly increased) so the muted basemap stays crisp, and
  // brightness/overlay are pulled back since there's no light background
  // left to hide.
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: compact ? "#0C1420" : "#0B1119" }}>
    <div ref={containerRef} style={{ position: "absolute", inset: 0, filter: compact ? "contrast(1.12) brightness(.98)" : "contrast(1.18) brightness(1.02)" }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: compact ? "linear-gradient(160deg, rgba(3,8,14,.22), rgba(3,8,14,.06) 55%, rgba(3,8,14,.26))" : "linear-gradient(160deg, rgba(3,8,20,.16), rgba(3,8,20,.02) 48%, rgba(3,8,20,.2))", mixBlendMode: "multiply" }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", border: "1px solid rgba(15,23,42,.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }} />
  </div>;
}
