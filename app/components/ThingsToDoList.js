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
import { C, FOCUS, WayfindScoreBadge } from "./kit";
import IconicPlaceCard from "./IconicPlaceCard";
import { topPickAward } from "../../lib/topPickAward";
import { fallCardClass } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { toDisplayScore } from "../../lib/score";
// v7.06 — the ONE editorial-line compressor, shared by every place surface.
import { toHookLine } from "../../lib/editorialHook";
import { wayfindScore } from "../../lib/google";
import { fetchThingsToDo, tbPhotoUrl } from "../../lib/todaysBest.js";
// v6.80: 823ebf7 added the viatorDirectUrl() call below (closing the `|| raw`
// unattributed fallback) but not this import. A bare reference is valid
// JavaScript until it RUNS — this would have been a ReferenceError on every
// Things-to-do render, the same failure #486 shipped to production as a 404.
// Caught by check-lib-call-imports, which is exactly why that guard exists.
// v6.72: one source for the hour, the bucket and the outdoor gate.
import { nowContext } from "../../lib/nowContext.js";
import { rankForNow } from "../../lib/ranking.js";
import { supabase } from "../../lib/supabase.js";
import { waterForBeaches, sampledShort } from "../../lib/waterStations.js";
import { WATER_PLAIN, waterQualityKey } from "../../lib/beachChip.js";
import ViatorCommerceLink from "./ViatorCommerceLink";

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

// v7.15 (owner, 2026-08-11): the chip-bubble machinery (Chip, CAT_EXP,
// chip styles) is deleted — no card renders decorative tag bubbles anymore.
const fmtDur = (m) => (m == null ? null : m >= 60 ? (m % 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m / 60 + "h") : m + "m");

// ONE row -> place mapping. Every consumer that hands a row to app/home.js (the
// detail sheet, Save, Like, Dislike) goes through here, because those consumers
// store what they are given: toggleLike keeps `{ place: p }` in wf_liked_items
// and that object is what the Saved screen's Liked folder later renders. When
// this mapping was inline per call site, Save stored a row with no photo and no
// category and the folder rendered a placeholder.
// v6.57: `category` is load-bearing — isBeach(detail) identifies a beach row
// from it alone, since wf_things_to_do rows carry no coordinates or types.
export function ttdPlace(r) {
  return {
    id: r.id,
    name: r.title,
    rating: r.rating,
    reviews: r.reviews,
    photo: tbPhotoUrl(r.photo_ref, 640),
    category: r.category,
    distMi: r.distance_mi,
    governed_score: r.governed_score,
    trending: r.trending,
    trend_reason: r.trend_reason,
    types: r.category === "beach" ? ["beach", "natural_feature"] : (Array.isArray(r.types) ? r.types : []),
  };
}

function Card({ r, first, rank, city, blurb, beachSignal, onOpenPlace, onLog, onSave, onShare, liked, disliked, onLike, onDislike }) {
  const isTour = r.kind === "experience";
  const place = ttdPlace(r);
  const open = () => {
    if (isTour) return;
    try { onLog && onLog("ttd_detail", { id: r.id, name: r.title }); } catch (e) {}
    onOpenPlace && onOpenPlace(place);
  };
  const ds = Number.isFinite(r.governed_score)
    ? toDisplayScore(r.governed_score)
    : Number(r.rating) > 0 ? toDisplayScore(wayfindScore(Number(r.rating), Number(r.reviews) || 0)) : null;
  const waterBadge = r.category === "beach" && beachSignal && beachSignal.water ? (() => {
    const w = beachSignal.water;
    const key = waterQualityKey(w);
    if (!key) return null;
    const when = sampledShort(w.sampled_at);
    return <span title={when ? `FL Healthy Beaches sample, ${when}` : undefined}>🌊 {WATER_PLAIN[key]}{when ? ` · ${when}` : ""}</span>;
  })() : null;
  const trendBadge = r.trending && r.trend_reason ? <span title={"Trending — " + r.trend_reason}>🔥 {r.trend_reason}</span> : null;
  // Place rows ARE the house card. Tour rows cannot mount IconicPlaceCard —
  // a Viator product id is not a Google place id — so they wear the same
  // .wf-place-card chrome, no yellow rank-next-to-title, no BEST … PICK.
  if (!isTour) {
    return (
      <IconicPlaceCard
        place={place}
        rank={rank}
        editorial={r.editorial_hook}
        aiSummary={blurb && typeof blurb === "object" ? blurb : null}
        rankingNote={r.drive_deduction ? "ranked lower for the drive (−" + r.drive_deduction.toFixed(1) + ")" : null}
        badge={<>{trendBadge}{waterBadge}</>}
        saved={false}
        liked={!!liked}
        disliked={!!disliked}
        onOpen={open}
        onSave={onSave ? (e, p) => onSave(p) : undefined}
        onLike={onLike}
        onDislike={onDislike}
        onShare={onShare ? () => onShare(r) : undefined}
        surface="ttd"
      />
    );
  }
  const award = topPickAward({ category: "Activities", rank });
  const facts = [
    r.reviews > 0 ? Number(r.reviews).toLocaleString() + " reviews" : null,
    r.price_from != null ? "from $" + r.price_from : null,
    fmtDur(r.duration_min),
  ].filter(Boolean);
  const take = toHookLine(r.editorial_hook, r.title);
  const body = (
    <article className={"wf-place-card wf-ttd-focus" + fallCardClass(r.place_id || r.id, siteTodayStr())} style={{ marginBottom: 12 }}>
      {/* v8.62: score in the top right corner of the CARD, never on the photo
          (owner, 2026-08-26). Direct child of .wf-place-card — css.js rule. */}
      {ds != null ? <div className="wf-place-card-score"><WayfindScoreBadge score={ds} /></div> : null}
      <div className="wf-place-card-layout">
        <div className="wf-place-card-media">
          {r.image_url
            ? <img src={r.image_url} alt="" loading="lazy" style={{ objectFit: "cover" }} />
            : <div className="wf-place-card-monogram" aria-hidden="true">WF</div>}
          {rank ? <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span> : null}
        </div>
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row">
            <div className="wf-place-card-heading">
              <span className="wf-place-card-category">Activities</span>
              <div className="wf-place-card-name" style={{ color: "#F8F5EE" }}>{r.title}</div>
            </div>
          </div>
          {facts.length ? (
            <div className="wf-place-card-meta">{facts.map((f) => <span key={f}>{f}</span>)}</div>
          ) : null}
          {award ? (
            <div className={`wf-place-card-award is-rank-${award.rank}`}>
              <span className="wf-place-card-award-icon" aria-hidden="true">{award.icon}</span>
              <span>{award.label}</span>
            </div>
          ) : null}
          {r.selling_out ? <div className="wf-place-card-highlights"><span>Selling fast</span></div> : null}
          {take ? <div className="wf-place-card-take">{take}</div> : null}
          <div className="wf-place-card-actions wf-sheet-card-actions">
            <span className="wf-place-card-book" style={{ color: "#FF9B50" }}>Book ↗</span>
            {onShare ? <span role="button" tabIndex={0} className="wf-place-card-share" style={{ color: "#DFE5EE" }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); onShare(r); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onShare(r); } }}>↗ Share</span> : null}
          </div>
        </div>
      </div>
    </article>
  );
  // ViatorCommerceLink is the outer anchor. Set its inherited colour in
  // writing so a browser's default blue can never paint card copy when a CSS
  // chunk is late, missing, or reordered.
  const style = { display: "block", width: "100%", textAlign: "left", textDecoration: "none", color: "#F8F5EE", padding: 0, border: 0, background: "transparent" };
  return (
    <ViatorCommerceLink t={r} city={city} surface="ttd_ranked_card" contentId={city} rank={rank} className="wf-ttd-focus" style={style} onClick={(e, clickId) => { try { onLog && onLog("ttd_book", { id: r.id, name: r.title }, { click_id: clickId }); } catch (er) {} }}>
      {body}
    </ViatorCommerceLink>
  );
}

export default function ThingsToDoList({ center, city, weather, onOpenPlace, onLog, blurbs, loadBlurbs, onSave, onShare, liked, disliked, onLike, onDislike }) {
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
        // v8.19 — GEO-based water resolution (owner, fifth report; see
        // lib/waterStations.js). wf_things_to_do rows carry no coordinates,
        // so the beach ids' coords come from wf_inventory in the same batch;
        // each row then takes its exact station row or the nearest sampled
        // station within 1.5mi via wf_beach_water_geo.
        const [{ data: coords }, { data: pop }] = await Promise.all([
          supabase.from("wf_inventory").select("place_id,lat,lng").in("place_id", ids),
          supabase.from("wf_place_popularity_scored").select("place_id,tier2_popularity").in("place_id", ids),
        ]);
        if (dead) return;
        const rows = (coords || []).map((c) => ({ id: c.place_id, lat: c.lat, lng: c.lng }));
        const lats = rows.map((r) => Number(r.lat)).filter(Number.isFinite);
        const lngs = rows.map((r) => Number(r.lng)).filter(Number.isFinite);
        const pad = 0.05;
        const { data: water } = lats.length
          ? await supabase.from("wf_beach_water_geo").select("beach_place_id,result,advisory,sampled_at,lat,lng")
              .gte("lat", Math.min(...lats) - pad).lte("lat", Math.max(...lats) + pad)
              .gte("lng", Math.min(...lngs) - pad).lte("lng", Math.max(...lngs) + pad)
          : await supabase.from("wf_beach_water").select("beach_place_id,result,advisory,sampled_at").in("beach_place_id", ids);
        if (dead) return;
        const next = {};
        const matched = waterForBeaches(rows.length ? rows : ids.map((id) => ({ id })), water || []);
        Object.keys(matched).forEach((id) => { next[id] = { ...(next[id] || {}), water: matched[id] }; });
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
          {shown.map((r, i) => <Card key={r.id} r={r} first={i === 0} rank={i + 1} city={city} blurb={blurbs && r.kind !== "experience" ? blurbs[r.id] : null} beachSignal={beachSignals[r.id]} onOpenPlace={onOpenPlace} onLog={onLog} onSave={onSave} onShare={onShare} liked={!!(liked && liked[r.id])} disliked={!!(disliked && disliked[r.id])} onLike={onLike} onDislike={onDislike} />)}
          {hasTours ? <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>Some links are affiliate links; it never changes our rankings.</div> : null}
        </>
      ) : (
        <div style={{ padding: "14px 2px", fontSize: 13, color: C.muted }}>Nothing strong in this view right now.</div>
      )}
    </div>
  );
}
