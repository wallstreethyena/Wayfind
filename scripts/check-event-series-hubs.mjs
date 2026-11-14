#!/usr/bin/env node
// scripts/check-event-series-hubs.mjs — locks the tour hub wiring (2026-11-12,
// Cosmic Baseball Florida): series matching is by exact event_series_id prefix
// (never title text), the hub only lists Florida rows of its own series soonest
// first, every series with live rows has a planning block, and the hub is in
// the sitemap and linked from the event page. Executes the code where it can.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { seriesHubFor, EVENT_SERIES_HUBS } from "../lib/eventSeriesHubs.js";
import { cosmicFloridaRows, COSMIC_VENUES, COSMIC_TICKET_STEPS } from "../lib/cosmicBaseballFlorida.js";

let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.error(`check-event-series-hubs: FAIL — ${label}\n  ${e.message}`); process.exit(1); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

ok("a Cosmic series row maps to the Florida hub", () =>
  assert.equal(seriesHubFor({ event_series_id: "cosmic-baseball-miami" })?.href, "/cosmic-baseball-florida"));
ok("title text never matches a hub (positive control above, negative here)", () => {
  assert.equal(seriesHubFor({ event_series_id: "cosmic-bowling-night", event_name: "Cosmic Baseball watch party" }), null);
  assert.equal(seriesHubFor({}), null);
});
ok("hub lists only FL rows of its series, soonest first", () => {
  const rows = cosmicFloridaRows([
    { event_series_id: "cosmic-baseball-tropicana", state: "FL", start_date: "2027-08-21" },
    { event_series_id: "cosmic-baseball-jacksonville", state: "FL", start_date: "2027-03-19" },
    { event_series_id: "cosmic-baseball-durham", state: "NC", start_date: "2027-04-23" },
    { event_series_id: "enchant-stpete", state: "FL", start_date: "2026-11-20" },
  ]);
  assert.deepEqual(rows.map((r) => r.start_date), ["2027-03-19", "2027-08-21"]);
});
ok("every Florida series has a complete planning block with sources", () => {
  for (const k of ["cosmic-baseball-jacksonville", "cosmic-baseball-miami", "cosmic-baseball-tropicana"]) {
    const v = COSMIC_VENUES[k];
    assert.ok(v, "missing " + k);
    for (const f of ["venue", "city", "pick", "getThere", "bring", "gates", "access"]) assert.ok(String(v[f] || "").trim(), `${k}.${f}`);
    assert.ok(v.sources.length && v.sources.every((u) => u.startsWith("https://")), `${k}.sources`);
  }
});
ok("ticket copy never promises a ticket for entering", () => {
  const all = COSMIC_TICKET_STEPS.join(" ");
  assert.match(all, /does not guarantee/i);
  assert.doesNotMatch(all, /\bwin (?:a |your )?tickets?\b/i);
});
ok("every hub has a page, is in the sitemap and is linked from the event page", () => {
  const sm = strip(readFileSync("app/sitemap.js", "utf8"));
  assert.match(sm, /import\s*\{\s*EVENT_SERIES_HUBS\s*\}\s*from\s*"\.\.\/lib\/eventSeriesHubs\.js"/);
  assert.match(sm, /\.\.\.seriesHubs\b/);
  for (const h of EVENT_SERIES_HUBS) assert.ok(existsSync(`app${h.href}/page.js`), "no page for " + h.href);
  const ev = strip(readFileSync("app/florida-events/[slug]/page.js", "utf8"));
  assert.match(ev, /href=\{seriesHubFor\(e\)\.href\}/);
});
console.log(`check-event-series-hubs: OK — ${n} assertions (${EVENT_SERIES_HUBS.length} hub, 3 Florida series)`);
