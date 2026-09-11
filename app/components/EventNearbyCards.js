"use client";

import IconicPlaceCard from "./IconicPlaceCard.js";

// The map's nearby results use the house place card unchanged. IconicPlaceCard
// owns the shared Save / Like / Dislike / Share behavior; this wrapper owns
// only the ordered horizontal rail and the rank shared with the map pins.
export default function EventNearbyCards({ places = [] }) {
  if (!places.length) return null;
  return (
    <ol className="wf-rail wf-event-nearby-rail" aria-label="Nearby places ranked to match the map pins" tabIndex={0}>
      {places.map((place, index) => (
        <IconicPlaceCard
          key={place.id}
          place={place}
          rank={index + 1}
          href={place.href}
          editorial={place.editorial || null}
          editorialTier="known"
          surface="event_nearby"
          eagerMedia
          rankingNote={`Nearby place — ${Number(place.distMi).toFixed(1)} miles from the event venue`}
        />
      ))}
    </ol>
  );
}
