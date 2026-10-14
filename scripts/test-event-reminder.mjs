#!/usr/bin/env node
// scripts/test-event-reminder.mjs: the "Remind me" calendar invite builder
// (lib/eventReminder.js). EXECUTED: it imports the builder, calls it, parses the
// text it returns and asserts on that text, never on the source.
//
// Owner, 2026-10-14: "add a reminder to the person's phone about the event
// because i would forget ... and ask the user when they would like to be
// reminded."
//
// What this proves
//   * each preset's VALARM TRIGGER is the right instant, including across the
//     Nov 1 2026 daylight saving change and for January 2027 dates,
//   * the wall clock arithmetic agrees with the platform's own tz database
//     (Intl) for every hour of every day of 2026 and 2027, so the rule based
//     offsets cannot drift,
//   * all day versus timed events, a Central Time venue,
//   * RFC 5545 shape: CRLF, 75 octet folding that never splits a character,
//     escaping of , ; \ and newlines, one VALARM, a VTIMEZONE, GEO, URL,
//   * the ticket link is an on-site /api/<x>/go route and a raw partner URL is
//     refused,
//   * an undated, watchlist or past event gets no reminder,
//   * options already in the past are hidden.
import { createHash } from "node:crypto";
import * as R from "../lib/eventReminder.js";
import * as F from "../lib/eventReminderFacts.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const SITE = "https://www.gowayfind.com";
const NOW = Date.parse("2026-10-14T12:00:00Z"); // Oct 14 2026, 8:00 AM Eastern
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

const base = { slug: "test-lights-2026", event_name: "Test Lights", start_date: "2026-11-01", end_date: "2026-11-01", start_time: "18:00:00", end_time: "21:30:00", venue: "Test Park", city: "Tampa", state: "FL", address: "1 Main St", card_hook: "A short test line." };
// "today" far in the past: these cases test the builder, not eligibility (test-event-reminder-facts.mjs does that).
const rf = (row) => F.reminderFactsFor(row, { today: "2000-01-01" });
const facts = (over = {}) => rf({ ...base, ...over });
const uidFor = (slug, night) => createHash("sha256").update(slug + night).digest("hex") + "@gowayfind.com";

// ── ICS parsing (independent of the builder) ────────────────────────────────
function unfold(text) { return text.replace(/\r\n[ \t]/g, ""); }
function parse(text) {
  const lines = unfold(text).split("\r\n");
  const props = []; // { path, name, params, value }
  const stack = [];
  for (const line of lines) {
    if (!line) continue;
    const i = line.indexOf(":");
    const head = line.slice(0, i), value = line.slice(i + 1);
    const [name, ...params] = head.split(";");
    if (name === "BEGIN") { stack.push(value); continue; }
    if (name === "END") { stack.pop(); continue; }
    props.push({ path: stack.join("/"), name, params, value });
  }
  const get = (path, name) => props.filter((p) => p.path === path && p.name === name);
  return { lines, props, get };
}
function build(f, night, remind, extra = {}) {
  const r = R.resolveReminder(f, night, remind, { nowMs: NOW });
  if (!r.ok) throw new Error("resolve: " + r.error);
  const text = R.buildReminderIcs({ facts: f, night, alarmMs: r.alarmMs, siteUrl: SITE, nowMs: NOW, uid: uidFor(f.slug, night), ...extra });
  return { text, r, ics: parse(text) };
}
const trigger = (ics) => ics.get("VCALENDAR/VEVENT/VALARM", "TRIGGER")[0];

// ── 1. every preset, exact instants (UTC), across the Nov 1 2026 change ─────
// Nov 1 2026: daylight time ends at 2:00 AM. Oct 31 is EDT (UTC-4), Nov 1 is EST (UTC-5).
{
  const f = facts({ start_date: "2026-11-01", end_date: "2026-11-01" });
  const exp = {
    eve: "2026-10-31T22:00:00Z", // Oct 31 6:00 PM EDT
    am: "2026-11-01T14:00:00Z", // Nov 1 9:00 AM EST
    "2h": "2026-11-01T21:00:00Z", // Nov 1 4:00 PM EST (event 6:00 PM EST)
    "2d": "2026-10-30T13:00:00Z", // Oct 30 9:00 AM EDT
    "1w": "2026-10-25T13:00:00Z", // Oct 25 9:00 AM EDT
  };
  for (const [id, want] of Object.entries(exp)) {
    const { ics, r } = build(f, "2026-11-01", id);
    const t = trigger(ics);
    ok(t && t.params.join(";") === "VALUE=DATE-TIME" && t.value === want.replace(/[-:]/g, ""), `Nov 1 2026, ${id}: TRIGGER is ${want} (got ${t && t.value})`);
    ok(iso(r.alarmMs) === want, `Nov 1 2026, ${id}: resolve gives ${want}`);
  }
}
// An event after the change: a week back crosses it. Nov 8 2026 event, 1 week before = Nov 1 9:00 AM EST.
{
  const f = facts({ start_date: "2026-11-08", end_date: "2026-11-08" });
  ok(trigger(build(f, "2026-11-08", "1w").ics).value === "20261101T140000Z", "Nov 8 2026, 1 week before = Nov 1 9:00 AM EST (14:00Z), not 13:00Z");
  ok(trigger(build(f, "2026-11-08", "eve").ics).value === "20261107T230000Z", "Nov 8 2026, day before at 6 PM = Nov 7 6:00 PM EST (23:00Z)");
  // Event Nov 2 (EST); 2 days before is Oct 31 (EDT): 9:00 AM EDT = 13:00Z.
  const g = facts({ start_date: "2026-11-02", end_date: "2026-11-02" });
  ok(trigger(build(g, "2026-11-02", "2d").ics).value === "20261031T130000Z", "Nov 2 2026, 2 days before = Oct 31 9:00 AM EDT (13:00Z)");
}
// January 2027 (standard time) and March 2027 (the spring change, Mar 14 2027).
{
  const f = facts({ start_date: "2027-01-15", end_date: "2027-01-15", start_time: "19:00:00", end_time: "22:00:00" });
  ok(trigger(build(f, "2027-01-15", "eve").ics).value === "20270114T230000Z", "Jan 15 2027, day before at 6 PM = Jan 14 6:00 PM EST (23:00Z)");
  ok(trigger(build(f, "2027-01-15", "am").ics).value === "20270115T140000Z", "Jan 15 2027, morning of 9 AM = 14:00Z");
  ok(trigger(build(f, "2027-01-15", "2h").ics).value === "20270115T220000Z", "Jan 15 2027, 2 hours before 7:00 PM EST = 5:00 PM EST = 22:00Z");
  ok(trigger(build(f, "2027-01-15", "1w").ics).value === "20270108T140000Z", "Jan 15 2027, 1 week before = Jan 8 9:00 AM EST");
  const s = facts({ start_date: "2027-03-15", end_date: "2027-03-15" });
  ok(trigger(build(s, "2027-03-15", "eve").ics).value === "20270314T220000Z", "Mar 15 2027, day before at 6 PM = Mar 14 6:00 PM EDT (22:00Z)");
  ok(trigger(build(s, "2027-03-15", "1w").ics).value === "20270308T140000Z", "Mar 15 2027, 1 week before = Mar 8 9:00 AM EST (14:00Z), the change is Mar 14");
}
// A Central Time venue: the zone, the VTIMEZONE and the offset all follow it.
{
  const f = facts({ timezone: "America/Chicago", start_date: "2026-12-05", end_date: "2026-12-05" });
  const { ics } = build(f, "2026-12-05", "eve");
  ok(trigger(ics).value === "20261205T000000Z", "Central venue: day before at 6 PM CST = 00:00Z next day");
  ok(ics.get("VCALENDAR/VEVENT", "DTSTART")[0].params.includes("TZID=America/Chicago"), "Central venue: DTSTART carries TZID=America/Chicago");
  ok(ics.get("VCALENDAR/VTIMEZONE", "TZID")[0].value === "America/Chicago", "Central venue: VTIMEZONE is America/Chicago");
}

// ── 2. wall clock arithmetic against the platform tz database ───────────────
{
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const wall = (ms) => { const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  let checked = 0, bad = 0;
  for (let d = 0; d < 730; d++) {
    const day = R.addDays("2026-01-01", d);
    for (let h = 0; h < 24; h++) {
      if (h === 1 || h === 2) continue; // the repeated and skipped hours of a change night
      const ms = R.wallToMs("America/New_York", day, h, 30);
      checked++;
      if (wall(ms) !== `${day}T${String(h).padStart(2, "0")}:30`) bad++;
      const back = R.msToWall("America/New_York", ms);
      if (back.day !== day || back.h !== h || back.mi !== 30) bad++;
    }
  }
  ok(bad === 0, `wall clock <-> instant agrees with Intl on ${checked} hours across 2026 and 2027 (${bad} mismatches)`);
}

// ── 3. all day versus timed ─────────────────────────────────────────────────
{
  const timed = build(facts(), "2026-11-01", "eve").ics;
  const ds = timed.get("VCALENDAR/VEVENT", "DTSTART")[0], de = timed.get("VCALENDAR/VEVENT", "DTEND")[0];
  ok(ds.params.includes("TZID=America/New_York") && ds.value === "20261101T180000", "timed: DTSTART;TZID=America/New_York:20261101T180000");
  ok(de.params.includes("TZID=America/New_York") && de.value === "20261101T213000", "timed: DTEND is the stored end time");
  const allDay = build(facts({ start_time: null, end_time: null }), "2026-11-01", "eve").ics;
  const as = allDay.get("VCALENDAR/VEVENT", "DTSTART")[0], ae = allDay.get("VCALENDAR/VEVENT", "DTEND")[0];
  ok(as.params.join(";") === "VALUE=DATE" && as.value === "20261101" && ae.params.join(";") === "VALUE=DATE" && ae.value === "20261102", "all day: VALUE=DATE, DTEND is the next day");
  const noEnd = build(facts({ end_time: null }), "2026-11-01", "eve").ics;
  ok(noEnd.get("VCALENDAR/VEVENT", "DTEND")[0].value === "20261101T200000", "timed with no end time: 2 hours, never a guessed finish");
  const overnight = build(facts({ start_time: "22:00:00", end_time: "01:00:00" }), "2026-11-01", "eve").ics;
  ok(overnight.get("VCALENDAR/VEVENT", "DTEND")[0].value === "20261102T010000", "an end clock before the start clock is an overnight show: it ends the next day (10 PM to 1 AM), never before it starts");
  const badEnd = build(facts({ start_time: "10:00:00", end_time: "09:00:00" }), "2026-11-01", "eve").ics;
  ok(badEnd.get("VCALENDAR/VEVENT", "DTEND")[0].value === "20261101T120000", "an end 23 hours after the start is a bad row: the 2 hour default, not a day long event");
  ok(rf({ ...base, start_time: "7pm" }).start_time === null, "an unreadable start time is treated as no time (all day), never guessed");
}

// ── 4. RFC 5545 shape ───────────────────────────────────────────────────────
{
  const f = facts({ event_name: "Café ☃ Lights, Music; and a \\ backslash for the Whole Family at the Very Long Named Waterfront Pavilion", venue: "The Grand Pavilion, Main Stage; East Lawn", card_hook: "Line one, with a comma; and a semicolon.\nSecond line \\ end." });
  const { text, ics } = build(f, "2026-11-01", "eve", { lat: 27.9506, lng: -82.4572, ticketHref: "/api/commerce/go?provider=undercover_tourist&offer=1&surface=calendar_reminder&content=test" });
  ok(text.endsWith("\r\n") && !/[^\r]\n/.test(text), "every line ends CRLF (no bare LF)");
  ok(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") && /\r\nPRODID:-\/\/Wayfind\/\/[^\r]+\r\n/.test(text) && text.trimEnd().endsWith("END:VCALENDAR"), "VCALENDAR with VERSION 2.0 and PRODID");
  const enc = new TextEncoder();
  const physical = text.split("\r\n").filter(Boolean);
  ok(physical.every((l) => enc.encode(l).length <= 75), `every physical line is at most 75 octets (longest ${Math.max(...physical.map((l) => enc.encode(l).length))})`);
  ok(physical.some((l) => l.startsWith(" ")), "a long line is folded with a leading space continuation");
  ok(!/�/.test(unfold(text)), "folding never splits a multi byte character (no replacement characters)");
  ok(unfold(text).includes("SUMMARY:Café ☃ Lights\\, Music\\; and a \\\\ backslash for the Whole Family"), "SUMMARY escapes comma, semicolon and backslash and keeps UTF-8");
  ok(ics.get("VCALENDAR/VEVENT", "SUMMARY")[0].value.startsWith("Café ☃ Lights\\, Music\\; and a \\\\ backslash"), "SUMMARY parsed back");
  ok(ics.get("VCALENDAR/VEVENT", "LOCATION")[0].value === "The Grand Pavilion\\, Main Stage\\; East Lawn\\, 1 Main St\\, Tampa\\, FL", "LOCATION is the venue and the street line the event page shows");
  const desc = ics.get("VCALENDAR/VEVENT", "DESCRIPTION")[0].value;
  ok(desc.includes("\\n") && !/[\n\r]/.test(desc), "DESCRIPTION escapes newlines as \\n");
  ok(desc.startsWith("Line one\\, with a comma\\; and a semicolon.\\nSecond line \\\\ end.\\nEvent page: "), "DESCRIPTION: the event's one line, then the event page link");
  const geo = ics.get("VCALENDAR/VEVENT", "GEO")[0];
  ok(geo && geo.value === "27.950600;-82.457200", "GEO from lat and lng");
  ok(ics.get("VCALENDAR/VEVENT", "URL")[0].value === SITE + "/florida-events/test-lights-2026?utm_source=calendar&utm_medium=reminder", "URL is the Wayfind event page with utm_source=calendar&utm_medium=reminder");
  ok(text.includes("BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\n") && /RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU/.test(text) && /RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU/.test(text), "VTIMEZONE America/New_York with both DST rules");
  const uid = ics.get("VCALENDAR/VEVENT", "UID")[0].value, stamp = ics.get("VCALENDAR/VEVENT", "DTSTAMP")[0].value;
  ok(uid === uidFor("test-lights-2026", "2026-11-01") && /^[0-9a-f]{64}@gowayfind\.com$/.test(uid) && stamp === "20261014T120000Z", "UID is sha256(slug + night)@gowayfind.com; DTSTAMP is UTC");
  const again = build(f, "2026-11-01", "am", { nowMs: NOW + 5000 }).ics.get("VCALENDAR/VEVENT", "UID")[0].value;
  const otherAlarm = build(f, "2026-11-01", "eve").ics.get("VCALENDAR/VEVENT", "UID")[0].value;
  const otherNight = build(facts({ start_date: "2026-11-01", end_date: "2026-11-02" }), "2026-11-02", "am").ics.get("VCALENDAR/VEVENT", "UID")[0].value;
  ok(again === uid && otherAlarm === uid, "the UID is the same on every download of the same night, whatever the alert time or the clock");
  ok(otherNight !== uid, "a different night is a different calendar entry");
  let badUid = false; try { R.buildReminderIcs({ facts: f, night: "2026-11-01", alarmMs: NOW + 3600e3, siteUrl: SITE, nowMs: NOW, uid: "test-lights-2026-2026-11-01@gowayfind.com" }); } catch { badUid = true; }
  ok(badUid, "buildReminderIcs refuses a UID that is not sha256(slug + night)@gowayfind.com");
  ok((text.match(/BEGIN:VALARM/g) || []).length === 1 && (text.match(/END:VALARM/g) || []).length === 1, "exactly one VALARM");
  ok(ics.get("VCALENDAR/VEVENT/VALARM", "ACTION")[0].value === "DISPLAY", "VALARM ACTION:DISPLAY");
  ok(ics.get("VCALENDAR/VEVENT/VALARM", "DESCRIPTION").length === 1, "VALARM carries its required DESCRIPTION");
  // BEGIN/END balanced.
  const opens = (text.match(/^BEGIN:/gm) || []).length, closes = (text.match(/^END:/gm) || []).length;
  ok(opens === closes && opens === 6, `BEGIN and END balance (${opens}/${closes})`);
  // No GEO without coordinates.
  const noGeo = build(f, "2026-11-01", "eve").text;
  ok(!/\r\nGEO:/.test(noGeo), "no GEO line when the event has no coordinates");
  ok(!/\r\n(?:Tickets|TICKETS)/.test(unfold(noGeo)) && !/Tickets: /.test(unfold(noGeo)), "no ticket line when the event has no partner link");
  // Escaping function directly.
  ok(R.icsEscape("a,b;c\\d\ne\r\nf") === "a\\,b\\;c\\\\d\\ne\\nf", "icsEscape: , ; \\ and newlines");
  // Fold function directly: a 200 char run folds to 75 then 74 octet pieces.
  const folded = R.foldLine("X:" + "é".repeat(120)).split("\r\n");
  ok(folded.every((l, i) => enc.encode(l).length <= 75 && (i === 0 || l.startsWith(" "))), "foldLine: pieces are at most 75 octets and continuation lines start with a space");
  ok(unfold(folded.join("\r\n")) === "X:" + "é".repeat(120), "foldLine: unfolding restores the line exactly");
}

// ── 5. the ticket link is an on-site /api/<x>/go route ──────────────────────
{
  const f = facts();
  const go = "/api/commerce/go?provider=undercover_tourist&offer=12&surface=calendar_reminder&content=test-lights";
  const { ics } = build(f, "2026-11-01", "eve", { ticketHref: go });
  const desc = unfold(ics.get("VCALENDAR/VEVENT", "DESCRIPTION")[0].value).replace(/\\n/g, "\n");
  const line = desc.split("\n").find((l) => l.startsWith("Tickets: "));
  ok(line === "Tickets: " + SITE + go, "DESCRIPTION carries the ticket link as the on-site /api/commerce/go URL");
  ok(/^Tickets: https:\/\/www\.gowayfind\.com\/api\/[a-z0-9-]+\/go\?/.test(line), "the ticket link is a /api/<x>/go route");
  const refused = (href) => { try { R.buildReminderIcs({ facts: f, night: "2026-11-01", alarmMs: NOW + 3600e3, siteUrl: SITE, nowMs: NOW, uid: uidFor(f.slug, "2026-11-01"), ticketHref: href }); return false; } catch { return true; } };
  ok(refused("https://www.undercovertourist.com/florida/orlando/?a_aid=wayfind"), "a raw partner URL is refused");
  ok(refused("https://example.com/api/commerce/go?x=1"), "a /api/commerce/go URL on another host is refused");
  ok(refused("/api/photo?place=x"), "an on-site route that is not a /go route is refused");
  ok(refused("//evil.example/api/commerce/go"), "a protocol relative URL is refused");
  const dline = (u) => { try { return R.reminderTicketUrl(u, SITE); } catch { return "threw"; } };
  ok(dline("/api/viator/go?q=x") === SITE + "/api/viator/go?q=x", "any /api/<x>/go route is accepted (viator)");
  ok(dline(SITE + "/api/commerce/go?offer=1") === SITE + "/api/commerce/go?offer=1", "an absolute on-site go URL is accepted");
  const g = R.googleCalendarUrl({ facts: f, night: "2026-11-01", siteUrl: SITE, ticketHref: go });
  ok(g.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&"), "Google Calendar link opens calendar.google.com/calendar/render?action=TEMPLATE");
  const q = new URL(g).searchParams;
  ok(q.get("text") === "Test Lights" && q.get("dates") === "20261101T230000Z/20261102T023000Z" && q.get("ctz") === "America/New_York", "Google link: text, dates (the event UTC instants: 6 PM to 9:30 PM EST on Nov 1 2026) and ctz");
  ok(q.get("location") === "Test Park, 1 Main St, Tampa, FL" && q.get("details").includes(SITE + "/florida-events/test-lights-2026?utm_source=calendar&utm_medium=reminder") && q.get("details").includes("Tickets: " + SITE + go), "Google link: location, details with the event page and the go link");
  const gAll = new URL(R.googleCalendarUrl({ facts: facts({ start_time: null, end_time: null }), night: "2026-11-01", siteUrl: SITE })).searchParams;
  ok(gAll.get("dates") === "20261101/20261102" && !gAll.get("ctz"), "Google link, all day: VALUE=DATE style dates, next day end");
}

// ── 6. what gets no reminder ────────────────────────────────────────────────
{
  ok(rf({ ...base, season_undated: true }) === null, "an undated season has no reminder facts");
  ok(rf({ ...base, start_date: null }) === null, "a row with no start date has no reminder facts");
  ok(rf({ ...base, christmas_watchlist: true }) === null, "a watchlist twin has no reminder facts");
  ok(rf({ ...base, christmas_excluded: true }) === null, "an excluded row has no reminder facts");
  ok(rf({ ...base, slug: "" }) === null && rf({ ...base, slug: "../x" }) === null, "no page slug (or an unsafe one) means no reminder");
  ok(rf({ ...base, start_date: "2026-13-45" }) === null, "an impossible date means no reminder");
  let threw = false;
  try { R.buildReminderIcs({ facts: null, night: "2026-11-01", alarmMs: NOW + 1e6, siteUrl: SITE }); } catch { threw = true; }
  ok(threw, "buildReminderIcs refuses an undated event");
  threw = false;
  try { R.buildReminderIcs({ facts: { ...facts(), start_date: null }, night: "2026-11-01", alarmMs: NOW + 1e6, siteUrl: SITE }); } catch { threw = true; }
  ok(threw, "buildReminderIcs refuses facts whose start date was removed");
  ok(R.reminderNights(facts(), "2026-11-02").kind === "none", "a past event (single night) has no nights left");
  ok(R.reminderNights(facts({ start_date: "2026-11-01", end_date: "2026-11-30" }), "2026-12-01").kind === "none", "a past range has no nights left");
  ok(R.reminderNights(facts(), "2026-11-01").kind === "single", "an event today still qualifies");
  ok(R.resolveReminder(facts(), "2026-11-01", "eve", { nowMs: Date.parse("2026-11-02T12:00:00Z") }).ok === false, "a past event cannot resolve a reminder");
  ok(R.resolveReminder(facts(), "2026-11-02", "eve", { nowMs: NOW }).ok === false, "a night outside the event's dates is refused");
}

// ── 7b. the sheet opens on the first night that still has a reminder time ──
{
  const nights = ["2026-10-20", "2026-10-21", "2026-10-22"];
  const f = facts({ start_date: nights[0], end_date: nights[2], start_time: "18:30:00", end_time: "23:00:00", select_nights: true, occurrence_dates: nights });
  const at5pm = Date.parse("2026-10-20T21:00:00Z"); // tonight 5:00 PM Eastern, show at 6:30 PM nightly
  const n = R.reminderNights(f, "2026-10-20", at5pm);
  ok(n.kind === "list" && n.nights[0] === "2026-10-20" && n.default === "2026-10-21", "tonight at 5 PM (every preset for tonight gone): tonight stays in the list but the sheet opens on tomorrow");
  ok(R.reminderOptions(f, "2026-10-20", at5pm).every((o) => !o.available) && R.reminderOptions(f, "2026-10-21", at5pm).some((o) => o.available), "the premise: tonight has no future preset, tomorrow has");
  ok(R.isReminderNight(f, "2026-10-20", "2026-10-20", at5pm) && R.customBounds(f, "2026-10-20", at5pm) !== null, "tonight is still selectable and still offers a custom time");
  const at3pm = Date.parse("2026-10-20T19:00:00Z"); // 2 hours before is 4:30 PM, still ahead
  const m3 = R.reminderNights(f, "2026-10-20", at3pm);
  ok(m3.default === "2026-10-20" && R.reminderOptions(f, "2026-10-20", at3pm).filter((o) => o.available).map((o) => o.id).join() === "2h", "tonight at 3 PM: the 2 hours before preset is ahead, so tonight stays the default and shows only that preset");
  const late = Date.parse("2026-10-22T21:30:00Z"); // last night, every preset gone: keep the current behaviour
  ok(R.reminderNights(f, "2026-10-22", late).kind === "none" || R.reminderNights(f, "2026-10-22", late).default === "2026-10-22", "with no night left that has a future preset the default is unchanged");
  ok(R.reminderNights(f, "2026-10-20").default === "2026-10-20", "with no clock given the default is the first upcoming night");
}

// ── 7. nights ───────────────────────────────────────────────────────────────
{
  const days = ["2026-11-07", "2026-11-14", "2026-11-16", "2026-11-21", "2026-11-23", "2026-11-28", "2026-12-05", "2026-12-07", "2026-12-12", "2026-12-14", "2027-01-03"];
  const f = facts({ start_date: days[0], end_date: days[days.length - 1], select_nights: true, occurrence_dates: days });
  const n = R.reminderNights(f, "2026-11-10");
  ok(n.kind === "list" && n.nights.length === 8 && n.nights[0] === "2026-11-14" && n.default === "2026-11-14" && n.more === 2, "a verified list offers the next 8 upcoming nights (11 listed, 3 past excluded)");
  ok(R.isReminderNight(f, "2026-11-16", "2026-11-10") && !R.isReminderNight(f, "2026-11-15", "2026-11-10") && !R.isReminderNight(f, "2026-11-07", "2026-11-10"), "only listed, upcoming nights are valid");
  const range = R.reminderNights(facts({ start_date: "2026-11-13", end_date: "2027-01-04", select_nights: true }), "2026-12-01");
  ok(range.kind === "range" && range.min === "2026-12-01" && range.max === "2027-01-04", "a range with no night list is a date input from today to the last day");
  ok(R.reminderNights(facts({ occurrence_dates: ["2026-11-01"] }), "2026-10-14").kind === "single", "one listed night is a single night");
}

// ── 8. the choices, and which are hidden once past ──────────────────────────
{
  const f = facts({ start_date: "2026-11-01", end_date: "2026-11-01" });
  const live = (nowIso) => R.reminderOptions(f, "2026-11-01", Date.parse(nowIso)).filter((o) => o.available).map((o) => o.id);
  ok(live("2026-10-14T12:00:00Z").join() === "1w,2d,eve,am,2h", "well ahead: all five presets offered");
  ok(live("2026-10-26T12:00:00Z").join() === "2d,eve,am,2h", "after the 1 week mark: 1 week before is hidden");
  ok(live("2026-10-31T23:00:00Z").join() === "am,2h", "after 'the day before at 6 PM': it and 2 days before are hidden");
  ok(live("2026-11-01T15:00:00Z").join() === "2h", "after 9 AM the morning of: only 2 hours before remains");
  ok(live("2026-11-01T21:30:00Z") === "" || live("2026-11-01T21:30:00Z").length === 0, "less than 2 hours before the start: nothing left");
  const noTime = facts({ start_time: null, end_time: null, start_date: "2026-11-01", end_date: "2026-11-01" });
  ok(R.reminderOptions(noTime, "2026-11-01", NOW).find((o) => o.id === "2h").available === false, "2 hours before is offered only when a start time is known");
  ok(R.reminderOptions(noTime, "2026-11-01", NOW).filter((o) => o.available).map((o) => o.id).join() === "1w,2d,eve,am", "an all day event offers the other four");
  const early = facts({ start_time: "08:00:00", end_time: "10:00:00" });
  ok(R.reminderOptions(early, "2026-11-01", NOW).find((o) => o.id === "am").available === false, "'the morning of at 9 AM' is hidden when the event starts before 9 AM");
  ok(R.reminderOptions(f, "2026-11-01", NOW).find((o) => o.id === "eve").when === "Sat Oct 31 at 6:00 PM", "each choice shows the day and time it resolves to");
  // Custom
  const r1 = R.resolveReminder(f, "2026-11-01", "2026-10-30T20:15", { nowMs: NOW });
  ok(r1.ok && r1.preset === "custom" && iso(r1.alarmMs) === "2026-10-31T00:15:00Z" && r1.daysBefore === 2, "custom wall time in Eastern resolves (Oct 30 8:15 PM EDT = 00:15Z), 2 days before");
  ok(R.resolveReminder(f, "2026-11-01", "2026-10-13T20:15", { nowMs: NOW }).ok === false, "a custom time in the past is refused");
  ok(R.resolveReminder(f, "2026-11-01", "2026-11-01T19:00", { nowMs: NOW }).ok === false, "a custom time after the event starts is refused");
  ok(R.resolveReminder(f, "2026-11-01", "2026-10-31T22:00:00Z", { nowMs: NOW }).ok === true, "a custom ISO instant with Z is accepted");
  ok(R.resolveReminder(f, "2026-11-01", "tomorrow", { nowMs: NOW }).ok === false && R.resolveReminder(f, "2026-11-01", "2026-02-30T10:00", { nowMs: NOW }).ok === false && R.resolveReminder(f, "2026-11-01", "", { nowMs: NOW }).ok === false, "junk reminder values are refused");
  const b = R.customBounds(f, "2026-11-01", NOW);
  ok(b && b.min === "2026-10-14T08:05" && b.max === "2026-11-01T17:59", "custom bounds run from now to a minute before the start");
}

// ── 9. no long dashes in anything a person reads ────────────────────────────
{
  const copy = [...R.REMINDER_PRESETS.map((p) => p.label), R.REMINDER_CUSTOM_LABEL, R.GOOGLE_ALERT_NOTE, R.dayLabel("2026-12-05"), R.wallLabel("America/New_York", NOW)].join("\n");
  ok(!/[–—−]|\s-\s/.test(copy), "reminder copy has no dashes");
  ok(R.REMINDER_PRESETS.map((p) => p.label).join("|") === "1 week before|2 days before|The day before at 6 PM|The morning of at 9 AM|2 hours before", "the five choices read exactly as the owner specified");
  ok(R.REMINDER_CUSTOM_LABEL === "Pick a date and time", "the custom choice reads 'Pick a date and time'");
}

if (fail) { console.log(`test-event-reminder: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-event-reminder: OK (${pass} assertions: presets across the Nov 1 2026 change, Jan and Mar 2027, every hour of 2026 and 2027 against Intl, folding, escaping, go route ticket link, undated refused)`);
