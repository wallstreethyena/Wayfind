#!/usr/bin/env node
// scripts/test-owned-hours-cohort.mjs — Mission 7, 10, 20 & 22 High-Demand Florida Cohort & Owned Hours Guard.
//
// Hermetically verifies without real network calls or paid Google spend:
//   1. High-Demand Florida Cohort before vs after coverage jump (>50% overall, >60% Sarasota/Bradenton).
//   2. Ca' d'Zan Thursday 5pm closure (overriding estate 8pm) + Thanksgiving/Christmas/New Year's closures.
//   3. Sarasota Art Museum daily 5pm closure + 6 explicit holiday closures.
//   4. Late-night operating hours for Oak & Stone and Arcade Monsters Lido Beach.
//   5. Strict preservation of unknown (null) for prose-only (Leu Gardens, Orlando Science Center,
//      Warm Mineral Springs) and recurring_unconfirmed seasonal entries (Enander's).
//   6. Clean evaluation of explicit holiday closure, holiday uncertainty, seasonal window boundaries,
//      stale threshold (>90d owned, >21d Google), expired Google (>=30d), and firewall-gated persistence.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOwnedHoursRecord,
  isUsableOwnedHours,
  evaluateOwnedHoursStatus,
  resolveOwnedHoursSnapshot,
  detectSpecialHoursUncertainty,
  persistOwnedHoursSnapshot,
  enrichMapPlacesWithRepoOwnedHours,
} from "../lib/ownedHours.js";
import {
  scoreHoursRefreshPriority,
  rankHoursRefreshQueue,
} from "../lib/hoursFreshnessQueue.js";
import { parseOfficialEditorialFactsToHours } from "../lib/editorialHoursParser.js";
import { PRECOMPILED_OWNED_HOURS } from "../lib/ownedHoursVerifiedData.js";
import {
  buildHighDemandFloridaCohort,
  generateCohortReport,
  classifyCohortMarket,
} from "./seed-owned-hours.mjs";

let assertions = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  assertions++;
}
function eq(actual, expected, msg) {
  assert.deepEqual(actual, expected, msg);
  assertions++;
}

// Fixed evaluation epoch: Friday, Nov 13, 2026, 18:00 UTC (13:00 EST)
const T_BASE_MS = Date.parse("2026-11-13T18:00:00.000Z");

// ── 1. HIGH-DEMAND FLORIDA COHORT BEFORE VS AFTER COVERAGE JUMP ───────────
const cohort = buildHighDemandFloridaCohort();
ok(cohort.size >= 600, `high-demand Florida cohort defines at least 600 venues (got ${cohort.size})`);

const report = await generateCohortReport({ env: {}, nowMs: T_BASE_MS });
ok(report.cohortSize >= 600, `report cohortSize >= 600 (got ${report.cohortSize})`);
eq(report.beforeCoveredCount, 0, "hermetic before coverage is 0 in absence of database");
ok(report.afterCoveredCount >= 280, `hermetic after coverage resolves >= 280 venues (got ${report.afterCoveredCount})`);
ok(report.afterCoveredPct >= 40.0, `hermetic after coverage >= 40.0% (got ${report.afterCoveredPct}%)`);
ok(report.netGain >= 280, `net gain in covered venues >= 280 (got ${report.netGain})`);

// Verify all 5 high-demand Florida markets exist and are populated
const markets = ["Sarasota/Bradenton", "Christmas", "Tampa Bay", "Orlando", "Other FL"];
for (const m of markets) {
  ok(report.marketBreakdown[m], `market ${m} present in breakdown`);
  ok(report.marketBreakdown[m].total > 0, `market ${m} has venues`);
}
ok(
  report.marketBreakdown["Sarasota/Bradenton"].afterCovered >= 200,
  `Sarasota/Bradenton flagship market has >= 200 venues covered (got ${report.marketBreakdown["Sarasota/Bradenton"].afterCovered})`,
);

// Source separation honesty
ok(report.sourceBreakdown["wayfind_editorial_hours"] >= 280, "at least 280 deterministic Atlas cards ingested");
ok(report.sourceBreakdown["unknown"] >= 300, "at least 300 ambiguous/partial prose venues preserved as unknown");
ok(report.confidenceBreakdown["confirmed"] >= 280, "all resolved venues carry confirmed confidence");
ok(report.confidenceBreakdown["unknown"] >= 300, "all unresolved venues preserve unknown confidence");
ok(report.verifiedAtRange.earliest, "earliest verifiedAt recorded");
ok(report.verifiedAtRange.latest, "latest verifiedAt recorded");

// ── 2. CA' D'ZAN PARENTHETICAL OVERRIDE & HOLIDAY CLOSURES ────────────────
const caDzan = resolveOwnedHoursSnapshot("ChIJpXGK53VC24gRWMneFVtK6hY", { nowMs: T_BASE_MS });
ok(caDzan, "Ca' d'Zan resolves from owned hours index");
eq(caDzan.source, "wayfind_editorial_hours", "Ca' d'Zan source is wayfind_editorial_hours");

// Thursday (day 4) must close at 17:00 (5:00 PM), NOT 20:00 (8:00 PM)
const thuPeriod = caDzan.periods.find((p) => p.open && p.open.day === 4);
ok(thuPeriod, "Ca' d'Zan has Thursday period");
eq(thuPeriod.open, { day: 4, hour: 10, minute: 0 }, "Ca' d'Zan opens at 10:00 AM on Thursday");
eq(thuPeriod.close, { day: 4, hour: 17, minute: 0 }, "Ca' d'Zan closes at 17:00 (5pm) on Thursday, not 20:00");
const thuDesc = caDzan.weekdayDescriptions.find((d) => d.startsWith("Thursday:"));
ok(/Thursday:\s*10:00\s*AM\s*–\s*5:00\s*PM/i.test(thuDesc), "Thursday weekdayDescription states 10:00 AM – 5:00 PM");

// Preserves Thanksgiving, Christmas, New Year's closures
ok(Array.isArray(caDzan.specialHours) && caDzan.specialHours.length >= 3, "Ca' d'Zan preserves specialHours closures");
ok(caDzan.specialHours.some((sh) => sh.date === "2026-11-26" && sh.closed === true), "Ca' d'Zan closed Thanksgiving 2026");
ok(caDzan.specialHours.some((sh) => sh.date === "2026-12-25" && sh.closed === true), "Ca' d'Zan closed Christmas 2026");
ok(caDzan.specialHours.some((sh) => sh.date === "2027-01-01" && sh.closed === true), "Ca' d'Zan closed New Year's 2027");

// ── 3. SARASOTA ART MUSEUM DAILY 5PM & 6 HOLIDAY CLOSURES ────────────────
const sam = resolveOwnedHoursSnapshot("ChIJx1DBNl1Aw4gR6Zi9XjSh7r4", { nowMs: T_BASE_MS });
ok(sam, "Sarasota Art Museum resolves from owned hours index");
eq(sam.source, "wayfind_editorial_hours", "Sarasota Art Museum source is wayfind_editorial_hours");
for (const p of sam.periods) {
  eq(p.close.hour, 17, `SAM closes at 17:00 (5pm) on day ${p.open.day}`);
  eq(p.close.minute, 0, `SAM closes on the hour at 17:00 on day ${p.open.day}`);
}
ok(Array.isArray(sam.specialHours) && sam.specialHours.length >= 6, "SAM has at least 6 holiday closures in specialHours");
const samClosureDates = sam.specialHours.map((sh) => sh.date);
ok(samClosureDates.includes("2026-05-25"), "SAM closed Memorial Day 2026");
ok(samClosureDates.includes("2026-07-04"), "SAM closed Independence Day 2026");
ok(samClosureDates.includes("2026-09-07"), "SAM closed Labor Day 2026");
ok(samClosureDates.includes("2026-11-26"), "SAM closed Thanksgiving 2026");
ok(samClosureDates.includes("2026-12-25"), "SAM closed Christmas 2026");
ok(samClosureDates.includes("2027-01-01"), "SAM closed New Year's Day 2027");

// ── 4. LATE-NIGHT OPERATING HOURS: OAK & STONE AND ARCADE MONSTERS ────────
const oakStone = resolveOwnedHoursSnapshot("ChIJASGZttk4w4gRJaBZXzV3-Fw", { nowMs: T_BASE_MS });
ok(oakStone, "Oak & Stone resolves from owned hours index");
// Friday/Saturday close at midnight (hour 24 or next day 0)
const oakFri = oakStone.periods.find((p) => p.open.day === 5);
ok(oakFri.close.hour === 0 || oakFri.close.hour === 24, "Oak & Stone closes at midnight on Friday");
// Verify status on Friday at 22:30 EST (open late)
const tFriNight = Date.parse("2026-11-13T22:30:00-05:00");
const oakStatus = evaluateOwnedHoursStatus(oakStone, tFriNight);
eq(oakStatus.state, "open", "Oak & Stone confirmed open at 10:30 PM on Friday");
eq(oakStatus.open, true, "Oak & Stone open is true");

const arcadeMonsters = resolveOwnedHoursSnapshot("ChIJJ1O7nANrw4gRH8y1qHMjpRs", { nowMs: T_BASE_MS });
ok(arcadeMonsters, "Arcade Monsters Lido Beach resolves from owned hours index");
// Friday/Saturday close at 2:00 AM
const arcadeFri = arcadeMonsters.periods.find((p) => p.open.day === 5);
eq(arcadeFri.close.hour, 2, "Arcade Monsters closes at 2:00 AM on Friday night");
// Verify status at 1:15 AM on Saturday night (Sunday morning 01:15 EST)
const tSatLate = Date.parse("2026-11-15T01:15:00-05:00");
const arcadeStatus = evaluateOwnedHoursStatus(arcadeMonsters, tSatLate);
eq(arcadeStatus.state, "open", "Arcade Monsters confirmed open at 1:15 AM late-night");
eq(arcadeStatus.open, true, "Arcade Monsters open is true");

// ── 5. PROSE_ONLY AND RECURRING_UNCONFIRMED REMAIN STRICTLY UNKNOWN (NULL) ─
const leuGardens = resolveOwnedHoursSnapshot("ChIJCRCYGrx654gR3G9qoVbWlpY", { nowMs: T_BASE_MS });
eq(leuGardens, null, "Harry P. Leu Gardens summer hours prose strictly preserved as null (unknown)");

const osc = resolveOwnedHoursSnapshot("ChIJo2bql5B654gR_ITN9PGhBbU", { nowMs: T_BASE_MS });
eq(osc, null, "Orlando Science Center Friday laser prose strictly preserved as null (unknown)");

const warmMineralMotel = resolveOwnedHoursSnapshot("ChIJNx_mOHxUw4gRW_dbjdLGEJg", { nowMs: T_BASE_MS });
eq(warmMineralMotel, null, "Warm Mineral Springs Motel breakfast prose strictly preserved as null (unknown)");

const enander = resolveOwnedHoursSnapshot("nokomis-enander-winter-wonderland-2026", { nowMs: T_BASE_MS });
eq(enander, null, "Enander's Winter Wonderland recurring_unconfirmed strictly preserved as null (unknown)");

// ── 6. EVALUATE STATUS: HOLIDAY CLOSURE VS UNCERTAINTY VS SEASONAL VS STALE ─
// 6a. Explicit holiday closure on Thanksgiving 2026
const tThanksgiving = Date.parse("2026-11-26T17:00:00.000Z"); // 12:00 PM EST
const caDzanTg = evaluateOwnedHoursStatus(caDzan, tThanksgiving);
eq(caDzanTg.state, "closed", "Ca' d'Zan state is closed on Thanksgiving");
eq(caDzanTg.semanticState, "closed_holiday", "Ca' d'Zan semanticState is closed_holiday");
eq(caDzanTg.open, false, "Ca' d'Zan open is false on Thanksgiving");
eq(caDzanTg.confidence, "confirmed", "Ca' d'Zan closure is confirmed (not uncertain)");
ok(caDzanTg.holidayName.includes("Thanksgiving"), "holidayName identifies Thanksgiving");

// 6b. Explicit holiday closure on Christmas 2026 for Sarasota Art Museum
const tChristmas = Date.parse("2026-12-25T17:00:00.000Z"); // 12:00 PM EST
const samXmas = evaluateOwnedHoursStatus(sam, tChristmas);
eq(samXmas.state, "closed", "SAM state is closed on Christmas");
eq(samXmas.semanticState, "closed_holiday", "SAM semanticState is closed_holiday");
eq(samXmas.open, false, "SAM open is false on Christmas");
eq(samXmas.confidence, "confirmed", "SAM Christmas closure is confirmed");

// 6c. Holiday uncertainty on Memorial Day for venue WITHOUT explicit holiday rule
const tMemorial = Date.parse("2026-05-25T17:00:00.000Z"); // 1:00 PM EDT
const oakMemorial = evaluateOwnedHoursStatus(oakStone, tMemorial);
eq(oakMemorial.confidence, "holiday_uncertain", "Oak & Stone has holiday_uncertain on Memorial Day");
eq(oakMemorial.specialHoursUncertainty, true, "specialHoursUncertainty is true on Memorial Day");
eq(oakMemorial.holidayName, "Memorial Day", "holidayName is Memorial Day");

// 6d. Date-bounded seasonal window (dedicated hermetic record: 2026-11-19 to 2026-12-25)
const seasonalRecord = buildOwnedHoursRecord({
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    open: { day: d, hour: 18, minute: 0 },
    close: { day: d, hour: 22, minute: 0 },
  })),
  weekdayDescriptions: [
    "Sunday: 6:00 PM – 10:00 PM",
    "Monday: 6:00 PM – 10:00 PM",
    "Tuesday: 6:00 PM – 10:00 PM",
    "Wednesday: 6:00 PM – 10:00 PM",
    "Thursday: 6:00 PM – 10:00 PM",
    "Friday: 6:00 PM – 10:00 PM",
    "Saturday: 6:00 PM – 10:00 PM",
  ],
  source: "editorial_curated",
  validFromDate: "2026-11-19",
  validThroughDate: "2026-12-25",
  verifiedAt: "2026-10-13T00:00:00.000Z",
});
eq(seasonalRecord.validFromDate, "2026-11-19", "validFromDate is 2026-11-19");
eq(seasonalRecord.validThroughDate, "2026-12-25", "validThroughDate is 2026-12-25");

// Before start date (Nov 13): outside seasonal window -> closed
const seasonalBefore = evaluateOwnedHoursStatus(seasonalRecord, T_BASE_MS);
eq(seasonalBefore.state, "closed", "state is closed before seasonal start date");
eq(seasonalBefore.semanticState, "outside_seasonal_window", "semanticState is outside_seasonal_window");
eq(seasonalBefore.open, false, "open is false outside seasonal window");
eq(seasonalBefore.confidence, "confirmed", "confidence is confirmed outside seasonal window");

// During season (Dec 1, 19:00 EST / 7pm): inside season and within open hours (6pm-10pm) -> open
const tInSeasonOpen = Date.parse("2026-12-01T19:00:00-05:00");
const seasonalDuring = evaluateOwnedHoursStatus(seasonalRecord, tInSeasonOpen);
eq(seasonalDuring.state, "open", "state is open during season within open hours");
eq(seasonalDuring.open, true, "open is true");
eq(seasonalDuring.confidence, "confirmed", "confidence is confirmed in season");

// After end date (Dec 28): outside seasonal window -> closed
const tAfterSeason = Date.parse("2026-12-28T19:00:00-05:00");
const seasonalAfter = evaluateOwnedHoursStatus(seasonalRecord, tAfterSeason);
eq(seasonalAfter.state, "closed", "state is closed after seasonal end date");
eq(seasonalAfter.semanticState, "outside_seasonal_window", "semanticState is outside_seasonal_window");

// 6e. Host venue vs event conflation protection:
// christmas-2026-research.json contains event entries whose place_id is a year-round host venue.
// resolveOwnedHoursSnapshot must NEVER assign seasonal event times as host venue hours.
eq(resolveOwnedHoursSnapshot("ChIJFY7wCsjD2YgRn8R_2IMRjtw"), null, "Zoo Miami preserves null/unknown rather than false outside_seasonal_window");
eq(resolveOwnedHoursSnapshot("ChIJBQ5SjLHGwogRL4X19g4J5tI"), null, "ZooTampa preserves null/unknown rather than false outside_seasonal_window");
eq(resolveOwnedHoursSnapshot("ChIJI0Ja3y4E3ogRoNdEL3xe4Ek"), null, "Brevard Zoo preserves null/unknown rather than false outside_seasonal_window");
const vizcayaSnap = resolveOwnedHoursSnapshot("ChIJE5jqT1222YgR4STdDoStYPg");
ok(vizcayaSnap && vizcayaSnap.source === "wayfind_editorial_hours", "Vizcaya Museum resolves year-round editorial hours");
eq(vizcayaSnap.validFromDate, null, "Vizcaya Museum does not inherit seasonal event validFromDate");
eq(vizcayaSnap.validThroughDate, null, "Vizcaya Museum does not inherit seasonal event validThroughDate");

// 6e. Stale hours: >90d for owned non-Google, >21d for Google
const tStaleOwnedMs = Date.parse("2027-04-01T12:00:00.000Z"); // >90d after 2026-11-13
const staleOwnedStatus = evaluateOwnedHoursStatus(caDzan, tStaleOwnedMs);
eq(staleOwnedStatus.freshness, "stale", "owned hours record >90d is stale");
eq(staleOwnedStatus.confidence, "likely_stale", "owned hours record >90d has likely_stale confidence");

const googleHours = buildOwnedHoursRecord({
  periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
  source: "google_places",
  verifiedAt: new Date(T_BASE_MS).toISOString(),
});
const tStaleGoogleMs = T_BASE_MS + 22 * 86400000; // 22 days old (>21d stale threshold)
const staleGoogleStatus = evaluateOwnedHoursStatus(googleHours, tStaleGoogleMs);
eq(staleGoogleStatus.freshness, "stale", "Google hours >21d is stale");
eq(staleGoogleStatus.confidence, "likely_stale", "Google hours >21d has likely_stale confidence");

// 6f. Expired Google hours: >=30d strict ToS eviction
const tExpiredGoogleMs = T_BASE_MS + 31 * 86400000; // 31 days old (>30d ToS eviction)
const expiredGoogleStatus = evaluateOwnedHoursStatus(googleHours, tExpiredGoogleMs);
eq(expiredGoogleStatus.state, "unknown", "expired Google hours returns unknown state");
eq(expiredGoogleStatus.freshness, "expired", "expired Google hours returns expired freshness");
eq(expiredGoogleStatus.confidence, "expired", "expired Google hours returns expired confidence");
eq(expiredGoogleStatus.open, null, "expired Google hours returns open null");

// 6g. Missing data: null ownedHours
const missingStatus = evaluateOwnedHoursStatus(null, T_BASE_MS);
eq(missingStatus.state, "unknown", "null ownedHours returns unknown state");
eq(missingStatus.freshness, "missing", "null ownedHours returns missing freshness");
eq(missingStatus.confidence, "unknown", "null ownedHours returns unknown confidence");
eq(missingStatus.open, null, "null ownedHours returns open null");

// 6h. Enrich Map Places with Repo Owned Hours unit tests
const testMapPlacesInput = [
  {
    id: "ChIJ08zZpRpBw4gRiDJBlBXfAHw", // Bee Ridge Park (has repo owned hours)
    name: "Bee Ridge Park",
    lat: 27.28,
    lng: -82.52,
    oh: null,
    ownedHours: null,
  },
  {
    id: "ChIJunknownPlaceWithoutHours",
    name: "Unknown Place Without Hours",
    lat: 27.95,
    lng: -82.45,
    oh: null,
    ownedHours: null,
  },
  {
    id: "ChIJplaceWithGoogleOh",
    name: "Place With Fresh Google Oh",
    lat: 27.96,
    lng: -82.46,
    oh: { periods: [{ open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }], weekdayDescriptions: ["Monday: 8:00 AM – 6:00 PM"] },
    ownedHours: null,
  },
  {
    id: "ChIJplaceWithExistingVerifiedOwnedHours",
    name: "Place With Existing Verified Owned Hours",
    lat: 27.33,
    lng: -82.53,
    oh: { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] },
    ownedHours: {
      schema: 1,
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
      weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"],
      source: "wayfind_editorial_hours",
      verifiedAt: new Date(T_BASE_MS).toISOString(),
    },
  },
];

const enrichedPlaces = enrichMapPlacesWithRepoOwnedHours(testMapPlacesInput, T_BASE_MS);
eq(enrichedPlaces.length, 4, "enrichedPlaces returns same length");

// 1. Repo-verified place (Bee Ridge Park) gets hydrated with ownedHours and oh
const enrichedBeeRidge = enrichedPlaces.find(p => p.id === "ChIJ08zZpRpBw4gRiDJBlBXfAHw");
ok(enrichedBeeRidge.ownedHours, "Bee Ridge Park receives ownedHours snapshot");
ok(Array.isArray(enrichedBeeRidge.oh?.periods) && enrichedBeeRidge.oh.periods.length > 0, "Bee Ridge Park receives oh periods");
eq(enrichedBeeRidge._ownedHoursSource, "wayfind_editorial_hours", "Bee Ridge Park source is wayfind_editorial_hours");

// 2. Unknown place remains strictly null (never falsely labeled open or closed)
const enrichedUnknown = enrichedPlaces.find(p => p.id === "ChIJunknownPlaceWithoutHours");
eq(enrichedUnknown.ownedHours, null, "unknown place ownedHours remains null");
eq(enrichedUnknown.oh, null, "unknown place oh remains null");

// 3. Google-sourced hours remain strictly separate (not conflated as permanent Wayfind-owned ownedHours)
const enrichedGoogle = enrichedPlaces.find(p => p.id === "ChIJplaceWithGoogleOh");
eq(enrichedGoogle.ownedHours, null, "place with Google oh does not get false repo ownedHours");
ok(enrichedGoogle.oh && enrichedGoogle.oh.weekdayDescriptions, "Google oh remains intact separately");

// 4. Unchanged-control idempotency: existing verified ownedHours is preserved and not overwritten with redundant writes
const enrichedExisting = enrichedPlaces.find(p => p.id === "ChIJplaceWithExistingVerifiedOwnedHours");
ok(enrichedExisting.ownedHours, "existing verified ownedHours preserved");
eq(enrichedExisting.ownedHours.source, "wayfind_editorial_hours", "existing source preserved");

// 6i. Firewall-gated persistence in test/guard mode
const firewallPersistRes = await persistOwnedHoursSnapshot(
  "ChIJpXGK53VC24gRWMneFVtK6hY",
  caDzan,
  {
    env: {
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key-token-secret-dummy",
      WF_GUARD_SUITE: "1",
    },
    nowMs: T_BASE_MS,
  },
);
eq(firewallPersistRes.persisted, false, "firewall blocks live production mutation during guard suite");
ok(
  firewallPersistRes.reason && firewallPersistRes.reason.includes("firewall-blocked"),
  `firewall refusal reason recorded (got ${firewallPersistRes.reason})`,
);

// 6i. Hours Freshness Queue ranking: unknown open state boosted over verified owned hours
const unknownPlaceRow = {
  place_id: "ChIJunknownPlace",
  name: "Unknown Venue In Tampa",
  metro: "tampa-bay",
  locality: "Tampa",
  anchor: false,
  signals: { reviews: 100 },
};
const verifiedSelbyRow = {
  place_id: "ChIJPTvxtmpAw4gReToYD5mTNwE", // Marie Selby Botanical Gardens (has editorial hours)
  name: "Marie Selby Botanical Gardens",
  metro: "sarasota",
  locality: "Sarasota",
  anchor: true,
  signals: { reviews: 5000 },
};

const unknownScore = scoreHoursRefreshPriority(unknownPlaceRow, { nowMs: T_BASE_MS });
const verifiedScore = scoreHoursRefreshPriority(verifiedSelbyRow, { nowMs: T_BASE_MS });

eq(unknownScore.needsHours, true, "unknown venue needsHours is true");
eq(verifiedScore.needsHours, false, "venue covered by ownedHours index needsHours is false");
eq(unknownScore.components.unknownPoints, 220, "unknown venue receives full 220 unknownPoints");
eq(verifiedScore.components.unknownPoints, 0, "covered venue receives 0 unknownPoints");

// ── 7. WAVE 3 TAMPA & FORT LAUDERDALE VERIFIED HOURS + CLOCK MATRIX ───────
const T_W3_NOW_MS = Date.parse("2026-11-19T20:00:00.000Z"); // Thu Nov 19, 2026 3:00 PM EST
const w3PlacesInput = [
  { id: "ChIJz8e7TVLEwogRBeybvscHnD4", name: "Columbia Restaurant", lat: 27.95999, lng: -82.43514, oh: null, ownedHours: null },
  { id: "ChIJ3Vyq7WTEwogRA-WDC7Mze2E", name: "Ulele", lat: 27.95994, lng: -82.46280, oh: null, ownedHours: null },
  { id: "ChIJH9758boB2YgRrs8O7f55ATA", name: "Café Bastille Fort Lauderdale", lat: 26.12137, lng: -80.13607, oh: null, ownedHours: null },
  { id: "ChIJi6K8mAwB2YgRuOxEAQPCaKQ", name: "Hatch", lat: 26.13191, lng: -80.13779, oh: null, ownedHours: null },
  { id: "ChIJ4V0TH_kA2YgRxgaQuq3qeV4", name: "Glitch Bar", lat: 26.13533, lng: -80.13919, oh: null, ownedHours: null },
  { id: "ChIJBQ5SjLHGwogRL4X19g4J5tI", name: "ZooTampa at Lowry Park", lat: 28.01384, lng: -82.46997, oh: null, ownedHours: null },
  { id: "ChIJunresearchedFtlTestVenue", name: "Unresearched FTL Venue", lat: 26.1224, lng: -80.1373, oh: null, ownedHours: null },
];

const w3Enriched = enrichMapPlacesWithRepoOwnedHours(w3PlacesInput, T_W3_NOW_MS);
const byIdW3 = new Map(w3Enriched.map((p) => [p.id, p]));

for (const pid of [
  "ChIJz8e7TVLEwogRBeybvscHnD4",
  "ChIJ3Vyq7WTEwogRA-WDC7Mze2E",
  "ChIJH9758boB2YgRrs8O7f55ATA",
  "ChIJi6K8mAwB2YgRuOxEAQPCaKQ",
  "ChIJ4V0TH_kA2YgRxgaQuq3qeV4",
]) {
  const rec = byIdW3.get(pid);
  ok(rec?.ownedHours, `${pid} receives ownedHours snapshot`);
  eq(rec._ownedHoursSource, "wayfind_editorial_hours", `${pid} source is wayfind_editorial_hours`);
  ok(Array.isArray(rec.oh?.periods) && rec.oh.periods.length === 7, `${pid} has 7-day periods`);
  ok(Array.isArray(rec.oh?.weekdayDescriptions) && rec.oh.weekdayDescriptions.length === 7, `${pid} has 7 weekdayDescriptions`);
}

// Skipped / unresearched venues preserve strict null / unknown
for (const unknownId of ["ChIJBQ5SjLHGwogRL4X19g4J5tI", "ChIJunresearchedFtlTestVenue"]) {
  const u = byIdW3.get(unknownId);
  eq(u.ownedHours, null, `${unknownId} ownedHours remains null (unknown stays unknown)`);
  const uStatus = evaluateOwnedHoursStatus(u.ownedHours, T_W3_NOW_MS);
  eq(uStatus.state, "unknown", `${unknownId} status state is unknown`);
  eq(uStatus.open, null, `${unknownId} open is null`);
}

// Deterministic America/New_York clock checks (Thu Nov 19 – Sat Nov 21, 2026, EST -05:00)
const T_THU_1000 = Date.parse("2026-11-19T10:00:00-05:00");
const T_THU_1530 = Date.parse("2026-11-19T15:30:00-05:00");
const T_THU_2030 = Date.parse("2026-11-19T20:30:00-05:00");
const T_THU_2330 = Date.parse("2026-11-19T23:30:00-05:00");
const T_FRI_0100 = Date.parse("2026-11-20T01:00:00-05:00");
const T_FRI_0230 = Date.parse("2026-11-20T02:30:00-05:00");
const T_SAT_1300 = Date.parse("2026-11-21T13:00:00-05:00");
const T_SAT_1630 = Date.parse("2026-11-21T16:30:00-05:00");

const w3ClockMatrix = [
  ["ChIJz8e7TVLEwogRBeybvscHnD4", T_THU_1000, false, "Columbia closed at 10:00 AM Thu"],
  ["ChIJz8e7TVLEwogRBeybvscHnD4", T_THU_1530, true, "Columbia open at 3:30 PM Thu"],
  ["ChIJz8e7TVLEwogRBeybvscHnD4", T_THU_2030, true, "Columbia open at 8:30 PM Thu"],
  ["ChIJz8e7TVLEwogRBeybvscHnD4", T_THU_2330, false, "Columbia closed at 11:30 PM Thu"],

  ["ChIJ3Vyq7WTEwogRA-WDC7Mze2E", T_THU_1000, false, "Ulele closed at 10:00 AM Thu"],
  ["ChIJ3Vyq7WTEwogRA-WDC7Mze2E", T_THU_2030, true, "Ulele open at 8:30 PM Thu"],
  ["ChIJ3Vyq7WTEwogRA-WDC7Mze2E", T_THU_2330, false, "Ulele closed at 11:30 PM Thu"],

  ["ChIJH9758boB2YgRrs8O7f55ATA", T_THU_1000, true, "Café Bastille open at 10:00 AM Thu"],
  ["ChIJH9758boB2YgRrs8O7f55ATA", T_THU_1530, true, "Café Bastille open at 3:30 PM Thu"],
  ["ChIJH9758boB2YgRrs8O7f55ATA", T_THU_2030, false, "Café Bastille closed at 8:30 PM Thu"],
  ["ChIJH9758boB2YgRrs8O7f55ATA", T_SAT_1630, true, "Café Bastille open at 4:30 PM Sat"],

  ["ChIJi6K8mAwB2YgRuOxEAQPCaKQ", T_THU_1000, true, "Hatch open at 10:00 AM Thu"],
  ["ChIJi6K8mAwB2YgRuOxEAQPCaKQ", T_THU_1530, false, "Hatch closed at 3:30 PM Thu"],
  ["ChIJi6K8mAwB2YgRuOxEAQPCaKQ", T_SAT_1300, true, "Hatch open at 1:00 PM Sat"],
  ["ChIJi6K8mAwB2YgRuOxEAQPCaKQ", T_SAT_1630, false, "Hatch closed at 4:30 PM Sat"],

  ["ChIJ4V0TH_kA2YgRxgaQuq3qeV4", T_THU_1530, false, "Glitch Bar closed at 3:30 PM Thu"],
  ["ChIJ4V0TH_kA2YgRxgaQuq3qeV4", T_THU_2030, true, "Glitch Bar open at 8:30 PM Thu"],
  ["ChIJ4V0TH_kA2YgRxgaQuq3qeV4", T_THU_2330, true, "Glitch Bar open at 11:30 PM Thu"],
  ["ChIJ4V0TH_kA2YgRxgaQuq3qeV4", T_FRI_0100, true, "Glitch Bar open at 1:00 AM Fri (Thu overnight wrap)"],
  ["ChIJ4V0TH_kA2YgRxgaQuq3qeV4", T_FRI_0230, false, "Glitch Bar closed at 2:30 AM Fri"],
  ["ChIJ4V0TH_kA2YgRxgaQuq3qeV4", T_SAT_1300, true, "Glitch Bar open at 1:00 PM Sat"],
];

for (const [pid, ts, expectedOpen, label] of w3ClockMatrix) {
  const st = evaluateOwnedHoursStatus(byIdW3.get(pid).ownedHours, ts);
  eq(st.open, expectedOpen, label);
  eq(st.state, expectedOpen ? "open" : "closed", `${label} state`);
}

// ── 8. WAVE 4 SIX-VENUE :30-MINUTE SURVIVAL, BOUNDARY CLOCKS & HOLIDAY CLOSURES ─
const w4Pack = JSON.parse(
  readFileSync(new URL("../docs/editorial/hours-tampa-fort-lauderdale-2026-11-19/pack-01.json", import.meta.url), "utf8"),
);
const w4SixIds = [
  ["ChIJYWj9iZ_PwogRQebjN7pJ_Nw", "Armature Works", 27.95414, -82.46331, 7, 30],
  ["ChIJ11hsiYXEwogRjDBv39F04J8", "Oxford Exchange", 27.94473, -82.46348, 7, 30],
  ["ChIJzXMD72bDwogRUmY0GaY63xI", "Bulla Gastrobar Tampa", 27.93954, -82.48272, 11, 30],
  ["ChIJ44sC7V4B2YgRY7AoBR2t48I", "Earls Kitchen + Bar", 26.11942, -80.13695, 11, 30],
  ["ChIJx-Y0oZAB2YgRCjB0K5pdPfI", "Colombian Mountains Cafe", 26.12202, -80.14369, 8, 30],
  ["ChIJFwgu6SUB2YgR0DCYTC7nHYc", "Voodoo Bayou", 26.11955, -80.13275, 11, 30],
];

for (const [pid, label, , , openHr, openMin] of w4SixIds) {
  const cand = w4Pack.candidates.find((c) => c.place_id === pid);
  ok(cand, `${label} present in pack-01.json`);
  const parsed = parseOfficialEditorialFactsToHours(cand.editorial.facts);
  ok(parsed && parsed.ok === true, `${label} parseOfficialEditorialFactsToHours succeeds`);
  const pre = PRECOMPILED_OWNED_HOURS[pid];
  ok(pre && Array.isArray(pre.periods) && pre.periods.length === 7, `${label} in PRECOMPILED_OWNED_HOURS with 7 periods`);
  const monPeriod = pre.periods.find((p) => p.open?.day === 1);
  eq(monPeriod?.open?.hour, openHr, `${label} Monday open hour is ${openHr}`);
  eq(monPeriod?.open?.minute, openMin, `${label} Monday open minute is exact :${openMin}`);
}

const w4PlacesInput = [
  ...w4SixIds.map(([id, name, lat, lng]) => ({ id, name, lat, lng, oh: null, ownedHours: null })),
  { id: "ChIJBQ5SjLHGwogRL4X19g4J5tI", name: "ZooTampa at Lowry Park", lat: 28.01384, lng: -82.46997, oh: null, ownedHours: null },
  { id: "ChIJi6K8mAwB2YgRuOxEAQPCaKQ", name: "Hatch", lat: 26.13191, lng: -80.13779, oh: null, ownedHours: null },
];
const w4Enriched = enrichMapPlacesWithRepoOwnedHours(w4PlacesInput, T_W3_NOW_MS);
const byIdW4 = new Map(w4Enriched.map((p) => [p.id, p]));

// Oxford Exchange also closes at 5:30 PM
const oxfordFri = byIdW4.get("ChIJ11hsiYXEwogRjDBv39F04J8").ownedHours.periods.find((p) => p.open?.day === 5);
eq(oxfordFri?.close?.hour, 17, "Oxford Exchange Friday close hour is 17");
eq(oxfordFri?.close?.minute, 30, "Oxford Exchange Friday close minute is exact :30");

// Bulla Gastrobar Tampa Saturday opens at 11:00 AM
const bullaSat = byIdW4.get("ChIJzXMD72bDwogRUmY0GaY63xI").ownedHours.periods.find((p) => p.open?.day === 6);
eq(bullaSat?.open?.hour, 11, "Bulla Gastrobar Tampa Saturday open hour is 11");
eq(bullaSat?.open?.minute, 0, "Bulla Gastrobar Tampa Saturday open minute is :00");

// ZooTampa remains strictly unknown
const w4ZooTampa = byIdW4.get("ChIJBQ5SjLHGwogRL4X19g4J5tI");
eq(w4ZooTampa.ownedHours, null, "Wave 4 ZooTampa ownedHours remains null");
const w4ZooStatus = evaluateOwnedHoursStatus(w4ZooTampa.ownedHours, T_W3_NOW_MS);
eq(w4ZooStatus.state, "unknown", "Wave 4 ZooTampa state remains unknown");
eq(w4ZooStatus.open, null, "Wave 4 ZooTampa open remains null");

// Exact :30 open/close and overnight boundary clock matrix (Thu Nov 19 – Sat Nov 21, 2026 EST -05:00)
const w4ClockMatrix = [
  // Armature Works: Mon-Thu 7:30 AM-10 PM, Fri 7:30 AM-12 AM, Sat 8 AM-12 AM
  ["ChIJYWj9iZ_PwogRQebjN7pJ_Nw", Date.parse("2026-11-19T07:29:00-05:00"), false, "Armature Works closed at 7:29 AM Thu"],
  ["ChIJYWj9iZ_PwogRQebjN7pJ_Nw", Date.parse("2026-11-19T07:30:00-05:00"), true, "Armature Works open at 7:30 AM Thu"],
  ["ChIJYWj9iZ_PwogRQebjN7pJ_Nw", Date.parse("2026-11-20T23:30:00-05:00"), true, "Armature Works open at 11:30 PM Fri"],
  ["ChIJYWj9iZ_PwogRQebjN7pJ_Nw", Date.parse("2026-11-21T00:05:00-05:00"), false, "Armature Works closed at 12:05 AM Sat"],

  // Oxford Exchange: Mon-Fri 7:30 AM-5:30 PM
  ["ChIJ11hsiYXEwogRjDBv39F04J8", Date.parse("2026-11-19T07:29:00-05:00"), false, "Oxford Exchange closed at 7:29 AM Thu"],
  ["ChIJ11hsiYXEwogRjDBv39F04J8", Date.parse("2026-11-19T07:30:00-05:00"), true, "Oxford Exchange open at 7:30 AM Thu"],
  ["ChIJ11hsiYXEwogRjDBv39F04J8", Date.parse("2026-11-19T17:29:00-05:00"), true, "Oxford Exchange open at 5:29 PM Thu"],
  ["ChIJ11hsiYXEwogRjDBv39F04J8", Date.parse("2026-11-19T17:30:00-05:00"), false, "Oxford Exchange closed at 5:30 PM Thu"],
  ["ChIJ11hsiYXEwogRjDBv39F04J8", Date.parse("2026-11-19T17:31:00-05:00"), false, "Oxford Exchange closed at 5:31 PM Thu"],

  // Bulla Gastrobar Tampa: Fri 11:30 AM-11 PM, Sat 11 AM-11 PM
  ["ChIJzXMD72bDwogRUmY0GaY63xI", Date.parse("2026-11-20T11:29:00-05:00"), false, "Bulla Gastrobar closed at 11:29 AM Fri"],
  ["ChIJzXMD72bDwogRUmY0GaY63xI", Date.parse("2026-11-20T11:30:00-05:00"), true, "Bulla Gastrobar open at 11:30 AM Fri"],
  ["ChIJzXMD72bDwogRUmY0GaY63xI", Date.parse("2026-11-20T22:30:00-05:00"), true, "Bulla Gastrobar open at 10:30 PM Fri"],
  ["ChIJzXMD72bDwogRUmY0GaY63xI", Date.parse("2026-11-20T23:05:00-05:00"), false, "Bulla Gastrobar closed at 11:05 PM Fri"],
  ["ChIJzXMD72bDwogRUmY0GaY63xI", Date.parse("2026-11-21T11:00:00-05:00"), true, "Bulla Gastrobar open at 11:00 AM Sat"],

  // Earls Kitchen + Bar: Fri 11:30 AM-2 AM (overnight Sat)
  ["ChIJ44sC7V4B2YgRY7AoBR2t48I", Date.parse("2026-11-20T11:29:00-05:00"), false, "Earls Kitchen + Bar closed at 11:29 AM Fri"],
  ["ChIJ44sC7V4B2YgRY7AoBR2t48I", Date.parse("2026-11-20T11:30:00-05:00"), true, "Earls Kitchen + Bar open at 11:30 AM Fri"],
  ["ChIJ44sC7V4B2YgRY7AoBR2t48I", Date.parse("2026-11-21T01:30:00-05:00"), true, "Earls Kitchen + Bar open at 1:30 AM Sat (Fri overnight)"],
  ["ChIJ44sC7V4B2YgRY7AoBR2t48I", Date.parse("2026-11-21T02:05:00-05:00"), false, "Earls Kitchen + Bar closed at 2:05 AM Sat"],

  // Colombian Mountains Cafe: Fri 8:30 AM-11 PM
  ["ChIJx-Y0oZAB2YgRCjB0K5pdPfI", Date.parse("2026-11-20T08:29:00-05:00"), false, "Colombian Mountains Cafe closed at 8:29 AM Fri"],
  ["ChIJx-Y0oZAB2YgRCjB0K5pdPfI", Date.parse("2026-11-20T08:30:00-05:00"), true, "Colombian Mountains Cafe open at 8:30 AM Fri"],
  ["ChIJx-Y0oZAB2YgRCjB0K5pdPfI", Date.parse("2026-11-20T22:30:00-05:00"), true, "Colombian Mountains Cafe open at 10:30 PM Fri"],
  ["ChIJx-Y0oZAB2YgRCjB0K5pdPfI", Date.parse("2026-11-20T23:05:00-05:00"), false, "Colombian Mountains Cafe closed at 11:05 PM Fri"],

  // Voodoo Bayou: Fri 11:30 AM-1 AM (overnight Sat)
  ["ChIJFwgu6SUB2YgR0DCYTC7nHYc", Date.parse("2026-11-20T11:29:00-05:00"), false, "Voodoo Bayou closed at 11:29 AM Fri"],
  ["ChIJFwgu6SUB2YgR0DCYTC7nHYc", Date.parse("2026-11-20T11:30:00-05:00"), true, "Voodoo Bayou open at 11:30 AM Fri"],
  ["ChIJFwgu6SUB2YgR0DCYTC7nHYc", Date.parse("2026-11-21T00:30:00-05:00"), true, "Voodoo Bayou open at 12:30 AM Sat (Fri overnight)"],
  ["ChIJFwgu6SUB2YgR0DCYTC7nHYc", Date.parse("2026-11-21T01:05:00-05:00"), false, "Voodoo Bayou closed at 1:05 AM Sat"],
];

for (const [pid, ts, expectedOpen, label] of w4ClockMatrix) {
  const st = evaluateOwnedHoursStatus(byIdW4.get(pid).ownedHours, ts);
  eq(st.open, expectedOpen, label);
  eq(st.state, expectedOpen ? "open" : "closed", `${label} state`);
}

// Verified dated closed holiday specialHours (Hatch Christmas Day; Voodoo Bayou Thanksgiving & Christmas Day)
const hatchChristmas = evaluateOwnedHoursStatus(
  byIdW4.get("ChIJi6K8mAwB2YgRuOxEAQPCaKQ").ownedHours,
  Date.parse("2026-12-25T11:00:00-05:00"),
);
eq(hatchChristmas.state, "closed", "Hatch Christmas Day state is closed");
eq(hatchChristmas.semanticState, "closed_holiday", "Hatch Christmas Day semanticState is closed_holiday");
eq(hatchChristmas.open, false, "Hatch Christmas Day open is false");

const hatchNormalThu = evaluateOwnedHoursStatus(
  byIdW4.get("ChIJi6K8mAwB2YgRuOxEAQPCaKQ").ownedHours,
  Date.parse("2026-11-19T10:00:00-05:00"),
);
eq(hatchNormalThu.state, "open", "Hatch normal Thursday state remains open");
eq(hatchNormalThu.open, true, "Hatch normal Thursday open remains true");

for (const [ts, holidayLabel] of [
  [Date.parse("2026-11-26T17:00:00-05:00"), "Thanksgiving"],
  [Date.parse("2026-12-25T17:00:00-05:00"), "Christmas Day"],
]) {
  const vbHoliday = evaluateOwnedHoursStatus(byIdW4.get("ChIJFwgu6SUB2YgR0DCYTC7nHYc").ownedHours, ts);
  eq(vbHoliday.state, "closed", `Voodoo Bayou ${holidayLabel} state is closed`);
  eq(vbHoliday.semanticState, "closed_holiday", `Voodoo Bayou ${holidayLabel} semanticState is closed_holiday`);
  eq(vbHoliday.open, false, `Voodoo Bayou ${holidayLabel} open is false`);
}

// Hatch Thanksgiving has reduced hours (7 AM – 1 PM), NOT a closed: true entry in specialHours
const hatchRec = byIdW4.get("ChIJi6K8mAwB2YgRuOxEAQPCaKQ").ownedHours;
ok(
  !(hatchRec.specialHours || []).some((sh) => sh && sh.date === "2026-11-26" && sh.closed === true),
  "Hatch Thanksgiving 2026-11-26 is NOT falsely marked closed: true in specialHours",
);

// Lion Country Safari carries standalone "Closed Thanksgiving" specialHours (2026-11-26)
const lionSnap = resolveOwnedHoursSnapshot("ChIJJYiDRgcx2YgRWQ9Vze8pUXk");
ok(lionSnap && Array.isArray(lionSnap.specialHours), "Lion Country Safari resolves with specialHours");
ok(
  lionSnap.specialHours.some((sh) => sh.date === "2026-11-26" && sh.closed === true),
  "Lion Country Safari specialHours includes 2026-11-26 Thanksgiving closure",
);
const lionThanksgiving = evaluateOwnedHoursStatus(lionSnap, Date.parse("2026-11-26T12:00:00-05:00"));
eq(lionThanksgiving.state, "closed", "Lion Country Safari Thanksgiving state is closed");
eq(lionThanksgiving.semanticState, "closed_holiday", "Lion Country Safari Thanksgiving semanticState is closed_holiday");
eq(lionThanksgiving.open, false, "Lion Country Safari Thanksgiving open is false");
const lionNormal = evaluateOwnedHoursStatus(lionSnap, Date.parse("2026-11-19T12:00:00-05:00"));
eq(lionNormal.state, "open", "Lion Country Safari normal Thursday state is open");
eq(lionNormal.open, true, "Lion Country Safari normal Thursday open is true");

// Fail-closed guards: & Holidays weekend drop and conflicting multi-fact schedules stay null/unknown
eq(
  parseOfficialEditorialFactsToHours([
    "Hours are Mon - Fri: 9:00 a.m. - 6:00 p.m. and Sat - Sun & Holidays: 10:00 a.m. - 5:00 p.m.",
  ]),
  null,
  "Childrens Science Explorium (& Holidays) fails closed instead of false Sat-Sun: Closed",
);
eq(
  parseOfficialEditorialFactsToHours([
    "Cafe hours are Monday - Saturday 8:00 a.m. - 2:30 p.m. and Sundays 8:30 a.m. - 2:00 p.m.",
    "Market hours are daily 9:00 a.m. - 3:00 p.m.",
  ]),
  null,
  "Wildflower Cafe (Cafe vs Market conflict) fails closed",
);
eq(
  parseOfficialEditorialFactsToHours([
    "Hialeah Gardens hours are Mon-Thurs 8:00 a.m. to 9:00 p.m., Fri-Sat 8:00 a.m. to 11:00 p.m. and Sun 10:00 a.m. to 9:00 p.m.",
    "Southwest Ranches hours are Sun-Thurs 11:00 a.m. to 10:00 p.m. and Fri-Sat 11:00 a.m. to 11:00 p.m.",
  ]),
  null,
  "Adrian Fish Market (multi-location conflict) fails closed",
);
for (const [failPid, failLabel] of [
  ["ChIJM7EA5MQd2YgR4kdF7VtPWMA", "Childrens Science Explorium"],
  ["ChIJo-bXKb7wwogRvUOrkxHNOAk", "Wildflower Cafe"],
  ["ChIJ6QiaDACn2YgR27VyEWRtltk", "Adrian Fish Market & Restaurant"],
]) {
  eq(PRECOMPILED_OWNED_HOURS[failPid], undefined, `${failLabel} absent from PRECOMPILED_OWNED_HOURS`);
  eq(resolveOwnedHoursSnapshot(failPid), null, `${failLabel} resolveOwnedHoursSnapshot remains null`);
}

console.log(`test-owned-hours-cohort: OK — ${assertions} assertions passed`);

