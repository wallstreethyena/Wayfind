#!/usr/bin/env node
// scripts/anchor-events/validate.mjs — schema guard for data/florida-anchor-events.json,
// the canonical list of recurring Florida events Wayfind intends to cover.
// Rail ids are taken from RAIL_LIBRARY in lib/curatedEvents.js: imported when the module
// loads in this environment, otherwise parsed from the source (the assertion says which).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REGIONS = ["NW", "NE", "Central", "Tampa Bay", "SW", "SE", "Keys"];
const STATES = ["confirmed_dated", "expected_undated", "cancelled", "skipped"];
const NO_PROBE_HOST = "disneyworld.disney.go.com";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

async function loadRails() {
  try {
    const m = await import(path.join(ROOT, "lib/curatedEvents.js"));
    if (m.RAIL_LIBRARY && Object.keys(m.RAIL_LIBRARY).length) return { ids: Object.keys(m.RAIL_LIBRARY), how: "imported RAIL_LIBRARY from lib/curatedEvents.js" };
  } catch { /* fall through to parse */ }
  const src = readFileSync(path.join(ROOT, "lib/curatedEvents.js"), "utf8");
  const start = src.indexOf("export const RAIL_LIBRARY = {");
  if (start < 0) throw new Error("RAIL_LIBRARY declaration not found in lib/curatedEvents.js");
  const body = src.slice(start, src.indexOf("\n};", start));
  const ids = [...body.matchAll(/^  "([a-z0-9-]+)":/gm)].map((x) => x[1]);
  return { ids, how: "PARSED RAIL_LIBRARY keys from lib/curatedEvents.js source (module not importable here)" };
}

// Returns a list of problems; empty means valid.
export function validate(doc, railIds, knownEventIds = null) {
  const errs = [];
  const e = (m) => errs.push(m);
  const isStr = (v) => typeof v === "string" && v.trim().length > 0;
  if (!doc || typeof doc !== "object") return ["document is not an object"];
  if (doc.version !== 1) e("version must be 1");
  if (!ISO.test(doc.updated || "")) e("updated must be YYYY-MM-DD");
  if (!isStr(doc.criteria)) e("criteria must be a non-empty string");
  if (!Array.isArray(doc.anchors) || !doc.anchors.length) return [...errs, "anchors must be a non-empty array"];
  const seen = new Set();
  const seenEvent = new Set();
  const seenSeries = new Set();
  doc.anchors.forEach((a, i) => {
    const id = a && a.anchor_id;
    const at = `anchors[${i}] (${id})`;
    if (!a || typeof a !== "object") return e(`${at}: not an object`);
    if (!isStr(id) || !KEBAB.test(id)) e(`${at}: anchor_id must be kebab-case`);
    else if (/(?:^|-)20\d\d(?:-|$)/.test(id)) e(`${at}: anchor_id must not contain a year`);
    if (seen.has(id)) e(`${at}: duplicate anchor_id`);
    seen.add(id);
    for (const k of ["name", "city", "venue", "category"]) if (!isStr(a[k])) e(`${at}: ${k} must be a non-empty string`);
    if (!REGIONS.includes(a.region)) e(`${at}: region ${JSON.stringify(a.region)} not in ${REGIONS.join("/")}`);
    if (!isStr(a.official_domain)) e(`${at}: official_domain missing`);
    else if (!HOST.test(a.official_domain)) e(`${at}: official_domain must be a bare host, got ${a.official_domain}`);
    if (a.official_domain === NO_PROBE_HOST && a.probe !== false) e(`${at}: ${NO_PROBE_HOST} entries must set probe:false (automated requests are forbidden)`);
    if (a.probe !== undefined && typeof a.probe !== "boolean") e(`${at}: probe must be a boolean`);
    if (a.note !== undefined && !isStr(a.note)) e(`${at}: note must be a non-empty string when present`);
    if (!Array.isArray(a.tags) || a.tags.some((t) => !isStr(t))) e(`${at}: tags must be an array of strings`);
    const w = a.typical_window;
    const mo = (n) => Number.isInteger(n) && n >= 1 && n <= 12;
    if (!w || !mo(w.start_month) || !mo(w.end_month)) e(`${at}: typical_window months must be integers 1-12`);
    if (!Array.isArray(a.rails)) e(`${at}: rails must be an array`);
    else a.rails.forEach((r) => { if (!railIds.includes(r)) e(`${at}: unknown rail ${JSON.stringify(r)}`); });
    const x = a.expected_edition;
    if (!x || typeof x !== "object") return e(`${at}: expected_edition missing`);
    if (!Number.isInteger(x.year) || x.year < 2026 || x.year > 2035) e(`${at}: expected_edition.year out of range`);
    if (!STATES.includes(x.state)) e(`${at}: state ${JSON.stringify(x.state)} not in ${STATES.join("/")}`);
    if (!ISO.test(x.last_checked || "")) e(`${at}: last_checked must be YYYY-MM-DD`);
    if (x.event_series_id !== undefined && !isStr(x.event_series_id)) e(`${at}: event_series_id must be a non-empty string when present`);
    if (x.event_series_id !== undefined && !x.event_id) e(`${at}: event_series_id requires an event_id`);
    if (x.event_id !== null && !isStr(x.event_id)) e(`${at}: event_id must be a string or null`);
    if (x.source_url !== null && !(isStr(x.source_url) && /^https?:\/\//.test(x.source_url))) e(`${at}: source_url must be an http(s) URL or null`);
    if (x.lead_dates !== undefined) {
      const l = x.lead_dates;
      if (!l || typeof l !== "object" || !ISO.test(l.start || "") || !ISO.test(l.end || "") || Number.isNaN(Date.parse(l.start + "T00:00:00Z")) || Number.isNaN(Date.parse(l.end + "T00:00:00Z"))) e(`${at}: lead_dates must be {start,end} ISO dates`);
      else if (l.end < l.start) e(`${at}: lead_dates end is before start`);
      if (x.state !== "expected_undated") e(`${at}: lead_dates is only allowed on expected_undated entries`);
      if (x.source_url === null) e(`${at}: lead_dates requires the organizer source_url it came from`);
    }
    if (x.state === "confirmed_dated" && !isStr(x.event_id)) e(`${at}: confirmed_dated requires an event_id`);
    if (x.event_id) { if (seenEvent.has(x.event_id)) e(`${at}: duplicate event_id ${x.event_id}`); seenEvent.add(x.event_id); }
    if (x.event_series_id) { if (seenSeries.has(x.event_series_id)) e(`${at}: duplicate event_series_id ${x.event_series_id}`); seenSeries.add(x.event_series_id); }
    if (knownEventIds && x.event_id && !knownEventIds.has(x.event_id)) e(`${at}: event_id ${x.event_id} not found in known set`);
  });
  return errs;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { ids, how } = await loadRails();
  console.log(`rails: ${ids.length} ids (${how})`);
  if (ids.length < 5) { console.error("validate-anchors: FAIL, rail list looks truncated"); process.exit(1); }
  const doc = JSON.parse(readFileSync(path.join(ROOT, "data/florida-anchor-events.json"), "utf8"));
  const errs = validate(doc, ids);
  if (errs.length) {
    console.error(`validate-anchors: FAIL, ${errs.length} problem(s)`);
    errs.slice(0, 40).forEach((m) => console.error("  " + m));
    process.exit(1);
  }
  // Negative controls: each mutation of a copy must fail, otherwise the validator is toothless.
  const mut = (fn, want) => {
    const c = JSON.parse(JSON.stringify(doc));
    fn(c);
    const r = validate(c, ids);
    if (!r.some((m) => m.includes(want))) { console.error(`validate-anchors: FAIL, negative control "${want}" was not caught`); process.exit(1); }
  };
  mut((c) => { c.anchors[1].anchor_id = c.anchors[0].anchor_id; }, "duplicate anchor_id");
  mut((c) => { c.anchors[0].rails.push("not-a-rail"); }, "unknown rail");
  mut((c) => { c.anchors[0].region = "Atlantis"; }, "region");
  mut((c) => { c.anchors[0].official_domain = ""; }, "official_domain");
  mut((c) => { c.anchors[0].expected_edition.state = "confirmed_dated"; c.anchors[0].expected_edition.event_id = null; }, "requires an event_id");
  mut((c) => { const d = c.anchors.find((a) => a.official_domain === NO_PROBE_HOST); delete d.probe; }, "probe:false");
  mut((c) => { const d = c.anchors.find((a) => a.expected_edition.event_id); d.expected_edition.event_series_id = ""; }, "event_series_id");
  mut((c) => { const d = c.anchors.find((a) => a.expected_edition.state === "expected_undated"); d.expected_edition.source_url = "https://example.org/x"; d.expected_edition.lead_dates = { start: "2027-03-05", end: "2027-03-01" }; }, "lead_dates end is before start");
  mut((c) => { const d = c.anchors.find((a) => a.expected_edition.state === "confirmed_dated"); d.expected_edition.lead_dates = { start: "2027-03-01", end: "2027-03-02" }; }, "only allowed on expected_undated");
  mut((c) => { const d = c.anchors.find((a) => a.expected_edition.state === "expected_undated"); d.expected_edition.source_url = null; d.expected_edition.lead_dates = { start: "2027-03-01", end: "2027-03-02" }; }, "requires the organizer source_url");
  mut((c) => { const d = c.anchors.find((a) => a.expected_edition.state === "expected_undated"); d.expected_edition.source_url = "https://example.org/x"; d.expected_edition.lead_dates = { start: "2027-13-01", end: "2027-13-02" }; }, "lead_dates must be");
  mut((c) => { const l = c.anchors.filter((a) => a.expected_edition.event_id); l[1].expected_edition.event_id = l[0].expected_edition.event_id; }, "duplicate event_id");
  mut((c) => { const l = c.anchors.filter((a) => a.expected_edition.event_series_id); l[1].expected_edition.event_series_id = l[0].expected_edition.event_series_id; }, "duplicate event_series_id");
  const counts = {};
  for (const a of doc.anchors) counts[a.region] = (counts[a.region] || 0) + 1;
  for (const r of REGIONS) console.log(`  ${r}: ${counts[r] || 0}`);
  console.log(`${doc.anchors.length} anchors validated (13 negative controls caught)`);
}
