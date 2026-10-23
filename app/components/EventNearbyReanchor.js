"use client";

import { useEffect, useState } from "react";
import { useEventMapPlaces } from "./EventMapPlaces.js";
import { useResolvedVenuePoint } from "./useResolvedVenuePoint.js";
import { eventNearbyPlaces } from "../../lib/eventNearbyPlaces.js";

// RE-ANCHOR THE NEARBY SURFACES ON APPLE'S VENUE POINT (2026-10-22).
//
// A Ticketmaster venue point is often a ZIP centroid, so the server ranks the
// nearby picks and stays around a neighbourhood that can be kilometres from the
// building. The map asks Apple where the venue really is (EventVenueMap, then
// lib/venueResolutionStore.js). Only when Apple CORRECTED the point by more than
// 300 m does this component do anything: it makes ONE same-origin request for
// the picks and stays around the corrected point and swaps them into the event's
// EventMapPlaces context, so the cards, the stays rail and the map pins move
// together. Everything else keeps the server content: a confirmed or kept
// point, a failed or stale request, a venue that was never provider-sourced.
//
// It renders nothing until a correction exists. After a swap it renders one
// visually hidden status line so assistive technology hears that the list moved.
const HIDDEN = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

const MAX_NAME_CHARS = 120;
const MAX_FIELD_CHARS = 80;

export function venueNearbyUrl({ point, city, name, date, time, segment, genre, placeId }) {
  const params = new URLSearchParams();
  params.set("lat", String(point.lat));
  params.set("lng", String(point.lng));
  const add = (key, value, max) => {
    const clean = value == null ? "" : String(value).trim().slice(0, max);
    if (clean) params.set(key, clean);
  };
  add("name", name, MAX_NAME_CHARS);
  add("city", city, MAX_FIELD_CHARS);
  add("date", date, MAX_FIELD_CHARS);
  add("time", time, MAX_FIELD_CHARS);
  add("segment", segment, MAX_FIELD_CHARS);
  add("genre", genre, MAX_FIELD_CHARS);
  add("placeId", placeId, MAX_FIELD_CHARS);
  return "/api/events/venue-nearby?" + params.toString();
}

/**
 * @param {{
 *   venue: {name: string, lat: number, lng: number}, // the PROVIDER venue exactly as the map got it
 *   city?: string, name?: string, date?: string, time?: string,
 *   segment?: string, genre?: string, placeId?: string, // the event's own facts (they pick before/after slots)
 *   hasNearby?: boolean, // the server rendered a nearby shelf; the picks swap only where cards and pins exist
 * }} props
 */
export default function EventNearbyReanchor({ venue, city, name, date, time, segment, genre, placeId, hasNearby = true }) {
  const { corrected, point } = useResolvedVenuePoint(venue || {});
  const applyReanchor = useEventMapPlaces()?.applyReanchor;
  const [swapped, setSwapped] = useState(false);
  const lat = point.lat;
  const lng = point.lng;

  useEffect(() => {
    if (!corrected || typeof applyReanchor !== "function" || typeof fetch !== "function") return undefined;
    let current = true;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const url = venueNearbyUrl({ point: { lat, lng }, city, name, date, time, segment, genre, placeId });
    (async () => {
      try {
        const response = await fetch(url, { signal: controller ? controller.signal : undefined, headers: { accept: "application/json" } });
        if (!response.ok) return;
        const body = await response.json();
        if (!current || !body || typeof body !== "object") return;
        const missing = !body.unavailable || typeof body.unavailable !== "object";
        const picksOk = !missing && body.unavailable.picks === false && Array.isArray(body.picks);
        const staysOk = !missing && body.unavailable.stays === false && Array.isArray(body.stays);
        // Cards and pins come from one admitted, ordered array.
        const picks = picksOk && hasNearby ? eventNearbyPlaces(body.picks, true) : null;
        const stays = staysOk ? body.stays : null;
        if (!picks && !stays) return;
        applyReanchor({ picks, stays, point: { lat, lng } });
        setSwapped(true);
      } catch {
        // Keep the server content: an aborted, failed or malformed request changes nothing.
      }
    })();
    return () => { current = false; if (controller) controller.abort(); };
  }, [corrected, lat, lng, city, name, date, time, segment, genre, placeId, hasNearby, applyReanchor]);

  if (!corrected) return null;
  return <p role="status" style={HIDDEN}>{swapped ? "Updated nearby picks for the verified venue location." : ""}</p>;
}
