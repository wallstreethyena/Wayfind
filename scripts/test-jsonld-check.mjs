// scripts/test-jsonld-check.mjs — the build gate for structured data
// (2026-11-27, owner: inject structured JSON-LD site-wide; a test that fails
// the build on invalid schema).
//
//   1. lib/jsonLdCheck.js catches each rule it claims (negative controls) and
//      passes a valid block (positive control);
//   2. every JSON-LD BUILDER a plain node script can call is run on real data
//      or fixtures and must produce zero problems. Inline page builders are
//      covered in production by scripts/check-live-jsonld.mjs (canary.yml).
import assert from "node:assert/strict";
import { jsonLdProblems, htmlJsonLdProblems } from "../lib/jsonLdCheck.js";
import { nyeItemListSchema, nyeModel } from "../lib/newYearsEve.js";
import { allMovieRows, movieJsonLd } from "../lib/moviePages.js";
import { halloweenHauntModel, halloweenHauntSchema } from "../lib/halloweenHauntVault.js";
import { eventJsonLd } from "../lib/curatedEvents.js";

let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.error(`test-jsonld-check: FAIL - ${label}\n  ${e.message}`); process.exit(1); } };
const S = "https://www.gowayfind.com";
const event = { "@context": "https://schema.org", "@type": "Event", name: "Show", startDate: "2026-12-12T19:30:00-05:00", eventStatus: "https://schema.org/EventScheduled",
  location: { "@type": "Place", name: "Arena", address: { "@type": "PostalAddress", addressLocality: "Tampa", addressRegion: "FL", addressCountry: "US" } },
  image: ["https://s1.example.com/a.jpg"], url: S + "/events/tampa/show", offers: { "@type": "Offer", price: "25", priceCurrency: "USD", url: S + "/events/tampa/show" } };
const has = (block, re) => assert.ok(jsonLdProblems(block).some((p) => re.test(p)), `expected a problem matching ${re}: ${JSON.stringify(jsonLdProblems(block))}`);

// ── 1. the validator itself ─────────────────────────────────────────────────
ok("positive control: a complete Event passes", () => assert.deepEqual(jsonLdProblems(event), []));
ok("Event: missing location / text address / no name / bad date", () => {
  has({ ...event, location: undefined }, /no location/);
  has({ ...event, location: { "@type": "Place", name: "Arena", address: "Tampa" } }, /plain text/);
  has({ ...event, name: " " }, /no name/);
  has({ ...event, startDate: "Dec 12" }, /not ISO 8601/);
  has({ ...event, eventStatus: "Scheduled" }, /EventStatusType/);
});
ok("relative and http URLs are caught", () => {
  has({ ...event, image: ["/place-photos/a.jpg"] }, /absolute https/);
  has({ ...event, url: "http://x.example.com/e" }, /absolute https/);
});
ok("offer price needs a currency and a number", () => {
  has({ ...event, offers: { "@type": "Offer", price: "25" } }, /no priceCurrency/);
  has({ ...event, offers: { "@type": "Offer", price: "$25", priceCurrency: "USD" } }, /not a number/);
});
ok("ItemList: numberOfItems must match, positions run 1..n, no duplicate URLs", () => {
  const li = (p, url) => ({ "@type": "ListItem", position: p, name: "x", url });
  has({ "@context": "https://schema.org", "@type": "ItemList", numberOfItems: 596, itemListElement: [li(1, S + "/a")] }, /numberOfItems 596 but 1/);
  has({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: [li(1, S + "/a"), li(3, S + "/b")] }, /position 3, expected 2/);
  has({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: [li(1, S + "/a"), li(2, S + "/a")] }, /duplicate URL/);
});
ok("BreadcrumbList: duplicate crumb URL is caught; nested Events are checked", () => {
  has({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: S }, { "@type": "ListItem", position: 2, name: "Cities", item: S }, { "@type": "ListItem", position: 3, name: "Orlando", item: S + "/culture/orlando" }] }, /duplicate URL/);
  has({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: [{ "@type": "ListItem", position: 1, item: { ...event, location: undefined } }] }, /no location/);
});
ok("a top-level array is checked node by node", () => {
  assert.deepEqual(jsonLdProblems([event, event]), []);
  has([event, { ...event, location: undefined }], /\[1\].*no location/);
});
ok("@graph, @context and invalid JSON in HTML", () => {
  has({ "@context": "https://example.com", "@type": "Thing" }, /@context/);
  const r = htmlJsonLdProblems('<script type="application/ld+json">{"@context":</script><script type="application/ld+json">' + JSON.stringify(event) + "</script>");
  assert.equal(r.count, 2);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /invalid JSON/);
});

// ── 2. real builders ────────────────────────────────────────────────────────
const clean = (label, block) => { const p = jsonLdProblems(block, label); assert.deepEqual(p, [], p.join("\n  ")); };
ok("New Year's Eve ItemList (real listings) is clean", () => {
  const model = nyeModel([], "2026-11-27");
  const cards = model.regions.flatMap((r) => r.cards || []);
  assert.ok(cards.length >= 5, `only ${cards.length} NYE cards: the fixture is not exercising the builder`);
  clean("nye", nyeItemListSchema(cards, { siteUrl: S, name: "NYE", url: S + "/new-years-in-florida" }));
});
ok("every movie page's Movie block is clean", () => {
  const rows = allMovieRows();
  assert.ok(rows.length >= 5);
  for (const { row } of rows) clean("movie " + row.id, movieJsonLd(row));
});
ok("Halloween haunt ItemList (real vault) is clean", () => clean("halloween", halloweenHauntSchema(halloweenHauntModel())));
ok("curated event builder is clean on a complete row", () => {
  clean("curated", eventJsonLd({ event_id: "e1", slug: "e1", event_name: "Fest", event_status: "scheduled", start_date: "2026-12-05", end_date: "2026-12-06", start_time: "10:00", city: "Tampa", state: "FL", venue: "Park", address: "1 Main St", price_min: 10, official_ticket_url: "https://tickets.example.com/t", timezone: "America/New_York" }));
});

console.log(`test-jsonld-check: OK - ${n} checks (validator red/green controls; NYE, ${allMovieRows().length} movies, Halloween and curated event builders clean)`);
