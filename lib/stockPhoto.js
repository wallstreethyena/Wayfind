// lib/stockPhoto.js — v1.00
// Free, license-safe stock photography for the SSR city landing pages
// (lib/landing.js: /things-to-do, /restaurants, /beaches, /nightlife).
//
// THE BUG THIS FIXES: those four route families never fetch Google Places
// photos (withPhotos is paid-route-only — see the comment above searchOnce()
// in lib/landing.js), so every place's photoRef is always null on them.
// landingPhoto() fell back to ONE static image PER CATEGORY — the same four
// files (orlando-roller-coaster-portrait.jpg, date-night-dining-hero.jpg,
// night-out.jpg, beach-adobestock-216195684.jpeg) reused for the hero AND
// every single place card, on EVERY one of the ~20 cities in LANDING_CITIES.
// A visitor on /things-to-do/sarasota saw the identical stock photo repeated
// 10-15 times down the page — and it's the exact same file Tampa, Orlando,
// and every other city's page also shows. Confirmed via source read
// 2026-08-08; not city-specific, this hit every landing page site-wide.
//
// THE FIX: Pexels (pexels.com/api) — free with no cost ceiling risk the way
// Google Places Photos is a billed SKU (the reason withPhotos stayed paid-
// route-only), curated professional ("premium") library, hotlinking allowed
// by license without mandatory attribution (we still carry photographer
// credit through the pool for anywhere the UI wants to surface it). Query is
// CITY + STATE + CATEGORY so Sarasota's beaches page pulls real Sarasota-area
// beach photography instead of a generic stand-in, and a POOL of several
// photos (not one) is cached per city+category so the cards on ONE page also
// differ from each other, not just across cities.
//
// Fails soft everywhere: no key, quota, or network failure -> [] -> the
// caller (lib/landing.js) keeps rendering its pre-existing static fallback.
// Never a broken <img>, never a build failure, never a crash.
import { cget, cset, DAY } from "./serverCache.js";

const TTL = 21 * DAY; // stock imagery doesn't go stale; TTL just rotates variety periodically
const POOL_SIZE = 10;

function pexelsKey() {
  return (process.env.PEXELS_API_KEY || "").trim();
}

export function stockPhotosConfigured() {
  return !!pexelsKey();
}

// One Pexels search -> up to POOL_SIZE landscape photo URLs + credit info,
// durable-cached (shared Supabase cache, same table every other server-side
// list in this app rides) so repeat ISR renders never re-hit the API.
export async function stockPhotoPool(query) {
  const key = pexelsKey();
  if (!key || !query) return [];
  const ck = "wfstock1|" + String(query).toLowerCase().trim();
  try {
    const cached = await cget(ck);
    if (cached && Array.isArray(cached.v)) return cached.v;
  } catch (e) {}
  try {
    const r = await fetch(
      "https://api.pexels.com/v1/search?query=" + encodeURIComponent(query) +
        "&per_page=" + POOL_SIZE + "&orientation=landscape",
      { headers: { Authorization: key }, next: { revalidate: 86400 } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const pool = photos
      .filter((p) => p && p.src && p.src.large)
      .map((p) => ({
        url: p.src.large,
        alt: p.alt || "",
        credit: p.photographer || null,
        creditUrl: p.photographer_url || null,
      }));
    if (pool.length) { try { await cset(ck, pool, TTL); } catch (e) {} }
    return pool;
  } catch (e) { return []; }
}

// Deterministic, stable pick by index — the SAME city+category+index always
// resolves to the same photo while the cached pool is unchanged, so a photo
// never swaps under a returning visitor between ISR revalidations.
export function fromPool(pool, index) {
  if (!Array.isArray(pool) || !pool.length) return null;
  return pool[((index % pool.length) + pool.length) % pool.length];
}
