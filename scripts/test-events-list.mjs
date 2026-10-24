// v5.50 audit remediation, Phase 5 — event LIST window logic (prebuild).
// The date math for this-weekend/tonight/this-month must be correct and
// inclusive so a shared /events/[city]/this-weekend URL always shows the
// right window.
import { EVENT_WINDOWS, isEventWindow, windowRange, eventInWindow, filterByWindow, spreadAcrossDays } from "../lib/eventsList.js";
import { readFileSync } from "node:fs";

let failures = 0;
const fail = (m) => { console.error("test-events-list: FAIL — " + m); failures++; };

// 1. Window slugs are recognized; a detail slug is not.
if (!isEventWindow("this-weekend")) fail("this-weekend should be a window");
if (!isEventWindow("tonight")) fail("tonight should be a window");
if (!isEventWindow("this-month")) fail("this-month should be a window");
if (isEventWindow("orlando-shakespeare-summer--tm_123")) fail("an event-detail slug must NOT be a window");
if (Object.keys(EVENT_WINDOWS).length !== 3) fail("expected exactly 3 windows");

// 2. tonight = today only (inclusive).
{
  const now = new Date("2026-07-15T16:00:00Z"); // Wed Jul 15 2026
  const r = windowRange("tonight", now);
  if (r.start !== "2026-07-15" || r.end !== "2026-07-15") fail(`tonight range wrong: ${JSON.stringify(r)}`);
  if (!eventInWindow({ date: "2026-07-15" }, "tonight", now)) fail("today's event should be tonight");
  if (eventInWindow({ date: "2026-07-16" }, "tonight", now)) fail("tomorrow must not be tonight");
}

// 3. this-weekend from a weekday = the upcoming Fri-Sun.
{
  const wed = new Date("2026-07-15T16:00:00Z"); // Wed Jul 15
  const r = windowRange("this-weekend", wed);
  if (r.start !== "2026-07-17" || r.end !== "2026-07-19") fail(`this-weekend (from Wed) should be Fri17-Sun19, got ${JSON.stringify(r)}`);
  if (!eventInWindow({ date: "2026-07-18" }, "this-weekend", wed)) fail("Sat should be in this-weekend");
  if (eventInWindow({ date: "2026-07-20" }, "this-weekend", wed)) fail("Mon must not be in this-weekend");
  if (eventInWindow({ date: "2026-07-16" }, "this-weekend", wed)) fail("Thu must not be in this-weekend");
}

// 4. this-weekend WHILE it's the weekend uses the current one (from today).
{
  const sat = new Date("2026-07-18T16:00:00Z"); // Sat Jul 18
  const r = windowRange("this-weekend", sat);
  if (r.start !== "2026-07-18" || r.end !== "2026-07-19") fail(`this-weekend (from Sat) should be Sat18-Sun19, got ${JSON.stringify(r)}`);
}

// 5. this-month = today .. +31d inclusive.
{
  const now = new Date("2026-07-15T16:00:00Z");
  const r = windowRange("this-month", now);
  if (r.start !== "2026-07-15") fail("this-month should start today");
  if (!eventInWindow({ date: "2026-08-10" }, "this-month", now)) fail("an event 26 days out should be in this-month");
  if (eventInWindow({ date: "2026-09-01" }, "this-month", now)) fail("48 days out must not be in this-month");
}

// 6. filterByWindow keeps only in-window, drops undated/malformed.
{
  const wed = new Date("2026-07-15T16:00:00Z");
  const evs = [{ date: "2026-07-18" }, { date: "2026-07-20" }, { date: "" }, { date: "not-a-date" }, {}];
  const kept = filterByWindow(evs, "this-weekend", wed);
  if (kept.length !== 1 || kept[0].date !== "2026-07-18") fail(`filterByWindow kept wrong set: ${JSON.stringify(kept)}`);
}

// 7. spreadAcrossDays (2026-10-23): a date-ordered feed capped at 60 must not
// collapse "this-month" onto its first weekend. 31 days x 20 events each:
// every day appears, no day gets more than ceil(60/31)=2, order is by date,
// and within a day the feed's ranking is kept.
{
  const feed = [];
  for (let d = 0; d < 31; d++) {
    const day = new Date(Date.UTC(2026, 9, 23 + d)).toISOString().slice(0, 10);
    for (let k = 0; k < 20; k++) feed.push({ id: `${day}#${k}`, date: day, rank: k });
  }
  const out = spreadAcrossDays(feed, 60);
  const days = new Map(); out.forEach((e) => days.set(e.date, (days.get(e.date) || 0) + 1));
  if (out.length !== 60) fail(`spreadAcrossDays should keep 60, kept ${out.length}`);
  if (days.size !== 31) fail(`every one of 31 days should appear, got ${days.size}`);
  if (Math.max(...days.values()) > 2) fail("no day may hold more than 2 of 60 slots across 31 days");
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (a.date > b.date) { fail("output must be in date order"); break; }
    if (a.date === b.date && a.rank > b.rank) { fail("within a day the feed ranking must be kept"); break; }
  }
  if (out[0].rank !== 0) fail("each day's top-ranked event must be its first pick");
  // Negative control: the old slice(0,60) really did collapse onto 3 days.
  const old = new Set(feed.slice(0, 60).map((e) => e.date));
  if (old.size !== 3) fail(`control: slice(0,60) should cover 3 days, covered ${old.size}`);
  // Under the cap nothing is dropped or reordered; bad cap yields [].
  const small = feed.slice(0, 10);
  if (JSON.stringify(spreadAcrossDays(small, 60)) !== JSON.stringify(small)) fail("under the cap the list must pass through unchanged");
  if (spreadAcrossDays(feed, 0).length !== 0 || spreadAcrossDays(null, 60).length !== 0) fail("cap 0 / null input must yield []");
}

// 8. The window page actually uses it (code, comments stripped) and no longer
// hard-slices the filtered feed.
{
  const src = readFileSync("app/events/[city]/[slug]/page.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (!/const\s+events\s*=\s*spreadAcrossDays\(\s*filterByWindow\(/.test(src)) fail("EventListPage must build events with spreadAcrossDays(filterByWindow(...), N)");
  if (/filterByWindow\([^)]*\)\s*\.slice\(/.test(src)) fail("EventListPage still slices the date-ordered feed directly");
}

if (failures) process.exit(1);
console.log("test-events-list: OK — window date math is correct and inclusive; detail slugs aren't mistaken for windows; capped lists spread across every day");
