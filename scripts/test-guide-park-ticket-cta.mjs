#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guidePrimaryCta, honestPartnerLabel } from "../lib/guideCta.js";
import { GUIDES } from "../lib/guides.js";

const expected = [
  ["Walt Disney World Resort", "undercover_tourist", "5"],
  ["Universal Epic Universe", "klook", "orlando-klook-universal-admission"],
  ["SeaWorld Orlando", "tiqets", "orlando-hook-seaworld"],
  ["Busch Gardens Tampa Bay", "tiqets", "tampa-hook-busch-gardens"],
  ["LEGOLAND Florida Resort", "tiqets", "winterhaven-hook-legoland"],
];

for (const [place, provider, offerId] of expected) {
  const cta = guidePrimaryCta({ region: "Florida", parkTicketPlace: place, picks: [] });
  assert.equal(cta.exact, true, `${place} must resolve as an exact product`);
  assert.equal(cta.provider, provider, `${place} provider`);
  assert.match(cta.href, /^\/api\/commerce\/go\?/);
  const query = new URLSearchParams(cta.href.split("?")[1]);
  assert.equal(query.get("provider"), provider);
  assert.equal(query.get("offer"), offerId);
  assert.equal(cta.place, place);
  assert.doesNotMatch(cta.href, /^https?:/);
}

for (const place of ["Universal CityWalk Orlando", "Halloween Horror Nights", "Universal Orlando or Walt Disney World"]) {
  const cta = guidePrimaryCta({ region: "Orlando", parkTicketPlace: place, picks: [] });
  assert.equal(cta.kind, "none", `${place} must not fuzzy-match to park admission`);
  assert.equal(cta.href, null);
}

const event = guidePrimaryCta({
  region: "Orlando",
  eventTicket: "hhn-orlando-2026",
  eventTicketPlace: "Halloween Horror Nights",
  parkTicketPlace: "Universal Epic Universe",
  picks: [],
});
assert.equal(event.place, "Halloween Horror Nights", "an event guide keeps its exact event ticket ahead of park admission");

assert.equal(GUIDES["things-to-do-tampa-summer-2026"].parkTicketPlace, undefined,
  "a Tampa roundup with an existing CityPASS primary must keep that broader offer");
assert.equal(GUIDES["things-to-do-in-tampa-florida"].parkTicketPlace, "Busch Gardens Tampa Bay");
assert.equal(GUIDES["things-to-do-orlando-summer-2026"].parkTicketPlace, undefined,
  "a mixed Disney, Universal, and SeaWorld guide must not pick a park winner silently");
assert.equal(GUIDES["best-restaurants-disney-springs"].parkTicketPlace, undefined,
  "a Disney Springs dining guide must not sell park admission");

// 2026-10-07: guides that sell their own picks' exact partner products. A
// TOUR (Viator) is labelled as the tour it is, never "Tickets for <park>".
const guideOffers = [
  ["myakka-river-state-park-guide", "viator", "136885P3", /^Book the Myakka River e-bike safari$/],
  ["things-to-do-in-sarasota-florida", "viator", "136885P3", /^Book the Myakka River e-bike safari$/],
  ["robinson-preserve-bradenton", "viator", "454941P4", /^Book a Robinson Preserve mangrove tour$/],
  ["things-to-do-in-bradenton-florida", "viator", "454941P4", /^Book a Robinson Preserve mangrove tour$/],
  ["tampa-riverwalk-guide", "tiqets", "tampa-hook-museum-of-art", /^Tickets for Tampa Museum of Art$/],
  ["orlando-in-the-rain", "tiqets", "orlando-tonight-sealife", /^Tickets for SEA LIFE Orlando Aquarium$/],
  ["things-to-do-orlando-not-theme-parks", "tiqets", "orlando-hook-boggy-creek", /^Tickets for Boggy Creek Airboat Adventures$/],
  ["things-to-do-in-miami-florida", "tiqets", "miami-hook-wynwood-walls", /^Tickets for Wynwood Walls$/],
];
for (const [slug, provider, offerId, label] of guideOffers) {
  const g = GUIDES[slug];
  assert.ok(g, `${slug} exists`);
  const cta = guidePrimaryCta(g);
  assert.equal(cta.exact, true, `${slug} resolves an exact product`);
  assert.equal(cta.provider, provider, `${slug} provider`);
  assert.equal(new URLSearchParams(cta.href.split("?")[1]).get("offer"), offerId, `${slug} offer`);
  assert.match(cta.label, label, `${slug} label`);
  if (provider === "viator") assert.doesNotMatch(cta.label, /^Tickets/i, `${slug}: a tour is not sold as tickets`);
  const picks = (g.picks || []).map((p) => `${p.name} ${p.appQuery || ""}`).join(" | ");
  assert.ok(picks.toLowerCase().includes(g.parkTicketPlace.split(" ")[0].toLowerCase()), `${slug}: ${g.parkTicketPlace} is one of the guide's own picks`);
}
assert.equal(honestPartnerLabel("Book the Myakka River e-bike safari", "Myakka River State Park"), "Book the Myakka River e-bike safari");
// Owner rule (test-guide-search-as-book): no Crystal River SKU is pinned.
assert.equal(GUIDES["swim-with-manatees-crystal-river"].parkTicketPlace, undefined, "Crystal River stays unpinned");
assert.equal(honestPartnerLabel("Book a great tour", "Myakka River State Park"), null, "a label that does not name the place is refused");
assert.equal(honestPartnerLabel("Book the Myakka River e-bike safari with a local guide today", "Myakka River State Park"), null, "a label too long for the button is refused");
assert.equal(guidePrimaryCta({ region: "Sarasota", parkTicketPlace: "Myakka River State Park", parkTicketLabel: "Book now", picks: [] }).label,
  "Tickets for Myakka River State Park", "a refused label falls back to the generic one");

const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
assert.equal((page.match(/<GuideConversion\b/g) || []).length, 1, "the guide page still paints one conversion module");
const conversion = readFileSync(new URL("../app/guides/[slug]/GuideConversion.js", import.meta.url), "utf8");
assert.match(conversion, /provider:\s*cta\.provider\s*\|\|/,
  "the click event keeps the exact park provider instead of flattening it to deal");
assert.match(conversion, /offer_id:\s*cta\.offerId\s*\|\|/,
  "the click event keeps the exact park offer id");

console.log("test-guide-park-ticket-cta: OK — five exact park offers, eight guide partner products (tours labelled as tours), negative identities, event priority, honest annotations, one conversion module");
