// lib/majorEventsByMonth.js — the hub's "Major Florida events by month" section.
//
// WHY: the curated anchor list (data/florida-anchor-events.json) names the
// major Florida events; the hub's capped rails showed only 24 of the 60 linked
// ones. This is a pure, additive view over the hub's already-loaded eligible
// rows: no query, no fetch, no effect on rails, ranking or JSON-LD.
import { eventDatesLabel, occurrenceDatesFor } from "./eventOccurrences.js";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rangeLabel(row) {
  const lab = (iso) => { const [, m, d] = iso.split("-").map(Number); return MONTHS_SHORT[m - 1] + " " + d; };
  const s = String(row.start_date || "").slice(0, 10);
  const e = String(row.end_date || "").slice(0, 10);
  if (!ISO_DAY.test(s)) return "";
  if (!ISO_DAY.test(e) || e === s) return lab(s);
  const [, sm, sd] = s.split("-").map(Number);
  const [, em, ed] = e.split("-").map(Number);
  return sm === em ? MONTHS_SHORT[sm - 1] + " " + sd + "–" + ed : lab(s) + " – " + lab(e);
}

// The first day on/after `today` this row is on: a listed occurrence day,
// else the start (or today, for a run already in progress). Rows that are over
// return null.
function nextDay(row, today) {
  const start = String(row.start_date || "").slice(0, 10);
  const end = String(row.end_date || row.start_date || "").slice(0, 10);
  if (!ISO_DAY.test(start) || !ISO_DAY.test(end) || end < today) return null;
  const days = occurrenceDatesFor(row);
  if (days) {
    const d = days.find((x) => x >= today);
    return d || null;
  }
  return start >= today ? start : today;
}

/**
 * @param {Array<object>} eligibleRows model.eligible from floridaEventsHubPageModel
 * @param {Array<object>} anchors data/florida-anchor-events.json `.anchors`
 * @param {string} today ISO day from lib/siteTime siteTodayStr()
 * @returns {Array<{monthKey:string,label:string,events:Array<{event_id:string,slug:string,event_name:string,city:string,when:string}>}>}
 */
export function majorEventsByMonth(eligibleRows, anchors, today) {
  if (!Array.isArray(eligibleRows) || !Array.isArray(anchors) || !ISO_DAY.test(String(today))) return [];
  const best = new Map(); // anchor index -> { day, row }
  anchors.forEach((a, i) => {
    const ee = a && a.expected_edition;
    if (!ee) return;
    const id = ee.event_id || null;
    const series = ee.event_series_id || null;
    if (!id && !series) return;
    for (const row of eligibleRows) {
      if (!row || !row.slug || !row.event_name) continue;
      const hit = (id && row.event_id === id) || (series && row.event_series_id === series);
      if (!hit) continue;
      const day = nextDay(row, today);
      if (!day) continue;
      const cur = best.get(i);
      if (!cur || day < cur.day || (day === cur.day && String(row.event_id) < String(cur.row.event_id))) best.set(i, { day, row });
    }
  });
  const byMonth = new Map();
  for (const { day, row } of best.values()) {
    const key = day.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push({ day, row });
  }
  return [...byMonth.keys()].sort().map((monthKey) => {
    const [y, m] = monthKey.split("-").map(Number);
    const items = byMonth.get(monthKey).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : String(a.row.event_name).localeCompare(String(b.row.event_name))));
    return {
      monthKey,
      label: MONTHS_LONG[m - 1] + " " + y,
      events: items.map(({ row }) => ({
        event_id: row.event_id,
        slug: row.slug,
        event_name: row.event_name,
        city: row.city || "",
        when: eventDatesLabel(row, rangeLabel(row)),
      })),
    };
  });
}
