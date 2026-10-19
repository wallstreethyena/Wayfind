// lib/eventStartRefresh.js — near-term Ticketmaster starts are not a 21-day fact.
//
// THE BUG (2026-10-19): /events/tampa/tonight showed "Cleveland Guardians at
// Tampa Bay Rays: ALCS (Home Game 3, If Necessary)" at 17:00. That was
// Ticketmaster's placeholder localTime, frozen in the 21-day event-feed cache
// (app/api/events/route.js). The by-id Discovery read had already moved to
// 20:00 with the "If Necessary" title dropped. Neither clock is first pitch.
// ALCS Game 6 on 2026-10-19 is 8:08 PM ET. MLB's stats API is not a source:
// its terms are non-commercial, and Wayfind is commercial.
//
// THE FIX: when a cached feed is served, a Ticketmaster event that starts
// within the next 72 hours — or any event flagged TBD, placeholder, or
// "If Necessary" — re-reads its start from the existing Discovery feed.
// One unfiltered query, the existing spend gate and daily cap, then a
// one-hour shared map so the re-read is not a per-request fan-out. The
// 21-day feed TTL and the place/photo cache rules are not this module.
// A denied grant leaves the cached row in place.
//
// One stored correction: after that re-read, tm_Z7r9jZ1AAZsP4 on 2026-10-19
// was still 20:00. Its stored start is 20:08:00, Eastern, and its title is
// the confirmed game rather than the ticket-inventory placeholder.
import { eventIsoWithOffset, resolveEventZone } from "./eventTime.js";

export const FRESH_START_WINDOW_MS = 72 * 60 * 60 * 1000;
// How long a shared Discovery re-read covers one geo cell. Not the feed TTL.
export const TICKETMASTER_START_REFRESH_TTL_MS = 60 * 60 * 1000;
// A start listed earlier today can still be the placeholder the page is showing.
const LOOKBACK_MS = 6 * 60 * 60 * 1000;
const UNCERTAIN_RX = /\b(?:tbd|tba|placeholder|if necessary)\b/i;

export function eventStartUncertain(event) {
  if (!event || typeof event !== "object") return false;
  if (event.timeTBA === true || event.dateTBA === true || event.dateTBD === true || event.noSpecificTime === true) return true;
  return UNCERTAIN_RX.test([event.name, event.status].filter(Boolean).join(" "));
}

export function isTicketmasterEvent(event) {
  if (!event) return false;
  return event.source === "Ticketmaster" || String(event.id || "").startsWith("tm_");
}

export function eventStartMs(event) {
  if (!event || !/^\d{4}-\d{2}-\d{2}$/.test(String(event.date || ""))) return null;
  const zone = resolveEventZone(event) || "America/New_York";
  const iso = eventIsoWithOffset(event.date, event.time || "00:00:00", zone);
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export function needsTicketmasterStartRefresh(event, now = new Date()) {
  if (!isTicketmasterEvent(event)) return false;
  if (eventStartUncertain(event)) return true;
  const start = eventStartMs(event);
  if (start == null) return false;
  const t = now instanceof Date ? now.getTime() : Number(now);
  return start >= t - LOOKBACK_MS && start <= t + FRESH_START_WINDOW_MS;
}

export function ticketmasterStartFields(event) {
  if (!event || !event.id) return null;
  return {
    id: event.id,
    date: event.date || "",
    time: event.time || "",
    name: event.name || "",
    status: event.status || "",
    timeTBA: event.timeTBA === true,
    dateTBA: event.dateTBA === true,
    dateTBD: event.dateTBD === true,
    noSpecificTime: event.noSpecificTime === true,
  };
}

// The one row Ticketmaster's feed still had wrong after a live re-read
// (cache 17:00, by-id 20:00, first pitch 20:08 ET on 2026-10-19).
export const STORED_START_CORRECTIONS = Object.freeze({
  "tm_Z7r9jZ1AAZsP4|2026-10-19": Object.freeze({
    time: "20:08:00",
    name: "Cleveland Guardians at Tampa Bay Rays: ALCS Game 6",
  }),
});

export function applyStoredStartCorrection(event) {
  if (!event) return event;
  const fix = STORED_START_CORRECTIONS[`${event.id}|${event.date}`];
  if (!fix) return event;
  if (event.time === fix.time && event.name === fix.name) return event;
  return { ...event, time: fix.time, name: fix.name };
}

export function applyStoredStartCorrections(events) {
  if (!Array.isArray(events)) return events;
  return events.map(applyStoredStartCorrection);
}

/** PURE. Replace cached Ticketmaster starts with a fresh Discovery row. */
export function applyFreshTicketmasterStarts(events, freshEvents, now = new Date()) {
  if (!Array.isArray(events) || !events.length) return events;
  const byId = new Map();
  for (const e of Array.isArray(freshEvents) ? freshEvents : []) {
    if (e && e.id) byId.set(e.id, e);
  }
  if (!byId.size) return events;
  return events.map((e) => {
    if (!needsTicketmasterStartRefresh(e, now)) return e;
    const fresh = byId.get(e.id);
    if (!fresh || !fresh.time) return e;
    const date = fresh.date || e.date;
    const time = String(fresh.time);
    const name = eventStartUncertain(e) && fresh.name ? fresh.name : e.name;
    const status = fresh.status || e.status || "";
    if (date === e.date && time === e.time && name === e.name && status === (e.status || "")) return e;
    return {
      ...e,
      date,
      time,
      name,
      status,
      timeTBA: fresh.timeTBA === true,
      dateTBA: fresh.dateTBA === true,
      dateTBD: fresh.dateTBD === true,
      noSpecificTime: fresh.noSpecificTime === true,
    };
  });
}
