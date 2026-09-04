"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SummerPicksRails from "./SummerPicksRails";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { homeAffiliateActivities } from "../../lib/homeAffiliateActivities.js";
import { composeSummerPickRails } from "../../lib/summerPicks.js";
import { cardImageSrc } from "../../lib/placePhoto.js";

export const SUMMER_LOAD_TIMEOUT_MS = 10000;

const photoSrc = (place) => place?.photo || place?.photoUrl || place?.photo_url || cardImageSrc(place, 640);

export default function SummerIntentRails({ active = true, center = null, city = "", onTrack = null, onOpenPlace = null }) {
  const [rails, setRails] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const asked = useRef("");
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  const key = useMemo(() => active && lat != null && lng != null ? `${lat.toFixed(2)}|${lng.toFixed(2)}` : "", [active, lat, lng]);

  useEffect(() => {
    const requestKey = `${key}|${retry}`;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setRails(null);
    setFailed(false);
    let cancelled = false;
    const [queryLat, queryLng] = key.split("|");
    const location = { lat: queryLat, lng: queryLng };
    const tourQ = new URLSearchParams({ ...location, mi: "120", cat: "all", limit: "100", page: "0" });

    // Two dedicated, bounded reads. Summer no longer wakes the shared
    // homepage /api/rails catalogue just to build its own collection.
    Promise.allSettled([
      fetchJsonWithDeadline(`/api/summer/places?${new URLSearchParams(location)}`, { timeoutMs: SUMMER_LOAD_TIMEOUT_MS }),
      fetchJsonWithDeadline(`/api/experiences?${tourQ}`, { timeoutMs: SUMMER_LOAD_TIMEOUT_MS }),
    ]).then(([placeResult, tourResult]) => {
      if (cancelled) return;
      const placePayload = placeResult.status === "fulfilled" ? placeResult.value : null;
      const tourPayload = tourResult.status === "fulfilled" ? tourResult.value : null;
      // The route already admits only inventory rows carrying a place-owned
      // photo reference. Preloading every photo here made the ENTIRE Summer
      // collection wait for the slowest image (in 8-worker batches, up to many
      // 4s rounds) before React could render one card. RailCard already owns a
      // per-image error fallback, so render the valid URLs immediately.
      const places = (Array.isArray(placePayload?.places) ? placePayload.places : []).filter(photoSrc);
      const tours = homeAffiliateActivities(tourPayload?.items, 100);
      const composed = composeSummerPickRails(places, tours);
      if (!composed.some((rail) => rail.cards.length)) { setFailed(true); return; }
      setRails(composed);
      try { onTrack?.("summer_intent_collection_open", { city, rails: composed.length, cards: composed.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // The parent's inline telemetry callback is not request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  if (!active) return null;
  if (!key) return <p style={{ color: "#A8B0BE", fontSize: 13 }}>Share your location to rank the ten summer rails near you.</p>;
  if (!rails && !failed) return <div role="status" aria-busy="true" aria-label="Ranking summer picks">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12 }} />)}</div>;
  if (failed) return <div><p style={{ color: "#A8B0BE", fontSize: 13 }}>We could not reach Wayfind&apos;s photo-verified summer inventory. That is a service miss, not an empty town.</p><button type="button" onClick={() => setRetry((value) => value + 1)} style={{ border: "1px solid #F97316", borderRadius: 999, background: "#111827", color: "#F8FAFC", padding: "7px 12px", fontWeight: 800 }}>Try again</button></div>;
  return <SummerPicksRails rails={rails} city={city || "Florida"} onOpenPlace={onOpenPlace} />;
}
