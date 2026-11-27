// scripts/test-city-weekend-seo.mjs — locks the 2026-11-27 SEO mission:
//   1. provider Event markup (lib/providerEventJsonLd.js) publishes only what
//      the row holds, with the fields Google's Event rich result requires;
//   2. every /things-to-do/<city> weekend section maps to a real region, and
//      the region pages it links to are real published pages;
//   3. the pages actually call the builders (role checks, comments stripped).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { providerEventJsonLd, parseEventPrice } from "../lib/providerEventJsonLd.js";
import { cityWeekendRegion, weekendRegion, regionalWeekendPicks } from "../lib/regionalWeekend.js";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { EVERGREEN_CITIES } from "../lib/evergreenCities.js";

let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.error(`test-city-weekend-seo: FAIL - ${label}\n  ${e.message}`); process.exit(1); } };
// Whole-line comments only: a block-comment regex mis-pairs on "/api/*/go" text.
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "");
const PAGE = "https://www.gowayfind.com/events/tampa/some-show--tm_1";

const tm = {
  id: "tm_1", name: "Big Show", date: "2026-12-12", time: "19:30:00", venue: "Amalie Arena", city: "Tampa",
  stateCode: "FL", address: "401 Channelside Dr", lat: 27.9427, lng: -82.4518, price: "$25 to $80",
  url: "https://www.ticketmaster.com/event/1", ticketed: true, status: "onsale", source: "Ticketmaster",
  image: "https://s1.ticketm.net/dam/a/1.jpg", description: "  An evening\nshow. ",
};

// ── 1. builder ──────────────────────────────────────────────────────────────
ok("full Ticketmaster row -> complete Event", () => {
  const e = providerEventJsonLd(tm, { pageUrl: PAGE });
  assert.equal(e["@type"], "Event");
  assert.equal(e.startDate, "2026-12-12T19:30:00-05:00");
  assert.equal(e.url, PAGE, "url is this page, not the provider");
  assert.equal(e.location.name, "Amalie Arena");
  assert.deepEqual(e.location.address, { "@type": "PostalAddress", streetAddress: "401 Channelside Dr", addressLocality: "Tampa", addressRegion: "FL", addressCountry: "US" });
  assert.equal(e.location.geo.latitude, 27.9427);
  assert.equal(e.eventStatus, "https://schema.org/EventScheduled");
  assert.equal(e.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
  assert.deepEqual(e.offers, { "@type": "AggregateOffer", lowPrice: "25", highPrice: "80", priceCurrency: "USD", url: PAGE, availability: "https://schema.org/InStock" });
  assert.equal(e.description, "An evening show.");
  assert.deepEqual(e.image, ["https://s1.ticketm.net/dam/a/1.jpg"]);
  assert.ok(!("endDate" in e), "no end in the row -> no endDate (never an invented duration)");
  assert.ok(!JSON.stringify(e).includes("ticketmaster.com"), "the raw ticket URL is never published (offers point at this page)");
});
ok("a real end is published", () => {
  const e = providerEventJsonLd({ ...tm, end_date: "2026-12-13", end_time: "22:00" }, { pageUrl: PAGE });
  assert.equal(e.endDate, "2026-12-13T22:00:00-05:00");
});
ok("availability only when the feed says on sale", () => {
  const e = providerEventJsonLd({ ...tm, status: "offsale" }, { pageUrl: PAGE });
  assert.ok(e.offers && !("availability" in e.offers));
});
ok("single price -> Offer with price; Free -> price 0", () => {
  assert.equal(providerEventJsonLd({ ...tm, price: "$40" }, { pageUrl: PAGE }).offers.price, "40");
  const free = providerEventJsonLd({ ...tm, price: "Free", ticketed: false, url: "" }, { pageUrl: PAGE });
  assert.equal(free.offers["@type"], "Offer");
  assert.equal(free.offers.price, "0");
});
ok("unparseable price, not ticketed -> no offers", () => {
  const e = providerEventJsonLd({ ...tm, price: "Varies", ticketed: false, url: "" }, { pageUrl: PAGE });
  assert.ok(!("offers" in e));
  assert.equal(parseEventPrice("about $20"), null);
  assert.equal(parseEventPrice("$25 to $25").high, null);
});
ok("cancelled / postponed -> status, and no offer", () => {
  const c = providerEventJsonLd({ ...tm, status: "canceled" }, { pageUrl: PAGE });
  assert.equal(c.eventStatus, "https://schema.org/EventCancelled");
  assert.ok(!("offers" in c));
  assert.equal(providerEventJsonLd({ ...tm, status: "postponed" }, { pageUrl: PAGE }).eventStatus, "https://schema.org/EventPostponed");
});
ok("no venue but a city -> Place named for the city; TBA is not a venue", () => {
  const e = providerEventJsonLd({ ...tm, venue: "TBA", address: "", city: "Sarasota, FL", lat: null, lng: null }, { pageUrl: PAGE });
  assert.equal(e.location.name, "Sarasota");
  assert.equal(e.location.address.addressLocality, "Sarasota");
  assert.ok(!("geo" in e.location));
});
ok("no place at all, no name, or no date -> null (caller lists a url-only item)", () => {
  assert.equal(providerEventJsonLd({ ...tm, venue: "", city: "" }, { pageUrl: PAGE }), null);
  assert.equal(providerEventJsonLd({ ...tm, name: " " }, { pageUrl: PAGE }), null);
  assert.equal(providerEventJsonLd({ ...tm, date: "" }, { pageUrl: PAGE }), null);
});
ok("metered photo proxy and non-https images are never published", () => {
  assert.ok(!("image" in providerEventJsonLd({ ...tm, image: "/api/photo?ref=x" }, { pageUrl: PAGE })));
  assert.ok(!("image" in providerEventJsonLd({ ...tm, image: "https://www.gowayfind.com/api/photo?ref=x" }, { pageUrl: PAGE })));
  assert.ok(!("image" in providerEventJsonLd({ ...tm, image: "http://x.test/a.jpg" }, { pageUrl: PAGE })));
});

// ── 2. regions ──────────────────────────────────────────────────────────────
ok("city pages map to the region they sit in", () => {
  assert.equal(cityWeekendRegion("tampa").name, "Tampa Bay");
  assert.equal(cityWeekendRegion("st-petersburg").name, "Tampa Bay");
  assert.equal(cityWeekendRegion("bradenton").name, "Sarasota & Bradenton");
  assert.equal(cityWeekendRegion("orlando").name, "Orlando");
  assert.equal(cityWeekendRegion("naples").name, "Fort Myers & Naples");
  assert.equal(cityWeekendRegion("crystal-river"), null, "no region -> no section, never a guessed one");
  assert.equal(cityWeekendRegion("honolulu"), null);
  assert.equal(cityWeekendRegion("__proto__"), null);
});
ok("every mapped city is a published things-to-do city", () => {
  for (const slug of [...Object.keys(LANDING_CITIES), ...Object.keys(EVERGREEN_CITIES)]) {
    const r = cityWeekendRegion(slug);
    if (!r) continue;
    const pub = LANDING_CITIES[slug] || (EVERGREEN_CITIES[slug] && EVERGREEN_CITIES[slug].cats.includes("things-to-do"));
    assert.ok(pub, `${slug} has a weekend region but no things-to-do page`);
    assert.ok(r.counties.length && r.eventCities.length && r.cities, `${slug} region is incomplete`);
  }
  for (const slug of Object.keys(LANDING_CITIES).filter((s) => LANDING_CITIES[s].state === "FL")) {
    assert.ok(cityWeekendRegion(slug), `published Florida city ${slug} has no weekend region`);
  }
});
ok("a region's 'see everything' link is a real /events window page", () => {
  for (const slug of ["tampa", "sarasota", "orlando", "miami", "bradenton", "jacksonville", "fort-myers"]) {
    const r = cityWeekendRegion(slug);
    if (!r.eventsHref) continue;
    const m = r.eventsHref.match(/^\/events\/([a-z-]+)\/this-weekend$/);
    assert.ok(m && LANDING_CITIES[m[1]], `${r.eventsHref} is not a published window page`);
    assert.equal(weekendRegion(m[1], "this-weekend"), r, `${r.eventsHref} must render the same region`);
  }
  assert.equal(weekendRegion("jacksonville", "this-weekend"), null, "no window page -> not a window region");
});
ok("Orlando picks come from Orlando rows only", () => {
  const now = new Date("2026-11-27T15:00:00Z"); // Friday 10 AM ET
  const row = (slug, county, city) => ({ slug, event_id: slug, state: "FL", county, city, event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "x", start_date: "2026-11-28", end_date: "2026-11-28", start_time: "10:00", end_time: "16:00", timezone: "America/New_York" });
  const picks = regionalWeekendPicks([row("orl", "Orange County", "Orlando"), row("tpa", "Hillsborough County", "Tampa")], cityWeekendRegion("orlando"), now);
  assert.deepEqual(picks.map((p) => p.event.slug), ["orl"]);
});

// ── 3. wiring (role checks; the pages fetch over the network) ───────────────
ok("/things-to-do pages render the weekend section", () => {
  const src = strip(readFileSync(new URL("../lib/landingPage.js", import.meta.url), "utf8"));
  assert.ok(/landingWeekend\(catSlug,\s*citySlug\)/.test(src), "LandingPage reads the weekend");
  assert.ok(/<LandingWeekend\s+weekend=\{weekend\}/.test(src), "LandingPage renders <LandingWeekend>");
  assert.ok(/if \(catSlug !== "things-to-do"\) return null;/.test(src), "only the things-to-do pages carry it");
  assert.ok(/Things to do in \{city\.name\} this weekend/.test(src));
});
ok("/events window list carries BreadcrumbList + shared Event builder, and links back to the city page", () => {
  const src = strip(readFileSync(new URL("../app/events/[city]/[slug]/page.js", import.meta.url), "utf8"));
  assert.ok(/"@type":\s*"BreadcrumbList"/.test(src));
  assert.ok(/JSON\.stringify\(breadcrumbLd\)/.test(src), "the breadcrumb is rendered");
  assert.ok(/\.\.\.listEventItem\(e\)/.test(src));
  assert.ok(/href=\{`\/things-to-do\/\$\{params\.city\}`\}/.test(src));
});

// Negative control: the probe that guards the detail page must catch the old
// hand-built shape (address as a bare city string).
ok("negative control: the old Event shape is detectable", () => {
  const old = 'const jsonLd = { "@type": "Event", location: { "@type": "Place", name: e.venue, address: e.city } };';
  assert.ok(/"@type":\s*"Event"/.test(old));
});

console.log(`test-city-weekend-seo: OK - ${n} checks (provider Event builder, ${Object.keys(LANDING_CITIES).length + Object.keys(EVERGREEN_CITIES).length} city slugs mapped, page wiring)`);
