"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { selectPosterEvents } from "../../lib/posterEvents.js";

const emptyFor = (mode) => selectPosterEvents([], { mode, center: null });

/** Bounded event fallback for standalone poster pages. Homepage drops disable
 * this hook and consume home.js's already-loaded, fully interactive cards. */
export function usePosterEvents({ active = true, center = null, city = "", mode, disabled = false }) {
  const [settled, setSettled] = useState(null);
  const lat = Number.isFinite(center?.lat) ? center.lat : null;
  const lng = Number.isFinite(center?.lng) ? center.lng : null;
  const key = useMemo(() => active && !disabled && lat != null && lng != null
    ? `${lat}|${lng}|${city}|${mode}` : "", [active, disabled, lat, lng, city, mode]);

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

  const current = settled?.key === key ? settled : null;
  return { pending: !!key && !current, failed: !!current?.failed, byRail: current?.byRail || emptyFor(mode) };
}
