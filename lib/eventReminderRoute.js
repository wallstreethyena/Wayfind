// lib/eventReminderRoute.js: the logic behind GET /api/events/reminder. Lives in
// lib/ because a Next route file may export nothing but its HTTP handlers, and
// this has to be callable from a plain-node guard (scripts/test-event-reminder-route.mjs).
//
// Contract (owner, 2026-10-14, "add a reminder to the person's phone"):
//   GET /api/events/reminder?slug=<event slug>&night=YYYY-MM-DD&remind=<preset | date and time>
//   200 text/calendar; charset=utf-8, attachment "<slug>.ics"
//   400 bad or missing parameter, an undated or past event, a reminder time that has passed
//   404 no such event
//   410 the event is canceled or postponed (plain text body, no calendar file)
//   503 the event lookup itself failed (an outage is not a 404)
//
// The event is looked up HERE, with the same lookup the event page uses. The
// request supplies only a slug, a night and a reminder time; every name, address
// and link in the invite comes from the stored row. No secrets, no paid calls.
import { createHash } from "node:crypto";
import { fetchCuratedEventBySlug, fetchCuratedEventStatusBySlug, eventDetailTicketAction } from "./curatedEvents.js";
import { christmasEventPageRow } from "./christmasEventPage.js";
import { EVENT_CALLED_OFF } from "./eventTime.js";
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { SITE_URL } from "./site.js";
import { siteTodayStr } from "./siteTime.js";
import { buildReminderIcs, reminderNights, resolveReminder, isIsoDay } from "./eventReminder.js";
import { reminderEligibility, eventCalledOff } from "./eventReminderFacts.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/;
const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

function fail(status, error) {
  return Response.json({ error }, { status, headers: HEADERS });
}

/**
 * The invite's UID: sha256(slug + night) in hex, then @gowayfind.com. The same
 * event night yields the same UID on every download, so a person who taps again
 * (or asks for a different alert time) updates one calendar entry instead of
 * stacking copies.
 */
export function reminderUid(slug, night) {
  return createHash("sha256").update(String(slug) + String(night)).digest("hex") + "@gowayfind.com";
}

export async function defaultLookup(slug) {
  const row = christmasEventPageRow(await fetchCuratedEventBySlug(slug), slug);
  if (row) return row;
  // A called-off row is not displayable, so the lookup above is null for it.
  const status = await fetchCuratedEventStatusBySlug(slug);
  return typeof status === "string" && EVENT_CALLED_OFF.test(status) ? { slug, event_status: status } : null;
}

function gone() {
  return new Response("This event was canceled or postponed, so there is nothing to add to your calendar.", {
    status: 410,
    headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" },
  });
}

export async function handleReminderRequest(request, { lookup = defaultLookup, nowMs = Date.now(), siteUrl = SITE_URL } = {}) {
  const sp = new URL(request.url).searchParams;
  const slug = (sp.get("slug") || "").trim();
  const night = (sp.get("night") || "").trim();
  const remind = (sp.get("remind") || "").trim();
  if (!SLUG.test(slug)) return fail(400, "slug is required");
  if (night && !isIsoDay(night)) return fail(400, "night must be a date like 2026-12-05");
  if (!remind) return fail(400, "remind is required");

  let row;
  try { row = await lookup(slug); } catch { return fail(503, "Event lookup is unavailable right now. Try again in a minute."); }
  if (!row) return fail(404, "No event with that slug.");

  if (eventCalledOff(row)) return gone();
  const today = siteTodayStr(new Date(nowMs));
  const { facts, reason } = reminderEligibility(row, { today, nowMs, occurrences: occurrenceDatesFor(row) });
  if (!facts) {
    if (reason === "canceled") return gone();
    return fail(400, reason === "past" ? "This event has already happened." : "This event has no confirmed date to remind you about.");
  }
  const nights = reminderNights(facts, today, nowMs);
  const chosen = night || nights.default;

  const result = resolveReminder(facts, chosen, remind, { nowMs, today });
  if (!result.ok) return fail(400, result.error);

  const ticket = eventDetailTicketAction(row, { surface: "calendar_reminder" });
  const lat = row.lat == null || row.lat === "" ? NaN : Number(row.lat);
  const lng = row.lng == null || row.lng === "" ? NaN : Number(row.lng);
  const body = buildReminderIcs({
    facts, night: chosen, alarmMs: result.alarmMs, siteUrl, nowMs, lat, lng, uid: reminderUid(facts.slug, chosen),
    // Only a partner link that already routes through /api/commerce/go. An
    // organizer's raw ticket URL is never copied into a calendar.
    ticketHref: ticket && ticket.kind === "affiliate" ? ticket.href : null,
  });
  return new Response(body, {
    status: 200,
    headers: {
      ...HEADERS,
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.ics"`,
    },
  });
}
