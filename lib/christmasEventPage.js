// lib/christmasEventPage.js: SERVER ONLY. The event page's Christmas layer.
//
// /florida-events/[slug] reads a wf_events row first (unchanged for every
// other event). For a Christmas listing the research data (lib/christmasResearch.js)
// is merged in at read time so the page shows the same verified dates, the
// same location corrections and the same honesty labels as the cards; a
// listing that exists only in the research data falls back to it, with the
// same page layout. No DB write.
import { fetchCuratedEventBySlug } from "./curatedEvents.js";
import { mergeChristmasResearch, christmasResearchEventBySlug, CHRISTMAS_SEASON_UNDATED_LINE } from "./christmasResearch.js";
import { christmasPriceLabel, christmasCopy } from "./christmasCardCopy.js";

// Research fields -> the column names the page already reads.
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d) => MONTH[Number(d.slice(5, 7)) - 1] + " " + Number(d.slice(8, 10)) + ", " + d.slice(0, 4);
// The date line with no dash (owner rule): "Dec 5, 2026" or "Nov 13, 2026 to Jan 4, 2027".
export function christmasDateLine(row) {
  if (!row?.start_date) return null;
  const end = row.end_date && row.end_date !== row.start_date ? row.end_date : null;
  const range = end ? dayLabel(row.start_date) + " to " + dayLabel(end) : dayLabel(row.start_date);
  return row.select_nights ? "Select nights, " + range : range;
}

export function christmasPageRow(row) {
  if (!row || !row.christmas_research_id) return row;
  const priceLine = row.price_kind === "paid" && row.price_note && !/unannounced|not stated/i.test(row.price_note)
    ? row.price_note.slice(0, 140) : christmasPriceLabel(row);
  return {
    ...row,
    year: row.year || "2026",
    when_label: row.season_undated ? CHRISTMAS_SEASON_UNDATED_LINE : (christmasCopy(row.when_label) || christmasDateLine(row)),
    schedule_note: christmasCopy(row.season_undated ? [CHRISTMAS_SEASON_UNDATED_LINE + ".", row.schedule_note].filter(Boolean).join(" ") : row.schedule_note),
    card_hook: christmasCopy(row.card_hook), editorial_summary: christmasCopy(row.editorial_summary), why_go: christmasCopy(row.why_go),
    venue: christmasCopy(row.venue), insider_tip: christmasCopy(row.insider_tip), parking_tip: christmasCopy(row.parking_tip), pairing: christmasCopy(row.pairing),
    christmas_price_line: christmasCopy(priceLine),
    source_url: row.source_url || row.official_event_url || null,
    last_verified_at: row.last_checked || row.last_verified_at || null,
  };
}

// The row the page renders, given the wf_events read: the merged Christmas row
// for a mapped wf_events row, the research listing for a research-only slug
// (when the read was a SUCCESSFUL miss), or the row unchanged. Synchronous, so
// the page keeps its one read and its "404 only after a successful miss" rule
// (scripts/check-curated-events-read.mjs).
export function christmasEventPageRow(db, slug) {
  if (db) {
    const merged = mergeChristmasResearch([db]).find((row) => row.event_id === db.event_id) || db;
    if (merged.christmas_excluded) return db;
    return merged.christmas_research_id ? christmasPageRow(merged) : db;
  }
  const research = christmasResearchEventBySlug(slug);
  return research ? christmasPageRow(research) : null;
}

// The same, reading wf_events itself. Throws on a failed read exactly like
// fetchCuratedEventBySlug (an outage must not 404 a live event).
export async function christmasAwareEventBySlug(slug, { fetchRow = fetchCuratedEventBySlug } = {}) {
  return christmasEventPageRow(await fetchRow(slug), slug);
}
