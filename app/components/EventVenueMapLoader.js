"use client";

// The map is browser-only. This shim keeps EventWhere server-rendered and
// defers MapKit JS until the map is near the viewport.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEventMapPlaces } from "./EventMapPlaces.js";
import { mergeEventMapPlaces } from "../../lib/eventMapPlaces.js";
import EventDrivingRoute from "./EventDrivingRoute.js";

const EventVenueMap = dynamic(() => import("./EventVenueMap"), {
  ssr: false,
  loading: () => <div className="wfev wfev-h" aria-hidden="true" style={{ position: "relative", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(148,163,184,.2)", background: "linear-gradient(145deg,#17212E 0%,#0A111B 72%)", minHeight: 340 }}><div style={{ position: "absolute", left: 12, top: 12, padding: "9px 13px", borderRadius: 999, background: "rgba(10,15,23,.82)", border: "1px solid rgba(148,163,184,.28)", color: "#94A3B8", fontSize: 13, fontWeight: 800 }}>Loading Apple map…</div></div>,
});

export default function EventVenueMapLoader(props) {
  const stays = useEventMapPlaces()?.stays || [];
  const mapPicks = useMemo(() => mergeEventMapPlaces(props.picks, stays), [props.picks, stays]);
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
    {visible ? <EventVenueMap {...props} picks={mapPicks} onMapReady={setMapController} /> : <div className="wfev wfev-h" style={{ minHeight: 340 }} aria-label="Venue map loads as you scroll" />}
    <EventDrivingRoute venue={props.venue} directionsHref={props.directionsHref} mapController={mapController} />
  </div>;
}
