"use client";
// v4.55 — route shim: these thin routes give /events, /map, /favorites, and
// /itinerary real URLs with metadata, then hand off to the app with the
// matching screen open. Static fallback text below renders for crawlers and
// no-JS clients, and doubles as the graceful signed-out state.
import { useEffect } from "react";
export default function GoScreen({ screen }) {
  useEffect(() => {
    try { window.location.replace("/?go=" + encodeURIComponent(screen)); } catch (e) {}
  }, [screen]);
  return null;
}
