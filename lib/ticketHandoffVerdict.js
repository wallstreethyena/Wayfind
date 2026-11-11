// Is this Ticketmaster handoff still for a show people can go to?
//
// 2026-11-11: Ed Sheeran played Raymond James Stadium on Nov 7. The row rolled
// to `completed` and its page 404s, but /api/ticketmaster/go still sent a shared
// or cached ticket link to the Nov 7 Ticketmaster listing and counted it as
// provider_redirect_started. Nothing can be bought there, so that click both
// let the visitor down and padded the funnel.
//
// Two checks, cheapest first:
//   1. Ticketmaster event URLs carry the show date in the path
//      (".../ed-sheeran-loop-tour-tampa-florida-11-07-2026/event/0D00..."). A
//      date before today (US Eastern, lib/siteTime) is an ended show. No I/O.
//   2. When the click names one of our events (content=<event_id>), read that
//      row's status and dates. Only the statuses the event pages publish
//      (DISPLAYABLE_STATUS: scheduled, sold_out) may hand off; completed,
//      cancelled and held rows (postponed, uncertain, unannounced) may not,
//      and neither may a row whose last date is before today.
// The read is bounded (default 400 ms). A timeout or read error is NOT a
// verdict: the click goes through, because blocking live ticket sales on a
// slow database is worse than one stray click. Ids that are not ours (guide
// picks "slug:pick", Ticketmaster ids "tm_...") skip the read.

import { siteTodayStr } from "./siteTime.js";

export const SELLABLE_EVENT_STATUS = new Set(["scheduled", "sold_out"]);
const OWN_EVENT_ID = /^[a-z0-9][a-z0-9-]{2,150}$/;

/** "YYYY-MM-DD" from a Ticketmaster-family event URL path, or null. */
export function tmUrlEventDate(url) {
  let path;
  try { path = new URL(String(url)).pathname; } catch { return null; }
  const m = /-(\d{2})-(\d{2})-(\d{4})\/event\//.exec(path);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm), day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** The wf_events id a click names, or null when it is not one of ours. */
export function ownEventId(contentId) {
  const id = String(contentId || "").trim().replace(/^wfc:/, "");
  return OWN_EVENT_ID.test(id) ? id : null;
}

/**
 * @returns {Promise<{ok: true, checked: string} | {ok: false, reason: string, christmas: boolean}>}
 *   checked: "url-date", "row", "row-unread" (read failed or timed out: allowed),
 *   "no-row" or "not-ours".
 */
export async function ticketHandoffVerdict({ url, contentId, today = siteTodayStr(), db = null, timeoutMs = 400 } = {}) {
  const urlDate = tmUrlEventDate(url);
  if (urlDate && urlDate < today) return { ok: false, reason: "event-ended-url-date", christmas: false };

  const id = ownEventId(contentId);
  if (!id) return { ok: true, checked: urlDate ? "url-date" : "not-ours" };
  if (!db) return { ok: true, checked: "row-unread" };

  let row = null;
  try {
    const { data, error } = await db.from("wf_events")
      .select("event_id,event_status,start_date,end_date,tags")
      .eq("event_id", id)
      .abortSignal(AbortSignal.timeout(timeoutMs))
      .maybeSingle();
    if (error) return { ok: true, checked: "row-unread" };
    row = data;
  } catch {
    return { ok: true, checked: "row-unread" };
  }
  if (!row) return { ok: true, checked: "no-row" };

  const christmas = Array.isArray(row.tags) && row.tags.some((t) => /christmas|holiday/i.test(String(t)));
  if (!SELLABLE_EVENT_STATUS.has(row.event_status)) {
    return { ok: false, reason: "event-not-sellable-" + String(row.event_status || "unknown").slice(0, 20), christmas };
  }
  const last = String(row.end_date || row.start_date || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(last) && last < today) return { ok: false, reason: "event-ended", christmas };
  return { ok: true, checked: "row" };
}
