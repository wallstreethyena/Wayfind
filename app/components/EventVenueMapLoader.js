"use client";

// The map is browser-only. This shim keeps EventWhere server-rendered and
// defers MapKit JS until the map is near the viewport.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useEventMapPins } from "./EventMapPlaces.js";
import EventDrivingRoute from "./EventDrivingRoute.js";
import VenueMapLoading from "./VenueMapLoading.js";

const EventVenueMap = dynamic(() => import("./EventVenueMap"), {
  ssr: false,
  loading: () => <VenueMapLoading />,
});

export default function EventVenueMapLoader(props) {
  // Nearby picks (the browser's re-anchored list once Apple moved the venue
  // point, otherwise the server's) merged with the stays the rail displays.
  const mapPicks = useEventMapPins(props.picks);
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  const [mapController, setMapController] = useState(null);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "300px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={host}>
    {visible ? <EventVenueMap {...props} picks={mapPicks} onMapReady={setMapController} /> : <VenueMapLoading />}
    {props.showDrivingRoute !== false ? <EventDrivingRoute venue={props.venue} directionsHref={props.directionsHref} mapController={mapController} /> : null}
  </div>;
}
