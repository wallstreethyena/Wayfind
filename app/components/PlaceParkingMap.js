"use client";

import EventVenueMapLoader from "./EventVenueMapLoader.js";
import { eventMapPoint } from "../../lib/eventLocation.js";
import { hasParkingCoordinate } from "../../lib/appleParking.js";

// All place-card entry points share Detail; durable /places pages use the same
// map wrapper. Never geocode a city or reuse the visitor's distance/origin here.
export default function PlaceParkingMap({ place }) {
  const point = eventMapPoint(place);
  if (!point || !hasParkingCoordinate(place) || place?.approximate) return null;
  const venue = { id: place.id, name: place.name || place.venue || "This place", ...point };
  return <section aria-label={`Map and parking near ${venue.name}`} style={{ margin: "20px 0", minWidth: 0 }}>
    <h3 style={{ margin: "0 0 10px", color: "#F8FAFC", fontSize: 17, fontWeight: 800 }}>Map &amp; parking</h3>
    <EventVenueMapLoader key={`${venue.id || venue.name}:${point.lat}:${point.lng}`} venue={venue} venueKind="place" showDrivingRoute={false} />
  </section>;
}
