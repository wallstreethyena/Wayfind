#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { windowRailAnswer } from "../lib/railResponse.js";

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };

const railIds = ["food", "farms", "theme-parks", "haunts", "family",
  "oktoberfest", "date-night", "festivals", "photos", "day-trips"];

async function routeHarness({ dealError = null, cachedValue } = {}) {
  const observed = { usable: null, loaded: false };
  const inventory = [{
    place_id: "p1", name: "Fall Place", lat: 27.95, lng: -82.46, status: "OPERATIONAL",
    category: "cafe", signals: { rating: 4.8, reviews: 100 }, photo_ref: "places/p1/photos/owned",
  }];
  const query = (table) => {
    const builder = {
      select: () => builder,
      in: () => builder,
      abortSignal: async () => table === "wf_deals"
        ? { data: [], error: dealError }
        : { data: inventory, error: null },
    };
    return builder;
  };
  const imports = {
    "../../../../lib/curatedEvents.js": {
      fetchCuratedEvents: async () => [], isTrusted: () => false, eventOutboundUrl: () => null,
    },
    "../../../../lib/siteTime.js": { siteTodayStr: () => "2026-09-10" },
    "../../../../lib/fallPool.js": {
      isFallTagged: () => true, fallEventLive: () => true, fallWhenLabel: () => "Tonight",
      fallScheduleChip: () => null, FALL_PLACE_IDS: { p1: "Verified fall offering" },
      FALL_PLACE_RAIL: { p1: "food" }, FALL_EVENT_TICKET_DEALS: { fixture: "deal-1" },
    },
    "../../../../lib/eventTicketDeals.js": { eventTicketCta: () => null },
    "../../../../lib/deals.js": { hasCjPid: () => false },
    "../../../../lib/supabase.js": { supabase: { from: query } },
    "../../../../lib/wayfindScore.js": { wayfindScore: () => 90 },
    "../../../../lib/placePhoto.js": {
      cardImageSrc: () => "/api/photo?place=p1", hasStoredPlacePhoto: () => true,
    },
    "../../../../lib/railFastCache.js": {
      geoCell: (value) => Number(value).toFixed(2),
      fastCachedRail: async (_key, loader, options) => {
        const value = cachedValue === undefined ? await loader() : cachedValue;
        observed.loaded = cachedValue === undefined;
        observed.usable = options.usable(value);
        return { value, state: cachedValue === undefined ? "miss" : "hit" };
      },
    },
    "../../../../lib/fallIntentRails.js": {
      composeFallIntentRails: (_events, places) => ({
        phase: "fall", rails: railIds.map((id, index) => ({ id, title: id, cards: index ? [] : places })),
      }),
    },
    "../../../../lib/railPage.js": {
      pageOneRail: (rails, id, { page, size }) => {
        const rail = rails.find((candidate) => candidate.id === id);
        if (!rail) return null;
        const pageNumber = Number(page || 0);
        const pageSize = Number(size || 10);
        const start = pageNumber * pageSize;
        return { id, title: rail.title, cards: rail.cards.slice(start, start + pageSize),
          total: rail.cards.length, page: pageNumber, hasMore: start + pageSize < rail.cards.length };
      },
    },
    "../../../../lib/fallPhotoSpots.js": { FALL_PHOTO_PLACE_IDS: [], FALL_PHOTO_SPOTS: {} },
    "../../../../lib/fallDiscoveries2026.js": {
      FALL_DISCOVERIES_2026: [], FALL_DISCOVERY_RAIL: {}, FALL_SEASONAL_PLACE_IDS: new Set(),
    },
    "../../../../lib/railResponse.js": { windowRailAnswer },
    "../../../../lib/fallEventImage.js": {
      FALL_COLLECTION_POSTER: "/collection.jpg", FALL_EVENT_VENUE_PLACE_IDS: {},
      fallEventCardImageSrc: () => "/event.jpg", mergeFallDiscoveryRows: (rows) => rows,
    },
  };
  const exports = {};
  const compiled = ts.transpileModule(readFileSync("app/api/events/fall/route.js", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const { instantiate } = await import("data:text/javascript;base64," + Buffer.from(
    "export function instantiate(require, exports) {\n" + compiled + "\n}").toString("base64"));
  instantiate((id) => {
    if (!(id in imports)) throw new Error(`unmocked route import: ${id}`);
    return imports[id];
  }, exports);
  return { GET: exports.GET, observed };
}

{
  const h = await routeHarness();
  const response = await h.GET(new Request("https://wayfind.test/api/events/fall?lat=27.95&lng=-82.46"));
  const body = await response.json();
  ok(h.observed.loaded && h.observed.usable === true, "healthy ten-rail answer is admitted to FastCache");
  ok(body.sourceFailures === 0 && body.rails.length === 10, "healthy response preserves its output and explicit source health");
  ok(windowRailAnswer(body).sourceFailures === 0, "the real wire serializer preserves health evidence for browser reuse");
  ok(response.headers.get("cache-control") === "public, s-maxage=900, stale-while-revalidate=86400",
    "complete Fall answer retains the existing public CDN policy");
}

{
  const h = await routeHarness({ dealError: new Error("deal source unavailable") });
  const response = await h.GET(new Request("https://wayfind.test/api/events/fall?lat=27.95&lng=-82.46&rail=food&page=0&size=1"));
  const body = await response.json();
  ok(h.observed.loaded && h.observed.usable === false, "one failed source makes an otherwise populated answer ineligible for FastCache");
  ok(response.headers.get("cache-control") === "no-store", "a partial Fall answer cannot enter the CDN");
  ok(body.sourceFailures === 1 && body.rail === "food" && body.cards.length === 1,
    "paged Fall responses carry the honest source failure count with their cards");
}

{
  const historical = {
    today: "2026-09-10", phase: "fall", sourceCount: 1,
    rails: railIds.map((id) => ({ id, title: id, cards: [] })),
  };
  const h = await routeHarness({ cachedValue: historical });
  const response = await h.GET(new Request("https://wayfind.test/api/events/fall?lat=27.95&lng=-82.46"));
  ok(h.observed.usable === false, "historical entry with unknown completeness is rejected by FastCache admission");
  ok(response.headers.get("cache-control") === "no-store", "unknown source health fails closed at the CDN boundary");
}

console.log(`test-fall-cache-completeness: ${checks} runtime assertions passed`);
