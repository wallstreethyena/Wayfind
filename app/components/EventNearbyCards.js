"use client";

import IconicPlaceCard from "./IconicPlaceCard.js";
import EventPlaceRail from "./EventPlaceRail.js";

// The map's nearby results use the house place card unchanged. IconicPlaceCard
// owns the shared Save / Like / Dislike / Share behavior; this wrapper owns
// only the ordered horizontal rail and the rank shared with the map pins.
//
// v2 (2026-09-22): the rail's own copy now comes from the outing engine
// (lib/eventOuting.js, via lib/eventPairings.js) — "Make a night of it" for a
// concert, "Dinner and a show" for a symphony, "After you've had your fill"
// for a food festival — instead of one static "Nearby places" title for
// every event. `places[0].outing`/`rankingNote` are read-only props on
// otherwise-plain data rows; this file does not import lib/eventOuting.js
// itself. Legacy rows without `outing` (a stale cache entry, or a caller
// this pass missed) fall back to the old copy rather than rendering "undefined".
export default function EventNearbyCards({ places = [] }) {
  if (!places.length) return null;
  const outing = places[0] && places[0].outing;
  const title = (outing && outing.railTitle) || "Nearby places";
  const description = (outing && outing.railNote) || "Nearby picks by Wayfind Score.";
  return (
    <EventPlaceRail railClassName="wf-event-nearby-rail" title={title} description={description} label={title + " shown on the map"} count={places.length}>
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
          rankingNote={place.rankingNote || `Nearby place · ${Number(place.distMi).toFixed(1)} miles from the event venue`}
        />
      ))}
    </EventPlaceRail>
  );
}
