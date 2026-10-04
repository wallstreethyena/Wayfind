#!/usr/bin/env node
// scripts/local-calendars/fetch-leads.mjs — read every upcoming event from the
// local media calendars in sources.mjs and write a LEAD file, grouped into
// series (a weekly market is one series with many dates).
//
//   node scripts/local-calendars/fetch-leads.mjs [--today YYYY-MM-DD] [--days 120] [--out scripts/local-calendars/leads/<today>.json]
//
// Facts only. The lead keeps: name, dates, all-day flag, venue, street
// address, city, zip, cost text, the event's own website, organizer name and
// website, the source's category words, and whether the source marks it as
// featured (their paid placement, useful intel). It never keeps the source's
// description text, images, organizer emails or phone numbers.
import { writeFileSync, mkdirSync } from "node:fs";
import { SOURCES, TICKETMASTER_VENUES } from "./sources.mjs";
import { occurrence, seriesKey } from "./leadParse.mjs";
import { siteTodayStr } from "../../lib/siteTime.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const today = arg("--today", siteTodayStr());
const days = Number(arg("--days", "120"));
const until = new Date(Date.parse(today + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const out = arg("--out", `scripts/local-calendars/leads/${today}.json`);
const UA = "WayfindLeadReader/1.0 (+https://www.gowayfind.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSource(src) {
  const all = [];
  for (let page = 1; ; page++) {
    const url = `${src.base}/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${today}&end_date=${until}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.status === 400 && page > 1) break;                 // past the last page
    if (!r.ok) throw new Error(`${src.id} page ${page}: HTTP ${r.status}`);
    const body = await r.json();
    for (const e of body.events || []) if (!e.hide_from_listings && e.status === "publish") all.push(occurrence(src, e));
    if (page >= (body.total_pages || 1)) break;
    await sleep(1000);                                       // one request a second, be a good neighbor
  }
  return all;
}

function isFlorida(o) {
  const s = String(o.state || "").trim().toUpperCase();
  return !s || s === "FL" || s === "FLORIDA";
}

const series = new Map(); const counts = {};
for (const src of SOURCES) {
  const occ = await fetchSource(src);
  counts[src.id] = occ.length;
  for (const o of occ) {
    if (o.virtual || !isFlorida(o)) continue;
    const key = seriesKey(src, { url: o.source_url, title: o.event_name });
    if (!series.has(key)) {
      series.set(key, {
        key, event_name: o.event_name, source: o.source, venue: o.venue, address: o.address, city: o.city, zip: o.zip,
        cost_text: o.cost_text, event_site: o.event_site, event_site_raw: o.event_site_raw, venue_site: o.venue_site,
        organizers: o.organizers, categories: o.categories, featured: o.featured,
        ticketmaster_venue: TICKETMASTER_VENUES.test(o.venue || ""),
        has_address: !!(o.address && o.city), dates: [],
      });
    }
    const s = series.get(key);
    s.featured ||= o.featured;
    s.dates.push({ start: o.start, end: o.end, all_day: o.all_day, source_url: o.source_url });
  }
}

const leads = [...series.values()]
  .map((s) => ({ ...s, dates: s.dates.sort((a, b) => a.start.localeCompare(b.start)), recurring: s.dates.length > 1 }))
  .sort((a, b) => a.dates[0].start.localeCompare(b.dates[0].start) || a.event_name.localeCompare(b.event_name));

mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
writeFileSync(out, JSON.stringify({ fetched_for: today, until, sources: SOURCES.map((s) => s.id), occurrences: counts, leads }, null, 2) + "\n");
const occTotal = leads.reduce((n, l) => n + l.dates.length, 0);
console.log(`fetch-leads: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")} occurrences -> ${leads.length} series (${occTotal} dates) through ${until}`);
console.log(`  recurring ${leads.filter((l) => l.recurring).length}, no organizer link ${leads.filter((l) => !l.event_site && !l.organizers.some((o) => o.site)).length}, no address ${leads.filter((l) => !l.has_address).length}, ticketmaster venue ${leads.filter((l) => l.ticketmaster_venue).length}, featured ${leads.filter((l) => l.featured).length}`);
console.log(`  wrote ${out}`);
