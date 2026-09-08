#!/usr/bin/env node
// Focused, hermetic proof for /api/events' paid-provider boundary.  It loads
// the production route with its dependencies replaced by local fixtures, so a
// denial can be asserted to make zero HTTP requests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventProviderCap, eventProviderSpendAllow } from "../lib/eventProviderSpend.js";

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

async function routeWith({ cacheValue = null, spendAllowed = false }) {
  let source = readFileSync("app/api/events/route.js", "utf8");
  source = source.replace(/^import[^;]+;\n/gm, "");
  const prelude = `
    const processEvents = () => ({ events: [], usableCount: 0, health: [], excludedByReason: {} });
    const siteTodayStr = () => "2099-01-01";
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
    const CURATED_REACH_MI = 60;
    const CURATED_SOURCE = "Wayfind curated";
    const stockPhotoPool = async () => [];
    const fromPool = () => null;
    const DAY = 86400000;
    const cget = async () => globalThis.__eventsSpend.cacheValue;
    const cset = async () => {};
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
  globalThis.__eventsSpend = { cacheValue, spendAllowed, cap: 5, grants: 0 };
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source));
}

try {
  // An absent cap is an off switch before even the ledger call.  A configured
  // cap with no ledger also fails closed, and neither condition reaches a
  // provider HTTP endpoint.
  delete process.env.EVENT_TICKETMASTER_MONTH_CAP;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.WAYFIND_GATE = "open";
  let httpCalls = 0;
  globalThis.fetch = async () => { httpCalls++; throw new Error("network must not run"); };
  assert.equal(eventProviderCap("ticketmaster"), null, "missing Ticketmaster cap is disabled");
  assert.equal(await eventProviderSpendAllow("ticketmaster"), false, "missing cap fails closed");
  assert.equal(httpCalls, 0, "missing cap performs zero network requests");
  process.env.EVENT_TICKETMASTER_MONTH_CAP = "5";
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

  console.log("test-events-spend: OK — input bounds, cache-first default feed, and per-request finite spend grants verified");
} finally {
  delete globalThis.__eventsSpend;
  globalThis.fetch = savedFetch;
  for (const key of envKeys) delete process.env[key];
}
