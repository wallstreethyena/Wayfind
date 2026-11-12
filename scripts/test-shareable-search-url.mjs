// Lock: /search?q=... is the shareable spelling of the search the app
// already restores from /?q=... — a bridge, not a second search engine.
//
// Before this route, /search?q=coffee 404'd and a result set could not be
// linked at all. The route (app/search/page.js) hands off through the
// same ShareRedirect the /l share pages use, to the /?q= form home.js
// consumes, with the parameter set lib/searchShareUrl.js owns. These
// assertions drive the helper directly and pin the wiring around it:
// the SEO policy (noindex + canonical to the homepage, never sitemapped),
// the supported state (q + intent + near, capped like their consumers),
// and that the /api/search contract home.js relies on is untouched.
import { readFileSync } from "node:fs";
import {
  searchAppTarget,
  searchSharePath,
  searchShareState,
} from "../lib/searchShareUrl.js";
import { centerAfterGeoDecision, landingSearchFromSearch, landingSkipsDefaultPoster } from "../lib/searchDeepLink.js";
import { resolveSearchIntent } from "../lib/searchIntent.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const eq = (a, b, m) => { n++; if (a !== b) { failn++; console.error(`FAIL: ${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } };

// ── the handoff target is exactly the state home.js already restores ──
eq(searchAppTarget(new URLSearchParams("q=coffee")), "/?q=coffee", "q hands off to /?q=");
eq(searchAppTarget(new URLSearchParams("q=Blue+Bird&intent=place&near=Parrish%2C+FL")), "/?q=Blue+Bird&intent=place&near=Parrish%2C+FL", "guide companions (intent=place, near) ride along");
eq(searchAppTarget(new URLSearchParams("intent=brunch")), "/?intent=brunch", "a bare intent keyword still hands off (home reads it as the query)");
eq(searchAppTarget(new URLSearchParams("")), "/", "bare /search is just the homepage — no empty search runs");
eq(searchAppTarget(new URLSearchParams("q=%20%20")), "/", "a whitespace-only query runs nothing");
eq(searchAppTarget(new URLSearchParams("near=Parrish%2C+FL")), "/", "near= never travels alone — it only steers a search the URL runs");

// unsupported parameters never reach the app state
eq(searchAppTarget(new URLSearchParams("q=coffee&utm_source=x&go=map&lat=1&lng=2")), "/?q=coffee", "tracking, navigation, and coordinate params are dropped, not forwarded");

// caps mirror the consumers (/api/search and home.js both slice at 160)
{
  const long = "a".repeat(300);
  const t = searchAppTarget(new URLSearchParams("q=" + long + "&near=" + long));
  eq(new URL(t, "https://www.gowayfind.com").searchParams.get("q").length, 160, "q is capped at 160 like /api/search");
  eq(new URL(t, "https://www.gowayfind.com").searchParams.get("near").length, 160, "near is capped at 160 like home.js");
}

// the shareable spelling round-trips through the target
for (const qs of ["q=coffee", "q=tacos&near=Tampa%2C+FL", "q=Siesta+Beach&intent=place&near=Sarasota%2C+FL", "intent=date+night"]) {
  const path = searchSharePath(new URLSearchParams(qs));
  ok(path.startsWith("/search?"), `share path is a /search URL for ${qs}`);
  eq(searchAppTarget(new URL(path, "https://www.gowayfind.com").searchParams), searchAppTarget(new URLSearchParams(qs)), `share path restores the same app state for ${qs}`);
}
eq(searchShareState(new URLSearchParams("q=%20coffee%20")).q, "coffee", "queries are trimmed at the bridge, like submitSearch");

// Next's plain-object searchParams shape (app router) works too
eq(searchAppTarget({ q: ["coffee", "tea"], near: "Parrish, FL" }), "/?q=coffee&near=Parrish%2C+FL", "array-valued params take their first value");

// ── the route follows the site's SEO policy exactly ────────────────────
const page = readFileSync(new URL("../app/search/page.js", import.meta.url), "utf8");
ok(page.includes("index: false"), "/search is noindex (infinite query space, check-seo §4)");
ok(page.includes('canonical: "/"'), "/search canonicalizes to the homepage — search is homepage app state");
ok(!/canonical:\s*"https:\/\/www\.gowayfind\.com\/search"/.test(page), "/search must not self-canonical into an indexable hub");
ok(page.includes("ShareRedirect"), "the bridge hands off through the shared ShareRedirect (the /l pattern)");
ok(page.includes("searchAppTarget("), "the handoff target comes from lib/searchShareUrl.js, not a hand-built string");
ok(!page.includes("searchOwnedPlaces") && !page.includes("fetch(") && !page.includes("searchLibrary"), "the bridge runs no search itself — home.js and /api/search keep that contract (prose mentions aside)");
ok(page.includes('href={target}'), "a real anchor carries the handoff for no-JS arrivals and crawlers");

const seo = readFileSync(new URL("./check-seo.mjs", import.meta.url), "utf8");
ok(seo.includes('"search"'), "check-seo holds /search to the utility-page noindex rule");
ok(seo.includes("/search lost its canonical"), "check-seo holds /search to canonical \"/\"");

const sitemap = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");
ok(!sitemap.includes('"/search"') && !sitemap.includes("'/search'"), "/search stays out of the sitemap");

// ── the consumers the bridge feeds are untouched in contract ──────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes("landingSearchFromSearch(window.location.search)"), "home.js still restores q/intent/near from the landing URL");
const api = readFileSync(new URL("../app/api/search/route.js", import.meta.url), "utf8");
ok(api.includes('params.get("q")') && api.includes('params.get("lat")') && api.includes('params.get("lng")'), "/api/search contract unchanged (q/lat/lng in, ranked JSON out)");

// ── /?q= runs without a map center, and beach is not the Christmas poster ──
{
  const beach = landingSearchFromSearch("?q=beach");
  eq(beach && beach.q, "beach", "q=beach is a landing search");
  eq(beach && beach.placeIntent, false, "q=beach is not the place-mode flag");
  ok(landingSkipsDefaultPoster("?q=beach"), "a beach deep link skips the default poster");
  ok(landingSkipsDefaultPoster("?intent=brunch"), "a bare intent keyword skips the default poster");
  ok(!landingSkipsDefaultPoster(""), "a bare homepage still opens the seasonal poster");
  ok(!landingSkipsDefaultPoster("?intent=place"), "intent=place alone is the old mode flag, not a search");
  const denied = centerAfterGeoDecision({ ok: false, outsideFlorida: true, current: null, gotGPS: false, manual: false });
  eq(denied && denied.center.lat, 27.5689, "a refused geo answer adopts the Parrish seed latitude");
  eq(denied && denied.center.lng, -82.4393, "a refused geo answer adopts the Parrish seed longitude");
  eq(denied && denied.name, "Parrish, FL", "a refused geo answer keeps the seed city name");
  eq(denied && denied.device, false, "the seed is not treated as the device location");
  const inside = centerAfterGeoDecision({ ok: true, lat: 27.3364, lng: -82.5307, name: "Sarasota, FL", current: null });
  eq(inside && inside.center.lat, 27.3364, "an in-Florida geo answer replaces the seed");
  eq(inside && inside.device, true, "an in-Florida geo answer is a device location");
  eq(centerAfterGeoDecision({ ok: false, gotGPS: true, current: null }), null, "GPS already won: geo does not move the pin");
  const kept = { lat: 25.76, lng: -80.19 };
  eq(centerAfterGeoDecision({ ok: false, current: kept }), null, "a resolved center is not replaced by the seed");
  const intent = resolveSearchIntent("beach", {});
  eq(intent.id, "beaches", "beach is the beaches phrase, not a Christmas collection");
  ok(intent.result && intent.result.href && !/christmas/i.test(intent.result.href), "the beach result href is not a Christmas page");
  ok(!/christmas/i.test(intent.result.title), "the beach result title is not Showing Florida Christmas");
  const restore = home.slice(home.indexOf("landingSearchFromSearch(window.location.search)"), home.indexOf("landingSearchFromSearch(window.location.search)") + 500);
  ok(restore.includes("submitSearch(pending.q"), "the landing effect calls submitSearch");
  ok(!restore.includes("!center") && !restore.includes("[center]"), "the pending search runner does not wait on center");
  ok(home.includes("centerAfterGeoDecision("), "ipFallback adopts the geo decision, including a refused answer");
  const rail = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  ok(rail.includes("landingSkipsDefaultPoster(window.location.search)") && rail.includes("setSelected(null)"), "a search landing closes the default poster before it can show Christmas");
}

console.log(`test-shareable-search-url: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
