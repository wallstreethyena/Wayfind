"use client";
// ThingsToDoList — the restructured "Things to do" browse page (owner spec
// via Cowork, 2026-07-21): the three stacked Viator sections and their four
// competing filters are replaced by ONE ranked list from wf_things_to_do —
// tours, attractions and beaches interleaved, monetized tours earn their
// rank instead of owning shelves. The CategoryMenu sub-tabs above are the
// ONE filter row: this list IS the "All" view; picking a sub-tab returns
// the classic filtered place feed (those facets are real Places queries).
// Unified card: photo-top + dark panel. Places: proxied photo, green Score,
// distance, category label, "✦ Wayfind Pick" on rank 1, tap opens OUR
// detail sheet (owner call — never a Google tab). Tours: direct image, Score,
// from-$, duration, "Selling fast" ONLY on the engine's flag, tap books.
// scripts/test-todays-best.mjs locks the contract.
import { useEffect, useState } from "react";
import { C, CHAMPAGNE, TYPE, RADII, SHADOW, FOCUS, PlaceScoreChip } from "./kit";
import { fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";

const CAT_LABEL = { beach: "Beach day", attractions: "Things to do", food: "Food" };
const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

function Card({ r, first, onOpenPlace, onLog }) {
  const isTour = r.kind === "experience";
  const img = isTour ? (r.image_url || null) : tbPhotoUrl(r.photo_ref, 640);
  const open = () => {
    if (isTour) return; // anchor handles it
    try { onLog && onLog("ttd_detail", { id: r.id, name: r.title }); } catch (e) {}
    onOpenPlace && onOpenPlace({ id: r.id, name: r.title, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640) });
  };
  const body = (
    <>
      <div style={{ position: "relative", aspectRatio: "16 / 9", background: C.card }}>
        {img && <img src={img} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        {first && !isTour ? <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,.55)", border: `1px solid ${CHAMPAGNE.base}`, color: CHAMPAGNE.base, fontSize: 10, fontWeight: 800, letterSpacing: ".4px", borderRadius: 999, padding: "3px 9px", backdropFilter: "blur(4px)" }}>✦ Wayfind Pick</span> : null}
        {isTour && r.selling_out ? <span style={{ position: "absolute", top: 8, left: 8, background: "#B33A2B", color: "#fff", fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "3px 9px" }}>Selling fast</span> : null}
      </div>
      <div style={{ padding: "10px 12px 12px", background: "#0B0E15" }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 12.5, color: C.muted, flexWrap: "wrap" }}>
          <PlaceScoreChip p={{ rating: r.rating, reviews: r.reviews }} size={12} />
          {isTour ? (
            <>
              {r.price_from != null ? <span style={{ color: C.green, fontWeight: 700 }}>from ${r.price_from}</span> : null}
              {fmtDur(r.duration_min) ? <span>{fmtDur(r.duration_min)}</span> : null}
            </>
          ) : (
            <>
              {isFinite(r.distance_mi) ? <span>{r.distance_mi < 10 ? r.distance_mi.toFixed(1) : Math.round(r.distance_mi)} mi</span> : null}
              {CAT_LABEL[r.category] ? <span>{CAT_LABEL[r.category]}</span> : null}
            </>
          )}
        </div>
        {isTour ? <div style={{ marginTop: 9, display: "inline-block", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "6px 13px", fontSize: 11.5, fontWeight: 800 }}>Book ↗</div> : null}
      </div>
    </>
  );
  const style = { display: "block", width: "100%", textAlign: "left", borderRadius: RADII.card, overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: SHADOW.card, marginBottom: 12, cursor: "pointer", textDecoration: "none", background: "transparent", padding: 0 };
  return isTour
    ? <a href={r.booking_url} target="_blank" rel="noreferrer" className="wf-ttd-focus" style={style} onClick={() => { try { onLog && onLog("ttd_book", { id: r.id, name: r.title }); } catch (e) {} }}>{body}</a>
    : <button onClick={open} className="wf-ttd-focus" style={style}>{body}</button>;
}

export default function ThingsToDoList({ center, weather, onOpenPlace, onLog }) {
  const [list, setList] = useState(null); // null = loading
  useEffect(() => {
    if (!center) return;
    let dead = false;
    setList(null);
    (async () => {
      const d = new Date();
      const rows = await fetchThingsToDo({
        lat: center.lat, lng: center.lng,
        localHour: d.getHours() + d.getMinutes() / 60,
        tempF: weather && weather.temp != null ? weather.temp : null,
        condition: weather && weather.label ? weather.label : null,
        limit: 20,
      });
      if (!dead) setList(rows);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center && center.lat, center && center.lng]);

  const shown = list || [];
  const hasTours = shown.some((r) => r.kind === "experience");

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{`.wf-ttd-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}`}</style>
      <div style={{ fontSize: 12.5, color: C.muted, margin: "0 0 10px" }}>The best of right now — tours, beaches and attractions, ranked together for this hour and weather.</div>
      {list === null ? (
        <>
          <div className="wf-sk" style={{ height: 210, borderRadius: 14, marginBottom: 12 }} />
          <div className="wf-sk" style={{ height: 210, borderRadius: 14, marginBottom: 12 }} />
        </>
      ) : shown.length ? (
        <>
          {shown.map((r, i) => <Card key={r.id} r={r} first={i === 0} onOpenPlace={onOpenPlace} onLog={onLog} />)}
          {hasTours ? <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>Some links are affiliate links; it never changes our rankings.</div> : null}
        </>
      ) : (
        <div style={{ padding: "14px 2px", fontSize: 13, color: C.muted }}>Nothing strong in this view right now.</div>
      )}
    </div>
  );
}
