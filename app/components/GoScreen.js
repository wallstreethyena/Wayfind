"use client";
// v4.55 — route shim: these thin routes give /events, /map, /favorites, and
// /itinerary real URLs with metadata, then hand off to the app with the
// matching screen open. Static fallback text below renders for crawlers and
// no-JS clients, and doubles as the graceful signed-out state.
import { useEffect } from "react";
export default function GoScreen({ screen }) {
  useEffect(() => {
    try {
      // v5.54 (events pipeline, Phase 3): carry the route's own query params
      // through the handoff so /events?date=...&cat=... stays shareable —
      // the app shell reads them back and restores the filtered view.
      const qs = window.location.search.replace(/^\?/, "");
      window.location.replace("/?go=" + encodeURIComponent(screen) + (qs ? "&" + qs : ""));
    } catch (e) {}
  }, [screen]);
  return null;
}
