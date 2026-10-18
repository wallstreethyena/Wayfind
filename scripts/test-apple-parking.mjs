#!/usr/bin/env node
import assert from "node:assert/strict";
import { createParkingSearch, hasParkingCoordinate, parkingDirectionsUrl } from "../lib/appleParking.js";

let assertions = 0;
const check = Object.fromEntries(["equal", "deepEqual", "ok", "rejects"].map((method) => [method, (...args) => {
  assertions += 1;
  return assert[method](...args);
}]));
const venue = { lat: 27.3, lng: -82.5 };
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
check.equal(initial.requests[0].radius, 804.672, "the first request uses half a mile in meters");
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
check.deepEqual(expanded.requests.map((request) => request.radius), [804.672, 1609.344], "fewer than three unique usable nearby results expand exactly once");
check.deepEqual(expandedResult.places.map((p) => p.id), ["one", "middle", "outer"], "duplicates, malformed coordinates, and out-of-radius results cannot inflate the count");
check.equal(expandedResult.radiusMeters, 1609.344, "the expanded result reports one mile");
check.equal(expanded.requests[1].center.latitude, venue.lat, "expansion keeps the same venue center");
check.equal(expanded.requests[0].signal, expanded.requests[1].signal, "one attempt shares its abort signal across both requests");

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
