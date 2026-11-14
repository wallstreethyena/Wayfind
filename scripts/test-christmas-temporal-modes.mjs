#!/usr/bin/env node
// scripts/test-christmas-temporal-modes.mjs — Missions 14 & 15 Deterministic Guard.
//
// Proves strict Christmas temporal mode boundaries across:
//   - `OPEN TONIGHT` (`when=tonight`): requires `!season_undated`, active date window,
//     active day schedule (`occurrence_dates.includes(today)` or non-select-night
//     allowed `dayRule`), and no contradiction from verified `ownedHours`.
//     Distinguishes `confirmedOpenTonight` ("Open tonight") vs `hoursUnverified`
//     ("Active tonight · check hours").
//   - `OPEN THIS WEEKEND` (`when=weekend`): active Fri..Sun window.
//   - `OPENING SOON` (`when=opening-soon`): future seasonal inventory (`start_date > today`
//     or first occurrence `> today`) preserved cleanly with truthful start badges.
//   - `ALL CHRISTMAS` (`when=""` / `when=all`): full statewide inventory preserved,
//     dash-free (`CHRISTMAS_DASH_RX` clean), never mislabeling future events as open tonight.

import assert from "node:assert/strict";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  CHRISTMAS_TEMPORAL_MODES,
  computeChristmasTemporalCounts,
  evaluateChristmasTemporalStatus,
  formatOpeningSoonBadge,
  matchesChristmasTemporalMode,
} from "../lib/christmasTemporalModes.js";
import {
  CHRISTMAS_BROWSE_DATES,
  christmasBrowseListings,
  christmasBrowsePage,
  filterChristmasBrowse,
  parseChristmasBrowseQuery,
} from "../lib/christmasBrowse.js";
import { CHRISTMAS_DASH_RX } from "../lib/christmasCardCopy.js";
import { buildOwnedHoursRecord } from "../lib/ownedHours.js";

const RED_PROVE = process.argv.includes("--red-prove");
let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks += 1;
}

const TODAY = "2026-11-13"; // Friday, Nov 13, 2026 (weekend = Nov 13..15)
const NOW_MS = Date.parse("2026-11-13T23:15:00Z"); // 6:15 PM ET

// ── 1. Canonical mode registry & query parsing ──────────────────────────────
ok(CHRISTMAS_TEMPORAL_MODES.length === 4, "four canonical Christmas temporal modes");
for (const mode of CHRISTMAS_TEMPORAL_MODES) {
  ok(!CHRISTMAS_DASH_RX.test(mode.label), `mode label "${mode.label}" is dash-free`);
}
ok(CHRISTMAS_BROWSE_DATES.some((d) => d.id === "tonight"), "CHRISTMAS_BROWSE_DATES exposes tonight");
ok(CHRISTMAS_BROWSE_DATES.some((d) => d.id === "weekend"), "CHRISTMAS_BROWSE_DATES exposes weekend");
ok(CHRISTMAS_BROWSE_DATES.some((d) => d.id === "opening-soon"), "CHRISTMAS_BROWSE_DATES exposes opening-soon");

ok(parseChristmasBrowseQuery({ when: "tonight" }).when === "tonight", "parseChristmasBrowseQuery accepts tonight");
ok(parseChristmasBrowseQuery({ when: "opening-soon" }).when === "opening-soon", "parseChristmasBrowseQuery accepts opening-soon");
ok(parseChristmasBrowseQuery({ when: "all" }).when === "", "parseChristmasBrowseQuery normalizes when=all to empty");
ok(parseChristmasBrowseQuery({ when: "bogus" }).when === "", "parseChristmasBrowseQuery rejects unknown when");

// ── 2. Synthetic boundary fixtures (unit matrix) ────────────────────────────
const closedFridayOwnedHours = buildOwnedHoursRecord({
  periods: [
    // Open Saturday (day 6) 17:00..22:00 ONLY — closed Friday (day 5)!
    { open: { day: 6, hour: 17, minute: 0 }, close: { day: 6, hour: 22, minute: 0 } },
  ],
  lat: 27.95,
  lng: -82.46,
  source: "editorial_curated",
  verifiedAt: "2026-11-12T12:00:00Z",
});

const openFridayOwnedHours = buildOwnedHoursRecord({
  periods: [
    // Open Friday (day 5) 17:00..23:00!
    { open: { day: 5, hour: 17, minute: 0 }, close: { day: 5, hour: 23, minute: 0 } },
  ],
  lat: 27.95,
  lng: -82.46,
  source: "editorial_curated",
  verifiedAt: "2026-11-12T12:00:00Z",
});

const fixtures = [
  {
    id: "fx-confirmed-tonight",
    kind: "event",
    title: "Confirmed Friday Light Walk",
    start_date: "2026-11-10",
    end_date: "2026-12-30",
    occurrence_dates: ["2026-11-13", "2026-11-14"],
    start_time: "18:00:00",
    season_undated: false,
  },
  {
    id: "fx-hours-unverified-tonight",
    kind: "event",
    title: "Continuous Downtown Lights",
    start_date: "2026-11-10",
    end_date: "2026-12-31",
    season_undated: false,
  },
  {
    id: "fx-future-after-tg",
    kind: "event",
    title: "Post Thanksgiving Wonderland",
    start_date: "2026-11-27",
    end_date: "2026-12-31",
    season_undated: false,
  },
  {
    id: "fx-future-saturday",
    kind: "event",
    title: "Saturday Tree Lighting",
    start_date: "2026-11-14",
    end_date: "2026-11-14",
    start_time: "19:00:00",
    season_undated: false,
  },
  {
    id: "fx-select-nights-unproven",
    kind: "event",
    title: "Select Nights Mystery Run",
    start_date: "2026-11-07",
    end_date: "2026-12-24",
    select_nights: true,
    dayRule: { k: "r", x: [] },
    season_undated: false,
  },
  {
    id: "fx-undated",
    kind: "event",
    title: "TBA Holiday Market",
    start_date: null,
    end_date: null,
    season_undated: true,
  },
  {
    id: "fx-permanent-venue",
    kind: "place",
    title: "Year Round Christmas Shoppe",
    start_date: null,
    end_date: null,
    season_undated: true,
    hospitalityEvidence: { status: "permanent_verified" },
  },
  {
    id: "fx-place-closed-friday-oh",
    kind: "place",
    title: "Saturday Only Holiday Bar",
    start_date: "2026-11-01",
    end_date: "2026-12-31",
    season_undated: false,
    ownedHours: closedFridayOwnedHours,
  },
  {
    id: "fx-place-open-friday-oh",
    kind: "place",
    title: "Open Tonight Holiday Bar",
    start_date: "2026-11-01",
    end_date: "2026-12-31",
    season_undated: false,
    ownedHours: openFridayOwnedHours,
  },
  {
    id: "fx-tour",
    kind: "tour",
    title: "Golf Cart Lights Tour",
    tourRow: { id: "64386P4" },
  },
];

// Confirmed vs hours-unverified distinction
const stConfirmed = evaluateChristmasTemporalStatus(fixtures[0], TODAY, { nowMs: NOW_MS });
ok(
  stConfirmed.openTonight === true &&
    stConfirmed.confirmedOpenTonight === true &&
    stConfirmed.hoursUnverified === false &&
    stConfirmed.temporalBadge === "Open tonight",
  "explicit occurrence + start_time is confirmed Open tonight",
);

const stUnverified = evaluateChristmasTemporalStatus(fixtures[1], TODAY, { nowMs: NOW_MS });
ok(
  stUnverified.openTonight === true &&
    stUnverified.confirmedOpenTonight === false &&
    stUnverified.hoursUnverified === true &&
    stUnverified.temporalBadge === "Active tonight · check hours",
  "continuous run without clock hours is Active tonight · check hours",
);

// Future item NEVER leaks into tonight, IS in opening-soon
const stAfterTg = evaluateChristmasTemporalStatus(fixtures[2], TODAY, { nowMs: NOW_MS });
ok(
  stAfterTg.openTonight === false &&
    stAfterTg.openingSoon === true &&
    stAfterTg.temporalBadge === "Opens Nov 27 · after Thanksgiving",
  "post-Thanksgiving event is Opening soon with after-Thanksgiving badge, never Open tonight",
);

// Event starting tomorrow (Saturday Nov 14) is NOT open tonight, IS open this weekend AND opening soon!
const stSat = evaluateChristmasTemporalStatus(fixtures[3], TODAY, { nowMs: NOW_MS });
ok(
  stSat.openTonight === false && stSat.openThisWeekend === true && stSat.openingSoon === true,
  "Saturday Nov 14 event on Friday Nov 13: not tonight, yes weekend, yes opening soon",
);

// Unproven mid-run select-nights envelope NEVER leaks into tonight
const stSelect = evaluateChristmasTemporalStatus(fixtures[4], TODAY, { nowMs: NOW_MS });
ok(stSelect.openTonight === false, "select_nights with restricted dayRule never claims Open tonight mid-run");

// Undated & permanent undated venues NEVER leak into tonight
ok(evaluateChristmasTemporalStatus(fixtures[5], TODAY, { nowMs: NOW_MS }).openTonight === false, "undated season never Open tonight");
const stPerm = evaluateChristmasTemporalStatus(fixtures[6], TODAY, { nowMs: NOW_MS });
ok(
  stPerm.openTonight === false && stPerm.state === "permanent_holiday_venue" && !CHRISTMAS_DASH_RX.test(stPerm.temporalBadge),
  "permanent undated venue is labeled honestly and excluded from Open tonight",
);

// Owned hours veto vs confirmation
const stClosedOh = evaluateChristmasTemporalStatus(fixtures[7], TODAY, { nowMs: NOW_MS });
ok(stClosedOh.openTonight === false, "venue whose ownedHours prove Friday evening closed is vetoed from Open tonight");
const stOpenOh = evaluateChristmasTemporalStatus(fixtures[8], TODAY, { nowMs: NOW_MS });
ok(
  stOpenOh.openTonight === true && stOpenOh.confirmedOpenTonight === true && stOpenOh.temporalBadge === "Open tonight",
  "venue whose ownedHours confirm Friday evening open is confirmed Open tonight",
);

// Tour stays in All Christmas, excluded from tonight/weekend/opening-soon
const stTour = evaluateChristmasTemporalStatus(fixtures[9], TODAY, { nowMs: NOW_MS });
ok(
  !stTour.openTonight && !stTour.openThisWeekend && !stTour.openingSoon && matchesChristmasTemporalMode(fixtures[9], "all", TODAY),
  "Viator tour stays in All Christmas and never claims a fixed calendar date",
);

// ── 3. Real 2026 statewide Christmas corpus verification ────────────────────
const realListings = christmasBrowseListings([], TODAY);
ok(realListings.length >= 450, `loaded real statewide Christmas corpus (${realListings.length})`);

const tonightCards = filterChristmasBrowse(realListings, parseChristmasBrowseQuery({ when: "tonight" }), TODAY);
const weekendCards = filterChristmasBrowse(realListings, parseChristmasBrowseQuery({ when: "weekend" }), TODAY);
const openingSoonCards = filterChristmasBrowse(realListings, parseChristmasBrowseQuery({ when: "opening-soon" }), TODAY);
const allPage = christmasBrowsePage(realListings, parseChristmasBrowseQuery({}), TODAY);

ok(tonightCards.length > 0 && tonightCards.length < realListings.length, `Open tonight is a strict subset (${tonightCards.length} of ${realListings.length})`);
ok(openingSoonCards.length >= 100, `Opening soon preserves hundreds of future Christmas listings (${openingSoonCards.length})`);
ok(weekendCards.length >= tonightCards.length || weekendCards.length > 0, `Weekend mode returns active weekend inventory (${weekendCards.length})`);
ok(allPage.total === realListings.length, `All Christmas preserves full statewide inventory (${allPage.total})`);

// Zero future-only or undated items in Open tonight!
for (const c of tonightCards) {
  ok(!c.season_undated, `${c.id}: undated item leaked into Open tonight`);
  ok(!(c.start_date && c.start_date > TODAY), `${c.id}: future start_date (${c.start_date}) leaked into Open tonight`);
  if (Array.isArray(c.occurrence_dates) && c.occurrence_dates.length) {
    ok(c.occurrence_dates.includes(TODAY), `${c.id}: occurrence_dates without ${TODAY} leaked into Open tonight`);
  }
  ok(!CHRISTMAS_DASH_RX.test(c.temporalBadge || ""), `${c.id}: temporalBadge "${c.temporalBadge}" is dash-free`);
}

// Every future-only item in Opening soon starts strictly after TODAY!
for (const c of openingSoonCards) {
  ok(!c.season_undated, `${c.id}: undated item leaked into Opening soon`);
  const startsFuture =
    (c.start_date && c.start_date > TODAY) ||
    (Array.isArray(c.occurrence_dates) && c.occurrence_dates.length > 0 && c.occurrence_dates[0] > TODAY);
  ok(startsFuture, `${c.id}: non-future item leaked into Opening soon`);
  ok(!tonightCards.some((t) => t.id === c.id), `${c.id}: item cannot be both Open tonight and Opening soon`);
  ok(!CHRISTMAS_DASH_RX.test(c.temporalBadge || ""), `${c.id}: temporalBadge "${c.temporalBadge}" is dash-free`);
}

// Counts match exact filter totals
const counts = computeChristmasTemporalCounts(realListings, TODAY);
ok(
  counts.all === realListings.length &&
    counts.tonight === tonightCards.length &&
    counts.openingSoon === openingSoonCards.length &&
    counts.tonightConfirmed + counts.tonightHoursUnverified === counts.tonight,
  "computeChristmasTemporalCounts matches exact mode filter counts",
);

// ── 4. Component SSR check: temporal bar + dash-free badge rendering ────────
const { default: ChristmasBrowse, ChristmasBrowseCard } = await loadComponent(
  path.join(process.cwd(), "app/components/ChristmasBrowse.js"),
  process.cwd(),
);
const facets = { regions: [], categories: [], pills: [], dates: CHRISTMAS_BROWSE_DATES, prices: [], audiences: [] };
const browseHtml = renderToStaticMarkup(
  createElement(ChristmasBrowse, { initial: allPage, facets, today: TODAY }),
);
ok(
  browseHtml.includes('data-christmas-temporal-modes=""') &&
    browseHtml.includes('data-temporal-mode="tonight"') &&
    browseHtml.includes('data-temporal-mode="weekend"') &&
    browseHtml.includes('data-temporal-mode="opening-soon"') &&
    browseHtml.includes("Open tonight") &&
    browseHtml.includes("Opening soon"),
  "ChristmasBrowse renders the 4-mode temporal switcher bar",
);

const sampleFutureCard = christmasBrowsePage(realListings, parseChristmasBrowseQuery({ when: "opening-soon" }), TODAY).cards[0];
const cardHtml = renderToStaticMarkup(createElement(ChristmasBrowseCard, { card: sampleFutureCard, rank: 1, today: TODAY }));
ok(
  cardHtml.includes('class="xm-temporal"') && cardHtml.includes("Opens "),
  "Future Christmas card renders truthful Opens badge on TicketCard",
);
ok(!CHRISTMAS_DASH_RX.test(formatOpeningSoonBadge("2026-11-28")), "formatOpeningSoonBadge is dash-free");

if (RED_PROVE) {
  // Simulate regression where a future Dec 5 event leaks into Open tonight
  const leaked = [...tonightCards, { id: "leaked-future", start_date: "2026-12-05", season_undated: false }];
  assert.ok(
    leaked.every((c) => !(c.start_date && c.start_date > TODAY)),
    "RED_PROVE: caught future Christmas item leaking into Open tonight!",
  );
}

console.log(
  `test-christmas-temporal-modes: PASS (${checks} assertions; tonight=${counts.tonight} [confirmed=${counts.tonightConfirmed}, unverified=${counts.tonightHoursUnverified}], weekend=${counts.weekend}, openingSoon=${counts.openingSoon}, all=${counts.all})`,
);
