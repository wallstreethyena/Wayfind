"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COVERED_CITIES } from "../../lib/landingCities.js";
import { normalizeCoordinates } from "../../lib/deviceDistance.js";
import { deviceLocationStore } from "../../lib/deviceLocationStore.js";

export const HALLOWEEN_AREA_KEY = "wf_halloween_area_v1";
export const HALLOWEEN_SORT_KEY = "wf_halloween_sort";
export const HALLOWEEN_AREAS = Object.freeze(Object.entries(COVERED_CITIES)
  .filter(([, city]) => city.state === "FL" && normalizeCoordinates(city))
  .map(([id, city]) => Object.freeze({ id, name: city.name, lat: city.lat, lng: city.lng }))
  .sort((a, b) => a.name.localeCompare(b.name)));
const areaById = new Map(HALLOWEEN_AREAS.map((area) => [area.id, area]));

// A search/map pin (wf_center), IP estimate or URL region is never a device fix.
// Only the existing live GPS store or this page's explicitly chosen area counts.
export function halloweenLocationOrigin(device, areaId) {
  const current = normalizeCoordinates(device);
  if (current) return { ...current, kind: "device", label: "your current location" };
  const area = areaById.get(areaId);
  return area ? { lat: area.lat, lng: area.lng, kind: "area", label: `${area.name}, FL (area center)` } : null;
}

export default function useHalloweenLocation() {
  const [device, setDevice] = useState(null);
  const [areaId, setAreaId] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const generation = useRef(0);
  const unsubscribe = useRef(null);
  const timeout = useRef(null);
  const permissionListener = useRef(null);

  const stopRequest = useCallback(() => {
    generation.current++;
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
    const permission = permissionListener.current;
    permission?.value.removeEventListener?.("change", permission.changed);
    permissionListener.current = null;
    unsubscribe.current?.();
    unsubscribe.current = null;
  }, []);

  const readDevice = useCallback(() => {
    const next = normalizeCoordinates(deviceLocationStore.getSnapshot());
    setDevice((previous) => previous?.lat === next?.lat && previous?.lng === next?.lng ? previous : next);
    return next;
  }, []);

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = window.localStorage.getItem(HALLOWEEN_AREA_KEY);
      if (areaById.has(saved)) setAreaId(saved);
    } catch { /* An area choice still works without storage. */ }
    if (readDevice()) setStatus("ready");
    // Reading the store is passive; subscribing would start watchPosition and
    // could show a browser prompt. Mirror expiry/revocation without creating a
    // subscription until the visitor explicitly presses Use my location.
    const mirror = setInterval(() => { if (!unsubscribe.current) readDevice(); }, 1000);
    return () => { mounted.current = false; clearInterval(mirror); stopRequest(); };
  }, [readDevice, stopRequest]);

  const requestLocation = useCallback(() => {
    stopRequest();
    if (!mounted.current) return;
    const navigator = typeof window !== "undefined" ? window.navigator : null;
    if (!navigator?.geolocation) {
      setStatus("unavailable");
      setError("Your current location is unavailable. Choose an area instead.");
      return;
    }
    const token = generation.current;
    const active = () => mounted.current && generation.current === token;
    const fail = (denied) => {
      if (!active()) return;
      stopRequest();
      setDevice(null);
      setStatus(denied ? "denied" : "unavailable");
      setError(denied
        ? "Location access is blocked. Choose an area or allow location access in your browser."
        : "Your current location is unavailable. Choose an area or try again.");
    };
    setStatus("requesting");
    setError("");
    timeout.current = setTimeout(() => fail(false), 16_000);
    const sync = () => {
      if (!active()) return;
      if (readDevice()) {
        if (timeout.current !== null) clearTimeout(timeout.current);
        timeout.current = null;
        setStatus("ready");
        setError("");
      } else {
        setStatus((previous) => previous === "requesting" ? previous : "idle");
      }
    };
    try {
      // This is the only subscription in the hook, reached by an explicit tap.
      // The existing store owns fresh fixes, watch renewal and clearWatch.
      unsubscribe.current = deviceLocationStore.subscribe(sync);
      sync();
      Promise.resolve(navigator.permissions?.query({ name: "geolocation" })).then((permission) => {
        if (!active() || !permission) return;
        const changed = () => { if (permission.state === "denied") fail(true); };
        permissionListener.current = { value: permission, changed };
        permission.addEventListener?.("change", changed);
        changed();
      }).catch(() => {});
    } catch { fail(false); }
  }, [readDevice, stopRequest]);

  const chooseArea = useCallback((id) => {
    if (id !== "" && !areaById.has(id)) return false;
    setAreaId(id);
    try {
      if (id) window.localStorage.setItem(HALLOWEEN_AREA_KEY, id);
      else window.localStorage.removeItem(HALLOWEEN_AREA_KEY);
    } catch { /* The selection is still available for this page view. */ }
    return true;
  }, []);

  return { origin: halloweenLocationOrigin(device, areaId), status, error, requestLocation, chooseArea, areas: HALLOWEEN_AREAS };
}
