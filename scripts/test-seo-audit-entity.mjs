#!/usr/bin/env node
// scripts/test-seo-audit-entity.mjs — locks the 2026-11-27 SEO audit fixes by
// CALLING the builders (not grepping their source):
//   1. lib/brandEntity.js: one Organization (brand "Wayfind", legal name
//      WAYFIND LLC) with a founder, Florida as its area, owned profiles only,
//      referenced by @id from the WebSite and the /about page.
//   2. lib/townHubSchema.js: /florida/<town> list items carry an address, geo
//      and the /places page when one is indexed, and never a rating.
//   3. lib/openingHoursSchema.js: Google display lines become schema.org
//      "Mo 09:00-17:00"; anything unparseable is dropped, never published.
// Every block also passes lib/jsonLdCheck.js (the site-wide validator).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteGraph, organizationNode, aboutPageLd, ORG_ID, WEBSITE_ID, FOUNDER_ID, BRAND_SAME_AS } from "../lib/brandEntity.js";
import { townTopListLd } from "../lib/townHubSchema.js";
import { schemaOpeningHours } from "../lib/openingHoursSchema.js";
import { placeLocalBusinessLd } from "../lib/placeSchema.js";
import { jsonLdProblems } from "../lib/jsonLdCheck.js";

let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.error(`test-seo-audit-entity: FAIL - ${label}\n  ${e.message}`); process.exit(1); } };
const noProblems = (b) => assert.deepEqual(jsonLdProblems(b), []);

// 1. brand entity
ok("site graph: WebSite + Organization + founder, linked by @id", () => {
  const g = siteGraph();
  const byType = Object.fromEntries(g["@graph"].map((x) => [x["@type"], x]));
  assert.equal(byType.WebSite["@id"], WEBSITE_ID);
  assert.deepEqual(byType.WebSite.publisher, { "@id": ORG_ID });
  assert.equal(byType.Organization["@id"], ORG_ID);
  assert.deepEqual(byType.Organization.founder, { "@id": FOUNDER_ID });
  assert.equal(byType.Person["@id"], FOUNDER_ID);
  assert.equal(byType.Person.name, "Gabriel Pereira");
  noProblems(g);
});
ok("organization: brand name, legal name, Florida, owned profiles only", () => {
  const o = organizationNode();
  assert.equal(o.name, "Wayfind");
  assert.equal(o.legalName, "WAYFIND LLC");
  assert.equal(o.areaServed.name, "Florida");
  assert.ok(o.sameAs.includes("https://www.instagram.com/gowayfind.app/"));
  for (const u of BRAND_SAME_AS) assert.match(u, /^https:\/\/(www\.)?(instagram\.com\/gowayfind\.app\/|crunchbase\.com\/organization\/wayfind-|f6s\.com\/wayfind-florida)/, "sameAs must be a Wayfind-owned profile: " + u);
  assert.ok(!("aggregateRating" in o));
});
ok("the layout and /about render these builders", () => {
  const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  const about = readFileSync(new URL("../app/about/page.js", import.meta.url), "utf8");
  assert.match(lay, /JSON\.stringify\(siteGraph\(\)\)/, "app/layout.js must emit siteGraph()");
  assert.ok(!/name: "WAYFIND LLC", url: SITE_URL/.test(lay), "the old bare Organization is back in app/layout.js");
  assert.match(about, /JSON\.stringify\(aboutPageLd\(\)\)/, "/about must emit aboutPageLd()");
  assert.deepEqual(aboutPageLd().mainEntity, { "@id": ORG_ID });
});

// 2. town hub list
const places = [
  { id: "ChIJA", name: "Robinson Preserve", address: "1704 99th St NW, Bradenton, FL 34209, USA", lat: 27.5, lng: -82.6, rating: 4.8 },
  { id: "ChIJB", name: "Village of the Arts", address: "1113 12th Ave W, Bradenton, FL 34205, USA", lat: 27.49, lng: -82.58 },
  { id: "ChIJC", name: "No Address Spot" },
];
ok("town list: address, geo and indexed /places url; no rating", () => {
  const ld = townTopListLd("Bradenton", places, ["ChIJA"]);
  assert.equal(ld.numberOfItems, 3);
  const [a, b, c] = ld.itemListElement.map((x) => x.item);
  assert.equal(a.address["@type"], "PostalAddress");
  assert.equal(a.address.addressLocality, "Bradenton");
  assert.equal(a.geo.latitude, 27.5);
  assert.equal(a.url, "https://www.gowayfind.com/places/ChIJA");
  assert.equal(b.url, undefined, "a place without an indexed page must not get a url");
  assert.equal(c.address, undefined);
  assert.ok(!JSON.stringify(ld).includes("aggregateRating") && !JSON.stringify(ld).includes("4.8"));
  noProblems(ld);
});
ok("the /florida/<town> page renders townTopListLd", () => {
  const src = readFileSync(new URL("../app/florida/[town]/page.js", import.meta.url), "utf8");
  assert.match(src, /townTopListLd\(t\.title, topTen, placeNavIds\)/);
  assert.match(src, /<h1 style=\{S\.h1\}>Things to do in \{t\.title\}, Florida<\/h1>/);
});

// 3. opening hours
const G = (s) => s.replace(/ AM/g, " AM").replace(/ PM/g, " PM").replace(/ - /g, " – ");
ok("opening hours: Google lines convert to schema.org form", () => {
  assert.deepEqual(schemaOpeningHours([G("Monday: 9:00 AM - 5:00 PM"), "Tuesday: Closed", "Wednesday: Open 24 hours", G("Thursday: 11:00 AM - 2:00 PM, 5:00 - 9:00 PM"), G("Saturday: 5:00 PM - 2:00 AM")]),
    ["Mo 09:00-17:00", "We 00:00-23:59", "Th 11:00-14:00", "Th 17:00-21:00", "Sa 17:00-02:00"]);
});
ok("opening hours: unparseable lines are dropped, never published raw", () => {
  assert.equal(schemaOpeningHours(["Sunday: by appointment", "Hours vary"]), undefined);
  assert.equal(schemaOpeningHours([]), undefined);
  assert.equal(schemaOpeningHours(null), undefined);
});
ok("place LocalBusiness: openingHours is schema.org form, raw display lines gone", () => {
  const ld = placeLocalBusinessLd({ name: "Cafe", address: "1 Main St, Sarasota, FL 34236, USA", lat: 27.3, lng: -82.5, hours: [G("Monday: 9:00 AM - 5:00 PM"), "Tuesday: Closed"] }, "https://www.gowayfind.com/places/x");
  assert.deepEqual(ld.openingHours, ["Mo 09:00-17:00"]);
  assert.ok(!JSON.stringify(ld).includes("AM"));
});

console.log(`test-seo-audit-entity: OK - ${n} checks (brand entity graph, town list items, opening hours)`);
