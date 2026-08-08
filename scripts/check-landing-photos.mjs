// check-landing-photos.mjs — locks the v6.57 repetitive-images fix.
//
// THE INCIDENT: every SSR city landing page (/things-to-do, /restaurants,
// /beaches, /nightlife x [city]) rendered its hero AND every place card from
// ONE static image per CATEGORY (4 files total), because these routes never
// fetch a Google Places photo and landingPhoto()'s only fallback was that one
// static file. Confirmed: every one of the ~20 cities in LANDING_CITIES, and
// every card on every one of those pages, showed the identical photo.
//
// This guard asserts the fix stays wired: lib/landing.js pulls its fallback
// imagery from a city+category-matched stock pool (lib/stockPhoto.js) cycled
// per card, not a single hardcoded file reused everywhere. It does NOT
// require PEXELS_API_KEY to be set (the fail-soft static fallback must keep
// working with no key) — it only asserts the DYNAMIC path exists and is used.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-landing-photos: FAIL — " + m); process.exit(1); };

const landing = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
const stock = (() => { try { return readFileSync(new URL("../lib/stockPhoto.js", import.meta.url), "utf8"); } catch { return null; } })();

if (!stock) fail("lib/stockPhoto.js is missing — the city+category photo pool no longer exists");
if (!/export\s+(async\s+)?function\s+stockPhotoPool/.test(stock)) fail("lib/stockPhoto.js no longer exports stockPhotoPool()");
if (!/export\s+function\s+fromPool/.test(stock)) fail("lib/stockPhoto.js no longer exports fromPool()");
// Fail-soft contract: a missing key must resolve to [] / null, never throw.
if (!/PEXELS_API_KEY/.test(stock)) fail("lib/stockPhoto.js no longer reads PEXELS_API_KEY — key-gating removed?");

if (!/import\s*\{\s*stockPhotoPool\s*,\s*fromPool\s*\}\s*from\s*"\.\/stockPhoto\.js"/.test(landing)) {
  fail("lib/landing.js no longer imports stockPhotoPool/fromPool from ./stockPhoto.js");
}
if (!/stockPhotoPool\(landingPhotoQuery\(city,\s*catSlug\)\)/.test(landing)) {
  fail("lib/landing.js no longer fetches a city+category photo pool per render");
}
// The hero and the per-card <img> must each read from the pool (fromPool(...))
// before falling back to the static LANDING_HERO map, not the static map alone.
// Hero reads index -1 (the pool's LAST entry), deliberately not 0 — card i=0
// below reads index 0, and a shared index there put the hero and the first
// ranked card side by side wearing the identical photo (v1.01, 2026-08-08).
if (!/image=\{\(fromPool\(stockPool, -1\) \|\| \{\}\)\.url \|\| LANDING_HERO\[catSlug\]\}/.test(landing)) {
  fail("landing hero no longer prefers the stock pool over the static per-category image (or reverted to the index-0 hero/card-0 collision)");
}
if (!/landingPhoto\(p, catSlug, stockPool, i\)/.test(landing)) {
  fail("place-card image no longer passes the per-card index into landingPhoto() — cards would repeat one image again");
}
// POOL_SIZE must stay >= 16: rankedFor() renders up to 15 cards
// (pool.slice(0, 15)) PLUS the hero = 16 slots that ideally want distinct
// photos. A regression back to 10 silently reintroduces intra-page repeats
// past card ~10 (confirmed live on /things-to-do/sarasota and /kihei).
const poolSizeMatch = stock.match(/POOL_SIZE\s*=\s*(\d+)/);
if (!poolSizeMatch || Number(poolSizeMatch[1]) < 16) {
  fail("lib/stockPhoto.js POOL_SIZE is below 16 — landing pages need up to 15 cards + 1 hero = 16 distinct photos per page");
}
// landingPhoto() itself must still fall back to the static map when the pool
// is empty (no key / fetch failure) — the fail-soft contract, never a broken <img>.
const fnMatch = landing.match(/function landingPhoto\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!fnMatch || !/LANDING_HERO\[catSlug\]/.test(fnMatch[0])) {
  fail("landingPhoto() no longer falls back to the static LANDING_HERO image when the stock pool is empty");
}

console.log("check-landing-photos: OK — landing pages pull city+category-matched stock photos, cycled per card, with the static image kept only as the no-key/failure fallback");
