#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guidePrimaryCta } from "../lib/guideCta.js";
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

const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
assert.equal((page.match(/<GuideConversion\b/g) || []).length, 1, "the guide page still paints one conversion module");
const conversion = readFileSync(new URL("../app/guides/[slug]/GuideConversion.js", import.meta.url), "utf8");
assert.match(conversion, /provider:\s*cta\.provider\s*\|\|/,
  "the click event keeps the exact park provider instead of flattening it to deal");
assert.match(conversion, /offer_id:\s*cta\.offerId\s*\|\|/,
  "the click event keeps the exact park offer id");

console.log("test-guide-park-ticket-cta: OK — five exact park offers, negative identities, event priority, honest annotations, one conversion module");
