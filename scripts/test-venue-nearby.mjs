// Execute the real hook, complete owned-inventory paging, and place-map wrapper.
// Only React's dispatcher and the HTTP transport are controlled by this guard.
import assert from "node:assert/strict";
import React from "react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { default: hook, venueNearbyBounds } = await loadComponent(fileURLToPath(new URL("../app/components/useVenueNearby.js", import.meta.url)), root);
const { default: PlaceParkingMap } = await loadComponent(fileURLToPath(new URL("../app/components/PlaceParkingMap.js", import.meta.url)), root);
const venue = { id: "venue", name: "Orlando cafe", lat: 28.47, lng: -81.46 };
const local = { id: "local", name: "Nearby park", lat: 28.48, lng: -81.46, category: "attractions", types: ["park"], governed_score: 96, rating: 4.8, reviews: 1500, status: "OPERATIONAL" };
const distant = { ...local, id: "distant", name: "Visitor's Washington park", lat: 38.89, lng: -77.03 };
const tick = () => new Promise(resolve => setImmediate(resolve));
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
function host(component = (props) => hook(...props)) {
  const slots = [], effects = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const dispatcher = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push([i, effect, deps]); },
  };
  return {
    render(props) {
      cursor = 0;
      const internal = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
      const previous = internal.current; internal.current = dispatcher;
      try { return component(props); } finally { internal.current = previous; }
    },
    flush() { for (const [i, effect, deps] of effects.splice(0)) { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; } },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
const answer = (request, places, complete = true, nextCursor = null) => request.resolve(new Response(JSON.stringify({ places, complete, nextCursor })));
const h = host();
try {
  check(venueNearbyBounds(venue).north > venue.lat && venueNearbyBounds(venue).west < venue.lng, "the selected venue owns the search bounds");
  for (const invalid of [{ lat: null, lng: 0 }, { lat: 91, lng: 5 }, { lat: 0, lng: 0 }]) check(venueNearbyBounds(invalid) === null, "invalid venue cannot trigger a plausible nearby request");
  let result = h.render([venue, [distant]]); h.flush();
  check(result.places.length === 0 && result.status === "loading", "a remote visitor pool cannot impersonate venue-local results");
  check(requests.length === 1, "opening the venue starts one owned-inventory request");
  const first = new URL(requests[0].url, "https://www.gowayfind.com");
  check(first.pathname === "/api/places/map", "discovery uses the owned inventory API, not paid Google search");
  check(first.searchParams.get("originLat") === String(venue.lat) && first.searchParams.get("originLng") === String(venue.lng), "request origin is the venue, independent of visitor or browsing city");
  answer(requests[0], [local, distant, venue], false, "next-page"); await tick();
  check(requests.length === 2, "a full page cannot truncate the venue's candidate pool");
  check(h.render([venue, [distant]]).status === "loading", "a partial page is not declared complete");
  answer(requests[1], [{ ...local, id: "second-local", lat: 28.49 }]); await tick();
  result = h.render([venue, [distant]]); h.flush();
  check(result.status === "ready" && result.places.map(p => p.id).join() === "local,second-local", "all pages settle before local radius/exclusion rules produce recommendations");
  h.render([{ ...venue, photo: "updated-photo" }, [distant]]); h.flush();
  check(requests.length === 2, "photo/editorial renders never restart geographic discovery");

  const nextVenue = { ...venue, id: "coast", lat: 27.00659, lng: -82.13057 };
  result = h.render([nextVenue, [distant]]); h.flush();
  check(result.status === "loading" && !result.places.length, "changing venue synchronously hides the previous venue's results");
  check(requests.length === 3, "the next venue owns a new request");
  h.render([venue, [distant]]); h.flush();
  check(requests[2].options.signal.aborted, "leaving a venue aborts its pending request");
  answer(requests[2], [{ ...local, id: "late-coast", ...nextVenue }]); await tick();
  check(h.render([venue, [distant]]).status === "loading", "late responses cannot populate a different venue");
  requests[3].reject(new Error("inventory unavailable")); await tick();
  result = h.render([venue, [distant]]); h.flush();
  check(result.status === "error" && !result.places.length, "inventory failure is an explicit retryable error, not normal zero");
  result.retry(); h.render([venue, [distant]]); h.flush();
  check(requests.length === 5, "retry starts a fresh venue-owned read");
  answer(requests[4], []); await tick();
  check(h.render([venue, [distant]]).status === "ready", "a genuinely empty completed read is distinguishable from failure");

  const wrapper = host(PlaceParkingMap);
  const nearby = { status: "ready", places: [local], retry() {} };
  const tree = wrapper.render({ place: venue, nearby }); wrapper.flush();
  const loader = React.Children.toArray(tree.props.children).find(child => child?.props?.venue);
  check(loader.props.picks.length === 1 && loader.props.picks[0].id === local.id, "the real shared place wrapper passes recommendations into the map");
  check(loader.props.picks[0].href === "/p/local", "nearby pin opens the same Wayfind place identity");
  check(requests.length === 5, "the map reuses the detail read instead of issuing duplicate inventory requests");
  wrapper.unmount();
  check(readFileSync(new URL("./guards.txt", import.meta.url), "utf8").includes("node scripts/test-venue-nearby.mjs"), "the recurrence guard is wired into every build");
  check(readFileSync(new URL("../.github/workflows/canary.yml", import.meta.url), "utf8").includes("tests/e2e/shell-route-contract.spec.js")
    && readFileSync(new URL("../tests/e2e/shell-route-contract.spec.js", import.meta.url), "utf8").includes('test("live venue map returns parking and venue-local nearby pins"'), "the existing production canary also runs a live provider interaction, not token health alone");
} finally { h.unmount(); globalThis.fetch = originalFetch; }
console.log(`test-venue-nearby: OK — ${checks} assertions; real hook/pager/map wiring, remote visitor, pagination, venue handoff, stale response, failure and retry`);
