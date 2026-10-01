"use client";
// The one recovery screen both error boundaries render (app/error.js inside the
// root layout, app/global-error.js when the root layout itself failed). Same
// words and look as the home screen's own boundary in app/home.js ("That took a
// wrong turn" / "Reload Wayfind"), so a reader sees one Wayfind, not three.
//
// NEAR IMPORT-FREE ON PURPOSE. Both boundaries sit at the root, so
// everything this file imports is paid on "/" against scripts/check-bundle.mjs
// (498KB ratchet, 0.3KB headroom on 2026-09-30); importing lib/chunkRecovery
// and lazy Sentry/analytics loaders here measured +0.4KB and failed it. So:
//   • the chunk rule is the layout's inline script, reached through
//     window.__wfChunkRecover (lib/chunkRecovery.js builds it) — one
//     implementation, reload at most once per window, never a loop;
//   • the error is reported with the browser's reportError(), which the
//     layout's early Sentry shim and Sentry's own global handler both capture;
//   • the `app_error` event app/home.js's boundary already sends is sent here
//     too, through captureOrQueue (queued if PostHog has not booted, per
//     scripts/test-commerce-emit-queue.mjs). lib/browserAnalytics is already in
//     the root bundle (app/components/VersionWatch.js), so it measured +0KB.
// Inline styles only: this must paint even when the app's CSS failed to load.
import { useEffect, useState } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics";

const BG = "#040810";
const TEXT = "#F1F5F9";
const MUTED = "#94A3B8";
const ACCENT = "#F97316";

export default function RecoveryScreen({ error, reset, boundary }) {
  // Unknown until the effect asks the inline script; the first paint is the
  // generic copy, which is true for both cases.
  const [chunk, setChunk] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let wasChunk = false;
    try { if (typeof window.reportError === "function") window.reportError(error); } catch (e) { /* best-effort */ }
    try { if (typeof window.__wfChunkRecover === "function") wasChunk = !!window.__wfChunkRecover(error); } catch (e) { /* best-effort */ }
    try { captureOrQueue(window, "app_error", { boundary: boundary || "unknown", chunk: wasChunk, message: String((error && error.message) || "").slice(0, 200) }); } catch (e) { /* best-effort */ }
    // One prompt at a time: the pre-React layer may have painted its
    // #wf-chunk-bar for the same failure before this screen mounted.
    try { const bar = document.getElementById("wf-chunk-bar"); if (bar) bar.remove(); } catch (e) { /* best-effort */ }
    setChunk(wasChunk);
  }, [error, boundary]);

  const reload = () => {
    setReloading(true);
    try { window.location.reload(); } catch (e) { setReloading(false); }
  };

  return (
    <main
      role="alert"
      aria-live="assertive"
      data-wf-recovery="1"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: BG, color: TEXT, padding: 24, textAlign: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif", boxSizing: "border-box" }}
    >
      <div style={{ fontSize: 18, fontWeight: 800 }}>That took a wrong turn</div>
      <div style={{ fontSize: 14, color: MUTED, maxWidth: 300, lineHeight: 1.5 }}>
        {chunk
          ? "Part of the page didn't finish loading — usually a weak connection. Reloading fixes it."
          : "Something hiccuped. Tap below to get back on track."}
      </div>
      <button
        type="button"
        onClick={reload}
        disabled={reloading}
        style={{ marginTop: 4, minHeight: 44, padding: "11px 22px", background: ACCENT, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 800, cursor: reloading ? "default" : "pointer", opacity: reloading ? 0.7 : 1 }}
      >
        Reload Wayfind
      </button>
      {!chunk && typeof reset === "function" ? (
        <button
          type="button"
          onClick={() => reset()}
          style={{ minHeight: 44, padding: "8px 16px", background: "transparent", border: "1px solid #2D3748", borderRadius: 12, color: TEXT, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          Try again
        </button>
      ) : null}
      <a href="/" style={{ color: MUTED, fontSize: 13, textDecoration: "underline", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Go to the home page</a>
    </main>
  );
}
