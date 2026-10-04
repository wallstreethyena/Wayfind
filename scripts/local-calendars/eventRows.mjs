// scripts/local-calendars/eventRows.mjs
//
// The row contract for events found through local media calendars. It is the
// festival contract (scripts/festivals/festivalRows.mjs) with a wider set of
// categories, no required tag, and recurring ids: a weekly market publishes one
// row per date, id "<series>-<YYYY-MM-DD>", the shape wf_events already uses
// for recurring rows (e.g. carrollwood-market-2026-10-10).
//
// Everything that keeps a row honest is inherited unchanged: organizer-only
// sources, https links, Florida coordinates, verification stamps, no long
// dashes in public copy, no column outside the allow list.
import {
  ALLOWED_COLUMNS, festivalSlug, slugify, rowProblemsFor, batchProblems as batchProblemsFor, dbRow as festivalDbRow,
} from "../festivals/festivalRows.mjs";

import { isSameEvent as festivalSameEvent, distinctiveWords, kmBetween } from "../festivals/festivalRows.mjs";
export { normName } from "../festivals/festivalRows.mjs";

// ── same event, different name, for CITY calendars ─────────────────────────
// The festival rule (subset of distinctive words within 10 km, overlapping
// dates) was tuned on one-off festivals spread across Florida. A city calendar
// is dense: dozens of events in one downtown on one night, and their names
// share the town ("pete", "dunedin") or the season ("halloween"). Measured on
// the 2026-10-02 run, the festival rule alone wrongly matched:
//   "Halloween Fest at USF St. Petersburg" -> a St. Pete Halloween bar crawl
//   "Dunedin Downtown Market"              -> "Dunedin Celtic Festival"
//   "St Pete Fall Festival"                -> "St Pete Paint Party"
// and every one of those would have been silently skipped as a duplicate.
// So here the festival match must ALSO share a word that is not a town name,
// AND either be at the same spot (800 m) or share two such words. The real
// duplicates of that run (Night Market at Ferg's, Vintage Market Days, Riverwalk
// Trick or Treat, SAVOR, Shopapalooza) all still match.
export const TOWN_WORDS = Object.freeze(new Set([
  "pete", "petersburg", "tampa", "clearwater", "dunedin", "largo", "gulfport", "sarasota", "bradenton",
  "beach", "downtown", "ybor", "seminole", "heights", "brandon", "lakeland", "tarpon", "springs", "pinellas",
  "hillsborough", "safety", "harbor", "riverview", "temple", "terrace", "westshore", "channelside",
]));

export function isSameEvent(a, b) {
  if (!festivalSameEvent(a, b)) return false;
  const wb = distinctiveWords(b?.event_name);
  const shared = [...distinctiveWords(a?.event_name)].filter((w) => wb.has(w) && !TOWN_WORDS.has(w));
  if (!shared.length) return false;
  return kmBetween(a, b) <= 0.8 || shared.length >= 2;
}

// Every category here already exists in wf_events and is understood by the
// event surfaces (lib/curatedEvents.js SEGMENT_BY_CATEGORY falls back to the
// word itself as the chip label, which is why these are plain words).
export const LOCAL_CATEGORIES = Object.freeze([
  "community", "festival", "music", "food", "arts", "seasonal", "halloween", "holiday", "sports", "nightlife",
]);

// minimum_age is the one extra column: 21+ shows and brewery events say so,
// and a card that hides it sends a family to a bar.
export const LOCAL_COLUMNS = Object.freeze([...ALLOWED_COLUMNS, "minimum_age"]);

/** The DB row for this import: its own column list, batch metadata stripped. */
export const dbRow = (row) => festivalDbRow(row, LOCAL_COLUMNS);

/** The id a one-off event gets, and the id each date of a recurring series gets. */
export const oneOffId = (name, year) => festivalSlug(name, year);
export const recurringId = (seriesId, date) => `${seriesId}-${date}`;

export const LOCAL_PROFILE = Object.freeze({
  categories: LOCAL_CATEGORIES,
  requiredTag: null,
  columns: LOCAL_COLUMNS,
  expectedIds: (row) => {
    const ids = [oneOffId(row.event_name, row.year)];
    if (row.event_series_id && row.start_date) ids.push(recurringId(row.event_series_id, row.start_date));
    return ids;
  },
});

const BAD_SOURCE = /(^|\/\/)(www\.)?(ilovetheburg\.com|thatssotampa\.com|eventschaser\.com)/i;

export function rowProblems(row, opts = {}) {
  const p = rowProblemsFor(LOCAL_PROFILE, row, opts);
  if (!row || typeof row !== "object") return p;
  // The media calendar is the lead, never the citation (same rule as the festival aggregator).
  for (const k of ["official_event_url", "official_ticket_url", "source_url"]) {
    if (row[k] && BAD_SOURCE.test(row[k])) p.push(`${k} is the lead calendar or a reseller, not the organizer`);
  }
  if (row.event_series_id && row.event_series_id !== slugify(row.event_series_id)) p.push("event_series_id must be a slug");
  if (row.minimum_age != null && !(Number.isInteger(row.minimum_age) && row.minimum_age >= 0 && row.minimum_age <= 21)) p.push("minimum_age must be an integer 0 to 21 or null");
  if (row.verify_note && !/^\d{4}-\d{2}-\d{2}:/.test(row.verify_note)) p.push("verify_note must start with the date checked (YYYY-MM-DD:)");
  return p;
}

export function batchProblems(file, opts) {
  const out = batchProblemsFor(file, opts, LOCAL_PROFILE);
  // The inherited check only knows the festival extras; add ours per row.
  (file?.publish || []).forEach((row, i) => {
    for (const msg of rowProblems(row, opts)) {
      const line = `publish[${i}] ${row?.event_name || "?"}: ${msg}`;
      if (!out.includes(line)) out.push(line);
    }
  });
  return out;
}
