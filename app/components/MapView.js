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

// The user's own location, shown as the clean Wayfind brand pin: a hollow
// teardrop with nothing inside, so it reads as a true pinpoint on the map.
const PIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='40' viewBox='0 0 30 40'>" +
  "<path fill-rule='evenodd' fill='#F97316' stroke='#ffffff' stroke-width='1.3' d='M15 1.5 C8 1.5 2.7 6.7 2.7 13.6 C2.7 22.5 15 38 15 38 C15 38 27.3 22.5 27.3 13.6 C27.3 6.7 22 1.5 15 1.5 Z M15 8.2 a5.4 5.4 0 1 0 0.01 0 Z'/>" +
  "</svg>";

// Ranked place markers use the Wayfind pin shape with the rank number sitting in
// the pin's center, tinted by medal color so the top spots still read at a glance.
function placePinSVG(fill, num, numColor) {
  return "<svg xmlns='http://www.w3.org/2000/svg' width='34' height='44' viewBox='0 0 34 44'>" +
    "<path d='M17 1.5 C9 1.5 3 7.3 3 15 C3 25 17 42 17 42 C17 42 31 25 31 15 C31 7.3 25 1.5 17 1.5 Z' fill='" + fill + "' stroke='#0D1117' stroke-width='1.4'/>" +
    "<circle cx='17' cy='15' r='8.6' fill='#0D1117'/>" +
    "<text x='17' y='15' text-anchor='middle' dy='0.35em' font-family='Arial, Helvetica, sans-serif' font-size='11' font-weight='700' fill='" + numColor + "'>" + num + "</text>" +
    "</svg>";
}

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const circleRef = useRef(null);
  const lastCenterRef = useRef("");

  // Drawer rows hand us a focus target: fly to the pin so the list locates
  // instead of navigating away.
  useEffect(() => {
    if (!focus || focus.lat == null || !mapRef.current) return;
    try {
      mapRef.current.panTo({ lat: focus.lat, lng: focus.lng });
      const z = mapRef.current.getZoom ? mapRef.current.getZoom() : 12;
      if (z < 14) mapRef.current.setZoom(14);
    } catch (e) {}
  }, [focus && focus.ts]);

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
  }, [places, center, category, deviceLoc, events, fit]);

  function draw() {
    const map = mapRef.current;
    if (!map || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    // v4.4: simplified pin colors. Rank still reads through SIZE (below), so color
    // carries just three signals: gold = the #1 pick, blue = other open spots, gray =
    // closed right now, so closed places recede on the map too. The orange teardrop is
    // reserved for the user's own location and purple for event venues.
    const REST = "#4C8DFF";
    const CLOSED = "#5B6675";
    const bounds = new window.google.maps.LatLngBounds();

    (places || []).forEach((p, i) => {
      const fill = p.openNow === false ? CLOSED : (i === 0 ? "#FBBF24" : REST);
      const s = i === 0 ? 50 : i === 1 ? 45 : i === 2 ? 41 : i <= 4 ? 37 : 32;
      const w = Math.round((s * 34) / 44);
      const marker = new window.google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        // v5.38 a11y: title is Maps' supported accessible-name API — without
        // it every pin is an unnamed role="button" to screen readers.
        title: `${i + 1}. ${p.name || "Place"}`,
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(placePinSVG(fill, i + 1, "#ffffff")),
          scaledSize: new window.google.maps.Size(w, s),
          anchor: new window.google.maps.Point(Math.round(w / 2), s),
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
        strokeOpacity: 0.22,
        strokeWeight: 1,
        fillColor: "#F97316",
        fillOpacity: 0.03,
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
      if (fit && places && places.length > 0) {
        // v4.95 list-map mode: the user's location AND every listed place
        // must be visible at once so it's obvious which is closest.
        if (deviceLoc) bounds.extend(deviceLoc); else if (center) bounds.extend(center);
        map.fitBounds(bounds, { top: 60, right: 40, bottom: 80, left: 40 });
        if (places.length === 1) map.setZoom(14);
      } else if (places && places.length > 0) {
        // Always fit to the actual pins, not the search center.
        // This is what fixes the "only 1 pin visible" issue when places are
        // clustered 15+ miles from the address center.
        // Center on the user at a moderate zoom instead of fitting every pin,
        // which zoomed out across the whole region and read as overwhelming.
        // Distant pins sit off-screen until the user zooms out. Zoom is a
        // starting estimate; tune after seeing it live.
        if (center) { map.setCenter({ lat: center.lat, lng: center.lng }); map.setZoom(places.length === 1 ? 15 : 12); }
        else { map.fitBounds(bounds, { top: 60, right: 40, bottom: 80, left: 40 }); if (places.length === 1) map.setZoom(15); }
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
  { elementType: "geometry", stylers: [{ color: "#232b39" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0D1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#DCE3EC" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#1B4060" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9FC1DE" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#21392b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3d4759" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4d5870" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#AEB8C5" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
