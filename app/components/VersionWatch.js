"use client";
// app/components/VersionWatch.js — the STALE-TAB fix (2026-08-07), widened on
// 2026-08-27 to cover the CACHED DOCUMENT, which is how it kept missing.
//
// THE ORIGINAL PROBLEM (2026-08-07), in the owner's own words: "I have asked
// this to be fixed multiple times now." He had. The fixes had shipped. His tab
// hadn't: a deploy only reaches tabs opened after it, and a long-lived mobile
// Safari tab happily runs yesterday's bundle forever.
//
// THE SECOND PROBLEM (2026-08-27), same shape, different door. The fall place
// card was fixed, merged, deployed and verified live — and his phone still
// showed the bug until he pulled down to refresh. Afterwards: "a lot of people
// don't know how to refresh, to be honest with you." That is the whole brief.
// A user who never learns the gesture never receives a single fix we ship.
//
// WHY THIS FILE MISSED IT. It carried the line "No check on first mount: a tab
// that just loaded IS the current build." That is only true when the document
// came off the NETWORK. iOS Safari serves a back/forward navigation out of its
// cache WITHOUT revalidating, whatever Cache-Control says — and Wayfind inlines
// the place-card CSS into the document, so a cached document is cached CSS,
// which is precisely the pixel he was still looking at. The boot check below
// is the fix; lib/staleTab.js explains how a cached document is recognised.
//
// WHAT THIS DOES. It compares the build id baked into THIS bundle
// (NEXT_PUBLIC_WF_BUILD) against what the server says it is running
// (/api/version), on five triggers:
//   • BOOT, but only when the document itself may have come from cache;
//   • a hidden tab becoming visible again (the classic stale moment);
//   • pageshow with persisted=true — a bfcache restore, which on Safari is
//     NOT reliably accompanied by a visibilitychange;
//   • coming back online;
//   • a slow interval, as a floor for a tab that is never backgrounded.
//
// WHEN IT FINDS A MISMATCH it reloads — but only into an empty room. If a
// sheet is open, a field is focused, a video is playing, or the user touched
// the page in the last 20 seconds, it does NOT reload: it arms, shows one
// small "Update available" pill, and takes the next quiet moment instead. A
// reload that eats a half-typed search or a half-watched creator video costs
// more than the bug it delivers.
//
// FAIL-CLOSED, all three still hold:
//   • empty build id on EITHER side (local dev, missing env) ⇒ watch disabled;
//   • one reload per server build per tab, ever (sessionStorage stamp), so a
//     half-propagated deploy (edge A new, edge B old) cannot ping-pong;
//   • a network hiccup does nothing at all and waits for the next trigger.
//
// Pinned by scripts/check-version-watch.mjs; decided by lib/staleTab.js, which
// scripts/test-stale-tab.mjs asserts.
import { useCallback, useEffect, useRef, useState } from "react";
import { documentMayBeStale, reloadBlockers } from "../../lib/staleTab";

const CHECK_MS = 10 * 60 * 1000; // floor for a tab that is never backgrounded
const RETRY_MS = 4000;           // how often an armed reload re-reads the room
const HIDDEN_CLEARS_MS = 3000;   // away this long ⇒ they are not mid-anything
const STAMP = "wf_vw_reloaded_for";

function isEditing(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable === true;
}

function mediaPlaying(doc) {
  try {
    const all = doc.querySelectorAll("video,audio");
    for (let i = 0; i < all.length; i++) { const m = all[i]; if (!m.paused && !m.ended) return true; }
  } catch (e) {}
  return false;
}

export default function VersionWatch() {
  const [pill, setPill] = useState(false);
  const armedRef = useRef("");        // server build waiting to land
  const touchedRef = useRef(0);       // last time the user did anything
  const hiddenAtRef = useRef(0);
  const takeNowRef = useRef(null);    // wired by the effect; used by the pill

  const onPill = useCallback(() => { if (takeNowRef.current) takeNowRef.current(); }, []);

  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_WF_BUILD || "";
    if (!mine) return; // local / unbaked: the comparison cannot mean anything
    let alive = true;
    let inflight = false;
    let poll = null;
    let retry = null;

    const takeIt = (to, trigger) => {
      if (!to) return;
      // One reload per server build, ever, per tab session.
      try { if (sessionStorage.getItem(STAMP) === to) return; } catch (e) {}
      try { sessionStorage.setItem(STAMP, to); } catch (e) {}
      // Their place is already safe: app/home.js writes screen/cat/browseCat/
      // sub/vibe + scrollTop to sessionStorage("wf_pos") on pagehide, which a
      // reload fires, and reads it back on mount. So this reload lands on the
      // same chip at the same scroll offset — that is what makes taking it
      // unprompted defensible at all. Do not "improve" this by adding a second
      // resume path; there is one, and it is that one.
      try { window.posthog && window.posthog.capture("stale_tab_reload", { from: mine.slice(0, 7), to: String(to).slice(0, 7), trigger }); } catch (e) {}
      window.location.reload();
    };

    const blockers = () => reloadBlockers({
      online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
      hasOpenDialog: !!document.querySelector('[role="dialog"],dialog[open]'),
      editing: isEditing(document.activeElement),
      playingMedia: mediaPlaying(document),
      msSinceInteraction: touchedRef.current ? Date.now() - touchedRef.current : Infinity,
    });

    const offer = (why) => setPill(why.indexOf("dialog") === -1 && why.indexOf("offline") === -1);

    const settle = (to, trigger) => {
      const why = blockers();
      if (!why.length) { takeIt(to, trigger); return; }
      armedRef.current = to;
      takeNowRef.current = () => takeIt(to, "pill");
      // The pill is an offer, not an interruption: never float it over an open
      // sheet, where it would sit on top of what they are reading.
      offer(why);
      // The re-read timer exists ONLY while a reload is armed, which is close
      // to never. A permanent 4s wake-up on every page for every user is a
      // battery cost with no reader.
      if (retry) return;
      retry = setInterval(() => {
        const pending = armedRef.current;
        if (!pending) { clearInterval(retry); retry = null; setPill(false); return; }
        if (document.visibilityState !== "visible") return;
        const now = blockers();
        offer(now);
        if (!now.length) takeIt(pending, "deferred");
      }, RETRY_MS);
    };

    const check = async (trigger) => {
      if (inflight || !alive) return;
      if (trigger !== "boot" && document.visibilityState !== "visible") return;
      inflight = true;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = await r.json();
        const server = j && j.build;
        if (!alive) return;
        if (!server) return;                       // unconfigured server: watch off
        if (server === mine) { armedRef.current = ""; setPill(false); return; }
        settle(server, trigger);
      } catch (e) {
        // Offline or a hiccup: do nothing. The next trigger tries again.
      } finally { inflight = false; }
    };

    // ---- triggers -----------------------------------------------------------
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAtRef.current = Date.now(); return; }
      // Back from a real absence ⇒ whatever they were doing, they were not
      // doing it a moment ago. Clear the interaction clock so the reload can
      // happen right now instead of waiting out an idle window they already served.
      if (hiddenAtRef.current && Date.now() - hiddenAtRef.current >= HIDDEN_CLEARS_MS) touchedRef.current = 0;
      hiddenAtRef.current = 0;
      check("visibility");
    };
    const onPageShow = (e) => { if (e && e.persisted) { touchedRef.current = 0; check("pageshow"); } };
    const onOnline = () => check("online");
    const onTouch = () => { touchedRef.current = Date.now(); };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    // NOT "scroll": that fires at frame rate, and touchstart already precedes
    // every touch scroll while wheel covers the desktop. Same coverage, no
    // listener on the hot path (v8.79 was a scroll-tick regression; not again).
    const TOUCH = ["pointerdown", "keydown", "touchstart", "wheel"];
    TOUCH.forEach((t) => document.addEventListener(t, onTouch, { passive: true, capture: true }));

    poll = setInterval(() => check("interval"), CHECK_MS);

    // THE BOOT CHECK — the hole that let 2026-08-27 happen. Only when the
    // document itself may have come from cache; a document that arrived over
    // the wire is by definition the build the server just handed us.
    let nav = null;
    try { nav = performance.getEntriesByType("navigation")[0] || null; } catch (e) {}
    if (documentMayBeStale(nav)) check("boot");

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      TOUCH.forEach((t) => document.removeEventListener(t, onTouch, { capture: true }));
      if (poll) clearInterval(poll);
      if (retry) clearInterval(retry);
    };
  }, []);

  if (!pill) return null;
  return (
    <button
      type="button"
      onClick={onPill}
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 86px)",
        zIndex: 30,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        maxWidth: "calc(100vw - 32px)",
        padding: "9px 15px",
        borderRadius: 999,
        border: "1px solid rgba(249,115,22,.45)",
        background: "rgba(13,17,23,.94)",
        WebkitBackdropFilter: "blur(10px)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 12px 32px rgba(0,0,0,.5)",
        color: "#F8FAFC",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true" style={{ color: "#FB923C" }}>↻</span>
      Wayfind just updated — tap to reload
    </button>
  );
}
