"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
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
const WF_EVENT_PIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='34' viewBox='0 0 26 34'>" +
  "<path d='M13 1 C7 1 2.3 5.5 2.3 11.5 C2.3 19 13 32 13 32 C13 32 23.7 19 23.7 11.5 C23.7 5.5 19 1 13 1 Z' fill='#A78BFA' stroke='#0D1117' stroke-width='1.3'/>" +
  "<circle cx='13' cy='11.5' r='4.4' fill='#0D1117'/>" +
  "</svg>";

// The pulse lives on the GLOW, not the pin: scaling the mark itself would move
// its tip off the coordinate every frame. Injected once, and disabled entirely
// under prefers-reduced-motion.
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
const PIN_W = 28, PIN_H = 38;
const PIN_DPR = (() => {
  try {
    const d = typeof window !== "undefined" ? window.devicePixelRatio : 2;
    return Math.max(2, Math.min(3, Math.ceil(d || 2)));
  } catch (e) { return 2; }
})();
function drawPinImageData(color, { selected = false } = {}) {
  const W = PIN_W * PIN_DPR, H = PIN_H * PIN_DPR;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");
  g.scale(PIN_DPR, PIN_DPR);
  // Teardrop: head circle r≈10 centred at (14,12), tip at (14,36).
  const path = new Path2D("M14 36 C 9.2 27.5 4 21.5 4 12.6 A 10 10 0 1 1 24 12.6 C 24 21.5 18.8 27.5 14 36 Z");
  g.shadowColor = "rgba(15,23,35,.38)"; g.shadowBlur = 3.5; g.shadowOffsetY = 1.5;
  g.fillStyle = selected ? "#F97316" : color;
  g.fill(path);
  g.shadowColor = "transparent";
  g.lineWidth = selected ? 2.4 : 2;
  g.strokeStyle = "#FFFFFF";
  g.stroke(path);
  g.beginPath(); g.arc(14, 12.6, selected ? 4.6 : 3.9, 0, Math.PI * 2);
  g.fillStyle = "#FFFFFF"; g.fill();
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
    // TICKET 4b — THE USER IS THE WAYFIND PIN.
    //
    // It was drawn as a generic pin in the same visual language as places, so
    // the user's own position read as a search result. Now it is the brand mark
    // itself (public/brand/wayfind-pin.svg — 32x36, gradient, transparent
    // centre, no glow halo baked in).
    //
    // OUTLINE PIN = YOU. FILLED CIRCLE WITH A RANK = SOMEWHERE WE RECOMMEND.
    // The two vocabularies must never converge; that is the whole point.
    //
    // anchor:"bottom" on the Marker puts the element's BOTTOM EDGE on the
    // coordinate, so the pin's tip lands on the true position rather than its
    // centre — verified against a known lat/lng, not by eye.
    if (kind === "origin") {
      // v8.23.3 — THE EMOJI, AT LAST, AND ON THE OWNER'S SECOND ASK.
      //
      // v7.16 recorded the request in these exact words — "can the location be
      // more precise perhaps just a pin icon LIKE THE EMOJI because the circle
      // covers too much" — and what shipped was a brand-drawn pin, then a neon
      // variant in v7.19. Owner, 2026-08-19, on the live map: "can we make the
      // current location the pin emoji". Third time asked, second time as an
      // explicit instruction; it is the emoji now.
      //
      // WHAT MUST SURVIVE THE SWAP, and does:
      //   · THE TIP ON THE COORDINATE. The Marker is anchor:"bottom", so the
      //     element's bottom edge sits on the true lat/lng. U+1F4CD points down
      //     from its own baseline, so its point lands where the SVG's did.
      //   · THE TWO VOCABULARIES STAY APART. "You" is a single unranked glyph;
      //     a recommendation is a teardrop sprite carrying a rank. They must
      //     never converge (check-brand-pin), and an emoji diverges further
      //     from a ranked sprite than the brand pin ever did.
      //   · THE PULSE STAYS ON THE GLOW, not the mark. Scaling the glyph would
      //     walk its tip off the coordinate every frame; .wf-origin-pin:before
      //     animates opacity only, and reduced-motion still kills it.
      //
      // font-size drives the box: 26px of glyph in a 30x34 element, centred, so
      // the halo behind it stays concentric on every platform's rendering.
      el.style.cssText = "width:30px;height:34px;cursor:pointer;position:relative;";
      el.innerHTML =
        // Ground shadow, so it sits ON the map instead of floating above it.
        '<span aria-hidden="true" style="position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);width:15px;height:5px;border-radius:50%;background:rgba(15,23,35,.34);filter:blur(1.5px)"></span>' +
        '<span aria-hidden="true" class="wf-origin-pin" style="display:block;position:relative;width:30px;height:34px;line-height:34px;text-align:center;font-size:26px;' +
        'font-family:\'Apple Color Emoji\',\'Segoe UI Emoji\',\'Noto Color Emoji\',sans-serif;' +
        'filter:drop-shadow(0 0 5px rgba(252,95,6,.75)) drop-shadow(0 2px 3px rgba(15,23,35,.35))">\u{1F4CD}</span>';
      return el;
    }
    const w = 26, h = 34;
    el.style.cssText = "width:" + w + "px;height:" + h + "px;cursor:pointer;filter:drop-shadow(0 4px 8px rgba(0,0,0,.4));" + (selected ? "filter:drop-shadow(0 4px 8px rgba(0,0,0,.4)) drop-shadow(0 0 0 3px rgba(255,255,255,.35));" : "");
    el.innerHTML = WF_EVENT_PIN_SVG;   // origin returned above; only events reach here
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

export default function MapView({ places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus, fit, rings, compact = false, styleMode = "bright", onRetry, selectedId = null, onAreaChange = null }) {
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
    // small pins can carry real density, so the map now shows up to 60.
    const ranked = (places || []).filter((p) => p && p.lat != null && p.lng != null).slice(0, 60);
    const eventList = (events || []).filter((e) => e && e.lat != null && e.lng != null);

    const placeFeatures = [];
    placesByIdRef.current = new Map();
    ranked.forEach((place, index) => {
      const categoryColor = { food: "#F97316", nightlife: "#A855F7", attractions: "#0EA5E9", family: "#14B8A6", hotels: "#6366F1", shopping: "#EC4899" }[category] || "#F97316";
      const color = place.openNow === false ? "#64748B" : index === 0 ? "#FBBF24" : categoryColor;
      const id = String(place.id || `map-place-${index}`);
      placesByIdRef.current.set(id, place);
      placeFeatures.push({ type: "Feature", properties: { id, rank: index + 1, color, name: place.name || "Place", sel: selectedId != null && String(id) === String(selectedId) ? 1 : 0, anySel: selectedId != null ? 1 : 0 }, geometry: { type: "Point", coordinates: [place.lng, place.lat] } });
      bounds.extend([place.lng, place.lat]);
    });
    // Register a pin sprite for every color this frame uses (idempotent),
    // plus the selected sprite, BEFORE the data lands so no icon is missing.
    for (const f of placeFeatures) ensurePinImage(map, "wf-pin-" + f.properties.color, f.properties.color);
    ensurePinImage(map, "wf-pin-sel", "#F97316", { selected: true });
    const placeSource = map.getSource("wf-places");
    if (placeSource) placeSource.setData({ type: "FeatureCollection", features: placeFeatures });
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
    if (origin && origin.lat != null && origin.lng != null) {
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
        "icon-image": ["case", ["==", ["get", "sel"], 1], "wf-pin-sel", ["concat", "wf-pin-", ["get", "color"]]],
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": ["case", ["==", ["get", "sel"], 1], 1.18, ["==", ["get", "rank"], 1], 1, 0.86],
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

  useEffect(() => { redraw(); }, [places, center, category, deviceLoc, events, fit, rings, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", border: "1px solid rgba(15,23,42,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.4)" }} />
  </div>;
}
