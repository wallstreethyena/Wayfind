"use client";
// app/components/native/OfflineOverlay.js — the full screen "You're offline"
// state for a mid-session drop inside the native shell. Loaded ONLY through
// next/dynamic from ../NativeOfflineOverlay.js, and only while offline is
// true, so this markup and its probe loop never ship to a visitor who is
// never offline (bundle budget: see CLAUDE.md).
//
// Visually and behaviourally the native counterpart of www/offline.html
// (Capacitor's server.errorPath page, shown when the WebView fails to load
// the remote URL at all rather than losing it mid-session). Keep the two in
// sync on copy and probe logic — scripts/check-ios-shell-wiring.mjs checks
// www/offline.html only, but a reviewer or a returning user can hit either
// one in the same session.
import { useEffect, useRef, useState } from "react";

const SAME_ORIGIN_PATH = "/api/version";
const TIMEOUT_MS = 6000;
const POLL_MS = 5000;

export default function OfflineOverlay({ onRecovered }) {
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const buttonRef = useRef(null);
  const pollRef = useRef(null);
  const recoveredRef = useRef(onRecovered);
  recoveredRef.current = onRecovered;

  const probe = () => {
    setChecking(true);
    setStatus("Checking connection...");
    let controller = null;
    let signal;
    try {
      controller = new AbortController();
      signal = controller.signal;
    } catch (e) {
      signal = undefined;
    }
    const timer = setTimeout(() => { try { controller && controller.abort(); } catch (e) {} }, TIMEOUT_MS);
    const opts = { cache: "no-store" };
    if (signal) opts.signal = signal;
    fetch(SAME_ORIGIN_PATH + "?probe=" + Date.now(), opts)
      .then((res) => {
        clearTimeout(timer);
        setChecking(false);
        if (res && res.ok) {
          setStatus("Back online");
          try { recoveredRef.current && recoveredRef.current(); } catch (e) {}
        } else {
          setStatus("Still offline");
        }
      })
      .catch(() => {
        clearTimeout(timer);
        setChecking(false);
        setStatus("Still offline");
      });
  };

  useEffect(() => {
    // Focus the retry button immediately, per role="alertdialog".
    try { buttonRef.current && buttonRef.current.focus(); } catch (e) {}
    probe();

    const onOnline = () => probe();
    window.addEventListener("online", onOnline);

    const startPoll = () => {
      stopPoll();
      pollRef.current = setInterval(() => {
        if (document.visibilityState !== "hidden") probe();
      }, POLL_MS);
    };
    const stopPoll = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopPoll();
      else startPoll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    startPoll();

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="wf-offline-heading"
      aria-describedby="wf-offline-body"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "#0D1117",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <svg width="64" height="72" viewBox="0 0 32 36" fill="none" aria-hidden="true" style={{ marginBottom: 28 }}>
        <path
          d="M16 2 C9.4 2 4 7.4 4 14 c0 8.4 12 16 12 16 s12-7.6 12-16 C28 7.4 22.6 2 16 2 Z M16 8.6 a5.4 5.4 0 1 0 0.001 0 Z"
          fill="#F97316"
          fillRule="evenodd"
        />
      </svg>
      <h1 id="wf-offline-heading" style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: "#F3F4F6" }}>
        You're offline
      </h1>
      <p id="wf-offline-body" style={{ margin: "0 0 28px", maxWidth: 320, fontSize: 15, lineHeight: 1.5, color: "#9CA3AF" }}>
        Wayfind needs a connection to find what's around you. We'll reconnect as soon as you're back online.
      </p>
      <button
        ref={buttonRef}
        type="button"
        onClick={probe}
        disabled={checking}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          border: "none",
          outline: "none",
          background: "#F97316",
          color: "#0D1117",
          fontSize: 16,
          fontWeight: 800,
          padding: "0 28px",
          minHeight: 52,
          minWidth: 44,
          borderRadius: 999,
          cursor: "pointer",
          opacity: checking ? 0.55 : 1,
        }}
      >
        Try again
      </button>
      <div role="status" aria-live="polite" style={{ marginTop: 18, minHeight: 18, fontSize: 13, color: "#9CA3AF" }}>
        {status}
      </div>
    </div>
  );
}
