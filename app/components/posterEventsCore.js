"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";

// The stale-response protection and bounded /api/events fetch shared by every
// poster surface. It deliberately imports NOTHING from lib/posterEvents.js:
// the event pipeline behind selectPosterEvents (validation, Florida venue rule,
// night-out and trending rails, ranking) is ~90KB of source, and the homepage
// only needs it after the feed has arrived. Each caller hands in its selector
// through `adapter` -- usePosterEvents.js binds it statically (standalone
// pages already ship the pipeline), usePosterEventsLazy.js binds it behind a
// dynamic import (the homepage live poster tile). See scripts/check-home-diet.mjs.

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

/** adapter = { select(events, { mode, center }) -> byRail | Promise<byRail>, empty(mode) -> byRail } */
export function usePosterEventsWith({ active = true, center = null, city = "", mode, disabled = false }, adapter) {
  const [settled, setSettled] = useState(null);
  const lat = Number.isFinite(center?.lat) ? center.lat : null;
  const lng = Number.isFinite(center?.lng) ? center.lng : null;
  const key = useMemo(() => posterEventsKey({ active, disabled, lat, lng, city, mode }), [active, disabled, lat, lng, city, mode]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const fail = () => { if (!cancelled) setSettled({ key, failed: true, byRail: adapter.empty(mode) }); };
    // 25mi, owner-set 2026-09-17: the poster shows what is genuinely near the
    // reader's active location, not a metro-wide sweep.
    const query = new URLSearchParams({ lat: lat.toFixed(2), lng: lng.toFixed(2), radius: "25" });
    if (city) query.set("city", city);
    fetchJsonWithDeadline(`/api/events?${query}`, { timeoutMs: 10000 })
      .then((payload) => {
        if (cancelled) return undefined;
        if (!payload || payload.error || payload.unavailable || !Array.isArray(payload.events)) {
          fail();
          return undefined;
        }
        const picked = adapter.select(payload.events, { mode, center: { lat, lng } });
        if (picked && typeof picked.then === "function") {
          return picked.then((byRail) => { if (!cancelled) setSettled({ key, failed: false, byRail }); });
        }
        setSettled({ key, failed: false, byRail: picked });
        return undefined;
      })
      .catch(fail);
    return () => { cancelled = true; };
  }, [key, lat, lng, city, mode]);

  const current = isSettledCurrent(settled, key) ? settled : null;
  return { pending: !!key && !current, failed: !!current?.failed, byRail: current?.byRail || adapter.empty(mode) };
}
