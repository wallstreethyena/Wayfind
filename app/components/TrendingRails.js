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
import { useEffect, useMemo } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import RailLoading from "./RailLoading";
import { selectPosterEvents } from "../../lib/posterEvents.js";
import { TRENDING_RAIL_DEFS, splitTrendingPlaces } from "../../lib/trendingRails.js";
import { toHookLine } from "../../lib/editorialHook";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { railScoreOf } from "../../lib/railRank.js";
import { useCuratedRows } from "../../lib/curatorPicks.js";
import OwnedSocialShelf from "./OwnedSocialShelf";

const C = { muted: "#8B93A1" };
const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);
const prettyType = (value) => {
  const text = String(value || "").replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

function TrendingShelf({ rail, eventCards, places, city, onOpenPlace, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
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
            facts={facts} take={toHookLine(place.editorial, place.name) || null}
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
  eventsSlot = null, city = "", onOpenPlace = null,
  isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare,
}) {
  // Owner picks re-score rows before they are split (lib/curatorPicks.js).
  const curated = useCuratedRows(places, { ranked: true });
  const byPlaceRail = useMemo(() => splitTrendingPlaces(curated), [curated]);
  // Every option, not a first batch: keep pulling ranked pages until the
  // shared pool reports it is finished.
  useEffect(() => {
    if (active && hasMore && !loadingMore && typeof onLoadMore === "function") onLoadMore();
  }, [active, hasMore, loadingMore, onLoadMore, places.length]);

  if (!active) return null;
  const eventSurface = eventsSlot ? eventsSlot("trending", selectPosterEvents) : null;
  const eventsByRail = eventSurface && eventSurface.byRail ? eventSurface.byRail : {};
  const total = TRENDING_RAIL_DEFS.reduce((n, rail) => n
    + (Array.isArray(eventsByRail[rail.id]) ? eventsByRail[rail.id].length : 0)
    + byPlaceRail[rail.id].length, 0);

  // Wayfind's own Reels and carousels lead Trending on every path, loading and
  // empty included (lib/ownedSocial.js; reconciled by /api/cron/owned-social).
  const owned = <OwnedSocialShelf active={active} />;
  if (!total && (placesPending || (eventSurface && eventSurface.pending))) return <>{owned}<RailLoading label="Finding what's trending" /></>;
  if (!total) return <>{owned}<p role="status" style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, padding: "7px 2px 13px" }}>Nothing verified is trending near you yet. Check back soon.</p></>;

  return <>
    {owned}
    {eventSurface && eventSurface.failed ? <p role="status" style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>Wayfind could not reach this week&rsquo;s event inventory. Trending places are still shown.</p> : null}
    {TRENDING_RAIL_DEFS.map((rail) => (
      <TrendingShelf key={rail.id} rail={rail}
        eventCards={Array.isArray(eventsByRail[rail.id]) ? eventsByRail[rail.id] : []}
        places={byPlaceRail[rail.id]} city={city} onOpenPlace={onOpenPlace}
        isSaved={isSaved} liked={liked} disliked={disliked} isLiked={isLiked} isDisliked={isDisliked}
        onSave={onSave} onLike={onLike} onDislike={onDislike} onShare={onShare} />
    ))}
    {loadingMore ? <p role="status" style={{ margin: "10px 0 0", fontSize: 12.5, color: C.muted }}>Loading more trending places…</p> : null}
  </>;
}
