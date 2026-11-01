"use client";

import { useState } from "react";

// The Christmas list's filter, built to look and behave like the one filter
// every ranked collection uses (app/components/CollectionFilter.js): one pill
// with the orange lines icon and a caret, opening a sheet with radio rows.
// Owner 2026-11-01: "Why dint we use this filter? … Please fix it", replacing
// the page's own region <select> and "Nearest to me" button.
//
// Only choices the browse API already understands (lib/christmasBrowse.js
// parseChristmasBrowseQuery): order (tickets first, or nearest from lat/lng),
// a date window (`when`) and a region.
const SORTS = [["tickets", "Tickets first"], ["near", "Closest first"]];

const head = { color: "#9AA7BB", fontSize: 10.5, fontWeight: 900, letterSpacing: "1.25px", textTransform: "uppercase", margin: "2px 4px 7px" };
const rule = { height: 1, background: "rgba(255,255,255,.14)", margin: "10px 2px 11px" };

function Row({ on, text, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", border: 0, borderRadius: 11, background: on ? "rgba(249,115,22,.13)" : "transparent", color: on ? "#F8F5EE" : "#C6CEDB", fontSize: 13.5, fontWeight: on ? 850 : 650, textAlign: "left", cursor: "pointer" }}>
      <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + (on ? "#F97316" : "#64748B"), display: "grid", placeItems: "center", flexShrink: 0 }}>{on ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F97316" }} /> : null}</span>
      {text}
    </button>
  );
}

export default function ChristmasFilter({ query, facets, onSet, onNear, onClearNear }) {
  const [open, setOpen] = useState(false);
  const near = query.lat != null && query.lat !== "";
  const dates = Array.isArray(facets.dates) ? facets.dates : [];
  const regions = Array.isArray(facets.regions) ? facets.regions : [];
  const whenLabel = (dates.find((d) => d.id === query.when) || {}).label || "";
  const label = near ? "Closest first" : whenLabel || query.region || "Tickets first";
  const active = (near ? 1 : 0) + (query.when ? 1 : 0) + (query.region ? 1 : 0);
  const pick = (fn) => { fn(); setOpen(false); };
  return (
    <div data-christmas-filter="" data-collection-filter="" style={{ position: "relative", flex: "0 0 auto" }}>
      <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} style={{ minHeight: 46, display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 16px", borderRadius: 999, border: "1px solid " + (open ? "#F97316" : "rgba(255,255,255,.14)"), background: "#161D2B", color: "#E5EAF2", fontSize: 14, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        {label}
        {active > 1 ? <span aria-label={active + " filters on"} style={{ minWidth: 20, height: 20, borderRadius: 999, background: "#F97316", color: "#0D1117", fontSize: 11.5, fontWeight: 900, display: "inline-grid", placeItems: "center", padding: "0 5px" }}>{active}</span> : null}
        <span aria-hidden="true" style={{ color: "#9AA5B7", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close filter" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39, border: 0, background: "transparent", cursor: "default" }} />
          <div role="dialog" aria-label="Filter and sort Christmas events" style={{ position: "absolute", zIndex: 40, left: 0, top: 52, width: "min(356px,calc(100vw - 32px))", maxHeight: "min(70vh,560px)", overflowY: "auto", padding: 14, borderRadius: 17, border: "1px solid rgba(255,255,255,.16)", background: "#161B22", boxShadow: "0 18px 52px rgba(0,0,0,.58)" }}>
            <div style={head}>Sort by</div>
            <div role="radiogroup" aria-label="Sort by">
              {SORTS.map(([key, text]) => (
                <Row key={key} on={key === "near" ? near : !near} text={text} onClick={() => pick(key === "near" ? onNear : onClearNear)} />
              ))}
            </div>
            <div style={rule} />
            <div style={head}>When</div>
            <div role="radiogroup" aria-label="When">
              <Row on={!query.when} text="Any time" onClick={() => pick(() => onSet("when", ""))} />
              {dates.map((d) => <Row key={d.id} on={query.when === d.id} text={d.label} onClick={() => pick(() => onSet("when", d.id))} />)}
            </div>
            <div style={rule} />
            <div style={head}>Region</div>
            <div role="radiogroup" aria-label="Region">
              <Row on={!query.region} text="All of Florida" onClick={() => pick(() => onSet("region", ""))} />
              {regions.map((r) => <Row key={r} on={query.region === r} text={r} onClick={() => pick(() => onSet("region", r))} />)}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
