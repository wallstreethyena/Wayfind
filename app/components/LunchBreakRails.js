"use client";

import { useMemo } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { composeLunchBreakRails } from "../../lib/lunchBreakRails.js";
import { toHookLine } from "../../lib/editorialHook";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { topPickAward } from "../../lib/topPickAward.js";
import { priceLabel } from "../../lib/price.js";

const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);

export default function LunchBreakRails({ places = [], city = "", onOpenPlace, isSaved, liked, disliked, isLiked, isDisliked, onSave, onLike, onDislike, onShare }) {
  const rails = useMemo(() => composeLunchBreakRails(places), [places]);
  return <>
    {rails.map((rail) => (
      <section key={rail.id} aria-label={rail.title} style={{ marginTop: 22 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>{rail.title}</h2>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#AEB8C6" }}>{rail.deck}</p>
        {!rail.places.length ? <p style={{ margin: "8px 0 0", fontSize: 13, color: "#8b93a1" }}>No nearby quick-lunch place carries enough evidence for this rail yet.</p> : <>
          <RailNav railId={"lunch-break-" + rail.id} count={rail.places.length} unit={rail.places.length === 1 ? "ranked place" : "ranked places"} />
          <div className="wf-rail wf-rail-exploding" data-rail={"lunch-break-" + rail.id} tabIndex={0} role="region" aria-label={rail.title}>
            {rail.places.map((place, index) => {
              const cardRank = index + 1;
              const photo = place.photo || place.photoUrl || (place.photoRef || place.photo_ref ? "/api/photo?ref=" + encodeURIComponent(place.photoRef || place.photo_ref) + "&w=640" : null);
              const facts = [place.reviews ? compact(place.reviews) + " reviews" : null, priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null, Number.isFinite(place.distMi) ? place.distMi + " mi" : null].filter(Boolean);
              const directions = directionsUrl(place);
              return <RailCard key={place.id} className="wf-exploding-primary" photo={photo} place={place} title={place.name} eyebrow={rail.title} rank={cardRank}
                score={toDisplayScore(wayfindScore(place.rating, place.reviews))} facts={facts}
                award={topPickAward({ category: rail.title.toLowerCase(), rank: cardRank })}
                take={toHookLine(place.editorial, place.name) || null}
                cta={directions ? { label: "Directions ↗", href: directions, external: true } : null}
                ariaLabel={"Open " + place.name} onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
                saved={isSaved ? !!isSaved(place.id) : undefined}
                liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
                disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
                onSave={onSave ? (event) => onSave(event, place) : undefined}
                onLike={onLike ? (event) => onLike(event, place) : undefined}
                onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
                onShare={onShare ? () => onShare(place, { city }) : undefined} />;
            })}
          </div>
          {rail.places.length > 1 ? <RailDots railId={"lunch-break-" + rail.id} count={rail.places.length} /> : null}
        </>}
      </section>
    ))}
  </>;
}

