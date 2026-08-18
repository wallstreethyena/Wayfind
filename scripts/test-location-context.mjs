#!/usr/bin/env node
/**
 * test-location-context — one city per navigation; no leftover Sarasota
 * slugs; /p/{id} and /best-of keep their own URLs.
 *
 * THE LIVE BUGS (2026-08-18):
 *   WF-001  Boston stored + /best-of?city=New%20York → NY heading/affiliates,
 *           Boston organic places.
 *   WF-002  After a named non-Sarasota city, footer/promo/rails still emitted
 *           /restaurants/sarasota, /things-to-do/sarasota, /best-beaches/manatee-sarasota.
 *   WF-003  /p/{id} redirected to /?place= and collapsed to /; canonical was "/".
 *   WF-005  /best-of?city=New%20York inherited rel=canonical to the homepage.
 *
 * Law is EXECUTED against lib/locationHonesty.js. Call sites are pinned so a
 * helper nobody calls cannot go green.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveLocationContext,
  locationSurface,
  categoryNavHref,
  categoryNavHrefs,
  landingSlugFromLoc,
  placePath,
  placeCanonical,
  bestOfCanonical,
} from "../lib/locationHonesty.js";
import { railHref } from "../lib/dayparts.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const BOSTON = { lat: 42.3601, lng: -71.0589, loc: "Boston, MA" };
const NY_LAT = 40.7128;

/* ── WF-001 executed law ──────────────────────────────────────────────── */
const split = resolveLocationContext({
  urlCity: "New York",
  urlLat: NaN,
  urlLng: NaN,
  stored: BOSTON,
});
ok(split.city === "New York", "URL city New York wins over stored Boston");
ok(Math.abs(split.lat - NY_LAT) < 0.02 && Math.abs(split.lng - -74.006) < 0.02,
  "organic origin is New York, not the leftover Boston pin");
ok(split.source === "url+origin", "mismatched stored coords are not borrowed");

const surf = locationSurface(split);
ok(surf.headingCity === "New York", "heading names New York");
ok(surf.offersCity === "New York", "offers resolve for New York");
ok(Math.abs(surf.resultsOrigin.lat - NY_LAT) < 0.02, "results origin is New York");
ok(Math.abs(surf.weatherOrigin.lat - NY_LAT) < 0.02, "weather origin is New York");
ok(surf.links.bestOf === "/best-of?city=New%20York", "generated links carry New York");
ok(!/boston/i.test(JSON.stringify(surf)), "the surface does not mention Boston");

const same = resolveLocationContext({
  urlCity: "Boston",
  stored: BOSTON,
});
ok(same.city === "Boston" && Math.abs(same.lat - BOSTON.lat) < 1e-6,
  "stored Boston is used when the URL city is also Boston");

const storedOnly = resolveLocationContext({ stored: BOSTON });
ok(storedOnly.city === "Boston" && storedOnly.source === "stored",
  "no URL city → stored city may fill");

const urlCoords = resolveLocationContext({
  urlCity: "New York",
  urlLat: 40.758,
  urlLng: -73.9855,
  stored: BOSTON,
});
ok(urlCoords.source === "url" && Math.abs(urlCoords.lat - 40.758) < 1e-6,
  "URL lat/lng win when present; stored Boston is ignored");

/* ── WF-002 executed law ──────────────────────────────────────────────── */
for (const city of ["New York", "Boston"]) {
  ok(landingSlugFromLoc(city) === null, `${city} is not a landing market`);
  const hrefs = categoryNavHrefs(city);
  ok(hrefs.length === 0, `${city} emits no category hrefs`);
  ok(!hrefs.some((h) => /sarasota|manatee-sarasota/i.test(h)),
    `${city} does not leak a Sarasota slug`);
  ok(categoryNavHref("restaurants", city) === null, `${city} restaurants href is null`);
}
ok(categoryNavHrefs("").length === 0 && categoryNavHrefs("you").length === 0,
  "unknown / empty city → no href (header rule)");
ok(categoryNavHref("restaurants", "Orlando") === "/restaurants/orlando",
  "Orlando still gets its own restaurants page");
ok(categoryNavHref("best-beaches", "Orlando") === "/best-beaches/orlando",
  "Orlando beaches stay orlando, not manatee-sarasota");
ok(categoryNavHref("restaurants", "Sarasota") === "/restaurants/sarasota",
  "Sarasota hrefs are legal only when the named city is Sarasota");
ok(railHref({ href: "/restaurants" }, "other", null) === null,
  "railHref without a city does not invent /restaurants/sarasota");
ok(railHref({ href: "/best-beaches" }, "fl", null) === null,
  "railHref without a city does not invent /best-beaches/manatee-sarasota");
ok(railHref({ href: "/restaurants" }, "other", "orlando") === "/restaurants/orlando",
  "an explicit Orlando slug is kept");

/* ── WF-003 / WF-005 executed law ─────────────────────────────────────── */
ok(placePath("ChIJtest") === "/p/ChIJtest", "placePath is /p/{id}");
ok(placeCanonical("ChIJtest", "https://www.gowayfind.com") === "https://www.gowayfind.com/p/ChIJtest",
  "place canonical is self /p/{id}");
ok(placePath("") === null && placeCanonical(null, "https://www.gowayfind.com") === null,
  "empty place id has no path");
ok(bestOfCanonical("New York", "https://www.gowayfind.com") === "https://www.gowayfind.com/best-of?city=New%20York",
  "best-of canonical is city-aware");
ok(bestOfCanonical("", "https://www.gowayfind.com") === "https://www.gowayfind.com/best-of",
  "best-of without a city is still /best-of, not /");

/* ── call-site pins ───────────────────────────────────────────────────── */
const INTENT = strip(read("app/components/IntentPageClient.js"));
ok(/resolveLocationContext\(/.test(INTENT) && /locationSurface\(/.test(INTENT),
  "IntentPageClient builds loc through resolveLocationContext + locationSurface");
ok(!/city = city \|\| \(c\.loc \|\| ""\)\.split/.test(INTENT),
  "the stored-city fill that split NY heading from Boston coords is gone");

const PAGE = strip(read("app/page.js"));
ok(!/href="\/things-to-do\/sarasota"/.test(PAGE) && !/href="\/restaurants\/sarasota"/.test(PAGE)
  && !/href="\/beaches\/sarasota"/.test(PAGE) && !/href="\/best-beaches\/manatee-sarasota"/.test(PAGE),
  "HomeProof promo no longer emits Sarasota category hrefs on the shared ISR homepage");

const LAY = strip(read("app/layout.js"));
ok(!/href="\/restaurants\/sarasota"/.test(LAY) && !/href="\/beaches\/sarasota"/.test(LAY)
  && !/href="\/things-to-do\/sarasota"/.test(LAY),
  "shared footer does not emit Sarasota category hrefs (page is not the Sarasota city page)");

const RAIL = strip(read("app/components/DaypartRail.js"));
ok(/href=\{href\}/.test(RAIL), "DaypartRail still emits a real <a href={href}> when a city exists");
ok(!/\|\| "#"/.test(RAIL), "DaypartRail no longer falls back to # (or a Sarasota slug) when the city is unknown");

const PLACE = strip(read("app/p/[id]/page.js"));
ok(/placeCanonical\(/.test(PLACE) || /canonical:/.test(PLACE) && /\/p\//.test(PLACE),
  "/p/[id] declares a self-canonical");
ok(/initialPlaceId/.test(PLACE), "/p/[id] renders Home on /p/{id} instead of bouncing to /");
ok(!/ShareRedirect/.test(PLACE) && !/\/\?place=/.test(PLACE),
  "/p/[id] no longer location.replace's to /?place=");
ok(/index:\s*false/.test(PLACE), "/p/[id] stays noindex (share/app-state)");

const HOME = strip(read("app/home.js"));
ok(/initialPlaceId/.test(HOME) && /pathname\.match\(\/\^\\\/p\\\//.test(HOME),
  "Home opens a place from /p/{id} without collapsing the path");

const BEST = strip(read("app/best-of/page.js"));
ok(/bestOfCanonical\(/.test(BEST) && /alternates:/.test(BEST),
  "/best-of generateMetadata sets a city-aware self-canonical");

for (const r of ["events", "coupons", "map"]) {
  const s = read(`app/${r}/page.js`);
  ok(s.includes(`canonical: "https://www.gowayfind.com/${r}"`),
    `/${r} self-canonical is untouched`);
}

if (fail.length) {
  console.error(`test-location-context: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-location-context: ${pass} assertions passed (WF-001 split-brain, WF-002 leftover slugs, WF-003 /p identity, WF-005 best-of canonical)`);
