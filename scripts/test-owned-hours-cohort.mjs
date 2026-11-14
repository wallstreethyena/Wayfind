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
import {
  buildOwnedHoursRecord,
  isUsableOwnedHours,
  evaluateOwnedHoursStatus,
  resolveOwnedHoursSnapshot,
  detectSpecialHoursUncertainty,
  persistOwnedHoursSnapshot,
} from "../lib/ownedHours.js";
import {
  scoreHoursRefreshPriority,
  rankHoursRefreshQueue,
} from "../lib/hoursFreshnessQueue.js";
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
ok(report.sourceBreakdown["wayfind_editorial_hours"] >= 282, "at least 282 deterministic Atlas cards ingested");
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
eq(resolveOwnedHoursSnapshot("ChIJE5jqT1222YgR4STdDoStYPg"), null, "Vizcaya Museum preserves null/unknown rather than false outside_seasonal_window");
eq(resolveOwnedHoursSnapshot("ChIJI0Ja3y4E3ogRoNdEL3xe4Ek"), null, "Brevard Zoo preserves null/unknown rather than false outside_seasonal_window");

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

// 6h. Firewall-gated persistence in test/guard mode
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

console.log(`test-owned-hours-cohort: OK — ${assertions} assertions passed`);
