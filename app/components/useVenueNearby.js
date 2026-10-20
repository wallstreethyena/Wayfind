"use client";

import { useEffect, useState } from "react";
import { detailNearbyPool, DETAIL_NEARBY_RADIUS_MI } from "../../lib/detailNearby.js";
import { readCompleteMapArea } from "../../lib/mapAreaRead.js";
import { mergeMapAreaContext } from "../../lib/mapAreaData.js";
import { mapFailureReason, reportMapServiceIssue } from "../../lib/mapDiagnostics.js";

export function venueNearbyBounds(place) {
  if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)
    || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180 || (place.lat === 0 && place.lng === 0)) return null;
  const latitude = DETAIL_NEARBY_RADIUS_MI / 69;
  const longitude = latitude / Math.max(0.01, Math.cos(place.lat * Math.PI / 180));
  return { north: Math.min(90, place.lat + latitude), south: Math.max(-90, place.lat - latitude),
    east: Math.min(180, place.lng + longitude), west: Math.max(-180, place.lng - longitude) };
}

// One venue-owned read powers pins and all detail recommendation sections.
// Browsing a different city never moves this origin. No Google call or new
// persistent coordinate cache is involved.
export default function useVenueNearby(place, contextPlaces = [], enabled = true) {
  const key = JSON.stringify([place?.id, place?.lat, place?.lng]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: "", status: "idle", places: [] });
  useEffect(() => {
    if (!enabled) return undefined;
    const bounds = venueNearbyBounds(place);
    if (!bounds || place?.approximate) return undefined;
    const controller = new AbortController();
    let dead = false;
    const timeout = setTimeout(() => controller.abort(new Error("Venue nearby deadline")), 20000);
    setResult({ key, status: "loading", places: [] });
    readCompleteMapArea({ bounds, origin: { lat: place.lat, lng: place.lng }, signal: controller.signal })
      .then((places) => { if (!dead) setResult({ key, status: "ready", places: detailNearbyPool(place, places) }); })
      .catch((error) => { if (!dead) {
        reportMapServiceIssue("venue-nearby", mapFailureReason(error));
        setResult({ key, status: "error", places: [] });
      } })
      .finally(() => clearTimeout(timeout));
    return () => { dead = true; clearTimeout(timeout); controller.abort(); };
    // Presentation updates must not restart an owned geographic read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt]);
  const current = result.key === key ? result : { status: venueNearbyBounds(place) ? "loading" : "unavailable", places: [] };
  const candidates = current.status === "ready" ? current.places : detailNearbyPool(place, contextPlaces);
  return { status: current.status, places: mergeMapAreaContext(candidates, contextPlaces), retry: () => setAttempt((value) => value + 1) };
}
