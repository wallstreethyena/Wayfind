// Guardrail (v6.18): place photos load through our own 30-day cached proxy
// (/api/photo), never a direct places.googleapis.com media URL with an API key
// in the <img> src. That direct load was referrer-restricted and kept failing,
// and it leaked a key into every image request. This locks the fix.
import { readFileSync } from "fs";
import { selectSamePlaceCachedPhoto } from "../lib/photoCacheRecovery.js";
const fail = (m) => { console.error("check-photos: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); };

const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
// SSRF guard: only a real Google photo resource name may be proxied.
if (!route.includes("REF_RX")) fail("photo proxy missing the resource-name (SSRF) guard");
if (!route.includes("GOOGLE_MAPS_SERVER_KEY")) fail("photo proxy must fetch with the server key (no referrer restriction)");
// 30-day cache — the Google ToS maximum for newly fetched place content.
if (!route.includes("60 * 60 * 24 * 30")) fail("photo proxy must set a 30-day cache");
if (!/immutable/.test(route)) fail("photo proxy cache should be immutable (a photo ref's bytes never change)");

// v8.56.12 — rotated refs can strand a photo even while Wayfind already owns a
// fresh cached URI for the SAME Place ID. Recovery must happen before a ledger
// grant, must preserve the source row's remaining lifetime, and must never wear
// another venue's cache entry.
const NOW = Date.parse("2026-09-08T20:00:00Z");
const PLACE = "ChIJ1234567890";
const OTHER = "ChIJOTHER99999";
const freshExp = new Date(NOW + 60 * 60 * 1000).toISOString();
const rows = [
  { k: `photo|places/${OTHER}/photos/FOREIGN123|640`, exp: freshExp, v: { uri: "https://lh3.googleusercontent.com/p/foreign" } },
  { k: `photo|places/${PLACE}/photos/EXPIRED123|640`, exp: new Date(NOW - 1000).toISOString(), v: { uri: "https://lh3.googleusercontent.com/p/expired" } },
  { k: `photo|places/${PLACE}/photos/STOCK12345|640`, exp: freshExp, v: { uri: "https://images.pexels.com/photos/123/x.jpg" } },
  { k: `photo|places/${PLACE}/photos/OWN1234567|640`, exp: freshExp, v: { uri: "https://lh3.googleusercontent.com/p/owned" } },
];
const recovered = selectSamePlaceCachedPhoto(rows, { placeId: PLACE, width: 640, now: NOW });
ok(recovered && recovered.uri.includes("/p/owned"), "same-place recovery did not select the fresh owned cache row");
ok(recovered.ref.startsWith(`places/${PLACE}/photos/`), "same-place recovery crossed the Place ID identity boundary");
ok(recovered.ttlSeconds === 3600, `recovery must keep the source row's remaining 1h lifetime (got ${recovered.ttlSeconds})`);
ok(recovered.cacheControl.includes("max-age=3600") && !recovered.cacheControl.includes("2592000"), "recovery minted a fresh 30-day cache lifetime");
ok(selectSamePlaceCachedPhoto(rows, { placeId: OTHER, width: 640, now: NOW })?.uri.includes("foreign"), "positive control: another place can recover only its own row");
ok(!selectSamePlaceCachedPhoto(rows.filter((r) => !r.k.includes(`places/${PLACE}/photos/OWN`)), { placeId: PLACE, width: 640, now: NOW }), "expired/stock/foreign rows must not become a recovery photo");
ok(!selectSamePlaceCachedPhoto(rows, { placeId: PLACE, width: 1200, now: NOW }), "a 1200px request must not silently upscale a 640px recovery row");
ok(selectSamePlaceCachedPhoto(rows, { placeId: PLACE, width: 320, now: NOW })?.width === 640, "a small request may reuse the already-cached 640px card image");

ok(/authorizeSpend:\s*\(\)\s*=>\s*getRecovery\(\)\.then/.test(route), "same-place recovery is no longer attached to the lazy spend boundary");
ok(/getRecovery\(\)\.then\([^\n]*spendAllow\("photos"\)/.test(route), "photo recovery must run before the atomic photo grant");
ok(/"x-wayfind-photo-result":\s*"same-place-cache"/.test(route), "recovered photo responses lost their observable result label");
ok(/"Cache-Control":\s*recovery\.cacheControl/.test(route), "recovered responses must inherit remaining source lifetime, not the default 30 days");
const recoverySource = readFileSync(new URL("../lib/photoCacheRecovery.js", import.meta.url), "utf8");
ok(!/\bcset\b|cacheSet/.test(recoverySource), "same-place recovery must remain read-only and never extend cache lifetime");
ok(/photos0/.test(recoverySource) && /k",\s*"gte\."/.test(recoverySource) && /k",\s*"lt\."/.test(recoverySource), "same-place recovery lost the bounded primary-key range lookup");
ok(!/placePhotoServe/.test(recoverySource), "photoCacheRecovery must not import placePhotoServe and recreate a module cycle");

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
