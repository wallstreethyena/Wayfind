// Guardrail (v6.18): place photos load through our own 30-day cached proxy
// (/api/photo), never a direct places.googleapis.com media URL with an API key
// in the <img> src. That direct load was referrer-restricted and kept failing,
// and it leaked a key into every image request. This locks the fix.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-photos: FAIL — " + m); process.exit(1); };

const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../lib/photoCacheRecovery.js", import.meta.url), "utf8");

// SSRF + identity guard: a recovery is scoped to the Place ID encoded in the
// requested ref (or the validated ?place= id), never a neighbouring venue.
if (!route.includes("REF_RX") || !route.includes("placeIdFromRef") || !recovery.includes("parts.placeId !== placeId")) fail("photo proxy/recovery missing the resource-name or same-place identity guard");

// Server key remains private, and recovery sits on the lazy authorization edge
// BEFORE spendAllow so a cache hit cannot consume a Google grant.
// 2026-09-09: the authorizer is per-SKU (one grant per outbound Google request)
// and photos go through spendAllowPhotos(); recovery still runs first.
{
  const auth = route.match(/authorizeSpend:\s*\(sku\s*=\s*"photos"\)\s*=>\s*getRecovery\(\)\.then\(\(hit\)\s*=>\s*\{([\s\S]*?)\}\),/);
  const body = auth ? auth[1] : "";
  if (!route.includes("GOOGLE_MAPS_SERVER_KEY") || !auth || !/if \(hit \|\| shut\) return false;/.test(body) || !/spendAllowPhotos\(\)/.test(body)) fail("same-place recovery must run at the lazy photo spend boundary before Google authorization");
}

// Newly fetched media may get 30d, but a recovered old ref must inherit only
// the source row's remaining lifetime.
if (!route.includes("60 * 60 * 24 * 30") || !route.includes('"Cache-Control": recovery.cacheControl') || !recovery.includes("expMs - now")) fail("photo cache lifetime contract changed — recovery must not mint a fresh 30-day TTL");

// Recovery is free, fresh, Google-hosted, read-only and uses the existing
// primary-key interval on wf_places_cache. Keep this one structural assertion
// bundled so the guard registry remains stable at seven assertions.
if (!/immutable/.test(route) || !recovery.includes("GOOGLE_USER_CONTENT_RX") || !recovery.includes("expMs <= now") || /\bcset\b|cacheSet/.test(recovery) || !recovery.includes("photos0") || !recovery.includes('u.searchParams.append("k", "gte." + lower)') || !recovery.includes('u.searchParams.append("k", "lt." + upper)') || recovery.includes("placePhotoServe")) fail("same-place cache recovery lost freshness/host/read-only/bounded-query guarantees or recreated a module cycle");

// The URL builders must point at the proxy, and must NOT ship a keyed googleapis
// media URL to the browser.
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const hotels = readFileSync(new URL("../lib/hotels.js", import.meta.url), "utf8");
if (!google.includes("/api/photo?ref=") || !google.includes("photoProxyURL")) fail("lib/google.js no longer builds photo URLs through /api/photo");
if (!hotels.includes("/api/photo?ref=")) fail("lib/hotels.js no longer builds photo URLs through /api/photo");
for (const [f, s] of [["lib/google.js", google], ["lib/hotels.js", hotels]]) {
  if (/googleapis\.com\/v1\/[^"']*\/media[^"']*key=/.test(s)) fail(`${f} still builds a keyed googleapis media URL for the browser — route it through /api/photo`);
}

console.log("check-photos: OK — proxy only; same-place cache recovery is identity-scoped, read-only, pre-spend, and TTL-honest");
