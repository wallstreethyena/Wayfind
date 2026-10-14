// lib/eventReminderRoute.js: the logic behind GET /api/events/reminder. Lives in
// lib/ because a Next route file may export nothing but its HTTP handlers, and
// this has to be callable from a plain-node guard (scripts/test-event-reminder-route.mjs).
//
// Contract (owner, 2026-10-14, "add a reminder to the person's phone"):
//   GET /api/events/reminder?slug=<event slug>&night=YYYY-MM-DD&remind=<preset | date and time>
//   200 text/calendar; charset=utf-8, attachment "<slug>.ics"
//   400 bad or missing parameter, an undated or past event, a reminder time that has passed
//   404 no such event
//   503 the event lookup itself failed (an outage is not a 404)
//
// The event is looked up HERE, with the same lookup the event page uses. The
// request supplies only a slug, a night and a reminder time; every name, address
// and link in the invite comes from the stored row. No secrets, no paid calls.
import { fetchCuratedEventBySlug, eventDetailTicketAction } from "./curatedEvents.js";
import { christmasEventPageRow } from "./christmasEventPage.js";
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { SITE_URL } from "./site.js";
import { siteTodayStr } from "./siteTime.js";
import { buildReminderIcs, reminderFacts, reminderNights, resolveReminder, isIsoDay } from "./eventReminder.js";

const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/;
const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

function fail(status, error) {
  return Response.json({ error }, { status, headers: HEADERS });
}

export async function defaultLookup(slug) {
  return christmasEventPageRow(await fetchCuratedEventBySlug(slug), slug);
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

  const facts = reminderFacts(row, { occurrences: occurrenceDatesFor(row) });
  if (!facts) return fail(400, "This event has no confirmed date to remind you about.");
  const today = siteTodayStr(new Date(nowMs));
  const nights = reminderNights(facts, today);
  if (nights.kind === "none") return fail(400, "This event has already happened.");
  const chosen = night || nights.default;

  const result = resolveReminder(facts, chosen, remind, { nowMs, today });
  if (!result.ok) return fail(400, result.error);

  const ticket = eventDetailTicketAction(row, { surface: "calendar_reminder" });
  const lat = row.lat == null || row.lat === "" ? NaN : Number(row.lat);
  const lng = row.lng == null || row.lng === "" ? NaN : Number(row.lng);
  const body = buildReminderIcs({
    facts, night: chosen, alarmMs: result.alarmMs, siteUrl, nowMs, lat, lng,
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
