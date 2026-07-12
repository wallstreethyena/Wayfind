"use client";
import { useEffect, useRef, useState } from "react";
import { getLoader } from "../../lib/google";

// Premium redesign (v5.55): when Google Maps can't load (missing/invalid key,
// network, quota), Google injects its own raw "Oops! Something went wrong"
// gray box into the container — a broken placeholder the spec forbids. We
// render an intentional branded preview instead: the Wayfind pin motif on the
// same dark map tone, honest about the state, with the parent's "Full map"
// action still layered on top. Never a half-loaded gray box.
function MapFallback({ count }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #1B2230 0%, #131A24 60%, #0D1117 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 20 }}>
      <svg width={34} height={45} viewBox="0 0 24 24" style={{ opacity: 0.9 }}><path fill="#F97316" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Z" /><circle cx="12" cy="10" r="3" fill="#0D1117" /></svg>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#CBD5E1" }}>{count > 0 ? `${count} ${count === 1 ? "spot" : "spots"} nearby` : "Map preview"}</div>
      <div style={{ fontSize: 12, color: "#94A3B8", maxWidth: 230, lineHeight: 1.5 }}>The interactive map is unavailable right now. Open the full map to explore.</div>
    </div>
  );
}

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

// ── Distance rings (main Map only) ────────────────────────────────────────
// Tripsy-style concentric rings centered on the search origin: native
// google.maps.Circle + a lightweight OverlayView label. No new deps. Purely
// decorative — Circles are clickable:false, labels are pointer-events:none, and
// both live on the overlay pane BELOW every marker, so a tap always hits a pin.
const MI_TO_M = 1609.344;
const RING_MI_STEPS = [0.25, 0.5, 1, 2, 5, 10, 25, 50];
const RING_STYLES = [
  { w: 1.5, op: 0.85, fill: 0.03 }, // innermost = the emphasized "close to you" zone
  { w: 1, op: 0.35, fill: 0 },
  { w: 1, op: 0.22, fill: 0 },
];
function fmtRingMi(mi) {
  const s = mi % 1 === 0 ? String(mi) : String(Number(mi.toFixed(2)));
  return s + "mi";
}
let RingLabelClass = null;
function ensureRingLabelClass() {
  if (RingLabelClass || typeof window === "undefined" || !window.google) return RingLabelClass;
  class RingLabel extends window.google.maps.OverlayView {
    constructor(position, text) { super(); this.pos = position; this.text = text; this.div = null; }
    onAdd() {
      const d = document.createElement("div");
      d.textContent = this.text;
      d.style.cssText = "position:absolute;transform:translate(-50%,-50%);font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:rgba(255,255,255,0.92);text-shadow:0 1px 3px rgba(0,0,0,0.85);pointer-events:none;white-space:nowrap;will-change:opacity;transition:opacity .2s ease;";
      this.div = d;
      const panes = this.getPanes();
      (panes.overlayLayer || panes.overlayMouseTarget || panes.floatPane).appendChild(d);
    }
    draw() {
      const proj = this.getProjection();
      if (!proj || !this.div) return;
      const p = proj.fromLatLngToDivPixel(new window.google.maps.LatLng(this.pos.lat, this.pos.lng));
      if (p) { this.div.style.left = Math.round(p.x) + "px"; this.div.style.top = Math.round(p.y) + "px"; }
    }
    onRemove() { if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div); this.div = null; }
    setOpacity(o) { if (this.div) this.div.style.opacity = String(o); }
  }
  RingLabelClass = RingLabel;
  return RingLabelClass;
}

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit, rings }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const circleRef = useRef(null);
  const lastCenterRef = useRef("");
  const anchorRef = useRef(null);
  const ringGenRef = useRef(null);
  const ringStateRef = useRef(null);
  const ringTimerRef = useRef(null);
  const ringListenerRef = useRef(null);
  const ringsOnRef = useRef(false);
  const [failed, setFailed] = useState(false);
  ringsOnRef.current = !!rings;

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
    // An INVALID key doesn't reject importLibrary — Google loads, then calls
    // this global and paints its own error box. Catch it and swap in the
    // branded preview. (A missing key or network failure rejects below.)
    const prevAuthFail = typeof window !== "undefined" ? window.gm_authFailure : undefined;
    if (typeof window !== "undefined") window.gm_authFailure = () => { try { prevAuthFail && prevAuthFail(); } catch (e) {} if (!cancelled) setFailed(true); };
    async function init() {
      try {
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
          if (ringsOnRef.current) {
            // Rings recompute only after a gesture settles (never per-frame):
            // debounce the map's own idle event ~150ms.
            ringListenerRef.current = mapRef.current.addListener("idle", () => {
              clearTimeout(ringTimerRef.current);
              ringTimerRef.current = setTimeout(() => recomputeRings(), 150);
            });
          }
        }
        draw();
      } catch (e) {
        // Loader rejects on a missing/invalid key or network failure. Show the
        // branded preview instead of letting Google paint its raw error box.
        if (!cancelled) setFailed(true);
      }
    }
    init();
    return () => { cancelled = true; if (typeof window !== "undefined") window.gm_authFailure = prevAuthFail; clearTimeout(ringTimerRef.current); if (ringListenerRef.current) { try { ringListenerRef.current.remove(); } catch (e) {} ringListenerRef.current = null; } clearRings(); };
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

    // Origin anchor for the distance rings: the user's own dot when we have it,
    // otherwise the geocoded center of the searched city.
    anchorRef.current = deviceLoc || center || null;

    // Boundary ring around the searched area. The small home-screen map card
    // keeps this single orange ring; the main Map replaces it with adaptive
    // distance rings (drawn on idle, below), so skip it when rings are on.
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (center && !ringsOnRef.current) {
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
    // On a fit (stateChanged) the viewport moves and the idle listener will
    // recompute with the settled bounds. When nothing re-fit (e.g. a locate-me
    // that only moved the user dot), recompute now against the live bounds.
    if (ringsOnRef.current && !stateChanged) recomputeRings();
  }

  // ── Distance-ring lifecycle ─────────────────────────────────────────────
  function destroyRingGen(gen) {
    if (!gen) return;
    gen.circles.forEach((o) => { try { o.c.setMap(null); } catch (e) {} });
    gen.labels.forEach((l) => { try { l.setMap(null); } catch (e) {} });
  }
  function clearRings() {
    if (ringGenRef.current) { destroyRingGen(ringGenRef.current); ringGenRef.current = null; }
    ringStateRef.current = null;
  }
  function buildRings(interval, single) {
    const map = mapRef.current; const anchor = anchorRef.current;
    if (!map || !anchor || !window.google) return;
    const Cls = ensureRingLabelClass();
    if (!Cls) return;
    const radiiMi = single ? [0.25] : [interval, interval * 2, interval * 3];
    const circles = []; const labels = [];
    radiiMi.forEach((mi, idx) => {
      const st = RING_STYLES[Math.min(idx, RING_STYLES.length - 1)];
      const rM = mi * MI_TO_M;
      const c = new window.google.maps.Circle({
        map, center: { lat: anchor.lat, lng: anchor.lng }, radius: rM,
        clickable: false, zIndex: 1,
        strokeColor: "#FFFFFF", strokeOpacity: st.op, strokeWeight: st.w,
        fillColor: "#FFFFFF", fillOpacity: st.fill,
      });
      circles.push({ c, op: st.op, fill: st.fill });
      const lbl = new Cls({ lat: anchor.lat + rM / 111320, lng: anchor.lng }, fmtRingMi(mi));
      lbl.setMap(map);
      labels.push(lbl);
    });
    const prev = ringGenRef.current;
    ringGenRef.current = { circles, labels };
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prev && prev.circles.length && !reduce) {
      // Crossfade old out / new in over ~200ms.
      circles.forEach((o) => o.c.setOptions({ strokeOpacity: 0, fillOpacity: 0 }));
      labels.forEach((l) => l.setOpacity(0));
      const now0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
      const dur = 200;
      const step = () => {
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : now0 + dur;
        const t = Math.min(1, (now - now0) / dur);
        circles.forEach((o) => o.c.setOptions({ strokeOpacity: o.op * t, fillOpacity: o.fill * t }));
        labels.forEach((l) => l.setOpacity(t));
        prev.circles.forEach((o) => o.c.setOptions({ strokeOpacity: o.op * (1 - t), fillOpacity: o.fill * (1 - t) }));
        prev.labels.forEach((l) => l.setOpacity(1 - t));
        if (t < 1) requestAnimationFrame(step); else destroyRingGen(prev);
      };
      requestAnimationFrame(step);
    } else if (prev) {
      destroyRingGen(prev);
    }
  }
  function recomputeRings() {
    const map = mapRef.current;
    if (!map || !ringsOnRef.current || !window.google) return;
    const anchor = anchorRef.current;
    if (!anchor) { clearRings(); return; }
    const bounds = map.getBounds && map.getBounds();
    if (!bounds) return;
    const anchorLL = new window.google.maps.LatLng(anchor.lat, anchor.lng);
    if (!bounds.contains(anchorLL)) return; // anchor panned off-screen: leave rings anchored, don't rescale
    const ne = bounds.getNorthEast(); const sw = bounds.getSouthWest();
    const cosLat = Math.max(0.02, Math.cos(anchor.lat * Math.PI / 180));
    const nearestMi = Math.min(
      (ne.lat() - anchor.lat) * 111320,
      (anchor.lat - sw.lat()) * 111320,
      (ne.lng() - anchor.lng) * 111320 * cosLat,
      (anchor.lng - sw.lng()) * 111320 * cosLat,
    ) / MI_TO_M;
    const ideal = (0.85 * nearestMi) / 3; // 3x the interval must fit in ~85% of the origin-to-nearest-edge span
    const anchorKey = anchor.lat.toFixed(5) + "," + anchor.lng.toFixed(5);
    if (ideal > 50) { // zoomed way out: hide the rings entirely
      const key = anchorKey + "|hidden";
      if (ringStateRef.current === key) return;
      clearRings(); ringStateRef.current = key; return;
    }
    let single = false; let interval;
    if (ideal < 0.25) { single = true; interval = 0.25; } // zoomed way in: a single 0.25mi ring
    else { interval = RING_MI_STEPS.filter((c) => c <= ideal).pop() || 0.25; }
    const key = anchorKey + "|" + (single ? "q" : interval);
    if (ringStateRef.current === key) return; // no interval/anchor change: keep the current rings
    ringStateRef.current = key;
    buildRings(interval, single);
  }

  if (failed) return <MapFallback count={(places || []).length} />;
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

const EVENT_PIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='34' viewBox='0 0 26 34'>" +
  "<path d='M13 1 C7 1 2.3 5.5 2.3 11.5 C2.3 19 13 32 13 32 C13 32 23.7 19 23.7 11.5 C23.7 5.5 19 1 13 1 Z' fill='#A78BFA' stroke='#0D1117' stroke-width='1.3'/>" +
  "<circle cx='13' cy='11.5' r='4.4' fill='#0D1117'/>" +
  "</svg>";

// Muted Apple-Maps-dark palette (Tripsy reference): deep-navy water, desaturated
// teal-green land, quiet roads, no business POI or shields — nothing on the base
// map competes with the Wayfind pins or the white distance rings.
const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1B3A33" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#AEBFC7" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0C151C" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#1B3A33" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#101C28" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5E7C90" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1E463C" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2A3B44" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8B9AA6" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#2F424C" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#334754" }] },
  { featureType: "road.highway", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
