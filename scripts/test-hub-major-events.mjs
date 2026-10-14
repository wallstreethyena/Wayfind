#!/usr/bin/env node
// scripts/test-hub-major-events.mjs — the hub's "Major Florida events by month" section.
// Runs the REAL majorEventsByMonth() on fixture rows (grouping/order, dedupe, non-anchor
// exclusion, ended rows, series match), then checks the page IMPORTS and CALLS it with the
// hub's eligible rows and hides the section on skip/empty. Positive and negative controls
// included. Optional argv: [libPath] [pagePath] so red-proves run against mutated temp copies.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = process.argv[2] || join(ROOT, "lib/majorEventsByMonth.js");
const PAGE = process.argv[3] || join(ROOT, "app/florida-events/page.js");
const { majorEventsByMonth } = process.argv[2] ? await import(pathToFileURL(LIB).href) : await import("../lib/majorEventsByMonth.js");

const fails = [];
let n = 0;
const ok = (c, m) => { n++; if (!c) fails.push(m); };

const row = (id, slug, start, end, extra = {}) => ({ event_id: id, slug, event_name: slug.toUpperCase(), city: "Tampa", start_date: start, end_date: end, ...extra });
const anchor = (id, series) => ({ expected_edition: { event_id: id, event_series_id: series || null } });
const TODAY = "2026-10-14";

const anchors = [anchor("a-2026", "a"), anchor("b-2026", null), anchor(null, "c-series"), anchor("never-2026", null)];
const rows = [
  row("b-2026", "b", "2026-11-05", "2026-11-07"),
  row("a-2026", "a", "2026-12-20", "2026-12-21"),
  row("a-2026-early", "a-early", "2026-10-20", "2026-10-21", { event_series_id: "zzz" }), // not an anchor match
  row("c-2027", "c", "2027-01-09", "2027-01-09", { event_series_id: "c-series" }), // series match
  row("c-2026-late", "c-late", "2027-03-01", "2027-03-01", { event_series_id: "c-series" }), // dedupe: later row of same anchor
  row("a-2026", "a-dup", "2026-12-01", "2026-12-02"), // dedupe: sooner row for anchor a
  row("x-1", "x", "2026-10-25", "2026-10-26"), // non-anchor
  row("b-2026", "b-over", "2026-09-01", "2026-09-02"), // ended: must not pull b into Sept
  row("a-2026", "a-run", "2026-08-07", "2026-10-31", { }), // in progress: soonest, lands in current month
];
const out = majorEventsByMonth(rows, anchors, TODAY);
const flat = out.flatMap((m) => m.events.map((e) => m.monthKey + ":" + e.slug));
ok(JSON.stringify(out.map((m) => m.monthKey)) === JSON.stringify(["2026-10", "2026-11", "2027-01"]), "month order/grouping wrong: " + JSON.stringify(out.map((m) => m.monthKey)));
ok(flat.join() === "2026-10:a-run,2026-11:b,2027-01:c", "events wrong: " + flat.join());
ok(out[0].label === "October 2026", "label wrong: " + out[0].label);
ok(out[0].events[0].event_id === "a-2026" && out[0].events[0].city === "Tampa" && out[0].events[0].when === "Aug 7 – Oct 31", "event shape/when wrong: " + JSON.stringify(out[0].events[0]));
ok(!flat.some((s) => /:x$|a-early|a-dup|c-late|b-over/.test(s)), "non-anchor/duplicate/ended row leaked: " + flat.join());
// dedupe: one entry per anchor
ok(flat.length === 3, "expected exactly one row per matched anchor, got " + flat.length);
// two rows, one anchor -> one entry (soonest)
const dup = majorEventsByMonth([row("a-2026", "later", "2026-12-20", "2026-12-21"), row("a-2026", "sooner", "2026-11-02", "2026-11-03")], [anchor("a-2026")], TODAY);
ok(dup.length === 1 && dup[0].events.length === 1 && dup[0].events[0].slug === "sooner", "dedupe did not keep the soonest: " + JSON.stringify(dup));
// within-month date order
const ord = majorEventsByMonth([row("p", "p", "2026-11-20", "2026-11-20"), row("q", "q", "2026-11-03", "2026-11-03")], [anchor("p"), anchor("q")], TODAY);
ok(ord[0].events.map((e) => e.slug).join() === "q,p", "within-month order wrong");
// ended-only anchor yields nothing
ok(majorEventsByMonth([row("a-2026", "gone", "2026-09-01", "2026-09-02")], [anchor("a-2026")], TODAY).length === 0, "ended row shown");
// series match alone (event_id differs)
ok(majorEventsByMonth([row("other", "s", "2026-11-11", "2026-11-11", { event_series_id: "c-series" })], [anchor(null, "c-series")], TODAY).length === 1, "series match failed");
// null/empty anchors never match rows with undefined ids
ok(majorEventsByMonth([row(undefined, "u", "2026-11-11", "2026-11-11")], [anchor(null, null)], TODAY).length === 0, "null-id anchor matched");
// two anchors resolving to the same event -> listed once
const two = majorEventsByMonth([row("same", "same", "2026-11-11", "2026-11-11", { event_series_id: "ss" })], [anchor("same"), anchor(null, "ss")], TODAY);
ok(two.flatMap((m) => m.events).length === 1, "row shared by two anchors listed twice: " + JSON.stringify(two));
// bad input is empty, never a throw
ok(majorEventsByMonth(null, anchors, TODAY).length === 0 && majorEventsByMonth(rows, anchors, "nope").length === 0, "bad input not empty");
// control: the fixture is not vacuous (a non-anchor list yields nothing, an anchor list yields something)
ok(majorEventsByMonth(rows, [anchor("nothing")], TODAY).length === 0, "negative control: unrelated anchor matched");
ok(out.length > 0, "positive control: empty output on matching fixture");

// ---- page wiring: assert the import and the CALL, on comment/string-stripped code ----
function stripCode(src) {
  let o = "", i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i + 2); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; o += q; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      o += q; i++; continue; // string contents dropped
    }
    o += c; i++;
  }
  return o;
}
const rawPage = readFileSync(PAGE, "utf8");
const page = stripCode(rawPage);
const importRe = /import\s*\{[^}]*\bmajorEventsByMonth\b[^}]*\}\s*from\s*(["'`])\1/; // path string emptied by stripper
ok(importRe.test(page), "page does not import { majorEventsByMonth }");
ok(/from\s*["'`]\s*["'`]/.test(page) && /from\s+"\.\.\/\.\.\/lib\/majorEventsByMonth"/.test(rawPage.replace(/\/\/.*$/gm, "")), "page import is not from lib/majorEventsByMonth");
const calls = page.match(/(?<![\w.])majorEventsByMonth\s*\(/g) || [];
// one call + the import binding is not a call, so exactly 1 call expression
ok(calls.length === 1, "expected exactly 1 majorEventsByMonth( call in page, found " + calls.length);
const callM = page.match(/const\s+majorByMonth\s*=\s*([^;]*?majorEventsByMonth\s*\(\s*model\.eligible\s*,[^;]*);/);
ok(!!callM, "call is not assigned to majorByMonth with model.eligible as first arg");
ok(callM && /model\.skipped\s*\?\s*\[\]\s*:/.test(callM[1]) , "call is not gated by model.skipped");
ok(callM && /siteTodayStr\s*\(\s*now\s*\)/.test(callM[1]), "today does not come from siteTodayStr(now)");
ok(/\bmajorByMonth\.length\s*>\s*0\s*\?/.test(page), "section is not rendered conditionally on majorByMonth.length > 0");
ok(/\bmajorByMonth\.map\s*\(/.test(page) && /<h3[\s>]/.test(page), "page does not map months to an <h3> heading");
ok(/<h2\s+id=\{?\s*["']?\s*["']?/.test(page) && /aria-labelledby=/.test(page), "section title is not an h2 with aria-labelledby");
ok(/<a\b/.test(page), "section renders no anchors");
ok(!/toISOString/.test(page), "page uses toISOString for dates");
// section sits after the rails map and before the footer paragraph
const iRails = page.indexOf("model.rails.map"), iSec = page.indexOf("majorByMonth.length"), iFoot = page.indexOf("S.foot");
ok(iRails > 0 && iSec > iRails && iFoot > iSec, "section is not between the rails and the footer");
// RAILS unchanged
ok(/const RAILS = \["this-weekend", "spooky-season", "coming-up", "florida-icons", "major-music-festivals", "only-in-florida", "live-music", "bring-the-kids", "food-festivals"\];/.test(rawPage), "RAILS changed");
// controls on the page probe itself
ok(!/(?<![\w.])majorEventsByMonth\s*\(/.test(stripCode("// majorEventsByMonth(x)\nconst s = 'majorEventsByMonth(';")), "negative control: comment/string counted as a call");
ok(/(?<![\w.])majorEventsByMonth\s*\(/.test(stripCode("const r = majorEventsByMonth(a, b);")), "positive control: real call not found");

if (fails.length) { console.error("test-hub-major-events: FAIL (" + fails.length + "/" + n + ")\n - " + fails.join("\n - ")); process.exit(1); }
console.log("test-hub-major-events: OK (" + n + " assertions; real majorEventsByMonth on 9 fixture rows + page import/call/gating/position checks)");
