// lib/eventReminderFacts.js: turn ANY Wayfind event row or card into the few
// facts lib/eventReminder.js needs, or say why the event cannot carry a
// reminder. PURE and isomorphic (cards, the event page and the server route all
// call it, so the button and the .ics cannot disagree about an event).
//
// Inputs it understands: a wf_events row, a Fall or Halloween rail card, a
// Christmas card or research row, a feed event (date/time/endDate/endTime).
//
// Rules (owner, 2026-10-14, "add any dated event"):
//   * NIGHTS come from lib/eventOccurrences.js: the row's own occurrence_dates, else
//     the verified Fall registry list (a server caller passes occurrenceDatesFor(row)
//     as `occurrences`; the registries stay out of the client bundle, which is why
//     lib/eventOccurrenceDays.js holds the cleaner), else the start/end range, else
//     one date. A day list is never derived from a range.
//   * START and END TIMES are the same columns lib/eventTime.js reads for
//     JSON-LD (start_time ?? time, end_time ?? endTime).
//   * ZONE is the venue's: a row's own IANA zone, else the county, else the
//     coordinates (lib/eventTime.js resolveEventZone: Escambia, Santa Rosa,
//     Okaloosa, Walton, Holmes, Washington, Bay, Jackson, Calhoun and the
//     Central part of Gulf are America/Chicago), else America/New_York.
//   * CALLED OFF (canceled, cancelled, postponed: EVENT_CALLED_OFF, the regex
//     lib/eventResolve.js uses), PAST, and UNDATED events yield no facts.
import { resolveEventZone, EVENT_CALLED_OFF } from "./eventTime.js";
import { cleanOccurrences } from "./eventOccurrenceDays.js";
import { REMINDER_ZONES, isIsoDay, reminderNights } from "./eventReminder.js";
import { siteTodayStr } from "./siteTime.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/;
const PAGE_PATH = /^\/florida-events\/([a-z0-9][a-z0-9-]{0,160})\/?(?:[?#].*)?$/;
const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
const p2 = (n) => String(n).padStart(2, "0");

function clock(value) {
  const m = CLOCK.exec(String(value == null ? "" : value).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? p2(h) + ":" + p2(mi) : null;
}

/** True when the row's status says the event is not happening as listed. */
export function eventCalledOff(row) {
  if (!row || typeof row !== "object") return false;
  return [row.status, row.event_status, row.eventStatus].some((v) => typeof v === "string" && EVENT_CALLED_OFF.test(v));
}

// Inland Jackson and Calhoun are Central. lib/nowContext.js tzForPoint stops its
// Central band at -85.38 (Gulf County's Eastern coast), which reads Marianna
// and Blountstown as Eastern when a row has coordinates but no county. West of
// the Apalachicola River and north of the Gulf coast strip is Central.
function inlandCentral(row) {
  const la = Number(row.lat), ln = Number(row.lng);
  return row.lat != null && row.lng != null && row.lat !== "" && row.lng !== "" && Number.isFinite(la) && Number.isFinite(ln)
    && la >= 30.4 && la <= 31.0 && ln >= -85.38 && ln < -84.95;
}

/** The IANA zone the reminder uses: America/Chicago or America/New_York. */
export function reminderZoneFor(row) {
  let zone = resolveEventZone(row);
  if (zone === "America/New_York" && !row.county && !row.timezone && !row.visit_schedule?.timezone && inlandCentral(row)) zone = "America/Chicago";
  return REMINDER_ZONES[zone] ? zone : "America/New_York";
}

/**
 * Where, in the words the event page uses: the viewing spot or venue, then the
 * street line when it adds something (app/florida-events/[slug]/page.js "Where").
 * Mirrors addressLine() in lib/placeWhere.js without importing it, so the
 * client bundle stays small; scripts/test-event-reminder.mjs asserts they agree.
 */
export function reminderLocation(row) {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const city = str(row.city), state = str(row.state), address = str(row.address);
  const cityState = [city, state].filter(Boolean).join(", ");
  const where = !address ? cityState : (!city || address.toLowerCase().includes(city.toLowerCase())) ? address : [address, cityState].filter(Boolean).join(", ");
  const venue = str(row.viewing_label) || str(row.venue);
  const parts = [];
  if (venue) parts.push(venue);
  if (where && (str(row.venue) ? where !== cityState : true)) parts.push(where);
  else if (!venue && cityState) parts.push(cityState);
  return parts.join(", ") || null;
}

/** The event page slug for a row or card: its own slug, else the one in its /florida-events/<slug> link. */
export function reminderSlug(row, href = null) {
  const fromHref = typeof href === "string" ? (PAGE_PATH.exec(href) || [])[1] || null : null;
  const own = typeof row?.slug === "string" && SLUG.test(row.slug) ? row.slug : null;
  return own || fromHref;
}

/**
 * Facts for a reminder, or the reason there are none.
 *   { facts, reason: null }
 *   { facts: null, reason: "invalid" | "no_page" | "canceled" | "undated" | "past" }
 *
 * `occurrences` is occurrenceDatesFor(row) from a server caller (event page, route);
 * a card passes nothing and uses the list its row already carries.
 *
 * `href` is the card's own detail link. When given, the card must point at the
 * event's /florida-events page (the page the reminder links back to); a card
 * that opens a venue sheet or an organizer site gets no button.
 */
export function reminderEligibility(row, { href, today = siteTodayStr(), nowMs = null, occurrences = null } = {}) {
  if (!row || typeof row !== "object") return { facts: null, reason: "invalid" };
  const slug = reminderSlug(row, href);
  if (!slug) return { facts: null, reason: "no_page" };
  if (href !== undefined) {
    const linked = typeof href === "string" ? (PAGE_PATH.exec(href) || [])[1] : null;
    if (!linked || linked !== slug) return { facts: null, reason: "no_page" };
  }
  if (eventCalledOff(row)) return { facts: null, reason: "canceled" };
  if (row.season_undated || row.christmas_watchlist || row.christmas_excluded) return { facts: null, reason: "undated" };
  const start = isIsoDay(row.start_date) ? row.start_date : isIsoDay(row.date) ? row.date : null;
  if (!start) return { facts: null, reason: "undated" };
  const endRaw = isIsoDay(row.end_date) ? row.end_date : isIsoDay(row.endDate) ? row.endDate : null;
  const end = endRaw && endRaw > start ? endRaw : null;
  const name = String(row.event_name || row.name || row.title || "").trim();
  if (!name) return { facts: null, reason: "invalid" };
  const startClock = clock(row.start_time ?? row.time);
  const endClock = startClock ? clock(row.end_time ?? row.endTime) : null;
  const facts = {
    slug,
    name: name.slice(0, 160),
    start_date: start,
    end_date: end,
    start_time: startClock,
    end_time: endClock,
    nights: cleanOccurrences(occurrences) || cleanOccurrences(row.occurrence_dates),
    select_nights: !!row.select_nights,
    tz: reminderZoneFor(row),
    location: reminderLocation(row),
    hook: String(row.card_hook || row.hook || "").trim().slice(0, 240) || null,
  };
  if (reminderNights(facts, today, nowMs).kind === "none") return { facts: null, reason: "past" };
  return { facts, reason: null };
}

/** The facts, or null. What a card or page passes to <RemindMe facts={...}>. */
export function reminderFactsFor(row, opts) {
  return reminderEligibility(row, opts).facts;
}
