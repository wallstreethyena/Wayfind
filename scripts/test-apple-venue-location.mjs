#!/usr/bin/env node
// scripts/test-apple-venue-location.mjs — lock lib/appleVenueLocation.js: a
// provider venue point (Ticketmaster ZIP centroid) is replaced by Apple's point
// ONLY when Apple is sure it is the same venue; everything unsure keeps the
// provider point; verified points are never checked. Fake MapKit, no network.
import assert from "node:assert/strict";
import {
  needsAppleVenueCheck, matchAppleVenue, matchVenueAddress, streetParts, applyVenueResolution, metersBetween,
  resolveAppleVenueLocation, clearAppleVenueLocationCacheForTests,
  VENUE_CONFIRM_METERS, VENUE_ADDRESS_MOVE_METERS, VENUE_MAX_CORRECTION_METERS,
} from "../lib/appleVenueLocation.js";

let assertions = 0;
const check = Object.fromEntries(["equal", "deepEqual", "ok", "notEqual", "match"].map((method) => [method, (...args) => {
  assertions += 1;
  return assert[method](...args);
}]));

// The live case (2026-10-22): Ticketmaster's Tropicana Field point is the ZIP
// centroid; the stadium is ~3.5 km north.
const centroid = { lat: 27.737301, lng: -82.646103 };
const stadium = { lat: 27.768188, lng: -82.653408 };
const trop = { id: "tm-venue", name: "Tropicana Field", ...centroid, locationTrust: "provider", street: "One Tropicana Dr.", city: "Saint Petersburg", state: "FL" };
const apple = (id, name, lat, lng, extra = {}) => ({ id, name, coordinate: { latitude: lat, longitude: lng }, ...extra });

// ---- needsAppleVenueCheck -------------------------------------------------
check.equal(needsAppleVenueCheck(trop), true, "a provider venue with a name and a point is checked");
check.equal(needsAppleVenueCheck({ ...trop, locationTrust: "verified" }), false, "a verified point is never checked");
check.equal(needsAppleVenueCheck({ ...trop, locationTrust: undefined }), false, "no trust marker means no check (safe default)");
check.equal(needsAppleVenueCheck({ ...trop, name: "  " }), false, "no name, nothing to ask Apple");
check.equal(needsAppleVenueCheck({ ...trop, lat: 0, lng: 0 }), false, "null island is not a point");
check.equal(needsAppleVenueCheck({ ...trop, lat: "27.7", lng: "-82.6" }), true, "numeric strings count as a point");

// ---- matchAppleVenue: the name rung ---------------------------------------
const exact = matchAppleVenue(trop, [apple("A1", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium", locality: "St. Petersburg" })]);
check.equal(exact.ok, true, "the stadium matches by exact name");
check.ok(exact.driftMeters > 3000 && exact.driftMeters < 4000, `drift is the real 3.5 km (${exact.driftMeters})`);
check.equal(exact.appleId, "A1", "the Apple id travels with the match (never stored here)");
check.equal(matchAppleVenue(trop, [apple("A1", "Tropicana Field", centroid.lat + 0.0005, centroid.lng, { pointOfInterestCategory: "Stadium" })]).driftMeters <= VENUE_CONFIRM_METERS, true, "a close Apple point confirms the provider");
check.equal(matchAppleVenue(trop, [apple("A2", "Tropicana Lanes Bowling", stadium.lat, stadium.lng, { pointOfInterestCategory: "Bowling" })]).ok, false, "a different business sharing one word is refused");
check.equal(matchAppleVenue(trop, [apple("A3", "Tropicana Field", stadium.lat, stadium.lng)]).ok, true, "exact name without an Apple category still passes the strict bar");
check.equal(matchAppleVenue({ ...trop, name: "Spec Martin Stadium" }, [apple("A4", "Spec Martin Municipal Stadium", stadium.lat, stadium.lng)]).ok, false, "0.86 agreement needs a category when Apple gives none");
check.equal(matchAppleVenue({ ...trop, name: "Spec Martin Stadium" }, [apple("A4", "Spec Martin Municipal Stadium", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium", locality: "Saint Petersburg" })]).ok, true, "0.86 agreement with a venue category passes");
check.equal(matchAppleVenue(trop, [apple("A5", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Store" })]).reason, "non-venue-category", "a store with the venue's name is not the venue");
check.equal(matchAppleVenue(trop, [apple("A6", "Tropicana Field", 28.1, -82.65, { pointOfInterestCategory: "Stadium" })]).reason, "too-far", `beyond ${VENUE_MAX_CORRECTION_METERS} m is another place`);
check.equal(matchAppleVenue(trop, [apple("A7", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium", locality: "Tampa" })]).reason, "locality-mismatch", "an exact name in a DIFFERENT city may never move the point (reviewer: Heritage Park, Plant City vs Lakeland)");
check.equal(matchAppleVenue(trop, [apple("A7b", "Tropicana Field", centroid.lat + 0.0005, centroid.lng, { pointOfInterestCategory: "Stadium", locality: "Tampa" })]).ok, true, "but it may confirm a provider point it sits on top of");
check.equal(matchAppleVenue({ ...trop, name: "Heritage Park", city: "Plant City" }, [apple("H1", "Heritage Park", centroid.lat + 0.14, centroid.lng, { pointOfInterestCategory: "Park", locality: "Lakeland" })]).ok, false, "a same-named park in the next town is not this venue");
check.equal(matchAppleVenue({ ...trop, name: "Spec Martin Stadium" }, [apple("A8", "Spec Martin Municipal Stadium", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium", locality: "Tampa" })]).reason, "locality-mismatch", "a looser name in a different city is refused");
check.equal(matchAppleVenue(trop, [apple("A9", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" }), apple("A10", "Tropicana Field", stadium.lat + 0.02, stadium.lng, { pointOfInterestCategory: "Stadium" })]).reason, "ambiguous", "two distinct same-name places: refuse, never guess");
check.equal(matchAppleVenue(trop, [apple("A9", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" }), apple("A11", "Tropicana Field", stadium.lat + 0.0003, stadium.lng, { pointOfInterestCategory: "Stadium" })]).ok, true, "one place listed twice within 60 m is one place");
check.equal(matchAppleVenue(trop, [apple("A9", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" }), apple("A12", "Tropicana Field", stadium.lat + 0.02, stadium.lng, { pointOfInterestCategory: "Stadium", alternateIds: ["A9"] })]).ok, true, "an alternate id collapses to one place");
check.equal(matchAppleVenue(trop, []).reason, "no-results", "no results is reported as such");
check.equal(matchAppleVenue(trop, [{ name: "Tropicana Field", coordinate: { latitude: stadium.lat, longitude: stadium.lng } }]).reason, "no-apple-identity", "a result without an Apple id cannot match");
check.equal(matchAppleVenue({ ...trop, name: "" }, [apple("A1", "Tropicana Field", stadium.lat, stadium.lng)]).reason, "no-venue-name", "no venue name");
check.equal(matchAppleVenue({ ...trop, lat: null }, [apple("A1", "Tropicana Field", stadium.lat, stadium.lng)]).reason, "no-venue-point", "no provider point to measure from");
check.equal(matchAppleVenue({ ...trop, name: "The Park", city: "Fort Lauderdale" }, [apple("B1", "The Park", stadium.lat, stadium.lng, { pointOfInterestCategory: "Nightlife", locality: "Fort Lauderdale" })]).ok, true, "a generic name passes when the city agrees");
check.equal(matchAppleVenue({ ...trop, name: "The Park", city: "Fort Lauderdale" }, [apple("B1", "The Park", stadium.lat, stadium.lng, { pointOfInterestCategory: "Nightlife" })]).reason, "generic-name-needs-locality", "a generic name (shared matcher vocabulary) without an agreeing city is refused");
check.equal(matchAppleVenue({ ...trop, name: "Revolution Live", city: "Ft Lauderdale" }, [apple("B2", "Revolution Live", stadium.lat, stadium.lng, { pointOfInterestCategory: "MusicVenue", locality: "Fort Lauderdale" })]).ok, true, "Ft and Fort are the same city");
check.equal(matchAppleVenue({ ...trop, name: "Au-Rene Theater at the Broward Center" }, [apple("B3", "Au-Rene Theater", stadium.lat, stadium.lng, { pointOfInterestCategory: "Theater", locality: "Saint Petersburg" })]).ok, false, "an extended provider name that Apple shortens is left to the address rung");
check.equal(matchAppleVenue({ ...trop, name: "Ulele" }, [apple("B4", "Ulele Restaurant & Bar", stadium.lat, stadium.lng, { pointOfInterestCategory: "Restaurant", locality: "Saint Petersburg" })]).ok, true, "a branch-suffix name matches with city and category agreeing");
check.equal(matchAppleVenue({ ...trop, name: "Ulele" }, [apple("B4", "Ulele Restaurant & Bar", stadium.lat, stadium.lng, { pointOfInterestCategory: "Restaurant" })]).reason, "prefix-needs-locality", "a branch-suffix name without a city is refused");

// ---- streetParts / matchVenueAddress: the address rung ---------------------
check.deepEqual(streetParts("One Tropicana Dr."), { number: "1", tokens: ["tropicana"], dirs: [], kinds: ["dr"] }, "a spelled-out house number is a number; the road kind is kept apart");
check.deepEqual(streetParts("1010 N W C MacInnes Pl"), { number: "1010", tokens: ["macinnes"], dirs: ["n", "w"], kinds: ["pl"] }, "direction letters and road kinds are kept apart from the road name");
check.deepEqual(streetParts("N Macinnes Pl"), null, "no house number, no address rung");
check.deepEqual(streetParts(""), null, "empty street");
check.deepEqual(streetParts("4802 5th Ave N"), { number: "4802", tokens: ["5th"], dirs: ["n"], kinds: ["ave"] }, "an ordinal street keeps its ordinal, its direction and its kind");
const geo = (sub, thor, lat, lng, locality = "Saint Petersburg") => ({ name: `${sub} ${thor}`, subThoroughfare: sub, thoroughfare: thor, locality, coordinate: { latitude: lat, longitude: lng } });
const addr = matchVenueAddress(trop, [geo("1", "Tropicana Dr", stadium.lat, stadium.lng)]);
check.equal(addr.ok, true, "Apple echoing 1 Tropicana Dr in the same city is the venue address");
check.ok(addr.driftMeters > 3000, "address drift measured from the provider point");
check.equal(matchVenueAddress({ ...trop, street: "1010 N W C MacInnes Pl", city: "Tampa" }, [geo("1010", "N Macinnes Pl", 27.9516, -82.4639, "Tampa")]).ok, true, "a shorter Apple street spelling still shares the road name");
check.equal(matchVenueAddress(trop, [geo("2", "Tropicana Dr", stadium.lat, stadium.lng)]).reason, "house-number-mismatch", "another house number is another building");
check.equal(matchVenueAddress(trop, [geo("1", "Central Ave", stadium.lat, stadium.lng)]).reason, "street-mismatch", "another street is another building");
// Reviewer counterexamples (2026-10-22): qualifiers decide the block on a grid city.
check.equal(matchVenueAddress({ ...trop, street: "400 1st St S" }, [geo("400", "1st St N", stadium.lat, stadium.lng)]).reason, "street-mismatch", "400 1st St S is not 400 1st St N");
check.equal(matchVenueAddress({ ...trop, street: "500 Park Ave" }, [geo("500", "Park Blvd", stadium.lat, stadium.lng)]).reason, "street-mismatch", "Park Ave is not Park Blvd");
check.equal(matchVenueAddress({ ...trop, street: "4802 5th Ave N" }, [geo("4802", "5th St N", stadium.lat, stadium.lng)]).reason, "street-mismatch", "5th Ave N is not 5th St N");
check.equal(matchVenueAddress({ ...trop, street: "400 1st St S" }, [geo("400", "1st Street South", stadium.lat, stadium.lng)]).ok, true, "spelled-out qualifiers are the same block");
check.equal(matchVenueAddress({ ...trop, street: "400 1st St S" }, [geo("400", "1st St", stadium.lat, stadium.lng)]).ok, true, "a side that states no directional is neutral");
check.equal(matchVenueAddress(trop, [geo("1", "Tropicana Dr", stadium.lat, stadium.lng, "Tampa")]).reason, "locality-mismatch", "the same address in another city is refused");
check.equal(matchVenueAddress(trop, [geo("1", "Tropicana Dr", 28.2, -82.65)]).reason, "too-far", "a far geocode is refused");
check.equal(matchVenueAddress(trop, []).reason, "no-results", "no geocoder results");
check.equal(matchVenueAddress({ ...trop, street: "" }, [geo("1", "Tropicana Dr", stadium.lat, stadium.lng)]).reason, "no-numbered-street", "no numbered street, no rung");
check.equal(matchVenueAddress({ ...trop, street: "Tropicana Dr" }, [geo("1", "Tropicana Dr", stadium.lat, stadium.lng)]).reason, "no-numbered-street", "a street without a number cannot be echoed");
check.equal(matchVenueAddress(trop, [{ subThoroughfare: "1", thoroughfare: "Tropicana Dr", locality: "Saint Petersburg" }]).reason, "no-coordinate", "a result without a coordinate is useless");
check.equal(matchVenueAddress(trop, [geo("2", "Tropicana Dr", stadium.lat, stadium.lng), geo("1", "Tropicana Dr", stadium.lat, stadium.lng)]).ok, true, "the first echoing result wins, later in the list");

// ---- applyVenueResolution ---------------------------------------------------
const corrected = applyVenueResolution(trop, { status: "corrected", point: stadium, source: "apple-place", driftMeters: 3503 });
check.deepEqual([corrected.lat, corrected.lng, corrected.locationSource, corrected.name, corrected.street], [stadium.lat, stadium.lng, "apple-place", "Tropicana Field", "One Tropicana Dr."], "the corrected venue keeps every provider fact except the point");
check.equal(trop.lat, centroid.lat, "the provider venue object is not mutated");
check.equal(applyVenueResolution(trop, { status: "kept", point: { lat: NaN, lng: NaN }, source: "provider", driftMeters: 0 }), trop, "a resolution without a point changes nothing");
check.equal(applyVenueResolution(trop, null), trop, "no resolution changes nothing");

// ---- resolveAppleVenueLocation with a fake MapKit ---------------------------
function fakeMapkit({ places = [], geocode = [], searchError = null, geocodeError = null, searchDelay = 0, noSearch = false, noGeocoder = false } = {}) {
  const calls = { search: [], geocode: [] };
  class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } }
  class CoordinateSpan { constructor(latitudeDelta, longitudeDelta) { Object.assign(this, { latitudeDelta, longitudeDelta }); } }
  class CoordinateRegion { constructor(center, span) { Object.assign(this, { center, span }); } }
  class Search {
    constructor(options) { this.options = options; }
    search(query, options) {
      calls.search.push({ query, options });
      if (searchError) return Promise.reject(searchError);
      return new Promise((resolve) => setTimeout(() => resolve({ places }), searchDelay));
    }
  }
  class Geocoder {
    lookup(query, callback, options) {
      calls.geocode.push({ query, options });
      const result = geocodeError ? Promise.reject(geocodeError) : Promise.resolve({ results: geocode });
      result.then((data) => callback(null, data), (error) => callback(error));
      return result;
    }
  }
  const mapkit = { Coordinate, CoordinateSpan, CoordinateRegion, RegionPriority: { Required: "required" } };
  if (!noSearch) mapkit.Search = Search;
  if (!noGeocoder) mapkit.Geocoder = Geocoder;
  return { mapkit, calls };
}
const silence = () => { const warn = console.warn; console.warn = () => {}; return () => { console.warn = warn; }; };

// 1. The live bug: name match corrects the point; one Search, no geocode.
clearAppleVenueLocationCacheForTests();
let kit = fakeMapkit({ places: [apple("A1", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium", locality: "St. Petersburg" })] });
let result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "corrected", "the centroid is corrected");
check.deepEqual(result.point, stadium, "to Apple's stadium point");
check.equal(result.source, "apple-place", "by the place rung");
check.equal(kit.calls.search.length, 1, "exactly one Apple search");
check.equal(kit.calls.geocode.length, 0, "no geocode when the name is sure");
check.equal(kit.calls.search[0].query, "Tropicana Field", "the venue name is the query");
check.equal(kit.calls.search[0].options.regionPriority, "required", "the search is confined to the box around the provider point");
check.ok(Math.abs(kit.calls.search[0].options.region.center.latitude - centroid.lat) < 1e-9, "the box is centered on the provider point");
check.ok(kit.calls.search[0].options.region.span.latitudeDelta <= 0.3, "the box is about 30 km, never a state");
check.equal(Object.isFrozen(result) && Object.isFrozen(result.point), true, "resolutions are immutable");
const again = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: { ...trop } });
check.equal(again, result, "the same venue in the same session is answered from cache");
check.equal(kit.calls.search.length, 1, "no second Apple call for the same venue");

// 2. Apple agrees with the provider: confirmed, point unchanged.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ places: [apple("A1", "Tropicana Field", centroid.lat + 0.0004, centroid.lng, { pointOfInterestCategory: "Stadium" })] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "confirmed", "a close Apple point confirms");
check.deepEqual(result.point, { lat: centroid.lat + 0.0004, lng: centroid.lng }, "and the map draws Apple's point (the start may be a Google/inventory coordinate with no verdict of its own)");
check.equal(result.source, "apple-place", "confirmed names Apple as the source");

// 3. Name refused, address echoes: corrected by the address rung.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ places: [apple("X", "Tropicana Lanes", stadium.lat, stadium.lng, { pointOfInterestCategory: "Bowling" })], geocode: [geo("1", "Tropicana Dr", stadium.lat, stadium.lng)] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "corrected", "the address rung corrects when the name rung cannot");
check.equal(result.source, "apple-address", "by the address rung");
check.deepEqual(result.point, stadium, "to the geocoded building");
check.equal(kit.calls.geocode[0].query, "One Tropicana Dr., Saint Petersburg, FL", "street, city, state is the geocode query");
check.ok(Math.abs(kit.calls.geocode[0].options.coordinate.latitude - centroid.lat) < 1e-9, "the geocode is biased to the provider point");

// 4. Address agrees closely with the provider: confirmed, not moved by noise.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ places: [], geocode: [geo("1", "Tropicana Dr", centroid.lat + 0.001, centroid.lng)] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "confirmed", `an address within ${VENUE_ADDRESS_MOVE_METERS} m confirms`);
check.deepEqual(result.point, { lat: centroid.lat + 0.001, lng: centroid.lng }, "and the map draws Apple's geocoded point");
check.equal(result.source, "apple-address", "confirmed by the address rung names it");

// 5. Nothing sure anywhere: kept, provider point, reasons visible.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ places: [apple("X", "Tropicana Lanes", stadium.lat, stadium.lng, { pointOfInterestCategory: "Bowling" })], geocode: [geo("1", "Central Ave", stadium.lat, stadium.lng)] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "kept", "unsure keeps the provider point");
check.deepEqual(result.point, centroid, "the provider point");
check.equal(result.reason, "name-mismatch/street-mismatch", "both refusals are named");
kit.calls.search.length = 0;
await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(kit.calls.search.length, 0, "a definite refusal is cached for the session");

// 6. Provider errors never reject and never move the point.
clearAppleVenueLocationCacheForTests();
let restore = silence();
kit = fakeMapkit({ searchError: new Error("429 Too Many Requests"), geocode: [geo("1", "Tropicana Dr", stadium.lat, stadium.lng)] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "corrected", "a failed search still lets the address rung answer");
check.equal(result.source, "apple-address", "by the address rung");
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ searchError: new Error("429 Too Many Requests"), geocodeError: new Error("network down") });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "kept", "two failed providers keep the point");
check.equal(result.reason, "rate-limit/network", "enumerated reasons only, never payloads");
kit.calls.search.length = 0;
await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(kit.calls.search.length, 1, "a transient refusal is not cached: a remount asks Apple again");
restore();

// 7. A stalled search is bounded by the deadline and keeps the point.
clearAppleVenueLocationCacheForTests();
restore = silence();
kit = fakeMapkit({ searchDelay: 500, places: [apple("A1", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" })] });
const startedAt = Date.now();
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop, timeoutMs: 40 });
check.ok(Date.now() - startedAt < 400, "the deadline, not the provider, decides how long the map waits");
check.equal(result.status, "kept", "a timeout keeps the provider point");
check.equal(result.reason, "timeout", "and says why");
check.equal(await resolveAppleVenueLocation({ mapkit: fakeMapkit({ places: [apple("A1", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" })] }).mapkit, venue: trop }).then((r) => r.status), "corrected", "a timeout is forgotten, so the next attempt can still correct");
restore();

// 8. Unsupported SDK pieces degrade to the provider point.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ noSearch: true, noGeocoder: true });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop });
check.equal(result.status, "kept", "no Search and no Geocoder: kept");
check.equal(result.reason, "unsupported", "reason unsupported");
clearAppleVenueLocationCacheForTests();
result = await resolveAppleVenueLocation({ mapkit: null, venue: trop });
check.equal(result.status, "kept", "no SDK at all: kept");

// 9. Verified and unnamed venues never reach Apple.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ places: [apple("A1", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" })] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: { ...trop, locationTrust: "verified" } });
check.equal(result.status, "kept", "a verified venue is kept");
check.equal(result.reason, "trusted", "because it is trusted");
check.equal(kit.calls.search.length, 0, "and Apple is never asked");
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: { ...trop, name: "" } });
check.equal(kit.calls.search.length, 0, "no name, no Apple call");

// 10. Concurrent callers share one in-flight lookup.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ searchDelay: 20, places: [apple("A1", "Tropicana Field", stadium.lat, stadium.lng, { pointOfInterestCategory: "Stadium" })] });
const [first, second] = await Promise.all([resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop }), resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: trop })]);
check.equal(first, second, "concurrent callers get the same resolution");
check.equal(kit.calls.search.length, 1, "from one Apple call");

// 11. The geocode rung is skipped without a numbered street.
clearAppleVenueLocationCacheForTests();
kit = fakeMapkit({ places: [], geocode: [geo("1", "Tropicana Dr", stadium.lat, stadium.lng)] });
result = await resolveAppleVenueLocation({ mapkit: kit.mapkit, venue: { ...trop, street: "" } });
check.equal(kit.calls.geocode.length, 0, "no street, no geocode");
check.equal(result.status, "kept", "kept");

check.ok(metersBetween(centroid, stadium) > 3400 && metersBetween(centroid, stadium) < 3600, "haversine sanity on the live pair");
console.log(`test-apple-venue-location: PASS — ${assertions} assertions: provider venues corrected only on a sure Apple name or echoed address, confirmed within ${VENUE_CONFIRM_METERS} m, refused when ambiguous/far/non-venue, kept on error/timeout/unsupported, verified points never queried, one Apple call per venue per session. Fake MapKit; no live coverage claim.`);
