#!/usr/bin/env node
// test-event-reanchor-render: the event page's nearby surfaces follow Apple's venue point.
//
// WHY (2026-10-22). Ticketmaster venue points are often a ZIP centroid (Tropicana Field
// 3.5 km off, Amerant Bank Arena 10 km). PR #1913 made the map ask Apple for the real point,
// but the nearby picks, the stays rail and the "Complete the plan" rails were still ranked from
// the provider point. EventVenueMap now publishes Apple's answer to lib/venueResolutionStore.js;
// EventNearbyReanchor, EventNearbyCards, EventStayCards, the map pins and EventPlan follow it.
//
// HARNESS. The REAL components (compiled by scripts/lib/jsxLoad.mjs from ONE entry,
// scripts/lib/eventReanchorHarness.js, so they share one store and one React context) are
// mounted with react-dom/client inside jsdom, with a recording fetch stub. Nothing is mocked
// between the store and the DOM: the cards, the stay rail, the map-pin hook the venue map loader
// calls (useEventMapPins) and EventPlan are the shipped code. The map itself (MapKit) is not
// rendered here; scripts/test-venue-parking-ui.mjs covers the browser side that publishes.
//
// Proves: no answer -> the server's picks and stays render and nothing is fetched; a confirmed
// answer, a sub-300 m correction, or another venue's correction swaps nothing and fetches
// nothing; a corrected answer fetches ONCE from the corrected point and swaps the cards, the
// stays rail, the map pins and EventPlan's request origin together; failures and stale
// responses keep the right content; two events on one page never leak into each other.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const ok = (condition, message) => { assert.ok(condition, message); pass++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); pass++; };

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://www.gowayfind.com/events/st-petersburg/rays", pretendToBeVisual: true });
for (const field of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "Event", "CustomEvent", "getComputedStyle"]) {
  Object.defineProperty(globalThis, field, { value: field === "window" ? dom.window : dom.window[field], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

const consoleErrors = [];
const realConsoleError = console.error;
console.error = (...args) => { consoleErrors.push(args.map(String).join(" ").slice(0, 400)); };

// Vercel's production build runs prebuild with NODE_ENV=production, and
// React's production build rejects act(). This is a fixture write, not a
// read of the shell: the client scenarios below always mount on the test
// build, which is what CI already uses. Server markup still uses
// renderToStaticMarkup.
process.env.NODE_ENV = "test";

const { loadComponent } = await import("./lib/jsxLoad.mjs");
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const h = await loadComponent(path.join(ROOT, "scripts/lib/eventReanchorHarness.js"), ROOT);
const { venueStore } = h;
const act = React.act;
const e = React.createElement;

// ---- fixtures -------------------------------------------------------------
const PROVIDER = { name: "Tropicana Field", lat: 27.7373, lng: -82.6461 };
const CORRECTED = { lat: 27.7682, lng: -82.6534 };
const EVENT = { city: "St. Petersburg", name: "Rays vs Yankees", date: "2026-10-25", time: "19:05", segment: "Sports", genre: "Baseball", placeId: "ChIJtropicana" };
const pick = (prefix, i, extra = {}) => ({ id: `${prefix}${i}`, name: `${prefix} Kitchen ${i}`, href: `/p/${prefix}${i}`, lat: 27.7 + i / 100, lng: -82.6, distMi: i / 10, wfScore: 95 - i, governed_score: 95 - i, rating: 4.6, reviews: 500 + i, types: ["restaurant"], primaryType: "restaurant", cat: "Restaurant", category: "Restaurant", ...extra });
const stay = (prefix, i) => ({ id: `${prefix}${i}`, name: `${prefix} Hotel ${i}`, detailHref: `/p/${prefix}${i}`, lat: 27.71 + i / 100, lng: -82.64, distMi: i / 10, wfScore: 94 - i, governed_score: 94 - i, rating: 4.5, reviews: 800 + i, types: ["lodging", "hotel"], primaryType: "hotel", category: "hotels" });
const SERVER_PICKS = [1, 2, 3].map((i) => pick("srv", i));
const SERVER_STAYS = [1, 2].map((i) => stay("srvstay", i));
const API_PICKS = [1, 2, 3, 4].map((i) => pick("api", i));
const API_STAYS = [1, 2, 3].map((i) => stay("apistay", i));
const apiBody = (over = {}) => ({ picks: API_PICKS, stays: API_STAYS, unavailable: { picks: false, stays: false }, point: CORRECTED, ...over });
const corrected = (over = {}) => ({ status: "corrected", point: CORRECTED, source: "apple-place", driftMeters: 3500, ...over });

// ---- recording fetch ------------------------------------------------------
let fetchLog = [];
let nearbyHandler = async () => ({ ok: true, status: 200, json: async () => apiBody() });
globalThis.fetch = (url, init = {}) => {
  const entry = { url: String(url), signal: init.signal };
  fetchLog.push(entry);
  if (entry.url.startsWith("/api/events/venue-nearby")) return nearbyHandler(entry);
  if (entry.url.startsWith("/api/places/search")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ places: [] }) });
  if (entry.url.startsWith("/api/hotels")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ hotels: [{ id: "plan-hotel", name: "Plan Hotel", lat: 27.74, lng: -82.64, rating: 4.4, reviews: 300 }] }) });
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
};
const nearbyCalls = () => fetchLog.filter((c) => c.url.startsWith("/api/events/venue-nearby"));
const planCalls = () => fetchLog.filter((c) => c.url.startsWith("/api/places/search") || c.url.startsWith("/api/hotels"));
const originOf = (call) => { const q = new URL(call.url, "https://www.gowayfind.com").searchParams; return [Number(q.get("lat")), Number(q.get("lng"))]; };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const abortable = (entry, d) => { entry.signal?.addEventListener("abort", () => d.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); return d.promise; };

// ---- tree -----------------------------------------------------------------
const mapProbe = { pins: [] };
function MapProbe({ serverPicks, probe }) { probe.pins = h.useEventMapPins(serverPicks); return null; }
function Surface({ venue = PROVIDER, picks = SERVER_PICKS, stays = SERVER_STAYS, hasNearby = true, probe = mapProbe, tag = "a", awaitVenue = true, venueWaitMs = HOLD_MS }) {
  return e(React.Fragment, null,
    e(h.EventMapPlaces, null,
      e(h.EventNearbyReanchor, { venue, ...EVENT, hasNearby }),
      e("section", { id: `near-${tag}` }, picks.length ? e(h.EventNearbyCards, { places: picks }) : null),
      e("section", { id: `stays-${tag}` }, e(h.EventStayCards, { places: stays })),
      e(MapProbe, { serverPicks: picks, probe })),
    e(h.EventPlan, { lat: venue.lat, lng: venue.lng, city: EVENT.city, venue: venue.name, time: EVENT.time, anchorName: venue.name, awaitVenue, venueWaitMs }));
}
// EventPlan's rails are METERED, so a provider-venue plan waits (bounded) for the map's answer and
// requests ONCE from the best point. Scenarios that must observe the HOLD mount with an unreachable
// wait (a cold jsdom mount can take 200 ms+ on a loaded runner; a short wait there made this guard
// flaky, reviewer 2026-10-22); only the two "wait ran out" scenarios use a short one.
const HOLD_MS = 60000;
const SHORT_WAIT_MS = 60;
const planWaitElapsed = async () => { await act(async () => { await new Promise((r) => setTimeout(r, SHORT_WAIT_MS + 60)); }); await flush(); };
const host = dom.window.document.getElementById("root");
let root = null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); await Promise.resolve(); }); };
async function mount(tree) {
  venueStore.clearVenueResolutionsForTests();
  fetchLog = [];
  mapProbe.pins = [];
  nearbyHandler = async () => ({ ok: true, status: 200, json: async () => apiBody() });
  if (root) await act(async () => { root.unmount(); });
  host.innerHTML = "";
  root = createRoot(host);
  await act(async () => { root.render(tree); });
  await flush();
}
const ids = (selector) => [...host.querySelectorAll(`${selector} [data-place-id]`)].map((n) => n.getAttribute("data-place-id"));
const status = () => host.querySelector('[role="status"]');
const pinIds = () => mapProbe.pins.map((p) => p.id);
const serverState = (label) => {
  eq(ids("#near-a"), SERVER_PICKS.map((p) => p.id), `${label}: the nearby cards are the server's picks`);
  eq(ids("#stays-a"), SERVER_STAYS.map((p) => p.id), `${label}: the stays rail is the server's list`);
  eq(pinIds(), [...SERVER_PICKS.map((p) => p.id), ...SERVER_STAYS.map((p) => p.id)], `${label}: the map pins are the server's picks plus the rail's stays`);
};

try {
  // 0. The server render never sees the browser's answer (no hydration mismatch).
  venueStore.clearVenueResolutionsForTests();
  const ssrBefore = renderToStaticMarkup(e(Surface));
  venueStore.publishVenueResolution(PROVIDER, corrected());
  const ssrAfter = renderToStaticMarkup(e(Surface));
  ok(ssrBefore.includes("srv Kitchen 1") && ssrBefore.includes("srvstay Hotel 1"), "SSR: the server's picks and stays are in the markup");
  ok(ssrAfter === ssrBefore, "SSR: a corrected answer sitting in the store never changes server-rendered markup");
  ok(!/role="status"/.test(ssrBefore), "SSR: no status line before a correction");
  // The server renderer's own useLayoutEffect notice (from the shipped place cards) is not what this
  // guard is about; everything React reports while the CLIENT scenarios below run is.
  consoleErrors.length = 0;

  // 1. No answer: the server's content, no re-anchor request, EventPlan WAITS (its rails are metered),
  //    then, when the bounded wait runs out, requests once from the provider point.
  await mount(e(Surface));
  serverState("no answer");
  eq(nearbyCalls().length, 0, "no answer: no venue-nearby request");
  eq(planCalls().length, 0, "no answer yet: EventPlan holds its metered rail requests while the map's Apple answer is pending");
  await mount(e(Surface, { venueWaitMs: SHORT_WAIT_MS }));
  await planWaitElapsed();
  eq(planCalls().length, 3, "no answer after the bounded wait: EventPlan makes its three rail requests anyway");
  ok(planCalls().every((c) => { const [la, ln] = originOf(c); return la === 27.7373 && ln === -82.6461; }), "no answer: EventPlan requests are centred on the provider point");
  ok(!status(), "no answer: no status line");
  await mount(e(Surface, { awaitVenue: false }));
  eq(planCalls().length, 3, "a verified venue (no wait requested) requests its rails at once");
  await mount(e(Surface));

  // 2. A confirmed answer, a small correction, or another venue's correction swaps nothing.
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, { status: "confirmed", point: { lat: PROVIDER.lat, lng: PROVIDER.lng }, source: "apple-place", driftMeters: 12 }); });
  await flush();
  serverState("confirmed");
  eq(nearbyCalls().length, 0, "confirmed: no venue-nearby request");
  eq(planCalls().length, 3, "confirmed: EventPlan requests its rails once, from the provider point the answer confirmed");
  ok(planCalls().every((c) => { const [la, ln] = originOf(c); return la === 27.7373 && ln === -82.6461; }), "confirmed: from the provider point");
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected({ driftMeters: 250 })); });
  await flush();
  serverState("250 m correction");
  eq(nearbyCalls().length, 0, "250 m correction (below 300 m): no venue-nearby request");
  eq(planCalls().length, 3, "250 m correction: EventPlan does not refetch");
  await act(async () => {
    venueStore.publishVenueResolution({ ...PROVIDER, lat: 27.9, lng: -82.5 }, corrected());
    venueStore.publishVenueResolution({ ...PROVIDER, name: "Another Arena" }, corrected());
  });
  await flush();
  serverState("another venue's correction");
  eq(nearbyCalls().length, 0, "same name at another point, or another name at this point: this page is untouched and fetches nothing");
  ok(!status(), "unrelated corrections: no status line");

  // 3. A corrected answer: ONE request from the corrected point, then everything swaps together.
  await mount(e(Surface));
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(nearbyCalls().length, 1, "corrected: exactly one venue-nearby request");
  const sent = new URL(nearbyCalls()[0].url, "https://www.gowayfind.com");
  eq(sent.pathname, "/api/events/venue-nearby", "corrected: the request goes to the same-origin route");
  eq([Number(sent.searchParams.get("lat")), Number(sent.searchParams.get("lng"))], [CORRECTED.lat, CORRECTED.lng], "corrected: the request carries Apple's point, not the provider's");
  eq(Object.fromEntries(["name", "city", "date", "time", "segment", "genre", "placeId"].map((k) => [k, sent.searchParams.get(k)])), { name: EVENT.name, city: EVENT.city, date: EVENT.date, time: EVENT.time, segment: EVENT.segment, genre: EVENT.genre, placeId: EVENT.placeId }, "corrected: the request carries the event's own facts so before/after slots stay event-specific");
  eq(ids("#near-a"), API_PICKS.map((p) => p.id), "corrected: the nearby cards are the picks ranked from the corrected point");
  eq(ids("#stays-a"), API_STAYS.map((p) => p.id), "corrected: the stays rail is the list ranked from the corrected point");
  eq(pinIds(), [...API_PICKS.map((p) => p.id), ...API_STAYS.map((p) => p.id)], "corrected: the map pins are the new picks plus the new stays, and nothing from the old shelves");
  eq(pinIds().slice(0, API_PICKS.length), ids("#near-a"), "corrected: card rank N and pin N are the same place");
  eq(mapProbe.pins.filter((p) => p.mapKind === "stay").map((p) => p.id), ids("#stays-a"), "corrected: the stay pins are exactly the rail the reader sees (single publisher, no stale overwrite)");
  ok(status() && /Updated nearby picks for the verified venue location\./.test(status().textContent), "corrected: a status line tells assistive technology the list moved");
  ok(/width: 1px/.test(status().getAttribute("style")) && /overflow: hidden/.test(status().getAttribute("style")), "corrected: the status line is visually hidden (1px, clipped), not displayed: " + status().getAttribute("style"));
  eq(planCalls().length, 3, "corrected before the wait ran out: EventPlan requests its three rails exactly ONCE (never a centroid request plus a corrected one)");
  const newOrigin = planCalls().map(originOf);
  ok(newOrigin.length === 3 && newOrigin.every(([la, ln]) => la === CORRECTED.lat && ln === CORRECTED.lng), "corrected: EventPlan's requests are centred on Apple's point");
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(nearbyCalls().length, 1, "the same answer published again makes no second request");
  eq(planCalls().length, 3, "the same answer published again makes no EventPlan refetch");
  await planWaitElapsed();
  eq(planCalls().length, 3, "time passing after an answer changes nothing");
  // A late correction (Apple slower than the bounded wait) still re-anchors the plan: two requests
  // then, which is the pre-existing cost, never the default.
  await mount(e(Surface, { venueWaitMs: SHORT_WAIT_MS }));
  await planWaitElapsed();
  eq(planCalls().length, 3, "late answer: the rails were requested from the provider point when the wait ran out");
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(planCalls().length, 6, "late answer: a correction after the wait re-requests the rails from Apple's point");
  ok(planCalls().slice(3).map(originOf).every(([la, ln]) => la === CORRECTED.lat && ln === CORRECTED.lng), "late answer: from Apple's point");

  // 4. Failures keep the server's content.
  for (const [label, handler] of [
    ["a 503", async () => ({ ok: false, status: 503, json: async () => ({}) })],
    ["a network failure", async () => { throw new TypeError("network down"); }],
    ["an unreadable body", async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } })],
    ["both shelves unavailable", async () => ({ ok: true, status: 200, json: async () => apiBody({ picks: [], stays: [], unavailable: { picks: true, stays: true } }) })],
    ["no unavailable block", async () => ({ ok: true, status: 200, json: async () => ({ picks: API_PICKS, stays: API_STAYS }) })],
  ]) {
    await mount(e(Surface));
    nearbyHandler = handler;
    await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
    await flush();
    eq(nearbyCalls().length, 1, `${label}: one request was attempted`);
    serverState(label);
    ok(status() && status().textContent === "", `${label}: the status line stays empty (nothing was swapped)`);
  }
  await mount(e(Surface));
  nearbyHandler = async () => ({ ok: true, status: 200, json: async () => apiBody({ picks: [], unavailable: { picks: true, stays: false } }) });
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(ids("#near-a"), SERVER_PICKS.map((p) => p.id), "picks unavailable: the server's picks stay");
  eq(ids("#stays-a"), API_STAYS.map((p) => p.id), "picks unavailable: the stays still move to the corrected point");

  // 5. A late answer for an older corrected point never wins.
  await mount(e(Surface));
  const first = deferred();
  const second = deferred();
  let n = 0;
  nearbyHandler = (entry) => abortable(entry, ++n === 1 ? first : second);
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected({ point: { lat: 27.8, lng: -82.7 } })); });
  await flush();
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(nearbyCalls().length, 2, "two different corrected points: two requests, one each");
  ok(nearbyCalls()[0].signal.aborted, "the request for the superseded point was aborted");
  await act(async () => { second.resolve({ ok: true, status: 200, json: async () => apiBody() }); });
  await flush();
  await act(async () => { first.resolve({ ok: true, status: 200, json: async () => apiBody({ picks: [pick("stale", 1)], stays: [stay("stalestay", 1)] }) }); });
  await flush();
  eq(ids("#near-a"), API_PICKS.map((p) => p.id), "a late stale answer cannot replace the current corrected picks");
  eq(ids("#stays-a"), API_STAYS.map((p) => p.id), "a late stale answer cannot replace the current corrected stays");

  // 5b. Even a response that ignores the abort (already in flight when superseded) is dropped.
  await mount(e(Surface));
  const early = deferred();
  const later = deferred();
  let m = 0;
  nearbyHandler = () => (++m === 1 ? early : later).promise;
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected({ point: { lat: 27.8, lng: -82.7 } })); });
  await flush();
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  await act(async () => { later.resolve({ ok: true, status: 200, json: async () => apiBody() }); });
  await flush();
  await act(async () => { early.resolve({ ok: true, status: 200, json: async () => apiBody({ picks: [pick("stale", 1)], stays: [stay("stalestay", 1)] }) }); });
  await flush();
  eq(ids("#near-a"), API_PICKS.map((p) => p.id), "an in-flight answer for a superseded point is ignored even though its request could not be aborted (picks)");
  eq(ids("#stays-a"), API_STAYS.map((p) => p.id), "an in-flight answer for a superseded point is ignored even though its request could not be aborted (stays)");

  // 6. An empty corrected shelf is honest: the old, wrongly anchored picks do not linger.
  await mount(e(Surface));
  nearbyHandler = async () => ({ ok: true, status: 200, json: async () => apiBody({ picks: [] }) });
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(ids("#near-a"), [], "an empty corrected shelf shows no cards");
  eq(pinIds().filter((id) => id.startsWith("srv") && !id.startsWith("srvstay")), [], "an empty corrected shelf leaves no stale nearby pins");

  // 7. No server shelf (hasNearby false): cards and pins that do not exist are not invented; stays still move.
  await mount(e(Surface, { picks: [], hasNearby: false }));
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(ids("#near-a"), [], "no server shelf: no cards appear");
  eq(pinIds().filter((id) => id.startsWith("api") && !id.startsWith("apistay")), [], "no server shelf: no nearby pins appear without their cards");
  eq(ids("#stays-a"), API_STAYS.map((p) => p.id), "no server shelf: the stays rail still moves to the corrected point");

  // 8. Two events on one page do not leak into each other.
  venueStore.clearVenueResolutionsForTests();
  fetchLog = [];
  nearbyHandler = async () => ({ ok: true, status: 200, json: async () => apiBody() });
  if (root) await act(async () => { root.unmount(); });
  host.innerHTML = "";
  root = createRoot(host);
  const otherProbe = { pins: [] };
  const OTHER = { name: "Amerant Bank Arena", lat: 26.1583, lng: -80.3256 };
  const OTHER_PICKS = [1, 2, 3].map((i) => pick("oth", i));
  const OTHER_STAYS = [1, 2].map((i) => stay("othstay", i));
  await act(async () => { root.render(e(React.Fragment, null,
    e(Surface, { tag: "a" }),
    e(Surface, { tag: "b", venue: OTHER, picks: OTHER_PICKS, stays: OTHER_STAYS, probe: otherProbe }))); });
  await flush();
  await act(async () => { venueStore.publishVenueResolution(PROVIDER, corrected()); });
  await flush();
  eq(ids("#near-a"), API_PICKS.map((p) => p.id), "two events: the corrected venue's cards moved");
  eq(ids("#near-b"), OTHER_PICKS.map((p) => p.id), "two events: the other venue's cards did not");
  eq(ids("#stays-b"), OTHER_STAYS.map((p) => p.id), "two events: the other venue's stays did not");
  eq(otherProbe.pins.map((p) => p.id), [...OTHER_PICKS, ...OTHER_STAYS].map((p) => p.id), "two events: the other venue's map pins did not");
  eq(nearbyCalls().length, 1, "two events: only the corrected venue asked the route");
  ok(originOf(nearbyCalls()[0])[0] === CORRECTED.lat, "two events: that one request used the corrected venue's point");

  // 9. Positive control for the probes: a consumer that ignores the context WOULD fail the swap checks above.
  const stale = ids("#near-b");
  ok(stale.length === OTHER_PICKS.length && !stale.some((id) => id.startsWith("api")), "probe control: the untouched surface really lists only its own picks");
  eq(consoleErrors.filter((m) => !/ReactDOMTestUtils|not implemented/i.test(m)), [], "no React warnings or errors during any scenario");
  console.log(`test-event-reanchor-render: OK - ${pass} assertions (real cards, stays rail, map-pin hook and EventPlan in jsdom: no answer keeps the server's content and fetches nothing; confirmed, sub-300 m and other-venue answers swap nothing; a corrected answer makes ONE request from Apple's point and moves cards, stays, pins and the plan origin together; failures, stale responses, empty shelves and two events on one page behave).`);
  console.error = realConsoleError;
  process.exit(0);
} catch (error) {
  console.error = realConsoleError;
  console.error("test-event-reanchor-render: FAIL after " + pass + " assertions");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
}
