"use client";

// app/components/CreatorShareButton.js — the creator's own share affordance.
//
// Owner, 2026-08-30: "don't forget to have a share button so that cindy can
// share her page professionally and start having SEO optimization."
//
// Reuses the sitewide dark/orange intent menu and explicit text-first choices.
// Copy feedback is earned only after an explicitly requested clipboard write.
import { openShareFlow } from "../../lib/shareFlow.js";
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

  const onClick = useCallback(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    const text = title || `Every place @${handle} has featured, on Wayfind`;
    const how = openShareFlow({ title: text, text, url }, () => flash("copied"));
    if (how === "failed") flash("manual");
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
