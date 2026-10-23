"use client";

import IconicPlaceCard from "./IconicPlaceCard.js";
import EventPlaceRail from "./EventPlaceRail.js";
import { orderPlaceRecommendations } from "../../lib/placeRecommendationOrder.js";
import { useEventMapPlaces } from "./EventMapPlaces.js";

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
//
// v3 (2026-10-22): when the browser's Apple check moves a provider venue point,
// EventNearbyReanchor publishes the picks ranked from the CORRECTED point to the
// event's EventMapPlaces context. Those replace the server's list here and in
// the map pins (same array), so card rank N and pin N stay the same place.
export default function EventNearbyCards({ places = [] }) {
  const reanchored = useEventMapPlaces()?.picks;
  const orderedPlaces = orderPlaceRecommendations(Array.isArray(reanchored) ? reanchored : places);
  if (!orderedPlaces.length) return null;
  const outing = orderedPlaces[0] && orderedPlaces[0].outing;
  const title = (outing && outing.railTitle) || "Nearby places";
  const description = (outing && outing.railNote) || "Nearby picks by Wayfind Score.";
  return (
    <EventPlaceRail railClassName="wf-event-nearby-rail" title={title} description={description} label={title + " shown on the map"} count={orderedPlaces.length}>
      {orderedPlaces.map((place, index) => (
        <IconicPlaceCard
          key={place.id}
          place={place}
          rank={index + 1}
          href={place.href}
          editorial={place.editorial || null}
          editorialTier="known"
          surface="event_nearby"
          eagerMedia
          rankingNote={place.rankingNote ? place.rankingNote.replace(/ · [0-9.]+ mi from the venue\b/, "") : "Nearby place"}
        />
      ))}
    </EventPlaceRail>
  );
}
