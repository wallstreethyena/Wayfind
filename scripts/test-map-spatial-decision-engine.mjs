#!/usr/bin/env node
/**
 * scripts/test-map-spatial-decision-engine.mjs
 *
 * End-to-end hermetic execution + SSR render verification for the Wayfind Map
 * Real-Time Spatial Decision Engine (Phases 1–49):
 *   1. 7-Way Location Truth (`resolveLocationTruth`, IP `locApprox === true` rejection,
 *      `Parrish` bootstrap non-personation, `near_me` vs `explore_here` across Florida).
 *   2. Honest Distance Semantics (`resolvePlaceDistanceSemantics`: physical user distance
 *      including `apple_live` pins; null when GPS is denied, never center-impersonation).
 *   3. THE HARD TEST (Sarasota physical GPS -> camera panned to Tampa -> search
 *      "Christmas tonight" -> select Tampa place): verifies `searchResultCards` +
 *      `MapScreen` SSR render simultaneously keep Sarasota user distance (~52–53 mi),
 *      Tampa discovery area, active-tonight holiday event inclusion, off-night
 *      select-nights exclusion, `approx: true` city-centroid exclusion, and unchanged
 *      public Wayfind Score.
 *   4. Florida Coastal & Water-Barrier Effort (`detectFloridaWaterCrossing`,
 *      `estimateFloridaDrive`, session-only `requestAppleDriveEstimate`, `searchDestinationParking`).
 *   5. Hours & Closing-Soon Feasibility (`evaluateHoursAndFeasibility`, `minUsefulVisitMinutes`).
 *   6. Weather & Beach Advisories (`evaluateWeatherFit`, `rain_safe` lens).
 *   7. Wayfind Score Law, Commercial Integrity & Canonical Venue Deduplication
 *      (`rankMapCandidates` preserves `Shown == Sorted` monotonic `byGovernedScore`
 *      and ignores `featured`/`sponsored` fields).
 *   8. Spatial Pairings & Multi-Stop Backtracking Optimizer (`isMapPairingEligible`,
 *      `buildAroundThisSuggestions`, `pairsWellWith` blocking errands/clinics/daycares,
 *      `analyzeItineraryOnMap`, `identifyStrongestPockets`).
 *   9. Coordinate Privacy, Deep Links & Session Analytics (`sanitizeStoredCenterPayload`,
 *      `shouldRecordRecentLocation`, `parseMapDeepLink`, `buildMapDeepLink`,
 *      `createMapSessionTracker` stripping `lat`/`lng`).
 *  10. Map/Area Infrastructure (`mapInventoryRow` colon IDs + `oh`/`tags`/`editorial`,
 *      `readCompleteMapArea` `maxPages` cap, `createAppleExplorerMap` `displayPriority: 1000`
 *      cluster immunity for selected pin).
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

import {
  NEAR_ME_RADIUS_MI,
  MAX_AREA_PAGES,
  haversineMiles,
  sanitizeStoredCenterPayload,
  shouldRecordRecentLocation,
  clampMapViewportBounds,
  resolveSpatialMetro,
  resolveLocationTruth,
  resolveMapScopeMode,
  resolvePlaceDistanceSemantics,
  evaluateCameraMovement,
  parseMapDeepLink,
  buildMapDeepLink,
  queryImpliesExplicitArea,
} from "../lib/mapLocationTruth.js";
import {
  detectFloridaWaterCrossing,
  estimateFloridaDrive,
  requestAppleDriveEstimate,
  searchDestinationParking,
} from "../lib/mapRouting.js";
import {
  MAP_MOMENT_LENSES,
  minUsefulVisitMinutes,
  evaluateHoursAndFeasibility,
  evaluateEventEligibility,
  evaluateWeatherFit,
  evaluateMapCandidate,
  rankMapCandidates,
  buildMapDecisionReason,
  aggregateActionabilityCoverage,
  buildMapTruthTrace,
  diagnoseExcludedPlace,
} from "../lib/mapDecisionEngine.js";
import {
  isMapPairingEligible,
  buildAroundThisSuggestions,
  analyzeItineraryOnMap,
  identifyStrongestPockets,
} from "../lib/mapPlanning.js";
import { createMapSessionTracker } from "../lib/mapAnalytics.js";
import { searchResultCards } from "../lib/searchCards.js";
import { pairsWellWith } from "../lib/pairsWellWith.js";
import { mapInventoryPlace, mapListIds, readMapPlacesByIds, mergeMapAreaContext } from "../lib/mapAreaData.js";
import { readCompleteMapArea } from "../lib/mapAreaRead.js";
import { createAppleExplorerController } from "../lib/appleExplorerMap.js";
import { toDisplayScore } from "../lib/score.js";
import { DEFAULT_CENTER } from "../lib/locationHonesty.js";
import { landingSearchFromSearch } from "../lib/searchDeepLink.js";

const SARASOTA_GPS = { lat: 27.3364, lng: -82.5307 };
const TAMPA_CENTER = { lat: 27.9506, lng: -82.4572 };
const ST_PETE_DOWNTOWN = { lat: 27.7676, lng: -82.6403 };
const ANNA_MARIA_ISLAND = { lat: 27.5078, lng: -82.7131 };
const SIESTA_KEY = { lat: 27.2670, lng: -82.5463 };
const MIAMI_MAINLAND = { lat: 25.7743, lng: -80.1937 };
const MIAMI_BEACH = { lat: 25.7907, lng: -80.1300 };
const PARRISH_BOOTSTRAP = { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng };
let mapComponentMod = null;

// ── 1. 7-Way Location Truth & Near Me vs Explore Here ─────────────────────
{
  // Bootstrap seed with no GPS must NEVER claim deviceLocation or Near Me
  const bootTruth = resolveLocationTruth({
    rawDeviceLoc: null,
    locApprox: false,
    discoveryCenter: PARRISH_BOOTSTRAP,
    locName: "Parrish, FL",
    manual: false,
    screen: "map",
  });
  assert.equal(bootTruth.deviceLocation, null, "bootstrap center must never become deviceLocation");
  assert.equal(bootTruth.bootstrapCenter.active, true, "bootstrap seed is flagged active");
  const bootScope = resolveMapScopeMode(bootTruth);
  assert.equal(bootScope.mode, "explore_here", "without physical GPS, scope mode is explore_here");
  assert.equal(bootScope.hasPhysicalLocation, false);

  // Approximate IP fallback (`locApprox === true`) must NEVER masquerade as physical GPS
  const ipTruth = resolveLocationTruth({
    rawDeviceLoc: { lat: 27.9506, lng: -82.4572 },
    locApprox: true,
    discoveryCenter: TAMPA_CENTER,
    locName: "Tampa, FL",
    manual: false,
    screen: "map",
  });
  assert.equal(ipTruth.deviceLocation, null, "IP-approximate coordinates must be rejected from deviceLocation");
  assert.equal(ipTruth.approximateIpLocation?.source, "ip_approx", "IP-approximate coordinates are isolated in approximateIpLocation");

  // Physical GPS near camera -> near_me
  const nearTruth = resolveLocationTruth({
    rawDeviceLoc: SARASOTA_GPS,
    locApprox: false,
    discoveryCenter: SARASOTA_GPS,
    locName: "Sarasota, FL",
    viewport: { north: 27.38, south: 27.29, east: -82.48, west: -82.58 },
    screen: "map",
  });
  assert.equal(nearTruth.deviceLocation?.source, "gps");
  const nearScope = resolveMapScopeMode(nearTruth);
  assert.equal(nearScope.mode, "near_me", "camera within NEAR_ME_RADIUS_MI of physical GPS resolves near_me");
  assert.equal(nearScope.hasPhysicalLocation, true);
  assert.ok(NEAR_ME_RADIUS_MI > 0 && nearScope.driftMi < NEAR_ME_RADIUS_MI);

  // Physical GPS in Sarasota, camera panned to Tampa -> explore_here while keeping Sarasota deviceLocation!
  const tampaViewport = { north: 28.05, south: 27.85, east: -82.35, west: -82.56 };
  const pannedTruth = resolveLocationTruth({
    rawDeviceLoc: SARASOTA_GPS,
    locApprox: false,
    discoveryCenter: SARASOTA_GPS,
    locName: "Sarasota, FL",
    viewport: tampaViewport,
    screen: "map",
  });
  assert.deepEqual(
    { lat: pannedTruth.deviceLocation.lat, lng: pannedTruth.deviceLocation.lng },
    SARASOTA_GPS,
    "panning camera to Tampa must never overwrite Sarasota deviceLocation"
  );
  assert.equal(pannedTruth.mapCenter.metro, "tampa", "mapCenter resolves Tampa metro");
  assert.equal(pannedTruth.searchLocation.source, "map_viewport", "searching on /map defaults to active map viewport");
  const pannedScope = resolveMapScopeMode(pannedTruth);
  assert.equal(pannedScope.mode, "explore_here");
  assert.ok(pannedScope.driftMi > 40, "Sarasota -> Tampa drift exceeds 40 miles");

  // Explicit city in query overrides map viewport without changing deviceLocation
  const explicitCityTruth = resolveLocationTruth({
    rawDeviceLoc: SARASOTA_GPS,
    locApprox: false,
    discoveryCenter: SARASOTA_GPS,
    viewport: tampaViewport,
    queryGeo: { lat: 25.7617, lng: -80.1918, name: "Miami, FL" },
    screen: "map",
  });
  assert.equal(explicitCityTruth.searchLocation.source, "query_city");
  assert.equal(explicitCityTruth.deviceLocation.lat, SARASOTA_GPS.lat);

  // Metro resolution across Florida regions & barrier islands
  assert.equal(resolveSpatialMetro(SIESTA_KEY).id, "sarasota");
  assert.equal(resolveSpatialMetro(ST_PETE_DOWNTOWN).id, "tampa");
  assert.equal(resolveSpatialMetro({ lat: 28.5383, lng: -81.3792 }).id, "orlando");
  assert.equal(resolveSpatialMetro(MIAMI_BEACH).id, "miami");
  assert.equal(resolveSpatialMetro({ lat: 24.5551, lng: -81.7800 }).id, "keys");
  assert.equal(resolveSpatialMetro({ lat: 26.4434, lng: -82.0223 }).id, "swfl");
}

// ── 2. Honest Distance Semantics & Camera Movement Governance ──────────────
{
  const tampaPlace = { id: "tampa-1", name: "Curtis Hixon Park", lat: 27.9498, lng: -82.4622 };
  const fromSarasota = resolvePlaceDistanceSemantics(tampaPlace, {
    verifiedDeviceLoc: SARASOTA_GPS,
    areaCenter: TAMPA_CENTER,
  });
  assert.equal(fromSarasota.kind, "from_you");
  assert.ok(fromSarasota.miles > 40 && fromSarasota.miles < 55, `expected ~43 mi straight-line Sarasota->Tampa, got ${fromSarasota.miles}`);

  // Apple live-recovered pin where cardPlace strips lat/lng, but pinPoint supplies display coord
  const strippedAppleCard = { id: "apple-1", name: "Oxford Exchange", lat: null, lng: null };
  const appleDist = resolvePlaceDistanceSemantics(strippedAppleCard, {
    verifiedDeviceLoc: SARASOTA_GPS,
    pinPoint: { lat: 27.9447, lng: -82.4642 },
  });
  assert.equal(appleDist.kind, "from_you");
  assert.ok(appleDist.miles > 40);

  // Denied GPS -> MUST return null when allowAreaFallback is false (never impersonate user distance)
  const deniedDist = resolvePlaceDistanceSemantics(tampaPlace, {
    verifiedDeviceLoc: null,
    areaCenter: PARRISH_BOOTSTRAP,
    allowAreaFallback: false,
  });
  assert.equal(deniedDist, null, "denied GPS must never pretend bootstrap/center distance is user distance");

  // Explicit area fallback qualifies with "from center"
  const centerDist = resolvePlaceDistanceSemantics(tampaPlace, {
    verifiedDeviceLoc: null,
    areaCenter: TAMPA_CENTER,
    allowAreaFallback: true,
  });
  assert.equal(centerDist.kind, "from_center");
  assert.ok(centerDist.text.includes("from center"));

  // Viewport clamping & active-selection protection
  const statewideBox = { north: 30.8, south: 24.5, east: -80.0, west: -87.6 };
  const clamped = clampMapViewportBounds(statewideBox);
  assert.equal(clamped.clamped, true);
  assert.ok(clamped.north - clamped.south <= 1.36);
  assert.ok(clamped.east - clamped.west <= 1.56);

  const inspecting = evaluateCameraMovement({
    prevViewport: { north: 27.38, south: 27.29, east: -82.48, west: -82.58 },
    nextViewport: { north: 28.05, south: 27.85, east: -82.35, west: -82.56 },
    discoveryOrigin: SARASOTA_GPS,
    hasActiveSelection: true,
    coveredBoxes: [],
  });
  assert.equal(inspecting.action, "background_preload", "active pin selection prevents disruptive foreground reset");
  assert.equal(inspecting.offerExploreHere, true);
}

// ── 3. Florida Water-Barrier & Bridge Effort + Ephemeral Apple Routing ─────
{
  // St. Pete -> Anna Maria Island crosses mouth of Tampa Bay (Sunshine Skyway)
  const skywayCrossing = detectFloridaWaterCrossing(ST_PETE_DOWNTOWN, ANNA_MARIA_ISLAND);
  assert.equal(skywayCrossing?.kind, "skyway_bay_crossing");
  const skywayDrive = estimateFloridaDrive(ST_PETE_DOWNTOWN, ANNA_MARIA_ISLAND);
  // Compare with inland trip of similar ~18 mi straight-line distance
  const inlandDrive = estimateFloridaDrive(TAMPA_CENTER, { lat: 28.03, lng: -82.22 });
  assert.ok(
    skywayDrive.driveMinEst > inlandDrive.driveMinEst + 12,
    `Skyway bay crossing (${skywayDrive.driveMinEst}m) must exceed inland drive (${inlandDrive.driveMinEst}m)`
  );
  assert.equal(skywayDrive.isEstimate, true);

  // Sarasota mainland -> Siesta Key drawbridge
  const siestaDrive = estimateFloridaDrive(SARASOTA_GPS, SIESTA_KEY);
  assert.equal(siestaDrive.waterCrossingKind, "barrier_island_bridge");

  // Miami mainland -> Miami Beach causeway
  const miamiBeachDrive = estimateFloridaDrive(MIAMI_MAINLAND, MIAMI_BEACH);
  assert.equal(miamiBeachDrive.waterCrossingKind, "barrier_island_bridge");

  // Fort Myers <-> Cape Coral Caloosahatchee crossing
  const riverDrive = estimateFloridaDrive({ lat: 26.6406, lng: -81.8723 }, { lat: 26.5629, lng: -81.9495 });
  assert.equal(riverDrive.waterCrossingKind, "river_bridge");

  // Florida Keys US-1 corridor
  const keysDrive = estimateFloridaDrive({ lat: 25.0865, lng: -80.4473 }, { lat: 24.9243, lng: -80.6278 });
  assert.equal(keysDrive.waterCrossingKind, "keys_corridor");

  // Ephemeral Apple Directions route upgrade + parking search
  let routeCalls = 0;
  const fakeMapKit = {
    Coordinate: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } },
    CoordinateRegion: class { constructor(c, s) { this.center = c; this.span = s; } },
    CoordinateSpan: class { constructor(dLat, dLng) { this.latitudeDelta = dLat; this.longitudeDelta = dLng; } },
    Directions: Object.assign(
      class {
        route(req, cb) {
          routeCalls += 1;
          cb(null, { routes: [{ expectedTravelTime: 1320, distance: 28968 }] });
        }
      },
      { Transport: { Automobile: "AUTOMOBILE" } }
    ),
    PointOfInterestCategory: { Parking: "Parking" },
    PointOfInterestFilter: { including: (cats) => ({ cats }) },
    PointsOfInterestSearch: class {
      async search() {
        return {
          places: [
            { name: "Palm Ave Public Parking Garage", formattedAddress: "1289 N Palm Ave", coordinate: { latitude: 27.3292, longitude: -82.5412 }, pointOfInterestCategory: "Parking" },
          ],
        };
      }
    },
  };
  const liveEst = await requestAppleDriveEstimate(fakeMapKit, SARASOTA_GPS, SIESTA_KEY);
  assert.equal(liveEst.driveMinEst, 22);
  assert.equal(liveEst.isEstimate, false);
  assert.equal(liveEst.source, "apple_mapkit_ephemeral");
  // Cached within session -> second call does not re-hit Apple Directions
  const cachedEst = await requestAppleDriveEstimate(fakeMapKit, SARASOTA_GPS, SIESTA_KEY);
  assert.equal(cachedEst.driveMinEst, 22);
  assert.equal(routeCalls, 1);

  const parkingRes = await searchDestinationParking(fakeMapKit, { id: "selby", name: "Marie Selby Gardens", lat: 27.3275, lng: -82.5415 });
  assert.equal(parkingRes.status, "ready");
  assert.equal(parkingRes.items[0].name, "Palm Ave Public Parking Garage");
  assert.ok(parkingRes.items[0].driveHref.includes("maps.apple.com"));
}

// ── 4. Hours & Closing-Soon Feasibility + Weather + Score Law ──────────────
{
  // Wednesday 16:25 ET (21:25 UTC in Nov EST, utcOffset = -300)
  const wed1625 = Date.parse("2026-11-11T21:25:00Z");
  const museumClosing1700 = {
    id: "ringling-museum",
    name: "The Ringling Museum",
    primaryType: "museum",
    category: "attractions",
    lat: 27.3815,
    lng: -82.5604,
    governed_score: 96,
    utcOffset: -300,
    oh: {
      periods: [
        { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 17, minute: 0 } },
      ],
    },
  };
  assert.equal(minUsefulVisitMinutes(museumClosing1700), 55);
  // Closing in 35m with a 22m drive -> unviable!
  const unviable = evaluateHoursAndFeasibility(museumClosing1700, { driveMinEst: 22 }, wed1625);
  assert.equal(unviable.confirmedOpen, true);
  assert.equal(unviable.closingFeasible, false);
  assert.equal(unviable.state, "closing_infeasible");

  // Under `open_now` lens, closing_infeasible is excluded honestly!
  const openNowMuseum = evaluateMapCandidate(museumClosing1700, {
    nowMs: wed1625,
    liveRoute: { driveMinEst: 22 },
    lens: "open_now",
  });
  assert.equal(openNowMuseum.eligible, false);
  assert.equal(openNowMuseum.exclusionReason, "closing_infeasible");

  // Coffee shop closing in 35m with a 5m drive -> minUsefulVisitMinutes = 15 -> feasible!
  const cafeClosing1700 = {
    ...museumClosing1700,
    id: "perq-coffee",
    name: "Perq Coffee Bar",
    primaryType: "coffee_shop",
    category: "food",
  };
  const viableCafe = evaluateHoursAndFeasibility(cafeClosing1700, { driveMinEst: 5 }, wed1625);
  assert.equal(viableCafe.closingFeasible, true);
  assert.equal(viableCafe.state, "closing_soon");

  // ── All 7 Temporal Cases for evaluateHoursAndFeasibility ──
  // Case 1: Known open (10:00–22:00 evaluated at 14:00, plenty of time before close)
  const wed1400 = Date.parse("2026-10-14T18:00:00Z"); // 14:00 EDT
  const daytimePlace = {
    id: "open-venue",
    name: "Open Venue",
    lat: 27.33,
    lng: -82.53,
    utcOffset: -240,
    oh: { periods: [{ open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 22, minute: 0 } }] },
  };
  const knownOpen = evaluateHoursAndFeasibility(daytimePlace, { driveMinEst: 10 }, wed1400);
  assert.equal(knownOpen.confirmedOpen, true);
  assert.equal(knownOpen.closingFeasible, true);
  assert.equal(knownOpen.state, "open");
  assert.equal(knownOpen.hoursUnconfirmed, false);

  // Case 2: Known closed (10:00–17:00 evaluated at 20:00 EDT)
  const wed2000 = Date.parse("2026-10-15T00:00:00Z"); // 20:00 EDT
  const knownClosed = evaluateHoursAndFeasibility(museumClosing1700, null, wed2000);
  assert.equal(knownClosed.confirmedOpen, false);
  assert.equal(knownClosed.hoursUnconfirmed, false);
  assert.equal(knownClosed.state, "closed");

  // Case 3a: Missing / unknown hours -> hours_unconfirmed
  const unknownHoursPlace = { id: "no-hours", name: "Mystery Spot", lat: 27.33, lng: -82.53, category: "food", governed_score: 94 };
  const unknownHrs = evaluateHoursAndFeasibility(unknownHoursPlace, null, wed1625);
  assert.equal(unknownHrs.hoursUnconfirmed, true);
  assert.equal(unknownHrs.confirmedOpen, false);
  assert.equal(unknownHrs.state, "hours_unconfirmed");

  // Case 3b: Expired Google-sourced hours (> 30 days) -> hours_unconfirmed
  const expiredGooglePlace = {
    ...daytimePlace,
    hoursAsOf: wed1400 - (31 * 86400000), // 31 days old
  };
  const expiredGoogleHrs = evaluateHoursAndFeasibility(expiredGooglePlace, null, wed1400);
  assert.equal(expiredGoogleHrs.hoursUnconfirmed, true);
  assert.equal(expiredGoogleHrs.confirmedOpen, false);
  assert.equal(expiredGoogleHrs.state, "hours_unconfirmed");

  // Case 3c: Expired ownedHours -> hours_unconfirmed
  const expiredOwnedPlace = {
    id: "owned-expired",
    name: "Owned Expired",
    lat: 27.33,
    lng: -82.53,
    ownedHours: {
      periods: [{ open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 22, minute: 0 } }],
      expiresAt: new Date(wed1400 - 3600000).toISOString(),
    },
  };
  const expiredOwnedHrs = evaluateHoursAndFeasibility(expiredOwnedPlace, null, wed1400);
  assert.equal(expiredOwnedHrs.hoursUnconfirmed, true);
  assert.equal(expiredOwnedHrs.confirmedOpen, false);
  assert.equal(expiredOwnedHrs.state, "hours_unconfirmed");

  // Case 4: Overnight opening (Bar open 20:00 Fri to 02:00 Sat, evaluated at 00:45 Sat local time -> confirmed open, 75 min until close!)
  const sat0045 = Date.parse("2026-10-17T04:45:00Z"); // Saturday 00:45 EDT (UTC-4)
  const overnightBar = {
    id: "overnight-bar",
    name: "Midnight Tavern",
    primaryType: "bar",
    category: "nightlife",
    lat: 27.33,
    lng: -82.53,
    utcOffset: -240,
    oh: { periods: [{ open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }] },
  };
  const overnightEval = evaluateHoursAndFeasibility(overnightBar, { driveMinEst: 10 }, sat0045);
  assert.equal(overnightEval.confirmedOpen, true);
  assert.equal(overnightEval.minutesUntilClose, 75);
  assert.equal(overnightEval.closingFeasible, true);
  assert.equal(overnightEval.state, "open");

  // Case 5: Timezone boundary (Pensacola in Florida Panhandle America/Chicago vs Tampa America/New_York)
  const pensacolaBar = {
    id: "pensacola-seville",
    name: "Seville Quarter Pensacola",
    lat: 30.4213,
    lng: -87.2169,
    oh: { periods: [{ open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }] },
  };
  // At 2026-10-17 04:45 UTC, local time in America/Chicago (-300 CDT) is Friday 23:45 CDT (day 5, 23:45) -> open, 135m until close!
  const pensacolaEval = evaluateHoursAndFeasibility(pensacolaBar, { driveMinEst: 10 }, sat0045);
  assert.equal(pensacolaEval.confirmedOpen, true);
  assert.equal(pensacolaEval.minutesUntilClose, 135);

  // Case 6: Exceptional closure / special-hours uncertainty
  const closedPlace = {
    id: "special-closed-place",
    name: "Closed for Private Event",
    lat: 27.33,
    lng: -82.53,
    ownedHours: {
      periods: [{ open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 22, minute: 0 } }],
      specialHoursClosure: true,
    },
  };
  const closedEval = evaluateHoursAndFeasibility(closedPlace, null, wed1400);
  assert.equal(closedEval.confirmedOpen, false);
  assert.equal(closedEval.hoursUnconfirmed, false);
  assert.equal(closedEval.state, "closed");

  // Holiday date (Christmas Day Dec 25) without holiday confirmation -> hours_unconfirmed
  const xmasEpoch = Date.parse("2026-12-25T18:00:00Z"); // Dec 25, 2026 13:00 EST
  const xmasUnverified = {
    id: "xmas-unverified",
    name: "Holiday Cafe",
    lat: 27.33,
    lng: -82.53,
    utcOffset: -300,
    oh: { periods: [{ open: { day: 5, hour: 8, minute: 0 }, close: { day: 5, hour: 20, minute: 0 } }] },
  };
  const xmasEval = evaluateHoursAndFeasibility(xmasUnverified, null, xmasEpoch);
  assert.equal(xmasEval.confirmedOpen, false);
  assert.equal(xmasEval.hoursUnconfirmed, true);
  assert.equal(xmasEval.state, "hours_unconfirmed");
  assert.equal(xmasEval.specialHoursUncertainty, true);

  // Christmas Day WITH explicit holiday confirmation -> confirmed open
  const xmasConfirmed = {
    ...xmasUnverified,
    holidayHoursConfirmed: true,
  };
  const xmasConfirmedEval = evaluateHoursAndFeasibility(xmasConfirmed, { driveMinEst: 10 }, xmasEpoch);
  assert.equal(xmasConfirmedEval.confirmedOpen, true);
  assert.equal(xmasConfirmedEval.state, "open");

  // Case 7: Arrival-before-closing feasibility
  assert.equal(unviable.confirmedOpen, true);
  assert.equal(unviable.closingFeasible, false);
  assert.equal(unviable.state, "closing_infeasible");
  assert.equal(openNowMuseum.eligible, false);
  assert.equal(openNowMuseum.exclusionReason, "closing_infeasible");
  assert.equal(viableCafe.closingFeasible, true);
  assert.equal(viableCafe.state, "closing_soon");

  // Heavy rain penalizes outdoor beach/park and promotes indoor aquarium/museum,
  // while NEVER changing public Wayfind Score (`governed_score` / `toDisplayScore`)!
  const heavyRain = { rain: 85, wet: true, temp: 74, feels: 75 };
  const outdoorPark = {
    id: "bayfront-park",
    name: "Bayfront Park",
    primaryType: "park",
    types: ["park"],
    category: "attractions",
    lat: 27.3330,
    lng: -82.5460,
    governed_score: 94.0,
    wfScore: 94.0,
    featured: true,
    sponsored: true,
  };
  const indoorAquarium = {
    id: "mote-aquarium",
    name: "Mote Marine Aquarium",
    primaryType: "aquarium",
    types: ["aquarium", "museum"],
    category: "attractions",
    lat: 27.3335,
    lng: -82.5770,
    governed_score: 94.0,
    wfScore: 94.0,
  };
  const twinDuplicateAquarium = {
    ...indoorAquarium,
    id: "fsq:mote-dup",
    governed_score: 93.8,
  };
  const higherScorePlace = {
    id: "selby-96",
    name: "Marie Selby Botanical Gardens",
    primaryType: "botanical_garden",
    types: ["botanical_garden"],
    category: "attractions",
    lat: 27.3275,
    lng: -82.5415,
    governed_score: 96.0,
    wfScore: 96.0,
  };

  const wetBundle = rankMapCandidates(
    [outdoorPark, indoorAquarium, twinDuplicateAquarium, higherScorePlace],
    { nowMs: wed1625, verifiedDeviceLoc: SARASOTA_GPS, weather: heavyRain }
  );
  // 1. Canonical deduplication removed twinDuplicateAquarium
  assert.equal(wetBundle.places.length, 3);
  assert.equal(wetBundle.exclusions.get("fsq:mote-dup")?.exclusionReason, "deduped_same_venue");
  // 2. Monotonic Wayfind Score order preserved: 9.6 stays #1 even though outdoor!
  assert.equal(wetBundle.places[0].id, "selby-96");
  // 3. Within equal 9.4 band, indoor Mote outranks outdoor Bayfront Park (even with featured/sponsored on Bayfront!)
  assert.equal(wetBundle.places[1].id, "mote-aquarium");
  assert.equal(wetBundle.places[2].id, "bayfront-park");
  // 4. Public Wayfind Scores are 100% untouched
  assert.equal(toDisplayScore(wetBundle.places[0].governed_score), 9.6);
  assert.equal(toDisplayScore(wetBundle.places[1].governed_score), 9.4);
  assert.equal(toDisplayScore(wetBundle.places[2].governed_score), 9.4);

  // Under `rain_safe` lens, outdoor park is excluded while indoor aquarium stays
  const rainSafeBundle = rankMapCandidates([outdoorPark, indoorAquarium], {
    nowMs: wed1625,
    weather: heavyRain,
    lens: "rain_safe",
  });
  assert.deepEqual(rainSafeBundle.places.map((p) => p.id), ["mote-aquarium"]);

  // Poor water quality advisory demotes beach
  const beachFit = evaluateWeatherFit(
    { id: "lido", name: "Lido Beach", category: "beach", primaryType: "beach" },
    { rain: 0, wet: false, temp: 84 },
    { water: { advisory: true, result: "Poor" } }
  );
  assert.equal(beachFit.rainSafe, false);
  assert.ok(beachFit.delta < -20);
  assert.equal(beachFit.tag, "Water advisory");
}

// ── 5. THE HARD TEST (Sarasota GPS + Tampa Pan + "Christmas tonight" + SSR) ─
{
  const nov13Evening = Date.parse("2026-11-13T23:30:00Z"); // Friday Nov 13, 2026 18:30 EST

  // Build search result cards from `searchResultCards`:
  // - 1 valid Tampa Christmas event running tonight (venue_lat/venue_lng present)
  // - 1 off-night Tampa Christmas event (runs Saturdays only; Nov 13, 2026 is Friday!)
  // - 1 unpinned city-centroid event (`approx: true`, no `venue_lat` -> must NOT get fake map coords!)
  // Calendar-invariant date window & off-day schedule for real `<MapScreen />` SSR clock:
  const sysNow = new Date();
  const estDayIdx = new Date(sysNow.getTime() - 5 * 3600000).getUTCDay();
  const offDayPlural = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][(estDayIdx + 2) % 7];
  const winStart = new Date(sysNow.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const winEnd = new Date(sysNow.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const rawSearchResult = {
    places: [
      {
        id: "tampa-oxford-holiday",
        name: "Tampa Riverwalk Holiday Market",
        category: "attractions",
        primaryType: "tourist_attraction",
        lat: 27.9478,
        lng: -82.4614,
        rating: 4.8,
        reviews: 1850,
        wfScore: 95.0,
        governed_score: 95.0,
        seasonal: "christmas",
        editorial: "Waterfront holiday village and lights along the Hillsborough River.",
      },
    ],
    events: [
      {
        event_id: "ev-curtis-hixon-xmas",
        slug: "winter-village-curtis-hixon",
        event_name: "Winter Village at Curtis Hixon Christmas Market",
        venue_name: "Curtis Hixon Waterfront Park",
        venue_lat: 27.9498,
        venue_lng: -82.4622,
        city: "Tampa",
        category: "holiday",
        tags: ["christmas", "holiday"],
        start_date: winStart,
        end_date: winEnd,
        schedule_note: "Daily 5pm–10pm",
      },
      {
        event_id: "ev-saturday-only-lights",
        slug: "off-night-toy-train-lights",
        event_name: "Christmas Toy Train Lights",
        venue_name: "Hyde Park Village",
        venue_lat: 27.9367,
        venue_lng: -82.4765,
        city: "Tampa",
        category: "holiday",
        tags: ["christmas", "holiday"],
        start_date: winStart,
        end_date: winEnd,
        schedule_note: `${offDayPlural} only`,
      },
      {
        event_id: "ev-approx-centroid",
        slug: "unconfirmed-tampa-christmas-popup",
        event_name: "Unconfirmed Tampa Christmas Pop-Up",
        city: "Tampa",
        category: "holiday",
        tags: ["christmas", "holiday"],
        approx: true,
        lat: 27.9506,
        lng: -82.4572,
        start_date: winStart,
        end_date: winEnd,
      },
    ],
  };

  // Unconstrained "Christmas" returns all 3 event cards (with approx stripped to null coords),
  // letting us prove BOTH server-side "Christmas tonight" filtering AND client-side `<MapScreen />` tonight filtering!
  const broadRes = await searchResultCards({
    query: "Christmas",
    lat: TAMPA_CENTER.lat,
    lng: TAMPA_CENTER.lng,
    places: rawSearchResult.places,
    events: rawSearchResult.events,
    guides: [],
  });
  const searchCards = broadRes.cards;
  const approxCard = searchCards.find((c) => c.id === "event:ev-approx-centroid");
  assert.ok(approxCard, "unconfirmed event card exists in broad search list");
  assert.equal(approxCard.lat, null, "approx: true event without venue_lat must NEVER receive fake city-centroid pin coordinates");
  assert.equal(approxCard.lng, null);

  const tonightRes = await searchResultCards({
    query: "Christmas tonight",
    lat: TAMPA_CENTER.lat,
    lng: TAMPA_CENTER.lng,
    places: rawSearchResult.places,
    events: rawSearchResult.events,
    guides: [],
  });
  assert.ok(tonightRes.cards.some((c) => c.id === "event:ev-curtis-hixon-xmas"), "server-side Christmas tonight keeps active tonight event");
  assert.ok(!tonightRes.cards.some((c) => c.id === "event:ev-saturday-only-lights"), "server-side Christmas tonight drops off-night event");

  const activeTonightEval = evaluateEventEligibility(
    {
      ...searchCards.find((c) => c.id === "event:ev-curtis-hixon-xmas"),
      start_date: "2026-11-01",
      end_date: "2027-01-04",
    },
    nov13Evening
  );
  assert.equal(activeTonightEval.activeToday, true);

  const offNightEval = evaluateEventEligibility(
    {
      ...searchCards.find((c) => c.id === "event:ev-saturday-only-lights"),
      start_date: "2026-11-01",
      end_date: "2026-12-28",
      schedule_note: "Saturdays only",
    },
    nov13Evening
  );
  assert.equal(offNightEval.activeToday, false, "Saturday-only event must be inactive on Friday Nov 13");
  assert.equal(offNightEval.state, "off_night");

  // Render real `<MapScreen />` in this exact Hard Test state:
  // User physically in Sarasota (`deviceLoc` = SARASOTA_GPS), camera looking at Tampa,
  // `mapSearch` = { query: "Christmas tonight", center: TAMPA_CENTER, constraints: { when: "tonight" }, cards: searchCards },
  // and `mapPreview` = Tampa Riverwalk Holiday Market!
  const REPO = fileURLToPath(new URL("..", import.meta.url));
  const entry = fileURLToPath(new URL("../app/components/screens/Map.js", import.meta.url));
  let capturedAppleProps = null;
  mapComponentMod = await loadComponent(entry, REPO, {
    onGraph(graph) {
      const compiled = graph.get(entry);
      let source = readFileSync(compiled, "utf8");
      source = source
        .replace(/const \[areaPlaces, setAreaPlaces\] = useState\(\[\]\);/, "const [areaPlaces, setAreaPlaces] = useState(ctx.__seedAreaPlaces || []);")
        .replace(/const \[areaStatus, setAreaStatus\] = useState\("loading"\);/, 'const [areaStatus, setAreaStatus] = useState(ctx.__seedAreaStatus || "ready");')
        .replace(/const \[viewport, setViewport\] = useState\(null\);/, "const [viewport, setViewport] = useState(ctx.__seedViewport || null);");
      writeFileSync(compiled, source);

      const appleEntry = fileURLToPath(new URL("../app/components/AppleExplorerMap.js", import.meta.url));
      const appleCompiled = graph.get(appleEntry);
      const appleSrc = readFileSync(appleCompiled, "utf8");
      writeFileSync(
        appleCompiled,
        appleSrc.replace("export default function AppleExplorerMap(", "function AppleExplorerMap(") +
          "\nexport default function AppleProbe(props) { globalThis.__hardTestAppleProps?.(props); return AppleExplorerMap(props); }\n"
      );
    },
  });
  const mod = mapComponentMod;
  globalThis.__hardTestAppleProps = (p) => { capturedAppleProps = p; };

  const selectedTampaPlace = {
    ...searchCards.find((c) => c.id === "tampa-oxford-holiday"),
    wfScore: 95.0,
    governed_score: 95.0,
  };
  const mapCameraRef = { current: null };
  const html = renderToStaticMarkup(
    createElement(mod.default, {
      ctx: {
        __seedAreaPlaces: [selectedTampaPlace],
        __seedAreaStatus: "ready",
        __seedViewport: { north: 28.05, south: 27.85, east: -82.35, west: -82.56 },
        searchMapArea: () => {},
        mapMode: "places",
        setMapMode: () => {},
        mapBrowse: true,
        setMapBrowse: () => {},
        mapPool: [],
        mapListOverride: null,
        map3D: false,
        setMap3D: () => {},
        mapRetryKey: 0,
        setMapRetryKey: () => {},
        cat: "attractions",
        setCat: () => {},
        sub: "all",
        setSub: () => {},
        setVibe: () => {},
        sortBy: "best",
        center: SARASOTA_GPS,
        deviceLoc: SARASOTA_GPS,
        locApprox: false,
        mapCameraRef,
        mapSearch: {
          query: "Christmas tonight",
          center: TAMPA_CENTER,
          constraints: { when: "tonight" },
          cards: searchCards,
        },
        setMapSearch: () => {},
        mapUrlLens: null,
        setMapUrlLens: () => {},
        mapUrlPlaceId: null,
        setMapUrlPlaceId: () => {},
        mapFocus: null,
        setMapFocus: () => {},
        setMapSearchOpen: () => {},
        events: [],
        eventsLoading: false,
        eventsUnavailable: false,
        mapDate: "all",
        setMapDate: () => {},
        mapPreview: selectedTampaPlace,
        setMapPreview: () => {},
        mapDrawer: false,
        setMapDrawer: () => {},
        eventPreview: null,
        setEventPreview: () => {},
        suggested: [],
        places: [],
        view: [],
        liked: {},
        disliked: {},
        featuredBoost: () => 0,
        MapView: () => createElement("div"),
        CategoryMenu: () => createElement("div"),
        FallbackImg: () => createElement("img"),
        iconForPlace: () => "✨",
        liveOpen: () => null,
        logEvent: () => {},
        loadEvents: () => {},
        openDetail: () => {},
        openVenue: () => {},
        ticketUrl: (u) => u,
        Hol: { worldCup: () => false, fitFor: () => 0 },
        recenterToMe: () => {},
        isBeach: () => false,
        beachSignals: {},
        PlaceCard: () => createElement("div"),
        isSaved: () => false,
        toggleLike: () => {},
        toggleDislike: () => {},
        quickSaveFavorite: () => {},
        addShared: () => {},
        giveawayMark: () => {},
        blurbs: {},
        openExperience: () => {},
        openCuisine: () => {},
        cityNow: "Sarasota",
        locName: "Sarasota, FL",
        weather: { rain: 10, wet: false, temp: 72 },
        trips: [],
        setTrips: () => {},
        activeTrip: null,
        isOnTrip: () => false,
        addToItinerary: () => {},
        showToast: () => {},
        mapDefaultAppliedRef: { current: true },
        categoryChosenRef: { current: false },
        searchMode: false,
      },
    })
  );
  delete globalThis.__hardTestAppleProps;

  assert.ok(capturedAppleProps, "AppleExplorerMap received props during Hard Test SSR render");
  const pinnedIds = capturedAppleProps.places.map((p) => p.id);
  assert.ok(pinnedIds.includes("tampa-oxford-holiday"), "Tampa holiday place is pinned");
  assert.ok(pinnedIds.includes("event:ev-curtis-hixon-xmas"), "Tampa Christmas event active tonight is pinned");
  assert.ok(!pinnedIds.includes("event:ev-saturday-only-lights"), "Off-night event is excluded from map pins");
  assert.ok(!pinnedIds.includes("event:ev-approx-centroid"), "Approximate city-centroid event is excluded from map pins");
  assert.deepEqual(capturedAppleProps.deviceLoc, SARASOTA_GPS, "User blue dot stays in Sarasota");
  assert.ok(
    Math.abs(mapCameraRef.current.center.lat - 27.95) < 0.02,
    "mapCameraRef tracks Tampa viewport center for map-anchored search"
  );
  // Preview card renders Sarasota -> Tampa distance (~42.6 mi straight-line), Wayfind Score 9.5, and + trip button!
  const expectedStraightMi = haversineMiles(SARASOTA_GPS, selectedTampaPlace);
  assert.ok(expectedStraightMi > 40 && expectedStraightMi < 50);
  assert.ok(html.includes('data-wf-distance-mode="from_you"'), "Preview card labels distance mode as from_you");
  assert.ok(html.includes(`${Math.round(expectedStraightMi)} mi`) || html.includes(`${expectedStraightMi.toFixed(1)} mi`), "Preview card displays Sarasota -> Tampa physical user distance");
  assert.ok(html.includes("9.5"), "Public Wayfind Score 9.5 is unchanged");
  assert.ok(html.includes("Park · Pair"), "Compact preview action bar exposes Park · Pair");
  assert.ok(html.includes('Add Tampa Riverwalk Holiday Market to trip plan'), "Compact preview card exposes 1-tap itinerary add");
}

// ── 6. Pairings Hygiene & Multi-Stop Backtracking Optimizer ─────────────────
{
  const anchorMuseum = {
    id: "anchor-selby",
    name: "Marie Selby Botanical Gardens",
    primaryType: "botanical_garden",
    types: ["botanical_garden", "tourist_attraction"],
    category: "attractions",
    lat: 27.3275,
    lng: -82.5415,
    governed_score: 96,
    wfScore: 96,
  };
  const publixErrand = {
    id: "errand-publix",
    name: "Publix Super Market at Bay Street",
    primaryType: "supermarket",
    types: ["supermarket", "grocery_store", "food"],
    category: "food",
    lat: 27.3290,
    lng: -82.5390,
    governed_score: 95,
    wfScore: 95,
  };
  const daycareUtility = {
    id: "util-daycare",
    name: "La Petite Academy Daycare",
    primaryType: "child_care_agency",
    types: ["child_care_agency", "school"],
    category: "family",
    lat: 27.3285,
    lng: -82.5400,
    governed_score: 95,
    wfScore: 95,
  };
  const urgentCareClinic = {
    id: "util-clinic",
    name: "Sarasota Urgent Care Medical Center",
    primaryType: "medical_clinic",
    types: ["medical_clinic", "doctor"],
    category: "attractions",
    lat: 27.3280,
    lng: -82.5405,
    governed_score: 95,
    wfScore: 95,
  };
  const farmersMarketGood = {
    id: "good-farmers-mkt",
    name: "Sarasota Farmers Market",
    primaryType: "farmers_market",
    types: ["farmers_market", "market"],
    category: "food",
    lat: 27.3365,
    lng: -82.5425,
    governed_score: 95,
    wfScore: 95,
  };
  const waterfrontCafeGood = {
    id: "good-cafe",
    name: "Owen's Fish Camp",
    primaryType: "seafood_restaurant",
    types: ["seafood_restaurant", "restaurant"],
    category: "food",
    lat: 27.3480,
    lng: -82.5392,
    governed_score: 96,
    wfScore: 96,
  };
  const indoorBackupMuseum = {
    id: "good-indoor-art",
    name: "Sarasota Art Museum",
    primaryType: "art_gallery",
    types: ["art_gallery", "museum"],
    category: "attractions",
    lat: 27.3282,
    lng: -82.5410,
    governed_score: 94,
    wfScore: 94,
  };

  assert.equal(isMapPairingEligible(publixErrand), false, "supermarkets blocked from map pairings");
  assert.equal(isMapPairingEligible(daycareUtility), false, "daycares blocked from map pairings");
  assert.equal(isMapPairingEligible(urgentCareClinic), false, "clinics blocked from map pairings");
  assert.equal(isMapPairingEligible(farmersMarketGood), true, "farmers markets allowed in map pairings");
  assert.equal(isMapPairingEligible(waterfrontCafeGood), true, "restaurants allowed in map pairings");

  // Shared `pairsWellWith` also rejects supermarkets/clinics/daycares directly
  const sharedPairs = pairsWellWith(anchorMuseum, [publixErrand, daycareUtility, urgentCareClinic, waterfrontCafeGood]);
  assert.deepEqual(sharedPairs.map((x) => x.p.id), ["good-cafe"]);

  // Wet weather automatically surfaces rain-safe indoor backup for outdoor anchor!
  const aroundWet = buildAroundThisSuggestions(
    anchorMuseum,
    [publixErrand, daycareUtility, urgentCareClinic, waterfrontCafeGood, indoorBackupMuseum],
    { weather: { rain: 80, wet: true } }
  );
  assert.equal(aroundWet[0].place.id, "good-indoor-art", "wet weather leads with closest rain-safe indoor backup");
  assert.equal(aroundWet[0].kind, "rain_backup");
  assert.ok(!aroundWet.some((x) => x.place.id === "errand-publix" || x.place.id === "util-daycare" || x.place.id === "util-clinic"));

  // Itinerary Backtracking Detector: Downtown Sarasota -> Anna Maria Island -> St. Armands -> Bradenton Riverwalk zig-zag!
  const zigzagTrip = [
    { id: "stop-sarasota-coffee", name: "Project Coffee", primaryType: "coffee_shop", lat: 27.3312, lng: -82.5389 },
    { id: "stop-ami-beach", name: "Bean Point Beach", primaryType: "beach", lat: 27.5364, lng: -82.7432 },
    { id: "stop-selby", name: "Selby Gardens", primaryType: "botanical_garden", lat: 27.3275, lng: -82.5415 },
  ];
  const analysis = analyzeItineraryOnMap(zigzagTrip, { startOrigin: SARASOTA_GPS });
  assert.equal(analysis.hasBacktracking, true, "Sarasota -> Anna Maria -> Sarasota zig-zag is flagged as backtracking");
  assert.ok(analysis.savedDriveMin >= 15, `expected >=15m saved by grouping Sarasota stops before Anna Maria, got ${analysis.savedDriveMin}`);
  assert.deepEqual(analysis.optimizedIds.slice(0, 2), ["stop-sarasota-coffee", "stop-selby"]);

  // Geographic pocket detection
  const pockets = identifyStrongestPockets([
    anchorMuseum,
    farmersMarketGood,
    waterfrontCafeGood,
    indoorBackupMuseum,
  ]);
  assert.equal(pockets.length, 1);
  assert.equal(pockets[0].count, 3, "walkable pocket clusters the 3 sub-mile downtown venues and excludes 1.4-mi outlier");
}

// ── 7. Coordinate Privacy, Deep Links, Session Analytics & Truth Trace ──────
{
  // Automatic physical GPS stored in wf_center is coarsened to 3 decimals (~110m)
  const autoCenter = sanitizeStoredCenterPayload({
    center: { lat: 27.3364891, lng: -82.5307419 },
    locName: "Sarasota, FL",
    manual: false,
    locApprox: false,
  });
  assert.equal(autoCenter.lat, 27.336);
  assert.equal(autoCenter.lng, -82.531);

  // Automatic GPS must never append residential bread-crumbs to wf_recent_locs
  assert.equal(shouldRecordRecentLocation({ manual: false, locName: "Sarasota, FL" }), false);
  assert.equal(shouldRecordRecentLocation({ manual: true, locName: "Tampa, FL" }), true);
  assert.equal(shouldRecordRecentLocation({ manual: true, locName: "This map area" }), false);

  // Shareable map deep link strips any lat/lng and preserves city/cat/sub/lens/place/q
  const link = buildMapDeepLink({
    city: "Tampa, FL",
    cat: "food",
    sub: "seafood",
    lens: "tonight",
    placeId: "fsq:4b8c1234",
    q: "Christmas tonight",
    lat: 27.336489,
    lng: -82.530741,
  });
  assert.ok(!link.includes("27.336") && !link.includes("-82.53"), "deep link must never contain raw coordinates");
  const parsed = parseMapDeepLink(link.slice("/map".length));
  assert.equal(parsed.city, "Tampa");
  assert.equal(parsed.cat, "food");
  assert.equal(parsed.sub, "seafood");
  assert.equal(parsed.lens, "tonight");
  assert.equal(parsed.placeId, "fsq:4b8c1234");
  assert.equal(parsed.q, "Christmas tonight");

  // Analytics session tracker strips accidental lat/lng and records decision completion
  const eventsEmitted = [];
  const tracker = createMapSessionTracker((name, place, extra) => {
    eventsEmitted.push({ name, place, extra });
  });
  tracker.noteOpen({ mode: "near_me", metro: "sarasota", hasGps: true, category: "attractions" });
  tracker.notePinSelected({ id: "selby" }, { rank: 1, lens: "open_now", lat: 27.33, lng: -82.53 });
  tracker.noteDecisionExecution("directions", { id: "selby" }, { rank: 1, lens: "open_now", lat: 27.33, lng: -82.53 });
  tracker.dispose();
  assert.equal(eventsEmitted.length, 3);
  for (const ev of eventsEmitted) {
    assert.equal(ev.extra.lat, undefined, `${ev.name} must strip lat`);
    assert.equal(ev.extra.lng, undefined, `${ev.name} must strip lng`);
  }
  assert.equal(eventsEmitted[2].name, "map_decision_complete");
  assert.equal(eventsEmitted[2].extra.execution_type, "directions");
  assert.equal(eventsEmitted[2].extra.pins_viewed, 1);

  // Truth trace & whyNot exclusion diagnostics
  const sampleBundle = rankMapCandidates(
    [
      { id: "vis-1", name: "Selby Gardens", primaryType: "botanical_garden", category: "attractions", lat: 27.3275, lng: -82.5415, governed_score: 96, photoRef: "places/ChIJ1/photos/A1" },
      { id: "low-1", name: "Average Strip Mall", primaryType: "shopping_mall", category: "shopping", lat: 27.33, lng: -82.53, governed_score: 84 },
    ],
    { verifiedDeviceLoc: SARASOTA_GPS }
  );
  const traceVis = buildMapTruthTrace("vis-1", sampleBundle, { deviceLocation: SARASOTA_GPS, mapCenter: { areaLabel: "Sarasota" } });
  assert.equal(traceVis.status, "visible");
  assert.equal(traceVis.wayfindScore, 9.6);
  assert.ok(typeof traceVis.reasonLine === "string" && traceVis.reasonLine.length > 0);
  const whyLow = diagnoseExcludedPlace("Average Strip Mall", sampleBundle);
  assert.equal(whyLow.status, "excluded");
  assert.equal(whyLow.reason, "below_score_floor");
  const aggCov = aggregateActionabilityCoverage(sampleBundle.places, sampleBundle.evaluated);
  assert.equal(aggCov.count, 1);
  assert.ok(aggCov.meanRatio >= 0.6);
}

// ── 8. Infrastructure Contracts: Colon IDs, Area Paging Cap & Cluster Immunity ─
{
  // Colon-prefixed IDs (`fsq:`, `osm:`, `ridb:`) + `oh`/`tags`/`editorial` in `mapAreaData.js`
  const nowMs = Date.now();
  const fsqRawRow = {
    place_id: "fsq:4b52391ff964a520b87027e3",
    name: "Columbia Restaurant",
    metro: "Tampa",
    category: "food",
    primary_type: "spanish_restaurant",
    google_types: ["spanish_restaurant", "restaurant"],
    status: "OPERATIONAL",
    lat: 27.9603,
    lng: -82.4362,
    refreshed_at: new Date(nowMs - 3600000).toISOString(),
    tags: ["historic", "date_night"],
    editorial: "Florida's oldest restaurant in Ybor City.",
    signals: {
      rating: 4.8,
      reviews: 9400,
      oh: { periods: [{ open: { day: 5, hour: 11, minute: 0 }, close: { day: 5, hour: 22, minute: 0 } }] },
      utcOffsetMinutes: -300,
      official_address: "2117 E 7th Ave, Tampa, FL 33605",
    },
  };
  const fsqRow = mapInventoryPlace(fsqRawRow, nowMs, TAMPA_CENTER);
  assert.ok(fsqRow, "qualifying colon-prefixed fsq row builds mapInventoryPlace");
  assert.equal(fsqRow.id, "fsq:4b52391ff964a520b87027e3");
  assert.ok(fsqRow.oh && Array.isArray(fsqRow.oh.periods));
  assert.equal(fsqRow.utcOffset, -300);
  assert.deepEqual(fsqRow.tags, ["historic", "date_night"]);
  assert.equal(fsqRow.editorial, "Florida's oldest restaurant in Ybor City.");

  const validIds = mapListIds(["ChIJabc123", "fsq:4b52391ff964a520b87027e3", "osm:node:998877"]);
  assert.deepEqual(validIds, ["ChIJabc123", "fsq:4b52391ff964a520b87027e3", "osm:node:998877"]);

  let capturedPostgrestUrl = "";
  const byIdRes = await readMapPlacesByIds({
    ids: validIds,
    origin: TAMPA_CENTER,
    config: { url: "https://example.supabase.co", key: "test-key" },
    now: nowMs,
    fetcher: async (url) => {
      capturedPostgrestUrl = String(url);
      return { ok: true, json: async () => [fsqRawRow] };
    },
  });
  const parsedUrl = new URL(capturedPostgrestUrl);
  assert.ok(
    parsedUrl.searchParams.get("place_id").includes('"fsq:4b52391ff964a520b87027e3"'),
    "PostgREST in.(...) quotes colon-prefixed place_ids"
  );
  assert.equal(byIdRes.places.length, 1);
  assert.equal(byIdRes.places[0].id, "fsq:4b52391ff964a520b87027e3");

  // `readCompleteMapArea` respects `maxPages` cap
  let pagesFetched = 0;
  const pagedRows = await readCompleteMapArea({
    bounds: { north: 28.0, south: 27.8, east: -82.3, west: -82.6 },
    origin: TAMPA_CENTER,
    maxPages: 3,
    fetcher: async () => {
      pagesFetched += 1;
      return {
        ok: true,
        json: async () => ({
          places: [{ id: `p-${pagesFetched}`, lat: 27.9, lng: -82.45 }],
          nextCursor: `ChIJ_cursor_${pagesFetched}`,
          complete: false,
        }),
      };
    },
  });
  assert.equal(pagesFetched, 3, `readCompleteMapArea must stop at maxPages=3 (MAX_AREA_PAGES=${MAX_AREA_PAGES})`);
  assert.equal(pagedRows.length, 3);

  // `createAppleExplorerController` boosts selected pin `displayPriority` to 1000 for cluster immunity
  const addedAnnotations = [];
  class FakeMarkerAnnotation {
    constructor(coord, opts) {
      this.coordinate = coord;
      this._selected = false;
      Object.assign(this, opts);
    }
    get selected() { return this._selected; }
    set selected(v) { this._selected = Boolean(v); }
  }
  class FakeAnnotation {
    constructor(coord, factory, opts) {
      this.coordinate = coord;
      this.factory = factory;
      Object.assign(this, opts);
    }
  }
  const fakeMK = {
    Coordinate: class { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } },
    CoordinateSpan: class { constructor(dLat, dLng) { this.latitudeDelta = dLat; this.longitudeDelta = dLng; } },
    CoordinateRegion: class { constructor(c, s) { this.center = c; this.span = s; } },
    Padding: class { constructor(t, r, b, l) { this.top = t; this.right = r; this.bottom = b; this.left = l; } },
    ImageAnnotation: FakeMarkerAnnotation,
    MarkerAnnotation: FakeMarkerAnnotation,
    Annotation: Object.assign(FakeAnnotation, {
      DisplayPriority: { High: 750, Low: 250, Required: 1000 },
      CollisionMode: { Rectangle: "rect", Circle: "circle" },
    }),
    CircleOverlay: class { constructor(c, r, s) { this.coordinate = c; this.radius = r; this.style = s; } },
    Style: class { constructor(o) { Object.assign(this, o); } },
    Map: class {
      constructor() {
        this.annotations = [];
        this.overlays = [];
        this.region = { center: { latitude: 27.33, longitude: -82.53 }, span: { latitudeDelta: 0.2, longitudeDelta: 0.2 } };
      }
      addAnnotations(list) { this.annotations.push(...list); addedAnnotations.push(...list); }
      removeAnnotations(list) { this.annotations = this.annotations.filter((a) => !list.includes(a)); }
      addOverlays(list) { this.overlays.push(...list); }
      removeOverlays(list) { this.overlays = this.overlays.filter((o) => !list.includes(o)); }
      showItems() {}
      setRegionAnimated(r) { this.region = r; }
      setCenterAnimated() {}
      addEventListener() {}
      removeEventListener() {}
      destroy() {}
    },
  };
  fakeMK.Map.ColorSchemes = { Dark: "dark", Light: "light" };
  fakeMK.Map.MapTypes = { Standard: "standard", MutedStandard: "muted" };
  const explorer = createAppleExplorerController({
    mapkit: fakeMK,
    container: {},
    center: SARASOTA_GPS,
    places: [
      { id: "p-top", name: "Top Place", lat: 27.33, lng: -82.53, governed_score: 96, category: "food" },
      { id: "p-sel", name: "Selected Place", lat: 27.34, lng: -82.54, governed_score: 93, category: "food" },
    ],
    selectedId: "p-sel",
  });
  const topAnn = addedAnnotations.find((a) => a.__wayfindId === "p-top");
  const selAnn = addedAnnotations.find((a) => a.__wayfindId === "p-sel");
  assert.equal(selAnn.displayPriority, 1000, "selected pin receives displayPriority 1000 so clusters never swallow it");
  assert.ok(topAnn.displayPriority < 1000, "unselected pin stays below 1000");
  explorer.selectId("p-top");
  assert.equal(topAnn.displayPriority, 1000, "selectId dynamically promotes newly selected pin to 1000");
  assert.ok(selAnn.displayPriority < 1000, "selectId restores deselected pin to rank priority < 1000");
  explorer.destroy();
}

// ── 11. MAP TRUTH INTEGRITY SUITE: HOURS, STRICT TONIGHT EVENT EVIDENCE, HONEST RECOVERY & PARKING ACCESS ──
{
  const testNow = Date.parse("2026-11-13T23:30:00Z"); // Friday Nov 13, 2026 18:30 EST
  const todayStr = "2026-11-13";

  // Part A: mapInventoryPlace & mergeMapAreaContext (owned_hours hydration & Google 30-day freshness gate)
  const baseInvRow = {
    place_id: "test-inv-owned-1",
    name: "Owned Hours Bistro",
    lat: 27.95,
    lng: -82.45,
    category: "food",
    primary_type: "restaurant",
    google_types: ["restaurant"],
    status: "OPERATIONAL",
    refreshed_at: new Date(testNow - 5 * 86400000).toISOString(),
    signals: {
      rating: 4.8,
      reviews: 500,
      owned_hours: {
        periods: [{ open: { day: 5, hour: 11, minute: 0 }, close: { day: 5, hour: 23, minute: 0 } }],
        utcOffsetMinutes: -300,
        source: "editorial_curated",
        verifiedAt: new Date(testNow - 10 * 86400000).toISOString(),
      },
    },
  };
  const candOwned = mapInventoryPlace(baseInvRow, testNow);
  assert.ok(candOwned, "Valid owned_hours row qualifies as map candidate");
  assert.ok(candOwned.ownedHours, "ownedHours is hydrated onto candidate");
  assert.equal(candOwned.oh?.periods?.length, 1);
  assert.equal(candOwned._ownedHoursSource, "editorial_curated");
  assert.equal(candOwned.utcOffset, -300);

  // Expired Google hours (> 30 days) are excluded
  const expiredGoogleRow = {
    place_id: "test-inv-google-expired",
    name: "Ancient Google Hours Cafe",
    lat: 27.95,
    lng: -82.45,
    category: "food",
    primary_type: "restaurant",
    google_types: ["restaurant"],
    status: "OPERATIONAL",
    refreshed_at: new Date(testNow - 5 * 86400000).toISOString(),
    signals: {
      rating: 4.8,
      reviews: 500,
      oh: { periods: [{ open: { day: 5, hour: 11, minute: 0 }, close: { day: 5, hour: 23, minute: 0 } }] },
      hoursAsOf: testNow - 35 * 86400000,
    },
  };
  const candGoogleExpired = mapInventoryPlace(expiredGoogleRow, testNow);
  assert.equal(candGoogleExpired.oh, null, "Google-sourced hours older than 30 days must be gated to null");

  // mergeMapAreaContext preserves ownedHours and provenance
  const contextPlace = {
    id: "test-inv-owned-1",
    ownedHours: baseInvRow.signals.owned_hours,
    _ownedHoursSource: "editorial_curated",
    utcOffset: -300,
  };
  const bareCand = { id: "test-inv-owned-1", name: "Bare Cand", lat: 27.95, lng: -82.45, governed_score: 95 };
  const merged = mergeMapAreaContext([bareCand], [contextPlace]);
  assert.ok(merged[0].ownedHours, "mergeMapAreaContext carries forward ownedHours");
  assert.equal(merged[0]._ownedHoursSource, "editorial_curated");
  assert.equal(merged[0].utcOffset, -300);

  // Part B: Strict "Tonight" & "Christmas event tonight" Evidence
  // 1. Plain place row without identified event identity MUST NEVER return eventEval or emit "Christmas event tonight"
  const plainPlaceWithHolidayText = {
    id: "oxford-plain-place",
    name: "Oxford Exchange",
    editorial: "Historic building with Christmas trees and holiday lights in the atrium.",
    lat: 27.945,
    lng: -82.465,
    category: "food",
    start_date: "2026-11-01",
    end_date: "2026-12-31",
  };
  assert.equal(evaluateEventEligibility(plainPlaceWithHolidayText, testNow), null, "Plain place row must NEVER return eventEval");
  const plainReason = buildMapDecisionReason(plainPlaceWithHolidayText, { eventEval: null, hoursEval: { state: "open", confirmedOpen: true, closingFeasible: true, closeLabel: "Closes 9 PM" } });
  assert.ok(!plainReason.includes("Christmas event tonight"), "Plain place with holiday editorial must NEVER emit Christmas event tonight");
  assert.ok(!plainReason.includes("Happening tonight"), "Plain place must NEVER emit Happening tonight");

  // 2. Event with occurrence_dates list
  const eventWithDates = {
    id: "ev-dated-list",
    kind: "event",
    event_id: "ev-dated-list",
    event_name: "Ybor Holiday Parade",
    lat: 27.96,
    lng: -82.44,
    occurrence_dates: ["2026-11-13"], // Tonight!
    start_date: "2026-11-01",
    end_date: "2026-11-30",
  };
  const datedEval = evaluateEventEligibility(eventWithDates, testNow);
  assert.equal(datedEval.activeToday, true);
  assert.equal(datedEval.occurrenceSource, "occurrence_dates");
  assert.equal(datedEval.venueConfirmed, true);

  // Off-night date in occurrence_dates
  const eventOffNight = {
    ...eventWithDates,
    occurrence_dates: ["2026-11-14"], // Tomorrow only
  };
  const offNightEval = evaluateEventEligibility(eventOffNight, testNow);
  assert.equal(offNightEval.activeToday, false);
  assert.equal(offNightEval.state, "off_night");

  // 3. Event with select_nights: true without occurrence_dates or weekday cadence -> unconfirmed_select_nights
  const eventSelectNightsBroad = {
    id: "ev-select-nights-broad",
    kind: "event",
    event_id: "ev-select-nights-broad",
    event_name: "Enchant Christmas St. Pete",
    lat: 27.768,
    lng: -82.653,
    select_nights: true,
    start_date: "2026-11-01",
    end_date: "2027-01-05",
    schedule_note: "Select nights in November and December",
  };
  const selectNightsEval = evaluateEventEligibility(eventSelectNightsBroad, testNow);
  assert.equal(selectNightsEval.activeToday, false, "Select nights without explicit dates or weekday cadence must not be active today");
  assert.equal(selectNightsEval.state, "unconfirmed_select_nights");

  // 4. Multi-week seasonal window (> 14 days) without daily or weekday schedule -> unconfirmed_season_span
  const eventLongWindowNoSchedule = {
    id: "ev-long-span",
    kind: "event",
    event_id: "ev-long-span",
    event_name: "Festival of Lights",
    lat: 27.95,
    lng: -82.45,
    start_date: "2026-11-01",
    end_date: "2026-12-25", // 54 days span
    schedule_note: "Check online for details",
  };
  const longSpanEval = evaluateEventEligibility(eventLongWindowNoSchedule, testNow);
  assert.equal(longSpanEval.activeToday, false, "Multi-week seasonal window without daily/weekday schedule must not claim tonight");
  assert.equal(longSpanEval.state, "unconfirmed_season_span");

  // 5. Unconfirmed venue coordinates (approx: true) -> venueConfirmed: false, reason refuses "Christmas event tonight"
  const eventApproxVenue = {
    id: "ev-approx-venue",
    kind: "event",
    event_id: "ev-approx-venue",
    event_name: "Floating Lights",
    approx: true,
    lat: 27.95,
    lng: -82.45,
    occurrence_dates: ["2026-11-13"],
    start_date: "2026-11-13",
    end_date: "2026-11-13",
    seasonal: "christmas",
  };
  const approxEval = evaluateEventEligibility(eventApproxVenue, testNow);
  assert.equal(approxEval.activeToday, true);
  assert.equal(approxEval.venueConfirmed, false, "approx: true venue coordinates are not confirmed");
  const approxReason = buildMapDecisionReason(eventApproxVenue, { eventEval: approxEval });
  assert.ok(!approxReason.includes("Christmas event tonight"), "Unconfirmed venue coordinates must not emit Christmas event tonight");

  // Confirmed event emits "Christmas event tonight"
  const eventConfirmedXmas = {
    ...eventWithDates,
    seasonal: "christmas",
  };
  const confirmedReason = buildMapDecisionReason(eventConfirmedXmas, { eventEval: datedEval });
  assert.equal(confirmedReason, "Christmas event tonight");

  // 6. Trace contains all required integrity fields
  const mockRankedBundle = {
    places: [eventConfirmedXmas],
    evaluated: new Map([[eventConfirmedXmas.id, {
      displayScore: 9.5,
      governedScore: 95.0,
      mapDecisionScore: 820,
      reasonLine: confirmedReason,
      hoursEval: { state: "open", confirmedOpen: true, hoursUnconfirmed: false },
      driveEstimate: null,
      weatherEval: { delta: 0 },
      daypartEval: { delta: 0, tag: null },
      daypart: { phase: "evening" },
      eventEval: datedEval,
      actionability: { ratio: 0.9 },
    }]]),
    exclusions: new Map(),
  };
  const trace = buildMapTruthTrace(eventConfirmedXmas.id, mockRankedBundle, null);
  assert.ok(trace, "Trace generated");
  assert.equal(trace.event.eventId, "ev-dated-list");
  assert.equal(trace.event.eventName, "Ybor Holiday Parade");
  assert.equal(trace.event.venueConfirmed, true);
  assert.equal(trace.event.activeToday, true);
  assert.equal(trace.event.occurrenceSource, "occurrence_dates");
  assert.equal(trace.event.localDate, todayStr);

  // Part C: SSR Tests for MapScreen (Honest Recovery Text, Empty Search Camera Protection, and Parking Access)
  // 1. Open Now Honest Recovery:
  // a) Unconfirmed hours only -> "No verified open hours right now" + subtitle "X nearby places have unconfirmed hours"
  const htmlUnconfirmed = renderToStaticMarkup(
    createElement(mapComponentMod.default, {
      ctx: {
        searchMapArea: () => {}, mapMode: "places", setMapMode: () => {}, mapBrowse: true, setMapBrowse: () => {},
        mapPool: [], mapListOverride: null, map3D: false, setMap3D: () => {}, mapRetryKey: 0, setMapRetryKey: () => {},
        cat: "food", setCat: () => {}, sub: "all", setSub: () => {}, setVibe: () => {}, sortBy: "best",
        center: TAMPA_CENTER, deviceLoc: null, locApprox: false, mapCameraRef: { current: null },
        mapSearch: null, setMapSearch: () => {}, mapUrlLens: "open_now", setMapUrlLens: () => {},
        mapUrlPlaceId: null, setMapUrlPlaceId: () => {}, mapFocus: null, setMapFocus: () => {}, setMapSearchOpen: () => {},
        events: [], eventsLoading: false, eventsUnavailable: false, mapDate: "all", setMapDate: () => {},
        mapPreview: null, setMapPreview: () => {}, mapDrawer: false, setMapDrawer: () => {}, eventPreview: null, setEventPreview: () => {},
        suggested: [], places: [], view: [], liked: {}, disliked: {}, featuredBoost: () => 0,
        MapView: () => createElement("div"), CategoryMenu: () => createElement("div"), FallbackImg: () => createElement("img"),
        iconForPlace: () => "✨", liveOpen: () => null, logEvent: () => {}, loadEvents: () => {}, openDetail: () => {},
        openVenue: () => {}, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 }, recenterToMe: () => {},
        isBeach: () => false, beachSignals: {}, PlaceCard: () => createElement("div"), isSaved: () => false,
        toggleLike: () => {}, toggleDislike: () => {}, quickSaveFavorite: () => {}, addShared: () => {}, giveawayMark: () => {},
        blurbs: {}, openExperience: () => {}, openCuisine: () => {}, cityNow: "Tampa", locName: "Tampa, FL",
        weather: { rain: 0, wet: false, temp: 75 }, trips: [], setTrips: () => {}, activeTrip: null, isOnTrip: () => false,
        addToItinerary: () => {}, showToast: () => {}, mapDefaultAppliedRef: { current: true }, categoryChosenRef: { current: true },
        searchMode: false,
        __seedAreaPlaces: [
          { id: "p1", name: "Place 1", lat: 27.95, lng: -82.45, category: "food", primaryType: "restaurant", types: ["restaurant"], governed_score: 95 },
          { id: "p2", name: "Place 2", lat: 27.95, lng: -82.45, category: "food", primaryType: "restaurant", types: ["restaurant"], governed_score: 95 },
        ],
        __seedAreaStatus: "ready",
        __seedViewport: { north: 28.05, south: 27.85, east: -82.35, west: -82.56 },
      },
    })
  );
  assert.ok(htmlUnconfirmed.includes("No verified open hours right now"), "Unconfirmed hours renders honest title");
  assert.ok(htmlUnconfirmed.includes("nearby places have unconfirmed hours"), "Unconfirmed hours renders unconfirmed subtitle");
  assert.ok(htmlUnconfirmed.includes("Show all nearby"), "Exposes 1-tap Show all nearby button");

  // b) Confirmed closed only -> "Confirmed closed nearby right now" + "All X nearby places are closed at this hour"
  const htmlClosed = renderToStaticMarkup(
    createElement(mapComponentMod.default, {
      ctx: {
        searchMapArea: () => {}, mapMode: "places", setMapMode: () => {}, mapBrowse: true, setMapBrowse: () => {},
        mapPool: [], mapListOverride: null, map3D: false, setMap3D: () => {}, mapRetryKey: 0, setMapRetryKey: () => {},
        cat: "food", setCat: () => {}, sub: "all", setSub: () => {}, setVibe: () => {}, sortBy: "best",
        center: TAMPA_CENTER, deviceLoc: null, locApprox: false, mapCameraRef: { current: null },
        mapSearch: null, setMapSearch: () => {}, mapUrlLens: "open_now", setMapUrlLens: () => {},
        mapUrlPlaceId: null, setMapUrlPlaceId: () => {}, mapFocus: null, setMapFocus: () => {}, setMapSearchOpen: () => {},
        events: [], eventsLoading: false, eventsUnavailable: false, mapDate: "all", setMapDate: () => {},
        mapPreview: null, setMapPreview: () => {}, mapDrawer: false, setMapDrawer: () => {}, eventPreview: null, setEventPreview: () => {},
        suggested: [], places: [], view: [], liked: {}, disliked: {}, featuredBoost: () => 0,
        MapView: () => createElement("div"), CategoryMenu: () => createElement("div"), FallbackImg: () => createElement("img"),
        iconForPlace: () => "✨", liveOpen: () => null, logEvent: () => {}, loadEvents: () => {}, openDetail: () => {},
        openVenue: () => {}, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 }, recenterToMe: () => {},
        isBeach: () => false, beachSignals: {}, PlaceCard: () => createElement("div"), isSaved: () => false,
        toggleLike: () => {}, toggleDislike: () => {}, quickSaveFavorite: () => {}, addShared: () => {}, giveawayMark: () => {},
        blurbs: {}, openExperience: () => {}, openCuisine: () => {}, cityNow: "Tampa", locName: "Tampa, FL",
        weather: { rain: 0, wet: false, temp: 75 }, trips: [], setTrips: () => {}, activeTrip: null, isOnTrip: () => false,
        addToItinerary: () => {}, showToast: () => {}, mapDefaultAppliedRef: { current: true }, categoryChosenRef: { current: true },
        searchMode: false,
        __seedAreaPlaces: [
          {
            id: "p-closed-1", name: "Closed Place 1", lat: 27.95, lng: -82.45, category: "food", primaryType: "restaurant", types: ["restaurant"], governed_score: 95,
            utcOffset: -300,
            oh: { periods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 12, minute: 0 } }] }, // closed Friday
          },
        ],
        __seedAreaStatus: "ready",
        __seedViewport: { north: 28.05, south: 27.85, east: -82.35, west: -82.56 },
      },
    })
  );
  assert.ok(htmlClosed.includes("Confirmed closed nearby right now"), "Confirmed closed renders honest title");
  assert.ok(htmlClosed.includes("closed at this hour"), "Confirmed closed renders honest subtitle");

  // 2. Empty search state & camera protection:
  let searchCapturedProps = null;
  globalThis.__hardTestAppleProps = (p) => { searchCapturedProps = p; };
  const htmlEmptySearch = renderToStaticMarkup(
    createElement(mapComponentMod.default, {
      ctx: {
        searchMapArea: () => {}, mapMode: "places", setMapMode: () => {}, mapBrowse: true, setMapBrowse: () => {},
        mapPool: [], mapListOverride: null, map3D: false, setMap3D: () => {}, mapRetryKey: 0, setMapRetryKey: () => {},
        cat: "food", setCat: () => {}, sub: "all", setSub: () => {}, setVibe: () => {}, sortBy: "best",
        center: TAMPA_CENTER, deviceLoc: null, locApprox: false, mapCameraRef: { current: null },
        mapSearch: { query: "ghost query", center: TAMPA_CENTER, cards: [] }, setMapSearch: () => {},
        mapUrlLens: null, setMapUrlLens: () => {}, mapUrlPlaceId: null, setMapUrlPlaceId: () => {},
        mapFocus: null, setMapFocus: () => {}, setMapSearchOpen: () => {}, events: [], eventsLoading: false, eventsUnavailable: false,
        mapDate: "all", setMapDate: () => {}, mapPreview: null, setMapPreview: () => {}, mapDrawer: false, setMapDrawer: () => {},
        eventPreview: null, setEventPreview: () => {}, suggested: [], places: [], view: [], liked: {}, disliked: {},
        featuredBoost: () => 0, MapView: () => createElement("div"), CategoryMenu: () => createElement("div"), FallbackImg: () => createElement("img"),
        iconForPlace: () => "✨", liveOpen: () => null, logEvent: () => {}, loadEvents: () => {}, openDetail: () => {},
        openVenue: () => {}, ticketUrl: (u) => u, Hol: { worldCup: () => false, fitFor: () => 0 }, recenterToMe: () => {},
        isBeach: () => false, beachSignals: {}, PlaceCard: () => createElement("div"), isSaved: () => false,
        toggleLike: () => {}, toggleDislike: () => {}, quickSaveFavorite: () => {}, addShared: () => {}, giveawayMark: () => {},
        blurbs: {}, openExperience: () => {}, openCuisine: () => {}, cityNow: "Tampa", locName: "Tampa, FL",
        weather: { rain: 0, wet: false, temp: 75 }, trips: [], setTrips: () => {}, activeTrip: null, isOnTrip: () => false,
        addToItinerary: () => {}, showToast: () => {}, mapDefaultAppliedRef: { current: true }, categoryChosenRef: { current: true },
        searchMode: false,
        __seedAreaPlaces: [{ id: "p1", name: "Place 1", lat: 27.95, lng: -82.45, category: "food", governed_score: 95 }],
        __seedAreaStatus: "ready",
        __seedViewport: { north: 28.05, south: 27.85, east: -82.35, west: -82.56 },
      },
    })
  );
  delete globalThis.__hardTestAppleProps;
  assert.equal(searchCapturedProps.fit, false, "When search has 0 matching pins, fit is false to protect camera in Tampa");
  assert.ok(htmlEmptySearch.includes("No map matches for") && htmlEmptySearch.includes("ghost query") && htmlEmptySearch.includes("in this area"), "Renders honest search empty state");
  assert.ok(htmlEmptySearch.includes("Clear search"), "Exposes 1-tap Clear search button");
}

// Suite: Destination Parking Visitor Access & Eligibility (@parking)
{
  const makeMockMapkit = (places) => ({
    Coordinate: class { constructor(lat, lng) { Object.assign(this, { latitude: lat, longitude: lng }); } },
    PointsOfInterestSearch: class { search() { return Promise.resolve({ places }); } },
    PointOfInterestCategory: { Parking: "Parking" },
    PointOfInterestFilter: { including(cats) { return { including: cats }; } },
  });

  const castRes = await searchDestinationParking(
    makeMockMapkit([{ id: "cast-lot", name: "Contemporary Resort Cast Parking Lot", lat: 28.4195, lng: -81.5750, distanceMeters: 300 }]),
    { id: "mk", name: "Magic Kingdom Park", lat: 28.4188, lng: -81.5818 }
  );
  assert.equal(castRes.status, "fallback", "Disney Cast Member lot must never be recommended as visitor parking");
  assert.equal(castRes.items.length, 0);

  const hotelMismatchRes = await searchDestinationParking(
    makeMockMapkit([{ id: "marriott-gar", name: "Marriott Hotel Parking Garage", lat: 27.9480, lng: -82.4390, distanceMeters: 150 }]),
    { id: "columbia", name: "Columbia Restaurant", lat: 27.9475, lng: -82.4385 }
  );
  assert.equal(hotelMismatchRes.status, "fallback", "Non-matching hotel garage must not be recommended as public parking");
  assert.equal(hotelMismatchRes.items.length, 0);

  const bareGarageRes = await searchDestinationParking(
    makeMockMapkit([{ id: "bare-gar", name: "7th Ave Parking Garage", lat: 27.9500, lng: -82.4400, distanceMeters: 200 }]),
    { id: "columbia-2", name: "Columbia Restaurant", lat: 27.9475, lng: -82.4385 }
  );
  assert.equal(bareGarageRes.status, "fallback", "Unverified generic garage without public/visitor signal must fall back honestly");
  assert.equal(bareGarageRes.items.length, 0);

  const pubRes = await searchDestinationParking(
    makeMockMapkit([{ id: "pub-gar", name: "Palm Avenue Public Parking Garage", lat: 27.3360, lng: -82.5440, distanceMeters: 220 }]),
    { id: "sarasota-bistro", name: "Sarasota Downtown Bistro", lat: 27.3350, lng: -82.5430 }
  );
  assert.equal(pubRes.status, "ready", "Verified municipal/public garage within walking distance is recommended");
  assert.equal(pubRes.items.length, 1);
  assert.equal(pubRes.items[0].accessStatus, "public_verified");
}

// Suite: Search Geographic Relevance & Location Truth (@search)
{
  const tampaCity = { lat: 27.9478, lng: -82.4584, name: "Tampa", slug: "tampa" };
  const fakeEnv = {
    NEXT_PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-key",
  };
  const mockFetch = async () => ({
    ok: true,
    json: async () => [
      {
        id: "disney-magic-kingdom",
        title: "Magic Kingdom Park",
        kind: "event",
        lat: 28.4177,
        lng: -81.5812,
        city: "Lake Buena Vista",
        city_slug: "lake-buena-vista",
        start_date: "2026-11-01",
        end_date: "2027-01-05",
      },
    ],
  });
  const res = await searchResultCards({
    query: "Christmas tonight",
    city: tampaCity,
    env: fakeEnv,
    fetchImpl: mockFetch,
    todayStr: "2026-11-13",
  });
  assert.equal(res.cards.length, 0, "Tampa Christmas tonight query must not return Orlando / Lake Buena Vista events 62+ mi away");

  assert.equal(queryImpliesExplicitArea("Tampa"), true);
  assert.equal(queryImpliesExplicitArea("Sarasota, FL"), true);
  assert.equal(queryImpliesExplicitArea("Christmas tonight"), false);
  assert.equal(queryImpliesExplicitArea("best coffee"), false);

  const truth = resolveLocationTruth({
    screen: "map",
    locName: "Tampa, FL",
    discoveryCenter: { lat: 27.9478, lng: -82.4584 },
    viewport: { south: 27.8, west: -82.6, north: 28.1, east: -82.3 },
    rawDeviceLoc: { lat: 27.3364, lng: -82.5307, accuracy: 12 },
    queryGeo: { lat: 27.9478, lng: -82.4584, name: "Christmas tonight" },
    query: "Christmas tonight",
    manual: true,
  });
  assert.equal(truth.searchLocation.source, "map_viewport");
  assert.equal(truth.deviceLocation?.lat, 27.3364);
  assert.equal(resolveMapScopeMode(truth).mode, "explore_here");

  const link = buildMapDeepLink({ city: "Tampa", q: "Christmas tonight" });
  assert.equal(link.includes("lat="), false);
  assert.equal(link.includes("lng="), false);
  const parsed = parseMapDeepLink(link.slice("/map".length));
  assert.equal(parsed.city, "Tampa");
  assert.equal(parsed.q, "Christmas tonight");
}

// Suite: Cold /map and ?go=map Deep-Link Routing Protection (@search)
{
  const mapSearchHandoff = landingSearchFromSearch("?go=map&city=Tampa&q=Christmas%20tonight");
  assert.equal(mapSearchHandoff, null, "landingSearchFromSearch must return null when go=map is present to preserve standalone screen routing");

  const normalHomeSearch = landingSearchFromSearch("?q=Christmas%20tonight");
  assert.notEqual(normalHomeSearch, null, "landingSearchFromSearch must still process standard home /?q= queries");
  assert.equal(normalHomeSearch.q, "Christmas tonight", "normal query term extracted correctly");
}

console.log("test-map-spatial-decision-engine: OK — all 8 spatial decision engine suites & Hard Test SSR verified");
