"use client";
// Idle mount for re-engagement (lib/reengageClient.js). Renders nothing, and does
// nothing, until the window `load` event has fired AND the browser is idle, so it
// can never touch first paint or LCP. Off entirely unless this build was cut with
// NEXT_PUBLIC_WF_REENGAGE=1. Opted out visitors (Global Privacy Control, owner,
// bots) get no cookie, no stored state and no banner.
import { useEffect, useState } from "react";
import {
  reengageEnabled, optedOut, ensureAnonId, noteVisit, installReengageHook,
  readState, readFlags, shouldShowBanner,
} from "../../lib/reengageClient.js";

export default function ReengageMount() {
  const [Banner, setBanner] = useState(null);

  useEffect(() => {
    if (!reengageEnabled()) return undefined;
    let cancelled = false;
    let idleHandle = null;
    let timer = null;

    const run = () => {
      if (cancelled) return;
      try {
        if (optedOut(window)) return;
        ensureAnonId(window);
        noteVisit(window);
        installReengageHook(window);
        const now = Date.now();
        if (!shouldShowBanner(readState(window), readFlags(window), now, window.location.pathname)) return;
        import("./ReturnBanner").then((m) => { if (!cancelled) setBanner(() => m.default); }, () => {});
      } catch (e) { /* best effort, never break the page */ }
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(run, { timeout: 4000 });
      else timer = setTimeout(run, 1500);
    };

    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      if (idleHandle != null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      if (timer != null) clearTimeout(timer);
    };
  }, []);

  return Banner ? <Banner /> : null;
}
