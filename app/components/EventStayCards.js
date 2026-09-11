"use client";

import IconicPlaceCard from "./IconicPlaceCard";
import BookingCTA from "./BookingCTA";

export default function EventStayCards({ places }) {
  return <div className="wf-event-stays-rail" role="list" aria-label="Hotels near the event" tabIndex={0}>
    {places.map((place, index) => <div className="wf-event-stay" role="listitem" key={place.id}>
      <IconicPlaceCard place={place} rank={index + 1} href={place.detailHref}
        editorial={place.blurb || null} editorialTier="known" surface="event_stays"
        rankingNote={`${place.distMi.toFixed(1)} miles from the venue`} />
      {place.mapsOnly ? <a href={place.detailHref} style={{ display: "inline-block", color: "#aab4c2", marginTop: 10 }}>View in Apple Maps</a> : null}
      <BookingCTA variant="primary" detail={place} kind="hotels" label="Check rates" />
      <BookingCTA variant="disclosure" detail={place} kind="hotels" />
    </div>)}
  </div>;
}
