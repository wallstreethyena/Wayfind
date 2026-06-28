"use client";
import { useEffect, useRef } from "react";
import { getLoader } from "../../lib/google";

const CAT_COLOR = {
  food: "#F97316",
  nightlife: "#F472B6",
  attractions: "#A78BFA",
  hotels: "#38BDF8",
  shopping: "#22C55E",
};

// Top spots get medal colors so ranking reads at a glance.
function medalColor(i) {
  if (i === 0) return "#FBBF24"; // gold
  if (i === 1) return "#CBD5E1"; // silver
  if (i >= 2 && i <= 4) return "#CD7F32"; // bronze (3rd-5th)
  return null;
}

// The user's own location, shown as a refined Wayfind pin: the creature is
// back, but slimmer and lighter so it doesn't overpower the map.
const PIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='40' viewBox='0 0 30 40'>" +
  "<path d='M15 1.5 C8 1.5 2.7 6.7 2.7 13.6 C2.7 22.5 15 38 15 38 C15 38 27.3 22.5 27.3 13.6 C27.3 6.7 22 1.5 15 1.5 Z' fill='#F97316' stroke='#ffffff' stroke-width='1.2'/>" +
  "<circle cx='15' cy='13.4' r='8.2' fill='#0D1117'/>" +
  "<rect x='10.4' y='9.8' width='9.2' height='5.4' rx='1' fill='#ffffff'/>" +
  "<rect x='13' y='7.6' width='4' height='2.6' rx='0.6' fill='#ffffff'/>" +
  "<rect x='11.6' y='11.1' width='2' height='2.3' fill='#0D1117'/>" +
  "<rect x='16.4' y='11.1' width='2' height='2.3' fill='#0D1117'/>" +
  "<rect x='10.7' y='15.2' width='1.7' height='1.7' fill='#ffffff'/>" +
  "<rect x='13.6' y='15.2' width='1.7' height='1.7' fill='#ffffff'/>" +
  "<rect x='16.5' y='15.2' width='1.7' height='1.7' fill='#F97316'/>" +
  "</svg>";

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const circleRef = useRef(null);
  const lastCenterRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { Map } = await getLoader().importLibrary("maps");
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = new Map(ref.current, {
          center: center || { lat: 27.5689, lng: -82.4393 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: DARK_STYLE,
        });
      }
      draw();
    }
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, center, category, deviceLoc, events]);

  function draw() {
    const map = mapRef.current;
    if (!map || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    // Ranks 1 to 5 keep the medal colors; everything else is one consistent
    // color (no per-category coloring), so the medal system stays the signal.
    const REST = "#4C8DFF";
    const bounds = new window.google.maps.LatLngBounds();

    (places || []).forEach((p, i) => {
      const fill = medalColor(i) || REST;
      const scale = i === 0 ? 21 : i === 1 ? 18 : i === 2 ? 16 : i <= 4 ? 13.5 : 11;
      const labelSize = i <= 2 ? "13px" : i <= 4 ? "12px" : "10px";
      const marker = new window.google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        label: { text: String(i + 1), color: i <= 4 ? "#0D1117" : "#fff", fontSize: labelSize, fontWeight: "700" },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: fill,
          fillOpacity: 1,
          strokeColor: "#0D1117",
          strokeWeight: 2,
        },
        zIndex: i <= 4 ? 500 - i : 100,
      });
      marker.addListener("click", () => onSelect && onSelect(p));
      markersRef.current.push(marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    });

    // Event venue markers (purple pins), shown when the map is in events mode.
    const evList = (events || []).filter((e) => e && e.lat != null && e.lng != null);
    evList.forEach((ev) => {
      const m = new window.google.maps.Marker({
        position: { lat: ev.lat, lng: ev.lng },
        map,
        title: ev.venue || ev.name || "Event",
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(EVENT_PIN_SVG),
          scaledSize: new window.google.maps.Size(26, 34),
          anchor: new window.google.maps.Point(13, 32),
        },
        zIndex: 400,
      });
      m.addListener("click", () => onSelectEvent && onSelectEvent(ev));
      markersRef.current.push(m);
      bounds.extend({ lat: ev.lat, lng: ev.lng });
    });

    // Boundary ring around the searched area.
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (center) {
      circleRef.current = new window.google.maps.Circle({
        map,
        center: { lat: center.lat, lng: center.lng },
        radius: 14000,
        strokeColor: "#F97316",
        strokeOpacity: 0.55,
        strokeWeight: 2,
        fillColor: "#F97316",
        fillOpacity: 0.05,
        clickable: false,
      });
    }

    // The user's own location, shown as the Wayfind pin.
    if (deviceLoc) {
      const pin = new window.google.maps.Marker({
        position: deviceLoc,
        map,
        zIndex: 999,
        title: "Your location",
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(PIN_SVG),
          scaledSize: new window.google.maps.Size(30, 40),
          anchor: new window.google.maps.Point(15, 38),
        },
      });
      markersRef.current.push(pin);
    }

    // Track center + first-5 place IDs together so we re-fit whenever data changes
    // but don't snap the map back while the user is panning between draws.
    const cc = center ? `${center.lat.toFixed(4)},${center.lng.toFixed(4)}` : "";
    const placeKey = (places || []).slice(0, 5).map((p) => p.id || "").join(",");
    const stateKey = cc + "|" + placeKey;
    const stateChanged = stateKey !== lastCenterRef.current;

    if (stateChanged) {
      lastCenterRef.current = stateKey;
      if (places && places.length > 0) {
        // Always fit to the actual pins, not the search center.
        // This is what fixes the "only 1 pin visible" issue when places are
        // clustered 15+ miles from the address center.
        map.fitBounds(bounds, { top: 60, right: 40, bottom: 80, left: 40 });
        if (places.length === 1) map.setZoom(15);
      } else if (evList.length > 0) {
        map.fitBounds(bounds, 60);
      } else if (center) {
        map.setCenter({ lat: center.lat, lng: center.lng });
        map.setZoom(12);
      }
    }
  }

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

const EVENT_PIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='34' viewBox='0 0 26 34'>" +
  "<path d='M13 1 C7 1 2.3 5.5 2.3 11.5 C2.3 19 13 32 13 32 C13 32 23.7 19 23.7 11.5 C23.7 5.5 19 1 13 1 Z' fill='#A78BFA' stroke='#0D1117' stroke-width='1.3'/>" +
  "<circle cx='13' cy='11.5' r='4.4' fill='#0D1117'/>" +
  "</svg>";

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2330" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0D1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9AA5B1" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1726" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3140" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7c8794" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
