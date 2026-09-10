"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SummerPicksRails from "./SummerPicksRails";
import { RailDevError, RailMascotBusy } from "./kit.js";
import { emitRailDegraded, fetchRailJson, isRailCancelled, railDeveloperFailure } from "../../lib/railFailure.js";
import { homeAffiliateActivities } from "../../lib/homeAffiliateActivities.js";
import { composeSummerPickRails } from "../../lib/summerPicks.js";
import { cardImageSrc } from "../../lib/placePhoto.js";

export const SUMMER_LOAD_TIMEOUT_MS = 10000;

const photoSrc = (place) => place?.photo || place?.photoUrl || place?.photo_url || cardImageSrc(place, 640);

export default function SummerIntentRails({ active = true, center = null, city = "", onTrack = null, onOpenPlace = null }) {
  const [rails, setRails] = useState(null);
  const [failure, setFailure] = useState(null);
  const [retry, setRetry] = useState(0);
  const asked = useRef("");
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  const key = useMemo(() => active && lat != null && lng != null ? `${lat.toFixed(2)}|${lng.toFixed(2)}` : "", [active, lat, lng]);

  useEffect(() => {
    const requestKey = key + "|" + retry;
    if (!key || asked.current === requestKey) return;
    asked.current = requestKey;
    setRails(null);
    setFailure(null);
    let cancelled = false;
    const controller = new AbortController();
    const [queryLat, queryLng] = key.split("|");
    const location = { lat: queryLat, lng: queryLng };
    const tourQ = new URLSearchParams({ ...location, mi: "120", cat: "all", limit: "100", page: "0" });
    Promise.allSettled([
      fetchRailJson("/api/summer/places?" + new URLSearchParams(location).toString(), { timeoutMs: SUMMER_LOAD_TIMEOUT_MS, signal: controller.signal }),
      fetchRailJson("/api/experiences?" + tourQ.toString(), { timeoutMs: SUMMER_LOAD_TIMEOUT_MS, signal: controller.signal }),
    ]).then(([placeResult, tourResult]) => {
      if (cancelled) return;
      const placePayload = placeResult.status === "fulfilled" ? placeResult.value : null;
      const tourPayload = tourResult.status === "fulfilled" ? tourResult.value : null;
      const problems = [];
      if (placeResult.status === "rejected" && !isRailCancelled(placeResult.reason)) problems.push(placeResult.reason);
      if (tourResult.status === "rejected" && !isRailCancelled(tourResult.reason)) problems.push(tourResult.reason);
      if (placeResult.status === "fulfilled" && !Array.isArray(placePayload?.places)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/summer/places" }));
      if (tourResult.status === "fulfilled" && !Array.isArray(tourPayload?.items)) problems.push(railDeveloperFailure("invalid_payload", { route: "/api/experiences" }));
      for (const problem of problems) if (problem?.kind === "developer") console.error("[SummerIntentRails] request contract failure", problem);
      const places = (Array.isArray(placePayload?.places) ? placePayload.places : []).filter(photoSrc);
      const tours = homeAffiliateActivities(Array.isArray(tourPayload?.items) ? tourPayload.items : [], 100);
      const composed = composeSummerPickRails(places, tours);
      if (composed.some((rail) => rail.cards.length)) {
        setRails(composed);
        try { onTrack?.("summer_intent_collection_open", { city, rails: composed.length, cards: composed.reduce((sum, rail) => sum + rail.cards.length, 0) }); } catch {}
        return;
      }
      if (!problems.length) { setRails([]); return; }
      setFailure(problems.find((problem) => problem?.kind === "developer") || problems[0]);
    }).catch((error) => {
      if (cancelled || isRailCancelled(error)) return;
      console.error("[SummerIntentRails] aggregation failure", error);
      setFailure(railDeveloperFailure("aggregation_failure", { route: "/summer", cause: error }));
    });
    return () => { cancelled = true; controller.abort(); asked.current = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);

  if (!active) return null;
  if (!key) return <p style={{ color: "#A8B0BE", fontSize: 13 }}>Share your location to rank the ten summer rails near you.</p>;
  if (!rails && !failure) return <div role="status" aria-busy="true" aria-label="Ranking summer picks">{[0, 1, 2].map((index) => <div key={index} className="wf-sk" style={{ height: 88, borderRadius: 14, marginBottom: 12 }} />)}</div>;
  if (failure) return failure.kind === "developer" ? <RailDevError /> : <RailMascotBusy rail="summer" failure={failure} onRetry={() => setRetry((value) => value + 1)} onVisible={() => { void emitRailDegraded(failure, { rail: "summer" }); }} />;
  if (!rails.length) return <p style={{ color: "#A8B0BE", fontSize: 13 }}>No nearby summer options have enough verified evidence yet.</p>;
  return <SummerPicksRails rails={rails} city={city || "Florida"} onOpenPlace={onOpenPlace} />;
}
