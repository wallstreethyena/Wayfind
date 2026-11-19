// lib/mapDecisionEngine.js — Contextual Spatial Decision Engine for the Wayfind Map.
//
// CORE LAW:
// 1. Public Wayfind Score (`governed_score` / `toDisplayScore`) is NEVER modified here.
// 2. Zero commercial, affiliate, ticket-commission, or sponsored signals ever enter
//    `mapDecisionScore` or `evaluateMapCandidate`.
// 3. In default ranking mode, `governed_score` remains strictly monotonic (`Shown == Sorted`),
//    while `mapDecisionScore` breaks ties inside each 0.1 Wayfind Score band.
// 4. Explicit Moment Lenses (`open_now`, `tonight`, `rain_safe`, `christmas`, `free`)
//    act as honest pre-sort eligibility gates backed by real evidence.
import { businessStatus, isOperational } from "./businessStatus.js";
import { toDisplayScore } from "./score.js";
import { byGovernedScore, governedScoreOf } from "./lawfulOrder.js";
import { siteHourFloat, bucketForHour, HEAT_ADVISORY_F, WET_RAIN_PCT } from "./nowContext.js";
import { siteTodayStr } from "./siteTime.js";
import { venueLean, coarseCat, humanTypeFallback } from "./ranking.js";
import { eventVisitStatus, eventLocalClock, eventClockMinutes, eventClockLabel, eventMonthDay } from "./eventVisitFacts.js";
import { cleanOccurrences } from "./eventOccurrenceDays.js";
import { scheduleWeekdays, scheduleRule, signalsRestriction } from "./scheduleNoteDays.js";
export const GOOGLE_HOURS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function floridaTimezoneForCoords(lat, lng) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat >= 24.3 && lat <= 31.5 && lng >= -87.7 && lng <= -79.8) {
      return lng < -85.35 ? "America/Chicago" : "America/New_York";
    }
  }
  return "America/New_York";
}

export function utcOffsetMinutesForTimezone(timeZone = "America/New_York", nowMs = Date.now()) {
  try {
    const d = new Date(nowMs);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      year: "numeric",
    }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(tzPart.trim());
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      const hrs = Number(m[2]) || 0;
      const mins = Number(m[3]) || 0;
      return sign * (hrs * 60 + mins);
    }
  } catch {}
  return timeZone === "America/Chicago" ? -360 : -300;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

export function detectSpecialHoursUncertainty(nowMs = Date.now(), timeZone = "America/New_York") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(new Date(nowMs));
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);
    const weekday = map.weekday;

    if (month === 1 && day === 1) return { uncertain: true, holiday: "New Year's Day" };
    if (month === 7 && day === 4) return { uncertain: true, holiday: "Independence Day" };
    if (month === 12 && day === 24) return { uncertain: true, holiday: "Christmas Eve" };
    if (month === 12 && day === 25) return { uncertain: true, holiday: "Christmas Day" };
    if (month === 12 && day === 31) return { uncertain: true, holiday: "New Year's Eve" };
    if (month === 5 && weekday === "Mon" && day >= 25 && day <= 31) return { uncertain: true, holiday: "Memorial Day" };
    if (month === 9 && weekday === "Mon" && day >= 1 && day <= 7) return { uncertain: true, holiday: "Labor Day" };
    if (month === 11 && weekday === "Thu" && day >= 22 && day <= 28) {
      return { uncertain: true, holiday: "Thanksgiving" };
    }
    if (month === 11 && weekday === "Fri" && day >= 23 && day <= 29) {
      return { uncertain: true, holiday: "Black Friday" };
    }
    if (year >= 2020 && year <= 2040) {
      const easter = easterSunday(year);
      if (month === easter.month && day === easter.day) {
        return { uncertain: true, holiday: "Easter" };
      }
    }
  } catch {}
  return { uncertain: false, holiday: null };
}

function sanitizePeriods(periods) {
  if (!Array.isArray(periods) || !periods.length) return null;
  const out = [];
  for (const p of periods) {
    if (!p || typeof p !== "object" || !p.open || typeof p.open !== "object") continue;
    const oDay = Number(p.open.day);
    const oHr = Number(p.open.hour ?? 0);
    const oMin = Number(p.open.minute ?? 0);
    if (!Number.isInteger(oDay) || oDay < 0 || oDay > 6) continue;
    if (!Number.isInteger(oHr) || oHr < 0 || oHr > 23) continue;
    if (!Number.isInteger(oMin) || oMin < 0 || oMin > 59) continue;

    if (!p.close || typeof p.close !== "object") {
      out.push({ open: { day: oDay, hour: oHr, minute: oMin } });
      continue;
    }
    const cDay = Number(p.close.day);
    const cHr = Number(p.close.hour ?? 0);
    const cMin = Number(p.close.minute ?? 0);
    if (!Number.isInteger(cDay) || cDay < 0 || cDay > 6) continue;
    if (!Number.isInteger(cHr) || cHr < 0 || cHr > 23) continue;
    if (!Number.isInteger(cMin) || cMin < 0 || cMin > 59) continue;
    out.push({
      open: { day: oDay, hour: oHr, minute: oMin },
      close: { day: cDay, hour: cHr, minute: cMin },
    });
  }
  return out.length ? out : null;
}

export function isUsableOwnedHours(ownedHours, nowMs = Date.now()) {
  if (!ownedHours || typeof ownedHours !== "object") return false;
  if (ownedHours.alwaysOpen !== true) {
    const periods = sanitizePeriods(ownedHours.periods);
    if (!periods) return false;
  }
  if (ownedHours.expiresAt) {
    const exp = Date.parse(ownedHours.expiresAt);
    if (!Number.isFinite(exp) || exp <= nowMs) return false;
  } else if (ownedHours.source === "google_places") {
    const ver = Date.parse(ownedHours.verifiedAt);
    if (!Number.isFinite(ver) || nowMs - ver >= GOOGLE_HOURS_MAX_AGE_MS) return false;
  }
  return true;
}
import { toHookLine } from "./editorialHook.js";
import { estimateFloridaDrive } from "./mapRouting.js";
import { placeInMapBounds, mapCategoryMatches, MAP_MIN_SCORE } from "./mapAreaData.js";

export const MAP_MOMENT_LENSES = Object.freeze([
  { id: "open_now", label: "Open now" },
  { id: "tonight", label: "Tonight" },
  { id: "rain_safe", label: "Rain-safe" },
  { id: "christmas", label: "Christmas" },
  { id: "free", label: "Free" },
]);

const CHRISTMAS_RX = /\b(christmas|holiday lights?|santa|nutcracker|jingle|winter wonderland|candlelight|boat parade|dazzling nights|luminaria|ice!|mickey'?s very merry|holly jolly|tinsel|noel)\b/i;
const FREE_TYPE_SET = new Set(["park", "beach", "state_park", "national_park", "nature_preserve", "hiking_area", "plaza", "playground", "dog_park", "garden"]);
const NIGHT_FRIENDLY_RX = /\b(bar|cocktail|wine_bar|brewery|pub|night_club|performing_arts_theater|concert_hall|movie_theater|bowling_alley|restaurant|steak_house|seafood_restaurant|italian_restaurant|sushi_restaurant|dessert_shop|ice_cream_shop)\b/i;
const MORNING_FRIENDLY_RX = /\b(cafe|coffee_shop|bakery|breakfast_restaurant|brunch_restaurant|park|beach|botanical_garden|hiking_area|museum|zoo|aquarium)\b/i;
const DAYTIME_ONLY_OUTDOOR_RX = /\b(nature_preserve|hiking_area|state_park|wildlife_park|playground|dog_park|botanical_garden)\b/i;

export function minUsefulVisitMinutes(place) {
  const hay = [
    place?.primaryType,
    place?.category,
    ...(Array.isArray(place?.types) ? place.types : []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(theme_park|amusement_park|water_park|zoo|aquarium)\b/.test(hay)) return 90;
  if (/\b(museum|art_gallery|botanical_garden|performing_arts_theater|movie_theater)\b/.test(hay)) return 55;
  if (/\b(cafe|coffee_shop|bakery|ice_cream_shop|dessert_shop|donut_shop)\b/.test(hay)) return 15;
  if (/\b(restaurant|bar|brewery|steak_house|seafood_restaurant|wine_bar|bowling_alley)\b/.test(hay)) return 35;
  return 25;
}

export function resolveMapDaypart(nowMs = Date.now(), sunsetMs = null) {
  const hour = siteHourFloat(new Date(nowMs));
  const baseBucket = bucketForHour(hour);
  if (Number.isFinite(sunsetMs)) {
    const minsToSunset = Math.round((sunsetMs - nowMs) / 60000);
    if (minsToSunset >= -20 && minsToSunset <= 70) {
      return { phase: "sunset", bucket: baseBucket, hour, minsToSunset };
    }
  }
  if (hour >= 0 && hour < 5) return { phase: "after_midnight", bucket: "night", hour, minsToSunset: null };
  if (hour >= 22.5) return { phase: "late_night", bucket: "night", hour, minsToSunset: null };
  if (hour >= 18) return { phase: "evening", bucket: "night", hour, minsToSunset: null };
  if (hour >= 16.5 && hour < 18) return { phase: "sunset", bucket: baseBucket, hour, minsToSunset: null };
  if (hour >= 11.5) return { phase: "afternoon", bucket: "afternoon", hour, minsToSunset: null };
  return { phase: "morning", bucket: "morning", hour, minsToSunset: null };
}

export function evaluateHoursAndFeasibility(place, driveEstimate = null, nowMs = Date.now()) {
  const tz = place?.timezone || place?.ownedHours?.timezone || floridaTimezoneForCoords(place?.lat, place?.lng);
  const resolvedOffset = place?.utcOffset != null
    ? place.utcOffset
    : (place?.utcOffsetMinutes != null
      ? place.utcOffsetMinutes
      : (place?.ownedHours?.utcOffsetMinutes != null
        ? place.ownedHours.utcOffsetMinutes
        : utcOffsetMinutesForTimezone(tz, nowMs)));

  const driveMin = driveEstimate && Number.isFinite(driveEstimate.driveMinEst) ? driveEstimate.driveMinEst : 10;
  const minVisitMin = minUsefulVisitMinutes(place);
  const neededMin = driveMin + minVisitMin;

  const owned = place?.ownedHours || place?.signals?.owned_hours || null;
  const hasOwned = Boolean(owned && typeof owned === "object");

  // Case 6: Exceptional closure
  if (hasOwned && owned.specialHoursClosure === true) {
    return {
      state: "closed",
      confirmedOpen: false,
      hoursUnconfirmed: false,
      alwaysOpen: false,
      closingFeasible: false,
      minutesUntilOpen: null,
      openLabel: null,
    };
  }

  // Case 6: Special-hours uncertainty / major holiday
  const holidayCheck = detectSpecialHoursUncertainty(nowMs, tz);
  const isHolidayUncertain = (holidayCheck.uncertain || owned?.specialHoursUncertainty === true || place?.specialHoursUncertainty === true)
    && !place?.holidayHoursConfirmed && !owned?.holidayHoursConfirmed;
  if (isHolidayUncertain) {
    return {
      state: "hours_unconfirmed",
      confirmedOpen: false,
      hoursUnconfirmed: true,
      alwaysOpen: false,
      closingFeasible: false,
      specialHoursUncertainty: true,
      holidayName: holidayCheck.holiday || null,
      minutesUntilClose: null,
      closeLabel: null,
    };
  }

  // Check owned hours validity if present
  let usableOwned = false;
  if (hasOwned) {
    usableOwned = isUsableOwnedHours(owned, nowMs) || owned.alwaysOpen === true;
    if (!usableOwned && !place?.oh && !place?.regularOpeningHours) {
      return {
        state: "hours_unconfirmed",
        confirmedOpen: false,
        hoursUnconfirmed: true,
        alwaysOpen: false,
        closingFeasible: true,
        minutesUntilClose: null,
        closeLabel: null,
      };
    }
  }

  // Check Google-sourced hours age (AGENTS.md §8: 30-day strict ToS max) if owned hours not used
  const rawGoogleOh = !usableOwned ? (place?.oh || place?.regularOpeningHours || null) : null;
  if (rawGoogleOh) {
    const hoursAsOfMs = place?.hoursAsOf != null
      ? (typeof place.hoursAsOf === "number" ? place.hoursAsOf : Date.parse(place.hoursAsOf))
      : (place?.refreshed_at ? Date.parse(place.refreshed_at) : null);
    if (hoursAsOfMs != null && Number.isFinite(hoursAsOfMs)) {
      if (nowMs - hoursAsOfMs > 30 * 24 * 60 * 60 * 1000) {
        return {
          state: "hours_unconfirmed",
          confirmedOpen: false,
          hoursUnconfirmed: true,
          alwaysOpen: false,
          closingFeasible: true,
          minutesUntilClose: null,
          closeLabel: null,
        };
      }
    }
    if (place?.expiresAt && Date.parse(place.expiresAt) <= nowMs) {
      return {
        state: "hours_unconfirmed",
        confirmedOpen: false,
        hoursUnconfirmed: true,
        alwaysOpen: false,
        closingFeasible: true,
        minutesUntilClose: null,
        closeLabel: null,
      };
    }
  }

  const isAlwaysOpen = (usableOwned && owned.alwaysOpen === true) || place?.oh?.alwaysOpen === true;
  if (isAlwaysOpen) {
    return {
      state: "always_open",
      confirmedOpen: true,
      hoursUnconfirmed: false,
      alwaysOpen: true,
      closingFeasible: true,
      minutesUntilClose: null,
      closeLabel: null,
      neededMinutes: neededMin,
    };
  }

  const effectivePeriods = (usableOwned && Array.isArray(owned.periods))
    ? owned.periods
    : (place?.oh && Array.isArray(place.oh.periods))
      ? place.oh.periods
      : (place?.regularOpeningHours && Array.isArray(place.regularOpeningHours.periods))
        ? place.regularOpeningHours.periods
        : null;

  if (!effectivePeriods || !effectivePeriods.length) {
    return {
      state: "hours_unconfirmed",
      confirmedOpen: false,
      hoursUnconfirmed: true,
      alwaysOpen: false,
      closingFeasible: true,
      minutesUntilClose: null,
      closeLabel: null,
    };
  }

  const bs = businessStatus({
    ...place,
    oh: { periods: effectivePeriods },
    utcOffset: resolvedOffset,
    hoursAsOf: place?.hoursAsOf ?? (owned?.verifiedAt ? Date.parse(owned.verifiedAt) : null),
  }, nowMs);

  if (bs.open === true) {
    const closeInfo = bs.nextTransition && bs.nextTransition.type === "close" ? bs.nextTransition : null;
    const inMinutes = closeInfo && Number.isFinite(closeInfo.inMinutes) ? closeInfo.inMinutes : null;
    const alwaysOpen = inMinutes == null && bs.source === "live";
    if (inMinutes != null) {
      const feasible = inMinutes >= neededMin;
      const closingSoon = inMinutes <= 60;
      return {
        state: feasible ? (closingSoon ? "closing_soon" : "open") : "closing_infeasible",
        confirmedOpen: true,
        hoursUnconfirmed: false,
        alwaysOpen: false,
        closingFeasible: feasible,
        minutesUntilClose: inMinutes,
        closeLabel: closeInfo.label || null,
        neededMinutes: neededMin,
      };
    }
    return {
      state: alwaysOpen ? "always_open" : "open",
      confirmedOpen: true,
      hoursUnconfirmed: false,
      alwaysOpen,
      closingFeasible: true,
      minutesUntilClose: null,
      closeLabel: null,
      neededMinutes: neededMin,
    };
  }

  if (bs.open === false) {
    const openInfo = bs.nextTransition && bs.nextTransition.type === "open" ? bs.nextTransition : null;
    const opensSoon = !!(openInfo && openInfo.soon && openInfo.today);
    return {
      state: opensSoon ? "opens_soon" : "closed",
      confirmedOpen: false,
      hoursUnconfirmed: false,
      alwaysOpen: false,
      closingFeasible: false,
      minutesUntilOpen: openInfo ? openInfo.inMinutes : null,
      openLabel: openInfo ? openInfo.label : null,
    };
  }

  return {
    state: "hours_unconfirmed",
    confirmedOpen: false,
    hoursUnconfirmed: true,
    alwaysOpen: false,
    closingFeasible: true,
    minutesUntilClose: null,
    closeLabel: null,
  };
}

const EV_ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const EV_WEEKDAY_MAP = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };

function addIsoDays(iso, n) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function isoWeekday(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function toIsoSet(...lists) {
  const out = new Set();
  for (const list of lists) {
    if (!list) continue;
    for (const v of list) {
      const s = String(v || "").slice(0, 10);
      if (EV_ISO_DAY.test(s)) out.add(s);
    }
  }
  return out;
}

function toWeekdaySet(weekdays, weekdayHours) {
  const out = new Set();
  const list = weekdays instanceof Set ? [...weekdays] : (Array.isArray(weekdays) ? weekdays : []);
  for (const w of list) {
    if (Number.isInteger(w) && w >= 0 && w <= 6) out.add(w);
    else if (typeof w === "string") {
      const idx = EV_WEEKDAY_MAP[w.trim().toLowerCase()];
      if (idx != null) out.add(idx);
    }
  }
  if (weekdayHours && typeof weekdayHours === "object") {
    for (const [k, v] of Object.entries(weekdayHours)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && idx >= 0 && idx <= 6 && Array.isArray(v) && v.length > 0) out.add(idx);
    }
  }
  return out.size ? out : null;
}

function sessionWindowForDay(item, schedule, dayStr) {
  if (schedule?.date_hours && Object.hasOwn(schedule.date_hours, dayStr)) {
    const arr = schedule.date_hours[dayStr];
    return Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : null;
  }
  const dow = isoWeekday(dayStr);
  if (schedule?.weekday_hours) {
    const arr = schedule.weekday_hours[dow] ?? schedule.weekday_hours[String(dow)];
    if (Array.isArray(arr) && Array.isArray(arr[0])) return arr[0];
  }
  const st = schedule?.start_time ?? item.start_time ?? item.startTime ?? null;
  const et = schedule?.end_time ?? item.end_time ?? item.endTime ?? null;
  return (st || et) ? [st, et] : null;
}

function parseOvernightSession(item, schedule, dayStr) {
  const win = sessionWindowForDay(item, schedule, dayStr);
  if (!win) return null;
  const sMin = eventClockMinutes(win[0]);
  const eMin = eventClockMinutes(win[1]);
  if (eMin == null || eMin <= 0) return null;
  const overnightFlag = Boolean(schedule?.overnight || item.overnight);
  const crosses = (sMin != null && eMin < sMin) || eMin <= 240 || overnightFlag;
  return crosses ? { startMin: sMin, endMin: eMin, endTimeStr: win[1] } : null;
}

function evaluateDayPlan(item, dayStr, meta) {
  const { schedule, occDates, rule, ruleWeekdays, closedDates, canceledDates, weekdaySet, daysSpan, hasDailyOrWeekdayNote } = meta;
  if (!EV_ISO_DAY.test(dayStr)) return { confirmed: false, excluded: false, source: null };
  if (item.start_date && dayStr < String(item.start_date)) return { confirmed: false, excluded: false, source: null };
  const effEnd = item.end_date || item.start_date;
  if (effEnd && dayStr > String(effEnd)) return { confirmed: false, excluded: false, source: null };
  if (canceledDates.has(dayStr)) return { confirmed: false, excluded: true, canceled: true, source: null };
  if (closedDates.has(dayStr)) return { confirmed: false, excluded: true, closed: true, source: null };

  if (schedule?.date_hours && Object.hasOwn(schedule.date_hours, dayStr)) {
    const open = Array.isArray(schedule.date_hours[dayStr]) && schedule.date_hours[dayStr].length > 0;
    return { confirmed: open, excluded: !open, closed: !open, source: open ? "visit_schedule" : null };
  }
  if (schedule?.dates_only) return { confirmed: false, excluded: true, closed: true, source: null };

  if (occDates) {
    const inList = occDates.includes(dayStr);
    if (!inList) return { confirmed: false, excluded: true, closed: false, source: "occurrence_dates" };
    if (weekdaySet && !weekdaySet.has(isoWeekday(dayStr))) return { confirmed: false, excluded: true, closed: true, source: "occurrence_dates" };
    return { confirmed: true, excluded: false, source: "occurrence_dates" };
  }

  const dow = isoWeekday(dayStr);
  if (weekdaySet) {
    const open = weekdaySet.has(dow);
    return { confirmed: open, excluded: !open, closed: !open, source: open ? "visit_schedule" : null };
  }

  const isSelectNights = item.select_nights === true || item.selectNights === true;
  if (isSelectNights) {
    if (rule.kind === "list") {
      const open = Boolean(rule.days?.includes(dayStr));
      return { confirmed: open, excluded: !open, closed: false, source: open ? "schedule_rule" : null };
    }
    if (rule.kind === "weekdays") {
      const open = Boolean(rule.weekdays?.has(dow));
      return { confirmed: open, excluded: !open, closed: !open, source: open ? "schedule_rule" : null };
    }
    return { confirmed: false, excluded: false, unconfirmedSelect: true, source: null };
  }

  if (rule.kind === "list") {
    const open = Boolean(rule.days?.includes(dayStr));
    return { confirmed: open, excluded: !open, closed: false, source: open ? "schedule_rule" : null };
  }
  if (rule.kind === "weekdays") {
    const open = Boolean(rule.weekdays?.has(dow));
    return { confirmed: open, excluded: !open, closed: !open, source: open ? "schedule_rule" : null };
  }
  if (rule.kind === "restricted") {
    return { confirmed: false, excluded: false, unconfirmedSelect: true, source: null };
  }

  // rule.kind === "open"
  const isSingleDay = !item.end_date || item.end_date === item.start_date;
  if (isSingleDay) return { confirmed: true, excluded: false, source: "dated_single_day" };
  if (daysSpan != null && daysSpan > 14 && !hasDailyOrWeekdayNote && !(ruleWeekdays && ruleWeekdays.size === 7)) {
    return { confirmed: false, excluded: false, unconfirmedSpan: true, source: null };
  }
  return { confirmed: true, excluded: false, source: "schedule_rule" };
}

export function evaluateEventEligibility(item, nowMs = Date.now()) {
  const isEvent = Boolean(
    item && (item.kind === "event" || item._isEventCard === true || item.event_id || (item.id && String(item.id).startsWith("event:")) || item.eventName)
  );
  if (!isEvent) return null;

  const eventId = item.event_id || item.id || null;
  const eventName = item.event_name || item.eventName || item.line || item.name || null;
  if (!eventId || !eventName) return null;

  const vLat = Number(item.lat ?? item.venue_lat);
  const vLng = Number(item.lng ?? item.venue_lng);
  const venueConfirmed = item.approx !== true && Number.isFinite(vLat) && Number.isFinite(vLng) && Math.abs(vLat) <= 90 && Math.abs(vLng) <= 180;
  const venueName = item.venue_name || item.venue || item.name || null;

  const now = new Date(nowMs);
  const clock = eventLocalClock({ ...item, lat: item.lat ?? item.venue_lat, lng: item.lng ?? item.venue_lng }, now);
  const todayStr = clock?.day || siteTodayStr(now);
  const localMinute = clock?.minute ?? null;

  const rawStatus = String(item.event_status || item.status || "").trim().toLowerCase();
  if (rawStatus === "canceled" || rawStatus === "cancelled" || rawStatus === "postponed") {
    return {
      activeToday: false,
      state: "canceled",
      label: rawStatus === "postponed" ? "Postponed" : "Canceled",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: null,
    };
  }

  const schedule = item.visit_schedule || item.recurring_schedule || null;
  const occDates = cleanOccurrences(item.occurrence_dates || item.occurrenceDates);
  const rule = item.start_date ? scheduleRule(item) : { kind: "open", closedDates: new Set() };
  const note = String(item.schedule_note || "");
  const ruleWeekdays = note ? scheduleWeekdays(note) : null;
  const closedDates = toIsoSet(
    item.closed_dates, item.exception_dates,
    schedule?.excluded_dates, schedule?.closed_dates, schedule?.exception_dates,
    rule.closedDates,
  );
  const canceledDates = toIsoSet(item.canceled_dates, item.cancelled_dates, schedule?.canceled_dates, schedule?.cancelled_dates);
  const weekdaySet = toWeekdaySet(schedule?.weekdays, schedule?.weekday_hours);
  const daysSpan = (item.start_date && item.end_date)
    ? (Date.parse(`${item.end_date}T00:00:00Z`) - Date.parse(`${item.start_date}T00:00:00Z`)) / 86400000
    : null;
  const hasDailyOrWeekdayNote = !signalsRestriction(note) && (
    /(?:daily|every day|every night|nightly|7 days a week|seven days a week|saturdays?|sundays?|fridays?|mondays?|tuesdays?|wednesdays?|thursdays?)/i.test(note)
    || Boolean(ruleWeekdays && ruleWeekdays.size > 0)
  );
  const meta = { schedule, occDates, rule, ruleWeekdays, closedDates, canceledDates, weekdaySet, daysSpan, hasDailyOrWeekdayNote };

  // Midnight-crossing carryover: check whether yesterday's confirmed operating night
  // extends past midnight into `todayStr` (e.g. 7:00 PM - 1:00 AM checked at 00:15 AM).
  if (localMinute != null) {
    const yesterdayStr = addIsoDays(todayStr, -1);
    const overnight = parseOvernightSession(item, schedule, yesterdayStr);
    if (overnight && localMinute < overnight.endMin) {
      const yPlan = evaluateDayPlan(item, yesterdayStr, meta);
      if (yPlan.confirmed) {
        return {
          activeToday: true,
          state: "happening_now",
          label: `Open now \u00b7 til ${eventClockLabel(overnight.endTimeStr)}`,
          eventId,
          eventName,
          venueName,
          venueConfirmed,
          localDate: yesterdayStr,
          overnightCarryover: true,
          occurrenceSource: yPlan.source,
        };
      }
    }
  }

  if (canceledDates.has(todayStr)) {
    return {
      activeToday: false,
      state: "canceled",
      label: "Canceled",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: null,
    };
  }

  const status = eventVisitStatus({ ...item, ...(occDates ? { occurrence_dates: occDates } : {}) }, now);
  const effEnd = item.end_date || (status?.expired ? addIsoDays(todayStr, -1) : null);
  if ((status && status.expired) || (effEnd && String(effEnd) < todayStr) || (occDates && !schedule && occDates[occDates.length - 1] < todayStr)) {
    return {
      activeToday: false,
      state: "ended",
      label: "Ended",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: null,
    };
  }

  const todayPlan = evaluateDayPlan(item, todayStr, meta);
  const winToday = sessionWindowForDay(item, schedule, todayStr);
  const sMinToday = winToday ? eventClockMinutes(winToday[0]) : null;
  const eMinToday = winToday ? eventClockMinutes(winToday[1]) : null;
  const overnightToday = winToday ? parseOvernightSession(item, schedule, todayStr) : null;
  const closedTodayByTime = localMinute != null && !overnightToday && eMinToday != null && eMinToday > 0 && (sMinToday == null || eMinToday > sMinToday) && localMinute >= eMinToday;

  if (todayPlan.confirmed && !closedTodayByTime) {
    let state = status?.tone === "now" ? "happening_now" : status?.tone === "soon" ? "starting_soon" : "tonight";
    let label = status?.value ? `${status.label} \u00b7 ${status.value}` : (status?.label || "Happening today");
    if (localMinute != null && sMinToday != null) {
      if (localMinute < sMinToday) {
        state = "starting_soon";
        label = `Opens today \u00b7 ${eventClockLabel(winToday[0])}`;
      } else {
        state = "happening_now";
        label = eMinToday != null ? `Open now \u00b7 til ${eventClockLabel(winToday[1])}` : "Open now";
      }
    }
    return {
      activeToday: true,
      state,
      label,
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: todayPlan.source,
    };
  }

  // Not active today: check unconfirmed schedule classes first when inside active window
  const inWindow = (!item.start_date || todayStr >= String(item.start_date)) && (!effEnd || todayStr <= String(effEnd));
  if (inWindow && todayPlan.unconfirmedSelect) {
    return {
      activeToday: false,
      state: "unconfirmed_select_nights",
      label: "Select nights \u00b7 check dates",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: null,
    };
  }
  if (inWindow && todayPlan.unconfirmedSpan) {
    return {
      activeToday: false,
      state: "unconfirmed_season_span",
      label: "Seasonal dates \u00b7 check schedule",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: null,
    };
  }

  const tomorrowStr = addIsoDays(todayStr, 1);
  let nextDate = null;
  let nextSource = occDates ? "occurrence_dates" : (schedule ? "visit_schedule" : null);
  if (item.start_date || occDates || schedule) {
    const searchLimit = effEnd && String(effEnd) < addIsoDays(todayStr, 60) ? String(effEnd) : addIsoDays(todayStr, 60);
    for (let d = tomorrowStr; d <= searchLimit; d = addIsoDays(d, 1)) {
      const p = evaluateDayPlan(item, d, meta);
      if (p.confirmed) {
        nextDate = d;
        nextSource = nextSource || p.source;
        break;
      }
    }
  }

  if (nextDate === tomorrowStr) {
    return {
      activeToday: false,
      state: "tomorrow",
      nextDate: tomorrowStr,
      label: "Tomorrow",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: nextSource,
    };
  }

  if (item.start_date && String(item.start_date) > todayStr) {
    return {
      activeToday: false,
      state: "future",
      ...(nextDate ? { nextDate } : {}),
      label: status?.label || `Opens ${item.start_date}`,
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: nextSource,
    };
  }

  if (todayPlan.closed || closedTodayByTime) {
    return {
      activeToday: false,
      state: "closed_day",
      ...(nextDate ? { nextDate } : {}),
      label: nextDate ? `Closed today \u00b7 next ${eventMonthDay(nextDate)}` : "Closed today",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: nextSource,
    };
  }

  if (occDates && !nextDate) {
    return {
      activeToday: false,
      state: "ended",
      label: "Ended",
      eventId,
      eventName,
      venueName,
      venueConfirmed,
      localDate: todayStr,
      occurrenceSource: null,
    };
  }

  return {
    activeToday: false,
    state: "off_night",
    ...(nextDate ? { nextDate } : {}),
    label: status?.label || "Select dates",
    eventId,
    eventName,
    venueName,
    venueConfirmed,
    localDate: todayStr,
    occurrenceSource: nextSource,
  };
}

export function isFreePlaceCandidate(place) {
  if (!place) return false;
  if (place.priceLevel === "PRICE_LEVEL_FREE" || place.priceNum === 0 || place.is_free === true) return true;
  const types = [place.primaryType, ...(Array.isArray(place.types) ? place.types : [])].filter(Boolean).map((t) => String(t).toLowerCase());
  if (types.some((t) => FREE_TYPE_SET.has(t)) && place.priceNum == null) return true;
  return false;
}

export function isChristmasCandidate(place) {
  if (!place) return false;
  if (place.seasonal === "christmas" || place._christmasCard === true) return true;
  const hay = `${place.name || ""} ${place.event_name || ""} ${place.eventName || ""} ${place.editorial || ""} ${place.line || ""} ${place.schedule_note || ""}`;
  return CHRISTMAS_RX.test(hay);
}

export function evaluateWeatherFit(place, weather, beachSignal = null) {
  const leanInfo = venueLean(place || {});
  const lean = leanInfo?.lean || "neutral";
  const isWater = !!leanInfo?.water || place?.category === "beach";
  const hasAdvisory = !!(beachSignal && beachSignal.water && (beachSignal.water.advisory || beachSignal.water.result === "Poor"));
  if (hasAdvisory) {
    return { delta: -28, rainSafe: false, outdoorPenalty: true, tag: "Water advisory" };
  }
  if (!weather) {
    return { delta: 0, rainSafe: lean === "indoor", outdoorPenalty: false, tag: lean === "indoor" ? "Indoor" : null };
  }
  const rainPct = Number(weather.rain) || 0;
  const isWet = weather.wet === true || rainPct >= WET_RAIN_PCT;
  const isShowery = !isWet && rainPct >= 35;
  const feels = Number(weather.feels ?? weather.temp);
  const extremeHeat = Number.isFinite(feels) && feels >= HEAT_ADVISORY_F;

  if (isWet) {
    if (lean === "indoor") return { delta: 22, rainSafe: true, outdoorPenalty: false, tag: "Rain-safe indoor" };
    if (isWater || lean === "outdoor") return { delta: -26, rainSafe: false, outdoorPenalty: true, tag: null };
    return { delta: 2, rainSafe: false, outdoorPenalty: false, tag: null };
  }
  if (isShowery && lean === "indoor") {
    return { delta: 10, rainSafe: true, outdoorPenalty: false, tag: "Indoor pick" };
  }
  if (extremeHeat) {
    if (lean === "indoor") return { delta: 12, rainSafe: true, outdoorPenalty: false, tag: "A/C indoor pick" };
    if (lean === "outdoor" && !isWater) return { delta: -12, rainSafe: false, outdoorPenalty: true, tag: null };
  }
  return { delta: 0, rainSafe: lean === "indoor", outdoorPenalty: false, tag: null };
}

export function evaluateDaypartFit(place, daypart, hoursEval) {
  const typesHay = [place?.primaryType, place?.category, ...(Array.isArray(place?.tags) ? place.tags : []), ...(Array.isArray(place?.types) ? place.types : [])]
    .filter(Boolean).join(" ").toLowerCase();
  const phase = daypart.phase;

  if (phase === "late_night" || phase === "after_midnight") {
    if (hoursEval.alwaysOpen) return { delta: 24, tag: "Open 24 hours" };
    if (hoursEval.confirmedOpen && hoursEval.closingFeasible) return { delta: 20, tag: "Open late" };
    if (DAYTIME_ONLY_OUTDOOR_RX.test(typesHay)) return { delta: -30, tag: null };
    if (/\b(museum|zoo|aquarium)\b/.test(typesHay) && !hoursEval.confirmedOpen) return { delta: -24, tag: null };
    if (NIGHT_FRIENDLY_RX.test(typesHay) && hoursEval.hoursUnconfirmed) return { delta: 6, tag: null };
    return { delta: -6, tag: null };
  }
  if (phase === "sunset") {
    if (place?.category === "beach" || /\b(beach|waterfront|rooftop|marina|pier|scenic|park)\b/.test(typesHay + " " + String(place?.name || "").toLowerCase())) {
      const sunsetTag = Number.isFinite(daypart.minsToSunset) && daypart.minsToSunset > 5
        ? `Sunset in ${daypart.minsToSunset} min`
        : "Golden-hour spot";
      return { delta: 14, tag: sunsetTag };
    }
  }
  if (phase === "morning") {
    if (MORNING_FRIENDLY_RX.test(typesHay)) return { delta: 12, tag: null };
    if (/\b(night_club|cocktail_bar|pub)\b/.test(typesHay) && !hoursEval.confirmedOpen) return { delta: -20, tag: null };
  }
  if (phase === "evening") {
    if (NIGHT_FRIENDLY_RX.test(typesHay)) return { delta: 12, tag: null };
    if (DAYTIME_ONLY_OUTDOOR_RX.test(typesHay) && !hoursEval.confirmedOpen) return { delta: -18, tag: null };
  }
  return { delta: 0, tag: null };
}

export function computeActionabilityCoverage(place, hoursEval, reasonLine) {
  const checks = {
    location: Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng)),
    distance: place?.distMi != null || place?._userMiles != null,
    hours: !hoursEval?.hoursUnconfirmed,
    status: isOperational(place),
    reason: Boolean(reasonLine),
    officialAction: Boolean(place?.lat != null && place?.lng != null),
    photo: Boolean(place?.photo || place?.photoRef || place?.photo_ref || place?.photo_url),
    score: toDisplayScore(Number.isFinite(place?.governed_score) ? place.governed_score : place?.wfScore) !== null,
  };
  const values = Object.values(checks);
  const covered = values.filter(Boolean).length;
  return { checks, covered, total: values.length, ratio: +(covered / values.length).toFixed(2) };
}

export function aggregateActionabilityCoverage(places = [], evaluatedMap = null) {
  const list = Array.isArray(places) ? places.filter(Boolean) : [];
  if (!list.length) return { count: 0, meanRatio: 1, fullyActionable: 0 };
  let sumRatio = 0;
  let fullyActionable = 0;
  for (const p of list) {
    const ev = evaluatedMap && typeof evaluatedMap.get === "function" ? evaluatedMap.get(p.id) : null;
    const cov = ev?.actionability || computeActionabilityCoverage(p, ev?.hoursEval, ev?.reasonLine || p.editorial);
    sumRatio += cov.ratio;
    if (cov.ratio >= 0.75) fullyActionable += 1;
  }
  return {
    count: list.length,
    meanRatio: +(sumRatio / list.length).toFixed(2),
    fullyActionable,
  };
}

/**
 * Produces ONE truthful, evidence-backed reason line for `MapCompactPreviewCard`.
 * Preserves the mandatory `🔥 trend_reason` prefix whenever `trending && trend_reason` is set.
 */
export function buildMapDecisionReason(place, evalResult, { editorial = null, aiSummary = null } = {}) {
  if (!place) return null;
  if (place.trending && place.trend_reason) {
    return "🔥 " + place.trend_reason;
  }
  const parts = [];
  const ev = evalResult?.eventEval;
  const hrs = evalResult?.hoursEval;
  const drv = evalResult?.driveEstimate;
  const wth = evalResult?.weatherEval;
  const dpt = evalResult?.daypartEval;

  if (ev && ev.activeToday && ev.venueConfirmed && ev.occurrenceSource) {
    parts.push(isChristmasCandidate(place) && !ev.overnightCarryover ? "Christmas event tonight" : (ev.label || `${ev.eventName} \u00b7 tonight`));
  } else if (ev && ev.state === "canceled") {
    parts.push("Canceled");
  } else if (ev && ev.state === "tomorrow") {
    parts.push("Next event night tomorrow");
  } else if (ev && ev.state === "closed_day") {
    parts.push(ev.label || "Closed today");
  } else if (ev && ev.state === "off_night" && ev.nextDate) {
    parts.push(`Next event night ${eventMonthDay(ev.nextDate)}`);
  } else if (ev && (ev.state === "unconfirmed_select_nights" || ev.state === "unconfirmed_season_span")) {
    parts.push(ev.label || "Select dates \u00b7 check schedule");
  } else if (hrs && hrs.state === "closing_infeasible" && hrs.minutesUntilClose != null) {
    parts.push(`Closes in ${hrs.minutesUntilClose} min`);
    if (drv && drv.driveMinEst) parts.push(`~${drv.driveMinEst} min away`);
    return parts.join(" \u00b7 ");
  } else if (wth && wth.tag === "Rain-safe indoor") {
    parts.push("Rain-safe indoor");
  } else if (isFreePlaceCandidate(place) && dpt && dpt.tag && dpt.tag.startsWith("Sunset")) {
    parts.push("Free", dpt.tag);
    return parts.join(" \u00b7 ");
  } else if (dpt && dpt.tag) {
    parts.push(dpt.tag);
  }

  if (String(place.event_status || "").toLowerCase() === "sold_out" && parts.length < 2) {
    parts.push("Sold out");
  }

  if (drv && drv.waterCrossing && drv.driveMinEst >= 18) {
    parts.push(`~${drv.driveMinEst} min (${drv.waterCrossing})`);
  } else if (drv && drv.hasPhysicalOrigin && drv.driveMinEst && drv.driveMinEst <= 35 && parts.length < 2) {
    parts.push(drv.isEstimate ? `~${drv.driveMinEst} min away` : `${drv.driveMinEst} min away`);
  }

  if (hrs && parts.length < 2) {
    if (hrs.confirmedOpen && hrs.closeLabel && hrs.closingFeasible) {
      parts.push(hrs.closeLabel.replace(/^Closes\s+/i, "Open until "));
    } else if (hrs.state === "opens_soon" && hrs.openLabel) {
      parts.push(hrs.openLabel);
    }
  }

  if (parts.length > 0) return parts.slice(0, 2).join(" \u00b7 ");

  const take = toHookLine(editorial || place.editorial, place.name);
  if (take) return take;
  if (isChristmasCandidate(place)) return "Holiday display";
  const aiLine = aiSummary && typeof aiSummary === "object" && aiSummary.card_line_1 ? aiSummary.card_line_1 : null;
  if (aiLine) return aiLine;
  if (place._members && place._members.ownerPick) return "Curator pick \u00b7 Top local standout";
  const catLabel = place.cuisine || place.cardCategory || coarseCat(place) || humanTypeFallback(place.primaryType || place.primary_type) || "Local pick";
  return `${catLabel}${place.reviews ? ` \u00b7 ${Number(place.reviews).toLocaleString()} reviews` : ""}`;
}

export function evaluateMapCandidate(place, ctx = {}) {
  const {
    nowMs = Date.now(),
    verifiedDeviceLoc = null,
    referenceCenter = null,
    liveRoute = null,
    weather = null,
    beachSignals = null,
    lens = null,
    bounds = null,
    category = "all",
    sub = "all",
    explicitList = false,
    skipScoreFloor = false,
  } = ctx;

  if (!place || !place.id) return { eligible: false, exclusionReason: "missing_identity" };
  if (!isOperational(place)) return { eligible: false, exclusionReason: "not_operational" };
  if (!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
    return { eligible: false, exclusionReason: "no_permitted_coordinate" };
  }
  if (!explicitList && bounds && !placeInMapBounds(place, bounds)) {
    return { eligible: false, exclusionReason: "outside_viewport" };
  }
  const govScore = Number.isFinite(place.governed_score) ? place.governed_score : governedScoreOf(place, place.city);
  const displayScore = toDisplayScore(govScore);
  if (!explicitList && !skipScoreFloor && !place._isEventCard && (displayScore == null || displayScore < MAP_MIN_SCORE)) {
    return { eligible: false, exclusionReason: "below_score_floor", displayScore };
  }
  if (!explicitList && !place._isEventCard && !mapCategoryMatches(place, category, sub)) {
    return { eligible: false, exclusionReason: "wrong_category" };
  }

  const originForDrive = verifiedDeviceLoc || referenceCenter;
  const rawDrive = liveRoute || (originForDrive ? estimateFloridaDrive(originForDrive, place) : null);
  const driveEstimate = rawDrive ? { ...rawDrive, hasPhysicalOrigin: !!verifiedDeviceLoc } : null;
  const daypart = resolveMapDaypart(nowMs, weather?.sunsetMs);
  const hoursEval = evaluateHoursAndFeasibility(place, driveEstimate, nowMs);
  const eventEval = evaluateEventEligibility(place, nowMs);
  const beachSig = beachSignals && place.id ? beachSignals[place.id] : null;
  const weatherEval = evaluateWeatherFit(place, weather, beachSig);
  const daypartEval = evaluateDaypartFit(place, daypart, hoursEval);

  // Event-card baseline eligibility: never surface ended or canceled events on the map
  if (eventEval && (eventEval.state === "ended" || eventEval.state === "canceled")) {
    return { eligible: false, exclusionReason: eventEval.state === "canceled" ? "event_canceled" : "event_ended", eventEval };
  }

  // Moment Lens strict gates (only applied when user activates a lens or search constraint)
  if (lens === "open_now") {
    if (eventEval) {
      if (!eventEval.activeToday) return { eligible: false, exclusionReason: "event_not_tonight", eventEval };
    } else {
      if (hoursEval.hoursUnconfirmed) return { eligible: false, exclusionReason: "hours_unconfirmed", hoursEval };
      if (!hoursEval.confirmedOpen) return { eligible: false, exclusionReason: "closed_now", hoursEval };
      if (!hoursEval.closingFeasible) return { eligible: false, exclusionReason: "closing_infeasible", hoursEval };
    }
  } else if (lens === "tonight") {
    if (eventEval) {
      if (!eventEval.activeToday) return { eligible: false, exclusionReason: eventEval.state === "future" ? "event_future" : "event_not_tonight", eventEval };
    } else {
      if (hoursEval.state === "closed" && !hoursEval.hoursUnconfirmed && daypart.bucket === "night") {
        return { eligible: false, exclusionReason: "closed_now", hoursEval };
      }
      if (!hoursEval.closingFeasible && daypart.bucket === "night") {
        return { eligible: false, exclusionReason: "closing_infeasible", hoursEval };
      }
      const typesHay = [place.primaryType, place.category, ...(Array.isArray(place.types) ? place.types : [])].join(" ").toLowerCase();
      if (DAYTIME_ONLY_OUTDOOR_RX.test(typesHay) && !hoursEval.confirmedOpen) {
        return { eligible: false, exclusionReason: "daytime_only_venue" };
      }
    }
  } else if (lens === "rain_safe") {
    if (!weatherEval.rainSafe) return { eligible: false, exclusionReason: "weather_incompatible", weatherEval };
  } else if (lens === "christmas") {
    if (!isChristmasCandidate(place)) return { eligible: false, exclusionReason: "not_seasonal_match" };
    if (eventEval && !eventEval.activeToday && (eventEval.state === "ended" || eventEval.state === "canceled")) {
      return { eligible: false, exclusionReason: eventEval.state === "canceled" ? "event_canceled" : "event_ended", eventEval };
    }
  } else if (lens === "free") {
    if (!isFreePlaceCandidate(place)) return { eligible: false, exclusionReason: "not_free" };
  }

  // Contextual Map Decision Score (0..1000 internal tie-break & moment merit, ZERO commercial inputs)
  let decisionScore = (Number.isFinite(govScore) ? govScore : 90) * 6;
  if (hoursEval.confirmedOpen && hoursEval.closingFeasible) decisionScore += 35;
  else if (hoursEval.state === "closing_infeasible") decisionScore -= 55;
  else if (hoursEval.state === "closed") decisionScore -= 45;
  else if (hoursEval.state === "opens_soon") decisionScore += 8;

  if (eventEval && eventEval.activeToday) decisionScore += 40;
  decisionScore += weatherEval.delta;
  decisionScore += daypartEval.delta;

  if (driveEstimate && Number.isFinite(driveEstimate.driveMinEst)) {
    // Penalize water-barrier detours and long drives smoothly within tie bands
    const effortPenalty = Math.min(45, Math.round(driveEstimate.driveMinEst * 0.85) + (driveEstimate.waterCrossing ? 9 : 0));
    decisionScore -= effortPenalty;
  }

  const partial = {
    eligible: true,
    exclusionReason: null,
    governedScore: govScore,
    displayScore,
    mapDecisionScore: Math.round(decisionScore * 10) / 10,
    driveEstimate,
    hoursEval,
    eventEval,
    weatherEval,
    daypartEval,
    daypart,
  };
  const reasonLine = buildMapDecisionReason(place, partial);
  const actionability = computeActionabilityCoverage(place, hoursEval, reasonLine);
  return { ...partial, reasonLine, actionability };
}

function canonicalVenueDedupeKey(place) {
  if (!place) return "";
  const normName = String(place.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 28);
  const latCell = Number.isFinite(Number(place.lat)) ? Math.round(Number(place.lat) * 1250) : "";
  const lngCell = Number.isFinite(Number(place.lng)) ? Math.round(Number(place.lng) * 1250) : "";
  return normName && latCell !== "" ? `${normName}@${latCell}:${lngCell}` : String(place.id || "");
}

/**
 * Ranks eligible map candidates while strictly preserving `Shown == Sorted`
 * (`byGovernedScore` primary, `mapDecisionScore` breaking ties inside each 0.1 chip band).
 */
export function rankMapCandidates(candidates, ctx = {}) {
  const evaluated = new Map();
  const exclusions = new Map();
  const kept = [];
  const seenIds = new Set();
  const seenVenues = new Set();

  // Sort raw candidates by governed score first so canonical deduplication always keeps the strongest row
  const orderedInput = [...(Array.isArray(candidates) ? candidates : [])].sort(
    (a, b) => byGovernedScore(a, b) || String(a?.id || "").localeCompare(String(b?.id || ""))
  );

  for (const p of orderedInput) {
    if (!p || !p.id) continue;
    if (seenIds.has(p.id)) {
      exclusions.set(p.id, { place: p, exclusionReason: "deduped_duplicate_id" });
      continue;
    }
    const ev = evaluateMapCandidate(p, ctx);
    if (!ev.eligible) {
      exclusions.set(p.id, { place: p, ...ev });
      continue;
    }
    const vKey = canonicalVenueDedupeKey(p);
    if (vKey && seenVenues.has(vKey)) {
      exclusions.set(p.id, { place: p, exclusionReason: "deduped_same_venue" });
      continue;
    }
    seenIds.add(p.id);
    if (vKey) seenVenues.add(vKey);
    evaluated.set(p.id, ev);
    kept.push(p);
  }

  if (!ctx.explicitList) {
    kept.sort((a, b) => {
      const govCmp = byGovernedScore(a, b);
      if (govCmp !== 0) return govCmp;
      const da = evaluated.get(a.id)?.mapDecisionScore ?? 0;
      const db = evaluated.get(b.id)?.mapDecisionScore ?? 0;
      if (db !== da) return db - da;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  return { places: kept, evaluated, exclusions };
}

export function buildMapTruthTrace(placeId, rankedBundle, locationTruth) {
  if (!rankedBundle) return null;
  const ev = rankedBundle.evaluated.get(placeId);
  if (ev) {
    const idx = rankedBundle.places.findIndex((p) => p.id === placeId);
    const place = rankedBundle.places[idx];
    return {
      status: "visible",
      rank: idx + 1,
      id: placeId,
      name: place?.name || null,
      coordSource: place?.coordSource || "wf_inventory",
      wayfindScore: ev.displayScore,
      governedScoreRaw: ev.governedScore,
      mapDecisionScore: ev.mapDecisionScore,
      reasonLine: ev.reasonLine,
      hours: ev.hoursEval,
      drive: ev.driveEstimate,
      weather: ev.weatherEval,
      daypart: { phase: ev.daypart?.phase, fitDelta: ev.daypartEval?.delta, tag: ev.daypartEval?.tag },
      event: ev.eventEval,
      actionability: ev.actionability,
      locationTruth: locationTruth ? {
        hasPhysicalGps: !!locationTruth.deviceLocation,
        mapArea: locationTruth.mapCenter?.areaLabel || null,
        searchSource: locationTruth.searchLocation?.source || null,
      } : null,
    };
  }
  return diagnoseExcludedPlace(placeId, rankedBundle);
}

export function diagnoseExcludedPlace(queryOrId, rankedBundle, allRawCandidates = []) {
  const q = String(queryOrId || "").trim().toLowerCase();
  if (!q || !rankedBundle) return { status: "not_found", query: queryOrId };
  if (rankedBundle.exclusions.has(queryOrId)) {
    const ex = rankedBundle.exclusions.get(queryOrId);
    return { status: "excluded", id: queryOrId, name: ex.place?.name || null, reason: ex.exclusionReason, detail: ex };
  }
  for (const [id, ex] of rankedBundle.exclusions.entries()) {
    if (id.toLowerCase() === q || String(ex.place?.name || "").toLowerCase().includes(q)) {
      return { status: "excluded", id, name: ex.place?.name || null, reason: ex.exclusionReason, detail: ex };
    }
  }
  const rawMatch = (allRawCandidates || []).find(
    (p) => p && (String(p.id || "").toLowerCase() === q || String(p.name || "").toLowerCase().includes(q))
  );
  if (rawMatch) {
    return { status: "excluded_upstream", id: rawMatch.id, name: rawMatch.name, reason: "filtered_before_candidate_pool" };
  }
  return { status: "not_in_pool", query: queryOrId, reason: "not_loaded_in_current_region" };
}
