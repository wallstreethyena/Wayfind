"use client";

import { useMemo } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import RailHeading from "./RailHeading";
import { directionsUrl } from "./kit";
import { splitBreakfastRails } from "../../lib/breakfastRails.js";
import { toHookLine } from "../../lib/editorialHook";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { topPickAward } from "../../lib/topPickAward.js";
import { priceLabel } from "../../lib/price.js";
import { railScrollNeedsMore } from "../../lib/railResponse.js";
import { visibleRails } from "../../lib/railVisibility.js";

const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);

export default function BreakfastRails({ places = [], city = "", hasMore = false, loadingMore = false, onLoadMore, onOpenPlace, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const rails = useMemo(() => visibleRails(splitBreakfastRails(places), "places"), [places]);
  return (
    <>
      {rails.map((rail) => (
        <section key={rail.id} aria-label={rail.title} style={{ marginTop: 22 }}>
          <RailHeading title={rail.title} description={rail.deck}>
            <RailNav railId={rail.id} count={rail.places.length} unit={rail.places.length === 1 ? "ranked place" : "ranked places"} />
          </RailHeading>
          <>
              <div className="wf-rail wf-rail-exploding" data-rail={rail.id} tabIndex={0} role="region" aria-label={rail.title}
                onScroll={(event) => {
                  if (hasMore && !loadingMore && railScrollNeedsMore(event.currentTarget, Math.max(180, event.currentTarget.clientWidth * 0.75))) onLoadMore?.();
                }}>
                {rail.places.map((place, index) => {
                  const rank = index + 1;
                  const photo = place.photo || place.photoUrl || (place.photoRef || place.photo_ref
                    ? "/api/photo?ref=" + encodeURIComponent(place.photoRef || place.photo_ref) + "&w=640"
                    : null);
                  const facts = [
                    place.reviews ? compact(place.reviews) + " reviews" : null,
                    priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null,
                    Number.isFinite(place.distMi) ? place.distMi + " mi" : null,
                  ].filter(Boolean);
                  return <RailCard
                    key={place.id}
                    className="wf-exploding-primary"
                    photo={photo}
                    place={place}
                    title={place.name}
                    eyebrow={rail.title}
                    rank={rank}
                    score={toDisplayScore(wayfindScore(place.rating, place.reviews))}
                    facts={facts}
                    award={topPickAward({ category: rail.id === "breakfast-cafes" ? "café" : "breakfast", rank })}
                    take={toHookLine(place.editorial, place.name) || null}
                    cta={directionsUrl(place) ? { label: "Directions ↗", href: directionsUrl(place), external: true } : null}
                    ariaLabel={"Open " + place.name}
                    onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
                    saved={isSaved ? !!isSaved(place.id) : undefined}
                    liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
                    disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
                    onSave={onSave ? (event) => onSave(event, place) : undefined}
                    onLike={onLike ? (event) => onLike(event, place) : undefined}
                    onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
                    onShare={onShare ? () => onShare(place, { city }) : undefined}
                  />;
                })}
              </div>
              {rail.places.length > 1 ? <RailDots railId={rail.id} count={rail.places.length} /> : null}
          </>
        </section>
      ))}
      {hasMore ? <button type="button" className="wf8-thinbtn" disabled={loadingMore} onClick={() => onLoadMore?.()}>
        {loadingMore ? "Loading more places…" : "Show more ranked places"}
      </button> : null}
    </>
  );
}
