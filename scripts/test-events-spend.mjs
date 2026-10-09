#!/usr/bin/env node
// Focused, hermetic proof for /api/events' paid-provider boundary.  It loads
// the production route with its dependencies replaced by local fixtures, so a
// denial can be asserted to make zero HTTP requests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventProviderCap, eventProviderSpendAllow } from "../lib/eventProviderSpend.js";
import { lastEventDay } from "../lib/eventsPipeline.js";
// The route's cached-feed filter calls the REAL last-day rule (2026-10-08).
globalThis.__lastEventDay = lastEventDay;

const envKeys = [
  "WAYFIND_GATE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "TICKETMASTER_API_KEY", "EVENT_TICKETMASTER_MONTH_CAP",
  // Vercel supplies integration credentials during builds. Isolate every
  // route provider so this Ticketmaster fixture cannot enable another one.
  "SEATGEEK_CLIENT_ID", "SEATGEEK_CLIENT_SECRET", "PREDICTHQ_TOKEN",
  "BANDSINTOWN_PARTNER_KEY", "EVENTBRITE_PRIVATE_TOKEN", "EVENTBRITE_ORG_IDS",
  "SERPAPI_KEY", "OPENWEBNINJA_KEY",
];
const savedFetch = globalThis.fetch;
for (const key of envKeys) delete process.env[key];

async function routeWith({ cacheValue = null, spendAllowed = false, processed = null, FakeDate = null }) {
  let source = readFileSync("app/api/events/route.js", "utf8");
  source = source.replace(/^import[^;]+;\n/gm, "");
  const prelude = `
    // The route module is cached across routeWith() calls (same source), so the
    // clock is looked up per use, not at module evaluation.
    const Date = new Proxy(globalThis.Date, {
      construct(t, a) { const D = (globalThis.__eventsSpend && globalThis.__eventsSpend.FakeDate) || t; return new D(...a); },
      get(t, p) { const D = (globalThis.__eventsSpend && globalThis.__eventsSpend.FakeDate) || t; const v = D[p]; return typeof v === "function" ? v.bind(D) : v; },
    });
    const processEvents = () => globalThis.__eventsSpend.processed || ({ events: [], usableCount: 0, health: [], excludedByReason: {} });
    const siteTodayStr = () => "2099-01-01";
    const lastEventDay = globalThis.__lastEventDay;
    const siteAnchorDate = (d) => d;
    const localStaplesFor = () => [];
    const parseLibCalICS = () => [];
    const parseICSDate = () => null;
    const libcalId = () => "libcal";
    const LIBCAL_FEED = "https://free.example.test/calendar.ics";
    const getBusinessFeeds = () => [];
    const businessEventsFrom = () => [];
    const creatorEventsFor = () => [];
    const fetchCuratedEvents = async () => [];
    const curatedFeedEvents = () => [];
    const curatedFeedEventsWithFall = () => [];
    const FALL_FEED_CACHE_VERSION = "test";
    const CURATED_REACH_MI = 60;
    const CURATED_SOURCE = "Wayfind curated";
    const stockPhotoPool = async () => [];
    const fromPool = () => null;
    const DAY = 86400000;
    const cget = async () => globalThis.__eventsSpend.cacheValue;
    const cset = async (k, v, ttl) => { globalThis.__eventsSpend.csetTtl = ttl; };
    const breakerOpen = async () => null;
    const tripBreaker = async () => {};
    const classifyProviderFailure = () => null;
    const BREAKER_COOLDOWN_MS = 1000;
    const eventProviderCap = () => globalThis.__eventsSpend.cap;
    const eventProviderSpendAllow = async () => {
      globalThis.__eventsSpend.grants++;
      return globalThis.__eventsSpend.spendAllowed;
    };
  `;
  globalThis.__eventsSpend = { cacheValue, spendAllowed, cap: 5, grants: 0, processed, csetTtl: null, FakeDate };
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source));
}

try {
  // 2026-09-17 CONTRACT CHANGE (owner-directed). This block used to assert
  // that a MISSING cap disabled the provider: `eventProviderCap === null`.
  // That is the exact behaviour that silently killed the Ticketmaster feed
  // for 82 days with a valid key in Vercel, so it is no longer the contract.
  // A missing env var now resolves the provider's built-in default ceiling.
  //
  // What did NOT change, and is still asserted below: a provider request
  // without a working ledger FAILS CLOSED and performs zero network calls.
  // The bound is still real; it just can no longer be zero by accident.
  delete process.env.EVENT_TICKETMASTER_MONTH_CAP;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.WAYFIND_GATE = "open";
  let httpCalls = 0;
  globalThis.fetch = async () => { httpCalls++; throw new Error("network must not run"); };
  const defaultCap = eventProviderCap("ticketmaster");
  assert.ok(Number.isSafeInteger(defaultCap) && defaultCap > 0, "a missing cap resolves the built-in default, never null");
  assert.equal(await eventProviderSpendAllow("ticketmaster"), false, "no ledger still fails closed even with a default cap");
  assert.equal(httpCalls, 0, "a failed grant performs zero network requests");

  // WAYFIND_GATE is the GOOGLE PLACES switch and must not reach these
  // providers at all: shutting Google must never take the events feed down.
  process.env.WAYFIND_GATE = "shut";
  assert.ok(eventProviderCap("ticketmaster") > 0, "the Google kill switch does not erase an event provider's ceiling");
  process.env.WAYFIND_GATE = "open";

  process.env.EVENT_TICKETMASTER_MONTH_CAP = "5";
  assert.equal(eventProviderCap("ticketmaster"), 5, "an explicit operator cap still overrides the default");
  assert.equal(await eventProviderSpendAllow("ticketmaster"), false, "unavailable ledger fails closed");
  assert.equal(httpCalls, 0, "unavailable ledger performs zero provider requests");

  // Route denial: a configured Ticketmaster key plus a denied per-request
  // grant must never reach Ticketmaster.  Keyword limits its fanout to one
  // possible request, making the negative control exact.
  process.env.TICKETMASTER_API_KEY = "fixture-key";
  let route = await routeWith({ spendAllowed: false });
  httpCalls = 0;
  globalThis.fetch = async () => { httpCalls++; throw new Error("denied provider called"); };
  let response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 0, lng: 0, radius: 25, city: "Fixture", keyword: "music" }),
  }));
  assert.equal(response.status, 200, "denied provider remains fail-soft");
  assert.equal(httpCalls, 0, "denied provider performs zero HTTP requests");
  assert.equal(globalThis.__eventsSpend.grants, 1, "one possible Ticketmaster request asks for one grant");

  // The same valid request reaches the upstream exactly once after its grant.
  route = await routeWith({ spendAllowed: true });
  httpCalls = 0;
  globalThis.fetch = async (url) => {
    httpCalls++;
    assert.match(String(url), /^https:\/\/app\.ticketmaster\.com\/discovery\/v2\/events\.json\?/);
    return new Response(JSON.stringify({ _embedded: { events: [] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 0, lng: 0, radius: 25, city: "Fixture", keyword: "music" }),
  }));
  assert.equal(response.status, 200, "granted provider succeeds");
  assert.equal(httpCalls, 1, "a grant permits exactly one Ticketmaster HTTP request");
  assert.equal(globalThis.__eventsSpend.grants, 1, "each actual provider request consumes one grant");

  // The ordinary/default feed serves a fresh shared cache entry before it can
  // fan out to any live provider or ask for any spend grant.
  route = await routeWith({ cacheValue: { v: [{ id: "cached", date: "2099-02-01", name: "Cached" }] }, spendAllowed: false });
  httpCalls = 0;
  globalThis.fetch = async () => { httpCalls++; throw new Error("cache hit called network"); };
  response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 0, lng: 0, radius: 25, city: "Fixture" }),
  }));
  assert.deepEqual((await response.json()).events.map((event) => event.id), ["cached"], "fresh default cache is served");
  assert.equal(httpCalls, 0, "fresh default cache performs zero HTTP requests");
  assert.equal(globalThis.__eventsSpend.grants, 0, "fresh default cache asks for no grants");

  // 2026-10-08: a budget-denied Ticketmaster is a DEGRADED feed. Before, the
  // denial reported ok and the aggregation was cached for 21 days with zero
  // concerts (Sarasota, Oct 8). Now the provider says why, the response names
  // the gap, and the aggregation is kept only until just after the monthly ledger reset.
  const oneEvent = { events: [{ id: "x", date: "2099-02-01", name: "X" }], usableCount: 1, health: [], excludedByReason: {} };
  // Fixed clock: Jan 28 12:00 UTC, so the ledger resets in 3.5 days.
  const FIXED = Date.UTC(2099, 0, 28, 12);
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } }
  route = await routeWith({ spendAllowed: false, processed: oneEvent, FakeDate });
  httpCalls = 0;
  globalThis.fetch = async () => { httpCalls++; throw new Error("denied provider called"); };
  response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 0, lng: 0, radius: 25, city: "Fixture" }),
  }));
  let body = await response.json();
  assert.equal(httpCalls, 0, "denied default feed performs zero Ticketmaster requests");
  assert.deepEqual(body.degraded, ["Ticketmaster"], "the response names the budget gap");
  const untilReset = Date.UTC(2099, 1, 1) - FIXED + 5 * 60 * 1000;
  assert.equal(globalThis.__eventsSpend.csetTtl, untilReset, "a budget-gapped aggregation lives until 5 minutes after the monthly ledger reset (3.5 days here), not 21 days");
  // Positive control: the same aggregation with the budget available is cached the full 21 days.
  route = await routeWith({ spendAllowed: true, processed: oneEvent, FakeDate });
  globalThis.fetch = async () => new Response(JSON.stringify({ _embedded: { events: [] } }), { status: 200, headers: { "content-type": "application/json" } });
  response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 0, lng: 0, radius: 25, city: "Fixture" }),
  }));
  body = await response.json();
  assert.equal(body.degraded, undefined, "a funded aggregation reports no gap");
  assert.equal(globalThis.__eventsSpend.csetTtl, 21 * 86400000, "a funded aggregation keeps the 21-day cache");

  // Public inputs are typed and bounded before the route can consult a cache
  // or fan out.  Test GET too because it is publicly callable.
  response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: "0", lng: 0, radius: 25 }),
  }));
  assert.equal(response.status, 400, "POST rejects non-numeric latitude");
  response = await route.GET(new Request("https://www.gowayfind.com/api/events?lat=91&lng=0&radius=25"));
  assert.equal(response.status, 400, "GET rejects out-of-range latitude");
  response = await route.POST(new Request("https://www.gowayfind.com/api/events", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 0, lng: 0, radius: 101, keyword: "x".repeat(81) }),
  }));
  assert.equal(response.status, 400, "POST bounds radius and keyword length");

  console.log("test-events-spend: OK — input bounds, cache-first default feed, per-request finite spend grants, and budget-gap feeds kept only until the monthly ledger reset verified");
} finally {
  delete globalThis.__eventsSpend;
  globalThis.fetch = savedFetch;
  for (const key of envKeys) delete process.env[key];
}
