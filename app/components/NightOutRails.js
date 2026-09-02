"use client";

// One Night Out answer: ten evidence-gated rails over venue inventory and the
// dated event cards owned by home.js. Events lead each shelf because a dated
// happening is not interchangeable with the building where one might occur.
import { useMemo } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { toHookLine } from "../../lib/editorialHook";
import { composeNightOutRails } from "../../lib/nightOutIntent.js";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";

const C = { text: "#F1F5F9", muted: "#8B93A1" };
const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);
const prettyType = (value) => {
  const text = String(value || "").replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

export default function NightOutRails({
  active = true, places = [], center = null, city = "", eventsSlot = null,
  onOpenPlace = null, isSaved, liked, disliked, isLiked, isDisliked,
  onSave, onLike, onDislike, onShare,
}) {
  const payload = useMemo(
    () => composeNightOutRails([], places, center || {}),
    [places, center],
  );
  const eventSurface = active && eventsSlot ? eventsSlot("night-out") : null;

  if (!active) return null;

  return <>{payload.rails.map((rail) => {
    const eventCards = Array.isArray(eventSurface?.byRail?.[rail.id]) ? eventSurface.byRail[rail.id] : [];
    const count = eventCards.length + rail.places.length;
    const railId = "night-out-" + rail.id;
    return <section key={rail.id} aria-label={rail.title} style={{ marginTop: 22 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 850, color: C.text }}>{rail.title}</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45, color: "#AEB8C6" }}>{rail.deck}</p>
      {!count && eventSurface?.pending ? (
        <div className="wf-sk" role="status" aria-busy="true" aria-label={`Finding ${rail.title}`} style={{ height: 88, borderRadius: 14, background: "#0B0E15" }} />
      ) : !count ? (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted }}>No verified event or venue within 27 miles clears this intent yet. Wayfind will not fill it with a look-alike.</p>
      ) : <>
        <RailNav railId={railId} count={count} unit={count === 1 ? "verified option" : "verified options"} />
        <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={rail.title}>
          {eventCards}
          {rail.places.map((place, index) => {
            const rank = eventCards.length + index + 1;
            const type = prettyType(place.primaryType || place.primary_type || place.category);
            const facts = [
              place.reviews ? compact(place.reviews) + " reviews" : null,
              priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null,
              Number.isFinite(place.distMi) ? place.distMi + " mi" : null,
            ].filter(Boolean);
            const href = directionsUrl(place);
            return <RailCard key={place.id} className="wf-exploding-primary"
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
        </div>
        {count > 1 ? <RailDots railId={railId} count={count} /> : null}
      </>}
    </section>;
  })}</>;
}
