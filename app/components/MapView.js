"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const MI_TO_M = 1609.344;

function MapFallback({ count }) {
  return <div style={{ position: "absolute", inset: 0, background: "linear-gradient(145deg, #17212E 0%, #0A111B 72%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, padding: 22, textAlign: "center" }}>
    <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(249,115,22,.14)", border: "1px solid rgba(249,115,22,.38)", display: "grid", placeItems: "center", color: "#FB923C", fontSize: 20 }}>⌁</div>
    <div style={{ fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{count ? `${count} places ready to explore` : "Map preview"}</div>
    <div style={{ maxWidth: 240, color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>The map could not load right now. Your ranked results are still available below.</div>
  </div>;
}

function markerNode({ label, color, kind, selected }) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.style.cssText = [
    "width:" + (kind === "origin" ? 18 : kind === "event" ? 30 : 34) + "px",
    "height:" + (kind === "origin" ? 18 : kind === "event" ? 30 : 34) + "px",
    "border-radius:50%",
    "border:2px solid rgba(255,255,255,.96)",
    "background:" + color,
    "box-shadow:0 5px 14px rgba(0,0,0,.28),0 0 0 " + (selected ? "4px" : "2px") + " rgba(255,255,255,.2)",
    "color:#fff;font:800 " + (kind === "origin" ? "0" : "12px") + "/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "display:grid;place-items:center;padding:0;cursor:pointer",
  ].join(";");
  if (kind === "event") el.innerHTML = "<span style='font-size:14px;line-height:1'>✦</span>";
  else if (kind !== "origin") el.textContent = label.replace(/^\D*(\d+).*$/, "$1");
  return el;
}

function circleFeature(center, miles) {
  const points = [];
  const lat = Number(center.lat);
  const lng = Number(center.lng);
  const radius = miles * MI_TO_M;
  for (let i = 0; i <= 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    const dLat = (radius * Math.cos(a)) / 111320;
    const dLng = (radius * Math.sin(a)) / (111320 * Math.max(.2, Math.cos(lat * Math.PI / 180)));
    points.push([lng + dLng, lat + dLat]);
  }
  return { type: "Feature", properties: { miles }, geometry: { type: "Polygon", coordinates: [points] } };
}

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit, rings, compact = false }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
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
    const ranked = (places || []).filter((p) => p && p.lat != null && p.lng != null);
    const eventList = (events || []).filter((e) => e && e.lat != null && e.lng != null);

    ranked.forEach((place, index) => {
      const color = place.openNow === false ? "#64748B" : index === 0 ? "#F59E0B" : "#F97316";
      const node = markerNode({ label: `${index + 1}. ${place.name || "Place"}`, color, selected: index === 0 });
      node.addEventListener("click", (event) => { event.stopPropagation(); onSelect && onSelect(place); });
      markersRef.current.push(new Marker({ element: node, anchor: "center" }).setLngLat([place.lng, place.lat]).addTo(map));
      bounds.extend([place.lng, place.lat]);
    });
    eventList.forEach((event) => {
      const node = markerNode({ label: event.venue || event.name || "Event", color: "#8B5CF6", kind: "event" });
      node.addEventListener("click", (e) => { e.stopPropagation(); onSelectEvent && onSelectEvent(event); });
      markersRef.current.push(new Marker({ element: node, anchor: "center" }).setLngLat([event.lng, event.lat]).addTo(map));
      bounds.extend([event.lng, event.lat]);
    });

    const origin = deviceLoc || center;
    if (origin && origin.lat != null && origin.lng != null) {
      const node = markerNode({ label: deviceLoc ? "Your location" : "Search center", color: deviceLoc ? "#3B82F6" : "#0F172A", kind: "origin" });
      markersRef.current.push(new Marker({ element: node, anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map));
      if (fit) bounds.extend([origin.lng, origin.lat]);
    }

    const ringSource = map.getSource("wf-rings");
    const ringData = origin && rings ? { type: "FeatureCollection", features: [1, 5, 10, 20].map((mi) => circleFeature(origin, mi)) } : { type: "FeatureCollection", features: [] };
    if (ringSource) ringSource.setData(ringData);

    if (fit && !bounds.isEmpty()) map.fitBounds(bounds, { padding: { top: 64, right: 36, bottom: 92, left: 36 }, maxZoom: ranked.length <= 1 ? 14 : 12, duration: 550 });
    else if (center && !ranked.length && !eventList.length) map.easeTo({ center: [center.lng, center.lat], zoom: 11, duration: 450 });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const startingPoint = center || { lat: 27.5689, lng: -82.4393 };
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [startingPoint.lng, startingPoint.lat],
      zoom: 11,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    if (!compact) map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      map.addSource("wf-rings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "wf-rings-fill", type: "fill", source: "wf-rings", paint: { "fill-color": "#F97316", "fill-opacity": .035 } });
      map.addLayer({ id: "wf-rings-line", type: "line", source: "wf-rings", paint: { "line-color": "#F97316", "line-width": 1.2, "line-opacity": .52 } });
      redraw();
    });
    map.on("error", (event) => { if (event && event.error && /style|tile|network/i.test(String(event.error.message || event.error))) setFailed(true); });
    return () => { clearMarkers(); map.remove(); mapRef.current = null; };
    // The map is intentionally created only once; state is projected in redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { redraw(); }, [places, center, category, deviceLoc, events, fit, rings]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || focus.lat == null || focus.lng == null) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 14), duration: 650, essential: true });
  }, [focus && focus.ts]);

  if (failed) return <MapFallback count={(places || []).length} />;
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: compact ? "#0C1420" : "#E7EBEF" }}>
    <div ref={containerRef} style={{ position: "absolute", inset: 0, filter: compact ? "saturate(.62) contrast(1.05) brightness(.73)" : undefined }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: compact ? "linear-gradient(160deg, rgba(3,8,14,.42), rgba(3,8,14,.16) 55%, rgba(3,8,14,.46))" : "linear-gradient(180deg, rgba(5,10,16,.04), transparent 28%, rgba(5,10,16,.14))", mixBlendMode: "multiply" }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", border: "1px solid rgba(15,23,42,.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)" }} />
  </div>;
}
