// Guardrail (v6.18): place photos load through our own 30-day cached proxy
// (/api/photo), never a direct places.googleapis.com media URL with an API key
// in the <img> src. That direct load was referrer-restricted and kept failing,
// and it leaked a key into every image request. This locks the fix.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-photos: FAIL — " + m); process.exit(1); };

const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../lib/photoCacheRecovery.js", import.meta.url), "utf8");

// SSRF + identity guard: the free lookup is scoped to the Place ID encoded in the
// requested ref (or the validated ?place= id), never a neighbouring venue.
if (!route.includes("REF_RX") || !route.includes("placeIdFromRef")) fail("photo proxy missing the resource-name or same-place identity guard");

// COMPLIANT PHOTOS (owner decision 2026-10-08, Google Maps Platform terms).
// The old contract (same-place cache recovery, 30-day immutable redirects,
// recovery TTL inheritance) is REMOVED. This block asserts the OPPOSITE
// invariants on comment-stripped source:
//   * the route never reads a Google photo cache (no getRecovery /
//     findSamePlaceCachedPhoto / cacheGet / cacheSet),
//   * the lazy spend boundary awaits ONLY the free permitted/licensed lookup,
//     refuses a `photos` grant when one exists, and still ends in the ledger,
//   * a live Google redirect/JSON is `private, no-store`, never immutable,
//   * only the credited `detail` surface enables Google,
//   * photoCacheRecovery has no live lookup left.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const routeCode = stripComments(route);
const recoveryCode = stripComments(recovery);
{
  const auth = routeCode.match(/authorizeSpend:\s*\(sku\s*=\s*"photos"\)\s*=>\s*getFreePhoto\(\)\.then\(\(free\)\s*=>\s*\{([\s\S]*?)\}\),/);
  const body = auth ? auth[1] : "";
  if (!routeCode.includes("GOOGLE_MAPS_SERVER_KEY") || !auth || !/if \(shut\) return false;/.test(body) || !/if \(sku === "photos" && free\) return false;/.test(body) || !/spendAllowPhotos\(\)/.test(body)) fail("the free permitted/licensed lookup must run at the lazy photo spend boundary (refusing a `photos` grant on a hit) before Google authorization");
  if (/getRecovery|findSamePlaceCachedPhoto|\bcacheGet\b|\bcacheSet\b|photoCacheKey|photoNegativeKey/.test(routeCode)) fail("app/api/photo/route.js reads or writes a Google photo cache — no Google photo name/URL may be stored or read (COMPLIANT PHOTOS)");
  if (!/const GOOGLE_SURFACES = new Set\(\["detail"\]\);/.test(routeCode) || !/googleSurface,/.test(routeCode)) fail("only s=detail may enable the live Google path (GOOGLE_SURFACES must be exactly {detail} and be passed to the resolver as googleSurface)");
  // Every redirect/JSON that carries a live Google photo must be private, no-store.
  if (!/"private, no-store", "google"\)/.test(routeCode) || !/result\.cacheControl \|\|/.test(routeCode)) fail("the live Google JSON answer must be `private, no-store` and the redirect must use the resolver's cacheControl");
}

// The recovery module keeps its exports (callers import them) but may no longer
// look anything up or write: findSamePlaceCachedPhoto must be a constant null.
// Positive control: the stripped probe must still see the export it targets.
{
  const fn = recoveryCode.match(/export async function findSamePlaceCachedPhoto\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/);
  if (!fn) fail("probe blind: findSamePlaceCachedPhoto export not found in lib/photoCacheRecovery.js (positive control)");
  if (fn[2].trim() !== "return null;") fail("findSamePlaceCachedPhoto must be a constant `return null;` (same-place cache recovery is removed)");
  if (/\bcset\b|cacheSet|\bfetch\s*\(|wf_places_cache/.test(fn[2])) fail("findSamePlaceCachedPhoto touches storage");
  if (recoveryCode.includes("placePhotoServe")) fail("photoCacheRecovery recreated a module cycle with placePhotoServe");
}

// The URL builders must point at the proxy, and must NOT ship a keyed googleapis
// media URL to the browser.
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const hotels = readFileSync(new URL("../lib/hotels.js", import.meta.url), "utf8");
// v8.56.31: hotel cards build their photo through lib/hotelImage.js.
const hotelImage = readFileSync(new URL("../lib/hotelImage.js", import.meta.url), "utf8");
if (!google.includes("/api/photo?ref=") || !google.includes("photoProxyURL")) fail("lib/google.js no longer builds photo URLs through /api/photo");
if (!hotels.includes("hotelCardImageSrc(") || !hotelImage.includes("/api/photo?ref=") || !hotelImage.includes("ownedPlacePhotoSrc(")) fail("hotel cards no longer build photo URLs through /api/photo (lib/hotels.js -> lib/hotelImage.js)");
for (const [f, s] of [["lib/google.js", google], ["lib/hotels.js", hotels], ["lib/hotelImage.js", hotelImage]]) {
  if (/googleapis\.com\/v1\/[^"']*\/media[^"']*key=/.test(s)) fail(`${f} still builds a keyed googleapis media URL for the browser — route it through /api/photo`);
}

console.log("check-photos: OK — proxy only; route reads/writes no Google photo cache, free lookup gates the ledger, only s=detail buys Google live, Google answers are private/no-store, same-place recovery is a constant null");
