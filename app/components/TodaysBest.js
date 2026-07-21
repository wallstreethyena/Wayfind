"use client";
// TodaysBest — the Today's Best accordion (owner direction 2026-07-21):
// one drop-down row per engine-served category, each expanding to the best
// of the best nearby from wf_best_picks (wf_trends boost seam ready in
// lib/todaysBest). Sections lazy-fetch on first open, one open at a time.
// Every number is the Wayfind Score (never the raw Google star); reserved-
// height loading rows; an empty section says so honestly.
import { useState, useRef } from "react";
import { C, TYPE, RADII, SHADOW, FOCUS, TARGET, NavIcon, Icon, directionsUrl, PlaceScoreChip } from "./kit";
import { TB_SECTIONS, fetchTodaysBest, tbPhotoUrl } from "../../lib/todaysBest.js";

function PickRow({ p, onGo }) {
  const img = tbPhotoUrl(p.photo_ref, 240);
  return (
    <button onClick={() => onGo(p)} className="wf-tb-focus" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "8px 2px", minHeight: TARGET, background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer" }}>
      <div style={{ width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.card }}>
        {img && <img src={img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, ...TYPE.meta, fontSize: 12.5, color: C.muted }}>
          {isFinite(p.distance_mi) ? <span>{p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)} mi</span> : null}
          <PlaceScoreChip p={{ rating: p.rating, reviews: p.reviews }} size={12} />
        </div>
      </div>
      <span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </span>
    </button>
  );
}

export default function TodaysBest({ center, weather, onLog }) {
  const [open, setOpen] = useState(null); // one section open at a time
  const [rows, setRows] = useState({});   // sectionId -> picks[] | "loading"
  const fetchedFor = useRef("");          // center key the cache belongs to

  const toggle = (id) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (!next) return;
    try { onLog && onLog("todays_best_open", null, { section: id }); } catch (e) {}
    const centerKey = center ? center.lat.toFixed(3) + "," + center.lng.toFixed(3) : "";
    if (fetchedFor.current !== centerKey) { fetchedFor.current = centerKey; setRows({}); }
    setRows((r) => {
      if (r[id]) return r; // cached for this center
      (async () => {
        const d = new Date();
        const picks = await fetchTodaysBest({
          lat: center && center.lat, lng: center && center.lng,
          localHour: d.getHours() + d.getMinutes() / 60,
          tempF: weather && weather.temp != null ? weather.temp : null,
          condition: weather && weather.label ? weather.label : null,
          category: id,
        });
        setRows((r2) => ({ ...r2, [id]: picks }));
      })();
      return { ...r, [id]: "loading" };
    });
  };

  const go = (p) => {
    try { onLog && onLog("todays_best_go", { id: p.place_id, name: p.name }); } catch (e) {}
    const u = directionsUrl({ id: p.place_id, name: p.name, lat: p.lat, lng: p.lng });
    if (u) { try { window.open(u, "_blank", "noopener"); } catch (e) {} }
  };

  return (
    <section aria-label="Today's Best" style={{ marginBottom: 16, background: "transparent", borderTop: "1px solid rgba(255,255,255,.08)" }}>
      <style>{`.wf-tb-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}`}</style>
      <div style={{ padding: "16px 2px 6px" }}>
        <div style={{ ...TYPE.eyebrow, color: C.accent }}>Today's Best</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>The best of the best near you, ranked live for right now.</div>
      </div>
      {TB_SECTIONS.map((s) => {
        const isOpen = open === s.id;
        const data = rows[s.id];
        return (
          <div key={s.id}>
            <button onClick={() => toggle(s.id)} aria-expanded={isOpen} className="wf-tb-focus" style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", padding: "16px 2px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span aria-hidden="true" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28 }}>
                <NavIcon name={s.id} size={25} strokeWidth={1.5} color={isOpen ? C.accent : "#FFFFFF"} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 600, color: isOpen ? C.accent : "rgba(255,255,255,.95)", lineHeight: 1.25 }}>{s.label}</span>
              <span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)", display: "inline-flex", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .22s ease" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: isOpen ? 4 * 64 + 40 : 0, opacity: isOpen ? 1 : 0, transition: "max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease" }}>
              <div style={{ padding: "0 0 10px 41px" }}>
                {data === "loading" ? (
                  <>
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                  </>
                ) : Array.isArray(data) && data.length ? (
                  data.map((p) => <PickRow key={p.place_id} p={p} onGo={go} />)
                ) : Array.isArray(data) ? (
                  <div style={{ padding: "10px 2px", fontSize: 12.5, color: C.muted }}>Nothing strong in this category right now.</div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ padding: "12px 2px 14px", fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>Ranked by the Wayfind Score for this hour and weather. No ads, no paid placement.</div>
    </section>
  );
}
