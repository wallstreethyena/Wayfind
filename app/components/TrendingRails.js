"use client";
// TrendingRails — what the TRENDING NOW poster opens (owner, 2026-11-05).
//
// Five shelves, in his order: Food, Festivals, Parties, Shows and Events,
// Everything Else. A dated happening leads its shelf (it is this week and it
// will not wait), then the trending places that belong on the same shelf.
// Events come from home.js's already-loaded feed through eventsSlot
// ("trending" mode, lib/posterEvents.js); places come from the trending rail
// pool the homepage already fetched. Every option is shown — no card cap —
// and the shared paging keeps loading ranked places until the pool is done.
// A shelf with nothing verified on it is not rendered; nothing is padded.
import { useEffect, useMemo, useState } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import RailLoading from "./RailLoading";
import { selectPosterEvents } from "../../lib/posterEvents.js";
import { TRENDING_RAIL_DEFS, localTrendingIntelligence, splitTrendingPlaces } from "../../lib/trendingRails.js";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { NIGHT_OUT_MAX_MI } from "../../lib/nightOutIntent.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { toHookLine } from "../../lib/editorialHook";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { railScoreOf } from "../../lib/railRank.js";
import { useCuratedRows } from "../../lib/curatorPicks.js";

const C = { muted: "#8B93A1" };
const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);
const prettyType = (value) => {
  const text = String(value || "").replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

function TrendingShelf({ rail, eventCards, places, whyByPlaceId, city, onOpenPlace, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const count = eventCards.length + places.length;
  if (!count) return null;
  const railId = "trending-" + rail.id;
  return (
    <section aria-label={rail.title} style={{ marginTop: 22 }} data-trending-rail={rail.id}>
      <RailHeading title={rail.title} description={rail.deck}>
        <RailNav railId={railId} count={count} total={count} loaded={count} unit={count === 1 ? "trending pick" : "trending picks"} />
      </RailHeading>
      <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
        {eventCards}
        {places.map((place, index) => {
          const facts = [
            place.reviews ? compact(place.reviews) + " reviews" : null,
            priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null,
          ].filter(Boolean);
          return <RailCard key={place.id} className="wf-exploding-primary"
            photo={cardImageSrc(place, 640) || null} place={place}
            title={place.name} eyebrow={prettyType(place.primaryType || place.primary_type || place.category)}
            rank={eventCards.length + index + 1}
            score={toDisplayScore(railScoreOf(place))}
            facts={facts} take={toHookLine(whyByPlaceId.get(place.id), place.name) || toHookLine(place.editorial, place.name) || null}
            cta={null}
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
      </div>
      {count > 1 ? <RailDots railId={railId} count={count} /> : null}
    </section>
  );
}

export default function TrendingRails({
  active = true, places = [], placesPending = false, hasMore = false, loadingMore = false, onLoadMore = null,
  eventsSlot = null, center = null, city = "", onOpenPlace = null,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  // Owner picks re-score rows before they are split (lib/curatorPicks.js).
  const curated = useCuratedRows(places, { ranked: true });
  const byPlaceRail = useMemo(() => splitTrendingPlaces(curated), [curated]);
  const [intelligence, setIntelligence] = useState(null);
  const lat = center?.lat;
  const lng = center?.lng;
  const intelUrl = active && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? `/api/intelligence/florida?${new URLSearchParams({ lat, lng, mi: NIGHT_OUT_MAX_MI })}`
    : null;
  useEffect(() => {
    setIntelligence(null);
    if (!intelUrl) return undefined;
    let current = true;
    fetchJsonWithDeadline(intelUrl)
      .then((packet) => { if (current) setIntelligence({ url: intelUrl, packet }); })
      .catch(() => { if (current) setIntelligence({ url: intelUrl, packet: null }); });
    return () => { current = false; };
  }, [intelUrl]);

  const today = siteTodayStr();
  const currentIntelligence = intelUrl && intelligence?.url === intelUrl ? intelligence : null;
  const { leadEvent, whyByPlaceId, available } = useMemo(() => localTrendingIntelligence(
    currentIntelligence?.packet,
    { today, radiusMi: NIGHT_OUT_MAX_MI },
  ), [currentIntelligence, today]);
  const leadPlace = !leadEvent && curated.find((place) => whyByPlaceId.has(place?.id));
  const lead = leadEvent || (leadPlace && {
    name: leadPlace.name,
    why: whyByPlaceId.get(leadPlace.id),
  });
  // Every option, not a first batch: keep pulling ranked pages until the
  // shared pool reports it is finished.
  useEffect(() => {
    if (active && hasMore && !loadingMore && typeof onLoadMore === "function") onLoadMore();
  }, [active, hasMore, loadingMore, onLoadMore, places.length]);

  if (!active) return null;
  const eventSurface = eventsSlot ? eventsSlot("trending", selectPosterEvents) : null;
  const eventsByRail = eventSurface && eventSurface.byRail ? eventSurface.byRail : {};
  // The lead is only shown as something a visitor can open (owner, 2026-11-27:
  // "No placecard?"). An event lead is the real event card when the feed holds
  // it, else a link to its published page; with neither it is not shown.
  const leadCard = leadEvent && leadEvent.slug && eventSurface && typeof eventSurface.leadCard === "function"
    ? eventSurface.leadCard(leadEvent.slug) : null;
  const leadLink = leadEvent && !leadCard && leadEvent.href ? leadEvent.href : null;
  const showLead = leadEvent
    ? !eventSurface?.pending && !!(leadCard || leadLink)
    : !!(leadPlace && onOpenPlace);
  const withoutLead = (cards) => leadCard ? cards.filter((card) => card?.key !== leadCard.id) : cards;
  const total = TRENDING_RAIL_DEFS.reduce((n, rail) => n
    + (Array.isArray(eventsByRail[rail.id]) ? eventsByRail[rail.id].length : 0)
    + byPlaceRail[rail.id].length, 0);

  // Wayfind's own Reels are NOT a shelf of their own (owner, 2026-11-14: "not
  // as its own card"). Each one rides the business card it features, credited
  // @gowayfind.app (lib/creatorVideos.js, lib/eventSocial.js); the
  // reconciliation monitor checks every such post is on its card.
  const pending = placesPending || eventSurface?.pending || (intelUrl && !currentIntelligence);
  if (!showLead && !total && pending) return <RailLoading label="Finding what's trending" />;
  if (!showLead && !total) {
    const failed = eventSurface?.failed || (currentIntelligence && !available);
    return <p role="status" style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, padding: "7px 2px 13px" }}>{failed ? "Trending is temporarily unavailable. Check back soon." : "Nothing verified is trending near you yet. Check back soon."}</p>;
  }

  return <>
    {showLead && leadCard ? (
      <section aria-label="Coming up nearby" style={{ marginTop: 16 }} data-trending-lead="event">
        <RailHeading title="Coming up nearby" description={lead.why} />
        <div className="wf-rail wf-rail-exploding" data-rail="trending-lead" role="region" aria-label="Coming up nearby">
          {leadCard.node}
        </div>
      </section>
    ) : showLead && leadLink ? (
      <a href={leadLink} data-trending-lead="link" aria-label={`Open ${lead.name}, dates and tickets`}
        style={{ display: "block", margin: "16px 0 0", padding: "14px 16px", borderRadius: 14, background: "#151B26", border: "1px solid #2D3748", textDecoration: "none" }}>
        <span style={{ display: "block", margin: "0 0 4px", color: "#FDBA74", fontSize: 12, fontWeight: 700 }}>Coming up nearby</span>
        <strong style={{ display: "block", color: "#F8FAFC", fontWeight: 800, fontSize: 17 }}>{lead.name}</strong>
        <span style={{ display: "block", margin: "4px 0 8px", color: "#AAB4C5", fontSize: 14, lineHeight: 1.5 }}>{lead.why}</span>
        <span style={{ color: "#FB923C", fontSize: 14, fontWeight: 800 }}>See dates and tickets →</span>
      </a>
    ) : showLead && leadPlace ? (
      <button type="button" onClick={() => onOpenPlace(leadPlace)} data-trending-lead="place" aria-label={`Open ${lead.name}`}
        style={{ display: "block", width: "100%", textAlign: "left", margin: "16px 0 0", padding: "12px 14px", borderRadius: 14, background: "#151B26", border: "1px solid #2D3748", cursor: "pointer", font: "inherit" }}>
        <span style={{ display: "block", margin: "0 0 4px", color: "#FDBA74", fontSize: 12, fontWeight: 700 }}>Local standout</span>
        <strong style={{ display: "block", color: "#F8FAFC", fontWeight: 800 }}>{lead.name}</strong>
        <span style={{ display: "block", margin: "4px 0 0", color: "#AAB4C5", fontSize: 14, lineHeight: 1.5 }}>{lead.why}</span>
      </button>
    ) : null}
    {!total && pending ? <RailLoading label="Finding what's trending" /> : null}
    {total > 0 && eventSurface && eventSurface.failed ? <p role="status" style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>Wayfind could not reach this week&rsquo;s event inventory. Trending places are still shown.</p> : null}
    {TRENDING_RAIL_DEFS.map((rail) => (
      <TrendingShelf key={rail.id} rail={rail}
        eventCards={withoutLead(Array.isArray(eventsByRail[rail.id]) ? eventsByRail[rail.id] : [])}
        places={byPlaceRail[rail.id]} whyByPlaceId={whyByPlaceId} city={city} onOpenPlace={onOpenPlace}
        isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
        onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />
    ))}
    {loadingMore ? <p role="status" style={{ margin: "10px 0 0", fontSize: 12.5, color: C.muted }}>Loading more trending places…</p> : null}
  </>;
}
