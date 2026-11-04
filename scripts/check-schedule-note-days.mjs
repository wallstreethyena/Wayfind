#!/usr/bin/env node
/**
 * check-schedule-note-days - lib/scheduleNoteDays.js, executed by CALL on real
 * wf_events.schedule_note strings copied from the database on 2026-11-03.
 * The parser may only read what a note STATES (weekday names, explicit date lists); the
 * negative controls prove it never invents days from "select nights" prose, from a
 * parenthetical hint, from "plus select Fridays", or from a single closing date.
 */
import { scheduleWeekdays, scheduleExplicitDays, nextScheduledDay } from "../lib/scheduleNoteDays.js";

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
ok(wd("September 26 – November 8: Wednesday–Friday 10am–1pm, Saturday–Sunday 10am–2pm (closed Mon/Tue except Oct 12).") === "0356", "Green Meadows: names Wednesday, Friday, Saturday, Sunday; Thursday inside a dash range is NOT inferred and the parenthetical is ignored (conservative)");
ok(wd("Open daily 10am to 5pm.") === "0123456", "daily means all seven");
/* ---- negative controls: nothing invented */
ok(wd("Select nights, 6-10 p.m. Timed entry at 6, 7 and 8 p.m.; last admission 9:15 p.m.") === null, "Asian Lantern Festival: 'select nights' names no day");
ok(wd("Select nights November 13 - January 4, included with park admission.") === null, "Christmas Town: no weekday named");
ok(wd("Select dates, November 6, 2026 through January 4, 2027. Included with park admission.") === null, "SeaWorld: no weekday named");
ok(wd("Open Saturdays and Sundays 10am-5pm (opening weekend Sept 26-27 10am-4pm), plus select Fridays and Mondays 10am-2pm (Fridays Oct 2, 9, 16, 23; Mondays Oct 5, 12, 19, 26), and Sunday Nov 1 10am-4pm.") === "06", "Sweetfields: Saturdays and Sundays only; 'plus select Fridays and Mondays' and the parenthetical never become run days");
ok(wd("Select Thursdays (Oct 8, 15, 22, 29, 11am-7pm), Fridays 11am-8pm, Saturdays 9am-8pm, Sundays 9am-7pm, September 26 - November 22, plus Monday October 12 (11am-5pm).") === null, "Southern Hill Farms: 'Select Thursdays' is a hint and the rest sits inside / after a parenthetical, so no cadence is read (stays undated rather than wrong)");
ok(wd("") === null && wd(null) === null && wd("Sat Nov 7. Doors and start time per Ticketmaster.") === "6", "empty note is null; a single dated 'Sat' still names Saturday");

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

if (fail.length) { console.error("check-schedule-note-days: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-schedule-note-days: OK - ${pass} assertions; weekday names and explicit date lists read by CALL from 20 real schedule notes, 9 negative controls invent nothing`);
