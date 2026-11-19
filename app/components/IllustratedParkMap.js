"use client";

// One illustrated park map with tappable numbered pins (Disney holiday food
// guide and Universal Christmas guide share it). The illustration is a map
// canvas (GVS-7 data-guide-map-canvas exemption: explicit width, height, alt).
//
// pins: [{ id, number, label, left, top, href?, family? }]
//   left/top = pin TIP in percent of the image. With href the pin is a link
//   (a real anchor that still works without JavaScript); otherwise a button
//   that calls onSelect(id). selectedId marks the active pin.
// If the image fails to load the pins are hidden and `fallback` (the guide's
// own numbered list / Maps action) is announced in its place.
//
// Crowded pins: a 44px tap target per pin means close pins overlap on a phone
// (Islands of Adventure's four Seuss Landing stops at 390px, 2026-11-19), and a
// covered pin cannot be tapped. On first paint the map measures its width and
// opens at the smallest zoom step where no two pins are closer than PIN_GAP,
// scrolled to centre the pins. Visitors can still zoom out.
const PIN_GAP = 52;
const ZOOM_STEP = 0.5;
const MAX_ZOOM = 2.5;
export function zoomToSeparate(pins, widthPx, aspect) {
  let closest = Infinity;
  for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
    const dx = (pins[i].left - pins[j].left) / 100 * widthPx;
    const dy = (pins[i].top - pins[j].top) / 100 * widthPx * aspect;
    closest = Math.min(closest, Math.hypot(dx, dy));
  }
  if (!Number.isFinite(closest) || closest >= PIN_GAP) return 1;
  return Math.min(MAX_ZOOM, Math.ceil(PIN_GAP / Math.max(closest, 1) / ZOOM_STEP) * ZOOM_STEP);
}
import { useLayoutEffect, useRef, useState } from "react";
import MapCategoryPin from "./MapCategoryPin";
import { PARK_MAP_CREDIT } from "../../lib/parkMaps2026.js";
import styles from "./IllustratedParkMap.module.css";

export default function IllustratedParkMap({ image, pins = [], selectedId = null, onSelect, label, hint = "Tap a number to open it. Zoom in, then scroll to explore.", note = null, fallback = "The map image could not load. Choose a stop from the numbered list below." }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const scroller = useRef(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || pins.length < 2) return;
    const fit = zoomToSeparate(pins, node.clientWidth, image.height / image.width);
    if (fit <= 1) return;
    setZoom(fit);
    requestAnimationFrame(() => {
      const width = node.clientWidth * fit;
      const height = width * image.height / image.width;
      const lefts = pins.map((p) => p.left), tops = pins.map((p) => p.top);
      const cx = (Math.min(...lefts) + Math.max(...lefts)) / 200 * width;
      const cy = (Math.min(...tops) + Math.max(...tops)) / 200 * height;
      node.scrollTo({ left: Math.max(0, cx - node.clientWidth / 2), top: Math.max(0, cy - node.clientHeight / 2) });
    });
    // Once per map: the parent keys this component by map.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={styles.map} data-illustrated-map={image.src}>
    <div className={styles.toolbar}>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.zoom} role="group" aria-label="Map zoom">
        <button type="button" disabled={zoom <= 1} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - ZOOM_STEP))}>−</button>
        <button type="button" disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}>+</button>
      </div>
    </div>
    <div ref={scroller} className={styles.scroll} tabIndex={0} role="region" aria-label={label + ". Scroll to explore when zoomed."}>
      <div className={styles.canvas} style={{ width: zoom * 100 + "%", aspectRatio: image.width + " / " + image.height }}>
        <img data-guide-map-canvas className={styles.art} src={image.src} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
        {failed ? <p role="status" className={styles.failure}>{fallback}</p> : pins.map((pin) => {
          const body = <><MapCategoryPin family={pin.family || "food"} height={44} /><span>{pin.number}</span></>;
          const common = { className: styles.pin, style: { left: pin.left + "%", top: pin.top + "%" }, "data-map-pin": pin.id, "data-selected": selectedId === pin.id ? "true" : undefined };
          return pin.href
            ? <a key={pin.id} {...common} href={pin.href} aria-label={pin.number + ". " + pin.label} aria-current={selectedId === pin.id ? "location" : undefined} onClick={() => onSelect?.(pin.id)}>{body}</a>
              : <button key={pin.id} {...common} type="button" aria-label={"Stop " + pin.number + ": " + pin.label} aria-pressed={selectedId === pin.id} onClick={() => onSelect?.(pin.id)}>{body}</button>;
        })}
      </div>
    </div>
    <p className={styles.credit}><a href={PARK_MAP_CREDIT.href} target="_blank" rel="noopener noreferrer">{PARK_MAP_CREDIT.label}</a>{note ? <> · {note}</> : null}</p>
  </div>;
}
