"use client";

import { useEffect, useState } from "react";
import { hasPlacePhotoRef, selectPlacePhotoRef } from "../../lib/placePhoto.js";

// Shared for the lifetime of the page: the same venue can appear in a newly
// opened rail after being removed from an earlier one, and must not trigger the
// same cached search twice.
const RESOLVED = new Map();
const keyOf = (p) => String(p && (p.place_id || p.id) || "");

async function fillOne(place, center, signal) {
  const id = keyOf(place);
  if (!id || RESOLVED.has(id)) return;
  const name = String(place.name || place.title || "").trim();
  if (!name) { RESOLVED.set(id, null); return; }
  const params = new URLSearchParams({
    q: name,
    lat: String(center.lat),
    lng: String(center.lng),
    radius: "16000",
    n: "5",
  });
  try {
    const r = await fetch("/api/places/search?" + params.toString(), { signal });
    const body = r.ok ? await r.json() : null;
    const ref = selectPlacePhotoRef(body && body.places, place);
    RESOLVED.set(id, ref || null);
  } catch (e) {
    if (!signal.aborted) RESOLVED.set(id, null);
  }
}

export default function useMissingPlacePhotos(places, center, active = true) {
  const [, redraw] = useState(0);
  const candidates = [];
  const seen = new Set();
  for (const p of Array.isArray(places) ? places : []) {
    const id = keyOf(p);
    const own = p && (p.photo_ref || p.photoRef);
    if (!id || seen.has(id) || hasPlacePhotoRef(own) || RESOLVED.has(id)) continue;
    seen.add(id);
    candidates.push(p);
  }
  const candidateKey = candidates.map(keyOf).join("|");

  useEffect(() => {
    if (!active || !candidateKey || !center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    const ctrl = new AbortController();
    let index = 0;
    const worker = async () => {
      while (!ctrl.signal.aborted && index < candidates.length) {
        const place = candidates[index++];
        await fillOne(place, center, ctrl.signal);
        if (!ctrl.signal.aborted) redraw((n) => n + 1);
      }
    };
    // At most two cache/Google requests in flight. Missing imagery heals
    // progressively without turning opening a shelf into a request burst.
    Promise.all([worker(), worker()]).catch(() => {});
    return () => ctrl.abort();
    // candidateKey is the exact work list; callbacks/array identities are not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, candidateKey, center && center.lat, center && center.lng]);

  return (place) => {
    const own = place && (place.photo_ref || place.photoRef);
    return hasPlacePhotoRef(own) ? own : (RESOLVED.get(keyOf(place)) || null);
  };
}
