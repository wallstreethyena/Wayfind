"use client";
import { useEffect, useRef, useState } from "react";
import { loadAppleMapKit } from "../../lib/appleMapsRuntime.js";
import { createCreatorAppleMap } from "../../lib/creatorAppleMap.js";
import { readGrantedDeviceLocation } from "../../lib/mapPinStandard.js";

export default function CreatorAppleMap({ places, onSelect, selectedId = null, deviceLoc = null }) {
  const host = useRef(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [grantedLoc, setGrantedLoc] = useState(null);
  const hasExplicitDeviceLoc = !!(deviceLoc && Number.isFinite(Number(deviceLoc.lat)) && Number.isFinite(Number(deviceLoc.lng)));
  useEffect(() => {
    if (hasExplicitDeviceLoc) return undefined;
    return readGrantedDeviceLocation(setGrantedLoc);
  }, [hasExplicitDeviceLoc]);
  const effectiveDeviceLoc = hasExplicitDeviceLoc
    ? { lat: Number(deviceLoc.lat), lng: Number(deviceLoc.lng) }
    : grantedLoc;
  const deviceLocRef = useRef(effectiveDeviceLoc);
  deviceLocRef.current = effectiveDeviceLoc;
  const controllerRef = useRef(null);
  useEffect(() => {
    let dead = false;
    let controller;
    setStatus("loading");
    loadAppleMapKit(process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN).then(mapkit => {
      if (dead || !host.current) return;
      controller = createCreatorAppleMap({
        mapkit, container: host.current, places,
        onSelect: id => selectRef.current?.(id),
        deviceLoc: deviceLocRef.current,
      });
      controllerRef.current = controller;
      if (selectedRef.current != null) controller.select?.(selectedRef.current);
      setStatus("ready");
    }).catch(() => { if (!dead) setStatus("error"); });
    return () => { dead = true; if (controllerRef.current === controller) controllerRef.current = null; controller?.destroy(); };
  }, [places, attempt]);

  useEffect(() => {
    if (status !== "ready") return;
    controllerRef.current?.select?.(selectedId);
  }, [selectedId, status]);

  useEffect(() => {
    if (status !== "ready") return;
    controllerRef.current?.setUserLocation?.(effectiveDeviceLoc || null);
  }, [effectiveDeviceLoc?.lat, effectiveDeviceLoc?.lng, status]);

  return <>
    <div ref={host} role="region" aria-label="Apple map of reviewed places" style={{ position: "absolute", inset: 0 }} />
    {status !== "ready" ? <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", padding: 28, textAlign: "center", background: "#142022", color: "#dce5df" }}>
      <p>{status === "error" ? "Apple Maps is unavailable right now. Explore every reviewed place in the collection below." : "Opening reviewed places in Apple Maps…"}</p>
      {status === "error" ? <button type="button" onClick={() => setAttempt(a => a + 1)} style={{ padding: 12, borderRadius: 20, cursor: "pointer" }}>Retry map</button> : null}
    </div> : null}
  </>;
}
