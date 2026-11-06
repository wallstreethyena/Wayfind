// lib/christmasEventPage.js: SERVER ONLY. The event page's Christmas layer.
//
// /florida-events/[slug] reads a wf_events row first (unchanged for every
// other event). For a Christmas listing the research data (lib/christmasResearch.js)
// is merged in at read time so the page shows the same verified dates, the
// same location corrections and the same honesty labels as the cards; a
// listing that exists only in the research data falls back to it, with the
// same page layout. No DB write.
import { fetchCuratedEventBySlug } from "./curatedEvents.js";
import { mergeChristmasResearch, christmasResearchEventBySlug, CHRISTMAS_SEASON_UNDATED_LINE, CHRISTMAS_RESEARCH_CANONICAL, researchPrice } from "./christmasResearch.js";
import { christmasPriceLabel, christmasCopy } from "./christmasCardCopy.js";

// Research fields -> the column names the page already reads.
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d) => MONTH[Number(d.slice(5, 7)) - 1] + " " + Number(d.slice(8, 10)) + ", " + d.slice(0, 4);
// The date line with no dash (owner rule): "Dec 5, 2026" or "Nov 13, 2026 to Jan 4, 2027".
export function christmasDateLine(row) {
  if (!row?.start_date) return null;
  const end = row.end_date && row.end_date !== row.start_date ? row.end_date : null;
  if (!end && row.closing_unannounced) return "Opens " + dayLabel(row.start_date) + ", closing date not announced";
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
    skip_if: christmasCopy(row.skip_if), fun_fact: christmasCopy(row.fun_fact), wayfind_verdict: christmasCopy(row.wayfind_verdict), duration_recommendation: christmasCopy(row.duration_recommendation), crowd_level: christmasCopy(row.crowd_level),
    christmas_price_line: christmasCopy(priceLine),
    source_url: row.source_url || row.official_event_url || null,
    last_verified_at: row.last_checked || row.last_verified_at || null,
  };
}

// A wf_events row whose research twin is on the watchlist (2026 not
// confirmed) or excluded: the page stays up (link health) but claims nothing
// the research could not confirm. No date, no time, no Event JSON-LD (the page
// emits it only with a start_date), no "free" the organizer did not state, and
// no punctuation dash in any line it shows. The sitemap leaves it out
// (isChristmasWatchlistTwin). Live fix 2026-10-14 (Fort Myers Beach boat parade).
export const CHRISTMAS_WATCHLIST_PAGE_LINE = "2026 not confirmed yet";
const PAGE_COPY_FIELDS = ["event_name", "short_title", "card_hook", "editorial_summary", "why_go", "venue", "insider_tip", "parking_tip", "pairing", "skip_if", "fun_fact", "wayfind_verdict", "duration_recommendation", "crowd_level", "what_to_bring"];
export function christmasWatchlistPageRow(db, researchId) {
  const research = CHRISTMAS_RESEARCH_CANONICAL.find((row) => row.id === researchId) || null;
  const price = researchPrice(research?.price);
  const copy = Object.fromEntries(PAGE_COPY_FIELDS.filter((k) => typeof db[k] === "string").map((k) => [k, christmasCopy(db[k])]));
  const missing = christmasCopy(research?.missing || "") || "2026 dates not posted on the official page";
  return {
    ...db,
    ...copy,
    christmas_research_id: researchId, christmas_state: research?.state || null, christmas_watchlist: true,
    christmas_rail: null, season_undated: false, closing_unannounced: false,
    start_date: null, end_date: null, start_time: null, end_time: null, occurrence_dates: undefined, select_nights: false,
    year: db.year || "2026",
    when_label: CHRISTMAS_WATCHLIST_PAGE_LINE,
    schedule_note: CHRISTMAS_WATCHLIST_PAGE_LINE + ". " + missing.replace(/\.?$/, "."),
    is_free: price.is_free, price_band: price.kind === "free" ? "free" : null,
    christmas_price_line: christmasCopy(price.label),
    source_url: db.source_url || research?.official_url || db.official_event_url || null,
    last_verified_at: research?.last_checked || db.last_verified_at || null,
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
    if (merged.christmas_excluded) return christmasWatchlistPageRow(db, merged.christmas_research_id);
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
