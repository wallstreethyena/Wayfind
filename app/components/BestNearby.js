"use client";
// BestNearby v2 — one near-black card, three expandable menus (owner
// directions 2026-07-21 late evening):
//   1. Best places to eat nearby — wf_best_picks(food). The engine's daypart
//      math IS the owner's rule (5-10:30 boosts breakfast 1.4x, midday boosts
//      open-kitchen restaurants, evening boosts bars/late food and penalizes
//      breakfast -1.2). Rows open OUR detail sheet, never Google.
//   2. Top things to do — wf_things_to_do (tours + attractions + beaches
//      ranked together). Tours book on Viator; places open the detail sheet.
//   3. Local trends — the area right now: beach intelligence when the
//      nearest beach is within 20 mi (owner's definition of "near"), plus
//      the LLM-written daily brief (/api/local/report) grounded ONLY in
//      today's real events + live weather + the beach reading. No crowd or
//      trend claims anywhere — nothing here measures those.
// Top-3 ranks wear medals (champagne/silver/bronze trophy — the premium
// treatment the owner asked for). Lazy per-section fetches, one open at a
// time, reserved-height loading, honest empty states.
// scripts/test-todays-best.mjs locks the contract.
import { useState, useRef } from "react";
import { C, CHAMPAGNE, TYPE, RADII, SHADOW, FOCUS, TARGET, Icon, NavIcon, directionsUrl, PlaceScoreChip } from "./kit";
import { fetchTodaysBest, fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";
import { PLATFORM } from "../../lib/creatorVideos";
import { supabase } from "../../lib/supabase.js";
import { siteTodayStr } from "../../lib/siteTime.js";

// Owner: "a little lighter, almost black" — one step off the page's #040810.
const CARD_BG = "#0B0E15";
const MEDAL = [CHAMPAGNE.base, "#C7CCD6", "#B8804A"]; // gold, silver, bronze

const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

// Rank medal: top three only — a trophy in gold, silver, bronze.
function Medal({ i }) {
  if (i > 2) return <span style={{ width: 20, textAlign: "center", fontSize: 12, fontWeight: 800, color: C.muted, flexShrink: 0 }}>{i + 1}</span>;
  return (
    <span style={{ width: 20, display: "inline-flex", justifyContent: "center", flexShrink: 0 }} aria-label={"Ranked #" + (i + 1)}>
      <Icon name="trophy" size={15} color={MEDAL[i]} strokeWidth={2.2} />
    </span>
  );
}

function Row({ i, thumb, title, meta, badge, trailing, onClick, href }) {
  const inner = (
    <>
      <Medal i={i} />
      <div style={{ width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: C.card }}>
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
  const style = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 2px", minHeight: TARGET, background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer", textDecoration: "none" };
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className="wf-bn-focus" style={style}>{inner}</a>
    : <button onClick={onClick} className="wf-bn-focus" style={style}>{inner}</button>;
}

const SellingFast = () => (
  <span style={{ flexShrink: 0, background: "#B33A2B", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px" }}>Selling fast</span>
);

const STATUS_LABEL = { great: "Great beach day", great_uv_caution: "Great beach day · high UV", poor: "Not a beach day", unsafe: "Beach advisories active", too_far: null };

export default function BestNearby({ center, weather, events, videoPlaces, onOpenPlace, onLog }) {
  const [open, setOpen] = useState(null); // "eat" | "todo" | "trends"
  const [rows, setRows] = useState({});
  const fetchedFor = useRef("");

  const baseArgs = () => {
    const d = new Date();
    return {
      lat: center && center.lat, lng: center && center.lng,
      localHour: d.getHours() + d.getMinutes() / 60,
      tempF: weather && weather.temp != null ? weather.temp : null,
      condition: weather && weather.label ? weather.label : null,
    };
  };

  // Local trends: nearest beach ≤20mi (owner's "near"), its live conditions,
  // today's real events, and the grounded LLM brief. Every piece fails soft.
  const loadTrends = async () => {
    const { lat, lng } = baseArgs();
    const today = siteTodayStr();
    const todays = (events || []).filter((e) => e && e.name && e.date === today).slice(0, 8);
    let beach = null;
    try {
      if (supabase && isFinite(lat)) {
        const { data } = await supabase.rpc("wf_nearest_beaches", { p_lat: lat, p_lng: lng, p_radius_mi: 20, p_max: 1 });
        const b = Array.isArray(data) && data[0];
        if (b && b.name) {
          beach = { name: b.name, distance_mi: b.distance_mi, lat: b.lat, lng: b.lng };
          try {
            const r = await fetch("/api/beach/conditions?lat=" + b.lat + "&lng=" + b.lng + "&dist=" + b.distance_mi);
            const c = r.ok ? await r.json() : null;
            if (c) beach = { ...beach, status: c.status, reasons: c.reasons || [], waterTempF: c.conditions && c.conditions.waterTempF, waveHeightFt: c.conditions && c.conditions.waveHeightFt };
          } catch (e) {}
        }
      }
    } catch (e) {}
    let report = null;
    try {
      const r = await fetch("/api/local/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: null, events: todays.map((e) => ({ name: e.name, time: e.time, venue: e.venue || e.city })),
          weather: weather ? { temp: weather.temp, label: weather.label, sunset: weather.sunset } : null,
          beach,
        }),
      });
      const j = r.ok ? await r.json() : null;
      report = j && j.report ? j.report : null;
    } catch (e) {}
    return { kindOf: "trends", beach, todays, report };
  };

  const load = (id) =>
    id === "eat" ? fetchTodaysBest({ ...baseArgs(), category: "food", limit: 10 })
    : id === "todo" ? fetchThingsToDo({ ...baseArgs(), limit: 10 })
    : loadTrends();

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

  // Owner call: rows open OUR detail sheet (the same card the main menu
  // uses), never a Google tab. Tours still book out on Viator — that is the
  // product. Directions live inside the detail sheet.
  const openPlace = (p) => {
    try { onLog && onLog("best_nearby_detail", { id: p.id, name: p.name }); } catch (e) {}
    if (onOpenPlace) onOpenPlace(p);
    else { const u = directionsUrl(p); if (u) { try { window.open(u, "_blank", "noopener"); } catch (e) {} } }
  };

  // Owner (2026-07-21, late): Local trends is OFF for now — vertical budget
  // goes to the taller hero. All trends machinery stays; flip to bring back.
  const SHOW_TRENDS = false;
  const SECTIONS = [
    { id: "eat", label: "Best places to eat nearby", sub: "Ranked for this exact hour", icon: "food" },
    { id: "todo", label: "Top things to do", sub: "Tours, beaches and attractions, one list", icon: "attractions" },
    ...(SHOW_TRENDS ? [{ id: "trends", label: "Local trends", sub: "What creators are posting, plus your area right now", icon: "map" }] : []),
  ];

  const trendsBody = (d) => (
    <>
      {(videoPlaces || []).length ? (
        <div style={{ padding: "6px 2px 4px" }}>
          <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 2 }}>Creators are posting about these</div>
          {(videoPlaces || []).map(({ p, videos }, i) => (
            <button key={p.id} onClick={() => openPlace(p)} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "7px 0", minHeight: TARGET, background: "transparent", border: "none", borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none", cursor: "pointer" }}>
              <Medal i={i} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, flexWrap: "wrap" }}>
                  {[...new Set(videos.map((v) => v.platform))].slice(0, 3).map((pl) => PLATFORM[pl] ? (
                    <span key={pl} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: PLATFORM[pl].color }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: PLATFORM[pl].color, display: "inline-block" }} />{PLATFORM[pl].label}
                    </span>
                  ) : null)}
                  {videos[0] && videos[0].creator ? <span style={{ fontSize: 11, color: C.muted }}>{videos[0].creator}</span> : null}
                  <PlaceScoreChip p={p} size={11.5} />
                </div>
              </div>
              <span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ padding: "8px 2px 2px", fontSize: 12.5, color: C.muted }}>No creator videos linked near you yet — they appear here the moment one is.</div>
      )}
      {d.report ? (
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, padding: "8px 2px 4px", borderTop: "1px solid rgba(255,255,255,.06)" }}>{d.report}</div>
      ) : null}
      {d.beach && d.beach.status && STATUS_LABEL[d.beach.status] !== null ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 2px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
          <NavIcon name="beach" size={20} strokeWidth={1.6} color={C.blue} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{STATUS_LABEL[d.beach.status] || "Beach nearby"} · {d.beach.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {[isFinite(d.beach.distance_mi) ? d.beach.distance_mi.toFixed(1) + " mi" : null,
                isFinite(d.beach.waterTempF) ? "water " + Math.round(d.beach.waterTempF) + "°" : null,
                isFinite(d.beach.waveHeightFt) ? "waves " + d.beach.waveHeightFt + " ft" : null,
                ...(d.beach.reasons || []).slice(0, 1)].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      ) : null}
      {d.todays.length ? (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", padding: "8px 2px 2px" }}>
          <div style={{ ...TYPE.eyebrow, fontSize: 10, color: C.muted, marginBottom: 4 }}>Today</div>
          {d.todays.map((e, i) => (
            <div key={e.id || i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", fontSize: 13 }}>
              <span style={{ color: C.accent, fontWeight: 800, fontSize: 11.5, flexShrink: 0, minWidth: 52 }}>{e.time || "Today"}</span>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              {e.venue || e.city ? <span style={{ color: C.muted, fontSize: 11.5, flexShrink: 0 }}>· {e.venue || e.city}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      
    </>
  );

  return (
    <section aria-label="Best nearby" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(145deg, #101722 0%, #0A0E15 72%)", border: "1px solid #293442", borderRadius: 19, padding: "4px 14px", marginBottom: 12, boxShadow: "inset 0 1px 0 rgba(255,255,255,.045), 0 12px 30px rgba(0,0,0,.2)" }}>
      <style>{`.wf-bn-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 1px 8px" }}>
        <span style={{ fontSize: 11.5, fontWeight: 750, color: "#DCE5F0", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent, boxShadow: "0 0 8px rgba(249,115,22,.55)" }} />Nearby, right now</span>
        <span style={{ fontSize: 10.5, color: "#7F8DA0" }}>Updated for this hour</span>
      </div>
      {SECTIONS.map((sdef, si) => {
        const isOpen = open === sdef.id;
        const data = rows[sdef.id];
        const list = Array.isArray(data) ? data : [];
        return (
          <div key={sdef.id} style={{ borderTop: si ? "1px solid rgba(255,255,255,.07)" : "none", borderLeft: isOpen ? `2px solid ${C.accent}` : "2px solid transparent", background: isOpen ? "linear-gradient(90deg, rgba(249,115,22,.075), transparent 70%)" : "transparent", transition: "border-color .22s ease, background .22s ease" }}>
            <button onClick={() => toggle(sdef.id)} aria-expanded={isOpen} className="wf-bn-focus" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "13px 2px 13px 10px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ width: 29, height: 29, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 9, background: isOpen ? "rgba(249,115,22,.1)" : "rgba(255,255,255,.028)" }}><NavIcon name={sdef.icon} size={21} strokeWidth={1.7} color={isOpen ? C.accent : "#E7EDF5"} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15.2, fontWeight: 740, letterSpacing: "-.08px", color: isOpen ? "#FFF3E8" : C.text, lineHeight: 1.25 }}>{sdef.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#8D9AAB", marginTop: 2 }}>{sdef.sub}</span>
              </span>
              <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, color: isOpen ? C.accent : "rgba(255,255,255,.42)", display: "grid", placeItems: "center", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .22s ease" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: isOpen ? 10 * 64 + 220 : 0, opacity: isOpen ? 1 : 0, transition: "max-height .3s cubic-bezier(.4,0,.2,1), opacity .22s ease" }}>
              <div style={{ padding: "0 2px 12px 12px" }}>
                {data === "loading" ? (
                  <>
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                    <div className="wf-sk" style={{ height: 46, borderRadius: 9, margin: "8px 0" }} />
                  </>
                ) : sdef.id === "trends" && data && data.kindOf === "trends" ? (
                  trendsBody(data)
                ) : list.length ? (
                  <>
                    {sdef.id === "eat"
                      ? list.map((p, i) => (
                          <Row key={p.place_id} i={i} thumb={tbPhotoUrl(p.photo_ref, 240)} title={p.name}
                            onClick={() => openPlace({ id: p.place_id, name: p.name, lat: p.lat, lng: p.lng, rating: p.rating, reviews: p.reviews, photo: tbPhotoUrl(p.photo_ref, 640) })}
                            meta={<>
                              {isFinite(p.distance_mi) ? <span>{p.distance_mi < 10 ? p.distance_mi.toFixed(1) : Math.round(p.distance_mi)} mi</span> : null}
                              <PlaceScoreChip p={{ rating: p.rating, reviews: p.reviews }} size={12} />
                            </>}
                            trailing={<span aria-hidden="true" style={{ flexShrink: 0, color: "rgba(255,255,255,.3)" }}>›</span>} />
                        ))
                      : list.map((r, i) => r.kind === "experience" ? (
                          <Row key={r.id} i={i} href={r.booking_url} thumb={r.image_url || null} title={r.title}
                            badge={r.selling_out ? <SellingFast /> : null}
                            meta={<>
                              <PlaceScoreChip p={{ rating: r.rating, reviews: r.reviews }} size={12} />
                              {r.price_from != null ? <span style={{ color: C.green, fontWeight: 700 }}>from ${r.price_from}</span> : null}
                              {fmtDur(r.duration_min) ? <span>{fmtDur(r.duration_min)}</span> : null}
                            </>}
                            trailing={<span style={{ flexShrink: 0, background: C.accent, color: "#0D1117", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 800 }}>Book ↗</span>} />
                        ) : (
                          <Row key={r.id} i={i} thumb={tbPhotoUrl(r.photo_ref, 240)} title={r.title}
                            onClick={() => openPlace({ id: r.id, name: r.title, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640) })}
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
