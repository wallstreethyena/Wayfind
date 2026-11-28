"use client";
// Idle mount for re-engagement (lib/reengageClient.js). Renders nothing, and does
// nothing, until the window `load` event has fired AND the browser is idle, so it
// can never touch first paint or LCP. Off entirely unless this build was cut with
// NEXT_PUBLIC_WF_REENGAGE=1. Opted out visitors (Global Privacy Control, owner,
// bots) get no cookie, no stored state and no banner.
//
// First load JS budget (scripts/check-bundle.mjs): this file is in the root
// layout, so it imports NOTHING but React. lib/reengageClient.js and the banner
// are fetched only after load + idle, and only when the build flag is on (the
// literal env compare lets the bundler drop the whole effect when it is off).
import { useEffect, useState } from "react";

// The itinerary email's "Open my plan" link (GET /api/reengage/open) leaves a
// short lived wf_rc_pending=1 marker cookie; the matching HttpOnly token cookie
// rides on this POST. That POST is what confirms the recipient (a mail scanner
// follows the link but never runs this script). It is the person's own click,
// not tracking, so it does NOT depend on the opt out checks below.
export function confirmPendingEmail(win) {
  try {
    if (!win || !win.document || !/(?:^|;\s*)wf_rc_pending=1(?:;|$)/.test(String(win.document.cookie || ""))) return false;
    const p = win.fetch("/api/reengage/confirm", { method: "POST", credentials: "same-origin" });
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  } catch (e) { return false; }
}

export default function ReengageMount() {
  const [Banner, setBanner] = useState(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WF_REENGAGE !== "1") return undefined;
    let cancelled = false;
    let idleHandle = null;
    let timer = null;

    const run = () => {
      if (cancelled) return;
      confirmPendingEmail(window);
      import("../../lib/reengageClient.js").then((rc) => {
        if (cancelled) return;
        try {
          if (rc.optedOut(window)) return;
          rc.ensureAnonId(window);
          rc.noteVisit(window);
          rc.installReengageHook(window);
          if (!rc.shouldShowBanner(rc.readState(window), rc.readFlags(window), Date.now(), window.location.pathname)) return;
          import("./ReturnBanner").then((m) => { if (!cancelled) setBanner(() => m.default); }, () => {});
        } catch (e) { /* best effort, never break the page */ }
      }, () => {});
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
