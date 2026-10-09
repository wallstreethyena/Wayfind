// lib/eventOccurrences.js — the exact days a select-dates event runs.
//
// WHY (owner, 2026-10-08, Armature Works Fall Fest): the organizer runs two
// weekends (Oct 10, 11, 24, 25). wf_events has no column for a list of days,
// so a select-nights row can only store its first and last day, and the event
// page printed "Oct 10–25", which reads as every day in between. The checked-in
// fall registries already carry the verified `occurrence_dates`; this module is
// the one place every surface (event page, Events calendar) reads them from, so
// the card, the page and the calendar all name the same days.
//
// Rules: a row's own occurrence_dates win; otherwise the registry row with the
// same event_id. Only ISO days are kept, sorted and de-duplicated. No dates are
// ever derived or guessed from a start/end range.
import { FALL_DISCOVERIES_2026 } from "./fallDiscoveries2026.js";
import { FALL_FEATURED_FESTIVALS_2026 } from "./fallFeaturedFestivals2026.js";
import { FALL_GAP_FILL_2026_10_07 } from "./fallGapFill20261007.js";
import { FALL_FOOD_GAP_2026_10_08 } from "./fallFoodGap20261008.js";
import { FALL_TAMPA_PICKS_2026_10_08 } from "./fallTampaPicks20261008.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Sorted, unique ISO days, or null when there is no usable list. */
export function cleanOccurrences(list) {
  if (!Array.isArray(list)) return null;
  const days = [...new Set(list.map((d) => String(d || "").slice(0, 10)).filter((d) => ISO_DAY.test(d)))].sort();
  return days.length ? days : null;
}

const REGISTRY_OCCURRENCES = new Map(
  [...FALL_DISCOVERIES_2026, ...FALL_FEATURED_FESTIVALS_2026, ...FALL_GAP_FILL_2026_10_07, ...FALL_FOOD_GAP_2026_10_08, ...FALL_TAMPA_PICKS_2026_10_08]
    .filter((row) => row && row.event_id && cleanOccurrences(row.occurrence_dates))
    .map((row) => [row.event_id, cleanOccurrences(row.occurrence_dates)]),
);

/** The verified days this event runs, or null when it has no day list. */
export function occurrenceDatesFor(row) {
  if (!row) return null;
  return cleanOccurrences(row.occurrence_dates) || REGISTRY_OCCURRENCES.get(row.event_id || row.id) || null;
}

/**
 * "Oct 10, 11, 24 & 25" / "Oct 31 & Nov 1". Only for short lists a reader can
 * take in at a glance (max 6 days); longer lists return null so the caller
 * keeps its own range wording plus the verified schedule note.
 */
export function occurrenceDatesLabel(days) {
  const list = cleanOccurrences(days);
  if (!list || list.length > 6) return null;
  const groups = [];
  for (const d of list) {
    const [, m, day] = d.split("-").map(Number);
    const last = groups[groups.length - 1];
    if (last && last.m === m) last.days.push(day);
    else groups.push({ m, days: [day] });
  }
  const parts = [];
  groups.forEach((g, gi) => g.days.forEach((day, di) => parts.push(di === 0 ? `${MONTHS[g.m - 1]} ${day}` : String(day))));
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " & " + parts[parts.length - 1];
}

/**
 * The page's date wording: a verified recurring label (an open-run tour that
 * runs every night), else the exact days when known, else the range label.
 * Without the first rung a nightly tour's page read "Oct 8, 2026", as if it
 * ran once.
 */
export function eventDatesLabel(row, rangeLabel) {
  const recurring = row && typeof row.when_label === "string" ? row.when_label.trim() : "";
  if (recurring) return recurring;
  return occurrenceDatesLabel(occurrenceDatesFor(row)) || rangeLabel;
}
