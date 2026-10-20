"use client";
// Read-only trip opened from a private share link. Not auth-walled: the link
// itself is the access. The owner's itinerary row is never read here.
import { useEffect, useState } from "react";
import { C } from "../kit";
import { sortedItems } from "../../../lib/trips";

export default function SharedItineraryScreen({ ctx }) {
  const { sharedItinerary, setSharedItinerary, setScreen, itineraryFlags } = ctx;
  const trip = sharedItinerary;
  const mapOn = !!(itineraryFlags && itineraryFlags.map);
  const [RouteMap, setRouteMap] = useState(null);
  useEffect(() => {
    if (!mapOn) { setRouteMap(null); return undefined; }
    let cancelled = false;
    import("../ItineraryRouteMap").then((mod) => { if (!cancelled) setRouteMap(() => mod.default); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapOn]);
  if (!trip) return null;
  const items = sortedItems(trip);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid " + C.border, marginBottom: 14, paddingTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{trip.title || trip.city}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Private link · {items.length} stop{items.length === 1 ? "" : "s"}</div>
        </div>
        <button onClick={() => { setSharedItinerary(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
      </div>
      {RouteMap ? <RouteMap items={items} /> : null}
      {items.map((it) => (
        <div key={it.id} style={{ padding: "10px 0", borderBottom: "1px solid " + C.border }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{(it.order + 1) + ". " + ((it.place && it.place.name) || "Stop")}</div>
          {it.place && it.place.address ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{it.place.address}</div> : null}
          {it.note ? <div style={{ fontSize: 12.5, color: C.light, marginTop: 4 }}>{it.note}</div> : null}
        </div>
      ))}
    </div>
  );
}
