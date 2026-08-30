"use client";

// app/components/CreatorShareButton.js — the creator's own share affordance.
//
// Owner, 2026-08-30: "don't forget to have a share button so that cindy can
// share her page professionally and start having SEO optimization."
//
// TWO PATHS, ONE BUTTON, AND THE FALLBACK IS THE POINT. navigator.share opens
// the phone's real sheet (Instagram story, TikTok DM, Messages) — which is how
// a creator actually shares a link, and it is the whole reason this exists. But
// it is undefined on most desktop browsers and THROWS on a non-secure origin,
// so a button that only calls it is a dead button on the machine she edits from.
// Clipboard is the fallback, and a manual text-selection copy is the fallback to
// THAT (Safari refuses navigator.clipboard outside a user gesture chain often
// enough to matter). Every rung leaves the reader with the URL.
//
// The URL is read from window.location at click time rather than baked in, so a
// share from a page reached through any host or with any tracking suffix shares
// the page the reader is actually on. AbortError is a user closing the sheet —
// it is a normal outcome, not a failure, and must not fall through to "copied".
import { useCallback, useEffect, useRef, useState } from "react";

export default function CreatorShareButton({ handle, title }) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = useCallback((s) => {
    setState(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2400);
  }, []);

  const onClick = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    const text = title || `Every place @${handle} has featured, on Wayfind`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: text, text, url });
        return;
      }
    } catch (e) {
      // The reader dismissed the sheet. Nothing was shared and nothing failed.
      if (e && e.name === "AbortError") return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        flash("copied");
        return;
      }
    } catch (e) { /* fall through to the manual rung */ }
    flash("manual");
  }, [handle, title, flash]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 999,
          fontSize: 13.5, fontWeight: 800, cursor: "pointer",
          border: "1px solid rgba(148,163,184,.45)", background: "#161B22", color: "#E2E8F0",
        }}
      >
        <span aria-hidden="true">↗</span> Share this page
      </button>
      {/* aria-live so the outcome reaches a screen reader too — a visual-only
          "Link copied" is a button that silently does nothing for some readers. */}
      <span role="status" aria-live="polite" style={{ fontSize: 12.5, fontWeight: 700, color: state === "idle" ? "transparent" : "#4ADE80" }}>
        {state === "copied" ? "Link copied" : state === "manual" ? "Copy the address bar to share" : " "}
      </span>
    </span>
  );
}
