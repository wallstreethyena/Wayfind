"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeCoordinates } from "../../lib/deviceDistance.js";
import { isMapkitSafePoint } from "../../lib/appleMapsRuntime.js";
import { readGrantedDeviceLocation } from "../../lib/mapPinStandard.js";

export default function PlaceMapLocationControls({ controller, deviceLoc }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const requested = useRef(false);
  useEffect(() => () => { request.current++; }, [controller]);
  useEffect(() => {
    if (requested.current) return;
    const show = (point) => { if (!requested.current) controller.setUserLocation(point); };
    const supplied = normalizeCoordinates(deviceLoc);
    if (supplied && isMapkitSafePoint(supplied) && (supplied.lat || supplied.lng)) { show(supplied); return; }
    return readGrantedDeviceLocation(show);
  }, [controller, deviceLoc?.lat, deviceLoc?.lng]);

  function locate(center) {
    if (busy) return;
    const geo = typeof navigator !== "undefined" ? navigator.geolocation : null;
    if (!geo) { setMessage("Location is unavailable in this browser."); return; }
    requested.current = true;
    const id = ++request.current;
    setBusy(true);
    setMessage("Finding your location…");
    const failed = (error) => {
      if (id !== request.current) return;
      setBusy(false);
      if (error?.code === 1) {
        controller.setUserLocation(null);
        setMessage("Location access is blocked. Allow location in your browser settings and try again.");
      } else {
        setMessage("A current location was unavailable. Try again.");
      }
    };
    try {
      geo.getCurrentPosition((position) => {
        if (id !== request.current) return;
        const point = normalizeCoordinates(position?.coords);
        if (!point || !isMapkitSafePoint(point) || (!point.lat && !point.lng)) { failed(); return; }
        controller.setUserLocation(point);
        if (center) controller.centerOnUserLocation();
        setBusy(false);
        setMessage(center ? "Map centered on your location." : "Your location pin was updated.");
      }, failed, { maximumAge: 0, timeout: 10000, enableHighAccuracy: true });
    } catch { failed(); }
  }

  return <div>
    <div className="wfev-cats" role="group" aria-label="Your location on this map">
      <button className="wfev-cat" type="button" aria-disabled={busy} onClick={() => locate(true)}>Center on me</button>
      <button className="wfev-cat" type="button" aria-disabled={busy} onClick={() => locate(false)}>Refresh location</button>
    </div>
    <div role="status" aria-live="polite" style={{ color: "#CBD5E1", fontSize: 13 }}>{message}</div>
  </div>;
}
