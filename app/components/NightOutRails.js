"use client";

// One Night Out answer: ten evidence-gated rails over venue inventory and the
// dated event cards owned by home.js. Events lead each shelf because a dated
// happening is not interchangeable with the building where one might occur.
//
// WO11 (2026-09-02, owner): "load the top ten based on the Wayfind score, and
// as they scroll left, as they pass the seventh card, start loading 10 more
// cards, and 10 more, instead of loading everything at once." Each rail below
// now pages independently via usePagedRail, SEEDED from the one bulk
// /api/night-out fetch this component already made (no extra network round
// trip for page 0 — "rank once, page many"). Scrolling past a rail's 8th
// card fetches page 1 of THAT rail from the same paging contract every other
// poster/rail endpoint speaks (lib/railPage.js). This replaces the old
// "Load every ranked option" button, which fetched all ~130 rows for every
// rail in one blob the instant a reader tapped it.
import { useEffect, useMemo, useRef, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { toHookLine } from "../../lib/editorialHook";
import { composeNightOutRails } from "../../lib/nightOutIntent.js";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { RAIL_PAGE_SIZE } from "../../lib/railPage.js";
import { usePagedRail } from "./usePagedRail.js";

const C = { text: "#F1F5F9", muted: "#8B93A1" };
const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);
const prettyType = (value) => {
  const text = String(value || "").replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

function NightOutRailSection({
  rail, lat, lng, eventCards, eventsPending, onOpenPlace, city,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  const seedItems = useMemo(() => (rail.places || []).slice(0, RAIL_PAGE_SIZE), [rail]);
  const seedTotal = Number.isFinite(rail.total) ? rail.total : (rail.places || []).length;
  const params = useMemo(() => ({ lat: lat.toFixed(2), lng: lng.toFixed(2), rail: rail.id }), [lat, lng, rail.id]);
  const { items, total, sentinelIndex, sentinelRef, loadingMore } = usePagedRail(
    "/api/night-out", params, { seedItems, seedTotal, itemsKey: "places" },
  );
  const count = eventCards.length + (Number.isFinite(total) ? total : items.length);
  const railId = "night-out-" + rail.id;
  if (!count) return (
    <section aria-label={rail.title} style={{ marginTop: 22 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 850, color: C.text }}>{rail.title}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#AEB8C6" }}>{rail.deck}</p>
      {eventsPending
        ? <div className="wf-sk" role="status" aria-busy="true" aria-label={`Finding ${rail.title}`} style={{ height: 88, borderRadius: 14, background: "#0B0E15" }} />
        : <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>No verified event or venue within 27 miles clears this intent yet. Wayfind will not fill it with a look-alike.</p>}
    </section>
  );
  return (
    <section aria-label={rail.title} style={{ marginTop: 22 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 850, color: C.text }}>{rail.title}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#AEB8C6" }}>{rail.deck}</p>
      {/* Page 0's `total` (from the seed) is the count RailNav shows, never
          the merely-loaded length — the reader sees "130 ranked options" on
          first paint, not "10". */}
      <RailNav railId={railId} count={count} total={count} unit={count === 1 ? "verified option" : "verified options"} />
      <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
        {eventCards}
        {items.map((place, index) => {
          const rank = eventCards.length + index + 1;
          const type = prettyType(place.primaryType || place.primary_type || place.category);
          const facts = [
            place.reviews ? compact(place.reviews) + " reviews" : null,
            priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null,
            Number.isFinite(place.distMi) ? place.distMi + " mi" : null,
          ].filter(Boolean);
          const href = directionsUrl(place);
          return <RailCard key={place.id} className="wf-exploding-primary"
            domRef={index === sentinelIndex ? sentinelRef : undefined}
            photo={cardImageSrc(place, 640) || null} place={place}
            title={place.name} eyebrow={type} rank={rank}
            score={toDisplayScore(wayfindScore(place.rating, place.reviews))}
            facts={facts} take={toHookLine(place.editorial, place.name) || null}
            cta={href ? { label: "Directions ↗", href, external: true } : null}
            ariaLabel={`Open ${place.name}`}
            onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
            saved={isSaved ? !!isSaved(place.id) : undefined}
            liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
            disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
            onSave={onSave ? (event) => onSave(event, place) : undefined}
            onLike={onLike ? (event) => onLike(event, place) : undefined}
            onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
            onShare={onShare ? () => onShare(place, { city }) : undefined} />;
        })}
        {/* Never a whole-rail skeleton for page ≥1 — a small end-of-rail
            spinner card in place instead, so the reader keeps scrolling
            through what has already loaded while the next ten arrive. */}
        {loadingMore ? <div className="wf-rail-card wf-exploding-primary" aria-busy="true" aria-label={`Loading more ${rail.title}`}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 88, color: C.muted, fontSize: 12.5 }}>Loading more…</div> : null}
      </div>
      {eventCards.length + items.length > 1 ? <RailDots railId={railId} count={eventCards.length + items.length} /> : null}
    </section>
  );
}

export default function NightOutRails({
  active = true, places = [], center = null, city = "", eventsSlot = null,
  onOpenPlace = null, isSaved, liked, disliked, isLiked, isDisliked,
  onSave, onLike, onDislike, onShare,
}) {
  const fallback = useMemo(() => composeNightOutRails([], places, center || {}), [places, center]);
  const [remote, setRemote] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const asked = useRef("");
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  // The bulk request still runs, unchanged: it hydrates the fail-soft
  // fallback path and gives every rail its page-0 SEED (see
  // NightOutRailSection above), which is what keeps first paint exactly as
  // fast as before — no rail waits on a second round trip to show its first
  // ten cards.
  const key = active && Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(2)}|${lng.toFixed(2)}|${retry}` : "";
  useEffect(() => {
    if (!key || asked.current === key) return;
    asked.current = key;
    let dead = false;
    setFailed(false);
    const query = new URLSearchParams({ lat: lat.toFixed(2), lng: lng.toFixed(2) });
    fetchJsonWithDeadline("/api/night-out?" + query.toString())
      .then((value) => { if (!dead && Array.isArray(value?.rails)) setRemote(value); })
      .catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, [key, lat, lng]);
  const payload = remote || fallback;
  const eventSurface = active && eventsSlot ? eventsSlot("night-out") : null;

  if (!active) return null;

  if (!remote && !failed && !payload.rails.some((rail) => rail.places.length)) {
    return <div role="status" aria-busy="true" aria-label="Building Night Out">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12, background: "#0B0E15" }} />)}</div>;
  }

  if (failed && !payload.rails.some((rail) => rail.places.length)) {
    return <div><p style={{ color: C.muted, fontSize: 13 }}>We could not reach Wayfind&apos;s Night Out inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #4B5563", borderRadius: 999, background: "#111827", color: C.text, padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;
  }

  return <>{payload.rails.map((rail) => {
    const eventCards = Array.isArray(eventSurface?.byRail?.[rail.id]) ? eventSurface.byRail[rail.id] : [];
    return <NightOutRailSection key={rail.id} rail={rail} lat={Number.isFinite(lat) ? lat : 0} lng={Number.isFinite(lng) ? lng : 0}
      eventCards={eventCards} eventsPending={!!eventSurface?.pending} onOpenPlace={onOpenPlace} city={city}
      isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
      onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />;
  })}</>;
}
