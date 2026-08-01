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
  const safeRadius = Math.min(60, Math.max(1, Number(radius) || 17));
  const radiusPct = Math.round(((safeRadius - 1) / 59) * 100);
  return (
    <div data-collection-filter style={{ position: "relative", margin: "16px 0 14px" }}>
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} style={{ minHeight: 46, display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 16px", borderRadius: 999, border: "1px solid " + (open ? "#F97316" : "rgba(255,255,255,.14)"), background: "#161D2B", color: "#E5EAF2", fontSize: 14, fontWeight: 850, cursor: "pointer" }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        {sortBy === "near" ? `Within ${radius} mi` : label}
        <span aria-hidden="true" style={{ color: "#9AA5B7", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close filter" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19, border: 0, background: "transparent", cursor: "default" }} />
          <div role="dialog" aria-label="Filter and sort this list" style={{ position: "absolute", zIndex: 20, left: 0, top: 52, width: "min(356px,calc(100vw - 32px))", padding: 14, borderRadius: 17, border: "1px solid rgba(255,255,255,.16)", background: "#161B22", boxShadow: "0 18px 52px rgba(0,0,0,.58)" }}>
            <div style={{ color: "#9AA7BB", fontSize: 10.5, fontWeight: 900, letterSpacing: "1.25px", textTransform: "uppercase", margin: "2px 4px 7px" }}>Sort by</div>
            {options.map(([key, text]) => (
              <button key={key} type="button" onClick={() => onSort(key)} style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", border: 0, borderRadius: 11, background: sortBy === key ? "rgba(249,115,22,.13)" : "transparent", color: sortBy === key ? "#F8F5EE" : "#C6CEDB", fontSize: 13.5, fontWeight: sortBy === key ? 850 : 650, textAlign: "left", cursor: "pointer" }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + (sortBy === key ? "#F97316" : "#64748B"), display: "grid", placeItems: "center", flexShrink: 0 }}>{sortBy === key ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F97316" }} /> : null}</span>
                {text}
              </button>
            ))}
            <div style={{ height: 1, background: "rgba(255,255,255,.14)", margin: "10px 2px 11px" }} />
            <div style={{ color: "#9AA7BB", fontSize: 10.5, fontWeight: 900, letterSpacing: "1.25px", textTransform: "uppercase", margin: "0 4px 8px" }}>Search distance</div>
            <div style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,.14)", background: "#1A2231" }}>
              <style dangerouslySetInnerHTML={{ __html: `.wf-collection-radius{-webkit-appearance:none;appearance:none;width:100%;height:26px;background:transparent;outline:none;margin:5px 0 2px;cursor:pointer}.wf-collection-radius::-webkit-slider-runnable-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#FB923C 0%,#F97316 var(--wf-radius-pct),#334155 var(--wf-radius-pct))}.wf-collection-radius::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#FFD9B3,#F97316 68%);border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(249,115,22,.22),0 3px 10px rgba(0,0,0,.5);margin-top:-10px}.wf-collection-radius::-moz-range-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#FB923C 0%,#F97316 var(--wf-radius-pct),#334155 var(--wf-radius-pct))}.wf-collection-radius::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#FFD9B3,#F97316 68%);border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(249,115,22,.22),0 3px 10px rgba(0,0,0,.5)}` }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ color: "#F8F5EE", fontSize: 14 }}>Within <span style={{ color: "#F97316", fontSize: 17 }}>{safeRadius} mi</span></strong>
                <span style={{ color: "#9AA7BB", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>of {city}</span>
              </div>
              <input className="wf-collection-radius" type="range" min="1" max="60" step="1" value={safeRadius} aria-label="Search distance in miles" onChange={(event) => onRadius(Number(event.target.value))} style={{ "--wf-radius-pct": radiusPct + "%" }} />
              <div style={{ display: "flex", justifyContent: "space-between", color: "#9AA7BB", fontSize: 10.5, fontWeight: 750 }}>
                {[1, 15, 30, 45, 60].map((mi) => <span key={mi}>{mi} mi</span>)}
              </div>
            </div>
            <div style={{ color: "#9AA7BB", fontSize: 10.5, lineHeight: 1.4, padding: "9px 5px 1px" }}>Widening the distance automatically brings in fresh results.</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
