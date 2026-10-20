"use client";
// Route preview for one itinerary. Same MapLibre worker and OpenFreeMap bright
// style as app/components/MapView.js, drawn as a short card: ordered pins and
// a straight polyline through them. "Route it" still opens Google Maps.
import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import { safeRemoveMap } from "../../lib/mapTeardown";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";

function pointsOf(items) {
  return (items || [])
    .map((it, index) => {
      const place = it && it.place;
      if (!place || place.lat == null || place.lng == null) return null;
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, n: index + 1, name: place.name || "Stop" };
    })
    .filter(Boolean);
}

export default function ItineraryRouteMap({ items }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const pointsRef = useRef([]);
  const [failed, setFailed] = useState(false);
  const points = pointsOf(items);
  pointsRef.current = points;
  const signature = points.map((p) => p.lng + "," + p.lat + ":" + p.n).join("|");

  const draw = () => {
    const map = mapRef.current;
    const pts = pointsRef.current;
    if (!map || !map.isStyleLoaded()) return;
    markersRef.current.forEach((marker) => { try { marker.remove(); } catch (e) {} });
    markersRef.current = [];
    const coords = pts.map((p) => [p.lng, p.lat]);
    try {
      const source = map.getSource("wf-itinerary-route");
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords.length > 1 ? coords : [] },
        });
      }
    } catch (e) {}
    const bounds = new LngLatBounds();
    pts.forEach((p) => {
      const node = document.createElement("div");
      node.textContent = String(p.n);
      node.title = p.name;
      node.style.cssText = "width:22px;height:22px;border-radius:50%;background:#F97316;color:#0D1117;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)";
      markersRef.current.push(new Marker({ element: node, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(map));
      bounds.extend([p.lng, p.lat]);
    });
    if (!bounds.isEmpty()) {
      try { map.fitBounds(bounds, { padding: 36, maxZoom: 13, duration: 0 }); } catch (e) {}
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current || pointsRef.current.length === 0) return undefined;
    const first = pointsRef.current[0];
    let map;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [first.lng, first.lat],
        zoom: 11,
        attributionControl: true,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: true,
      });
    } catch (e) {
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    map.on("styleimagemissing", (e) => {
      try { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); } catch (err) {}
    });
    map.on("load", () => {
      try {
        map.addSource("wf-itinerary-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
        map.addLayer({
          id: "wf-itinerary-route-line",
          type: "line",
          source: "wf-itinerary-route",
          paint: { "line-color": "#F97316", "line-width": 3, "line-opacity": 0.9 },
        });
      } catch (e) {}
      draw();
    });
    map.on("error", (event) => {
      if (event && event.error && !map.loaded() && /style|tile|network/i.test(String(event.error.message || event.error))) setFailed(true);
    });
    return () => {
      markersRef.current.forEach((marker) => { try { marker.remove(); } catch (e) {} });
      markersRef.current = [];
      safeRemoveMap(map);
      mapRef.current = null;
    };
    // One map per card. Later stop edits redraw through `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length > 0]);

  useEffect(() => { draw(); }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!points.length) {
    return <div style={{ fontSize: 12.5, color: "#94A3B8", marginBottom: 12 }}>Add stops with a location to see the route.</div>;
  }
  return (
    <div aria-label="Trip route" style={{ position: "relative", height: 220, borderRadius: 16, overflow: "hidden", marginBottom: 14, border: "1px solid rgba(148,163,184,.35)", background: "#F3F0E8" }}>
      {failed ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 13, padding: 16, textAlign: "center" }}>Route preview unavailable. Route it still opens the stops in order.</div>
      ) : <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />}
    </div>
  );
}
