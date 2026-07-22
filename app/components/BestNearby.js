"use client";
// BestNearby — ONE near-black card, two expandable menus (owner direction
// 2026-07-21 late): "Best places to eat nearby" and "Top things to do",
// both riding the day's engines. Eat = wf_best_picks(p_category:'food').
// Things to do = wf_things_to_do — Cowork's merge engine: Viator tours +
// attractions + beaches ranked TOGETHER (verified live: anon-executable,
// selling_out is Viator's own flag, tours carry price/duration/booking_url
// and no distance because the experiences table holds only a city).
// Unified row: tours show price + duration + Book↗ (affiliate, disclosed);
// places show Wayfind Score + miles + directions. Lazy fetch per section,
// one open at a time, reserved-height loading, honest empty states.
// scripts/test-todays-best.mjs locks the contract.
import { useState, useRef } from "react";
import { C, TYPE, RADII, SHADOW, FOCUS, TARGET, Icon, NavIcon, directionsUrl, PlaceScoreChip } from "./kit";
import { fetchTodaysBest, fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";

// Owner: "a little lighter, almost black" — one step off the page's #040810.
const CARD_BG = "#0B0E15";

const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

function Row({ thumb, title, meta, badge, trailing, onClick, href }) {
  const inner = (
    <>
      <div style={{ width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.card, position: "relative" }}>
        {thumb && <img src={thumb} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          {badge}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontSize: 12.5, color: C.muted, flexWrap: "wrap" }}>{meta}</div>
      </div>
      {trailing}
    </>
  );
  const style = { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "8px 2px", minHeight: TARGET, background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer", textDecoration: "none" };
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className="wf-bn-focus" style={style}>{inner}</a>
    : <button onClick={onClick} className="wf-bn-focus" style={style}>{inner}</button>;
}

const SellingFast = () => (
  <span style={{ flexShrink: 0, background: "#B33A2B", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px" }}>Selling fast</span>
);

export default function BestNearby({ center, weather, onLog }) {
  const [open, setOpen] = useState(null); // "eat" | "todo" | null
  const [rows, setRows] = useState({});
  const fetchedFor = useRef("");

  const load = (id) => {
    const d = new Date();
    const base = {
      lat: center && center.lat, lng: center && center.lng,
      localHour: d.getHours() + d.getMinutes() / 60,
      tempF: weather && weather.temp != null ? weather.temp : null,
      condition: weather && weather.label ? weather.label : null,
    };
    return id === "eat" ? fetchTodaysBest({ ...base, category: "food", limit: 10 }) : fetchThingsToDo({ ...base, limit: 10 });
  };

  const toggle = (id) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (!next) return;
    try { onLog && onLog("best_nearby_open", null, { section: id }); } catch (e) {}
    const centerKey = center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : "";
    if (fetchedFor.current !== centerKey) { fetchedFor.current = centerKey; setRows({}); }
    setRows((r) => {
      if (r[id]) return r;
      (async () => { const data = await load(id); setRows((r2) => ({ ...r2, [id]: data })); })();
      return { ...r, [id]: "loading" };
    });
  };

  const go = (p) => {
    try { onLog && onLog("best_nearby_go", { id: p.place_id || p.id, name: p.name || p.title }); } catch (e) {}
    const u = directionsUrl({ id: p.place_id || p.id, name: p.name || p.title, lat: p.lat, lng: p.lng });
    if (u) { try { window.open(u, "_blank", "noopener"); } catch (e) {} }
  };

  const SECTIONS = [
    { id: "eat", label: "Best places to eat nearby", icon: "food" },
    { id: "todo", label: "Top things to do", icon: "attractions" },
  ];

  return (
    <section aria-label="Best nearby" style={{ background: CARD_BG, border: `1px solid ${C.border}`, borderRadius: 16, padding: "4px 14px", marginBottom: 16, boxShadow: SHADOW.card }}>
      <style>{`.wf-bn-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}`}</style>
      {SECTIONS.map((sdef, si) => {
        const isOpen = open === sdef.id;
        const data = rows[sdef.id];
        const list = Array.isArray(data) ? data : [];
        return (
          <div key={sdef.id}>
            <button onClick={() => toggle(sdef.id)} aria-expanded={isOpen} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: si ? "1px solid rgba(255,255,255,.07)" : "none", padding: "15px 0", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <NavIcon name={sdef.icon} size={24} strokeWidth={1.6} color={isOpen ? C.accent : "#FFFFFF"} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 700, color: isOpen ? C.accent : C.text, lineHeight: 1.25 }}>{sdef.label}</span>
              <span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.35)", display: "inline-flex", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .22s ease" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: isOpen ? 10 * 64 + 60 : 0, opacity: isOpen ? 1 : 0, transition: "max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease" }}>
              <div style={{ padding: "0 0 12px" }}>
                {data === "loading" ? (
                  <>
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                  </>
                ) : list.length ? (
                  <>
                    {sdef.id === "eat"
                      ? list.map((p) => (
                          <Row key={p.place_id} thumb={tbPhotoUrl(p.photo_ref, 240)} title={p.name} onClick={() => go(p)}
                            meta={<>
                              {isFinite(p.distance_mi) ? <span>{p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)} mi</span> : null}
                              <PlaceScoreChip p={{ rating: p.rating, reviews: p.reviews }} size={12} />
                            </>}
                            trailing={<span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>} />
                        ))
                      : list.map((r) => r.kind === "experience" ? (
                          <Row key={r.id} href={r.booking_url} thumb={r.image_url || null} title={r.title}
                            badge={r.selling_out ? <SellingFast /> : null}
                            meta={<>
                              <PlaceScoreChip p={{ rating: r.rating, reviews: r.reviews }} size={12} />
                              {r.price_from != null ? <span style={{ color: C.green, fontWeight: 700 }}>from ${r.price_from}</span> : null}
                              {fmtDur(r.duration_min) ? <span>{fmtDur(r.duration_min)}</span> : null}
                            </>}
                            trailing={<span style={{ flexShrink: 0, background: C.accent, color: "#0D1117", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 800 }}>Book ↗</span>} />
                        ) : (
                          <Row key={r.id} thumb={tbPhotoUrl(r.photo_ref, 240)} title={r.title} onClick={() => go({ id: r.id, title: r.title, lat: r.lat, lng: r.lng })}
                            meta={<>
                              {isFinite(r.distance_mi) ? <span>{r.distance_mi < 10 ? r.distance_mi.toFixed(1) : Math.round(r.distance_mi)} mi</span> : null}
                              <PlaceScoreChip p={{ rating: r.rating, reviews: r.reviews }} size={12} />
                            </>}
                            trailing={<span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>} />
                        ))}
                    {sdef.id === "todo" && list.some((r) => r.kind === "experience") ? (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>Tours &amp; activities are affiliate links; Wayfind may earn a commission at no cost to you. It never changes what we recommend.</div>
                    ) : null}
                  </>
                ) : Array.isArray(data) ? (
                  <div style={{ padding: "8px 2px 10px", fontSize: 12.5, color: C.muted }}>Nothing strong here right now.</div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
