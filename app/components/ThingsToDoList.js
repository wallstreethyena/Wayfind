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
import { C, CHAMPAGNE, MEDALLION_SHADOW, TYPE, RADII, SHADOW, FOCUS, WayfindScoreBadge, TRENDING_POPULARITY_THRESHOLD } from "./kit";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";
// v6.72: one source for the hour, the bucket and the outdoor gate.
import { nowContext } from "../../lib/nowContext.js";
import { rankForNow } from "../../lib/ranking.js";
import { rankReason } from "../../lib/rankReason.js";
import { viatorDirectUrl } from "../../lib/affiliates.js";
import { supabase } from "../../lib/supabase.js";

// The standard-card medal ring (home.js medal(): gold / silver / bronze 3-5).
const medalColor = (rank) => (rank === 1 ? "#FBBF24" : rank === 2 ? "#CBD5E1" : rank <= 5 ? "#CD7F32" : null);

const CAT_LABEL = { beach: "Beach day", attractions: "Things to do", food: "Food" };
// v6.47 (owner: "the little experience chip are also not workign i used to be
// able to click on them and open a page"). The chips rendered as inert <span>s
// with a "›" glyph — they LOOKED like links and did nothing. They are now real
// links into the same collections the PlaceCard chips open, via ?exp=, which
// app/home.js:2876 already resolves for every key below. Two hard constraints:
//   • a TOUR card IS an <a> (booking link), so a link-chip inside it would be a
//     nested anchor — invalid HTML. Tour chips stay plain <span>s.
//   • a PLACE card is a <div role="button">, so an <a> inside it is legal, but
//     it must stopPropagation or the card's own onClick fires the detail sheet
//     underneath the navigation.
const CAT_EXP = { beach: "outdoors", attractions: "entertainment", food: "eatnow" };
const CHIP_BASE = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", textDecoration: "none" };
const chipDead = { ...CHIP_BASE, color: C.light, background: C.adim, border: `1px solid ${C.border}55` };
const chipLink = { ...CHIP_BASE, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, cursor: "pointer" };

// One chip. `expKey` present + not inside a tour anchor => a real link.
function Chip({ expKey, label, linkable, onLog }) {
  if (!linkable || !expKey) return <span style={chipDead}>{label}</span>;
  return <a href={"/?exp=" + expKey} style={chipLink} onClick={(e) => { e.stopPropagation(); try { onLog && onLog("ttd_chip", { exp: expKey }); } catch (err) {} }}>{label} ›</a>;
}
const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

// Standard-card trust dot (home.js confidenceOf thresholds, verbatim).
const confColor = (n) => (n >= 500 ? "#22C55E" : n >= 100 ? "#FBBF24" : "#94A3B8");

// The Save/Share/Like/Dislike pill. One shape for all four so the row reads as
// a set — the taste controls are not a different kind of thing from Save.
function ActionPill({ label, ariaLabel, active, onClick, children }) {
  return (
    <button type="button" aria-label={ariaLabel || label} aria-pressed={active ? "true" : "false"} onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${active ? C.light : C.border}`, borderRadius: 999, padding: "7px 14px", background: active ? C.adim : "transparent", color: active ? C.light : C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer", minHeight: 36 }}>
      {children}{label ? <span>{label}</span> : null}
    </button>
  );
}
// Same thumbs as the detail sheet — an SVG rather than an emoji so the icon does
// not change shape between platforms next to a text label.
const ThumbUp = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg>);
const ThumbDown = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 14V3" /><path d="M17 14l-4 7c-1.5 0-2.5-1-2.5-2.5V14H5.9a2 2 0 0 1-2-2.4l1.2-6A2 2 0 0 1 7 4h10" /></svg>);

// ONE row -> place mapping. Every consumer that hands a row to app/home.js (the
// detail sheet, Save, Like, Dislike) goes through here, because those consumers
// store what they are given: toggleLike keeps `{ place: p }` in wf_liked_items
// and that object is what the Saved screen's Liked folder later renders. When
// this mapping was inline per call site, Save stored a row with no photo and no
// category and the folder rendered a placeholder.
// v6.57: `category` is load-bearing — isBeach(detail) identifies a beach row
// from it alone, since wf_things_to_do rows carry no coordinates or types.
export function ttdPlace(r) {
  return { id: r.id, name: r.title, rating: r.rating, reviews: r.reviews, photo: tbPhotoUrl(r.photo_ref, 640), category: r.category };
}

function Card({ r, first, rank, blurb, beachSignal, onOpenPlace, onLog, onSave, onShare, liked, disliked, onLike, onDislike }) {
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
    onOpenPlace && onOpenPlace(ttdPlace(r));
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
        {/* v6.72 (owner): the pick badge is a MEDALLION, not a pill. The
            rectangular chip was wider than the 96px thumbnail it sat on, so it
            wrapped to two lines and bled over the photo. A 34px champagne seal
            fits the corner at any thumbnail size and reads as an award rather
            than a label. The words stay in aria-label/title so the meaning is
            still announced and still hoverable. */}
        {first && !isTour ? (
          <span role="img" aria-label="Wayfind Pick" title="Wayfind Pick — our top-ranked spot right now" style={{ position: "absolute", top: 6, left: 6, width: 34, height: 34, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, background: "radial-gradient(circle at 50% 26%, rgba(232,201,122,.3), rgba(8,11,17,.86) 74%)", border: `1.5px solid ${CHAMPAGNE.base}`, boxShadow: MEDALLION_SHADOW, color: CHAMPAGNE.base, backdropFilter: "blur(4px)" }}>
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>✦</span>
            <span aria-hidden="true" style={{ fontSize: 6.5, fontWeight: 900, letterSpacing: ".09em", lineHeight: 1 }}>PICK</span>
          </span>
        ) : null}
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
          {isTour
            ? <span style={chipDead}>Tour ›</span>
            : <Chip linkable expKey={CAT_EXP[r.category] || "entertainment"} label={CAT_LABEL[r.category] || "Things to do"} onLog={onLog} />}
          {r.reviews >= 1000 && r.rating >= 4.5
            ? <Chip linkable={!isTour} expKey="localfav" label="⭐ Crowd favorite" onLog={onLog} />
            : null}
          {/* v6.71 (Wave 2): same flame + water-quality read as every other
              beach surface (PlaceCard, Detail sheet, Best Beaches, Best
              Nearby) — batched once for the whole list in ThingsToDoList
              below, not per card. */}
          {r.category === "beach" && beachSignal && beachSignal.popularityPct != null && beachSignal.popularityPct >= TRENDING_POPULARITY_THRESHOLD ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800, color: "#FB923C", background: "rgba(251,146,60,.12)", border: "1px solid rgba(251,146,60,.4)", borderRadius: 999, padding: "3px 10px" }}>🔥 Popular</span>
          ) : null}
          {r.category === "beach" && beachSignal && beachSignal.water ? (() => {
            const w = beachSignal.water;
            const wq = w.advisory ? { t: "Advisory", c: C.red } : w.result === "Good" ? { t: "Water: Good", c: C.green } : w.result === "Moderate" ? { t: "Water: Moderate", c: "#E8B84B" } : w.result ? { t: "Water: Poor", c: C.red } : null;
            return wq ? <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11.5, fontWeight: 700, color: wq.c }}>🏖️ {wq.t}</span> : null;
          })() : null}
        </div>
        {/* THE EDITORIAL (owner, 2026-07-22): why this spot is great — the
            verified wf_editorial hook (gold, like the beaches page). The AI
            blurb renders only when no verified hook exists. */}
        {r.editorial_hook ? <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E8C97A", lineHeight: 1.45, marginTop: 7 }}>{r.editorial_hook}</div> : (rankReason(r, rank) || blurb) ? <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45, marginTop: 7 }}>{rankReason(r, rank) || blurb}</div> : null}
        <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
          {isTour ? <span style={{ display: "inline-flex", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 800 }}>Book ↗</span> : null}
          {!isTour && onSave ? <button onClick={(e) => { e.stopPropagation(); onSave(ttdPlace(r)); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 14px", background: "transparent", color: C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>♡ Save</button> : null}
          {/* Like / dislike were missing here while every other place surface
              (PlaceCard, the detail sheet, Saved, Itinerary) carried them — so
              the rail the homepage leans on was the one place a user could not
              teach Wayfind anything, and the taste model never heard from it.
              Gated on !isTour for the same reason Save is: a tour row's id is a
              Viator PRODUCT id, not a Google place id, so a like on one would
              write a row the taste model and the Liked folder cannot resolve.
              The tour row is also an <a>, and a <button> inside it would be the
              nested-interactive problem the category chips already dodge. */}
          {!isTour && onLike ? (
            <ActionPill ariaLabel={liked ? "Remove like" : "Like this place"} active={!!liked} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onLike(e, ttdPlace(r)); }}><ThumbUp /></ActionPill>
          ) : null}
          {!isTour && onDislike ? (
            <ActionPill ariaLabel={disliked ? "Remove dislike" : "Show me fewer like this"} active={!!disliked} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDislike(e, ttdPlace(r)); }}><ThumbDown /></ActionPill>
          ) : null}
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

export default function ThingsToDoList({ center, weather, onOpenPlace, onLog, blurbs, loadBlurbs, onSave, onShare, liked, disliked, onLike, onDislike }) {
  const [list, setList] = useState(null); // null = loading
  // v6.71 (Wave 2): batched water-quality + popularity for whichever beach
  // rows land in this ranked list — same wf_beach_water / wf_place_popularity_scored
  // reads as home.js's `beachSignals` effect, one query pair per list load
  // rather than per card.
  const [beachSignals, setBeachSignals] = useState({});
  useEffect(() => {
    if (!Array.isArray(list) || !list.length || !supabase) return;
    const ids = list.filter((r) => r.kind !== "experience" && r.category === "beach").map((r) => r.id);
    if (!ids.length) return;
    let dead = false;
    (async () => {
      try {
        const [{ data: water }, { data: pop }] = await Promise.all([
          supabase.from("wf_beach_water").select("beach_place_id,result,advisory,sampled_at").in("beach_place_id", ids),
          supabase.from("wf_place_popularity_scored").select("place_id,tier2_popularity").in("place_id", ids),
        ]);
        if (dead) return;
        const next = {};
        (water || []).forEach((r) => { next[r.beach_place_id] = { ...(next[r.beach_place_id] || {}), water: r }; });
        (pop || []).forEach((r) => { next[r.place_id] = { ...(next[r.place_id] || {}), popularityPct: r.tier2_popularity }; });
        setBeachSignals(next);
      } catch (e) {}
    })();
    return () => { dead = true; };
  }, [list]);
  useEffect(() => {
    if (!center) return;
    let dead = false;
    setList(null);
    (async () => {
      const now = nowContext({ lat: center.lat, lng: center.lng, weather });
      const fetched = await fetchThingsToDo({
        lat: center.lat, lng: center.lng,
        localHour: now.hour,
        tempF: weather && weather.temp != null ? weather.temp : null,
        condition: weather && weather.label ? weather.label : null,
        limit: 20,
      });
      // Gate + per-bucket reweight on top of the RPC's ordering. The RPC knows
      // the hour as a number; it does not know that a morning list should lean
      // quiet and close and an evening list should lean open-late, and it
      // cannot suppress an outdoor category outright.
      const rows = rankForNow(fetched, now, (p) => (p && p.score != null ? p.score : 50)).slice(0, 20);
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
      <style dangerouslySetInnerHTML={{ __html: `.wf-ttd-focus:focus-visible{outline:${FOCUS.outline};outline-offset:${FOCUS.outlineOffset}}` }} />
      <div style={{ fontSize: 12.5, color: C.muted, margin: "0 0 10px" }}>The best of right now — tours, beaches and attractions, ranked together for this hour and weather.</div>
      {list === null ? (
        <>
          <div className="wf-sk" style={{ height: 112, borderRadius: 14, marginBottom: 12 }} />
          <div className="wf-sk" style={{ height: 112, borderRadius: 14, marginBottom: 12 }} />
          <div className="wf-sk" style={{ height: 112, borderRadius: 14, marginBottom: 12 }} />
        </>
      ) : shown.length ? (
        <>
          {shown.map((r, i) => <Card key={r.id} r={r} first={i === 0} rank={i + 1} blurb={blurbs && r.kind !== "experience" ? blurbs[r.id] : null} beachSignal={beachSignals[r.id]} onOpenPlace={onOpenPlace} onLog={onLog} onSave={onSave} onShare={onShare} liked={!!(liked && liked[r.id])} disliked={!!(disliked && disliked[r.id])} onLike={onLike} onDislike={onDislike} />)}
          {hasTours ? <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>Some links are affiliate links; it never changes our rankings.</div> : null}
        </>
      ) : (
        <div style={{ padding: "14px 2px", fontSize: 13, color: C.muted }}>Nothing strong in this view right now.</div>
      )}
    </div>
  );
}
