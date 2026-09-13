import assert from "node:assert/strict";
import { composeFamilyDayEvents, familyEventEvidence, isFamilyDayEvent } from "../lib/familyDayEvents.js";

const NOW = new Date("2026-09-10T16:00:00Z");
const ORIGIN = { lat: 27.5, lng: -82.5 };
let pass = 0;
const ok = (condition, message) => { assert.ok(condition, message); pass++; };
const event = (overrides = {}) => ({
  event_id: "family-fest", event_series_id: "family-fest",
  event_name: "Family Arts Festival", short_title: "Family Arts Festival",
  slug: "family-arts-festival-2026", start_date: "2026-10-10", end_date: "2026-10-10",
  start_time: "10:00:00", event_status: "scheduled", venue: "River Park", city: "Bradenton", state: "FL",
  lat: 27.5, lng: -82.5, category: "festival", subcategory: "arts-festival",
  tags: ["family-friendly", "outdoor", "shaded"], audience: ["families", "kids"], minimum_age: 0,
  is_free: true, price_band: "free", duration_recommendation: "Half day", parking_tip: "Use the east lot.",
  card_hook: "Hands-on art and live performances fill the park.", source_tier: 1,
  verification_confidence: "high", last_verified_at: "2026-09-08T12:00:00Z",
  editorial_score: 8, uniqueness_score: 7, popularity_score: 6,
  source_url: "https://example.org/family-fest", link_ok: true, ...overrides,
});

ok(isFamilyDayEvent(event(), { now: NOW }), "a verified upcoming kids/families row qualifies");
ok(!isFamilyDayEvent(event({ audience: ["adults"] }), { now: NOW }), "adult-only audience does not enter Family Day");
ok(!isFamilyDayEvent(event({ tags: ["horror", "haunted-house"], audience: ["families"] }), { now: NOW }), "generic family audience cannot relabel a scary haunt");
ok(isFamilyDayEvent(event({ tags: ["haunted-house", "not-so-scary"], audience: ["families", "kids"] }), { now: NOW }), "explicit child-safe evidence admits a child-friendly haunt");
ok(!isFamilyDayEvent(event({ tags: ["adults-only", "family-friendly"], audience: ["families", "kids"] }), { now: NOW }), "textual adults-only evidence always vetoes child-safe words");
ok(!isFamilyDayEvent(event({ event_name: "Family evening 21+", tags: ["family-friendly"], audience: ["families", "kids"] }), { now: NOW }), "textual 21+ evidence vetoes child-safe words");
ok(!isFamilyDayEvent(event({ event_name: "Family evening 18+", tags: ["family-friendly"], audience: ["families", "kids"] }), { now: NOW }), "textual 18+ evidence vetoes child-safe words");
ok(!isFamilyDayEvent(event({ minimum_age: 21 }), { now: NOW }), "a 21+ constraint always excludes");

const facts = familyEventEvidence(event({ is_free: false, price_band: "$$" }));
ok(facts.cost === "ticketed" && facts.duration_recommendation === "half-day", "known paid cost and duration become filter facts");
ok(facts.ages.includes("all-ages") && facts.weather_fit.includes("outdoor") && facts.weather_fit.includes("shaded"), "verified age and weather facts survive in shared vocabulary");
ok(facts.parking_info === true && facts.parking_tip === "Use the east lot.", "a parking tip is exposed as information, not a promise of parking");
ok(facts.sources.length === 1 && facts.verifiedAt === "2026-09-08T12:00:00Z", "filter evidence keeps its provenance");
ok(!familyEventEvidence(event({ minimum_age: 7 })).ages.includes("kid"), "minimum age seven cannot claim the whole 5–9 kid band");

const edgeLat = ORIGIN.lat + (10 / 69);
const inside = event({ event_id: "inside", event_series_id: "inside", slug: "inside", lat: edgeLat - 0.002 });
const outside = event({ event_id: "outside", event_series_id: "outside", slug: "outside", lat: edgeLat + 0.002 });
const radius = composeFamilyDayEvents([outside, inside, event({ event_id: "null", event_series_id: "null", slug: "null", lat: null, lng: null })], { ...ORIGIN, radiusMi: 10, now: NOW });
ok(radius.events.length === 1 && radius.events[0].id === "wfc:inside", "the ten-mile circle excludes outside and null-coordinate rows");
ok(radius.events[0].href === "/florida-events/inside" && radius.events[0].dest === radius.events[0].href, "cards use the actual Florida event route");
ok(Number.isFinite(radius.events[0].distMi) && radius.events[0].distanceMi === radius.events[0].distMi, "cards carry both distance aliases");
ok(radius.events[0].rating == null && radius.events[0].reviews == null && radius.events[0].wfScore == null, "cards do not invent place ratings or scores");

const filtered = composeFamilyDayEvents([event()], { ...ORIGIN, radiusMi: 25, filters: { cost: "free", weather: "outdoor", logistics: "parking" }, now: NOW });
ok(filtered.events.length === 1, "matching verified filters retain the event");
ok(composeFamilyDayEvents([event({ tags: [] })], { ...ORIGIN, radiusMi: 25, filters: { weather: "indoor" }, now: NOW }).events.length === 0, "unknown weather excludes");
ok(composeFamilyDayEvents([event()], { ...ORIGIN, radiusMi: 25, filters: { logistics: "reservation" }, now: NOW }).events.length === 0, "unknown reservation evidence excludes");

const many = Array.from({ length: 15 }, (_, index) => event({ event_id: `event-${index}`, event_series_id: `event-${index}`, slug: `event-${index}`, editorial_score: index }));
const capped = composeFamilyDayEvents(many, { ...ORIGIN, radiusMi: 50, now: NOW });
ok(capped.events.length === 12 && capped.matched === 15 && capped.more === true, "payload is capped at 12 and reports omitted matches");
for (const bad of [9, 20, 60]) {
  assert.throws(() => composeFamilyDayEvents([], { ...ORIGIN, radiusMi: bad, now: NOW }), /exactly 10, 25, or 50/); pass++;
}

console.log(`test-family-day-events: OK — ${pass} assertions`);
