"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SummerPicksRails from "./SummerPicksRails";
import { fetchJsonWithDeadline } from "../../lib/clientJson.js";
import { homeAffiliateActivities } from "../../lib/homeAffiliateActivities.js";
import { composeSummerPickRails } from "../../lib/summerPicks.js";
import { cardImageSrc } from "../../lib/placePhoto.js";

export const SUMMER_LOAD_TIMEOUT_MS = 10000;
const PHOTO_TIMEOUT_MS = 4000;
const PHOTO_WORKERS = 8;

const photoSrc = (place) => place?.photo || place?.photoUrl || place?.photo_url || cardImageSrc(place, 640);

function imageLoads(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(false);
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PHOTO_TIMEOUT_MS);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = src;
  });
}

async function withWorkingPhotos(places) {
  const rows = (Array.isArray(places) ? places : []).filter((place) => photoSrc(place));
  const sources = [...new Set(rows.map(photoSrc))];
  const working = new Set();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(PHOTO_WORKERS, sources.length) }, async () => {
    while (cursor < sources.length) {
      const src = sources[cursor++];
      if (await imageLoads(src)) working.add(src);
    }
  }));
  return rows.filter((place) => working.has(photoSrc(place)));
}

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
    ]).then(async ([placeResult, tourResult]) => {
      if (cancelled) return;
      const placePayload = placeResult.status === "fulfilled" ? placeResult.value : null;
      const tourPayload = tourResult.status === "fulfilled" ? tourResult.value : null;
      const places = await withWorkingPhotos(placePayload?.places);
      if (cancelled) return;
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
