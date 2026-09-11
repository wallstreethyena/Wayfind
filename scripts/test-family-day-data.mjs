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
console.log("test-family-day-data: PASS (identity, floor, geography, order, dedupe, unknown facts, invalid requests, missing configuration, homepage drop)");
