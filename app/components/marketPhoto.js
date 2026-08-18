"use client";

// app/components/marketPhoto.js — THE LAST RUNG of the card photo ladder.
//
// v8.13.3 (owner, 2026-08-18, on a map card rendering an empty media column:
// "I don't want any of the place cards not to have an image"). The ladder for
// every place-card surface is now:
//
//   1. the row's own Google photoRef / photo_ref  (/api/photo, verified venue)
//   2. an explicit `photo` URL the caller resolved (map pin healing, #789)
//   3. THIS — a real, city+category-matched stock photo via /api/market-photo
//      (server-side Pexels, cget/cset-cached ~21 days in lib/stockPhoto.js)
//   4. the monogram, ONLY while (3) is in flight or after it failed
//
// Rung 3 is the same mechanism the Coupons screen has shipped for market-level
// cards since v1.00 (2026-08-08) — this module lifts that local hook into a
// shared one so IconicPlaceCard, home.js's PlaceCard and RailCard resolve the
// no-photo case identically instead of three drifting copies. HONESTY LINE:
// a stock photo is scene-setting, not venue photography — the query is the
// CATEGORY + CITY, never the venue name, so it cannot pretend to be the
// venue's own storefront. The venue-truthful rungs (1–2) always win when they
// exist.
//
// Module-scope Map, not localStorage: a handful of distinct (category, city)
// queries per tab lifetime; the durable layer is the server cache.
import { useEffect, useState } from "react";

const _cache = new Map();

/**
 * @param {string|null} query  "beach Sarasota", "restaurant Bradenton" — or
 *   null/"" to disable (caller already has a real photo; no fetch happens).
 * @returns {string|null} a usable image URL, or null (caller keeps monogram)
 */
export function useMarketPhotoFallback(query) {
  const q = query && String(query).trim() ? String(query).trim() : null;
  const [url, setUrl] = useState(() => (q && _cache.has(q) ? _cache.get(q) : null));
  useEffect(() => {
    if (!q || _cache.has(q)) { setUrl(q ? _cache.get(q) || null : null); return undefined; }
    let cancelled = false;
    fetch("/api/market-photo?q=" + encodeURIComponent(q))
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((data) => {
        const u = (data && data.url) || null;
        _cache.set(q, u);
        if (!cancelled) setUrl(u);
      })
      .catch(() => { _cache.set(q, null); if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [q]);
  return url;
}

/** The query the ladder uses: category + city — scene-truthful, never the
 *  venue's name (a stock photo must not impersonate venue photography). */
export function marketPhotoQuery(category, city) {
  const parts = [category, city].map((s) => String(s || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
