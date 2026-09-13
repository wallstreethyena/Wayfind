import assert from "node:assert/strict";
import { composeFamilyRail, pageFamilyRail, validFamilyOrigin } from "../lib/familyDayData.js";
import { GET } from "../app/api/family-day/route.js";
import { governedScoreOf } from "../lib/lawfulOrder.js";
import { RAILS } from "../lib/rails.js";
import { dateNightIntentHref } from "../lib/dayparts.js";

const origin = { lat: 27.3, lng: -82.5, radiusMi: 25, rail: "beach" };
const row = (id, overrides = {}) => ({ place_id: id, name: "Public Beach", category: "beach", primary_type: "beach", google_types: ["beach"], lat: 27.3, lng: -82.5, signals: { rating: 4.7, reviews: 1000 }, status: "OPERATIONAL", ...overrides });
const low = row("low", { signals: { rating: 4.5, reviews: 500 } });
const high = row("high", { signals: { rating: 4.9, reviews: 4000 } });
const rows = composeFamilyRail([low, high, high, row("closed", { status: "CLOSED_PERMANENTLY" }), row("excluded", { excluded: true }), row("far", { lat: 30 }), row("unknown", { signals: {} }), row("thin", { signals: { rating: 4.9, reviews: 499 } }), row("wrong", { primary_type: "restaurant" })], origin);
assert.deepEqual(rows.map((p) => p.id), ["high", "low"]);
assert.ok(governedScoreOf(rows[0]) >= governedScoreOf(rows[1]));
assert.equal(rows[0].priceNum, null, "missing admission price must not become free");
assert.equal(rows[0].priceLevel, null);
assert.equal(composeFamilyRail([high], { ...origin, filters: { ages: "baby" } }).length, 0, "unknown age must not satisfy baby filter");
const indoor = row("indoor", { category: "attractions", name: "Kids Arcade", primary_type: "video_arcade", google_types: ["video_arcade"] });
assert.deepEqual(composeFamilyRail([high, indoor], { ...origin, rail: "indoor", indoorOnly: true }).map((p) => p.id), ["indoor"],
  "automatic weather safety uses narrow owned primary identity without weakening explicit evidence filters");
const twentyFive = Array.from({ length: 25 }, (_, index) => ({ id: `p${index}` }));
assert.deepEqual(pageFamilyRail(twentyFive), { places: twentyFive.slice(0, 10), total: 25, page: 0, size: 10, hasMore: true });
assert.deepEqual(pageFamilyRail(twentyFive, { page: 2, size: 10 }), { places: twentyFive.slice(20), total: 25, page: 2, size: 10, hasMore: false },
  "Family paging exposes every earned card instead of imposing the old 24-card ceiling");
assert.equal(validFamilyOrigin(0, 0), false);
assert.equal(validFamilyOrigin(NaN, -82), false);
assert.equal(validFamilyOrigin(27.3, -82.5), true);
const bad = await GET(new Request("https://example.com/api/family-day?lat=0&lng=0&rail=beach"));
assert.equal(bad.status, 400);
const invalidFilters = await GET(new Request("https://example.com/api/family-day?lat=27.3&lng=-82.5&rail=beach&filters=[]"));
assert.equal(invalidFilters.status, 400);
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
{
  const missing = await GET(new Request("https://example.com/api/family-day?lat=27.3&lng=-82.5&rail=beach"));
  assert.equal(missing.status, 503, "missing source is failure, never normal empty");
  assert.equal(missing.headers.get("cache-control"), "no-store");
}
const family = RAILS.find((r) => r.id === "family");
assert.equal(family.opensPage, undefined, "plain tap opens the homepage drop");
assert.equal(family.href, "/family");
const href = new URL(dateNightIntentHref({ href: family.href, cityLabel: "Sarasota", lat: 27.3, lng: -82.5 }), "https://example.com");
assert.equal(href.pathname, "/family");
assert.equal(href.searchParams.get("lat"), "27.3");
assert.equal(href.searchParams.get("lng"), "-82.5");
// Real identity shapes from the owned inventory audit, September 11. Ticket
// evidence must keep qualifying cards discoverable on the Family poster.
const parks = [
  ["ChIJvRBCrN9-54gRGZuuaCLGrQE", "Universal Orlando Resort", 4.7],
  ["ChIJdd8VlMN-54gRoaU0d_zYhfk", "Universal Studios Florida", 4.7],
  ["ChIJvRBCrN9-54gR84ltVW4FZBM", "Universal Islands of Adventure", 4.7],
  ["ChIJa7bjTAB_54gR-M-m-KIOCP0", "Universal Epic Universe", 3.9],
].map(([id, name, rating]) => row(id, { name, category: "attractions", lat: 28.47, lng: -81.47,
  primary_type: "amusement_center", google_types: ["amusement_center", "amusement_park"], signals: { rating, reviews: 10000 } }));
const parkRequest = { lat: 28.47, lng: -81.47, radiusMi: 25, rail: "attractions", filters: { cost: "ticketed" } };
assert.deepEqual(new Set(composeFamilyRail(parks, parkRequest).map((p) => p.id)), new Set(parks.slice(0, 3).map((p) => p.place_id)),
  "ticketed Family poster keeps three qualifying Universal cards; Epic cannot bypass the floor");
assert.equal(composeFamilyRail(parks, { ...parkRequest, filters: { cost: "free" } }).length, 0, "paid parks are not free matches");
assert.equal(composeFamilyRail(parks, { ...parkRequest, indoorOnly: true }).length, 0, "tickets do not prove weather safety");
const aquarium = row("ChIJCXAq5_DEwogRjTPE2xlsZtE", { name: "The Florida Aquarium", category: "attractions", primary_type: "aquarium", google_types: ["aquarium"], lat: 27.944, lng: -82.445 });
assert.equal(composeFamilyRail([aquarium], { lat: 27.95, lng: -82.46, radiusMi: 25, rail: "animals", filters: { cost: "ticketed" } }).length, 1,
  "Tampa animal rail retains its verified ticketed Aquarium");
assert.equal(composeFamilyRail([aquarium], { ...parkRequest, rail: "animals" }).length, 0, "Orlando does not inherit Tampa's Aquarium");
const kennedy = row("ChIJiTHKxDOu4IgRgAU6btoqIsU", { name: "Kennedy Space Center Visitor Complex", category: "attractions",
  primary_type: "visitor_center", google_types: ["visitor_center", "historical_landmark", "amusement_park"], lat: 28.522, lng: -80.682 });
assert.equal(composeFamilyRail([kennedy], { ...parkRequest, radiusMi: 50, rail: "space" }).length, 1,
  "the 50-mile Space poster query includes exact KSC with its published ticket evidence");
assert.equal(composeFamilyRail([kennedy], { ...parkRequest, rail: "space" }).length, 0,
  "default 25-mile Family search does not relabel KSC as near Universal");
console.log("test-family-day-data: PASS (identity, floor, geography, order, dedupe, unknown facts, invalid requests, missing configuration, homepage drop)");
