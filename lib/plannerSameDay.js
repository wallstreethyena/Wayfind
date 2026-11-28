import { isOperational } from "./businessStatus.js";
import { eventClockMinutes, eventLocalClock, eventSessionsOnDay } from "./eventVisitFacts.js";
import { minUsefulVisitMinutes } from "./mapDecisionEngine.js";
import { evaluateOwnedHoursStatus, parseWeekdayDescriptionsToPeriods, utcOffsetMinutesForTimezone } from "./ownedHours.js";
import { parseClockMinutes } from "./plannerActions.js";
import { canScheduleOnDate } from "./plannerGeo.js";
import { noSaleKind } from "./ticketAvailability.js";

const EVENING_START = 17 * 60;
const TRAVEL_BUFFER = 10;
const SLOT_STEP = 15;
const DAY_MINUTES = 24 * 60;
const ON_SALE = new Set(["available", "on_sale", "in_stock"]);

export function sameDayPlannerWindow(parsed, today, nowMs) {
  const raw = String(parsed?.raw || "");
  const tonight = /\btonight\b/i.test(raw);
  if ((!tonight && !/\btoday\b/i.test(raw)) || parsed?.destination?.state !== "FL" || !Number.isFinite(nowMs)) return null;
  const clock = eventLocalClock(parsed.destination, new Date(nowMs));
  const dates = parsed.dates;
  const day = dates?.days?.[0];
  if (!clock || dates?.days?.length !== 1 || dates.startDate !== day || dates.endDate !== day || (day !== today && day !== clock.day)) return null;
  return {
    date: clock.day,
    earliestMinute: Math.max(tonight ? EVENING_START : 0, clock.minute + TRAVEL_BUFFER),
    tonight,
    timeZone: clock.timeZone,
  };
}

function clockLabel(minute) {
  const h = Math.floor(minute / 60);
  return `${h % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function isAvailable(status) {
  return status === true || ON_SALE.has(String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_"));
}

function departureMinute(value) {
  const clock = String(value || "").trim();
  return eventClockMinutes(clock) ?? (/^\d{1,2}(?::\d{2})?\s*[ap]m$/i.test(clock) ? parseClockMinutes(clock) : null);
}

function eventSlots(candidate, window) {
  const { date, earliestMinute } = window;
  const event = {
    ...candidate,
    start_date: candidate.startDate,
    end_date: candidate.endDate,
    start_time: candidate.startTime,
    end_time: candidate.endTime,
    event_status: candidate.eventStatus,
    ticket_status: candidate.ticketStatus,
    visit_schedule: candidate.visitSchedule,
    recurring_schedule: candidate.recurringSchedule,
    closed_dates: candidate.closedDates,
    exception_dates: candidate.exceptionDates,
    canceled_dates: candidate.canceledDates || candidate.cancelledDates,
  };
  if (noSaleKind(event)) return [];
  const schedule = event.visit_schedule || event.recurring_schedule;
  const oneDay = candidate.startDate === date && (!candidate.endDate || candidate.endDate === date) && (candidate.occurrenceDates?.length ?? 0) <= 1;
  const datedHours = schedule?.date_hours && Object.hasOwn(schedule.date_hours, date);
  const listedDate = candidate.occurrenceDates?.includes(date);
  if (!oneDay && !datedHours && !listedDate) return [];

  const sessions = eventSessionsOnDay(event, date);
  // The shared session helper takes 24-hour values. Canonical planner event starts use 12-hour labels.
  const times = Array.isArray(sessions) ? sessions.map((session) => session?.[0]) : [schedule?.start_time ?? candidate.startTime];
  const ticketed = candidate.ticketed === true || Boolean(candidate.ticketUrl) || (candidate.ticketed !== false && candidate.isFree !== true);
  const datedAvailability = candidate.ticketAvailabilityByDate?.[date];
  const starts = [...new Set(times.map(departureMinute).filter((minute) => minute != null))].sort((a, b) => a - b);
  return starts.filter((minute) => {
    if (minute < earliestMinute) return false;
    if (!ticketed) return true;
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    if (isAvailable(datedAvailability?.[time])) return true;
    return starts.length === 1 && isAvailable(datedAvailability);
  }).map(clockLabel);
}

function placeHours(candidate, date, timeZone) {
  const owned = candidate.ownedHours;
  if (owned?.specialHoursClosure) return null;
  const specialHours = owned?.specialHours || candidate.specialHours;
  const special = Array.isArray(specialHours) ? specialHours.find((entry) => entry?.date === date) : null;
  if (special?.closed || (!special?.periods?.length && (owned?.specialHoursUncertainty || candidate.specialHoursUncertainty))) return null;
  if (!special?.periods?.length && !canScheduleOnDate(candidate, date).allowed) return null;
  const regular = candidate.regularOpeningHours;
  const periods = special?.periods?.length ? special.periods : (owned?.periods || regular?.periods
    || parseWeekdayDescriptionsToPeriods(candidate.weekdayDescriptions)?.periods);
  if (!Array.isArray(periods) || !periods.length) return null;
  const verifiedAt = owned?.verifiedAt || candidate.hoursVerifiedAt || (
    Number.isFinite(candidate.hoursAsOf) ? new Date(candidate.hoursAsOf).toISOString() : candidate.hoursAsOf
  );
  if (!Number.isFinite(Date.parse(verifiedAt))) return null;
  return { ...owned, periods, specialHours, source: owned?.source || candidate.hoursSource, verifiedAt, timezone: timeZone, utcOffsetMinutes: undefined };
}

export function sameDaySlots(candidate, window) {
  if (!candidate || !window || !Number.isFinite(window.earliestMinute) || window.earliestMinute >= DAY_MINUTES) return [];
  const midday = Date.parse(`${window.date}T12:00:00Z`);
  if (!Number.isFinite(midday)) return [];
  const schedule = candidate.visitSchedule || candidate.recurringSchedule;
  const timezone = schedule?.timezone || candidate.timeZone || candidate.timezone || candidate.ownedHours?.timezone;
  const clock = eventLocalClock({ ...candidate, timezone }, new Date(midday));
  if (!clock || (window.timeZone && clock.timeZone !== window.timeZone)) return [];
  if (candidate.itemType === "event") return canScheduleOnDate(candidate, window.date).allowed ? eventSlots(candidate, window) : [];
  if (!isOperational(candidate.businessStatus)) return [];
  const hours = placeHours(candidate, window.date, clock.timeZone);
  if (!hours) return [];

  const offset = utcOffsetMinutesForTimezone(clock.timeZone, midday);
  const midnight = Date.parse(`${window.date}T00:00:00Z`) - offset * 60_000;
  const visitMinutes = minUsefulVisitMinutes({ ...candidate, types: candidate.tags });
  const slots = [];
  for (let minute = Math.ceil(window.earliestMinute / SLOT_STEP) * SLOT_STEP; minute + visitMinutes <= DAY_MINUTES; minute += SLOT_STEP) {
    const probeMs = midnight + minute * 60_000;
    const local = eventLocalClock({ timezone: clock.timeZone }, new Date(probeMs));
    if (local?.day !== window.date || local.minute !== minute) continue;
    const status = evaluateOwnedHoursStatus(hours, probeMs);
    if (status.open !== true || status.confidence !== "confirmed") continue;
    if (status.nextTransition?.inMinutes < visitMinutes) continue;
    slots.push(clockLabel(minute));
  }
  return slots;
}

/**
 * Is this place open at `atMs`? "open" | "closed" | "unknown". PURE. Never
 * guesses (owner 2026-11-28: "knows that the business is open or closed"):
 * "open" and "closed" come only from verified hours in the place's own time
 * zone; no hours, stale hours or a holiday with uncertain hours is "unknown".
 * An event is "open" only on a day its schedule allows, otherwise "closed".
 */
export function openStatusAt(candidate, atMs) {
  if (!candidate || !Number.isFinite(atMs)) return "unknown";
  if (!isOperational(candidate.businessStatus)) return "closed";
  const schedule = candidate.visitSchedule || candidate.recurringSchedule;
  const timezone = schedule?.timezone || candidate.timeZone || candidate.timezone || candidate.ownedHours?.timezone;
  const clock = eventLocalClock({ ...candidate, timezone }, new Date(atMs));
  if (!clock) return "unknown";
  if (candidate.itemType === "event") return canScheduleOnDate(candidate, clock.day).allowed ? "unknown" : "closed";
  const hours = placeHours(candidate, clock.day, clock.timeZone);
  if (!hours) return "unknown";
  const status = evaluateOwnedHoursStatus(hours, atMs);
  if (status.confidence !== "confirmed") return "unknown";
  if (status.open === true) return "open";
  if (status.open === false) return "closed";
  return "unknown";
}
