// Guardrail (v6.18): place photos load through our own 30-day cached proxy
// (/api/photo), never a direct places.googleapis.com media URL with an API key
// in the <img> src. That direct load was referrer-restricted and kept failing,
// and it leaked a key into every image request. This locks the fix.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-photos: FAIL — " + m); process.exit(1); };

const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
// SSRF guard: only a real Google photo resource name may be proxied.
if (!route.includes("REF_RX")) fail("photo proxy missing the resource-name (SSRF) guard");
if (!route.includes("GOOGLE_MAPS_SERVER_KEY")) fail("photo proxy must fetch with the server key (no referrer restriction)");
// 30-day cache — the Google ToS maximum for cached place content.
if (!route.includes("60 * 60 * 24 * 30")) fail("photo proxy must set a 30-day cache");
if (!/immutable/.test(route)) fail("photo proxy cache should be immutable (a photo ref's bytes never change)");

// The URL builders must point at the proxy, and must NOT ship a keyed googleapis
// media URL to the browser.
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const hotels = readFileSync(new URL("../lib/hotels.js", import.meta.url), "utf8");
if (!google.includes("/api/photo?ref=") || !google.includes("photoProxyURL")) fail("lib/google.js no longer builds photo URLs through /api/photo");
if (!hotels.includes("/api/photo?ref=")) fail("lib/hotels.js no longer builds photo URLs through /api/photo");
for (const [f, s] of [["lib/google.js", google], ["lib/hotels.js", hotels]]) {
  if (/googleapis\.com\/v1\/[^"']*\/media[^"']*key=/.test(s)) fail(`${f} still builds a keyed googleapis media URL for the browser — route it through /api/photo`);
}

console.log("check-photos: OK — photos load via the 30-day cached /api/photo proxy; no keyed media URLs reach the browser");
