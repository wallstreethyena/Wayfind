#!/usr/bin/env node
// scripts/check-maps-deferral.mjs — v6.99, P1 homepage speed.
//
// THE INVARIANT: the Maps JS SDK is a FALLBACK, never a boot cost. The owner
// measured ~6.2s DOM-ready with the full maps.googleapis.com stack loading on
// a homepage that is not a map — because the three search functions imported
// the Places library BEFORE trying the server proxy, and reverseGeocode
// pulled the geocoding library on every located first visit. The fix moved
// every importLibrary call behind the proxy attempt. This guard pins the
// ORDER (per function: proxy attempt strictly before importLibrary) so a
// refactor cannot quietly re-eagerize the SDK.
//
// Order is asserted per-FUNCTION SLICE, not per-file — a file-wide indexOf
// would pass with one compliant function and five regressed ones.
import { readFileSync } from "node:fs";
const fail = (m) => { console.error("check-maps-deferral: FAIL — " + m); process.exit(1); };
let pass = 0;
const ok = (c, m) => { if (!c) fail(m); pass++; };

const g = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");

// Positive control: the probe must find the functions it claims to scan.
const fnSlice = (name, next) => {
  const at = g.indexOf("async function " + name);
  if (at < 0) fail("positive control failed: async function " + name + " not found — the probe is scanning the wrong file");
  const end = next ? g.indexOf("async function " + next, at + 1) : g.length;
  return g.slice(at, end > at ? end : g.length);
};

for (const [fn, next] of [["_searchPlaces", "fetchPlaceDetail"], ["_searchNearbyPlaces", "_findPlace"], ["_findPlace", "_searchPlaces"]]) {
  const s = fnSlice(fn, null);
  const proxyAt = s.indexOf("await proxySearch(");
  const sdkAt = s.indexOf('importLibrary("places")');
  ok(proxyAt >= 0, fn + " still tries the server proxy");
  ok(sdkAt >= 0, fn + " keeps the SDK fallback (deleting it breaks proxy outages)");
  ok(proxyAt < sdkAt, fn + " imports the Maps SDK ONLY after the proxy attempt — eager import re-adds the maps bootstrap to every homepage boot");
}

// reverseGeocode: the server proxy is consulted before the SDK path.
{
  const at = g.indexOf("async function _reverseGeocodeUncached");
  ok(at >= 0, "positive control: _reverseGeocodeUncached exists");
  const s = g.slice(at, at + 2500);
  const proxyAt = s.indexOf('"/api/geocode?lat="');
  const sdkAt = s.indexOf('importLibrary("geocoding")');
  ok(proxyAt >= 0, "reverseGeocode consults the shared server proxy first");
  ok(sdkAt >= 0, "reverseGeocode keeps the SDK fallback");
  ok(proxyAt < sdkAt, "reverseGeocode tries the proxy BEFORE the SDK");
}

// The proxy route exists, is cache-headed, and is matcher-guarded (metered).
{
  const route = readFileSync(new URL("../app/api/geocode/route.js", import.meta.url), "utf8");
  ok(/s-maxage/.test(route) && /stale-while-revalidate/.test(route), "/api/geocode responses are edge-cacheable");
  ok(/GOOGLE_MAPS_SERVER_KEY/.test(route), "/api/geocode uses the SERVER key, never the browser key");
  const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
  ok(/"\/api\/geocode",/.test(mw), "/api/geocode is in the middleware matcher — a metered proxy outside the guard is the v6.41 bill bug again");
}

// Events payload: the rail thumb rides beside the hero pick, and the rail
// consumes it (the 1024px-hero-into-110px-card waste the owner measured).
{
  const ev = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8");
  ok(/THUMB_MIN_W = 320/.test(ev) && /thumb: thumb \|\| img/.test(ev), "Ticketmaster events ship a right-sized 16:9 thumb beside the hero image");
  const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
  ok(/event\.thumb \|\| event\.image/.test(home), "the event rail card renders the thumb, not the hero pick");
}

// Third-party gating: Travelpayouts behind first interaction (its own layout
// comment pre-approved this move once verification passed), PostHog at idle.
{
  const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  ok(/tp-em\.com\/NTUwMTYw\.js/.test(layout), "positive control: the Travelpayouts script is still present");
  ok(!/<Script id="travelpayouts-drive" strategy="lazyOnload" src=/.test(layout), "Travelpayouts no longer loads unconditionally");
  ok(/\['pointerdown','keydown','touchstart','scroll'\][\s\S]{0,200}tp-em\.com|tp-em\.com[\s\S]{0,600}pointerdown/.test(layout), "Travelpayouts waits for first interaction (same gate as Stay22)");
  const ph = readFileSync(new URL("../app/components/PostHogProvider.js", import.meta.url), "utf8");
  ok(/requestIdleCallback\(boot/.test(ph) && /setTimeout\(boot/.test(ph), "PostHog inits at idle with a timer fallback, off the image critical path");
}

console.log("check-maps-deferral: OK — " + pass + " assertions (SDK strictly proxy-fallback in 3 search fns + reverse geocode; geocode proxy guarded+cacheable; TM thumbs ship+render; TP/PostHog off the critical path)");
