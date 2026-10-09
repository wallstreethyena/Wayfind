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
  // 2026-10-08 PERF: the effect above runs only after this route's own JS has
  // downloaded and hydrated (measured ~2.1 s at 390px, 4x CPU, fast 4G before
  // the shell even starts loading). The same hand-off as an inline script runs
  // while the HTML is still being parsed. The effect stays as the fallback; the
  // static text on the page stays for crawlers and no-JS visitors.
  const target = JSON.stringify(String(screen || "")).replace(/</g, "\\u003c");
  return <script dangerouslySetInnerHTML={{ __html: "(function(){try{var q=location.search.replace(/^\\?/,'');location.replace('/?go='+encodeURIComponent(" + target + ")+(q?'&'+q:''))}catch(e){}})();" }} />;
}
