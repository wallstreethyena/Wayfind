"use client";

import { useEffect, useRef, useState } from "react";
import { loadAppleMapKit } from "../../lib/appleMapsRuntime.js";
import { createAppleExplorerController } from "../../lib/appleExplorerMap.js";

function MapFallback({ count, onRetry }) {
  return <div role="status" style={{ position: "absolute", inset: 0, background: "#F3F0E8", display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#334155" }}>
    <div><strong>{count ? `${count} places ready to explore` : "Map preview"}</strong><div style={{ marginTop: 8, fontSize: 13 }}>Apple Maps could not load right now.</div>{onRetry ? <button onClick={onRetry} style={{ marginTop: 14, padding: "9px 18px", borderRadius: 999, border: "1px solid #F97316", background: "#FFF", color: "#C2410C", fontWeight: 800 }}>Try again</button> : null}</div>
  </div>;
}

export default function AppleExplorerMap({
  places, center, category, deviceLoc, onSelect, events, onSelectEvent, focus,
  fit, rings, compact = false, styleMode = "bright", onRetry,
  selectedId = null, onAreaChange = null, onViewportChange = null,
  showOrigin = true,
}) {
  const hostRef = useRef(null);
  const controllerRef = useRef(null);
  const callbacksRef = useRef({ onSelect, onSelectEvent, onAreaChange, onViewportChange });
  const dataRef = useRef({ places, center, category, deviceLoc, events, selectedId, fit, rings, showOrigin, focus });
  callbacksRef.current = { onSelect, onSelectEvent, onAreaChange, onViewportChange };
  // MapKit loads asynchronously. Keep the newest result set here so a category
  // response that arrives during SDK startup cannot be dropped and leave a
  // fully loaded Apple map with zero markers until some unrelated rerender.
  dataRef.current = { places, center, category, deviceLoc, events, selectedId, fit, rings, showOrigin, focus };
  // MapScreen derives its event slice during render, so the array identity may
  // change even when its contents do not. Key the expensive annotation rebuild
  // to the actual event contract; selecting one place must stay an in-place
  // selection update rather than tearing down every native pin.
  const eventsKey = JSON.stringify((events || []).map((event) => [event?.id, event?.lat, event?.lng, event?.name, event?.venue]));
  const [failed, setFailed] = useState(false);
  const hasCenter = !!(center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng)));

  useEffect(() => {
    if (!hasCenter || !hostRef.current || controllerRef.current) return undefined;
    let dead = false;
    loadAppleMapKit(process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN).then((mapkit) => {
      if (dead || !hostRef.current) return;
      const controller = createAppleExplorerController({
        mapkit, container: hostRef.current, ...dataRef.current,
        onSelect: (place) => callbacksRef.current.onSelect?.(place),
        onSelectEvent: (event) => callbacksRef.current.onSelectEvent?.(event),
        onAreaChange: (area) => callbacksRef.current.onAreaChange?.(area),
        onViewportChange: (bounds) => callbacksRef.current.onViewportChange?.(bounds),
      });
      controllerRef.current = controller;
      const latest = dataRef.current;
      if (latest.focus && latest.focus.lat != null && latest.focus.lng != null) controller.focusOn(latest.focus, latest.selectedId);
    }).catch(() => { if (!dead) setFailed(true); });
    return () => {
      dead = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
    // A refined GPS fix updates the existing map; it must not remount MapKit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCenter]);

  useEffect(() => {
    controllerRef.current?.update({ places, center, category, deviceLoc, events, selectedId, fit, rings, showOrigin });
  }, [places, center, category, deviceLoc, eventsKey, fit, rings, showOrigin]);

  useEffect(() => { controllerRef.current?.selectId(selectedId); }, [selectedId]);

  useEffect(() => {
    if (focus && focus.lat != null && focus.lng != null) controllerRef.current?.focusOn(focus, selectedId);
    // Selection rerenders must not replay an older camera command under the
    // reader's finger. Only a new focus timestamp drives the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus && focus.ts]);

  // Apple owns its cartography, pitch and attribution presentation. Keep the
  // prop for drop-in MapView compatibility while the screen retires its former
  // OpenFreeMap-only 3D toggle.
  void compact;
  void styleMode;

  if (failed) return <MapFallback count={(places || []).length} onRetry={onRetry} />;
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#F3F0E8" }}>
    <div ref={hostRef} role="region" aria-label="Interactive Apple map" style={{ position: "absolute", inset: 0 }} />
  </div>;
}
