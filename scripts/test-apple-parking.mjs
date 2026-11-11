#!/usr/bin/env node
import assert from "node:assert/strict";
import { createParkingSearch, hasParkingCoordinate, parkingDirectionsUrl, parkingMapsUrl, parkingMapRegion } from "../lib/appleParking.js";
import { mapFailureReason } from "../lib/mapDiagnostics.js";

let assertions = 0;
const check = Object.fromEntries(["equal", "deepEqual", "ok", "rejects"].map((method) => [method, (...args) => {
  assertions += 1;
  return assert[method](...args);
}]));
const venue = { lat: 27.3, lng: -82.5 };
check.equal(parkingMapRegion(null), null, "unknown venues cannot create a map frame");
check.deepEqual(parkingMapRegion(venue), { center: venue, latitudeDelta: 0.018, longitudeDelta: 0.018 }, "loading and empty parking keep the immediate venue surroundings");
const framingPoints = [{ lat: 27.302, lng: -82.506 }, { lat: 27.298, lng: -82.494 }];
const framingSnapshot = JSON.stringify(framingPoints);
const frame = parkingMapRegion(venue, framingPoints);
check.ok(frame.latitudeDelta < 0.03 && frame.longitudeDelta < 0.03, "nearby lots never inherit a city-wide discovery camera");
for (const point of [venue, ...framingPoints]) check.ok(Math.abs(point.lat - frame.center.lat) <= frame.latitudeDelta / 2 && Math.abs(point.lng - frame.center.lng) <= frame.longitudeDelta / 2, "the padded frame contains the actual venue and every parking coordinate");
check.equal(JSON.stringify(framingPoints), framingSnapshot, "framing does not mutate provider facts");
check.equal(parkingMapRegion(venue, [venue]).latitudeDelta, 0.008, "coincident points retain useful street context");
const dateline = parkingMapRegion({ lat: 10, lng: 179.999 }, [{ lat: 10.001, lng: -179.999 }]);
check.ok(dateline.longitudeDelta < 0.01 && Math.abs(dateline.center.lng) > 179, "nearby parking across the date line never frames the whole world");
check.ok(parkingMapRegion({ lat: 89.999, lng: 0 }, [{ lat: 90, lng: 0 }]).center.lat <= 90 - 0.004, "polar framing remains within legal region bounds");
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const place = (id, meters, name = `Garage ${id}`) => ({
  id, name, coordinate: { latitude: venue.lat + meters / 111195.0802335, longitude: venue.lng },
});
function fakeMapkit(steps) {
  const requests = [];
  const filters = [];
  let constructors = 0;
  class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } }
  class PointsOfInterestSearch {
    constructor() { constructors += 1; }
    search(options) {
      requests.push(options);
      const step = steps.shift();
      if (typeof step === "function") return step(options);
      return Promise.resolve(step);
    }
  }
  return {
    mapkit: {
      Coordinate, PointsOfInterestSearch,
      PointOfInterestCategory: { Parking: "Parking" },
      PointOfInterestFilter: { including(categories) { filters.push(categories); return { including: categories }; } },
    },
    requests, filters, get constructors() { return constructors; },
  };
}

for (const point of [venue, { lat: "27.3", lng: "-82.5" }, { latitude: 0, longitude: 5 }, { lat: 5, lng: 0 }, { coordinate: { latitude: 90, longitude: -180 } }]) {
  check.equal(hasParkingCoordinate(point), true, "valid numeric and boundary coordinates are accepted");
}
for (const point of [null, {}, { lat: null, lng: 5 }, { lat: "", lng: 5 }, { lat: " ", lng: 5 }, { lat: false, lng: 5 }, { lat: 0, lng: 0 }, { lat: Infinity, lng: 1 }, { lat: 91, lng: 5 }, { lat: 5, lng: -181 }, { lat: "unknown", lng: 5 }]) {
  check.equal(hasParkingCoordinate(point), false, "missing or invalid coordinates cannot become a parking center");
}

const parking = { lat: 27.301, lng: -82.502 };
const drive = new URL(parkingDirectionsUrl(parking, venue));
check.equal(drive.origin, "https://maps.apple.com", "directions stay on Apple Maps");
check.equal(drive.searchParams.get("daddr"), "27.301,-82.502", "Drive ends at the selected parking");
check.equal(drive.searchParams.get("dirflg"), "d", "Drive uses driving directions");
check.equal(drive.searchParams.has("saddr"), false, "Drive lets Apple Maps use the current location");
const walk = new URL(parkingDirectionsUrl(parking, venue, "walk"));
check.equal(walk.searchParams.get("saddr"), "27.301,-82.502", "Walk starts at selected parking");
check.equal(walk.searchParams.get("daddr"), "27.3,-82.5", "Walk ends at the venue");
check.equal(walk.searchParams.get("dirflg"), "w", "Walk uses walking directions");
check.equal(parkingDirectionsUrl(null, venue), "", "invalid destinations cannot produce a plausible directions URL");
check.equal(parkingDirectionsUrl(parking, null, "walk"), "", "walking needs a valid venue");
check.equal(parkingDirectionsUrl(parking, venue, "fly"), "", "unsupported direction modes do not silently become driving");

const initial = fakeMapkit([{ places: [place("far", 700), place("close", 100), place("middle", 300), place("four", 400), place("five", 500), place("six", 600), place("square-corner", 1000)] }]);
const service = createParkingSearch({ mapkit: initial.mapkit, venue });
check.equal(initial.constructors, 0, "creating the service makes no on-demand request");
const first = service.search();
check.equal(service.search(), first, "concurrent callers share the pending promise");
const result = await first;
check.equal(initial.requests.length, 1, "three valid nearby results stop the attempt after one request");
check.equal(initial.requests[0].radius, 805, "the first wire request covers half a mile using whole meters");
check.deepEqual(initial.requests[0].center, new initial.mapkit.Coordinate(27.3, -82.5), "search is anchored at the venue");
check.deepEqual(initial.filters, [["Parking"]], "the provider receives the parking-only filter");
check.ok(initial.requests[0].signal instanceof AbortSignal, "modern MapKit gets an abort signal");
check.deepEqual(result.places.map((p) => p.id), ["close", "middle", "four", "five", "six"], "only the five closest radial results survive ranking");
check.equal(result.radiusMeters, 804.672, "the response reports the radius actually searched");
check.ok(Math.abs(result.places[0].distanceMeters - 100) < 0.01, "distance is a measured straight-line distance in meters");
check.ok(result.places.every((p) => p.mapKind === "parking"), "parking has its own marker kind");
check.deepEqual(Object.keys(result.places[0]).sort(), ["distanceMeters", "id", "lat", "lng", "mapKind", "name"], "provider results do not claim availability, prices, or walking time");
check.equal(await service.search(), result, "a completed result is reused within its venue instance");
check.equal(initial.requests.length, 1, "result reuse avoids another provider call");
check.ok(Object.isFrozen(result) && Object.isFrozen(result.places) && Object.isFrozen(result.places[0]), "callers cannot corrupt a shared cached result");

const expanded = fakeMapkit([
  { places: [place("one", 200), place("one", 100), place("same-location", 100, "Garage one"), place("out", 850), { name: "Bad", coordinate: { latitude: null, longitude: -82.5 } }] },
  { places: [place("one", 100), place("outer", 1200), place("middle", 600), place("out-of-circle", 1800)] },
]);
const expandedResult = await createParkingSearch({ mapkit: expanded.mapkit, venue }).search();
check.deepEqual(expanded.requests.map((request) => request.radius), [805, 1610], "fewer than three unique usable nearby results expand exactly once using whole wire meters");
check.deepEqual(expandedResult.places.map((p) => p.id), ["one", "middle", "outer"], "duplicates, malformed coordinates, and out-of-radius results cannot inflate the count");
check.equal(expandedResult.radiusMeters, 1609.344, "the expanded result reports one mile");
check.equal(expanded.requests[1].center.latitude, venue.lat, "expansion keeps the same venue center");
check.equal(expanded.requests[0].signal, expanded.requests[1].signal, "one attempt shares its abort signal across both requests");

const facility = fakeMapkit([{ places: [
  { ...place("address", 25), formattedAddress: "1 Garage Lane, Sarasota, FL", pointOfInterestCategory: "Parking", price: "free", openingHours: "24h", availableSpaces: 50 },
  { ...place("restaurant", 5), pointOfInterestCategory: "Restaurant" },
  place("b", 40), place("c", 50),
] }]);
const facilityResult = await createParkingSearch({ mapkit: facility.mapkit, venue }).search();
check.equal(facilityResult.places[0].address, "1 Garage Lane, Sarasota, FL", "the guide preserves the provider's facility address");
check.ok(!facilityResult.places.some(p => p.id === "restaurant"), "an explicitly wrong category cannot become parking even when geographically closest");
check.ok(!("price" in facilityResult.places[0]) && !("openingHours" in facilityResult.places[0]) && !("availableSpaces" in facilityResult.places[0]), "unverified operational claims are never promoted into the guide");
const pinLink = new URL(parkingMapsUrl({ ...parking, name: "A & B <Garage>" }));
check.equal(pinLink.searchParams.get("ll"), "27.301,-82.502", "facility details use the selected facility point");
check.equal(pinLink.searchParams.get("q"), "A & B <Garage>", "facility names are URL encoded without changing identity");
const nearbyLink = new URL(parkingMapsUrl(venue, true));
check.equal(nearbyLink.searchParams.get("q"), "parking", "the SDK-independent escape route searches parking");
check.equal(nearbyLink.searchParams.get("ll"), "27.3,-82.5", "external discovery is anchored on the venue, not the visitor city");
check.equal(parkingMapsUrl({ lat: 91, lng: 0 }, true), "", "bad coordinates never produce a misleading discovery link");

// Reproduce the strict wire boundary independently of the result boundary.
// The SDK accepts JS numbers and serializes their decimals unchanged; the
// provider can reject that request before returning any parking information.
const wholeMeters = fakeMapkit([options => {
  if (!Number.isSafeInteger(options.radius)) return Promise.reject(new Error("HTTP 400: fractional wire radius"));
  return Promise.resolve({ places: [place("inside-half", 804.6), place("outside-half", 804.9), place("a", 20), place("b", 40)] });
}]);
const wholeMetersResult = await createParkingSearch({ mapkit: wholeMeters.mapkit, venue }).search();
check.equal(wholeMeters.requests.length, 1, "whole-meter primary results do not require fallback or expansion");
check.deepEqual(wholeMetersResult.places.map(p => p.id), ["a", "b", "inside-half"], "wire rounding cannot admit a place beyond the original half-mile circle");
check.equal(wholeMetersResult.radiusMeters, 804.672, "the visible result boundary remains exactly half a mile");
const wholeExpansion = fakeMapkit([
  { places: [place("inner", 100)] },
  options => {
    if (!Number.isSafeInteger(options.radius)) return Promise.reject(new Error("HTTP 400: fractional wire radius"));
    return Promise.resolve({ places: [place("inside-mile", 1609.3), place("outside-mile", 1609.6)] });
  },
]);
const wholeExpansionResult = await createParkingSearch({ mapkit: wholeExpansion.mapkit, venue }).search();
check.deepEqual(wholeExpansion.requests.map(request => request.radius), [805, 1610], "both primary radii remain integral");
check.deepEqual(wholeExpansionResult.places.map(p => p.id), ["inner", "inside-mile"], "wire rounding cannot admit a place beyond the original one-mile circle");
check.equal(wholeExpansionResult.radiusMeters, 1609.344, "the expanded visible boundary remains exactly one mile");

const empty = fakeMapkit([{ places: [] }, { places: [] }]);
check.deepEqual(await createParkingSearch({ mapkit: empty.mapkit, venue }).search(), { places: [], radiusMeters: 1609.344 }, "a valid empty provider response is an ordinary empty result");
check.equal(empty.requests.length, 2, "even an empty provider never exceeds the two-request budget");
const outside = fakeMapkit([{ places: [place("outside", 2000)] }, { places: [place("outside", 2000)] }]);
check.equal((await createParkingSearch({ mapkit: outside.mapkit, venue }).search()).places.length, 0, "valid but distant responses yield truthful radial emptiness");
const unnamedId = fakeMapkit([{ places: [place(null, 10), place(null, 20, "Second"), place(null, 30, "Third")] }]);
check.ok((await createParkingSearch({ mapkit: unnamedId.mapkit, venue }).search()).places[0].id.startsWith("parking:"), "places without provider IDs get a stable coordinate-based identifier");

for (const malformed of [undefined, {}, { places: null }, { places: [null, { name: "No coordinate" }] }]) {
  const fake = fakeMapkit([malformed]);
  await check.rejects(createParkingSearch({ mapkit: fake.mapkit, venue }).search(), { code: "PARKING_MALFORMED" }, "malformed provider output is not rendered as no nearby parking");
  check.equal(fake.requests.length, 1, "malformed output never triggers an expansion request");
}
await check.rejects(createParkingSearch({ mapkit: {}, venue }).search(), { code: "PARKING_UNSUPPORTED" }, "a missing SDK capability is distinct from empty");
await check.rejects(createParkingSearch({ mapkit: initial.mapkit, venue: { lat: "", lng: -82.5 } }).search(), { code: "PARKING_COORDINATE" }, "an invalid venue is rejected before any request");
const legacy = fakeMapkit([() => 7]);
await check.rejects(createParkingSearch({ mapkit: legacy.mapkit, venue }).search(), { code: "PARKING_UNSUPPORTED" }, "a legacy request ID cannot masquerade as an empty modern response");
const failed = fakeMapkit([() => Promise.reject(new Error("provider unavailable")), { places: [] }, { places: [] }]);
const failedService = createParkingSearch({ mapkit: failed.mapkit, venue });
await check.rejects(failedService.search(), { code: "PARKING_PROVIDER" }, "provider rejection is distinct from empty");
check.equal(failed.requests.length, 1, "an errored first request does not expand");
check.equal((await failedService.search()).places.length, 0, "failed requests are retryable and never cached as empty");
const secondFailed = fakeMapkit([{ places: [place("one", 100)] }, () => Promise.reject(new Error("expansion failed"))]);
await check.rejects(createParkingSearch({ mapkit: secondFailed.mapkit, venue }).search(), { code: "PARKING_PROVIDER" }, "a failed expansion cannot claim a complete nearby result");

function generalSearch(fake, steps) {
  const requests = [];
  fake.mapkit.CoordinateSpan = class { constructor(latitudeDelta, longitudeDelta) { Object.assign(this, { latitudeDelta, longitudeDelta }); } };
  fake.mapkit.CoordinateRegion = class { constructor(center, span) { Object.assign(this, { center, span }); } };
  fake.mapkit.RegionPriority = { Required: "required" };
  fake.mapkit.Search = class {
    search(query, options) {
      // Apple's SearchOptions contract excludes autocomplete-only options.
      if ("includeQueries" in options) throw new Error("includeQueries is not a valid Search option");
      requests.push({ query, options });
      const step = steps.shift();
      return typeof step === "function" ? step(options) : Promise.resolve(step);
    }
  };
  return requests;
}
const poiDown = fakeMapkit([() => Promise.reject(new Error("POI service unavailable"))]);
const fallbackCalls = generalSearch(poiDown, [{ places: [place("close", 100), place("middle", 400), place("far", 600), place("outside", 2500)] }]);
const diagnostics = [];
const recovered = await createParkingSearch({ mapkit: poiDown.mapkit, venue, onDiagnostic: d => diagnostics.push(d) }).search();
check.deepEqual(recovered.places.map(p => p.id), ["close", "middle", "far"], "real service failure recovers through filtered Apple Search, retaining radial exclusion");
check.equal(poiDown.requests.length, 1, "a failed POI service is not retried during this attempt");
check.equal(fallbackCalls.length, 1, "three fallback results stop expansion");
check.equal(fallbackCalls[0].query, "parking", "fallback searches parking, not arbitrary businesses");
check.deepEqual(fallbackCalls[0].options.pointOfInterestFilter, { including: ["Parking"] }, "fallback keeps the strict Parking category filter");
check.equal(fallbackCalls[0].options.regionPriority, "required", "fallback requires the venue's region");
check.deepEqual(fallbackCalls[0].options.region.center, new poiDown.mapkit.Coordinate(venue.lat, venue.lng), "fallback is centered on the selected venue");
check.equal(fallbackCalls[0].options.includeAddresses, false, "addresses cannot masquerade as parking");
check.equal("includeQueries" in fallbackCalls[0].options, false, "autocomplete-only includeQueries is never passed to Search");
check.equal(fallbackCalls[0].options.includePointsOfInterest, true, "fallback still asks for points of interest");
check.ok(fallbackCalls[0].options.signal instanceof AbortSignal, "fallback shares the existing attempt cancellation");
check.ok(!("center" in fallbackCalls[0].options), "POI-only options never leak into the general Search contract");
check.deepEqual(diagnostics, [{ provider: "points-of-interest", reason: "unavailable", outcome: "recovered" }], "completed fallback recovery is observable without credentials or coordinates");
check.equal(mapFailureReason(new Error("401 token private-value origin https://example.com/?secret=not-for-logs")), "authorization", "diagnostics classify authorization without leaking the provider message");
check.equal(mapFailureReason(new Error("429 quota")), "rate-limit", "quota problems are distinguishable from an empty result");
const fallbackEmpty = fakeMapkit([() => Promise.reject(new Error("POI down"))]);
const emptyCalls = generalSearch(fallbackEmpty, [{ places: [] }, { places: [] }]);
const emptyDiagnostics = [];
check.equal((await createParkingSearch({ mapkit: fallbackEmpty.mapkit, venue, onDiagnostic: d => emptyDiagnostics.push(d) }).search()).places.length, 0, "completed fallback emptiness remains distinct from failure");
check.equal(emptyCalls.length, 2, "fallback expands only once, at most three calls including the failed service");
check.equal(emptyDiagnostics[0]?.outcome, "recovered", "a fully checked valid empty fallback is a successful provider response");
const bothDown = fakeMapkit([() => Promise.reject(new Error("POI down"))]);
generalSearch(bothDown, [() => Promise.reject(new Error("Search down"))]);
const failedDiagnostics = [];
await check.rejects(createParkingSearch({ mapkit: bothDown.mapkit, venue, onDiagnostic: d => failedDiagnostics.push(d) }).search(), { code: "PARKING_PROVIDER" }, "two provider failures never render as no parking found");
check.equal(failedDiagnostics[0]?.outcome, "failed", "failed fallback remains a failure diagnostic");
const pendingFallback = deferred();
const waitingFallback = fakeMapkit([() => Promise.reject(new Error("HTTP 400 private token"))]);
generalSearch(waitingFallback, [() => pendingFallback.promise]);
const waitingDiagnostics = [];
const waitingService = createParkingSearch({ mapkit: waitingFallback.mapkit, venue, onDiagnostic: d => waitingDiagnostics.push(d) });
const waiting = waitingService.search();
await wait();
check.equal(waitingDiagnostics.length, 0, "a pending fallback cannot claim recovery or terminal failure");
waitingService.cancel();
await check.rejects(waiting, { name: "AbortError" }, "canceling the fallback settles its caller");
pendingFallback.resolve({ places: [place("late", 10), place("late2", 20), place("late3", 30)] });
await wait();
check.equal(waitingDiagnostics.length, 0, "a late canceled fallback cannot claim recovery");
const timedFallback = fakeMapkit([() => Promise.reject(new Error("HTTP 400"))]);
generalSearch(timedFallback, [() => new Promise(() => {})]);
const timedDiagnostics = [];
await check.rejects(createParkingSearch({ mapkit: timedFallback.mapkit, venue, requestTimeoutMs: 15, onDiagnostic: d => timedDiagnostics.push(d) }).search(), { code: "PARKING_TIMEOUT" }, "fallback retains the total deadline");
check.deepEqual(timedDiagnostics, [{ provider: "points-of-interest", reason: "request", outcome: "failed" }], "timed-out fallback preserves the initial request failure without claiming recovery");

const poiEmptyRecover = fakeMapkit([{ places: [] }, { places: [] }]);
const emptyRecoveryCalls = generalSearch(poiEmptyRecover, [{ places: [place("recovered", 900)] }]);
const emptyRecovery = await createParkingSearch({ mapkit: poiEmptyRecover.mapkit, venue }).search();
check.equal(emptyRecovery.places[0]?.id, "recovered", "an empty POI service is checked against independent Search before reporting no parking");
check.equal(poiEmptyRecover.requests.length + emptyRecoveryCalls.length, 3, "empty recovery retains the three-call cap");
check.equal(emptyRecovery.radiusMeters, 1609.344, "recovery reports the actual final search radius");
const emptyRecoveryDown = fakeMapkit([{ places: [] }, { places: [] }]);
generalSearch(emptyRecoveryDown, [() => Promise.reject(new Error("provider failed"))]);
await check.rejects(createParkingSearch({ mapkit: emptyRecoveryDown.mapkit, venue }).search(), { code: "PARKING_PROVIDER" }, "an incomplete empty recovery is an error, never a measured absence");
const diagnosticBroken = fakeMapkit([() => Promise.reject(new Error("POI down"))]);
generalSearch(diagnosticBroken, [{ places: [place("recovered", 10), place("b", 20), place("c", 30)] }]);
check.equal((await createParkingSearch({ mapkit: diagnosticBroken.mapkit, venue, onDiagnostic: () => { throw new Error("logger failed"); } }).search()).places.length, 3, "telemetry failure cannot prevent parking recovery");
const emptyRecoveryHung = fakeMapkit([{ places: [] }, { places: [] }]);
generalSearch(emptyRecoveryHung, [() => new Promise(() => {})]);
await check.rejects(createParkingSearch({ mapkit: emptyRecoveryHung.mapkit, venue, requestTimeoutMs: 20 }).search(), { code: "PARKING_TIMEOUT" }, "the total deadline also bounds empty recovery");

const poiHung = fakeMapkit([() => new Promise(() => {})]);
const hungFallback = generalSearch(poiHung, [{ places: [place("a", 50), place("b", 100), place("c", 150)] }]);
check.equal((await createParkingSearch({ mapkit: poiHung.mapkit, venue, requestTimeoutMs: 1000, providerTimeoutMs: 5 }).search()).places.length, 3, "a hung POI service cannot consume the entire fallback deadline");
check.ok(poiHung.requests[0].signal.aborted && !hungFallback[0].options.signal.aborted, "only the failed POI request is aborted while fallback retains the live attempt");

const old = deferred();
const current = deferred();
const cancellation = fakeMapkit([() => old.promise, () => current.promise]);
const cancellable = createParkingSearch({ mapkit: cancellation.mapkit, venue });
const canceledPromise = cancellable.search();
const canceledCheck = check.rejects(canceledPromise, { name: "AbortError" }, "cancel settles immediately even if the provider ignores AbortSignal");
await wait();
cancellable.cancel();
await canceledCheck;
check.equal(cancellation.requests[0].signal.aborted, true, "cancel also aborts the native request");
const freshPromise = cancellable.search();
await wait();
old.resolve({ places: [place("stale", 1), place("stale2", 2), place("stale3", 3)] });
await wait();
check.equal(cancellation.requests.length, 2, "late stale data cannot schedule an expansion into a new attempt");
current.resolve({ places: [place("new", 10), place("new2", 20), place("new3", 30)] });
const fresh = await freshPromise;
check.equal(fresh.places[0].id, "new", "a canceled response cannot replace the current venue results");
check.equal(await cancellable.search(), fresh, "only the current attempt populates reuse");

const beforeStart = fakeMapkit([]);
const beforeStartService = createParkingSearch({ mapkit: beforeStart.mapkit, venue });
const immediateCancel = beforeStartService.search();
const immediateCheck = check.rejects(immediateCancel, { name: "AbortError" }, "cancel before the first microtask settles callers");
beforeStartService.cancel();
await immediateCheck;
check.equal(beforeStart.requests.length, 0, "an already-canceled attempt makes no provider request");

const hung = deferred();
const timeout = fakeMapkit([() => hung.promise, { places: [] }, { places: [] }]);
const timeoutService = createParkingSearch({ mapkit: timeout.mapkit, venue, requestTimeoutMs: 15 });
await check.rejects(timeoutService.search(), { name: "ParkingTimeoutError", code: "PARKING_TIMEOUT" }, "a provider that never settles cannot leave the UI loading forever");
check.equal(timeout.requests[0].signal.aborted, true, "timeout aborts the native request");
hung.resolve({ places: [place("late", 1), place("late2", 2), place("late3", 3)] });
await wait();
check.equal((await timeoutService.search()).places.length, 0, "late timed-out data cannot poison the next search");
const expansionHung = fakeMapkit([{ places: [] }, () => new Promise(() => {})]);
await check.rejects(createParkingSearch({ mapkit: expansionHung.mapkit, venue, requestTimeoutMs: 15 }).search(), { code: "PARKING_TIMEOUT" }, "the total attempt deadline also covers a hung expanded request");
check.equal(expansionHung.requests.length, 2, "timeout does not exceed the expansion budget");

const destroyed = fakeMapkit([() => new Promise(() => {})]);
const destroyedService = createParkingSearch({ mapkit: destroyed.mapkit, venue });
const destroyedPromise = destroyedService.search();
const destroyedCheck = check.rejects(destroyedPromise, { name: "AbortError" }, "destroy rejects all pending callers");
await wait();
destroyedService.destroy();
await destroyedCheck;
await check.rejects(destroyedService.search(), { name: "AbortError" }, "destroyed instances cannot restart work");
check.equal(destroyed.requests[0].signal.aborted, true, "destroy cancels native work");
service.destroy();
await check.rejects(service.search(), { name: "AbortError" }, "destroy also clears cached results");

console.log(`Apple parking: ${assertions} assertions passed`);
