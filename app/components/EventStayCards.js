"use client";

import { useEffect } from "react";
import { useEventMapPlaces, eventStayMapPins } from "./EventMapPlaces.js";

import IconicPlaceCard from "./IconicPlaceCard";
import BookingCTA from "./BookingCTA";
import EventPlaceRail from "./EventPlaceRail";

export default function EventStayCards({ places }) {
  const setStays = useEventMapPlaces()?.setStays;
  useEffect(() => {
    setStays?.(eventStayMapPins(places));
    return () => setStays?.([]);
  }, [places, setStays]);
  return <EventPlaceRail railClassName="wf-event-stays-rail" title="Stay near this event" description="Top stays within 12 miles." label="Hotels near the event" count={places.length}>
    {places.map((place, index) => <li className="wf-event-stay" key={place.id}>
      <ul className="wf-event-stay-card">
      <IconicPlaceCard eagerMedia place={place} rank={index + 1} href={place.detailHref}
        editorial={place.blurb || null} editorialTier="known" surface="event_stays"
        rankingNote={`${place.distMi.toFixed(1)} miles from the venue`} />
      </ul>
      {place.mapsOnly ? <a href={place.detailHref} style={{ display: "inline-block", color: "#aab4c2", marginTop: 10 }}>View in Apple Maps</a> : null}
      <BookingCTA variant="primary" detail={place} kind="hotels" label="Check rates" />
      <BookingCTA variant="disclosure" detail={place} kind="hotels" />
    </li>)}
  </EventPlaceRail>;
}
