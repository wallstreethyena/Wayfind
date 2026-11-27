"use client";
// The "quick take" above a place's reviews (owner, 2026-11-27: review
// summaries that help people decide faster). Loaded on demand from the detail
// sheet only when the reviews panel is open and the place has at least three
// reviews with real text. Renders nothing on any failure, so the raw reviews
// below it are always the fallback.
import { useEffect, useState } from "react";
import { C } from "./kit";

const MIN = 3;

export default function ReviewSummary({ placeId, name, reviews }) {
  const usable = Array.isArray(reviews) ? reviews.filter((r) => r && typeof r.text === "string" && r.text.trim().length >= 40) : [];
  const enough = !!placeId && usable.length >= MIN;
  const sig = enough ? placeId + "|" + usable.length + "|" + usable.map((r) => r.text.length).join(",") : "";
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!enough) return undefined;
    let alive = true;
    setSummary(null);
    fetch("/api/reviews/summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ placeId, name, reviews: usable.slice(0, 5).map((r) => ({ text: r.text, rating: r.rating || null })) }),
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive && d && d.summary && Array.isArray(d.summary.likes) && d.summary.likes.length) setSummary(d.summary);
    }).catch(() => {});
    return () => { alive = false; };
    // sig captures the review set; the array identity changes every render.
  }, [sig]);
  if (!summary) return null;
  const row = (mark, color, text, i) => (
    <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.light, lineHeight: 1.45, marginBottom: 5 }}>
      <span aria-hidden="true" style={{ color, fontWeight: 900, flex: "0 0 auto" }}>{mark}</span><span>{text}</span>
    </li>
  );
  return (
    <section aria-label="Quick take from these reviews" data-review-summary="" style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Quick take from these reviews</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {summary.likes.map((t, i) => row("+", "#34D399", t, "l" + i))}
        {(summary.know || []).map((t, i) => row("!", "#F59E0B", t, "k" + i))}
      </ul>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>A short summary of the reviews below, written by Wayfind.</div>
    </section>
  );
}
