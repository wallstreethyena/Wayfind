// v5.50 audit remediation, Phase 5 — event LIST window logic (prebuild).
// The date math for this-weekend/tonight/this-month must be correct and
// inclusive so a shared /events/[city]/this-weekend URL always shows the
// right window.
import { EVENT_WINDOWS, isEventWindow, windowRange, eventInWindow, filterByWindow } from "../lib/eventsList.js";

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
  const now = new Date(2026, 6, 15); // Wed Jul 15 2026
  const r = windowRange("tonight", now);
  if (r.start !== "2026-07-15" || r.end !== "2026-07-15") fail(`tonight range wrong: ${JSON.stringify(r)}`);
  if (!eventInWindow({ date: "2026-07-15" }, "tonight", now)) fail("today's event should be tonight");
  if (eventInWindow({ date: "2026-07-16" }, "tonight", now)) fail("tomorrow must not be tonight");
}

// 3. this-weekend from a weekday = the upcoming Fri-Sun.
{
  const wed = new Date(2026, 6, 15); // Wed Jul 15
  const r = windowRange("this-weekend", wed);
  if (r.start !== "2026-07-17" || r.end !== "2026-07-19") fail(`this-weekend (from Wed) should be Fri17-Sun19, got ${JSON.stringify(r)}`);
  if (!eventInWindow({ date: "2026-07-18" }, "this-weekend", wed)) fail("Sat should be in this-weekend");
  if (eventInWindow({ date: "2026-07-20" }, "this-weekend", wed)) fail("Mon must not be in this-weekend");
  if (eventInWindow({ date: "2026-07-16" }, "this-weekend", wed)) fail("Thu must not be in this-weekend");
}

// 4. this-weekend WHILE it's the weekend uses the current one (from today).
{
  const sat = new Date(2026, 6, 18); // Sat Jul 18
  const r = windowRange("this-weekend", sat);
  if (r.start !== "2026-07-18" || r.end !== "2026-07-19") fail(`this-weekend (from Sat) should be Sat18-Sun19, got ${JSON.stringify(r)}`);
}

// 5. this-month = today .. +31d inclusive.
{
  const now = new Date(2026, 6, 15);
  const r = windowRange("this-month", now);
  if (r.start !== "2026-07-15") fail("this-month should start today");
  if (!eventInWindow({ date: "2026-08-10" }, "this-month", now)) fail("an event 26 days out should be in this-month");
  if (eventInWindow({ date: "2026-09-01" }, "this-month", now)) fail("48 days out must not be in this-month");
}

// 6. filterByWindow keeps only in-window, drops undated/malformed.
{
  const wed = new Date(2026, 6, 15);
  const evs = [{ date: "2026-07-18" }, { date: "2026-07-20" }, { date: "" }, { date: "not-a-date" }, {}];
  const kept = filterByWindow(evs, "this-weekend", wed);
  if (kept.length !== 1 || kept[0].date !== "2026-07-18") fail(`filterByWindow kept wrong set: ${JSON.stringify(kept)}`);
}

if (failures) process.exit(1);
console.log("test-events-list: OK — window date math is correct and inclusive; detail slugs aren't mistaken for windows");
