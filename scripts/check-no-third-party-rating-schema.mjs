#!/usr/bin/env node
/**
 * check-no-third-party-rating-schema — Wayfind never marks up someone else's
 * stars as its own structured data.
 *
 * Owner decision, 2026-09-23: "I approve removing Google sourced AggregateRating
 * markup from the five identified structured data surfaces. Keep the visible
 * Google rating and review information users see on the page exactly as it is."
 *
 * Every rating Wayfind shows today comes from Google (Places rating + review
 * count). Google's review-snippet policy asks that aggregate ratings in schema
 * be collected by the marking-up site itself; borrowed third-party ratings are
 * ineligible and can draw a spammy-structured-data manual action. The five
 * surfaces that emitted it (lib/placePage.js, app/eat/[metro]/[cuisine],
 * app/best-beaches/[metro], app/florida/[town], lib/landing.js) now emit none;
 * lib/sponsorPage.js never did.
 *
 * FAILS when any file under app/ or lib/ emits an aggregateRating key or an
 * "AggregateRating" schema type (comments ignored). If Wayfind ever collects
 * its OWN first-party ratings, add that surface to FIRST_PARTY_ALLOWED below
 * with the owner's decision quoted, rather than deleting this check.
 *
 * Also locks the other half of the decision: the VISIBLE rating on the place
 * page must still render, so removing schema never quietly removes what users see.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { placeLocalBusinessLd } from "../lib/placeSchema.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIRST_PARTY_ALLOWED = Object.freeze([]); // none: Wayfind collects no ratings of its own today
let pass = 0;
const fail = (m) => { console.error(`check-no-third-party-rating-schema: FAIL — ${m}`); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}
export function emitsRatingSchema(src) {
  const code = stripComments(src);
  return /["']?aggregateRating["']?\s*:/.test(code) || /["']AggregateRating["']/.test(code);
}

// Self-test: the detector must catch every shape the five surfaces used, and
// must not fire on prose or on the visible rating markup.
ok(emitsRatingSchema('aggregateRating: p.rating != null ? { "@type": "AggregateRating" } : undefined'), "detects a conditional aggregateRating key");
ok(emitsRatingSchema('...(ok ? { aggregateRating: { x: 1 } } : {})'), "detects a spread aggregateRating key");
ok(emitsRatingSchema('{ "aggregateRating": 1 }'), "detects a quoted aggregateRating key");
ok(emitsRatingSchema('const t = { "@type": "AggregateRating", ratingValue: 4 }'), "detects an AggregateRating type on its own");
ok(!emitsRatingSchema('// aggregateRating: removed on purpose\n/* "AggregateRating" */ const a = 1;'), "comments mentioning it do not count");
ok(!emitsRatingSchema('<span>★ {p.rating} ({p.reviews})</span>'), "the visible rating markup does not count");

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(m?js|jsx|ts|tsx)$/.test(name)) files.push(full);
  }
};
walk(join(ROOT, "app"));
walk(join(ROOT, "lib"));
ok(files.length > 100, `scanned a plausible number of source files (got ${files.length})`);

const offenders = files
  .map((f) => relative(ROOT, f))
  .filter((rel) => !FIRST_PARTY_ALLOWED.includes(rel))
  .filter((rel) => emitsRatingSchema(readFileSync(join(ROOT, rel), "utf8")));
ok(offenders.length === 0, `third-party rating markup is back in structured data: ${offenders.join(", ")}. Wayfind's stars are Google's; show them, never mark them up (owner decision 2026-09-23).`);

for (const rel of ["lib/placePage.js", "lib/placeSchema.js", "app/eat/[metro]/[cuisine]/page.js", "app/best-beaches/[metro]/page.js", "app/florida/[town]/page.js", "lib/landing.js"]) {
  ok(!emitsRatingSchema(readFileSync(join(ROOT, rel), "utf8")), `${rel} emits no aggregateRating`);
}

// CALL the real place-page schema builder with a RATED fixture (Bern's, 4.6
// from 9,833 Google reviews): no aggregateRating may come back, and the rest
// of the LocalBusiness object must survive the removal.
{
  const placePageSrc = readFileSync(join(ROOT, "lib/placePage.js"), "utf8");
  ok(/const ld = placeLocalBusinessLd\(p, url\);/.test(placePageSrc), "PlacePage builds its LocalBusiness schema with placeLocalBusinessLd (the function CALLED below)");
  const url = "https://www.gowayfind.com/places/ChIJKQXHdmfDwogRJFCLuT7eJ6I";
  const ld = placeLocalBusinessLd({ name: "Bern's Steak House", rating: 4.6, reviews: 9833, lat: 27.93, lng: -82.48, guideCity: "Tampa", description: "A classic Tampa steakhouse night." }, url);
  const json = JSON.stringify(ld);
  // Positive control: the same probe DOES find the removed shape when it is
  // present, so the absence below is proven, not assumed.
  const withOldShape = JSON.stringify({ ...ld, aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6, reviewCount: 9833 } });
  ok(/AggregateRating|aggregateRating/.test(withOldShape), "positive control: the probe detects the pre-2026-09-23 aggregateRating shape");
  ok(/AggregateRating|aggregateRating/.test('{"aggregateRating":{"@type":"AggregateRating","ratingValue":4.6}}'), "positive control: the probe detects the removed shape as a literal too");
  ok(!("aggregateRating" in ld) && !/AggregateRating|aggregateRating/.test(json), `a rated place emits no aggregateRating in its LocalBusiness schema, got ${json}`);
  ok(ld["@type"] === "LocalBusiness" && ld.name === "Bern's Steak House" && ld["@id"] === url, "the LocalBusiness identity is intact");
  ok(ld.address && ld.address.addressLocality === "Tampa" && ld.geo && ld.geo.latitude === 27.93, "address and geo are intact");
}

// The visible half of the decision: the place page still SHOWS the rating.
const placePage = readFileSync(join(ROOT, "lib/placePage.js"), "utf8");
ok(/p\.rating != null && <span>/.test(placePage) && /p\.reviews\.toLocaleString\(\)/.test(placePage),
  "lib/placePage.js still renders the visible ★ rating and review count");

console.log(`check-no-third-party-rating-schema: OK — ${pass} assertions (${files.length} files scanned; 0 surfaces mark up borrowed stars; the visible place-page rating still renders)`);
