"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { selectPosterEvents } from "../../lib/posterEvents.js";

const emptyFor = (mode) => selectPosterEvents([], { mode, center: null });

// Pure, exported so the stale-response protection below is directly
// testable without a React renderer. Behavior is UNCHANGED from before this
// was named -- this is an extraction, not a rewrite; every existing caller
// of usePosterEvents (DateNightRails.js and others) sees identical results.
export function posterEventsKey({ active, disabled, lat, lng, city, mode }) {
  return active && !disabled && lat != null && lng != null ? `${lat}|${lng}|${city}|${mode}` : "";
}
// A "settled" fetch result is only ever current if its own key still
// matches what is currently being requested. A response for an OLD
// location (an old key) can never satisfy a NEW key, no matter when it
// resolves -- this is what makes a late response from a location the user
// has already left away unable to overwrite the newer one.
export function isSettledCurrent(settled, key) {
  return !!key && settled?.key === key;
}

/** Bounded event fallback for standalone poster pages. Homepage drops disable
 * this hook and consume home.js's already-loaded, fully interactive cards. */
export function usePosterEvents({ active = true, center = null, city = "", mode, disabled = false }) {
  const [settled, setSettled] = useState(null);
  const lat = Number.isFinite(center?.lat) ? center.lat : null;
  const lng = Number.isFinite(center?.lng) ? center.lng : null;
  const key = useMemo(() => posterEventsKey({ active, disabled, lat, lng, city, mode }), [active, disabled, lat, lng, city, mode]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const query = new URLSearchParams({ lat: lat.toFixed(2), lng: lng.toFixed(2), radius: "27" });
    if (city) query.set("city", city);
    fetchJsonWithDeadline(`/api/events?${query}`, { timeoutMs: 10000 })
      .then((payload) => {
        if (cancelled) return;
        if (!payload || payload.error || payload.unavailable || !Array.isArray(payload.events)) {
          setSettled({ key, failed: true, byRail: emptyFor(mode) });
          return;
        }
        setSettled({ key, failed: false, byRail: selectPosterEvents(payload.events, { mode, center: { lat, lng } }) });
      })
      .catch(() => { if (!cancelled) setSettled({ key, failed: true, byRail: emptyFor(mode) }); });
    return () => { cancelled = true; };
  }, [key, lat, lng, city, mode]);

  const current = isSettledCurrent(settled, key) ? settled : null;
  return { pending: !!key && !current, failed: !!current?.failed, byRail: current?.byRail || emptyFor(mode) };
}
