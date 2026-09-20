import assert from "node:assert/strict";
import { searchQueryMeta, localCitySuggestions, createSearchAttempt } from "../lib/searchExperience.js";
import { LANDING_CITIES } from "../lib/landingCities.js";

for (const query of ["EPCOT", "  Sarasota,   FL ", "7-Eleven", "Studio 54", "St. Armands Circle", "Siesta Key"]) {
  const meta = searchQueryMeta(query);
  assert.equal(meta.query_kind, "text", query);
  assert.equal(meta.query_redacted, false, query);
  assert.equal(meta.q, query.trim().replace(/\s+/g, " "));
  assert.equal(meta.query_length, query.length);
}
for (const query of ["123 Main Street, Sarasota, FL", "12A Main St", "12-14 Ocean Drive", "Home at 123 Main Street", "PO Box 1234"]) {
  assert.equal(searchQueryMeta(query).q, "[address]", query);
  assert.equal(searchQueryMeta(query).query_kind, "address", query);
}
for (const query of ["person@example.com", "+1 (941) 555-1234", "9415551234", "555-1234", "https://example.com/private", "www.example.com", "example.com/private"]) {
  assert.equal(searchQueryMeta(query).q, "[private query]", query);
  assert.equal(searchQueryMeta(query).query_kind, "contact", query);
}
assert.equal(searchQueryMeta("x".repeat(100)).q.length, 80);
assert.equal(searchQueryMeta(null).q, "");
// Redaction must inspect the full query, including sensitive data after clipping.
assert.equal(searchQueryMeta("x".repeat(100) + " person@example.com").q, "[private query]");

for (const [key, city] of Object.entries(LANDING_CITIES)) {
  const match = localCitySuggestions(`${city.name}, ${city.state}`);
  assert.equal(match.length, 1);
  assert.equal(match[0].placeId, `city:${key}`);
  assert.equal(match[0].city.lat, city.lat);
  assert.equal(match[0].city.lng, city.lng);
  assert.equal(match[0].city.isArea, true);
}
for (const query of ["Orl", "ORLANDO, FL", "Orlando Florida", "Orlando,FL,USA"]) {
  assert.equal(localCitySuggestions(query)[0]?.placeId, "city:orlando", query);
}
assert.equal(localCitySuggestions("Ranch")[0]?.placeId, "city:lakewood-ranch");
assert(localCitySuggestions("Key").some((city) => city.placeId === "city:siesta-key"));
assert(localCitySuggestions("l").length <= 5);
for (const query of ["Orlando, California", "Orlando CA", "Miami, OH", "Venice Italy", "Sarasota Memorial Hospital", "", null]) {
  assert.deepEqual(localCitySuggestions(query), [], String(query));
}

const events = [];
let clock = 100;
const attempt = createSearchAttempt((...args) => events.push(args), "123 Main Street", { id: "test-attempt", now: () => clock });
assert.equal(events.length, 1);
assert.equal(events[0][0], "search");
assert.equal(events[0][1], null);
assert.equal(attempt.id, "test-attempt");
assert.equal(events[0][2].q, "[address]");
clock = 145;
assert.equal(attempt.finish("unavailable", { reason: "timeout", q: "overwrite", search_id: "overwrite", duration_ms: 999, private_value: "person@example.com", nested: { raw: "123 Main Street" } }), true);
assert.equal(attempt.finish("place_opened"), false);
assert.equal(events.length, 2);
assert.equal(events[1][0], "search_outcome");
assert.equal(events[1][2].search_id, "test-attempt");
assert.equal(events[1][2].q, "[address]");
assert.equal(events[1][2].outcome, "unavailable");
assert.equal(events[1][2].duration_ms, 45);
assert.equal(events[1][2].reason, "timeout");
assert.equal(events[1][2].private_value, "[private query]");
assert.doesNotMatch(JSON.stringify(events), /123 Main Street|person@example\.com/);
assert.equal(events[1][2].nested, undefined);
const direct = [];
createSearchAttempt((...args) => direct.push(args), "EPCOT", { id: "direct-query" }).finish("place_opened", { place_id: "verified-place", count: 1 });
assert.equal(direct[0][2].q, "EPCOT");
assert.equal(direct[1][2].place_id, "verified-place");
assert.equal(direct[1][2].count, 1);
assert.doesNotThrow(() => createSearchAttempt(() => { throw new Error("analytics offline"); }, "Orlando").finish("city_changed"));
console.log("test-search-experience: OK — safe query metadata, local city identity, and exactly one terminal outcome per attempt");
