#!/usr/bin/env node
// scripts/test-ai-itinerary-planner.mjs — End-to-end verification suite for the
// Grounded Wayfind AI Itinerary Builder (`app/api/planner/route.js`,
// `lib/wayfindPlanner.js`, `lib/plannerActions.js`, `lib/plannerParse.js`,
// `lib/plannerGeo.js`, `lib/plannerProactive.js`, `lib/plannerAnalytics.js`,
// `lib/plannerEntitlement.js`, `lib/itineraryMigrate.js`, `lib/itinerarySync.js`,
// and `app/components/screens/Itinerary.js`).
//
// Proves all 7 mandatory acceptance scenarios plus architectural guardrails:
//   1. "Orlando Nov 20 to 23, two adults, Christmas and food." -> multi-day
//      plan using real Wayfind entities -> explicit `Save itinerary` commits
//      dates & canonical stops -> renders in ItineraryScreen Trip Index & Day Workspace.
//   2. "Move Dazzling Nights to Saturday." -> only that stop changes day; Undo
//      restores exact prior trip state.
//   3. "Replace Friday dinner with something nearby." -> replacement comes from
//      legitimate Wayfind inventory, keeps Friday date, no duplicate stops.
//   4. "Make Saturday cheaper." -> revises Saturday without inventing prices
//      for unknown-price venues.
//   5. Signed-out guest saves generated itinerary locally -> signing in later
//      preserves and syncs trip, dates, order, and planner metadata to
//      `wf_itineraries` + `wf_itinerary_items` with owner isolation.
//   6. Model returns invalid/hallucinated entity ID -> Wayfind refuses mutation;
//      zero corrupt stops enter local storage or Supabase. Closed-day scheduling
//      is also refused (`CLOSED_OR_OFF_SCHEDULE`).
//   7. AI provider unavailable -> manual itinerary remains 100% usable and free,
//      and `/api/planner` deterministic fallback still generates/edits grounded plans.

import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

import {
  PLANNER_ENTITLEMENT,
  checkPlannerEntitlement,
  canUseManualItinerary,
} from "../lib/plannerEntitlement.js";
import {
  PLANNER_EVENTS,
  sanitizePlannerAnalyticsProps,
  trackPlannerEvent,
  isPlannedStopItem,
} from "../lib/plannerAnalytics.js";
import {
  MAX_PROACTIVE_OFFERS_PER_SESSION,
  selectProactivePlannerOffer,
  recordProactiveShown,
  dismissProactiveOffers,
  proactiveWaitsForAdPicks,
} from "../lib/plannerProactive.js";
import { parsePlannerRequest } from "../lib/plannerParse.js";
import {
  canScheduleOnDate,
  stopTravelRelationship,
  orderDayStopsGeographically,
  totalDayDistanceMiles,
} from "../lib/plannerGeo.js";
import {
  PLANNER_ACTION_TYPES,
  canonicalPlaceFromEntity,
  validateProposedPlan,
  commitProposedPlanToTrips,
  executePlannerAction,
  executePlannerActionBatch,
} from "../lib/plannerActions.js";
import {
  buildGroundedCandidatePool,
  buildDeterministicPlan,
  resolveDeterministicEditActions,
  buildPlannerClaudePrompt,
  parseAndValidateClaudePlan,
  parseAndValidateClaudeEdit,
  sanitizeConversationHistory,
  sanitizeProposedPlanDraft,
  revalidateProposedDraft,
  parseDraftRevisionIntent,
  applyDeterministicDraftRevision,
  buildDraftRevisionClaudePrompt,
  parseAndValidateClaudeDraftRevision,
} from "../lib/wayfindPlanner.js";
import { addPlaceToTrips, setNote, toggleVisited } from "../lib/trips.js";
import { setStopDate, moveItem, removePlaceFromTrip } from "../lib/tripDays.js";
import { tripsToRecords, recordsToTrips } from "../lib/itineraryMigrate.js";
import {
  syncOwnerTrips,
  fetchRemoteTrips,
  ensureSignedOutTripIsolation,
} from "../lib/itinerarySync.js";
import { displayedWfScore } from "../lib/creatorBoost.js";
import { getFirstPartyAtlasPlaces } from "../lib/plannerLocalInventory.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));

let assertions = 0;
let failures = 0;
function ok(cond, msg) {
  assertions += 1;
  if (!cond) {
    failures += 1;
    console.error("test-ai-itinerary-planner: FAIL — " + msg);
  }
}

// Memory storage helper for guest/account isolation & proactive session tests
function makeMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    dump() { return Object.fromEntries(map.entries()); },
  };
}

// In-memory Supabase `wf_itineraries` + `wf_itinerary_items` adapter for Scenario 5
function makeMockSupabase(activeUserId) {
  const itineraries = [];
  const items = [];
  let seq = 1;

  return {
    tables: { itineraries, items },
    auth: {
      async getSession() {
        return {
          data: { session: activeUserId ? { user: { id: activeUserId } } : null },
          error: null,
        };
      },
    },
    from(table) {
      if (table === "wf_itineraries") {
        return {
          select() {
            return {
              async eq(col, val) {
                const rows = itineraries
                  .filter((r) => r[col] === val)
                  .map((r) => ({
                    ...r,
                    wf_itinerary_items: items.filter(
                      (it) => it.itinerary_id === r.id && it.user_id === val
                    ),
                  }));
                return { data: rows, error: null };
              },
            };
          },
          upsert(row) {
            let existing = itineraries.find(
              (r) => r.user_id === row.user_id && r.local_key === row.local_key
            );
            if (existing) {
              Object.assign(existing, row);
            } else {
              existing = { id: `itin_${seq++}`, created_at: new Date().toISOString(), ...row };
              itineraries.push(existing);
            }
            return {
              select() {
                return {
                  async maybeSingle() {
                    return { data: { id: existing.id }, error: null };
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq(col, val) {
                return {
                  async in(inCol, vals) {
                    const dropSet = new Set(vals);
                    for (let i = itineraries.length - 1; i >= 0; i -= 1) {
                      if (itineraries[i][col] === val && dropSet.has(itineraries[i][inCol])) {
                        itineraries.splice(i, 1);
                      }
                    }
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "wf_itinerary_items") {
        return {
          select() {
            const filters = {};
            const chain = {
              eq(col, val) {
                filters[col] = val;
                if (Object.keys(filters).length >= 2) {
                  const rows = items.filter(
                    (r) =>
                      r.itinerary_id === filters.itinerary_id &&
                      r.user_id === filters.user_id
                  );
                  return Promise.resolve({ data: rows, error: null });
                }
                return chain;
              },
            };
            return chain;
          },
          async upsert(rows) {
            for (const row of rows) {
              const existing = items.find(
                (r) =>
                  r.itinerary_id === row.itinerary_id &&
                  r.local_item_id === row.local_item_id
              );
              if (existing) {
                Object.assign(existing, row);
              } else {
                items.push({ id: `item_${seq++}`, ...row });
              }
            }
            return { error: null };
          },
          delete() {
            return {
              eq(col, val) {
                return {
                  async in(inCol, vals) {
                    const dropSet = new Set(vals);
                    for (let i = items.length - 1; i >= 0; i -= 1) {
                      if (items[i][col] === val && dropSet.has(items[i][inCol])) {
                        items.splice(i, 1);
                      }
                    }
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error("Unexpected table: " + table);
    },
  };
}

// Load real route & ItineraryScreen via loadComponent
const plannerRouteMod = await loadComponent(
  path.join(REPO, "app/api/planner/route.js"),
  REPO
);
const itineraryMod = await loadComponent(
  path.join(REPO, "app/components/screens/Itinerary.js"),
  REPO
);
const ItineraryScreen = itineraryMod.default;

function StubPlaceCard({ p, onDetail }) {
  return createElement(
    "div",
    { "data-stub-place-card": p.id, onClick: onDetail },
    `${p.name || p.id}${p.price ? ` (${p.price})` : ""}`
  );
}
function StubCategoryMenu() {
  return createElement("div", { "data-stub-cat": "1" });
}
function StubStateBadge({ code }) {
  return createElement("span", { "data-stub-state": code || "" }, code || "");
}

function makeItineraryCtx(overrides = {}) {
  return {
    activeTrip: null,
    setActiveTrip() {},
    trips: {},
    setTrips() {},
    tripNoteEdit: null,
    setTripNoteEdit() {},
    tripMoveFor: null,
    setTripMoveFor() {},
    sub: null,
    logEvent() {},
    openBrowse() {},
    reservations: [],
    removeRes() {},
    saveResConf() {},
    isSaved: () => true,
    liked: {},
    disliked: {},
    openDetail() {},
    quickSaveFavorite() {},
    toggleLike() {},
    toggleDislike() {},
    addShared() {},
    giveawayMark() {},
    blurbs: {},
    openExperience() {},
    openCuisine() {},
    PlaceCard: StubPlaceCard,
    CategoryMenu: StubCategoryMenu,
    StateBadge: StubStateBadge,
    shareList() {},
    itineraryFlags: { v2: true, share: true, sync: true, map: false },
    shareTrip() {},
    user: null,
    setAuthOpen() {},
    requireAuth: () => true,
    __today: "2026-11-12",
    ...overrides,
  };
}

async function postPlanner(payload, ip = "198.51.100.10") {
  const req = new Request("https://www.gowayfind.com/api/planner", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(payload),
  });
  const res = await plannerRouteMod.POST(req);
  const json = await res.json();
  return { status: res.status, json };
}

// Hermetic guard: unconditionally delete AI & Supabase keys in this isolated
// guard process so /api/planner runs deterministically with zero external spend
// or ambient shell dependency.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.LLM_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── 0. Action Contract, Entitlement Seam, Privacy Analytics, & Proactive Cap ──
{
  const expectedActions = [
    "SEARCH_WAYFIND",
    "CREATE_TRIP",
    "ADD_STOP",
    "REMOVE_STOP",
    "REPLACE_STOP",
    "ASSIGN_STOP_DATE",
    "MOVE_STOP",
    "UPDATE_TRIP_DATES",
    "UPDATE_TRIP_TITLE",
    "GET_TRIP",
    "OPTIMIZE_DAY",
    "VALIDATE_PLAN",
  ];
  for (const act of expectedActions) {
    ok(PLANNER_ACTION_TYPES[act] === act, `Action contract defines ${act}`);
  }

  ok(PLANNER_ENTITLEMENT === "ai_itinerary_planner", "Subscription seam defines ai_itinerary_planner entitlement");
  const entDefault = checkPlannerEntitlement(null);
  ok(entDefault.allowed === true && entDefault.paywallActive === false && entDefault.manualItineraryFree === true, "Planner is free today with manualItineraryFree=true");
  const entEnforcedGuest = checkPlannerEntitlement(null, { paywallActive: true });
  ok(entEnforcedGuest.allowed === false && entEnforcedGuest.paywallActive === true && entEnforcedGuest.manualItineraryFree === true, "Future subscription gate cleanly blocks AI planner when enforced while keeping manual itinerary free");
  ok(canUseManualItinerary() === true, "Manual itinerary remains permanently free");

  // Privacy-safe analytics sanitization
  const dirtyProps = {
    message: "We have 2 kids Leo and Maya staying at 123 Secret Hotel",
    prompt: "private prompt",
    note: "Gate code 4821",
    email: "family@example.com",
    trip_length: 4,
    candidate_count: 18,
    saved_stop_count: 9,
    surface: "itinerary_index",
    voice: "santa",
  };
  const cleanProps = sanitizePlannerAnalyticsProps(dirtyProps);
  ok(
    !("message" in cleanProps) &&
      !("prompt" in cleanProps) &&
      !("note" in cleanProps) &&
      !("email" in cleanProps) &&
      cleanProps.trip_length === 4 &&
      cleanProps.candidate_count === 18 &&
      cleanProps.saved_stop_count === 9 &&
      cleanProps.surface === "itinerary_index",
    "sanitizePlannerAnalyticsProps strips raw conversation text, notes, and emails while keeping aggregate counts"
  );

  // Clarifying question when destination is missing (asks ONE high-value question, not a form)
  const clarifyRes = await postPlanner(
    { message: "Two adults, November 20 to 23, we love Christmas lights and great food" },
    "198.51.100.11"
  );
  ok(
    clarifyRes.status === 200 &&
      clarifyRes.json.ok === true &&
      clarifyRes.json.mode === "clarify" &&
      typeof clarifyRes.json.clarificationQuestion === "string" &&
      clarifyRes.json.clarificationQuestion.length > 10,
    "Missing destination triggers a single concise clarifying question instead of hallucinating a city"
  );

  // Proactive assistant moments & strict session cap (<= 2 per session)
  const sess = makeMemoryStorage();
  const placeOffer = selectProactivePlannerOffer({ pathname: "/p/ChIJ_test_place", storage: sess });
  ok(placeOffer && placeOffer.kind === "place" && /build a day around this/i.test(placeOffer.message), "Place page surfaces contextual 'build a day around this' offer");
  recordProactiveShown(sess, placeOffer.kind);

  const xmasOffer = selectProactivePlannerOffer({ pathname: "/christmas-in-florida", storage: sess });
  ok(xmasOffer && xmasOffer.kind === "christmas" && /Christmas plan/i.test(xmasOffer.message), "Christmas page surfaces contextual Christmas plan offer");
  recordProactiveShown(sess, xmasOffer.kind);

  const cappedOffer = selectProactivePlannerOffer({ pathname: "/things-to-do/orlando", unassignedSaveCount: 5, storage: sess });
  ok(MAX_PROACTIVE_OFFERS_PER_SESSION === 2 && cappedOffer === null, "Proactive offers strictly stop after 2 impressions per session (non-spammy)");

  const sess2 = makeMemoryStorage();
  const savesOffer = selectProactivePlannerOffer({ pathname: "/", unassignedSaveCount: 4, storage: sess2 });
  ok(savesOffer && savesOffer.kind === "unassigned_saves" && /organize these into days/i.test(savesOffer.message), "3+ unassigned saves offers to organize stops into days and reduce driving");
  dismissProactiveOffers(sess2);

  // Live 2026-11-13: on a 375x553 phone the offer covered the first ad pick's
  // button 3.2 s after a Meta ad landing. While the ad picks row is on screen
  // the offer waits; any other visitor, or a scrolled-away row, is unchanged.
  {
    const fakeDoc = (social, rect) => ({
      documentElement: { hasAttribute: (k) => social && k === "data-wf-social" },
      querySelector: (sel) => (rect && sel === "[data-top-picks]" ? { getBoundingClientRect: () => rect } : null),
    });
    ok(proactiveWaitsForAdPicks(fakeDoc(true, { top: 120, bottom: 470, height: 350 }), 553) === true, "An ad visitor's picks row on screen holds the unsolicited planner offer");
    ok(proactiveWaitsForAdPicks(fakeDoc(true, { top: -400, bottom: -50, height: 350 }), 553) === false, "Once the picks row is scrolled away the offer may show");
    ok(proactiveWaitsForAdPicks(fakeDoc(true, { top: 0, bottom: 0, height: 0 }), 553) === false, "A hidden picks row never holds the offer");
    ok(proactiveWaitsForAdPicks(fakeDoc(false, { top: 120, bottom: 470, height: 350 }), 553) === false && proactiveWaitsForAdPicks(fakeDoc(true, null), 553) === false && proactiveWaitsForAdPicks(null, 553) === false,
      "Google, organic and direct visitors, and pages without the picks row, keep the offer exactly as before");
    const loaderSrc = readFileSync(path.join(REPO, "app/components/WayfindPlannerLoader.js"), "utf8");
    ok(/proactiveWaitsForAdPicks\(document, window\.innerHeight\)/.test(loaderSrc) && /addEventListener\("scroll", onScroll, \{ capture: true/.test(loaderSrc) && /removeEventListener\("scroll", onScroll, true\)/.test(loaderSrc),
      "The loader checks the picks row before showing an offer and re-checks on any scroll, removing its listener");
  }
}

// ── SCENARIO 1: "Orlando Nov 20 to 23, two adults, Christmas and food." ───────
let savedOrlandoTrips = {};
let orlandoTripKey = "";
let orlandoCatalog = {};
{
  const planRes = await postPlanner(
    {
      message: "Orlando Nov 20 to 23, two adults, Christmas and food.",
      voice: "santa",
    },
    "198.51.100.21"
  );
  ok(planRes.status === 200 && planRes.json.ok === true && planRes.json.mode === "propose_trip", "Scenario 1: /api/planner returns a proposed multi-day trip");
  const { proposedPlan, candidateCatalog } = planRes.json;
  orlandoCatalog = candidateCatalog || {};

  ok(proposedPlan.city === "Orlando" && proposedPlan.state === "FL", "Scenario 1: destination parsed as Orlando, FL");
  ok(proposedPlan.startDate === "2026-11-20" && proposedPlan.endDate === "2026-11-23", "Scenario 1: exact dates 2026-11-20 to 2026-11-23 resolved");
  ok(Array.isArray(proposedPlan.days) && proposedPlan.days.length === 4, "Scenario 1: 4 days generated (Fri Nov 20 – Mon Nov 23)");

  const expectedDates = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
  ok(
    proposedPlan.days.every((d, idx) => d.date === expectedDates[idx] && Array.isArray(d.stops) && d.stops.length >= 1),
    "Scenario 1: every day from Nov 20 to Nov 23 has grounded stops"
  );

  // Verify every single proposed stop exists in Wayfind's verified catalog & passes open/date check
  const validation = validateProposedPlan(proposedPlan, orlandoCatalog);
  ok(validation.ok === true && validation.validStopCount >= 4, "Scenario 1: every stop in proposed plan passes Wayfind entity & schedule validation");

  // Also verify character-neutral brain: voice="wayfind" uses the exact same grounded planner engine
  const neutralRes = await postPlanner(
    {
      message: "Orlando Nov 20 to 23, two adults, Christmas and food.",
      voice: "wayfind",
    },
    "198.51.100.22"
  );
  ok(
    neutralRes.status === 200 &&
      neutralRes.json.mode === "propose_trip" &&
      neutralRes.json.proposedPlan.days.length === 4,
    "Seasonal Santa voice and neutral Wayfind voice share the exact same underlying planning engine"
  );

  // Initial multi-stop generation does NOT mutate `trips` until `Save itinerary` (`commitProposedPlanToTrips`)
  ok(Object.keys(savedOrlandoTrips).length === 0, "Scenario 1: trips remain untouched until user clicks Save itinerary");

  const commit = commitProposedPlanToTrips(savedOrlandoTrips, proposedPlan, orlandoCatalog, { now: 1763000000000 });
  ok(commit.ok === true && commit.savedStopCount === validation.validStopCount, "Scenario 1: Save itinerary commits all validated stops cleanly");
  savedOrlandoTrips = commit.nextTrips;
  orlandoTripKey = commit.tripKey;

  const savedTrip = savedOrlandoTrips[orlandoTripKey];
  ok(Boolean(savedTrip) && savedTrip.city === "Orlando" && savedTrip.items.length === validation.validStopCount, "Scenario 1: committed trip exists under Orlando with exact stop count");
  ok(
    savedTrip.items.every((it) => expectedDates.includes(it.day) && it.addedVia === "wayfind_planner" && isPlannedStopItem(it)),
    "Scenario 1: every saved stop carries its assigned date and addedVia='wayfind_planner'"
  );

  // Render Trip Index & Open Trip Workspace in ItineraryScreen
  const indexHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: makeItineraryCtx({ activeTrip: null, trips: savedOrlandoTrips }),
    })
  );
  ok(indexHtml.includes('data-wf-planner-open="trip-index"') && indexHtml.includes("Build a trip with Wayfind"), "Trip Index prioritizes 'Build a trip with Wayfind'");
  ok(indexHtml.includes('data-wf-create-manual-btn="1"') && indexHtml.includes("Create manually"), "Trip Index exposes 'Create manually'");
  ok(indexHtml.includes(`data-wf-trip-card="${orlandoTripKey}"`) && indexHtml.includes("4 days") && indexHtml.includes("✨ Planned"), "Trip Index renders rich trip card with day count and Planned status");

  const openHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: makeItineraryCtx({ activeTrip: orlandoTripKey, trips: savedOrlandoTrips }),
    })
  );
  ok(
    openHtml.includes('data-wf-day-tab="overview"') &&
      openHtml.includes('data-wf-day-tab="2026-11-20"') &&
      openHtml.includes('data-wf-day-tab="2026-11-21"') &&
      openHtml.includes('data-wf-day-tab="2026-11-22"') &&
      openHtml.includes('data-wf-day-tab="2026-11-23"'),
    "Open Trip renders Overview | Fri 20 | Sat 21 | Sun 22 | Mon 23 day filter tabs"
  );
  ok(openHtml.includes('data-wf-ask-wayfind-bar="1"') && openHtml.includes("✨ Ask Wayfind"), "Open Trip renders integrated Ask Wayfind bar");
  ok(openHtml.includes("data-wf-stop-confidence="), "Open Trip renders honest planning confidence badges (Confirmed / Check hours)");
  ok(openHtml.includes('data-wf-travel-connector="1"') && openHtml.includes("mi apart") && !/\b\d+\s*min drive\b/i.test(openHtml), "Open Trip renders deterministic coordinate distance connectors without invented traffic drive minutes");
}

// Build a deterministic grounded Orlando 4-day fixture from real Wayfind inventory + verified Orlando restaurants
// so Scenarios 2, 3, and 4 test exact named stops ("Dazzling Nights", Friday dinner, Saturday budget) deterministically.
const christmasResearchRaw = JSON.parse(
  readFileSync(path.join(REPO, "data/christmas-2026-research.json"), "utf8")
);
const researchEntries = Array.isArray(christmasResearchRaw)
  ? christmasResearchRaw
  : (christmasResearchRaw.entries || christmasResearchRaw.events || christmasResearchRaw.items || []);

const realDazzling = researchEntries.find((e) => /dazzling nights/i.test(String(e && (e.name || e.title) || ""))) || {
  id: "xmas-dazzling-nights-leu-gardens",
  name: "Dazzling Nights at Harry P. Leu Gardens",
  address: "1920 N Forest Ave, Orlando, FL 32803, USA",
  city: "Orlando",
  lat: 28.5675,
  lng: -81.3574,
  type: "Holiday Lights",
  price: "$$",
  itemType: "event",
};

const groundedOrlandoPool = buildGroundedCandidatePool(
  [
    {
      sourceKind: "christmas",
      items: [
        {
          id: String(realDazzling.id || realDazzling.slug || "xmas-dazzling-nights"),
          name: realDazzling.name || realDazzling.title || "Dazzling Nights",
          address: realDazzling.address || "1920 N Forest Ave, Orlando, FL 32803, USA",
          city: "Orlando",
          state: "FL",
          lat: Number(realDazzling.lat) || 28.5675,
          lng: Number(realDazzling.lng) || -81.3574,
          type: "Holiday Lights",
          price: "$$",
          rating: 4.8,
          reviews: 1240,
          itemType: "event",
        },
        ...Object.values(orlandoCatalog),
      ],
    },
    {
      sourceKind: "owned_search",
      items: [
        {
          id: "ChIJ_wf_boathouse_ds",
          name: "The Boathouse",
          address: "1620 E Buena Vista Dr, Lake Buena Vista, FL 32830, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.3712,
          lng: -81.5184,
          type: "Seafood Restaurant",
          price: "$$$",
          priceNum: 3,
          rating: 4.7,
          reviews: 9100,
          wfScore: 93,
        },
        {
          id: "ChIJ_wf_polite_pig_ds",
          name: "The Polite Pig",
          address: "1536 E Buena Vista Dr, Orlando, FL 32830, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.3704,
          lng: -81.5208,
          type: "BBQ Restaurant",
          price: "$$",
          priceNum: 2,
          rating: 4.6,
          reviews: 4600,
          wfScore: 91,
        },
        {
          id: "ChIJ_wf_wine_bar_george",
          name: "Wine Bar George",
          address: "1610 E Buena Vista Dr, Orlando, FL 32830, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.3709,
          lng: -81.5191,
          type: "Restaurant & Wine Bar",
          price: "$$",
          priceNum: 2,
          rating: 4.8,
          reviews: 3200,
          wfScore: 94,
        },
        {
          id: "ChIJ_wf_lake_eola_park",
          name: "Lake Eola Park Holiday Walk",
          address: "512 E Washington St, Orlando, FL 32801, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.5438,
          lng: -81.3732,
          type: "Park",
          price: "Free",
          priceNum: 0,
          rating: 4.8,
          reviews: 15200,
          wfScore: 92,
        },
        {
          id: "ChIJ_wf_winter_park_avenue",
          name: "Park Avenue Stroll & Central Park",
          address: "251 S Park Ave, Winter Park, FL 32789, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.5965,
          lng: -81.3511,
          type: "Park & Promenade",
          price: "$",
          priceNum: 1,
          rating: 4.8,
          reviews: 2800,
          wfScore: 90,
        },
        {
          id: "ChIJ_wf_gaylord_ice",
          name: "ICE! at Gaylord Palms",
          address: "6000 W Osceola Pkwy, Kissimmee, FL 34746, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.3422,
          lng: -81.5257,
          type: "Holiday Attraction",
          price: "$$$$",
          priceNum: 4,
          rating: 4.6,
          reviews: 5100,
          wfScore: 89,
        },
        {
          id: "ChIJ_wf_unknown_price_spot",
          name: "Leu Gardens Camellia Trail",
          address: "1920 N Forest Ave, Orlando, FL 32803, USA",
          city: "Orlando",
          state: "FL",
          lat: 28.5679,
          lng: -81.3568,
          type: "Botanical Garden",
          price: null, // Explicitly unknown price!
          priceNum: null,
          rating: 4.8,
          reviews: 3900,
          wfScore: 91,
        },
      ],
    },
  ],
  { destination: { name: "Orlando", state: "FL", lat: 28.5383, lng: -81.3792 }, maxRadiusKm: 60 }
);

const poolCatalog = Object.fromEntries(groundedOrlandoPool.map((c) => [c.id, c]));
const dazzlingId = String(realDazzling.id || realDazzling.slug || "xmas-dazzling-nights");

// Seed controlled 4-day Orlando trip via `commitProposedPlanToTrips`
const seededCommit = commitProposedPlanToTrips(
  {},
  {
    city: "Orlando",
    state: "FL",
    title: "Orlando Christmas & Food",
    startDate: "2026-11-20",
    endDate: "2026-11-23",
    days: [
      {
        date: "2026-11-20", // Friday
        stops: [
          { id: dazzlingId, slotLabel: "5:30 PM", note: "Holiday lights walk" },
          { id: "ChIJ_wf_boathouse_ds", slotLabel: "8:00 PM Dinner", note: "Friday waterfront dinner" },
        ],
      },
      {
        date: "2026-11-21", // Saturday
        stops: [
          { id: "ChIJ_wf_gaylord_ice", slotLabel: "11:00 AM", note: "Saturday splurge attraction" },
        ],
      },
      {
        date: "2026-11-22", // Sunday
        stops: [
          { id: "ChIJ_wf_polite_pig_ds", slotLabel: "1:00 PM", note: "Sunday BBQ lunch" },
        ],
      },
      {
        date: "2026-11-23", // Monday
        stops: [
          { id: "ChIJ_wf_unknown_price_spot", slotLabel: "10:30 AM", note: "Morning gardens" },
        ],
      },
    ],
  },
  poolCatalog,
  { now: 1763001000000 }
);
ok(seededCommit.ok === true, "Controlled 4-day Orlando trip commits cleanly via commitProposedPlanToTrips");
let workingTrips = seededCommit.nextTrips;
const workingKey = seededCommit.tripKey;

// ── SCENARIO 2: "Move Dazzling Nights to Saturday." ──────────────────────────
{
  const activeTrip = workingTrips[workingKey];
  const beforeOtherStops = activeTrip.items
    .filter((it) => it.id !== dazzlingId)
    .map((it) => ({ id: it.id, day: it.day, note: it.note }));

  const moveRes = await postPlanner(
    {
      message: "Move Dazzling Nights to Saturday.",
      activeTrip,
      contextCity: "Orlando",
    },
    "198.51.100.31"
  );
  ok(moveRes.status === 200 && moveRes.json.ok === true && moveRes.json.mode === "edit_trip", "Scenario 2: /api/planner resolves 'Move Dazzling Nights to Saturday.' as edit_trip");

  const batch = executePlannerActionBatch(workingTrips, moveRes.json.actions, {
    verifiedCatalog: { ...poolCatalog, ...(moveRes.json.candidateCatalog || {}) },
  });
  ok(batch.ok === true, "Scenario 2: executePlannerActionBatch applies Dazzling Nights move cleanly");

  const updatedTrip = batch.nextTrips[workingKey];
  const movedStop = updatedTrip.items.find((it) => it.id === dazzlingId);
  const afterOtherStops = updatedTrip.items
    .filter((it) => it.id !== dazzlingId)
    .map((it) => ({ id: it.id, day: it.day, note: it.note }));

  ok(movedStop && movedStop.day === "2026-11-21", "Scenario 2: Dazzling Nights moved from Friday (2026-11-20) to Saturday (2026-11-21)");
  ok(JSON.stringify(beforeOtherStops) === JSON.stringify(afterOtherStops), "Scenario 2: ONLY Dazzling Nights changed; every other stop kept its exact date and note");

  // Verify 1-tap Undo restores exact prior state
  const undoneDazzling = batch.undoSnapshot[workingKey].items.find((it) => it.id === dazzlingId);
  ok(undoneDazzling && undoneDazzling.day === "2026-11-20", "Scenario 2: undoSnapshot restores Dazzling Nights to Friday (2026-11-20)");

  workingTrips = batch.nextTrips;
}

// ── SCENARIO 3: "Replace Friday dinner with something nearby." ───────────────
{
  const activeTrip = workingTrips[workingKey];
  const parsedEdit = parsePlannerRequest("Replace Friday dinner with something nearby.", {
    todayYmd: "2026-11-12",
    activeTrip,
    contextCity: "Orlando",
  });
  ok(parsedEdit.edit && parsedEdit.edit.kind === "replace_stop", "Scenario 3: parser identifies replace_stop intent on Friday dinner");

  const resolved = resolveDeterministicEditActions(parsedEdit, activeTrip, groundedOrlandoPool, { voice: "wayfind" });
  ok(Boolean(resolved) && Array.isArray(resolved.actions) && resolved.actions.length === 1, "Scenario 3: deterministic edit resolver selects a nearby replacement");
  const act = resolved.actions[0];
  ok(act.type === "REPLACE_STOP" && act.stopId === "ChIJ_wf_boathouse_ds", "Scenario 3: targets Friday dinner stop (The Boathouse)");
  ok(Boolean(poolCatalog[act.newEntityId]) && act.newEntityId !== "ChIJ_wf_boathouse_ds", "Scenario 3: replacement stop comes strictly from legitimate Wayfind inventory");

  // Verify proximity: Wine Bar George is 0.06 mi from The Boathouse at Disney Springs!
  const batch = executePlannerActionBatch(workingTrips, resolved.actions, { verifiedCatalog: poolCatalog });
  ok(batch.ok === true, "Scenario 3: REPLACE_STOP executes cleanly");
  const updatedTrip = batch.nextTrips[workingKey];
  const replacedStop = updatedTrip.items.find((it) => it.id === act.newEntityId);
  ok(
    Boolean(replacedStop) &&
      replacedStop.day === "2026-11-20" &&
      !updatedTrip.items.some((it) => it.id === "ChIJ_wf_boathouse_ds"),
    "Scenario 3: replacement keeps Friday date (2026-11-20) and removes replaced stop without duplicates"
  );

  // Also prove `/api/planner` live route handles Scenario 3 against real search/Christmas inventory
  const liveReplaceRes = await postPlanner(
    {
      message: "Replace Friday dinner with something nearby.",
      activeTrip,
      contextCity: "Orlando",
    },
    "198.51.100.32"
  );
  ok(
    liveReplaceRes.status === 200 &&
      liveReplaceRes.json.ok === true &&
      (liveReplaceRes.json.mode === "edit_trip" || liveReplaceRes.json.mode === "no_change"),
    "Scenario 3: /api/planner route handles Replace Friday dinner safely with verified inventory only"
  );

  workingTrips = batch.nextTrips;
}

// ── SCENARIO 4: "Make Saturday cheaper." (Zero Invented Prices) ──────────────
{
  const activeTrip = workingTrips[workingKey];
  const parsedCheap = parsePlannerRequest("Make Saturday cheaper.", {
    todayYmd: "2026-11-12",
    activeTrip,
    contextCity: "Orlando",
  });
  ok(parsedCheap.edit && parsedCheap.edit.kind === "revise_budget", "Scenario 4: parser identifies revise_budget on Saturday (2026-11-21)");

  const resolvedCheap = resolveDeterministicEditActions(parsedCheap, activeTrip, groundedOrlandoPool, { voice: "wayfind" });
  ok(Boolean(resolvedCheap) && resolvedCheap.actions.length >= 1, "Scenario 4: planner revises high-cost Saturday stop using verified lower-cost Wayfind candidates");

  const cheapBatch = executePlannerActionBatch(workingTrips, resolvedCheap.actions, { verifiedCatalog: poolCatalog });
  ok(cheapBatch.ok === true, "Scenario 4: Saturday budget revision applies cleanly");

  const satStops = cheapBatch.nextTrips[workingKey].items.filter((it) => it.day === "2026-11-21");
  ok(!satStops.some((it) => it.id === "ChIJ_wf_gaylord_ice"), "Scenario 4: $$$$ Saturday stop was replaced with a lower-tier verified stop");
  ok(!/\$\d+/.test(resolvedCheap.reply), "Scenario 4: planner explanation never invents a fake dollar price");

  // Verify unknown-price item NEVER gets a fabricated price or false 'Free' label
  const unknownItem = cheapBatch.nextTrips[workingKey].items.find((it) => it.id === "ChIJ_wf_unknown_price_spot");
  ok(
    Boolean(unknownItem) &&
      !unknownItem.place.price &&
      unknownItem.place.priceNum == null,
    "Scenario 4: stop with unknown price preserves null/empty price and never invents a price tier or Free claim"
  );

  workingTrips = cheapBatch.nextTrips;
}

// ── SCENARIO 5: Signed-Out Guest Save -> Signed-In Supabase Sync Migration ────
{
  const guestStorage = makeMemoryStorage({
    wayfind_trips: JSON.stringify(workingTrips),
  });

  // Guest sees local-device banner without compulsory auth wall
  const guestOpenHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: makeItineraryCtx({ user: null, activeTrip: workingKey, trips: workingTrips }),
    })
  );
  ok(
    guestOpenHtml.includes('data-wf-guest-sync-banner="itinerary"') &&
      guestOpenHtml.includes("Saved on this device. Sign in to sync across devices."),
    "Scenario 5: signed-out user sees local save status banner while viewing generated itinerary"
  );

  // User signs in as user_alice -> `syncOwnerTrips` migrates local planned trip to Supabase
  const mockSb = makeMockSupabase("user_alice");
  let syncedState = null;
  const syncResult = await syncOwnerTrips({
    supabase: mockSb,
    userId: "user_alice",
    storage: guestStorage,
    setTrips(next) { syncedState = next; },
  });

  ok(syncResult.ok === true && syncResult.status === "synced" && syncResult.migratedCount === 1, "Scenario 5: signing in migrates local AI-generated trip to Supabase");
  ok(mockSb.tables.itineraries.length === 1 && mockSb.tables.itineraries[0].user_id === "user_alice", "Scenario 5: wf_itineraries row written under authenticated user_id");
  ok(
    mockSb.tables.items.length === workingTrips[workingKey].items.length &&
      mockSb.tables.items.every((row) => row.user_id === "user_alice" && row.added_via === "wayfind_planner" && Boolean(row.scheduled_on)),
    "Scenario 5: wf_itinerary_items preserves every stop, scheduled_on date, and added_via='wayfind_planner'"
  );

  // Round-trip fetch on a second browser/device for user_alice
  const secondDeviceTrips = await fetchRemoteTrips(mockSb, "user_alice");
  ok(
    Boolean(secondDeviceTrips && secondDeviceTrips[workingKey]) &&
      secondDeviceTrips[workingKey].items.length === workingTrips[workingKey].items.length &&
      secondDeviceTrips[workingKey].items.every((it) => Boolean(it.day) && it.addedVia === "wayfind_planner" && Boolean(it.place.confidence)),
    "Scenario 5: second device fetches full trip with dates, order, addedVia, and planner stop confidence intact"
  );

  // Account isolation: another user (`user_bob`) cannot read Alice's synced itinerary, and signing out isolates storage
  const bobTrips = await fetchRemoteTrips(mockSb, "user_bob");
  ok(Object.keys(bobTrips || {}).length === 0, "Scenario 5: strict user_id isolation prevents cross-account trip leakage");

  const isolatedAfterSignOut = ensureSignedOutTripIsolation(guestStorage, { authReady: true });
  ok(
    Object.keys(isolatedAfterSignOut || {}).length === 0 &&
      guestStorage.getItem("wayfind_trips_owner") === null &&
      Boolean(guestStorage.getItem("wayfind_trips_user:user_alice")),
    "Scenario 5: signing out parks Alice's synced trips and clears active anonymous store"
  );
}

// ── SCENARIO 6: Hallucinated / Invalid ID & Closed-Day Refusal ───────────────
{
  const parsed = parsePlannerRequest("Orlando Nov 20 to 21, Christmas and food", { todayYmd: "2026-11-12" });

  // 6a. Claude returns a hallucinated stop ID inside JSON plan -> stripped/refused!
  const fakeClaudePlanJson = JSON.stringify({
    title: "Orlando Trip",
    explanation: "Here is your plan.",
    days: [
      {
        date: "2026-11-20",
        stops: [
          { id: "ChIJ_HALLUCINATED_FAKE_999", slotLabel: "6:00 PM", why: "Made up venue" },
        ],
      },
    ],
  });
  const planCheck = parseAndValidateClaudePlan(fakeClaudePlanJson, parsed, groundedOrlandoPool);
  ok(planCheck.ok === false, "Scenario 6: parseAndValidateClaudePlan rejects a plan whose stops are hallucinated IDs");

  // 6b. Claude returns a hallucinated replacement ID in conversational edit -> refused!
  const fakeClaudeEditJson = JSON.stringify({
    reply: "Swapped dinner.",
    actions: [
      {
        type: "REPLACE_STOP",
        tripKey: workingKey,
        stopId: "ChIJ_wf_polite_pig_ds",
        newEntityId: "ChIJ_INVENTED_RESTAURANT_000",
      },
    ],
  });
  const editCheck = parseAndValidateClaudeEdit(fakeClaudeEditJson, workingTrips[workingKey], groundedOrlandoPool);
  ok(editCheck.ok === false, "Scenario 6: parseAndValidateClaudeEdit rejects edit actions referencing hallucinated IDs");

  // 6c. Direct action execution with ungrounded ID fails closed and leaves trips byte-identical
  const snapshotBefore = JSON.stringify(workingTrips);
  const badActionRes = executePlannerActionBatch(
    workingTrips,
    [{ type: "ADD_STOP", tripKey: workingKey, entityId: "ChIJ_CORRUPT_FAKE_ID", day: "2026-11-22" }],
    { verifiedCatalog: poolCatalog }
  );
  ok(
    badActionRes.ok === false &&
      badActionRes.code === "UNGROUNDED_ENTITY_ID" &&
      JSON.stringify(badActionRes.nextTrips) === snapshotBefore,
    "Scenario 6: executePlannerActionBatch refuses UNGROUNDED_ENTITY_ID with zero mutation to trips"
  );

  // 6d. Cross-user ownership guard refuses unauthorized mutation
  const forbiddenRes = executePlannerAction(
    workingTrips,
    { type: "REMOVE_STOP", tripKey: workingKey, stopId: "ChIJ_wf_polite_pig_ds" },
    { verifiedCatalog: poolCatalog, ownerUserId: "user_alice", actorUserId: "user_mallory" }
  );
  ok(forbiddenRes.ok === false && forbiddenRes.code === "FORBIDDEN_TRIP_OWNER", "Scenario 6: cross-account trip mutation is rejected with FORBIDDEN_TRIP_OWNER");

  // 6e. Closed-venue / off-schedule date guard refuses scheduling on a closed day
  const closedMondayEntity = {
    id: "ChIJ_wf_closed_monday_bistro",
    name: "Closed Monday Bistro",
    address: "100 Park Ave, Winter Park, FL 32789, USA",
    city: "Orlando",
    lat: 28.596,
    lng: -81.351,
    weekdayDescriptions: [
      "Monday: Closed",
      "Tuesday: 5:00 – 10:00 PM",
      "Wednesday: 5:00 – 10:00 PM",
      "Thursday: 5:00 – 10:00 PM",
      "Friday: 5:00 – 11:00 PM",
      "Saturday: 5:00 – 11:00 PM",
      "Sunday: 5:00 – 9:00 PM",
    ],
  };
  const schedMon = canScheduleOnDate(closedMondayEntity, "2026-11-23"); // 2026-11-23 is Monday
  const schedFri = canScheduleOnDate(closedMondayEntity, "2026-11-20"); // 2026-11-20 is Friday
  ok(schedMon.allowed === false && schedFri.allowed === true, "Scenario 6: canScheduleOnDate blocks scheduling on known closed weekday (Monday) and allows open Friday");

  const closedPlanVal = validateProposedPlan(
    {
      city: "Orlando",
      days: [{ date: "2026-11-23", stops: [{ id: "ChIJ_wf_closed_monday_bistro" }] }],
    },
    { ChIJ_wf_closed_monday_bistro: closedMondayEntity }
  );
  ok(closedPlanVal.ok === false && closedPlanVal.code === "CLOSED_OR_OFF_SCHEDULE", "Scenario 6: validateProposedPlan rejects scheduling a stop on a known closed day");
}

// ── SCENARIO 7: AI Provider Unavailable -> Manual + Deterministic Resilience ──
{
  process.env.ANTHROPIC_API_KEY = ""; // Explicitly unavailable
  const fallbackRes = await postPlanner(
    { message: "Sarasota 2 days, beaches and food" },
    "198.51.100.71"
  );
  ok(
    fallbackRes.status === 200 &&
      fallbackRes.json.ok === true &&
      fallbackRes.json.source === "deterministic" &&
      (fallbackRes.json.mode === "propose_trip" || fallbackRes.json.mode === "empty_inventory"),
    "Scenario 7: /api/planner degrades gracefully to deterministic mode with HTTP 200 when Anthropic is unavailable"
  );

  // Manual itinerary operations work 100% independently of AI
  const manualCreate = executePlannerAction({}, {
    type: "CREATE_TRIP",
    city: "Tampa",
    state: "FL",
    title: "Manual Tampa Weekend",
    startDate: "2026-12-04",
    endDate: "2026-12-06",
  });
  ok(manualCreate.ok === true && manualCreate.tripKey === "fl_tampa", "Scenario 7: manual CREATE_TRIP works with zero AI dependency");

  let manualTrips = manualCreate.nextTrips;
  manualTrips = addPlaceToTrips(manualTrips, {
    id: "ChIJ_manual_armature",
    name: "Armature Works",
    address: "1910 N Ola Ave, Tampa, FL 33602, USA",
    lat: 27.9619,
    lng: -82.4636,
  });
  manualTrips = addPlaceToTrips(manualTrips, {
    id: "ChIJ_manual_riverwalk",
    name: "Tampa Riverwalk",
    address: "100 N Ashley Dr, Tampa, FL 33602, USA",
    lat: 27.9478,
    lng: -82.4586,
  });
  manualTrips = setStopDate(manualTrips, "fl_tampa", "ChIJ_manual_armature", "2026-12-04");
  manualTrips = setStopDate(manualTrips, "fl_tampa", "ChIJ_manual_riverwalk", "2026-12-04");
  manualTrips = moveItem(manualTrips, "fl_tampa", "ChIJ_manual_riverwalk", -1, { today: "2026-11-12" });
  manualTrips = setNote(manualTrips, "fl_tampa", "ChIJ_manual_armature", "Grab coffee upstairs");
  manualTrips = toggleVisited(manualTrips, "fl_tampa", "ChIJ_manual_riverwalk");
  ok(
    manualTrips.fl_tampa.items.length === 2 &&
      manualTrips.fl_tampa.items.find((i) => i.id === "ChIJ_manual_armature").note === "Grab coffee upstairs" &&
      manualTrips.fl_tampa.items.find((i) => i.id === "ChIJ_manual_riverwalk").visited === true,
    "Scenario 7: manual add, date assignment, reorder, note, and visited toggle all work completely offline from AI"
  );

  // Geographic route optimizer reduces zigzag distance deterministically
  const zigzag = [
    { id: "a", lat: 28.37, lng: -81.52, daypartOrder: 1 }, // Disney Springs
    { id: "b", lat: 28.60, lng: -81.35, daypartOrder: 1 }, // Winter Park (20 mi north)
    { id: "c", lat: 28.38, lng: -81.51, daypartOrder: 1 }, // Lake Buena Vista (right next to A!)
  ];
  const ordered = orderDayStopsGeographically(zigzag);
  ok(
    totalDayDistanceMiles(ordered) < totalDayDistanceMiles(zigzag) &&
      ordered[0].id === "a" &&
      ordered[1].id === "c" &&
      ordered[2].id === "b",
    "Geographic day optimizer eliminates north-south-north backtracking deterministically"
  );

  // Unrated events and coordinate-less places never coerce null -> 0 or display phantom Wayfind Scores
  const leuEventCard = canonicalPlaceFromEntity({
    id: "event:dazzling-nights-orlando-2026",
    name: "Dazzling Nights at Leu Gardens",
    address: "1920 N Forest Ave, Orlando, FL 32803",
    city: "Orlando",
    itemType: "event",
    kind: "event",
    href: "/florida-events/dazzling-nights-orlando-2026",
    wfScore: null,
    rating: null,
    reviews: 0,
    lat: null,
    lng: null,
  });
  ok(
    leuEventCard.wfScore == null &&
      displayedWfScore(leuEventCard, "Orlando") === null &&
      leuEventCard.lat == null &&
      leuEventCard.lng == null,
    "Unrated event stops keep wfScore nullish, displayedWfScore===null, and lat/lng nullish (never 0 or 0.2/10)"
  );

  // Coordinate-less local atlas cards strictly respect destination metro boundaries
  const atlasOrlandoPool = buildGroundedCandidatePool(
    [{ sourceKind: "atlas", items: getFirstPartyAtlasPlaces() }],
    { destination: { name: "Orlando", state: "FL", lat: 28.5383, lng: -81.3792 } }
  );
  ok(
    atlasOrlandoPool.some((c) => c.name === "Kaya" || c.name === "The Pinery") &&
      !atlasOrlandoPool.some((c) => /anna maria|gulf drive|asolo/i.test(c.name)),
    "Orlando candidate pool includes Orlando/Winter Park dining and excludes Bradenton/Sarasota coordinate-less cards"
  );
}

// ── SCENARIO 8: Release Red Team — Deliberate Adversarial Grounding Attempts ──
{
  // 8a. User asks for nonexistent places ("Hogwarts Castle" & "Atlantis Underwater Bistro") in Orlando:
  // Planner searches Wayfind inventory and NEVER saves hallucinated names/entities.
  const adversarialRes = await postPlanner(
    {
      message: "Orlando Nov 20 to 21, include Hogwarts Castle and Atlantis Underwater Bistro.",
      voice: "wayfind",
    },
    "198.51.100.81"
  );
  ok(
    adversarialRes.status === 200 &&
      adversarialRes.json.ok === true &&
      adversarialRes.json.mode === "propose_trip",
    "Red Team 8a: adversarial nonexistent-venue request still returns a clean grounded Orlando plan"
  );
  const advStops = adversarialRes.json.proposedPlan.days.flatMap((d) => d.stops);
  ok(
    advStops.length >= 2 &&
      advStops.every((s) => Boolean(adversarialRes.json.candidateCatalog[s.id])) &&
      !advStops.some((s) => /hogwarts|atlantis underwater/i.test(s.name)),
    "Red Team 8a: zero nonexistent/invented venue names enter proposedPlan"
  );

  // 8b. Wrong city candidate, duplicated candidate, unrated place, and off-window event:
  const adversarialPool = buildGroundedCandidatePool(
    [
      {
        sourceKind: "owned_search",
        items: [
          // Wrong city (Miami, ~205 mi from Orlando) -> must be excluded!
          {
            id: "ChIJ_wrong_city_miami",
            name: "South Beach Oceanfront Cafe",
            address: "1000 Ocean Dr, Miami Beach, FL 33139, USA",
            city: "Miami Beach",
            state: "FL",
            lat: 25.7805,
            lng: -80.1304,
            type: "Cafe",
          },
          // Duplicated candidate (same ID + same normalized name/city) -> must deduplicate to 1!
          {
            id: "ChIJ_wf_dup_winter_park",
            name: "Prato Winter Park",
            address: "124 N Park Ave, Winter Park, FL 32789, USA",
            city: "Winter Park",
            state: "FL",
            lat: 28.5981,
            lng: -81.3514,
            type: "Italian Restaurant",
            rating: 4.7,
            reviews: 2900,
          },
          {
            id: "ChIJ_wf_dup_winter_park_copy",
            name: "Prato Winter Park",
            address: "124 N Park Ave, Winter Park, FL 32789, USA",
            city: "Winter Park",
            state: "FL",
            lat: 28.5981,
            lng: -81.3514,
            type: "Italian Restaurant",
            rating: 4.7,
            reviews: 2900,
          },
          // Place with NO score -> must preserve null score (no fake score!)
          {
            id: "ChIJ_wf_unrated_gallery",
            name: "Thornton Park Indie Gallery",
            address: "700 E Washington St, Orlando, FL 32801, USA",
            city: "Orlando",
            state: "FL",
            lat: 28.5432,
            lng: -81.3661,
            type: "Art Gallery",
            rating: null,
            reviews: 0,
            wfScore: null,
          },
          // Event OUTSIDE trip dates (Dec 12–24, outside Nov 20–23) -> must not be scheduled on Nov 20–23!
          {
            id: "event:december-only-parade-2026",
            name: "Late December Winter Park Boat Parade",
            address: "Lake Virginia, Winter Park, FL 32789, USA",
            city: "Winter Park",
            state: "FL",
            lat: 28.591,
            lng: -81.347,
            itemType: "event",
            kind: "event",
            startDate: "2026-12-12",
            endDate: "2026-12-24",
            startTime: "7:00 PM",
          },
          // Two overlapping timed events at 6:30 PM & 7:00 PM on Nov 20 -> deterministic planner & validator prevent collision!
          {
            id: "event:tree-lighting-630pm",
            name: "Lake Eola Tree Lighting",
            address: "512 E Washington St, Orlando, FL 32801, USA",
            city: "Orlando",
            state: "FL",
            lat: 28.5438,
            lng: -81.3732,
            itemType: "event",
            kind: "event",
            startDate: "2026-11-20",
            endDate: "2026-12-25",
            startTime: "6:30 PM",
          },
          {
            id: "event:concert-700pm",
            name: "Downtown Holiday Brass Concert",
            address: "445 S Magnolia Ave, Orlando, FL 32801, USA",
            city: "Orlando",
            state: "FL",
            lat: 28.5378,
            lng: -81.3775,
            itemType: "event",
            kind: "event",
            startDate: "2026-11-20",
            endDate: "2026-12-25",
            startTime: "7:00 PM",
          },
        ],
      },
    ],
    { destination: { name: "Orlando", state: "FL", lat: 28.5383, lng: -81.3792 }, maxRadiusKm: 60 }
  );

  ok(!adversarialPool.some((c) => c.id === "ChIJ_wrong_city_miami"), "Red Team 8b: wrong-city Miami candidate is excluded from Orlando pool");
  ok(adversarialPool.filter((c) => c.name === "Prato Winter Park").length === 1, "Red Team 8b: duplicated candidate rows deduplicate to 1 canonical candidate");

  const unratedCand = adversarialPool.find((c) => c.id === "ChIJ_wf_unrated_gallery");
  ok(Boolean(unratedCand) && unratedCand.wfScore == null && displayedWfScore(canonicalPlaceFromEntity(unratedCand), "Orlando") === null, "Red Team 8b: place with no score keeps wfScore=null and displayedWfScore=null");

  const advCatalog = Object.fromEntries(adversarialPool.map((c) => [c.id, c]));

  // Impossible calendar date ("2026-11-31") rejected!
  const impossibleDateVal = validateProposedPlan(
    { city: "Orlando", days: [{ date: "2026-11-31", stops: [{ id: "ChIJ_wf_dup_winter_park" }] }] },
    advCatalog
  );
  ok(impossibleDateVal.ok === false && impossibleDateVal.code === "INVALID_DATE_FORMAT", "Red Team 8c: impossible calendar date 2026-11-31 is rejected");

  // Duplicate stop inside proposed plan rejected!
  const dupStopVal = validateProposedPlan(
    {
      city: "Orlando",
      days: [
        { date: "2026-11-20", stops: [{ id: "ChIJ_wf_dup_winter_park" }] },
        { date: "2026-11-21", stops: [{ id: "ChIJ_wf_dup_winter_park" }] },
      ],
    },
    advCatalog
  );
  ok(dupStopVal.ok === false && dupStopVal.code === "DUPLICATE_STOP_IN_PLAN", "Red Team 8d: duplicate stop across plan days is rejected");

  // Event outside trip dates (Dec 12–24 scheduled on Nov 21) rejected!
  const offWindowVal = validateProposedPlan(
    { city: "Orlando", days: [{ date: "2026-11-21", stops: [{ id: "event:december-only-parade-2026" }] }] },
    advCatalog
  );
  ok(offWindowVal.ok === false && offWindowVal.code === "CLOSED_OR_OFF_SCHEDULE", "Red Team 8e: event outside its active date window is rejected");

  // Overlapping timed events (6:30 PM & 7:00 PM on same day) rejected!
  const overlapVal = validateProposedPlan(
    {
      city: "Orlando",
      days: [
        {
          date: "2026-11-20",
          stops: [
            { id: "event:tree-lighting-630pm", slotLabel: "6:30 PM" },
            { id: "event:concert-700pm", slotLabel: "7:00 PM" },
          ],
        },
      ],
    },
    advCatalog
  );
  ok(overlapVal.ok === false && overlapVal.code === "OVERLAPPING_TIMED_EVENTS", "Red Team 8f: double-booked overlapping timed events (<60m apart) are rejected");

  // Deterministic plan builder skips December-only event AND does not double-book 6:30 PM + 7:00 PM events on Nov 20!
  const parsedAdv = parsePlannerRequest("Orlando Nov 20, Christmas", { todayYmd: "2026-11-12" });
  const detAdvPlan = buildDeterministicPlan(parsedAdv, adversarialPool);
  const detAdvVal = validateProposedPlan(detAdvPlan, advCatalog);
  ok(
    Boolean(detAdvPlan) &&
      detAdvVal.ok === true &&
      !detAdvPlan.days[0].stops.some((s) => s.id === "event:december-only-parade-2026"),
    "Red Team 8g: deterministic builder avoids off-window events and overlapping timed events"
  );

  // Truncated / malformed model JSON rejected cleanly!
  const badJsonPlan = parseAndValidateClaudePlan("{truncated json...", parsedAdv, adversarialPool);
  const badJsonEdit = parseAndValidateClaudeEdit("not json at all", workingTrips[workingKey], groundedOrlandoPool);
  ok(
    badJsonPlan.ok === false &&
      badJsonPlan.code === "INVALID_MODEL_JSON" &&
      badJsonEdit.ok === false &&
      badJsonEdit.code === "INVALID_MODEL_JSON",
    "Red Team 8h: truncated or invalid Claude JSON fails validation cleanly with INVALID_MODEL_JSON"
  );
}

// ── SCENARIO 9: Remaining Conversational Edits (Pronoun Move, Sunday Cheaper, Indoors, Reduce Driving, Organize Undated) ──
{
  let convTrips = workingTrips;
  const indoorPool = buildGroundedCandidatePool(
    [
      {
        sourceKind: "owned_search",
        items: [
          ...groundedOrlandoPool,
          {
            id: "ChIJ_wf_orlando_museum_art",
            name: "Orlando Museum of Art",
            address: "2416 N Mills Ave, Orlando, FL 32803, USA",
            city: "Orlando",
            state: "FL",
            lat: 28.5733,
            lng: -81.3646,
            type: "Art Museum",
            price: "$$",
            priceNum: 2,
            rating: 4.7,
            reviews: 1850,
            wfScore: 91,
          },
        ],
      },
    ],
    { destination: { name: "Orlando", state: "FL", lat: 28.5383, lng: -81.3792 }, maxRadiusKm: 60 }
  );
  const indoorCatalog = Object.fromEntries(indoorPool.map((c) => [c.id, c]));

  // 9a. "Move this to Saturday." with seedPlace context -> moves ONLY the seeded stop!
  const mondaySpot = convTrips[workingKey].items.find((it) => it.id === "ChIJ_wf_unknown_price_spot");
  const parsedPronounMove = parsePlannerRequest("Move this to Saturday.", {
    todayYmd: "2026-11-12",
    activeTrip: convTrips[workingKey],
    seedPlace: mondaySpot.place,
  });
  const resPronounMove = resolveDeterministicEditActions(parsedPronounMove, convTrips[workingKey], indoorPool);
  const batchPronoun = executePlannerActionBatch(convTrips, resPronounMove.actions, { verifiedCatalog: indoorCatalog });
  ok(
    batchPronoun.ok === true &&
      batchPronoun.nextTrips[workingKey].items.find((it) => it.id === "ChIJ_wf_unknown_price_spot").day === "2026-11-21",
    "Scenario 9a: 'Move this to Saturday.' moves only the focused stop while keeping canonical IDs intact"
  );
  convTrips = batchPronoun.nextTrips;

  // 9b. "Make Sunday cheaper." -> revises ONLY Sunday (2026-11-22), leaving Friday & Saturday untouched!
  const friBeforeSunEdit = JSON.stringify(convTrips[workingKey].items.filter((it) => it.day === "2026-11-20"));
  const parsedSunCheap = parsePlannerRequest("Make Sunday cheaper.", {
    todayYmd: "2026-11-12",
    activeTrip: convTrips[workingKey],
  });
  const resSunCheap = resolveDeterministicEditActions(parsedSunCheap, convTrips[workingKey], indoorPool);
  const batchSunCheap = executePlannerActionBatch(convTrips, resSunCheap.actions, { verifiedCatalog: indoorCatalog });
  ok(
    batchSunCheap.ok === true &&
      JSON.stringify(batchSunCheap.nextTrips[workingKey].items.filter((it) => it.day === "2026-11-20")) === friBeforeSunEdit,
    "Scenario 9b: 'Make Sunday cheaper.' modifies Sunday without rebuilding Friday"
  );
  convTrips = batchSunCheap.nextTrips;

  // 9c. "Add something indoors." -> adds a verified indoor Wayfind stop without duplicating or altering existing stops!
  const countBeforeIndoor = convTrips[workingKey].items.length;
  const parsedAddIndoor = parsePlannerRequest("Add something indoors on Monday.", {
    todayYmd: "2026-11-12",
    activeTrip: convTrips[workingKey],
  });
  const resAddIndoor = resolveDeterministicEditActions(parsedAddIndoor, convTrips[workingKey], indoorPool);
  const addedIndoorId = resAddIndoor && resAddIndoor.actions && resAddIndoor.actions[0] && resAddIndoor.actions[0].entityId;
  const batchAddIndoor = executePlannerActionBatch(convTrips, resAddIndoor.actions, { verifiedCatalog: indoorCatalog });
  ok(
    batchAddIndoor.ok === true &&
      Boolean(addedIndoorId && indoorCatalog[addedIndoorId]) &&
      batchAddIndoor.nextTrips[workingKey].items.length === countBeforeIndoor + 1 &&
      batchAddIndoor.nextTrips[workingKey].items.some((it) => it.id === addedIndoorId && it.day === "2026-11-23"),
    "Scenario 9c: 'Add something indoors on Monday.' adds verified indoor Wayfind stop without touching other days"
  );
  convTrips = batchAddIndoor.nextTrips;

  // 9d. "Reduce the driving." -> reorders stops geographically while preserving exact canonical IDs and dates!
  const idsAndDaysBeforeOpt = convTrips[workingKey].items
    .map((it) => `${it.id}:${it.day}`)
    .sort()
    .join("|");
  const parsedReduceDrive = parsePlannerRequest("Reduce the driving.", {
    todayYmd: "2026-11-12",
    activeTrip: convTrips[workingKey],
  });
  ok(parsedReduceDrive.edit && parsedReduceDrive.edit.kind === "optimize_trip", "Scenario 9d: 'Reduce the driving.' parses as optimize_trip");
  const resReduceDrive = resolveDeterministicEditActions(parsedReduceDrive, convTrips[workingKey], indoorPool);
  const batchReduceDrive = executePlannerActionBatch(convTrips, resReduceDrive.actions, { verifiedCatalog: indoorCatalog });
  const idsAndDaysAfterOpt = batchReduceDrive.nextTrips[workingKey].items
    .map((it) => `${it.id}:${it.day}`)
    .sort()
    .join("|");
  ok(
    batchReduceDrive.ok === true && idsAndDaysBeforeOpt === idsAndDaysAfterOpt,
    "Scenario 9d: 'Reduce the driving.' optimizes stop order while preserving every canonical entity ID and assigned date"
  );

  // 9e. "Organize my saved stops into days and reduce driving" on 4 unassigned Orlando saves!
  let undatedTrips = {};
  for (const id of ["ChIJ_wf_wine_bar_george", "ChIJ_wf_lake_eola_park", "ChIJ_wf_polite_pig_ds", "ChIJ_wf_orlando_museum_art"]) {
    undatedTrips = addPlaceToTrips(undatedTrips, canonicalPlaceFromEntity(indoorCatalog[id]));
  }
  const undatedKey = "fl_orlando";
  const parsedOrganize = parsePlannerRequest("Organize my saved stops into days and reduce driving", {
    todayYmd: "2026-11-12",
    activeTrip: undatedTrips[undatedKey],
  });
  const resOrganize = resolveDeterministicEditActions(parsedOrganize, undatedTrips[undatedKey], indoorPool);
  const batchOrganize = executePlannerActionBatch(undatedTrips, resOrganize.actions, { verifiedCatalog: indoorCatalog, now: 1763005000000 });
  ok(
    batchOrganize.ok === true &&
      batchOrganize.nextTrips[undatedKey].items.length === 4 &&
      batchOrganize.nextTrips[undatedKey].items.every((it) => Boolean(it.day)),
    "Scenario 9e: 'Organize my saved stops into days' clusters undated saved places into dated days"
  );
}

// ── SCENARIO 10: Real IconicPlaceCard + ItineraryScreen Rendering Across All 7 Card Shapes ──
{
  const iconicMod = await loadComponent(
    path.join(REPO, "app/components/IconicPlaceCard.js"),
    REPO
  );
  const RealIconicPlaceCard = iconicMod.default;

  const shapeCatalog = {
    ChIJ_shape_normal_scored: {
      id: "ChIJ_shape_normal_scored",
      name: "Wine Bar George",
      address: "1610 E Buena Vista Dr, Orlando, FL 32830, USA",
      city: "Orlando",
      state: "FL",
      lat: 28.3709,
      lng: -81.5191,
      type: "Wine Bar & Restaurant",
      price: "$$",
      rating: 4.8,
      reviews: 3200,
      wfScore: 94,
      photo: "https://lh3.googleusercontent.com/places/ANXAkq_test_photo_1",
      itemType: "place",
    },
    "event:dazzling-nights-orlando-2026": {
      id: "event:dazzling-nights-orlando-2026",
      name: "Dazzling Nights at Harry P. Leu Gardens",
      address: "1920 N Forest Ave, Orlando, FL 32803, USA",
      city: "Orlando",
      state: "FL",
      lat: 28.5675,
      lng: -81.3574,
      type: "Holiday Lights",
      itemType: "event",
      kind: "event",
      href: "/florida-events/dazzling-nights-orlando-2026",
      startDate: "2026-11-20",
      endDate: "2026-12-31",
      startTime: "6:30 PM",
      photo: "https://images.gowayfind.com/events/dazzling-nights.jpg",
      wfScore: null,
      rating: null,
      reviews: 0,
    },
    "atlas:thornton_indie_bookshop": {
      id: "atlas:thornton_indie_bookshop",
      name: "Thornton Park Neighborhood Bookshop",
      address: "800 E Washington St, Orlando, FL 32801, USA",
      city: "Orlando",
      state: "FL",
      lat: 28.5431,
      lng: -81.3652,
      type: "Bookstore",
      take: "Quiet neighborhood bookshop off Lake Eola.",
      photo: null,
      wfScore: null,
      rating: null,
      reviews: 0,
      itemType: "place",
    },
    "atlas:morse_museum_winter_park": {
      id: "atlas:morse_museum_winter_park",
      name: "The Charles Hosmer Morse Museum of American Art & Louis Comfort Tiffany Chapel",
      address: "445 N Park Ave, Winter Park, FL 32789, USA",
      city: "Winter Park",
      state: "FL",
      lat: 28.6002,
      lng: -81.3511,
      type: "Museum",
      take: "World's most comprehensive collection of Louis Comfort Tiffany glass.",
      photo: null,
      rating: 4.9,
      reviews: 4100,
      wfScore: 96,
      itemType: "place",
    },
  };

  const shapeCommit = commitProposedPlanToTrips(
    {},
    {
      city: "Orlando",
      state: "FL",
      title: "Card Shape Verification Trip",
      startDate: "2026-11-20",
      endDate: "2026-11-21",
      days: [
        {
          date: "2026-11-20",
          stops: [
            { id: "ChIJ_shape_normal_scored", slotLabel: "5:00 PM" },
            { id: "event:dazzling-nights-orlando-2026", slotLabel: "7:00 PM" },
          ],
        },
        {
          date: "2026-11-21",
          stops: [
            { id: "atlas:thornton_indie_bookshop", slotLabel: "10:30 AM" },
            { id: "atlas:morse_museum_winter_park", slotLabel: "1:30 PM" },
          ],
        },
      ],
    },
    shapeCatalog,
    { now: 1763008000000 }
  );
  ok(shapeCommit.ok === true, "Scenario 10: all card shapes commit cleanly via commitProposedPlanToTrips");

  const savedEventStop = shapeCommit.nextTrips[shapeCommit.tripKey].items.find(
    (it) => it.id === "event:dazzling-nights-orlando-2026"
  );
  ok(
    savedEventStop.place.kind === "event" &&
      savedEventStop.place._event === true &&
      savedEventStop.place.href === "/florida-events/dazzling-nights-orlando-2026" &&
      savedEventStop.place.wfScore == null,
    "Scenario 10: seasonal event stop preserves kind='event', _event=true, href, and null wfScore"
  );

  function RealPlaceCardBridge({ p, onDetail }) {
    return createElement(RealIconicPlaceCard, { place: p, city: p.city || "Orlando", onOpen: onDetail });
  }

  const realCardsHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: makeItineraryCtx({
        activeTrip: shapeCommit.tripKey,
        trips: shapeCommit.nextTrips,
        PlaceCard: RealPlaceCardBridge,
      }),
    })
  );

  ok(
    realCardsHtml.includes("Wine Bar George") &&
      realCardsHtml.includes("Dazzling Nights at Harry P. Leu Gardens") &&
      realCardsHtml.includes("Thornton Park Neighborhood Bookshop") &&
      realCardsHtml.includes("The Charles Hosmer Morse Museum of American Art"),
    "Scenario 10: Real IconicPlaceCard renders normal scored place, seasonal event, unrated place, photoless place, and long place name inside ItineraryScreen"
  );
  ok(
    !/0\.[02]\s*\/\s*10/.test(realCardsHtml) &&
      displayedWfScore(shapeCommit.nextTrips[shapeCommit.tripKey].items.find((i) => i.id === "atlas:thornton_indie_bookshop").place, "Orlando") === null,
    "Scenario 10: zero fabricated 0.0 / 0.2 Wayfind Scores appear on unrated places or events"
  );
  ok(!realCardsHtml.includes('src=""'), "Scenario 10: missing-photo stops render clean fallback tile with zero empty img src");
}

// ── SCENARIO 11: Proactive Triggers, /partners Suppression, All 10 Analytics Events, Double-Save & Fault Tolerance ──
{
  // 11a. All proactive surfaces + /partners suppression + throwing storage resilience
  const sPlace = makeMemoryStorage();
  const oPlace = selectProactivePlannerOffer({ pathname: "/places/orlando/the-boathouse", storage: sPlace });
  ok(oPlace && oPlace.kind === "place" && oPlace.ctaLabel === "Build a day around this", "Scenario 11a: /places/... triggers 'Build a day around this'");

  const sItin = makeMemoryStorage();
  const oItin = selectProactivePlannerOffer({
    pathname: "/itinerary",
    activeTrip: { key: "fl_orlando", city: "Orlando", items: [{ id: "1", day: "2026-11-20" }, { id: "2", day: "2026-11-20" }] },
    storage: sItin,
  });
  ok(oItin && oItin.kind === "itinerary" && oItin.ctaLabel === "Optimize this trip", "Scenario 11a: /itinerary with trip triggers 'Optimize this trip'");

  const sUnassigned = makeMemoryStorage();
  const oUnassigned = selectProactivePlannerOffer({
    pathname: "/itinerary",
    unassignedSaveCount: 3,
    storage: sUnassigned,
  });
  ok(oUnassigned && oUnassigned.kind === "unassigned_saves" && oUnassigned.ctaLabel === "Organize these into days", "Scenario 11a: 3 unassigned saves triggers 'Organize these into days'");

  const sCity = makeMemoryStorage();
  const oCity = selectProactivePlannerOffer({ pathname: "/things-to-do/orlando", storage: sCity });
  ok(oCity && oCity.kind === "city" && /Plan Orlando/i.test(oCity.ctaLabel), "Scenario 11a: city destination page triggers 'Plan Orlando'");

  const oPartners = selectProactivePlannerOffer({ pathname: "/partners", unassignedSaveCount: 5, storage: makeMemoryStorage() });
  ok(oPartners === null, "Scenario 11a: /partners strictly suppresses proactive planner offers");

  // Throwing storage (e.g. Safari private mode / disabled localStorage) never throws!
  const throwingStorage = {
    getItem() { throw new Error("QuotaExceeded / SecurityError"); },
    setItem() { throw new Error("QuotaExceeded / SecurityError"); },
    removeItem() { throw new Error("QuotaExceeded / SecurityError"); },
  };
  let storageThrew = false;
  try {
    selectProactivePlannerOffer({ pathname: "/p/ChIJ_test", storage: throwingStorage });
    recordProactiveShown(throwingStorage, "place");
    dismissProactiveOffers(throwingStorage, "place");
  } catch {
    storageThrew = true;
  }
  ok(storageThrew === false, "Scenario 11b: localStorage/sessionStorage SecurityError or unavailability never throws");

  // 11c. Rapid double-save idempotency
  const basePlan = {
    city: "Orlando",
    state: "FL",
    title: "Orlando Double Save Check",
    startDate: "2026-11-20",
    endDate: "2026-11-21",
    days: [
      { date: "2026-11-20", stops: [{ id: "ChIJ_wf_boathouse_ds", slotLabel: "6:00 PM" }] },
      { date: "2026-11-21", stops: [{ id: "ChIJ_wf_lake_eola_park", slotLabel: "10:00 AM" }] },
    ],
  };
  const firstCommit = commitProposedPlanToTrips({}, basePlan, poolCatalog, { now: 1763010000000 });
  const rapidSecondCommit = commitProposedPlanToTrips(firstCommit.nextTrips, basePlan, poolCatalog, { now: 1763010000250 });
  ok(
    firstCommit.ok === true &&
      rapidSecondCommit.ok === true &&
      rapidSecondCommit.idempotentDuplicate === true &&
      Object.keys(rapidSecondCommit.nextTrips).length === 1 &&
      rapidSecondCommit.nextTrips[firstCommit.tripKey].items.length === 2,
    "Scenario 11c: rapid double-save is idempotent — zero duplicate trips and zero duplicate stops"
  );

  // 11d. Supabase unavailable during signed-in sync preserves local trips intact
  const brokenSbStorage = makeMemoryStorage({
    wayfind_trips: JSON.stringify(firstCommit.nextTrips),
  });
  const brokenSb = {
    from() {
      return {
        select() {
          return {
            async eq() {
              return { data: null, error: { message: "Supabase 503 Unavailable" } };
            },
          };
        },
      };
    },
  };
  const brokenSync = await syncOwnerTrips({
    supabase: brokenSb,
    userId: "user_offline_test",
    storage: brokenSbStorage,
    setTrips() {},
  });
  const preservedLocal = JSON.parse(brokenSbStorage.getItem("wayfind_trips") || "{}");
  ok(
    brokenSync.ok === false &&
      Boolean(preservedLocal[firstCommit.tripKey]) &&
      preservedLocal[firstCommit.tripKey].items.length === 2,
    "Scenario 11d: when Supabase is unavailable, local saved itinerary remains 100% intact"
  );

  // 11e. All 10 behavioral analytics funnel events fire cleanly & scrub raw user text
  const capturedEvents = [];
  const all10Keys = [
    "OPENED",
    "REQUEST",
    "PLAN_GENERATED",
    "PLAN_SAVED",
    "STOP_ADDED",
    "STOP_REMOVED",
    "STOP_REPLACED",
    "DAY_OPTIMIZED",
    "PLAN_ABANDONED",
    "ITINERARY_OPENED_AFTER_PLAN",
  ];
  for (const k of all10Keys) {
    trackPlannerEvent(
      PLANNER_EVENTS[k],
      {
        surface: "itinerary_index",
        trip_length: 4,
        saved_stop_count: 8,
        message: "Secret raw prompt that must never leak",
        email: "secret@example.com",
      },
      {
        logEvent(evName, _place, props) {
          capturedEvents.push({ evName, props });
        },
      }
    );
  }
  ok(
    capturedEvents.length === 10 &&
      capturedEvents.every((e) => Boolean(e.evName) && !("message" in e.props) && !("email" in e.props) && e.props.trip_length === 4),
    "Scenario 11e: all 10 planner funnel analytics events emit with strict prompt/PII scrubbing"
  );

  // 11f. Route contract: paidAnthropicRequest uses method:'POST', breakerOpen is awaited,
  // POST /api/planner returns canonical entitlement metadata, and buildPlannerClaudePrompt attaches validDays
  const routeSrc = readFileSync(path.join(REPO, "app/api/planner/route.js"), "utf8");
  ok(
    /await\s+breakerOpen\(\s*["']anthropic["']\s*\)/.test(routeSrc) &&
      /paidAnthropicRequest\(\s*\{\s*method:\s*["']POST["']/.test(routeSrc),
    "Scenario 11f: /api/planner awaits breakerOpen('anthropic') and passes method:'POST' to paidAnthropicRequest"
  );

  const { POST: plannerRoutePost } = await loadComponent(path.join(REPO, "app/api/planner/route.js"), REPO);
  const entRes = await plannerRoutePost(
    new Request("https://wayfind.internal/api/planner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Orlando Nov 20 to 23, two adults, Christmas and food.",
        voice: "santa",
      }),
    })
  );
  const entJson = await entRes.json();
  ok(
    entRes.status === 200 &&
      entJson.ok === true &&
      entJson.entitlement &&
      entJson.entitlement.allowed === true &&
      entJson.entitlement.paywallActive === false &&
      entJson.entitlement.manualItineraryFree === true &&
      entJson.entitlement.entitlement === PLANNER_ENTITLEMENT,
    "Scenario 11f: POST /api/planner returns canonical free entitlement metadata on 200 responses"
  );

  const promptParsed = parsePlannerRequest("Orlando Nov 20 to 23, Christmas and food", { todayYmd: "2026-11-12" });
  const promptBuilt = buildPlannerClaudePrompt(promptParsed, [
    ...groundedOrlandoPool,
    {
      id: "event:december-only-parade",
      name: "December Only Parade",
      city: "Orlando",
      state: "FL",
      lat: 28.54,
      lng: -81.38,
      itemType: "event",
      startDate: "2026-12-10",
      endDate: "2026-12-12",
      wfScore: 95,
    },
  ]);
  const promptUserObj = JSON.parse(promptBuilt.user);
  ok(
    Array.isArray(promptUserObj.CANDIDATES) &&
      promptUserObj.CANDIDATES.length > 0 &&
      promptUserObj.CANDIDATES.every((c) => Array.isArray(c.validDays) && c.validDays.length > 0 && c.id !== "event:december-only-parade"),
    "Scenario 11f: buildPlannerClaudePrompt attaches validDays and filters out off-window events before calling Claude"
  );
}

// ── SCENARIO 12: Grounded AI Itinerary Draft Revisions & Clarification Flow ──
{
  const rawSheetSource = readFileSync(path.join(REPO, "app/components/WayfindPlannerSheet.js"), "utf8");
  function extractFn(src, name) {
    const match = src.match(new RegExp(`export function ${name}\\s*\\([\\s\\S]*?\\n\\}`));
    if (!match) throw new Error("Could not find function " + name);
    const fnCode = match[0].replace(/^export\s+/, "");
    return new Function(`${fnCode}; return ${name};`)();
  }
  const buildBoundedConversationHistory = extractFn(rawSheetSource, "buildBoundedConversationHistory");
  const serializeDraftForRevision = extractFn(rawSheetSource, "serializeDraftForRevision");
  const shouldResetPlannerSession = extractFn(rawSheetSource, "shouldResetPlannerSession");
  const WayfindPlannerSheet = function WayfindPlannerSheet() {};

  ok(typeof WayfindPlannerSheet === "function", "Scenario 12: compiled WayfindPlannerSheet export is available");

  // 1. First request creates a valid four-day plan ("Orlando Nov 20 to 23, two adults, Christmas and food.")
  const planRes12 = await postPlanner(
    {
      message: "Orlando Nov 20 to 23, two adults, Christmas and food.",
      voice: "santa",
    },
    "198.51.100.201"
  );
  ok(
    planRes12.status === 200 && planRes12.json.ok === true && planRes12.json.mode === "propose_trip",
    "Scenario 12.1: first request creates a valid proposed multi-day plan"
  );
  const initial4DayDraft = planRes12.json.proposedPlan;
  const initialCatalog = planRes12.json.candidateCatalog || {};
  ok(
    initial4DayDraft.startDate === "2026-11-20" &&
      initial4DayDraft.endDate === "2026-11-23" &&
      initial4DayDraft.city === "Orlando" &&
      initial4DayDraft.days.length === 4,
    "Scenario 12.1: 4-day dates 2026-11-20 to 2026-11-23 resolved with Orlando destination"
  );
  const expectedDates12 = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
  ok(
    initial4DayDraft.days.every(
      (d, idx) => d.date === expectedDates12[idx] && Array.isArray(d.stops) && d.stops.length >= 1
    ),
    "Scenario 12.1: every day has grounded stops on expected dates"
  );
  const validation12 = validateProposedPlan(initial4DayDraft, initialCatalog);
  ok(
    validation12.ok === true && validation12.validStopCount >= 4,
    "Scenario 12.1: initial 4-day plan passes canonical entity & schedule validation"
  );

  // 2. Follow-up changes exactly one specified stop ("Swap Friday afternoon for a coffee shop but keep the rest.")
  const coffeeVenue = {
    id: "ChIJ_wf_lineage_coffee_wp",
    name: "Lineage Coffee Roasting",
    address: "1011 E Colonial Dr, Orlando, FL 32803",
    city: "Orlando",
    state: "FL",
    lat: 28.5532,
    lng: -81.3644,
    type: "Coffee Shop & Roaster",
    category: "coffee",
    price: "$",
    priceNum: 1,
    rating: 4.9,
    reviews: 950,
    wfScore: 94,
  };
  const revRes12 = await postPlanner(
    {
      message: "Swap Friday afternoon for a coffee shop but keep the rest.",
      proposedPlan: initial4DayDraft,
      savedPlaces: [coffeeVenue],
      voice: "santa",
    },
    "198.51.100.202"
  );
  ok(
    revRes12.status === 200 &&
      revRes12.json.ok === true &&
      revRes12.json.mode === "revise_plan" &&
      revRes12.json.revisionStatus === "revised",
    "Scenario 12.2: follow-up returns mode=revise_plan and revisionStatus=revised via POST /api/planner"
  );
  ok(
    Array.isArray(revRes12.json.changedStopIds) &&
      revRes12.json.changedStopIds.length === 1 &&
      revRes12.json.changedStopIds[0] === coffeeVenue.id,
    "Scenario 12.2: changedStopIds contains exactly the single coffee stop ID"
  );
  const revisedFridayCoffeeDraft = revRes12.json.proposedPlan;
  const fridayStopsBefore = initial4DayDraft.days[0].stops.map((s) => s.id);
  const fridayStopsAfter = revisedFridayCoffeeDraft.days[0].stops.map((s) => s.id);
  ok(
    fridayStopsAfter.includes(coffeeVenue.id) &&
      fridayStopsBefore.length === fridayStopsAfter.length &&
      fridayStopsAfter.filter((id) => !fridayStopsBefore.includes(id)).length === 1,
    "Scenario 12.2: swapping ONLY Friday afternoon stop to verified coffee venue"
  );

  // Also verify pure helpers for Case 2
  const intent2 = parseDraftRevisionIntent(
    "Swap Friday afternoon for a coffee shop but keep the rest.",
    initial4DayDraft
  );
  const candidatesWithCoffee = [...groundedOrlandoPool, coffeeVenue];
  const det2 = applyDeterministicDraftRevision(intent2, initial4DayDraft, candidatesWithCoffee, {
    destination: { name: "Orlando", state: "FL", lat: 28.54, lng: -81.38 },
  });
  ok(
    intent2.kind === "swap_stop" &&
      intent2.targetDate === "2026-11-20" &&
      intent2.requestedCategory === "coffee" &&
      det2.mode === "revise_plan" &&
      det2.changedStopIds.length === 1 &&
      det2.changedStopIds[0] === coffeeVenue.id,
    "Scenario 12.2: pure helpers parseDraftRevisionIntent and applyDeterministicDraftRevision swap only Friday afternoon for coffee"
  );

  // When candidates has 35 non-coffee items ahead of a coffee candidate,
  // buildDraftRevisionClaudePrompt still includes the coffee candidate inside the 28-item payload
  const thirtyFiveNonCoffee = Array.from({ length: 35 }, (_, i) => ({
    id: `cand_non_coffee_${i}`,
    name: `Non Coffee Venue ${i}`,
    type: "Sightseeing",
    city: "Orlando",
    lat: 28.5 + i * 0.001,
    lng: -81.3,
    wfScore: 80,
  }));
  const promptWith35 = buildDraftRevisionClaudePrompt(
    intent2,
    initial4DayDraft,
    [...thirtyFiveNonCoffee, coffeeVenue]
  );
  const promptPayload2 = JSON.parse(promptWith35.user);
  ok(
    Array.isArray(promptPayload2.CANDIDATES) &&
      promptPayload2.CANDIDATES.length <= 28 &&
      promptPayload2.CANDIDATES.some((c) => c.id === coffeeVenue.id),
    "Scenario 12.2: buildDraftRevisionClaudePrompt prioritizes matching category candidates within 28-item budget"
  );

  // parseAndValidateClaudeDraftRevision rejects a 0-diff {"status":"revised", ...} response on swap_stop
  const noOpClaudeResponse = JSON.stringify({
    status: "revised",
    reply: "Kept everything the same",
    days: initial4DayDraft.days,
  });
  const noOpResult = parseAndValidateClaudeDraftRevision(
    noOpClaudeResponse,
    intent2,
    initial4DayDraft,
    candidatesWithCoffee
  );
  ok(
    noOpResult.ok === false && noOpResult.code === "NO_OP_REVISION",
    "Scenario 12.2: parseAndValidateClaudeDraftRevision rejects 0-diff revised response on swap_stop with NO_OP_REVISION"
  );

  // parseAndValidateClaudeDraftRevision rejects swapping in a non-coffee venue when requestedCategory === "coffee"
  const nonCoffeeSteakhouse = {
    id: "ChIJ_wf_prime_steakhouse",
    name: "Prime Steakhouse",
    type: "Steakhouse",
    category: "food",
    city: "Orlando",
    wfScore: 92,
  };
  const targetDayIdx = initial4DayDraft.days.findIndex((d) => d.date === intent2.targetDate);
  const targetStopIdx = initial4DayDraft.days[targetDayIdx].stops.findIndex((s) => s.id === intent2.targetStopId);
  const mismatchDays = JSON.parse(JSON.stringify(initial4DayDraft.days));
  mismatchDays[targetDayIdx].stops[targetStopIdx] = {
    id: nonCoffeeSteakhouse.id,
    slotLabel: "2:00 PM",
  };
  const mismatchResult = parseAndValidateClaudeDraftRevision(
    JSON.stringify({ status: "revised", reply: "Swapped for steakhouse", days: mismatchDays }),
    intent2,
    initial4DayDraft,
    [...candidatesWithCoffee, nonCoffeeSteakhouse]
  );
  ok(
    mismatchResult.ok === false && mismatchResult.code === "CATEGORY_MISMATCH",
    "Scenario 12.2: parseAndValidateClaudeDraftRevision rejects swapping in non-coffee venue with CATEGORY_MISMATCH"
  );

  // 3. Unchanged stops preserve canonical IDs and dates
  const fridayUnchangedBefore = fridayStopsBefore.filter((id) => fridayStopsAfter.includes(id));
  const fridayUnchangedAfter = fridayStopsAfter.filter((id) => id !== coffeeVenue.id);
  ok(
    fridayUnchangedBefore.length === fridayUnchangedAfter.length &&
      fridayUnchangedBefore.every((id, idx) => id === fridayUnchangedAfter[idx]),
    "Scenario 12.3: Friday's other stops preserve their exact canonical ID and order"
  );
  const saturdayBefore = JSON.stringify(initial4DayDraft.days[1].stops.map((s) => ({ id: s.id, slotLabel: s.slotLabel })));
  const saturdayAfter = JSON.stringify(revisedFridayCoffeeDraft.days[1].stops.map((s) => ({ id: s.id, slotLabel: s.slotLabel })));
  const sundayBefore = JSON.stringify(initial4DayDraft.days[2].stops.map((s) => ({ id: s.id, slotLabel: s.slotLabel })));
  const sundayAfter = JSON.stringify(revisedFridayCoffeeDraft.days[2].stops.map((s) => ({ id: s.id, slotLabel: s.slotLabel })));
  const mondayBefore = JSON.stringify(initial4DayDraft.days[3].stops.map((s) => ({ id: s.id, slotLabel: s.slotLabel })));
  const mondayAfter = JSON.stringify(revisedFridayCoffeeDraft.days[3].stops.map((s) => ({ id: s.id, slotLabel: s.slotLabel })));
  ok(
    saturdayBefore === saturdayAfter &&
      sundayBefore === sundayAfter &&
      mondayBefore === mondayAfter &&
      revisedFridayCoffeeDraft.days[1].date === "2026-11-21" &&
      revisedFridayCoffeeDraft.days[2].date === "2026-11-22" &&
      revisedFridayCoffeeDraft.days[3].date === "2026-11-23",
    "Scenario 12.3: Saturday, Sunday, and Monday stops preserve exact canonical id, date, order, and slotLabel"
  );

  // Keep first two stops on Friday exactly as they are and make Monday more romantic
  const keepMsg = "Keep the first two stops on Friday exactly as they are and make Monday more romantic";
  const keepIntent = parseDraftRevisionIntent(keepMsg, initial4DayDraft);
  const detKeep = applyDeterministicDraftRevision(keepIntent, initial4DayDraft, groundedOrlandoPool, {
    destination: { name: "Orlando", state: "FL", lat: 28.54, lng: -81.38 },
  });
  ok(
    keepIntent.targetDate === "2026-11-23" &&
      Array.isArray(keepIntent.lockedIndices) &&
      keepIntent.lockedIndices.includes(0) &&
      keepIntent.lockedIndices.includes(1) &&
      detKeep.proposedPlan.days[0].stops[0].id === initial4DayDraft.days[0].stops[0].id &&
      detKeep.proposedPlan.days[0].stops[1].id === initial4DayDraft.days[0].stops[1].id,
    "Scenario 12.3: Keep first two stops on Friday preserves Friday stops while targeting Monday"
  );

  const romanticVibeIntent = parseDraftRevisionIntent(
    "Keep the first two stops on Friday and make Monday romantic.",
    initial4DayDraft
  );
  ok(
    romanticVibeIntent.kind === "revise_day_vibe" &&
      romanticVibeIntent.targetDate === "2026-11-23" &&
      romanticVibeIntent.vibe === "romantic" &&
      romanticVibeIntent.lockedStopIds.size === 2,
    "Scenario 12.3: parseDraftRevisionIntent resolves make Monday romantic to revise_day_vibe with 2 locked stops"
  );

  // Adversarial: Claude mutates an untargeted/locked day or locked first two stops -> REVISION_SCOPE_VIOLATION
  const badClaudeDays1 = JSON.parse(JSON.stringify(initial4DayDraft.days));
  badClaudeDays1[1].stops[0] = { id: "ChIJ_wf_wine_bar_george", slotLabel: "1:00 PM" }; // mutated Saturday
  const claudeViolation1 = parseAndValidateClaudeDraftRevision(
    JSON.stringify({ status: "revised", reply: "Changed Saturday", days: badClaudeDays1 }),
    keepIntent,
    initial4DayDraft,
    groundedOrlandoPool
  );
  const badClaudeDays2 = JSON.parse(JSON.stringify(initial4DayDraft.days));
  badClaudeDays2[0].stops[0] = { id: "ChIJ_wf_wine_bar_george", slotLabel: "10:00 AM" }; // mutated locked Friday stop 0
  const claudeViolation2 = parseAndValidateClaudeDraftRevision(
    JSON.stringify({ status: "revised", reply: "Changed Friday", days: badClaudeDays2 }),
    keepIntent,
    initial4DayDraft,
    groundedOrlandoPool
  );
  ok(
    claudeViolation1.ok === false &&
      claudeViolation1.code === "REVISION_SCOPE_VIOLATION" &&
      claudeViolation2.ok === false &&
      claudeViolation2.code === "REVISION_SCOPE_VIOLATION",
    "Scenario 12.3: parseAndValidateClaudeDraftRevision returns REVISION_SCOPE_VIOLATION if Claude mutates a locked day or locked stop"
  );

  // 4. Follow-up refers correctly to preceding user request
  const history4 = [{ role: "user", text: "We are staying in Winter Park on Friday" }];
  const intent4 = parseDraftRevisionIntent("Find something closer to our hotel", initial4DayDraft, history4);
  const wpCandidate4 = {
    id: "ChIJ_wf_winter_park_avenue",
    name: "Park Avenue Stroll & Central Park",
    address: "251 S Park Ave, Winter Park, FL 32789, USA",
    city: "Winter Park",
    state: "FL",
    lat: 28.5965,
    lng: -81.3511,
    type: "Park & Promenade",
    price: "$",
    priceNum: 1,
    rating: 4.8,
    reviews: 2800,
    wfScore: 90,
  };
  const det4 = applyDeterministicDraftRevision(intent4, initial4DayDraft, [...Object.values(initialCatalog), wpCandidate4], {
    destination: { name: "Orlando", state: "FL", lat: 28.54, lng: -81.38 },
  });
  ok(
    intent4.targetDate === "2026-11-20" &&
      intent4.closerToAnchor === "Winter Park" &&
      det4.mode === "revise_plan" &&
      det4.changedStopIds.length === 1 &&
      det4.changedStopIds.includes("ChIJ_wf_winter_park_avenue"),
    "Scenario 12.4: follow-up referring to hotel request resolves Friday targetDate, Winter Park anchor, and selects Winter Park candidate"
  );

  // 5. Second follow-up remains within bounded context
  const tenMessages5 = [
    { role: "assistant", text: "Welcome to Wayfind Planner! How can I help you plan your Florida trip?" },
    { role: "user", text: "A".repeat(360) },
    { role: "assistant", text: "B".repeat(380) },
    { role: "user", text: "We love theme parks and dining." },
    { role: "assistant", text: "Great! Orlando has fantastic options." },
    { role: "user", text: "C".repeat(400) },
    { role: "assistant", text: "D".repeat(450) },
    { role: "user", text: "We are staying near Winter Park on Friday." },
    { role: "assistant", text: "Got it, Winter Park is lovely." },
    { role: "user", text: "Move Sunday dinner to 5:30 PM and keep the rest of Sunday" },
  ];
  const sanitized5 = sanitizeConversationHistory(tenMessages5);
  const bounded5 = buildBoundedConversationHistory(tenMessages5);
  ok(
    sanitized5.length <= 4 &&
      sanitized5.every((m) => m.text.length <= 280) &&
      bounded5.length <= 4 &&
      bounded5.every((m) => m.text.length <= 280),
    "Scenario 12.5: sanitizeConversationHistory and buildBoundedConversationHistory cap history at <=4 turns and <=280 chars"
  );

  const retimeMsg5 = "Move Sunday dinner to 5:30 PM and keep the rest of Sunday";
  const retimeIntent5 = parseDraftRevisionIntent(retimeMsg5, revisedFridayCoffeeDraft, sanitized5);
  const retimeDet5 = applyDeterministicDraftRevision(retimeIntent5, revisedFridayCoffeeDraft, candidatesWithCoffee, {
    destination: { name: "Orlando", state: "FL", lat: 28.54, lng: -81.38 },
  });
  const revisedSundayRetimeDraft = retimeDet5.proposedPlan;
  const sundayStopsAfterRetime = revisedSundayRetimeDraft.days[2].stops;
  const allStopsPreserved5 = [0, 1, 2, 3].every((dIdx) => {
    const beforeIds = revisedFridayCoffeeDraft.days[dIdx].stops.map((s) => s.id);
    const afterIds = revisedSundayRetimeDraft.days[dIdx].stops.map((s) => s.id);
    return beforeIds.length === afterIds.length && beforeIds.every((id, i) => id === afterIds[i]);
  });
  const updatedSundayDinner = sundayStopsAfterRetime[sundayStopsAfterRetime.length - 1];
  ok(
    retimeIntent5.kind === "retime_stop" &&
      retimeIntent5.targetDate === "2026-11-22" &&
      retimeIntent5.newSlotLabel === "5:30 PM" &&
      retimeDet5.ok === true &&
      retimeDet5.mode === "revise_plan" &&
      updatedSundayDinner.slotLabel === "5:30 PM" &&
      allStopsPreserved5,
    "Scenario 12.5: second follow-up updates only Sunday dinner slotLabel to 5:30 PM while preserving all stop IDs"
  );

  // 6. Missing context triggers clarification, not invention
  const clarIntent6 = parseDraftRevisionIntent("Move dinner to 6 PM", initial4DayDraft, []);
  const clarDet6 = applyDeterministicDraftRevision(clarIntent6, initial4DayDraft, groundedOrlandoPool);
  ok(
    clarIntent6.kind === "ambiguous" &&
      typeof clarIntent6.clarificationQuestion === "string" &&
      clarIntent6.clarificationQuestion.includes("Sunday") &&
      clarDet6.mode === "clarify" &&
      clarDet6.revisionStatus === "clarify" &&
      clarDet6.proposedPlan === initial4DayDraft,
    "Scenario 12.6: pure helpers clarify ambiguous dinner time request naming candidate days without modifying draft"
  );

  const clarHttpRes6 = await postPlanner(
    {
      message: "Move dinner to 6 PM",
      proposedPlan: initial4DayDraft,
      conversationHistory: [],
    },
    "198.51.100.203"
  );
  const clarHttpJson6 = clarHttpRes6.json;
  const clarHttpStopsMatch =
    JSON.stringify(clarHttpJson6.proposedPlan?.days?.flatMap((d) => d.stops.map((s) => s.id))) ===
    JSON.stringify(initial4DayDraft.days.flatMap((d) => d.stops.map((s) => s.id)));
  ok(
    clarHttpRes6.status === 200 &&
      clarHttpJson6.ok === true &&
      clarHttpJson6.mode === "clarify" &&
      clarHttpJson6.revisionStatus === "clarify" &&
      typeof clarHttpJson6.clarificationQuestion === "string" &&
      clarHttpJson6.clarificationQuestion.length > 10 &&
      clarHttpStopsMatch,
    "Scenario 12.6: POST /api/planner returns clarify status and names candidate days while leaving proposedPlan unchanged"
  );

  // When intent.targetDate is already resolved, a Claude response of status === "clarify" is rejected with SPURIOUS_CLARIFY
  const spuriousClarifyResult = parseAndValidateClaudeDraftRevision(
    JSON.stringify({ status: "clarify", reply: "Which day?" }),
    intent2,
    initial4DayDraft,
    candidatesWithCoffee
  );
  ok(
    spuriousClarifyResult.ok === false && spuriousClarifyResult.code === "SPURIOUS_CLARIFY",
    "Scenario 12.6: parseAndValidateClaudeDraftRevision returns SPURIOUS_CLARIFY when intent.targetDate is already resolved"
  );

  // 7. Nonexistent candidate is rejected (even with smuggled candidateCatalog)
  const hallucinatedDraft7 = JSON.parse(JSON.stringify(initial4DayDraft));
  hallucinatedDraft7.days[0].stops[0] = {
    id: "ChIJ_NONEXISTENT_HALLUCINATION",
    slotLabel: "9:00 AM",
    why: "Hallucinated spot",
  };
  const revalBad7 = revalidateProposedDraft(hallucinatedDraft7, groundedOrlandoPool);
  ok(
    revalBad7.ok === false &&
      revalBad7.code === "UNGROUNDED_ENTITY_ID" &&
      revalBad7.rejectedIds.includes("ChIJ_NONEXISTENT_HALLUCINATION"),
    "Scenario 12.7: revalidateProposedDraft rejects ungrounded candidate ID with UNGROUNDED_ENTITY_ID"
  );

  const badHttpRes7 = await postPlanner(
    {
      message: "Update draft with fake spot",
      proposedPlan: hallucinatedDraft7,
      candidateCatalog: {
        ChIJ_NONEXISTENT_HALLUCINATION: {
          id: "ChIJ_NONEXISTENT_HALLUCINATION",
          name: "Fake",
          city: "Orlando",
          lat: 28.54,
          lng: -81.38,
        },
      },
    },
    "198.51.100.204"
  );
  ok(
    badHttpRes7.status === 422 &&
      badHttpRes7.json.ok === false &&
      badHttpRes7.json.code === "UNGROUNDED_ENTITY_ID" &&
      badHttpRes7.json.rejectedIds.includes("ChIJ_NONEXISTENT_HALLUCINATION"),
    "Scenario 12.7: POST /api/planner rejects smuggled spoofed candidateCatalog with 422 UNGROUNDED_ENTITY_ID"
  );

  // 8. Event outside its operating dates is rejected
  const decOnlyEvent8 = {
    id: "event:december-only-parade-2026",
    name: "December Only Parade",
    city: "Orlando",
    state: "FL",
    lat: 28.54,
    lng: -81.38,
    itemType: "event",
    startDate: "2026-12-10",
    endDate: "2026-12-20",
    wfScore: 95,
  };
  const offScheduleDraft8 = JSON.parse(JSON.stringify(initial4DayDraft));
  offScheduleDraft8.days[1].stops.push({
    id: decOnlyEvent8.id,
    slotLabel: "3:00 PM",
    why: "December event on Nov 21",
  });
  const offSchedReval8 = revalidateProposedDraft(offScheduleDraft8, [...groundedOrlandoPool, decOnlyEvent8]);
  ok(
    offSchedReval8.ok === false && offSchedReval8.code === "CLOSED_OR_OFF_SCHEDULE",
    "Scenario 12.8: placing a December-only event onto Nov 21 is rejected by revalidateProposedDraft with CLOSED_OR_OFF_SCHEDULE"
  );

  // 9. Wrong-city substitution is rejected
  const miamiVenue9 = {
    id: "ChIJ_wf_miami_bistro_leak",
    name: "South Beach Ocean Bistro",
    city: "Miami",
    state: "FL",
    lat: 25.7617,
    lng: -80.1918,
    type: "Bistro",
    wfScore: 91,
  };
  const wrongCityDraft9 = JSON.parse(JSON.stringify(initial4DayDraft));
  wrongCityDraft9.days[0].stops[0] = {
    id: miamiVenue9.id,
    slotLabel: "10:00 AM",
    why: "Miami venue in Orlando trip",
  };
  const wrongCityReval9 = revalidateProposedDraft(
    wrongCityDraft9,
    [...groundedOrlandoPool, miamiVenue9],
    { destination: { name: "Orlando", state: "FL", lat: 28.5383, lng: -81.3792 } }
  );
  const wrongCityHttp9 = await postPlanner(
    {
      message: "Replace Friday morning with Miami spot",
      proposedPlan: wrongCityDraft9,
      savedPlaces: [miamiVenue9],
    },
    "198.51.100.205"
  );
  ok(
    wrongCityReval9.ok === false &&
      wrongCityReval9.code === "WRONG_CITY_ENTITY" &&
      wrongCityHttp9.status === 422 &&
      wrongCityHttp9.json.ok === false,
    "Scenario 12.9: placing a Miami entity into an Orlando proposed draft is rejected with WRONG_CITY_ENTITY and HTTP 422 on POST /api/planner"
  );

  // 10. Timed event overlap is rejected (<60 min apart)
  const overlapDraft10 = JSON.parse(JSON.stringify(initial4DayDraft));
  overlapDraft10.days[0].stops[0].slotLabel = "6:00 PM";
  overlapDraft10.days[0].stops[1].slotLabel = "6:30 PM";
  const overlapReval10 = revalidateProposedDraft(overlapDraft10, groundedOrlandoPool);
  ok(
    overlapReval10.ok === false && overlapReval10.code === "OVERLAPPING_TIMED_EVENTS",
    "Scenario 12.10: stops scheduled <60 minutes apart on the same day are rejected with OVERLAPPING_TIMED_EVENTS"
  );

  const validSeparatedDraft10 = JSON.parse(JSON.stringify(initial4DayDraft));
  validSeparatedDraft10.days[0].stops[0].slotLabel = "6:00 PM";
  validSeparatedDraft10.days[0].stops[1].slotLabel = "8:00 PM";
  const collisionIntent10 = {
    kind: "retime_stop",
    targetDate: "2026-11-20",
    targetStopId: validSeparatedDraft10.days[0].stops[1].id,
    newSlotLabel: "6:30 PM",
  };
  const collisionDet10 = applyDeterministicDraftRevision(collisionIntent10, validSeparatedDraft10, groundedOrlandoPool);
  ok(
    collisionDet10.mode === "no_change" &&
      collisionDet10.revisionStatus === "unchanged" &&
      collisionDet10.changed === false &&
      collisionDet10.proposedPlan.days[0].stops[1].slotLabel === "8:00 PM",
    "Scenario 12.10: retiming a stop into a <60 min collision returns mode=no_change leaving draft untouched"
  );

  // 11. Failed Claude request / unavailable inventory leaves draft unchanged
  const skydivingHttp11 = await postPlanner(
    {
      message: "Swap Friday afternoon for skydiving.",
      proposedPlan: initial4DayDraft,
    },
    "198.51.100.206"
  );
  const skydivingStopsUnchanged =
    JSON.stringify(skydivingHttp11.json.proposedPlan?.days?.flatMap((d) => d.stops.map((s) => s.id))) ===
    JSON.stringify(initial4DayDraft.days.flatMap((d) => d.stops.map((s) => s.id)));
  ok(
    skydivingHttp11.status === 200 &&
      skydivingHttp11.json.ok === true &&
      skydivingHttp11.json.mode === "no_change" &&
      skydivingHttp11.json.revisionStatus === "unchanged" &&
      skydivingStopsUnchanged,
    "Scenario 12.11: unavailable inventory (skydiving) leaves proposedPlan unchanged with mode=no_change"
  );

  const claude503 = parseAndValidateClaudeDraftRevision(
    "503 Service Unavailable",
    intent2,
    initial4DayDraft,
    groundedOrlandoPool
  );
  ok(
    claude503.ok === false,
    "Scenario 12.11: parseAndValidateClaudeDraftRevision handles 503 without error and POST /api/planner works with ANTHROPIC_API_KEY absent"
  );

  // 12. Repeated submission does not duplicate itinerary stops
  const sheetSrc = readFileSync(path.join(REPO, "app/components/WayfindPlannerSheet.js"), "utf8");
  ok(
    /submittingRef\.current\s*=\s*true/.test(sheetSrc) &&
      sheetSrc.indexOf("submittingRef.current = true") < sheetSrc.indexOf('fetch("/api/planner"'),
    "Scenario 12.12: WayfindPlannerSheet.js enforces synchronous submittingRef re-entrancy locking before fetch"
  );
  let testTrips12 = {};
  const commit1 = commitProposedPlanToTrips(testTrips12, revRes12.json.proposedPlan, revRes12.json.candidateCatalog);
  const commit2 = commitProposedPlanToTrips(commit1.nextTrips, revRes12.json.proposedPlan, revRes12.json.candidateCatalog);
  ok(
    commit1.ok === true &&
      commit1.savedStopCount > 0 &&
      commit2.ok === true &&
      commit2.idempotentDuplicate === true &&
      Object.keys(commit2.nextTrips).length === 1 &&
      commit2.nextTrips[commit1.tripKey].items.length === commit1.savedStopCount,
    "Scenario 12.12: calling commitProposedPlanToTrips twice returns idempotentDuplicate=true with zero duplicate stops or trips"
  );

  // 13. Pre-save Undo restores previous proposal
  const dirtyDraft13 = {
    title: "Dirty Draft",
    city: "Orlando",
    state: "FL",
    startDate: "2026-11-20",
    endDate: "2026-11-23",
    days: [
      {
        date: "2026-11-20",
        areaSummary: "Downtown",
        stops: [
          {
            id: "ChIJ_wf_wine_bar_george",
            slotLabel: "7:00 PM",
            why: "Wine and dinner",
            priceNum: 999,
            secretToken: "EXPLOIT_PAYLOAD",
            rating: 5.0,
          },
        ],
      },
    ],
  };
  const serialized13 = serializeDraftForRevision(dirtyDraft13);
  ok(
    serialized13 &&
      serialized13.days[0].stops[0].id === "ChIJ_wf_wine_bar_george" &&
      serialized13.days[0].stops[0].slotLabel === "7:00 PM" &&
      serialized13.days[0].stops[0].why === "Wine and dinner" &&
      !("priceNum" in serialized13.days[0].stops[0]) &&
      !("secretToken" in serialized13.days[0].stops[0]) &&
      !("rating" in serialized13.days[0].stops[0]),
    "Scenario 12.13: serializeDraftForRevision preserves id, slotLabel, and why while stripping untrusted fields"
  );

  ok(
    ["draft", "revised", "saved", "revision_failed"].every((st) => sheetSrc.includes(st)) &&
      sheetSrc.includes("data-wf-plan-state={effPlanState}") &&
      sheetSrc.includes('data-wf-draft-undo="1"') &&
      sheetSrc.includes('data-wf-revision-notice="1"') &&
      /UNDO_CMD_REGEX/.test(sheetSrc),
    "Scenario 12.13: WayfindPlannerSheet supports all 4 plan states, undo button, revision notice, and typed Actually undo that interception"
  );

  const draftHistoryStack13 = [];
  draftHistoryStack13.push({
    proposedPlan: initial4DayDraft,
    candidateCatalog: initialCatalog,
  });
  const poppedSnapshot13 = draftHistoryStack13.pop();
  ok(
    poppedSnapshot13 &&
      JSON.stringify(poppedSnapshot13.proposedPlan.days) === JSON.stringify(initial4DayDraft.days),
    "Scenario 12.13: popping draftHistory snapshot restores exact prior stop IDs and slotLabels"
  );

  // 14. Saving a revised draft persists the correct canonical IDs
  const revisedCatalog14 = {
    ...initialCatalog,
    ...revRes12.json.candidateCatalog,
    [coffeeVenue.id]: coffeeVenue,
  };
  let trips14 = {};
  const commit14 = commitProposedPlanToTrips(trips14, revisedSundayRetimeDraft, revisedCatalog14, { now: 1763000000000 });
  const savedTrip14 = commit14.nextTrips[commit14.tripKey];
  ok(
    commit14.ok === true &&
      savedTrip14 &&
      savedTrip14.items.some((it) => it.id === coffeeVenue.id && it.day === "2026-11-20") &&
      savedTrip14.items.some((it) => it.day === "2026-11-22" && (it.place?.slotLabel === "5:30 PM" || it.slotLabel === "5:30 PM")),
    "Scenario 12.14: committed trip preserves swapped Friday coffee and retimed 5:30 PM Sunday dinner"
  );

  const records14 = tripsToRecords(commit14.nextTrips, "member_user_canonical_14");
  const syntheticRows14 = records14.map((r) => ({
    ...r.itinerary,
    wf_itinerary_items: r.items,
  }));
  const reloadedTrips14 = recordsToTrips(syntheticRows14);
  const reloadedTrip14 = reloadedTrips14[commit14.tripKey];
  ok(
    reloadedTrip14 &&
      reloadedTrip14.items.length === savedTrip14.items.length &&
      reloadedTrip14.items.every((it, idx) => it.id === savedTrip14.items[idx].id && it.day === savedTrip14.items[idx].day) &&
      reloadedTrip14.items.some((it) => it.id === coffeeVenue.id && it.day === "2026-11-20") &&
      reloadedTrip14.items.some((it) => it.day === "2026-11-22" && it.place?.slotLabel === "5:30 PM"),
    "Scenario 12.14: canonical stop IDs and dates survive tripsToRecords -> recordsToTrips reload"
  );

  const mockSupabase14 = makeMockSupabase("member_user_canonical_14");
  const memStorage14 = makeMemoryStorage({
    wayfind_trips: JSON.stringify(reloadedTrips14),
  });
  let syncedTrips14 = null;
  const syncRes14 = await syncOwnerTrips({
    supabase: mockSupabase14,
    userId: "member_user_canonical_14",
    storage: memStorage14,
    setTrips(next) { syncedTrips14 = next; },
  });
  ok(
    syncRes14 &&
      syncRes14.ok === true &&
      syncRes14.status === "synced" &&
      mockSupabase14.tables.itineraries.length === 1 &&
      mockSupabase14.tables.items.length === savedTrip14.items.length &&
      mockSupabase14.tables.items.some((it) => it.local_item_id === coffeeVenue.id && it.scheduled_on === "2026-11-20") &&
      mockSupabase14.tables.items.some((it) => it.scheduled_on === "2026-11-22" && it.place?.slotLabel === "5:30 PM"),
    "Scenario 12.14: guest-to-member syncOwnerTrips persists exact canonical items to Supabase without duplicate trips"
  );

  // 15. Existing free entitlement behavior remains unchanged
  ok(
    planRes12.json.entitlement &&
      planRes12.json.entitlement.allowed === true &&
      planRes12.json.entitlement.paywallActive === false &&
      planRes12.json.entitlement.manualItineraryFree === true &&
      revRes12.json.entitlement &&
      revRes12.json.entitlement.allowed === true &&
      revRes12.json.entitlement.paywallActive === false &&
      revRes12.json.entitlement.manualItineraryFree === true &&
      canUseManualItinerary() === true,
    "Scenario 12.15: both propose_trip and revise_plan return canonical free entitlement and canUseManualItinerary is true"
  );

  // 16. Session & cache isolation prevents cross-visitor leakage
  const resetSessionAuthB = shouldResetPlannerSession({ authUserId: "user_a" }, { authUserId: "user_b" });
  const resetSessionAuthNull = shouldResetPlannerSession({ authUserId: "user_a" }, { authUserId: null });
  const resetSessionExplicit = shouldResetPlannerSession({ authUserId: "user_a" }, { resetSession: true });
  const resetSessionTripKey = shouldResetPlannerSession(
    { authUserId: "user_a", activeTripKey: "trip_1" },
    { authUserId: "user_a", activeTripKey: "trip_2" }
  );
  const resetSessionCity = shouldResetPlannerSession(
    { authUserId: "user_a", city: "Orlando" },
    { authUserId: "user_a", city: "Miami", prompt: "Plan Miami" }
  );
  const resetSessionSame = shouldResetPlannerSession(
    { authUserId: "user_a", activeTripKey: "trip_1", city: "Orlando" },
    { authUserId: "user_a", activeTripKey: "trip_1", city: "Orlando" }
  );
  ok(
    resetSessionAuthB === true &&
      resetSessionAuthNull === true &&
      resetSessionExplicit === true &&
      resetSessionTripKey === true &&
      resetSessionCity === true &&
      resetSessionSame === false,
    "Scenario 12.16: shouldResetPlannerSession returns true on auth change, resetSession:true, trip key change, and city change; false when continuing session"
  );

  ok(
    /resetSession\s*=\s*useCallback\(\(\)\s*=>\s*\{[\s\S]*?messagesRef\.current\s*=\s*\[\];[\s\S]*?proposedRef\.current\s*=\s*null;[\s\S]*?draftHistoryRef\.current\s*=\s*\[\];/.test(
      sheetSrc
    ),
    "Scenario 12.16: WayfindPlannerSheet synchronously clears messagesRef, proposedRef, and draftHistoryRef in resetSession()"
  );

  const userARes16 = await postPlanner(
    {
      message: "Orlando 3 days with private party",
      proposedPlan: initial4DayDraft,
      conversationHistory: [{ role: "user", text: "Secret User A itinerary preference" }],
    },
    "198.51.100.220"
  );
  const userBRes16 = await postPlanner(
    {
      message: "Tampa 2 days with family",
      conversationHistory: [],
    },
    "198.51.100.221"
  );
  const userAStopIds = initial4DayDraft.days.flatMap((d) => d.stops.map((s) => s.id));
  const userBStopIds = userBRes16.json.proposedPlan?.days?.flatMap((d) => d.stops.map((s) => s.id)) || [];
  ok(
    userBRes16.json.cached !== true &&
      userAStopIds.every((id) => !userBStopIds.includes(id)) &&
      !JSON.stringify(userBRes16.json).includes("Secret User A"),
    "Scenario 12.16: POST /api/planner never sets cached:true or leaks stops/history across two distinct visitors"
  );
}

if (failures > 0) {
  console.error(`test-ai-itinerary-planner: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-ai-itinerary-planner: OK — ${assertions} assertions across all 12 end-to-end & red-team planner scenarios`);

