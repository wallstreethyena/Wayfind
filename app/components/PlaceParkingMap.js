"use client";

import EventVenueMapLoader from "./EventVenueMapLoader.js";
import { eventMapPoint } from "../../lib/eventLocation.js";
import { hasParkingCoordinate } from "../../lib/appleParking.js";
import useVenueNearby from "./useVenueNearby.js";
import { selectMapPlaces } from "../../lib/mapAreaData.js";

// All place-card entry points share Detail; durable /places pages use the same
// map wrapper. Never geocode a city or reuse the visitor's distance/origin here.
export default function PlaceParkingMap({ place, nearby: suppliedNearby }) {
  const ownNearby = useVenueNearby(place, [], !suppliedNearby);
  const nearby = suppliedNearby || ownNearby;
  const point = eventMapPoint(place);
  if (!point || !hasParkingCoordinate(place) || place?.approximate) return null;
  const venue = { ...place, id: place.id, name: place.name || place.venue || "This place", ...point };
  const picks = selectMapPlaces(nearby.places).map((pick) => ({ ...pick,
    href: `/p/${encodeURIComponent(pick.id)}`, cat: pick.category || pick.type,
    wfScore: pick.governed_score ?? pick.wfScore }));
  return <section aria-label={`Map and parking near ${venue.name}`} style={{ margin: "20px 0", minWidth: 0 }}>
    <h3 style={{ margin: "0 0 10px", color: "#F8FAFC", fontSize: 17, fontWeight: 800 }}>Map &amp; parking</h3>
    <EventVenueMapLoader key={`${venue.id || venue.name}:${point.lat}:${point.lng}`} venue={venue} picks={picks} venueKind="place" showDrivingRoute={false} nearbyStatus={nearby.status} />
    <div role="status" style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 8, color: "#94A3B8", fontSize: 13 }}>
      {nearby.status === "loading" ? <span>Loading places near this venue…</span> : null}
      {nearby.status === "error" ? <><span>Nearby places unavailable.</span><button type="button" className="wfev-cat" onClick={nearby.retry}>Retry nearby</button></> : null}
    </div>
  </section>;
}
