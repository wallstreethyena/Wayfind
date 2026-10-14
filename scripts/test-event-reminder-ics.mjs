#!/usr/bin/env node
// scripts/test-event-reminder-ics.mjs: every .ics the "Remind me" route can serve,
// parsed by a REAL RFC 5545 library (python icalendar, and vobject when present),
// never by our own parser.
//
// Why: lib/eventReminder.js builds the text, and scripts/test-event-reminder.mjs
// parses it with a parser we wrote, so a misreading we share would pass. Here the
// route (lib/eventReminderRoute.js, end to end, real stored rows) writes files and
// icalendar answers: do they parse, is DTSTART in the venue's TZID, does the
// VTIMEZONE in the file say the same UTC instant the platform tz database does,
// is the VALARM an absolute UTC trigger at the right time, do escaping, folding and
// CRLF round trip, and does the Google Calendar link carry the same UTC instants?
//
// Expected instants come from lib/eventTime.js (the JSON-LD clock, Intl based), not
// from the builder's own daylight saving rules, so the two clocks check each other.
//
// Needs python3 with `icalendar` (pip install icalendar vobject). Point
// --python=/path/to/venv/bin/python (or put that venv first on PATH) if python3 does not have it. Without the parser
// this guard says plainly that the real-parser half did NOT run; with
// --require-parser (CI that installs it) that is a failure.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { handleReminderRequest } from "../lib/eventReminderRoute.js";
import * as R from "../lib/eventReminder.js";
import * as F from "../lib/eventReminderFacts.js";
import { eventIsoWithOffset } from "../lib/eventTime.js";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRE = process.argv.includes("--require-parser");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const SITE = "https://www.gowayfind.com";
const NOW = Date.parse("2026-10-14T12:00:00Z");
const TODAY = "2026-10-14";
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const compact = (z) => z.replace(/[-:]/g, "");

const python = (process.argv.find((a) => a.startsWith("--python=")) || "--python=python3").slice("--python=".length);
const has = spawnSync(python, ["-c", "import icalendar,sys;print(icalendar.__version__)"], { encoding: "utf8" });
// Python icalendar is an optional second opinion. The required parser is ical.js (Mozilla's, an npm devDependency), which always runs.
const pyOk = has.status === 0;
if (!pyOk && REQUIRE) { console.log("test-event-reminder-ics: FAIL (icalendar is not installed for " + python + ", and --require-parser was given)"); process.exit(1); }
let ICAL;
try { ICAL = (await import("ical.js")).default; } catch (e) { ICAL = null; }
if (!ICAL) { console.log("test-event-reminder-ics: FAIL (the ical.js parser is not installed: run npm ci. This guard never skips its parser.)"); process.exit(1); }

const regs = await Promise.all(["fallDiscoveries2026", "fallFeaturedFestivals2026", "fallGapFill20261007", "fallFoodGap20261008", "fallTampaPicks20261008"].map((f) => import("../lib/" + f + ".js")));
const FALL = regs.flatMap((m) => Object.values(m).find(Array.isArray) || []);
const XMAS = mergeChristmasResearch([]);
const real = (id) => [...FALL, ...XMAS].find((r) => r.event_id === id);

// One case = a stored row, a night and a reminder, plus what must come out.
const stress = { slug: "stress-test-2026", event_id: "stress-test-2026", event_name: "Lights, Camera; Action \\ \"Quotes\" and a very long event name that must fold across several content lines ☃ \u{1F384} café 中文", start_date: "2026-11-21", end_date: "2026-11-21", start_time: "19:00:00", end_time: "21:00:00", venue: "The Hall, Annex; Room \\ 5", city: "St. Petersburg", state: "FL", address: "100 Central Ave, Suite 2", county: "Pinellas", lat: 27.77, lng: -82.64, card_hook: "Line one, with commas; semicolons \\ backslashes\nand a second line ☃ that is long enough to need folding on its own, definitely past 75 octets.", event_status: "scheduled" };
const dstCt = { ...real("pensacola-beach-fireworks-cruise-2026"), start_date: "2026-11-01", end_date: "2026-11-01", start_time: "18:00:00", end_time: "21:00:00", event_id: "ct-dst-test", slug: "ct-dst-test" };
const CASES = [
  { id: "fall-eve", row: real("fruitville-grove-pumpkin-2026"), night: "2026-10-17", remind: "eve", alarm: ["2026-10-16", "18:00"] },
  { id: "fall-oct31-2h", row: real("fruitville-grove-pumpkin-2026"), night: "2026-10-31", remind: "2h", alarm: ["2026-10-31", "08:00"] },
  { id: "fall-nov1-2h-dst", row: real("fruitville-grove-pumpkin-2026"), night: "2026-11-01", remind: "2h", alarm: ["2026-11-01", "08:00"] },
  { id: "halloween-allday", row: real("haunted-mangoni-2026"), night: "2026-10-20", remind: "am", alarm: ["2026-10-20", "09:00"], allDay: true },
  { id: "christmas-eve", row: real("sunset-walk-holiday-nights-2026"), night: "2026-12-03", remind: "eve", alarm: ["2026-12-02", "18:00"] },
  { id: "christmas-ticket-2h", row: real("jollywood-nights-2026"), night: "2026-12-05", remind: "2h", alarm: ["2026-12-05", "17:30"], ticket: true },
  { id: "jan2027-overnight", row: real("jollywood-nights-2026"), night: "2027-01-05", remind: "2h", alarm: ["2027-01-05", "17:30"], ticket: true },
  { id: "panhandle-2h", row: real("pensacola-beach-fireworks-cruise-2026"), night: "2026-12-04", remind: "2h", alarm: ["2026-12-04", "16:30"] },
  { id: "panhandle-dst-2h", row: dstCt, night: "2026-11-01", remind: "2h", alarm: ["2026-11-01", "16:00"] },
  { id: "panhandle-1w-cdt", row: dstCt, night: "2026-11-01", remind: "1w", alarm: ["2026-10-25", "09:00"] },
  { id: "stress", row: stress, night: "2026-11-21", remind: "eve", alarm: ["2026-11-20", "18:00"] },
  { id: "custom", row: stress, night: "2026-11-21", remind: "2026-11-21T15:25", alarm: ["2026-11-21", "15:25"] },
];

const dir = mkdtempSync(path.join(os.tmpdir(), "wf-ics-"));
const manifest = [];
const meta = new Map();
let nowMs = NOW;
for (const c of CASES) {
  ok(!!c.row, `PROBE ${c.id}: the real row exists`);
  const res = await handleReminderRequest(new Request(`${SITE}/api/events/reminder?slug=${c.row.slug}&night=${c.night}&remind=${encodeURIComponent(c.remind)}`), {
    lookup: async () => c.row, nowMs, siteUrl: SITE,
  });
  const body = await res.text();
  ok(res.status === 200, `${c.id}: the route answered 200 (got ${res.status}: ${body.slice(0, 100)})`);
  if (res.status !== 200) continue;
  const file = path.join(dir, c.id + ".ics");
  writeFileSync(file, body);
  manifest.push({ file });
  const tz = F.reminderZoneFor(c.row);
  const f = F.reminderFactsFor(c.row, { today: TODAY });
  // Expected instants from the JSON-LD clock (lib/eventTime.js), independent of the builder's DST rules.
  const at = (day, clock) => Date.parse(eventIsoWithOffset(day, clock, tz));
  const startMs = c.allDay ? null : at(c.night, f.start_time);
  let endMs = null;
  if (!c.allDay) {
    endMs = f.end_time ? at(c.night, f.end_time) : startMs + 7200000;
    if (endMs <= startMs) endMs = f.end_time ? at(R.addDays(c.night, 1), f.end_time) : startMs + 7200000;
  }
  meta.set(file, { c, tz, f, startMs, endMs, alarmMs: at(c.alarm[0], c.alarm[1]), body });
}

const run = !pyOk ? { status: 0, stdout: "[]", stderr: "" } : spawnSync(python, [path.join(ROOT, "scripts/lib/validate-reminder-ics.py"), (() => { const p = path.join(dir, "manifest.json"); writeFileSync(p, JSON.stringify(manifest)); return p; })()], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
ok(run.status === 0, `every file parses in icalendar (exit ${run.status}): ${(run.stderr || "").slice(-300)}`);
let results = [];
try { results = JSON.parse(run.stdout); } catch { ok(false, "the validator printed JSON: " + run.stdout.slice(0, 200)); }
const parser = results[0] && results[0].parser;
ok(!pyOk || (results.length === manifest.length && results.every((r) => !r.error), `all ${manifest.length} files parsed (${results.filter((r) => r.error).map((r) => r.file + ": " + r.error).join("; ")})`));

const alarmsReport = [];
for (const r of results) {
  if (r.error) continue;
  const { c, tz, f, startMs, endMs, alarmMs, body } = meta.get(r.file);
  const id = c.id;
  ok(r.events === 1 && r.alarms === 1 && r.version === "2.0" && r.method === "PUBLISH", `${id}: one VEVENT, one VALARM, VERSION 2.0, METHOD PUBLISH`);
  ok(r.crlf_only && r.ends_crlf, `${id}: every line ends CRLF, no bare LF`);
  ok(r.max_octets <= 75, `${id}: no content line over 75 octets (longest ${r.max_octets})`);
  ok(r.uid === createHash("sha256").update(c.row.slug + c.night).digest("hex") + "@gowayfind.com", `${id}: UID is sha256(slug + night)@gowayfind.com as the parser read it`);
  ok(r.summary === f.name, `${id}: SUMMARY round trips exactly through escaping and folding (${JSON.stringify(r.summary.slice(0, 60))})`);
  ok(r.url === `${SITE}/florida-events/${c.row.slug}?utm_source=calendar&utm_medium=reminder`, `${id}: URL is the event page`);
  const wantDesc = (f.hook || (f.name + (f.location ? " at " + f.location : "") + "."));
  ok(r.description.startsWith(wantDesc) && r.description.includes("Event page: " + r.url), `${id}: DESCRIPTION round trips (hook text, newlines, commas, semicolons, backslashes) and names the event page`);
  if (f.location) ok(r.location === f.location, `${id}: LOCATION round trips (${JSON.stringify(r.location)})`);
  if (c.ticket) ok(/Tickets: https:\/\/www\.gowayfind\.com\/api\/commerce\/go\?/.test(r.description) && !/undercovertourist/i.test(r.description), `${id}: the ticket line is the on-site /api/commerce/go route`);
  else ok(!/Tickets:/.test(r.description), `${id}: no ticket line when there is no partner route`);
  // Time
  if (c.allDay) {
    ok(r.dtstart_value === "DATE" && r.dtstart_date === c.night && r.dtend_date === R.addDays(c.night, 1) && !r.dtstart_tzid, `${id}: all day event is DTSTART;VALUE=DATE ${c.night} to the next day, with no TZID`);
  } else {
    ok(r.dtstart_tzid === tz && r.dtend_tzid === tz, `${id}: DTSTART and DTEND carry TZID=${tz} (got ${r.dtstart_tzid} / ${r.dtend_tzid})`);
    ok(r.dtstart_utc === iso(startMs) && r.dtend_utc === iso(endMs), `${id}: icalendar resolves the event to ${iso(startMs)} to ${iso(endMs)} (got ${r.dtstart_utc} to ${r.dtend_utc})`);
    ok(r.dtstart_utc_from_vtimezone === iso(startMs) && r.dtend_utc_from_vtimezone === iso(endMs), `${id}: the VTIMEZONE inside the file, read alone, gives the same instants (${r.dtstart_utc_from_vtimezone} to ${r.dtend_utc_from_vtimezone})`);
    ok(r.vobject_ok === null || (r.vobject_dtstart_utc === iso(startMs) && r.vobject_summary === f.name), `${id}: vobject agrees (${r.vobject_ok === null ? "not installed" : r.vobject_dtstart_utc})`);
  }
  ok(r.tzids_defined.join() === (c.allDay ? "America/New_York" : tz) && r.tzids_used.every((z) => r.tzids_defined.includes(z)), `${id}: every TZID used is defined by a VTIMEZONE in the file (used ${r.tzids_used.join() || "none"}, defined ${r.tzids_defined.join()})`);
  // Alarm
  ok(r.trigger_value === "DATE-TIME" && r.trigger_is_datetime && r.trigger_tz_aware && /^TRIGGER;VALUE=DATE-TIME:\d{8}T\d{6}Z$/.test(r.trigger_raw), `${id}: VALARM TRIGGER is an absolute UTC date time (${r.trigger_raw})`);
  ok(r.alarm_action === "DISPLAY" && r.alarm_utc === iso(alarmMs), `${id}: the alarm fires at ${iso(alarmMs)} (${c.alarm[0]} ${c.alarm[1]} venue time), icalendar read ${r.alarm_utc}`);
  ok(r.vobject_ok === null || r.vobject_alarm_utc === iso(alarmMs), `${id}: vobject reads the same alarm instant`);
  if (!c.allDay) ok(Date.parse(r.alarm_utc) < Date.parse(r.dtstart_utc), `${id}: the alarm is before the event starts`);
  ok(r.roundtrip_ok, `${id}: icalendar serialises and re-parses the file to the same event`);
  ok(r.cli_rc === 0 && r.cli_has_summary, `${id}: the icalendar command line preview (python -m icalendar.cli) exits 0 and names the event`);
  // Google link: its dates param must be the same UTC instants the .ics carries.
  const google = R.googleCalendarUrl({ facts: f, night: c.night, siteUrl: SITE, ticketHref: null });
  const q = new URL(google).searchParams;
  const want = c.allDay ? c.night.replace(/-/g, "") + "/" + R.addDays(c.night, 1).replace(/-/g, "") : compact(r.dtstart_utc) + "/" + compact(r.dtend_utc);
  ok(q.get("dates") === want, `${id}: the Google link dates (${q.get("dates")}) equal the .ics instants parsed by icalendar (${want})`);
  ok(c.allDay ? !q.get("ctz") : q.get("ctz") === tz, `${id}: the Google link names the venue zone for display (ctz=${q.get("ctz")})`);
  if (["fall-nov1-2h-dst", "panhandle-2h", "jan2027-overnight"].includes(id)) alarmsReport.push(`${id}: alarm ${r.alarm_utc}, event ${r.dtstart_utc || r.dtstart_date} ${tz}`);
}
// ── ical.js (always runs): every generated file, parsed by Mozilla's RFC 5545 parser ──
{
  const icalReport = [];
  for (const [file, m] of meta) {
    const { c, tz, f, startMs, endMs, alarmMs, body } = m;
    const id = c.id;
    let root;
    try { root = new ICAL.Component(ICAL.parse(body)); } catch (e) { ok(false, `${id}: ical.js parses the file (${e.message})`); continue; }
    for (const vtz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(vtz);
    const events = root.getAllSubcomponents("vevent");
    ok(events.length === 1 && root.getFirstPropertyValue("version") === "2.0", `${id}: ical.js sees one VEVENT and VERSION 2.0`);
    const ev = new ICAL.Event(events[0]);
    ok(ev.uid === createHash("sha256").update(c.row.slug + c.night).digest("hex") + "@gowayfind.com", `${id}: ical.js reads the stable UID`);
    ok(ev.summary === f.name, `${id}: ical.js reads SUMMARY exactly (escaping and folding round trip)`);
    if (c.allDay) {
      ok(ev.startDate.isDate && ev.startDate.toString() === c.night && ev.endDate.toString() === R.addDays(c.night, 1), `${id}: ical.js reads an all day event on ${c.night}`);
    } else {
      const s0 = Math.round(ev.startDate.toUnixTime() * 1000), e0 = Math.round(ev.endDate.toUnixTime() * 1000);
      ok(s0 === startMs && e0 === endMs, `${id}: ical.js resolves the event (TZID ${ev.startDate.zone && ev.startDate.zone.tzid}) to ${iso(startMs)} to ${iso(endMs)} (got ${iso(s0)} to ${iso(e0)})`);
      ok(ev.startDate.zone && ev.startDate.zone.tzid === tz, `${id}: ical.js sees TZID ${tz}`);
    }
    const alarms = events[0].getAllSubcomponents("valarm");
    ok(alarms.length === 1, `${id}: ical.js sees one VALARM`);
    const trig = alarms[0].getFirstPropertyValue("trigger");
    const trigMs = trig && trig.toUnixTime ? Math.round(trig.toUnixTime() * 1000) : NaN;
    ok(trigMs === alarmMs, `${id}: ical.js reads the alarm instant ${iso(alarmMs)} (got ${Number.isFinite(trigMs) ? iso(trigMs) : "no absolute trigger"})`);
    if (!c.allDay) ok(trigMs < Math.round(ev.startDate.toUnixTime() * 1000), `${id}: the alarm is before the event starts (ical.js)`);
    if (["fall-nov1-2h-dst", "panhandle-2h", "jan2027-overnight"].includes(id)) icalReport.push(`${id}: alarm ${iso(trigMs)}`);
  }
  console.log("  parsed alarm times (ical.js): " + icalReport.join(" | "));
}
// The 410 and refusals never produce a file a parser would accept.
{
  const res = await handleReminderRequest(new Request(`${SITE}/api/events/reminder?slug=x&night=2026-12-05&remind=eve`), { lookup: async () => ({ slug: "x", event_status: "cancelled" }), nowMs: NOW, siteUrl: SITE });
  const text = await res.text();
  ok(res.status === 410 && !/BEGIN:VCALENDAR/.test(text), "a canceled event produces no calendar file at all");
}
if (pyOk) console.log("  parsed alarm times (icalendar " + String(parser || "").replace("icalendar ", "") + "): " + alarmsReport.join(" | "));
rmSync(dir, { recursive: true, force: true });
const src = readFileSync(path.join(ROOT, "scripts/lib/validate-reminder-ics.py"), "utf8");
ok(/import icalendar/.test(src) && !/from_ical\(.*strict=False/.test(src), "the validator uses the real library and its strict parse");
if (fail) { console.log(`test-event-reminder-ics: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-event-reminder-ics: OK (${pass} assertions: ${manifest.length} route generated files parsed by ical.js${pyOk ? " and " + parser : " (python icalendar not installed, optional)"}, VTIMEZONE and VALARM instants checked against lib/eventTime.js, Google dates equal the .ics instants)`);
