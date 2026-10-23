"use client";

import { useEffect, useMemo } from "react";
import { useEventMapPlaces, eventStayMapPins } from "./EventMapPlaces.js";
import { orderPlaceRecommendations } from "../../lib/placeRecommendationOrder.js";

import IconicPlaceCard from "./IconicPlaceCard";
import BookingCTA from "./BookingCTA";
import EventPlaceRail from "./EventPlaceRail";

export default function EventStayCards({ places, title = "Stay near this event", description = "Top stays within 12 miles.", label = "Hotels near the event", surface = "event_stays", headingAction = null }) {
  // After the browser's Apple check moves a provider venue point, the stays
  // ranked from the CORRECTED point (EventNearbyReanchor) replace the server's
  // list. The map pins are published below from whatever this rail displays,
  // so a stale list can never overwrite the re-anchored one.
  const eventPlaces = useEventMapPlaces();
  const setStays = eventPlaces?.setStays;
  const reanchoredStays = eventPlaces?.reanchoredStays;
  const shown = Array.isArray(reanchoredStays) ? reanchoredStays : places;
  const orderedPlaces = useMemo(() => orderPlaceRecommendations(shown), [shown]);
  useEffect(() => {
    setStays?.(eventStayMapPins(orderedPlaces));
    return () => setStays?.([]);
  }, [orderedPlaces, setStays]);
  return <EventPlaceRail railClassName="wf-event-stays-rail" title={title} description={description} label={label} count={orderedPlaces.length} headingAction={headingAction}>
    {orderedPlaces.map((place, index) => <li className="wf-event-stay wf-place-card-slot" key={place.id}>
      <ul className="wf-event-stay-card">
      <IconicPlaceCard eagerMedia place={place} rank={index + 1} href={place.detailHref}
        editorial={place.blurb || null} editorialTier="known" surface={surface}
        cta={<BookingCTA variant="primary" detail={place} kind="hotels" label="Check rates" commerceSurface={surface === "guide_stays" ? "guide_stays" : undefined} />} />
      </ul>
      {place.mapsOnly ? <a href={place.detailHref} style={{ display: "inline-block", color: "#aab4c2", marginTop: 10 }}>View in Apple Maps</a> : null}
    </li>)}
  </EventPlaceRail>;
}
