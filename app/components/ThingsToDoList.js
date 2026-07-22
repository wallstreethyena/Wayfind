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
import { C, CHAMPAGNE, TYPE, RADII, SHADOW, FOCUS, WayfindScoreBadge } from "./kit";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";
import { viatorDirectUrl } from "../../lib/affiliates.js";

// The standard-card medal ring (home.js medal(): gold / silver / bronze 3-5).
const medalColor = (rank) => (rank === 1 ? "#FBBF24" : rank === 2 ? "#CBD5E1" : rank <= 5 ? "#CD7F32" : null);

const CAT_LABEL = { beach: "Beach day", attractions: "Things to do", food: "Food" };
const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

// Standard-card trust dot (home.js confidenceOf thresholds, verbatim).
const confColor = (n) => (n >= 500 ? "#22C55E" : n >= 100 ? "#FBBF24" : "#94A3B8");

function Card({ r, first, rank, blurb, onOpenPlace, onLog, onSave, onShare }) {
  const isTour = r.kind === "experience";
  const img = isTour ? (r.image_url || null) : tbPhotoUrl(r.photo_ref, 640);
  const open = () => {
    if (isTour) return; // anchor handles it
    try { onLog && onLog("ttd_detail", { id: r.id, name: r.title }); } catch (e) {}
    // v6.57: pass `category` through so isBeach(detail) (home.js) can identify
    // a beach row without lat/lng/types — wf_things_to_do's rows carry no
    // coordinates, so the detail sheet's water-quality/popularity signals
    // (keyed by place_id alone) still resolve even though live wind/wave/red
    // tide (which need coordinates) won't for places opened from this list.
    onOpenPlace && onOpenPlace({ id: r.id, name: r.title, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640), category: r.category });
  };
  // v6.56 (owner): EXACTLY the standard Wayfind card shell — photo-left 96px,
  // rank ring (medal colors), title row carrying the WayfindScoreBadge in-flow,
  // meta line with the green review dot. Tours differ ONLY by their meta
  // (from-$ + duration) and the Book pill where places show the chevron.
  const ds = Number(r.rating) > 0 ? toDisplayScore(wayfindScore(Number(r.rating), Number(r.reviews) || 0)) : null;
  const mc = medalColor(rank);
  const body = (
    <div style={{ display: "flex" }}>
      <div style={{ position: "relative", width: 96, alignSelf: "stretch", minHeight: 96, flexShrink: 0, background: "#10141d" }}>
        {img && <img src={img} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        {first && !isTour ? <span style={{ position: "absolute", top: 7, left: 7, background: "rgba(0,0,0,.55)", border: `1px solid ${CHAMPAGNE.base}`, color: CHAMPAGNE.base, fontSize: 9, fontWeight: 800, letterSpacing: ".4px", borderRadius: 999, padding: "2px 7px", backdropFilter: "blur(4px)" }}>✦ Wayfind Pick</span> : null}
        {isTour && r.selling_out ? <span style={{ position: "absolute", top: 7, left: 7, background: "#B33A2B", color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", borderRadius: 999, padding: "2px 7px" }}>Selling fast</span> : null}
      </div>
      <div style={{ padding: "12px 12px", flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          {mc
            ? <div style={{ width: 24, height: 24, borderRadius: "50%", background: mc, color: "#0D1117", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{rank}</div>
            : <div style={{ width: 28, textAlign: "center", color: C.muted, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>#{rank}</div>}
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3, flex: 1, minWidth: 0, paddingRight: 4 }}>{r.title}</div>
          {ds != null && <div style={{ flexShrink: 0, marginLeft: "auto", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }}><WayfindScoreBadge score={ds} /></div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
          {r.reviews > 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: confColor(r.reviews), flexShrink: 0 }} /> {Number(r.reviews).toLocaleString()} reviews</span> : null}
          {isTour ? (
            <>
              {r.price_from != null ? <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>from ${r.price_from}</span> : null}
              {fmtDur(r.duration_min) ? <span>· {fmtDur(r.duration_min)}</span> : null}
            </>
          ) : (
            <>{isFinite(r.distance_mi) ? <span>· {r.distance_mi < 10 ? r.distance_mi.toFixed(1) : Math.round(r.distance_mi)} mi{r.drive_deduction ? " — ranked lower for the drive (−" + r.drive_deduction.toFixed(1) + ")" : ""}</span> : null}</>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}55`, borderRadius: 999, padding: "3px 10px" }}>{isTour ? "Tour ›" : (CAT_LABEL[r.category] || "Things to do") + " ›"}</span>
          {r.reviews >= 1000 && r.rating >= 4.5 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}55`, borderRadius: 999, padding: "3px 10px" }}>⭐ Crowd favorite ›</span> : null}
        </div>
        {/* THE EDITORIAL (owner, 2026-07-22): why this spot is great — the
            verified wf_editorial hook (gold, like the beaches page). The AI
            blurb renders only when no verified hook exists. */}
        {r.editorial_hook ? <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E8C97A", lineHeight: 1.45, marginTop: 7 }}>{r.editorial_hook}</div> : blurb ? <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45, marginTop: 7 }}>{blurb}</div> : null}
        <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
          {isTour ? <span style={{ display: "inline-flex", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 800 }}>Book ↗</span> : null}
          {!isTour && onSave ? <button onClick={(e) => { e.stopPropagation(); onSave(r); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 14px", background: "transparent", color: C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>♡ Save</button> : null}
          {onShare ? <span role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onShare(r); } }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onShare(r); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 14px", background: "transparent", color: C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>↗ Share</span> : null}
        </div>
      </div>
    </div>
  );
  const style = { display: "block", width: "100%", textAlign: "left", borderRadius: RADII.card, overflow: "hidden", border: `1px solid ${C.border}`, background: C.card, boxShadow: SHADOW.card, marginBottom: 12, cursor: "pointer", textDecoration: "none", padding: 0 };
  return isTour
    ? <a href={viatorDirectUrl(r.booking_url) || r.booking_url} target="_blank" rel="noreferrer sponsored" className="wf-ttd-focus" style={style} onClick={() => { try { onLog && onLog("ttd_book", { id: r.id, name: r.title }); } catch (e) {} }}>{body}</a>
    : <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }} onClick={open} className="wf-ttd-focus" style={style}>{body}</div>;
}

export default function ThingsToDoList({ center, weather, onOpenPlace, onLog, blurbs, loadBlurbs, onSave, onShare }) {
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
      // Standard-card blurbs for PLACE rows (the same shared AI pool the
      // other feeds use — cached 30d sitewide; tours have no blurb source).
      try { if (!dead && loadBlurbs) loadBlurbs((rows || []).filter((x) => x.kind !== "experience").slice(0, 8).map((x) => ({ id: x.id, name: x.title, rating: x.rating, reviews: x.reviews }))); } catch (e) {}
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
          <div className="wf-sk" style={{ height: 112, borderRadius: 14, marginBottom: 12 }} />
          <div className="wf-sk" style={{ height: 112, borderRadius: 14, marginBottom: 12 }} />
          <div className="wf-sk" style={{ height: 112, borderRadius: 14, marginBottom: 12 }} />
        </>
      ) : shown.length ? (
        <>
          {shown.map((r, i) => <Card key={r.id} r={r} first={i === 0} rank={i + 1} blurb={blurbs && r.kind !== "experience" ? blurbs[r.id] : null} onOpenPlace={onOpenPlace} onLog={onLog} onSave={onSave} onShare={onShare} />)}
          {hasTours ? <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>Some links are affiliate links; it never changes our rankings.</div> : null}
        </>
      ) : (
        <div style={{ padding: "14px 2px", fontSize: 13, color: C.muted }}>Nothing strong in this view right now.</div>
      )}
    </div>
  );
}
