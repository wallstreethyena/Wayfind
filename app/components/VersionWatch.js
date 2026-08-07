"use client";
// app/components/VersionWatch.js — the STALE-TAB fix (2026-08-07).
//
// THE PROBLEM, in the owner's own words: "I have asked this to be fixed
// multiple times now." He had. The fixes had shipped. His tab hadn't: a
// deploy only reaches tabs opened after it, and a long-lived mobile Safari
// tab happily runs yesterday's bundle forever. His 14:47Z screenshot showed
// the exact ranking inversion the 14:30Z deploy retired — correct code in
// production, stale client in hand, and no mechanism anywhere that could
// notice the gap. Every future fix pays this tax until something closes it.
//
// WHAT THIS DOES: compares the build id baked into THIS bundle
// (NEXT_PUBLIC_WF_BUILD) against what the server says it is running
// (/api/version) — checked when a hidden tab becomes visible again (the
// stale-tab moment) and on a slow interval as a fallback. On mismatch it
// reloads ONCE, and only at a moment that cannot eat user state:
//   • only when the tab has just returned from hidden (the user was away;
//     nothing is mid-tap, mid-scroll settles instantly on a feed page);
//   • never twice for the same server build (sessionStorage stamp), so a
//     half-propagated deploy (CDN A answers new, CDN B answers old) cannot
//     ping-pong a reload loop;
//   • never when either side reports an EMPTY id (local dev, missing env) — fail
//     closed, the mechanism disables itself rather than guessing.
//
// The interval is deliberately long (10 min) — this is a safety net for
// day-old tabs, not a realtime updater; the visibility hook is the primary
// trigger because returning to an old tab IS the stale moment.
import { useEffect } from "react";

const CHECK_MS = 10 * 60 * 1000;
const STAMP = "wf_vw_reloaded_for";

export default function VersionWatch() {
  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_WF_BUILD || "";
    if (!mine) return; // local / unbaked: the check cannot mean anything
    let timer = null;
    let inflight = false;
    const check = async (trigger) => {
      if (inflight || document.visibilityState !== "visible") return;
      inflight = true;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        const server = j && j.build;
        if (!server || server === mine) return;
        // One reload per server build, ever, per tab session.
        let done = null;
        try { done = sessionStorage.getItem(STAMP); } catch (e) {}
        if (done === server) return;
        try { sessionStorage.setItem(STAMP, server); } catch (e) {}
        try { window.posthog && window.posthog.capture("stale_tab_reload", { from: mine.slice(0, 7), to: String(server).slice(0, 7), trigger }); } catch (e) {}
        window.location.reload();
      } catch (e) {
        // network hiccup: do nothing; the next visibility/interval tries again
      } finally {
        inflight = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check("visibility"); };
    document.addEventListener("visibilitychange", onVisible);
    timer = setInterval(() => check("interval"), CHECK_MS);
    // No check on first mount: a tab that just loaded IS the current build.
    return () => { document.removeEventListener("visibilitychange", onVisible); if (timer) clearInterval(timer); };
  }, []);
  return null;
}
