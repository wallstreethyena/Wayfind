"use client";

import IconicPlaceCard from "./IconicPlaceCard.js";
import EventPlaceRail from "./EventPlaceRail.js";

// The map's nearby results use the house place card unchanged. IconicPlaceCard
// owns the shared Save / Like / Dislike / Share behavior; this wrapper owns
// only the ordered horizontal rail and the rank shared with the map pins.
export default function EventNearbyCards({ places = [] }) {
  if (!places.length) return null;
  return (
    <EventPlaceRail railClassName="wf-event-nearby-rail" title="Nearby places" description="Nearby picks by Wayfind Score." label="Nearby places shown on the map" count={places.length}>
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
    </EventPlaceRail>
  );
}
