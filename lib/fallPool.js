// lib/fallPool.js — the AUGTOBER pool: what counts as fall on Wayfind.
//
// Owner, 2026-08-26: "start building the fall card with all of the fall
// themed bars, restaurants, cafes, events, pumpkins, anything that is fall
// themed and Halloween … and look at the library to see if there's anything
// else that is fall or Halloween themed we can leverage in addition to the
// ones I'm providing." This module is that definition, in one place, so the
// rail, the API and the guards all read the same law.
//
// TWO SOURCES, BOTH OWNED:
//   1. wf_events rows tagged fall/halloween/pumpkins/harvest — 32 verified
//      rows measured 2026-08-26 (HHN35, Howl-O-Scream ×2, pumpkin patches,
//      corn mazes, Fantasy Fest, the Tribute Store, …). Dated law applies.
//   2. A CURATED list of year-round spooky PLACES already in wf_inventory —
//      found by sweeping the library for halloween/haunt/spooky identities.
//      Each id below was individually vetted (a yoga studio named
//      "Screaming Buddha" is not fall content; a Chicago haunted house is
//      not Florida). Place law applies: they render as normal place cards
//      with real scores and open the normal place detail.
//
// DATED LAW vs OPEN-RUN LAW. wf_events' displayable() retires a row when
// (end_date || start_date) passes — correct for dated events, wrong for an
// open run like the HHN Tribute Store, whose end date Universal has not
// published and which we refuse to fabricate. The AUGTOBER surface therefore
// admits an open-run row (end_date null) while `today` is within OPEN_RUN_DAYS
// of its start — it stays visible without ever CLAIMING an end date, and the
// dated rows keep the strict rule so nothing expired can ride the rail.

export const FALL_TAGS = ["fall", "halloween", "pumpkins", "harvest"];
export const OPEN_RUN_DAYS = 90;

export function isFallTagged(tags) {
  const t = Array.isArray(tags) ? tags : [];
  return FALL_TAGS.some((x) => t.includes(x));
}

// e: a wf_events row ({start_date, end_date}); todayStr: "YYYY-MM-DD" site-local.
export function fallEventLive(e, todayStr) {
  if (!e || !e.start_date) return false;
  if (e.end_date) return e.end_date >= todayStr;
  // open run: visible from its start for OPEN_RUN_DAYS, never claiming an end
  const start = new Date(e.start_date + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const age = (today - start) / 86400000;
  return age >= 0 ? age <= OPEN_RUN_DAYS : e.start_date <= addDays(todayStr, 120);
}

// Date-only arithmetic on the string's own calendar parts — never through
// toISOString (UTC would shift the day; check-sitetime forbids it).
function addDays(dstr, n) {
  const [y, m, d] = String(dstr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dt.getUTCDate()).padStart(2, "0");
}

// The short WHEN label a tile wears. Never invents precision the row lacks.
export function fallWhenLabel(e, todayStr) {
  if (!e || !e.start_date) return { label: "", tone: "later" };
  const started = e.start_date <= todayStr;
  if (!started) {
    const md = e.start_date.slice(5).split("-");
    return { label: "Opens " + ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(md[0])] + " " + Number(md[1]), tone: "soon" };
  }
  if (!e.end_date) return { label: "Open now", tone: "now" };
  const md = e.end_date.slice(5).split("-");
  return { label: (e.select_nights ? "Select nights thru " : "Thru ") + ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(md[0])] + " " + Number(md[1]), tone: "now" };
}

// Year-round spooky places, vetted from the library sweep of 2026-08-26.
// Format: place_id -> one line of why it belongs (shown as the card take when
// the row carries no editorial of its own).
export const FALL_PLACE_IDS = Object.freeze({
  "ChIJd6lmgVh_3YgREzqTBf28i6U": "Kissimmee's year-round haunted house — fall's main course, available any month.", // Mortem Manor
  "ChIJUS9EYpll54gR63QOjYM4vDw": "Ghost tours and haunted pub crawls through downtown Orlando's darker history.", // Orlando Ghosts
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0": "Tampa's haunted-history walking tours — Ybor's ghosts do not take a season off.", // Ghost Party Haunted Tours
  "ChIJUXMXELw9w4gR4TGRAD8NghQ": "Shaved snow with a spooky streak — the Sarasota Vampire Penguin.", // Vampire Penguin (manatee-sarasota)
  "ChIJJQbqwSD7wogRTm8XCaabaMA": "St. Pete's Vampire Penguin — dessert with fangs, all year.", // Vampire Penguin (st-pete)
  "ChIJB2B8mYzHwogRkZIDCDARWww": "Horror-themed ice cream in Tampa — the scoop shop that never leaves October.", // Ice Screamin Tampa
  "ChIJUcws8z5p54gRUBjqVlhhFgY": "Ice Screamin's Orlando parlor — horror movies and hard scoops.", // Ice Screamin Orlando
});
