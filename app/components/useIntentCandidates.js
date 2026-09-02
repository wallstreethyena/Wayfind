"use client";
// useIntentCandidates — the client half of the /api/intent-candidates fix
// (2026-09-02, Night Out pool-starvation).
//
// WHAT THIS IS FOR. An intent rail composed CLIENT-SIDE from `shown.places`
// (DaypartRail.js) only ever sees rows OTHER home rails already loaded for
// THEIR OWN axis. A rail with no dedicated home-rail pool of its own (Night
// Out today) never sees real inventory, and a strict composer starved of
// candidates prints an honest-looking empty that is not actually honest — see
// app/api/intent-candidates/route.js's header for the full incident.
//
// FAIL-SOFT, ALWAYS. Returns `null` until a real answer lands for the current
// key, and never throws or rejects into the caller. A composer fed `null`
// candidates behaves EXACTLY as it did before this hook existed — merge with
// `mergeCandidates` below, which treats `null`/`[]` identically to "nothing
// to add".
import { useEffect, useRef, useState } from "react";

const DEFAULT_CATS = ["food", "nightlife", "attractions"];

/**
 * center: { lat, lng } | null. No fetch while missing — same as every other
 *   center-gated rail in this file (DateNightRails, FallIntentRails, …).
 * opts.cats: category list for /api/intent-candidates (default food/nightlife/attractions).
 * opts.radiusMi: default 27 (Night Out's own NIGHT_OUT_MAX_MI — pass the
 *   caller's real bound so a change there cannot silently desync from this).
 * opts.active: gate the fetch behind whether the surface is actually open
 *   (mirrors the rest of DaypartRail's "closed drop costs zero requests" rule).
 */
export default function useIntentCandidates(center, opts = {}) {
  const { cats = DEFAULT_CATS, radiusMi = 27, limit = null, active = true } = opts;
  const [places, setPlaces] = useState(null);
  const lat = center && Number.isFinite(center.lat) ? center.lat : null;
  const lng = center && Number.isFinite(center.lng) ? center.lng : null;
  const catsKey = cats.join(",");
  const key = active && lat != null && lng != null
    ? `${lat.toFixed(2)},${lng.toFixed(2)}:${radiusMi}:${catsKey}:${limit || ""}`
    : null;
  // Answered keys never re-fetch — a reopened drop at the same location costs
  // zero requests, same posture as useEditorialHooks' `seen` ref.
  const answeredKey = useRef(null);

  useEffect(() => {
    if (!key || answeredKey.current === key) return;
    let dead = false;
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radiusMi: String(radiusMi), cats: catsKey });
    if (limit) q.set("limit", String(limit));
    fetch("/api/intent-candidates?" + q.toString())
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (dead) return;
        answeredKey.current = key;
        if (body && Array.isArray(body.places)) setPlaces(body.places);
      })
      .catch(() => { /* fail-soft: the caller's client pool is untouched */ });
    return () => { dead = true; };
    // key alone is the real dependency — it already encodes lat/lng/radius/cats/limit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return places;
}

/** PURE. Union any number of place-row arrays (client pool first, inventory
 *  feed after — order matters only for which duplicate's fields win), dedupe
 *  by id/placeId. null/undefined pools are treated as empty, so a caller can
 *  hand this the hook's own `null` "not loaded yet" state with no guard. */
export function mergeCandidates(...pools) {
  const seen = new Set();
  const out = [];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const place of pool) {
      const id = place && (place.id || place.placeId || place.place_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(place);
    }
  }
  return out;
}
