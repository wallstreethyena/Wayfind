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
import { christmasPriceLabel } from "./christmasCardCopy.js";

// Research fields -> the column names the page already reads.
export function christmasPageRow(row) {
  if (!row || !row.christmas_research_id) return row;
  const priceLine = row.price_kind === "paid" && row.price_note && !/unannounced|not stated/i.test(row.price_note)
    ? row.price_note.slice(0, 140) : christmasPriceLabel(row);
  return {
    ...row,
    year: row.year || "2026",
    when_label: row.season_undated ? CHRISTMAS_SEASON_UNDATED_LINE : (row.when_label || null),
    schedule_note: row.season_undated ? [CHRISTMAS_SEASON_UNDATED_LINE + ".", row.schedule_note].filter(Boolean).join(" ") : row.schedule_note,
    christmas_price_line: priceLine,
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
