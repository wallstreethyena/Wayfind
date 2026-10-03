#!/usr/bin/env node
// scripts/local-calendars/make-batches.mjs — turn a lead file (fetch-leads.mjs)
// into agent work batches of whole SERIES, soonest first. A weekly market is
// verified once and published as one row per confirmed date.
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_READ_KEY=... node scripts/local-calendars/make-batches.mjs --leads scripts/local-calendars/leads/2026-10-02.json [--size 12] [--horizon 75]
//
// Leads only: nothing here is publishable until an agent confirms it on the
// organizer's own page. A lead whose name + date is already live in wf_events
// is left out (read with the publishable key; RLS exposes displayable rows),
// so agents never redo published work. Idempotent: an existing queue file is
// never rewritten, and a series already queued in any batch is not queued again.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { normName } from "./eventRows.mjs";
import { siteTodayStr } from "../../lib/siteTime.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const leadsPath = arg("--leads");
if (!leadsPath) { console.error("make-batches: --leads <file> is required"); process.exit(1); }
const size = Number(arg("--size", "12"));
const horizon = Number(arg("--horizon", "75"));
const today = arg("--today", siteTodayStr());
const lastDay = new Date(Date.parse(today + "T12:00:00Z") + horizon * 86400000).toISOString().slice(0, 10);
const dir = "scripts/local-calendars/queue";
mkdirSync(dir, { recursive: true });

async function liveNameDates() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_READ_KEY || "";
  if (!base || !key) { console.error("make-batches: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_READ_KEY (publishable key) so live events are skipped"); process.exit(1); }
  const out = new Set();
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/rest/v1/wf_events?select=event_name,start_date&order=event_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`read wf_events ${r.status}`);
    const chunk = await r.json();
    for (const l of chunk) out.add(normName(l.event_name) + "|" + l.start_date);
    if (chunk.length < 1000) return out;
  }
}

const day = (s) => String(s || "").slice(0, 10);
const file = JSON.parse(readFileSync(leadsPath, "utf8"));
const live = await liveNameDates();
const queued = new Set();
for (const f of readdirSync(dir).filter((x) => /^batch-\d{3}\.json$/.test(x))) {
  for (const l of JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).leads) queued.add(l.key);
}

let skippedLive = 0, skippedQueued = 0;
const leads = [];
for (const l of file.leads) {
  if (queued.has(l.key)) { skippedQueued++; continue; }
  const dates = l.dates
    .filter((d) => day(d.end || d.start) >= today && day(d.start) <= lastDay)
    .filter((d) => !live.has(normName(l.event_name) + "|" + day(d.start)));
  if (!dates.length) { skippedLive++; continue; }
  leads.push({
    key: l.key, lead_name: l.event_name, source: l.source,
    venue: l.venue, address: l.address, city: l.city, zip: l.zip,
    cost_text: l.cost_text, organizer_url_hints: [...new Set([l.event_site, l.venue_site, ...l.organizers.map((o) => o.site)].filter(Boolean))],
    organizer_names: l.organizers.map((o) => o.name), source_categories: l.categories,
    ticketmaster_venue: l.ticketmaster_venue, recurring: dates.length > 1,
    dates: dates.map((d) => ({ start: d.start, end: d.end, all_day: d.all_day })),
  });
}
leads.sort((a, b) => a.dates[0].start.localeCompare(b.dates[0].start) || a.lead_name.localeCompare(b.lead_name));

const existing = readdirSync(dir).filter((x) => /^batch-\d{3}\.json$/.test(x)).map((x) => Number(x.slice(6, 9)));
let n = existing.length ? Math.max(...existing) + 1 : 1, written = 0;
for (let i = 0; i < leads.length; i += size, n++) {
  const out = `${dir}/batch-${String(n).padStart(3, "0")}.json`;
  if (existsSync(out)) continue;
  writeFileSync(out, JSON.stringify({ batch: n, created_from: leadsPath, horizon_end: lastDay, leads: leads.slice(i, i + size) }, null, 2) + "\n");
  written++;
}
const dateCount = leads.reduce((s, l) => s + l.dates.length, 0);
console.log(`make-batches: ${leads.length} series (${dateCount} dates through ${lastDay}) in ${written} new batches of ${size}; skipped ${skippedLive} already live or past horizon, ${skippedQueued} already queued`);
