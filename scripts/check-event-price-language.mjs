// scripts/check-event-price-language.mjs
//
// THE INCIDENT (2026-10-08). Krush Brau Park Hallows Fall Fest (free admission,
// haunted house and escape room extra, Eventbrite tiers $0 to $116.69) read
// "$0–$117" on its Events card and "From $0 · check fees" on its page, and its
// JSON-LD told search engines price "0". Twenty more rows had a $0 tier that
// was RSVP-only, before-midnight-only or code-only. A $0 tier made the whole
// experience look free.
//
// The law: wording comes from the row's source-supported admission_offer
// (wf_events column, set only from the organizer's own words):
//   free_admission                  -> "Free admission"
//   free_admission_paid_activities  -> "Free admission · paid activities"
//   free_tier_conditions            -> "Free tickets available · conditions apply"
//   paid                            -> "$lo to $hi · check fees" / "From $lo · check fees"
//   unknown or unclassified $0 floor -> "Check ticket price" (or "Check admission")
// The Events card, the event page and the JSON-LD all follow it.
// Everything below is CALLED; nothing is grepped.
import { eventCostSummary, OFFER_WORDING } from "../lib/eventVisitFacts.js";
import { curatedToFeedEvent, eventJsonLd } from "../lib/curatedEvents.js";
import { eventImageIsVenue } from "../lib/eventImageProvenance.js";

let pass = 0;
const fail = [];
const eq = (got, want, msg) => { if (got === want) pass += 1; else fail.push(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const ok = (c, msg) => { if (c) pass += 1; else fail.push(msg); };

const base = {
  event_id: "x", slug: "x-2026", event_name: "Hallows Fall Fest", start_date: "2026-10-24", end_date: "2026-10-24",
  city: "Kissimmee", venue: "Portal Immersion Center", card_hook: "h", event_status: "scheduled", source_tier: 1, verification_confidence: "high",
  official_ticket_url: "https://www.eventbrite.com/e/1991125206091", official_event_url: "https://krushbraupark.com/all-hallows-fest",
  category: "halloween", tags: ["halloween"],
};
const cases = [
  [{ price_min: 0, price_max: 116.69 }, "Check ticket price", "an unclassified $0 floor is not free (the incident row before classification)"],
  [{ price_min: "0", price_max: "116.69" }, "Check ticket price", "…including when PostgREST hands numerics back as strings"],
  [{ price_min: 0, price_max: 116.69, admission_offer: "free_admission_paid_activities" }, "Free admission · paid activities", "free admission with optional paid activities"],
  [{ price_min: 0, price_max: 30.37, admission_offer: "free_tier_conditions" }, "Free tickets available · conditions apply", "a restricted free tier (RSVP, before midnight, promo code)"],
  [{ is_free: true, price_min: 0, price_max: 0, admission_offer: "free_admission" }, "Free admission", "confirmed free admission"],
  [{ is_free: true }, "Free admission", "is_free alone still reads Free admission"],
  [{ price_min: 15, price_max: 125, admission_offer: "paid" }, "$15 to $125 · check fees", "a paid range"],
  [{ price_min: 39, price_max: 39, admission_offer: "paid" }, "From $39 · check fees", "a single paid price"],
  [{ price_min: 0, price_max: 20, admission_offer: "paid" }, "Check ticket price", "a contradictory paid offer with a $0 floor never prints $0"],
  [{ price_min: 18.84, price_max: 74.28 }, "From $18.84 · check fees", "an unclassified real paid floor keeps its number"],
  [{ admission_offer: "unknown" }, "Check ticket price", "unknown price on a ticketed event"],
];
for (const [over, want, msg] of cases) {
  const row = { ...base, ...over };
  eq(eventCostSummary(row), want, "page: " + msg);
  eq(curatedToFeedEvent(row).price, want, "card: " + msg);
}
eq(eventCostSummary({ ...base, official_ticket_url: null, venue: "Golden Ridge Groves farm", event_name: "Fall Festival", admission_offer: "unknown" }), "Check admission", "an admission-style venue with no ticket link says Check admission");
for (const [k, v] of Object.entries(OFFER_WORDING)) ok(!/\$0|From \$0|free entry, extras/i.test(v), `wording for ${k} never prints $0 or the blanket free line`);
ok(!cases.some(([over]) => /\$0\b/.test(eventCostSummary({ ...base, ...over }))), "no case ever prints $0");

// JSON-LD follows the same law.
const ld = (over) => eventJsonLd({ ...base, ...over }).offers || null;
eq(ld({ price_min: 0, price_max: 116.69 })?.price, undefined, "JSON-LD: an unclassified $0 floor publishes no price");
eq(ld({ price_min: 0, price_max: 30, admission_offer: "free_tier_conditions" })?.price, undefined, "JSON-LD: a conditional free tier publishes no price");
eq(ld({ price_min: 0, price_max: 116.69, admission_offer: "free_admission_paid_activities" })?.price, "0", "JSON-LD: free admission publishes 0");
eq(ld({ price_min: 15, price_max: 125, admission_offer: "paid" })?.price, "15", "JSON-LD: a paid floor publishes its price");
ok(ld({ price_min: 0, price_max: 116.69 })?.url, "JSON-LD: the offer still carries the ticket URL");

// Venue photography stays distinguishable: hero_image_kind "venue" marks it.
ok(eventImageIsVenue({ hero_image: "https://mds-assets.marriott.com/x.jpg", hero_image_kind: "venue" }) === true, "a venue hero is marked as venue");
ok(eventImageIsVenue({ hero_image: "https://img.evbuc.com/x", hero_image_kind: "event" }) === false, "an organizer event image is not marked as venue");
eq(curatedToFeedEvent({ ...base, hero_image: "https://mds-assets.marriott.com/x.jpg", hero_image_kind: "venue" }).visitFacts.image_is_venue, true, "the card's visitFacts carry the venue flag");

if (fail.length) {
  console.error(`check-event-price-language: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-event-price-language: OK — ${pass} assertions; eventCostSummary, curatedToFeedEvent().price and eventJsonLd CALLED over ${cases.length} offer shapes (a $0 tier never reads as free on card, page or JSON-LD); venue hero flag carried`);
