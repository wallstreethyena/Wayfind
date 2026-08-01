"use client";

import { useState } from "react";

const FILTER_OPTIONS = [
  ["rated", "Top rated"],
  ["near", "Closest first"],
  ["price", "Price: low to high"],
];

// One visible filter for every ranked collection. It lives outside any one
// intent page so homepage-hero destinations and category-chip destinations
// cannot quietly drift back to different controls.
export default function CollectionFilter({ sortBy, onSort, radius, onRadius, city, showPrice = true }) {
  const [open, setOpen] = useState(false);
  const options = showPrice ? FILTER_OPTIONS : FILTER_OPTIONS.slice(0, 2);
  const label = (options.find(([key]) => key === sortBy) || options[0])[1];
  return (
    <div data-collection-filter style={{ position: "relative", margin: "16px 0 14px" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ minHeight: 46, display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,.14)", background: "#161D2B", color: "#E5EAF2", fontSize: 14, fontWeight: 850, cursor: "pointer" }}>
        <span aria-hidden="true" style={{ color: "#F97316" }}>≡</span>
        {sortBy === "near" ? `Within ${radius} mi` : label}
        <span aria-hidden="true" style={{ color: "#9AA5B7" }}>▾</span>
      </button>
      {open ? (
        <div role="dialog" aria-label="Filter and sort this list" style={{ position: "absolute", zIndex: 20, left: 0, top: 52, width: "min(320px,calc(100vw - 40px))", padding: 12, borderRadius: 16, border: "1px solid rgba(255,255,255,.14)", background: "#111827", boxShadow: "0 18px 48px rgba(0,0,0,.55)" }}>
          <div style={{ color: "#8F9BAD", fontSize: 10.5, fontWeight: 900, letterSpacing: "1.2px", textTransform: "uppercase", margin: "2px 4px 7px" }}>Sort</div>
          {options.map(([key, text]) => (
            <button key={key} type="button" onClick={() => { onSort(key); setOpen(false); }} style={{ width: "100%", minHeight: 42, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: 0, borderRadius: 10, background: sortBy === key ? "rgba(249,115,22,.13)" : "transparent", color: sortBy === key ? "#F8F5EE" : "#C2CAD7", fontSize: 13.5, fontWeight: sortBy === key ? 850 : 650, textAlign: "left", cursor: "pointer" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid " + (sortBy === key ? "#F97316" : "#64748B"), display: "grid", placeItems: "center" }}>{sortBy === key ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F97316" }} /> : null}</span>
              {text}
            </button>
          ))}
          <div style={{ color: "#8F9BAD", fontSize: 10.5, fontWeight: 900, letterSpacing: "1.2px", textTransform: "uppercase", margin: "12px 4px 8px" }}>Distance from {city}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7 }}>
            {[17, 30, 60].map((mi) => <button key={mi} type="button" onClick={() => onRadius(mi)} style={{ minHeight: 40, borderRadius: 10, border: "1px solid " + (radius === mi ? "#F97316" : "rgba(255,255,255,.12)"), background: radius === mi ? "rgba(249,115,22,.13)" : "transparent", color: radius === mi ? "#F8F5EE" : "#B7C0D1", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{mi} mi</button>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
