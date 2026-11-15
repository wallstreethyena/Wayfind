// lib/christmasTemporalModes.js — Missions 14 & 15 Strict Christmas Temporal Modes.
//
// Hardens the boundary between ACTIVE TONIGHT, OPEN THIS WEEKEND, OPENING SOON,
// and ALL CHRISTMAS on `/christmas-in-florida` and `/api/christmas/browse`:
//   - `tonight` (`OPEN TONIGHT`): requires a dated season (`!season_undated`),
//     an active run window covering `today`, an active day rule / explicit
//     occurrence date for `today`, and no contradiction from verified `ownedHours`.
//     Distinguishes `confirmedOpenTonight` ("Open tonight") from `hoursUnverified`
//     ("Active tonight · check hours"). Future-only items (`start_date > today`),
//     undated season rows, unverified select-night envelopes, permanent undated
//     venues, and undated tours NEVER appear in `tonight`.
//   - `weekend` (`OPEN THIS WEEKEND`): active on the upcoming Fri–Sun window.
//   - `opening-soon` (`OPENING SOON`): future seasonal inventory (`start_date > today`
//     or first occurrence `> today`) preserved cleanly with truthful start badges
//     ("Opens Nov 20", "Opens Thanksgiving week", "Opens in December").
//   - `""` / `all` (`ALL CHRISTMAS`): full statewide Christmas directory with
//     honest temporal status badges on every card.
//
// NOTE: All user-facing copy in this module is strictly dash-free (`CHRISTMAS_DASH_RX`
// compliant: zero en-dashes, em-dashes, spaced hyphens, or digit-range hyphens).

import { compactRuleAllows } from "./scheduleNoteDays.js";
import { evaluateOwnedHoursStatus, isUsableOwnedHours } from "./ownedHours.js";
import { CHRISTMAS_SEASON_END } from "./christmasIntentRails.js";

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EXPLICIT_TIME_RX = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)\b/i;

export const CHRISTMAS_TEMPORAL_MODES = Object.freeze([
  Object.freeze({ id: "", code: "all", label: "All Christmas" }),
  Object.freeze({ id: "tonight", code: "tonight", label: "Open tonight" }),
  Object.freeze({ id: "weekend", code: "weekend", label: "Open this weekend" }),
  Object.freeze({ id: "opening-soon", code: "opening-soon", label: "Opening soon" }),
]);

function addDaysIso(d, n) {
  const [y, m, day] = String(d).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return (
    t.getUTCFullYear() +
    "-" +
    String(t.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(t.getUTCDate()).padStart(2, "0")
  );
}

function weekdayUtc(d) {
  const [y, m, day] = String(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

export function shortMonthDay(iso) {
  if (!DATE_RX.test(String(iso || ""))) return "";
  const m = Number(String(iso).slice(5, 7));
  const d = Number(String(iso).slice(8, 10));
  if (!SHORT_MONTHS[m] || !(d >= 1 && d <= 31)) return "";
  return `${SHORT_MONTHS[m]} ${d}`;
}

export function weekendWindowFor(today) {
  if (!DATE_RX.test(String(today || ""))) return null;
  const wd = weekdayUtc(today);
  const fri = wd === 0 ? addDaysIso(today, -2) : wd === 6 ? addDaysIso(today, -1) : addDaysIso(today, 5 - wd);
  const from = fri < today ? today : fri;
  return [from, addDaysIso(fri, 2)];
}

function thanksgivingIso(year = 2026) {
  // 4th Thursday of November
  const firstDow = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const day = 1 + ((4 - firstDow + 7) % 7) + 21;
  return `${year}-11-${String(day).padStart(2, "0")}`;
}

export function formatOpeningSoonBadge(startDate) {
  if (!DATE_RX.test(String(startDate || ""))) return "Opening soon";
  const label = shortMonthDay(startDate);
  const year = Number(startDate.slice(0, 4)) || 2026;
  const tg = thanksgivingIso(year);
  const afterTgEnd = addDaysIso(tg, 3);
  if (startDate > tg && startDate <= afterTgEnd) {
    return label ? `Opens ${label} · after Thanksgiving` : "Opens after Thanksgiving";
  }
  return label ? `Opens ${label}` : "Opening soon";
}

function hasExplicitEveningClock(card) {
  if (!card || typeof card !== "object") return false;
  if (typeof card.start_time === "string" && /^\d{2}:\d{2}/.test(card.start_time)) return true;
  if (typeof card.overnightUntil === "string" && card.overnightUntil) return true;
  const candidates = [
    card.when?.value,
    card.when?.label,
    card.schedule?.title,
    card.schedule?.label,
    card.seasonalWhen,
  ];
  return candidates.some((s) => typeof s === "string" && EXPLICIT_TIME_RX.test(s));
}

/**
 * Checks whether owned structured venue hours prove the venue is closed all
 * evening on `today` (probing 18:00, 20:00, and 21:30 Eastern) or confirm it is open.
 * Returns `{ hasOwnedHours: boolean, openAnyEveningSlot: boolean }`.
 */
function checkEveningOwnedHours(card, today, nowMs = Date.now()) {
  const oh = card?.ownedHours || card?.signals?.owned_hours || null;
  if (!oh || !isUsableOwnedHours(oh, nowMs)) {
    return { hasOwnedHours: false, openAnyEveningSlot: false };
  }
  // Standard Time in Nov/Dec/Jan is UTC-5 (18:00 ET = 23:00Z, 20:00 ET = +1d 01:00Z, 21:30 ET = +1d 02:30Z).
  // Evaluate across 3 representative evening instants for `today` in America/New_York.
  const nextDay = addDaysIso(today, 1);
  const probes = [
    Date.parse(`${today}T23:00:00Z`),
    Date.parse(`${nextDay}T01:00:00Z`),
    Date.parse(`${nextDay}T02:30:00Z`),
  ];
  let anyKnown = false;
  let anyOpen = false;
  for (const ts of probes) {
    if (!Number.isFinite(ts)) continue;
    const ev = evaluateOwnedHoursStatus(oh, ts);
    if (ev && ev.state !== "unknown") {
      anyKnown = true;
      if (ev.open === true) anyOpen = true;
    }
  }
  return { hasOwnedHours: anyKnown, openAnyEveningSlot: anyOpen };
}

function activeInWindow(card, [from, to]) {
  if (!card || card.season_undated || card.kind === "tour") return false;
  if (Array.isArray(card.occurrence_dates) && card.occurrence_dates.length) {
    return card.occurrence_dates.some((d) => DATE_RX.test(d) && d >= from && d <= to);
  }
  if (card.hospitalityEvidence && card.select_nights) return false;
  if (!DATE_RX.test(String(card.start_date || ""))) return false;
  const end = card.end_date || (card.closing_unannounced ? CHRISTMAS_SEASON_END : card.start_date);
  if (!(card.start_date <= to && end >= from)) return false;
  if (!card.dayRule) {
    // Select-nights row without an explicit dayRule only proves its opening night.
    if (card.select_nights) return card.start_date >= from && card.start_date <= to;
    return true;
  }
  const lo = from > card.start_date ? from : card.start_date;
  const hi = end < to ? end : to;
  for (let d = lo; d <= hi; d = addDaysIso(d, 1)) {
    if (compactRuleAllows(card.dayRule, d, card.start_date)) return true;
  }
  return false;
}

/**
 * Computes deterministic temporal eligibility and dash-free user-facing status
 * for a Christmas browse card on Eastern date `today`.
 */
export function evaluateChristmasTemporalStatus(card, today, { nowMs = Date.now() } = {}) {
  if (!card || typeof card !== "object" || !DATE_RX.test(String(today || ""))) {
    return {
      state: "unknown",
      openTonight: false,
      confirmedOpenTonight: false,
      hoursUnverified: false,
      openThisWeekend: false,
      openingSoon: false,
      opensOn: null,
      temporalBadge: "",
    };
  }

  // 1. Viator tours have live external calendars rather than owned fixed dates.
  if (card.kind === "tour") {
    return {
      state: "tour_live_calendar",
      openTonight: false,
      confirmedOpenTonight: false,
      hoursUnverified: false,
      openThisWeekend: false,
      openingSoon: false,
      opensOn: null,
      temporalBadge: "See live availability",
    };
  }

  // 2. Undated seasonal rows & permanent holiday venues without a dated 2026 run.
  if (card.season_undated === true) {
    const isPermanent = card.hospitalityEvidence?.status === "permanent_verified";
    return {
      state: isPermanent ? "permanent_holiday_venue" : "dates_unannounced",
      openTonight: false,
      confirmedOpenTonight: false,
      hoursUnverified: false,
      openThisWeekend: false,
      openingSoon: false,
      opensOn: null,
      temporalBadge: isPermanent ? "Year round holiday spot" : "2026 dates TBA",
    };
  }

  const weekendWin = weekendWindowFor(today);
  const openThisWeekend = weekendWin ? activeInWindow(card, weekendWin) : false;
  const occ = Array.isArray(card.occurrence_dates)
    ? card.occurrence_dates.filter((d) => DATE_RX.test(d)).sort()
    : [];
  const firstDate = occ.length ? occ[0] : DATE_RX.test(String(card.start_date || "")) ? card.start_date : null;

  // 3. Future-only seasonal inventory (`OPENING SOON`) — NEVER leaks into `OPEN TONIGHT`.
  if (
    (DATE_RX.test(String(card.start_date || "")) && card.start_date > today) ||
    (occ.length > 0 && occ[0] > today)
  ) {
    const opensOn = occ.length && occ[0] > today ? occ[0] : card.start_date;
    return {
      state: "opening_soon",
      openTonight: false,
      confirmedOpenTonight: false,
      hoursUnverified: false,
      openThisWeekend,
      openingSoon: true,
      opensOn,
      temporalBadge: formatOpeningSoonBadge(opensOn),
    };
  }

  // 4. Evaluate strict `OPEN TONIGHT` eligibility (`start_date <= today <= end_date`).
  let dateAndScheduleActiveTonight = false;
  let explicitTonightSchedule = false;

  if (occ.length > 0) {
    if (occ.includes(today)) {
      dateAndScheduleActiveTonight = true;
      explicitTonightSchedule = true;
    }
  } else if (DATE_RX.test(String(card.start_date || ""))) {
    const end = card.end_date || (card.closing_unannounced ? CHRISTMAS_SEASON_END : card.start_date);
    if (card.start_date <= today && end >= today) {
      if (card.hospitalityEvidence && card.select_nights) {
        dateAndScheduleActiveTonight = false;
      } else if (card.select_nights && (!card.dayRule || card.dayRule.k === "r") && card.start_date !== today) {
        dateAndScheduleActiveTonight = false;
      } else if (card.dayRule && !compactRuleAllows(card.dayRule, today, card.start_date)) {
        dateAndScheduleActiveTonight = false;
      } else {
        dateAndScheduleActiveTonight = true;
        explicitTonightSchedule =
          (card.start_date === today && end === today) ||
          Boolean(card.dayRule && (card.dayRule.k === "l" || card.dayRule.k === "w"));
      }
    }
  }

  if (dateAndScheduleActiveTonight) {
    const eveningOh = checkEveningOwnedHours(card, today, nowMs);
    if (eveningOh.hasOwnedHours && !eveningOh.openAnyEveningSlot) {
      // Venue's verified structured hours prove it is closed tonight!
      return {
        state: openThisWeekend ? "open_this_weekend" : "closed_tonight",
        openTonight: false,
        confirmedOpenTonight: false,
        hoursUnverified: false,
        openThisWeekend,
        openingSoon: false,
        opensOn: firstDate,
        temporalBadge: openThisWeekend ? "Open this weekend" : "Closed tonight",
      };
    }

    const confirmedClock = eveningOh.openAnyEveningSlot || hasExplicitEveningClock(card) || (card.start_date === today && card.end_date === today);
    const confirmedOpenTonight = Boolean(confirmedClock || (explicitTonightSchedule && hasExplicitEveningClock(card)));
    const hoursUnverified = !confirmedOpenTonight;

    return {
      state: confirmedOpenTonight ? "open_tonight_confirmed" : "open_tonight_hours_unverified",
      openTonight: true,
      confirmedOpenTonight,
      hoursUnverified,
      openThisWeekend,
      openingSoon: false,
      opensOn: firstDate,
      temporalBadge: confirmedOpenTonight ? "Open tonight" : "Active tonight · check hours",
    };
  }

  // 5. Mid-run listing not active tonight (e.g., weekend-only or between select nights).
  const nextOcc = occ.find((d) => d > today) || null;
  let badge = "Select nights · check dates";
  if (openThisWeekend) {
    badge = "Open this weekend";
  } else if (nextOcc) {
    const md = shortMonthDay(nextOcc);
    badge = md ? `Next night ${md}` : "Select nights · check dates";
  }

  return {
    state: openThisWeekend ? "open_this_weekend" : "in_season_other_nights",
    openTonight: false,
    confirmedOpenTonight: false,
    hoursUnverified: false,
    openThisWeekend,
    openingSoon: false,
    opensOn: nextOcc || firstDate,
    temporalBadge: badge,
  };
}

/**
 * Matches a card against a requested Christmas temporal mode (`when` parameter).
 */
export function matchesChristmasTemporalMode(card, mode, today, options = {}) {
  const m = String(mode || "").trim().toLowerCase();
  if (!m || m === "all") return true;
  const status = card?.temporalStatus || evaluateChristmasTemporalStatus(card, today, options);
  if (m === "tonight") return status.openTonight === true;
  if (m === "weekend") return status.openThisWeekend === true;
  if (m === "opening-soon") return status.openingSoon === true;
  return null; // caller falls back to legacy calendar window (`next7`, `nov`, `dec`, `jan`)
}

/**
 * Summarizes counts across all 4 strict Christmas temporal modes for UI tabs & Ops health.
 */
export function computeChristmasTemporalCounts(listings, today, options = {}) {
  const rows = Array.isArray(listings) ? listings : [];
  let tonight = 0;
  let tonightConfirmed = 0;
  let tonightHoursUnverified = 0;
  let weekend = 0;
  let openingSoon = 0;
  let undated = 0;

  for (const card of rows) {
    const st = card?.temporalStatus || evaluateChristmasTemporalStatus(card, today, options);
    if (st.openTonight) {
      tonight++;
      if (st.confirmedOpenTonight) tonightConfirmed++;
      else if (st.hoursUnverified) tonightHoursUnverified++;
    }
    if (st.openThisWeekend) weekend++;
    if (st.openingSoon) openingSoon++;
    if (card?.season_undated) undated++;
  }

  return {
    all: rows.length,
    tonight,
    tonightConfirmed,
    tonightHoursUnverified,
    weekend,
    openingSoon,
    undated,
  };
}
