"use client";

import { useEffect, useState } from "react";
import { useContentCardActions } from "../../../../lib/contentCardActions";
import { addPlaceToTrips } from "../../../../lib/trips";

const TRIPS_KEY = "wayfind_trips";

function Thumb({ down = false }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down
      ? <><path d="M8 4v10H4V4h4Z" /><path d="M8 6h8.5a2 2 0 0 1 1.9 1.4l1.3 4a2 2 0 0 1-1.9 2.6H14l.6 3.1a2.4 2.4 0 0 1-2.4 2.9L8 14V6Z" /></>
      : <><path d="M8 10v10H4V10h4Z" /><path d="M8 18h8.5a2 2 0 0 0 1.9-1.4l1.3-4a2 2 0 0 0-1.9-2.6H14l.6-3.1A2.4 2.4 0 0 0 12.2 4L8 10v8Z" /></>}
  </svg>;
}

export default function EventActions({ event }) {
  const actions = useContentCardActions(event ? {
    id: event.id,
    type: "event",
    title: event.name,
    image: event.image || null,
    url: event.url || (typeof window !== "undefined" ? window.location.href : ""),
    provider: event.source || null,
  } : null);
  const [inTrip, setInTrip] = useState(false);

  useEffect(() => {
    if (!event || !event.id) return;
    try {
      const trips = JSON.parse(localStorage.getItem(TRIPS_KEY) || "{}") || {};
      setInTrip(Object.values(trips).some((trip) => Array.isArray(trip && trip.items) && trip.items.some((item) => item && item.id === `event:${event.id}`)));
    } catch {}
  }, [event]);

  if (!event) return null;
  const addEvent = () => {
    try {
      const trips = JSON.parse(localStorage.getItem(TRIPS_KEY) || "{}") || {};
      const place = {
        id: `event:${event.id}`,
        name: event.name,
        address: [event.venue, event.city].filter(Boolean).join(", "),
        city: event.city,
        lat: event.lat,
        lng: event.lng,
        photo: event.image || null,
        itemType: "event",
        date: event.date,
        time: event.time,
        url: typeof window !== "undefined" ? window.location.href : "",
      };
      localStorage.setItem(TRIPS_KEY, JSON.stringify(addPlaceToTrips(trips, place, Date.now())));
      setInTrip(true);
    } catch {}
  };

  const button = { minHeight: 46, borderRadius: 13, border: "1px solid rgba(159,177,203,.24)", background: "linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01)),#0A1019", color: "#E7EDF5", fontSize: 13, fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" };
  return (
    <section aria-label="Event actions" style={{ marginTop: 18, padding: 12, borderRadius: 18, border: "1px solid rgba(249,115,22,.3)", background: "linear-gradient(145deg,rgba(249,115,22,.1),rgba(18,25,36,.96) 45%)", boxShadow: "0 16px 34px rgba(0,0,0,.25)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
        <button type="button" aria-pressed={actions.saved} onClick={actions.toggleSave} style={{ ...button, ...(actions.saved ? { background: "#F97316", borderColor: "#F97316", color: "#111827" } : {}) }}>{actions.saved ? "♥ Saved" : "♡ Save event"}</button>
        <button type="button" aria-pressed={inTrip} onClick={addEvent} style={{ ...button, ...(inTrip ? { background: "#38BDF8", borderColor: "#38BDF8", color: "#08121B" } : {}) }}>{inTrip ? "✓ In itinerary" : "+ Add to itinerary"}</button>
        <button type="button" aria-label="Like this event" aria-pressed={actions.liked} onClick={actions.toggleLike} style={{ ...button, ...(actions.liked ? { background: "#34D399", borderColor: "#34D399", color: "#06231A" } : {}) }}><Thumb /> Like</button>
        <button type="button" aria-label="Not for me" aria-pressed={actions.disliked} onClick={actions.toggleDislike} style={{ ...button, ...(actions.disliked ? { background: "#F87171", borderColor: "#F87171", color: "#2A0A0A" } : {}) }}><Thumb down /> Not for me</button>
        <button type="button" onClick={actions.share} style={{ ...button, gridColumn: "1 / -1", borderColor: "rgba(249,115,22,.5)", color: "#FDBA74" }}>↗ Share this event</button>
      </div>
    </section>
  );
}
