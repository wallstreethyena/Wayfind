#!/usr/bin/env node
/**
 * check-schedule-note-days - lib/scheduleNoteDays.js, executed by CALL on real
 * wf_events.schedule_note strings copied from the database on 2026-11-03.
 * The parser may only read what a note STATES (weekday names, explicit date lists); the
 * negative controls prove it never invents days from "select nights" prose, from a
 * parenthetical hint, from "plus select Fridays", or from a single closing date.
 */
import { scheduleWeekdays, scheduleExplicitDays, nextScheduledDay, scheduleRule, scheduleClosures, nextOpenDay } from "../lib/scheduleNoteDays.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const wd = (note) => { const s = scheduleWeekdays(note); return s ? [...s].sort().join("") : null; };

/* ---- weekday names (0 = Sunday) */
ok(wd("Saturdays and Sundays only, November 7 through December 6, 9:45am-5:30pm.") === "06", "Medieval Fair: Saturdays and Sundays");
ok(wd("Every Tuesday, 6:30-8:30pm. Hosted by B-Trivial. Cash prizes on the line, cash only, five dollars a card.") === "2", "bingo: Every Tuesday");
ok(wd("Every Wednesday, 5-8pm, with Todd Adams and Chris Guertin. Live, loud and request-driven.") === "3", "dueling pianos: Every Wednesday");
ok(wd("Every Sunday, noon to 3pm, with Timmy Phelan.") === "0", "Sunday sessions: Every Sunday");
ok(wd("Fridays 10am–5pm, Saturdays 10am–6pm, Sundays 10am–5pm, September 19 – November 22.") === "056", "Amber Brooke: Fridays, Saturdays, Sundays");
ok(wd("Nov 7 to 8, 14 to 15 and 21 to 22, Sat and Sun 10 AM to 5:30 PM") === "06", "Camelot Days: Sat and Sun abbreviations");
ok(wd("Weekends Sep 26 to Nov 8, Sat and Sun, 11 AM to 6 PM, last admission 5 PM") === "06", "Mayhem Ranch: Weekends");
ok(wd("Fridays 7 PM to 10 PM, Saturdays 8 PM to 11 PM. Suitable for ages 8 and up.") === "56", "haunt: Fridays and Saturdays");
ok(wd("Friday 4 to 8 PM, Saturday noon to 8 PM and Sunday 1 to 5 PM. The organizer's 2026 hours block lists September 18 through November 8.") === "056", "Harvest Holler: singular Friday, Saturday, Sunday");
ok(wd("September 26 – November 8: Wednesday–Friday 10am–1pm, Saturday–Sunday 10am–2pm (closed Mon/Tue except Oct 12).") === "03456", "Green Meadows: the stated range Wednesday–Friday includes Thursday (organizer page confirms Wed–Sun); the parenthetical exception is ignored");
ok(wd("Open daily 10am to 5pm.") === "0123456", "daily means all seven");
/* ---- negative controls: nothing invented */
ok(wd("Select nights, 6-10 p.m. Timed entry at 6, 7 and 8 p.m.; last admission 9:15 p.m.") === null, "Asian Lantern Festival: 'select nights' names no day");
ok(wd("Select nights November 13 - January 4, included with park admission.") === null, "Christmas Town: no weekday named");
ok(wd("Select dates, November 6, 2026 through January 4, 2027. Included with park admission.") === null, "SeaWorld: no weekday named");
ok(wd("Open Saturdays and Sundays 10am-5pm (opening weekend Sept 26-27 10am-4pm), plus select Fridays and Mondays 10am-2pm (Fridays Oct 2, 9, 16, 23; Mondays Oct 5, 12, 19, 26), and Sunday Nov 1 10am-4pm.") === "06", "Sweetfields: Saturdays and Sundays only; 'plus select Fridays and Mondays' and the parenthetical never become run days");
ok(wd("Select Thursdays (Oct 8, 15, 22, 29, 11am-7pm), Fridays 11am-8pm, Saturdays 9am-8pm, Sundays 9am-7pm, September 26 - November 22, plus Monday October 12 (11am-5pm).") === "056", "Southern Hill Farms: Fridays, Saturdays, Sundays; 'Select Thursdays' and 'plus Monday October 12' never become run days");
ok(wd("") === null && wd(null) === null && wd("Sat Nov 7. Doors and start time per Ticketmaster.") === null, "empty note is null; 'Sat Nov 7' is a date label, not a weekly cadence");

/* ---- explicit date lists */
const jolly = scheduleExplicitDays("15 select nights only, not a continuous run: Nov 7, 14, 16, 21, 23, 28 and Dec 5, 7, 12, 14, 19, 21, 23 2026, plus Jan 3 and Jan 5 2027. 7:30pm to 12:30am; entry from 5:30pm.", 2026);
ok(jolly && jolly.length === 15 && jolly[0] === "2026-11-07" && jolly[6] === "2026-12-05" && jolly[13] === "2027-01-03" && jolly[14] === "2027-01-05", `Jollywood: 15 nights across the year boundary (got ${jolly && jolly.length}: ${jolly && jolly.slice(0, 2)} .. ${jolly && jolly.slice(-2)})`);
const merry = scheduleExplicitDays("25 select nights only, not a continuous run: Nov 8, 9, 12, 13, 15, 17, 19, 20, 24, 25, 27, 29 and Dec 1, 3, 4, 6, 8, 10, 11, 13, 15, 17, 18, 20, 22 2026. 7pm to midnight; early entry 4pm.", 2026);
ok(merry && merry.length === 25 && merry[0] === "2026-11-08" && merry[24] === "2026-12-22", `Very Merry: 25 nights (got ${merry && merry.length})`);
const camelot = scheduleExplicitDays("Nov 7 to 8, 14 to 15 and 21 to 22, Sat and Sun 10 AM to 5:30 PM", 2026);
ok(camelot && camelot.join() === "2026-11-07,2026-11-08,2026-11-14,2026-11-15,2026-11-21,2026-11-22", `Camelot Days: six listed days (got ${camelot})`);
ok(scheduleExplicitDays("Select nights November 13 - January 4, included with park admission.", 2026) === null, "a range with one day token per month is not a list (fewer than three day tokens)");
ok(scheduleExplicitDays("Sat Nov 7. Doors and start time per Ticketmaster.", 2026) === null, "a single date is not a list");
ok(scheduleExplicitDays("The organizer's 2026 hours block lists September 18 through November 8; another block lists November 15.", 2026) === null, "prose with scattered dates is not a list (groups break on prose)");

/* ---- nextScheduledDay with the envelope */
const fair = { start_date: "2026-11-07", end_date: "2026-12-06", schedule_note: "Saturdays and Sundays only, November 7 through December 6, 9:45am-5:30pm." };
ok(nextScheduledDay(fair, "2026-11-03", "2026-11-09") === "2026-11-07", "fair from Tue Nov 3: Sat Nov 7");
ok(nextScheduledDay(fair, "2026-11-10", "2026-11-16") === "2026-11-14", "fair from Tue Nov 10: Sat Nov 14");
ok(nextScheduledDay(fair, "2026-12-07", "2026-12-13") === null, "fair after its end date: null");
ok(nextScheduledDay(fair, "2026-11-01", "2026-11-06") === null, "fair before it opens: null (envelope)");
const jollyRow = { start_date: "2026-11-07", end_date: "2027-01-05", schedule_note: "15 select nights only, not a continuous run: Nov 7, 14, 16, 21, 23, 28 and Dec 5, 7, 12, 14, 19, 21, 23 2026, plus Jan 3 and Jan 5 2027." };
ok(nextScheduledDay(jollyRow, "2026-11-08", "2026-11-14") === "2026-11-14" && nextScheduledDay(jollyRow, "2026-11-09", "2026-11-13") === null, "explicit list wins and respects the window");
ok(nextScheduledDay({ start_date: "2026-10-20", end_date: "2026-11-20", schedule_note: "Select nights, 6-10 p.m." }, "2026-11-03", "2026-11-09") === null, "a note that states no days yields null: the caller must not place it");
ok(nextScheduledDay(null, "2026-11-03", "2026-11-09") === null && nextScheduledDay(fair, "bad", "2026-11-09") === null, "bad input is null");


/* ---- the rule every row uses (select_nights or not), on real notes copied 2026-11-04 */
const kind = (row) => { const r = scheduleRule(row); return r.kind + (r.weekdays ? ":" + [...r.weekdays].sort().join("") : "") + (r.days ? ":" + r.days.length : ""); };
const R = (note, extra = {}) => ({ start_date: "2026-09-19", end_date: "2026-11-15", select_nights: false, schedule_note: note, ...extra });
ok(kind(R("Sat 9am-5pm, Sun 11am-5pm; night maze Fri Oct 23 & 30, 6-10pm; closed weekdays")) === "weekdays:06", `Sweet Season: Sat and Sun; the night maze dates are a hint, 'closed weekdays' closes Mon to Fri (got ${kind(R("Sat 9am-5pm, Sun 11am-5pm; night maze Fri Oct 23 & 30, 6-10pm; closed weekdays"))})`);
ok(kind(R("September 19–November 8. Thursdays and Fridays run 2–7 PM; Saturdays and Sundays run 9 AM–7 PM. Check date-specific hours.")) === "weekdays:0456", "Pinto's: Thu to Sun, a NON select row still keeps its stated days");
ok(kind(R("Saturdays 10am-6pm, Sundays 2-6pm")) === "weekdays:06", "Aunt Louise: Saturdays and Sundays");
ok(kind(R("Weeknights 5-10pm; weekends from noon; free gate opening night Nov 5")) === "open", "North Florida Fair: weeknights plus weekends is every day");
ok(kind(R("Select nights into early November (organizer lists select nights Sept. 12 - Nov. 7)")) === "restricted", "13th Floor: 'select nights' without days is restricted even when select_nights is false");
ok(kind(R("November 1 through 8, 2026. Race days are not every day of the window.")) === "restricted", "Key West: 'not every day' is restricted");
ok(kind(R("September 16 through November 15, 2026.", { select_nights: true })) === "restricted", "a select_nights row with no stated days is restricted");
ok(kind(R("Daily during restaurant hours")) === "open" && kind(R("")) === "open", "daily and empty notes on a continuous row are open");
const wonder = { start_date: "2026-11-12", end_date: "2027-01-04", schedule_note: "Mon-Thu 5-11PM, Fri-Sat 5PM-midnight, Sun 4-10PM; closed Nov 16, Nov 30, Dec 7 (year not printed)" };
const wc = scheduleClosures(wonder.schedule_note, 2026);
ok(kind(wonder) === "open" && wc.dates.has("2026-11-16") && wc.dates.has("2026-11-30") && wc.dates.has("2026-12-07") && wc.dates.size === 3, `Christmas Wonderland: open daily with three closed dates (got ${kind(wonder)} ${[...wc.dates]})`);
ok(nextOpenDay(wonder, "2026-11-16", "2026-11-22") === "2026-11-17", "a closed date is skipped: from Mon Nov 16 the next open day is Nov 17");
const roberts = scheduleClosures("Open year round. Daily 10:00 AM to 5:30 PM. Closed New Year's Day, Easter, Mother's Day, July 4th, Thanksgiving and Christmas.", 2026);
ok(roberts.dates.has("2026-11-26") && roberts.dates.has("2026-12-25") && roberts.dates.has("2027-01-01"), `holiday closures resolve to dates: Thanksgiving 2026-11-26, Christmas, New Year's Day (got ${[...roberts.dates]})`);
ok(scheduleClosures("Closed Mondays and Tuesdays", 2026).weekdays.size === 2 && kind(R("Open 10 to 5, closed Mondays")) === "weekdays:023456", "a closed weekday narrows an otherwise daily run");
/* ---- nextOpenDay: the envelope is a bound, never a reason to be open */
const pintos = R("Thursdays and Fridays run 2–7 PM; Saturdays and Sundays run 9 AM–7 PM.", { end_date: "2026-11-08" });
ok(nextOpenDay(pintos, "2026-11-04", "2026-11-10") === "2026-11-05", "Pinto's from Wed Nov 4: Thu Nov 5, never Wednesday");
ok(nextOpenDay(pintos, "2026-11-09", "2026-11-15") === null, "Pinto's after its end date: null");
const restricted = R("Select nights, 6-10 p.m.", { start_date: "2026-11-06", end_date: "2026-12-20" });
ok(nextOpenDay(restricted, "2026-11-04", "2026-11-10") === "2026-11-06" && nextOpenDay(restricted, "2026-11-07", "2026-11-13") === null, "a restricted run counts on its opening day only, never on a later envelope day");
ok(nextOpenDay(R("Daily"), "2026-11-04", "2026-11-03") === null && nextOpenDay({ schedule_note: "Daily" }, "2026-11-04", "2026-11-10") === null, "an inverted window or a row with no start is null");


/* ---- the same rule on the Christmas browse date filters (lib/christmasBrowse.js) */
{
  const { compactDayRule, compactRuleAllows } = await import("../lib/scheduleNoteDays.js");
  const { filterChristmasBrowse } = await import("../lib/christmasBrowse.js");
  const card = (id, note, extra = {}) => { const r = { start_date: "2026-11-13", end_date: "2027-01-04", schedule_note: note, select_nights: false, ...extra }; return { id, ...r, dayRule: compactDayRule(r) }; };
  const cards = [card("select", "Select nights November 13 - January 4, included with park admission."), card("closed16", "Daily 5 to 11 PM; closed Nov 16"), card("daily", "Nightly 6 to 10 PM")];
  const ids = (q) => filterChristmasBrowse(cards, q, "2026-11-12").map((c) => c.id).sort().join();
  ok(ids({ date: "2026-11-16" }) === "daily", `Christmas browse, a specific day (Nov 16): an undated select-nights run and a venue closed that day are not offered (got ${ids({ date: "2026-11-16" })})`);
  ok(ids({ date: "2026-11-13" }) === "closed16,daily,select", "Christmas browse, opening day Nov 13: all three are open");
  ok(ids({ when: "nov" }) === "closed16,daily,select", "Christmas browse, the month filter is a season filter and keeps the envelope");
  ok(compactDayRule({ start_date: "2026-11-13", end_date: "2026-12-01", schedule_note: "Nightly" }) === null && compactRuleAllows(null, "2026-11-20", "2026-11-13"), "an every-day run carries no rule and is allowed every day");
}


/* ---- a CACHED /api/events feed (21 day cache) is re-derived at serve time */
{
  const { refreshCuratedDayFields } = await import("../lib/curatedEvents.js");
  const { readFileSync } = await import("node:fs");
  const stale = { id: "wfc:guard-fixture-thu-sun-farm", curated: true, date: "2026-09-19", endDate: "2026-11-08", selectNights: false, scheduleNote: "Thursdays and Fridays run 2–7 PM; Saturdays and Sundays run 9 AM–7 PM.", occurrences: null };
  const fresh = refreshCuratedDayFields(stale);
  ok(fresh.dayRule && fresh.dayRule.k === "w" && fresh.dayRule.d.join("") === "0456" && stale.dayRule === undefined, "a cached curated event without a dayRule gets the note's rule at serve time (Thu to Sun), without mutating the cached object");
  const kw = refreshCuratedDayFields({ id: "wfc:key-west-offshore-worlds-2026", curated: true, date: "2026-11-01", endDate: "2026-11-08", scheduleNote: "Race days are not every day of the window.", occurrences: null });
  ok(Array.isArray(kw.occurrences) && kw.occurrences.join() === "2026-11-04,2026-11-06,2026-11-08" && kw.dayRule === null, "a cached curated event picks up its verified day list at serve time");
  const tm = { id: "tm:1", date: "2026-11-07", name: "x" };
  ok(refreshCuratedDayFields(tm) === tm, "a non-curated event passes through untouched");
  const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(/const upcoming = \(evs\) => \(evs \|\| \[\]\)\.map\(refreshCuratedDayFields\)/.test(route), "/api/events applies refreshCuratedDayFields in upcoming(), the filter every cached and fresh return passes through");
}

if (fail.length) { console.error("check-schedule-note-days: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-schedule-note-days: OK - ${pass} assertions; weekday names and explicit date lists read by CALL from 33 real schedule notes, 9 negative controls invent nothing; every row (select or not) is placed by its stated rule`);
