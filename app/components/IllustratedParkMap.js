"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MapCategoryPin from "./MapCategoryPin";
import PhotoCreditLink from "./PhotoCreditLink";
import { PARK_MAP_CREDIT } from "../../lib/parkMaps2026.js";
import styles from "./IllustratedParkMap.module.css";

// One illustrated park map with tappable numbered pins (Disney holiday food
// guide and Universal Christmas guide share it). The illustration is a map
// canvas (GVS-7 data-guide-map-canvas exemption: explicit width, height, alt).
//
// pins: [{ id, number, label, left, top, href?, family? }]
//   left/top = pin TIP in percent of the image. With href the pin is a link
//   (a real anchor that still works without JavaScript); otherwise a button
//   that calls onSelect(id). selectedId marks the active pin.
// If the image fails to load (also before hydration) the pins are hidden and
// `fallback` (the guide's own numbered list) is announced in its place.
//
// Crowded pins: a 44px tap target per pin means close pins overlap on a phone
// (Islands of Adventure's four Seuss Landing stops at 390px, 2026-11-19), and a
// covered pin cannot be tapped. On first paint the map measures its width and
// opens at the smallest zoom step where no two pins are closer than PIN_GAP,
// scrolled to the crowded pins. Visitors can still zoom out.
export const PIN_GAP = 52;
const ZOOM_STEP = 0.5;
export const MAX_ZOOM = 3;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function closestPair(pins, widthPx, aspect) {
  let best = { d: Infinity, a: null, b: null };
  for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
    const d = Math.hypot((pins[i].left - pins[j].left) / 100 * widthPx, (pins[i].top - pins[j].top) / 100 * widthPx * aspect);
    if (d < best.d) best = { d, a: pins[i], b: pins[j] };
  }
  return best;
}

/** Smallest zoom step (1 … MAX_ZOOM) that keeps every pin PIN_GAP px apart. */
export function zoomToSeparate(pins, widthPx, aspect) {
  if (!(widthPx > 0)) return 1;
  const { d } = closestPair(pins, widthPx, aspect);
  if (!Number.isFinite(d) || d >= PIN_GAP) return 1;
  return Math.min(MAX_ZOOM, Math.ceil(PIN_GAP / Math.max(d, 1) / ZOOM_STEP) * ZOOM_STEP);
}

/** Scroll offsets that centre the crowded pair at `zoom` (what forced the zoom). */
export function scrollToCrowd(pins, widthPx, viewW, viewH, aspect, zoom) {
  const { a, b } = closestPair(pins, widthPx, aspect);
  if (!a) return { left: 0, top: 0 };
  const w = widthPx * zoom, h = w * aspect;
  const cx = (a.left + b.left) / 200 * w;
  const cy = (a.top + b.top) / 200 * h - 29; // pins hang above their tip
  return { left: Math.max(0, Math.min(w - viewW, cx - viewW / 2)), top: Math.max(0, Math.min(h - viewH, cy - viewH / 2)) };
}

export default function IllustratedParkMap({ image, pins = [], selectedId = null, onSelect, label, hint = "Tap a number to open it. Zoom in, then scroll to explore.", note = null, fallback = "The map image could not load. Choose a stop from the numbered list below." }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const scroller = useRef(null);
  const art = useRef(null);
  useIsoLayoutEffect(() => {
    // An image that failed before hydration never fires onError.
    if (art.current && art.current.complete && art.current.naturalWidth === 0 && art.current.currentSrc) setFailed(true);
    const node = scroller.current;
    if (!node || !node.clientWidth || pins.length < 2) return;
    const aspect = image.height / image.width;
    const fit = zoomToSeparate(pins, node.clientWidth, aspect);
    if (fit <= 1) return;
    const target = scrollToCrowd(pins, node.clientWidth, node.clientWidth, node.clientHeight || 520, aspect, fit);
    setZoom(fit);
    requestAnimationFrame(() => node.scrollTo(target));
    // Once per map: the parent keys this component by map.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={styles.map} data-illustrated-map={image.src} data-zoom={zoom}>
    <div className={styles.toolbar}>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.zoom} role="group" aria-label="Map zoom">
        <button type="button" disabled={zoom <= 1} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - ZOOM_STEP))}>−</button>
        <button type="button" disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}>+</button>
      </div>
    </div>
    <div ref={scroller} className={styles.scroll} tabIndex={0} role="region" aria-label={label + ". Scroll to explore when zoomed."}>
      <div className={styles.canvas} style={{ width: zoom * 100 + "%", aspectRatio: image.width + " / " + image.height }}>
        <img ref={art} data-guide-map-canvas className={styles.art} src={image.src} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
        {failed ? <p role="status" className={styles.failure}>{fallback}</p> : pins.map((pin) => {
          const body = <><MapCategoryPin family={pin.family || "food"} height={44} /><span>{pin.number}</span></>;
          const common = { className: styles.pin, style: { left: pin.left + "%", top: pin.top + "%" }, "data-map-pin": pin.id, "data-selected": selectedId === pin.id ? "true" : undefined };
          return pin.href
            ? <a key={pin.id} {...common} href={pin.href} aria-label={pin.number + ". " + pin.label} aria-current={selectedId === pin.id ? "location" : undefined} onClick={() => onSelect?.(pin.id)}>{body}</a>
            : <button key={pin.id} {...common} type="button" aria-label={"Stop " + pin.number + ": " + pin.label} aria-pressed={selectedId === pin.id} onClick={() => onSelect?.(pin.id)}>{body}</button>;
        })}
      </div>
    </div>
    <p className={styles.credit}><PhotoCreditLink href={PARK_MAP_CREDIT.href}>{PARK_MAP_CREDIT.label}</PhotoCreditLink>{note ? <> · {note}</> : null}</p>
  </div>;
}
