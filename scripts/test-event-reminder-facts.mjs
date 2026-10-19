#!/usr/bin/env node
// scripts/test-event-reminder-facts.mjs: lib/eventReminderFacts.js, EXECUTED on REAL rows.
//
// "Remind me" has one engine (lib/eventReminder.js) and one adapter that turns
// ANY event row or card into reminder facts (lib/eventReminderFacts.js). This
// guard calls the adapter with real rows from the checked-in Fall registries and
// the Christmas research, and asserts on the instants it produces:
//   * a Fall event with a verified night list, a Halloween event, a Christmas
//     multi-night event, Central Time Panhandle events (own zone, county only,
//     coordinates only), the Nov 1 2026 DST night with a 2 hours before alarm,
//     a January 2027 night,
//   * called off (canceled, cancelled, postponed), past, undated, an event that
//     has started (multi-night: only upcoming nights; today: only presets still
//     in the future),
//   * every eligible row in the data resolves a zone in {New York, Chicago} and
//     the engine's start instant equals lib/eventTime.js eventIsoWithOffset (the
//     JSON-LD clock) for every night of every row,
//   * Gulf County is split by coordinates, inland Jackson and Calhoun are Central.
// The calendar-file side (a real RFC 5545 parser) is scripts/test-event-reminder-ics.mjs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../lib/eventReminder.js";
import * as F from "../lib/eventReminderFacts.js";
import { EVENT_CALLED_OFF, eventIsoWithOffset } from "../lib/eventTime.js";
import { occurrenceDatesFor, cleanOccurrences } from "../lib/eventOccurrences.js";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const TODAY = "2026-10-14";
const NOW = Date.parse("2026-10-14T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const regs = await Promise.all(["fallDiscoveries2026", "fallFeaturedFestivals2026", "fallGapFill20261007", "fallFoodGap20261008", "fallTampaPicks20261008", "fallLiveArea20261019"].map((f) => import("../lib/" + f + ".js")));
const FALL = regs.flatMap((m) => Object.values(m).find(Array.isArray) || []);
const XMAS = mergeChristmasResearch([]);
const fall = (id) => FALL.find((r) => r.event_id === id);
const xmas = (id) => XMAS.find((r) => r.event_id === id);
// A server caller (event page, route) passes occurrenceDatesFor(row); a card uses the list its row carries.
const facts = (row, over = {}, opts = {}) => { const r = { ...row, ...over }; return F.reminderFactsFor(r, { today: TODAY, occurrences: occurrenceDatesFor(r), ...opts }); };
const alarm = (f, night, remind, nowMs = NOW) => { const r = R.resolveReminder(f, night, remind, { nowMs, today: TODAY }); return r.ok ? iso(r.alarmMs) : "ERR:" + r.error; };

// ── 1. a Fall event: verified night list, 10 AM start, Eastern ─────────────
const fruit = fall("fruitville-grove-pumpkin-2026");
ok(!!fruit && fruit.occurrence_dates.length === 10, "PROBE: the real Fruitville Grove Pumpkin Festival row has its 10 verified nights");
const fruitF = facts(fruit);
ok(!!fruitF && fruitF.tz === "America/New_York" && fruitF.start_time === "10:00" && fruitF.nights.length === 10, "Fall: facts carry the verified nights, 10:00 start and Eastern zone");
{
  const n = R.reminderNights(fruitF, TODAY);
  ok(n.kind === "list" && n.default === "2026-10-17" && n.nights.join() === "2026-10-17,2026-10-18,2026-10-24,2026-10-25,2026-10-31,2026-11-01", "Fall: the picker lists only the upcoming verified nights, never the days between");
  ok(alarm(fruitF, "2026-10-17", "eve") === "2026-10-16T22:00:00Z", "Fall: the day before at 6 PM EDT is 22:00Z");
  ok(alarm(fruitF, "2026-10-17", "am") === "2026-10-17T13:00:00Z", "Fall: the morning of at 9 AM EDT is 13:00Z");
  ok(alarm(fruitF, "2026-10-17", "2h") === "2026-10-17T12:00:00Z", "Fall: 2 hours before a 10 AM start is 8 AM EDT = 12:00Z");
  ok(alarm(fruitF, "2026-10-24", "1w") === "2026-10-17T13:00:00Z" && alarm(fruitF, "2026-10-17", "1w").startsWith("ERR:"), "Fall: 1 week before at 9 AM EDT, and not offered once that morning has passed");
  ok(alarm(fruitF, "2026-10-20", "am").startsWith("ERR:"), "Fall: a day between the weekends is not a night of this event");
}

// ── 2. DST: the Nov 1 2026 change, same event, one day apart ───────────────
ok(alarm(fruitF, "2026-10-31", "2h") === "2026-10-31T12:00:00Z" && alarm(fruitF, "2026-11-01", "2h") === "2026-11-01T13:00:00Z", "DST: 2 hours before a 10 AM start is 12:00Z on Oct 31 (EDT) and 13:00Z on Nov 1 (EST)");
ok(alarm(fruitF, "2026-11-01", "eve") === "2026-10-31T22:00:00Z", "DST: the day before at 6 PM across the change (Oct 31 EDT) is 22:00Z");
ok(alarm(fruitF, "2026-11-01", "1w") === "2026-10-25T13:00:00Z" && alarm(fruitF, "2026-11-01", "am") === "2026-11-01T14:00:00Z", "DST: 1 week before is EDT (13:00Z), the morning of Nov 1 is EST (14:00Z)");
{
  const eve = facts({ slug: "dst-evening", event_name: "Evening Lights", start_date: "2026-11-01", end_date: "2026-11-01", start_time: "18:00:00", end_time: "21:00:00", city: "Tampa", state: "FL" });
  ok(alarm(eve, "2026-11-01", "2h") === "2026-11-01T21:00:00Z", "DST: Nov 1 2026 6 PM show, 2 hours before = 4 PM EST = 21:00Z");
  const w = R.eventWindow(eve, "2026-11-01");
  ok(iso(w.startMs) === "2026-11-01T23:00:00Z" && iso(w.endMs) === "2026-11-02T02:00:00Z", "DST: the show itself is 23:00Z to 02:00Z (EST)");
}
const jolly = xmas("jollywood-nights-2026");
const jollyF = facts(jolly);
ok(!!jollyF && jollyF.nights.includes("2027-01-05") && jollyF.start_time === "19:30", "PROBE: Jollywood Nights has a January 2027 night at 7:30 PM");
ok(alarm(jollyF, "2027-01-05", "2h") === "2027-01-05T22:30:00Z" && alarm(jollyF, "2027-01-05", "eve") === "2027-01-04T23:00:00Z", "January 2027: 2 hours before 7:30 PM EST = 22:30Z; the day before at 6 PM = 23:00Z");
{
  const w = R.eventWindow(jollyF, "2027-01-05");
  ok(iso(w.startMs) === "2027-01-06T00:30:00Z" && iso(w.endMs) === "2027-01-06T05:30:00Z", "January 2027: 7:30 PM to 12:30 AM runs 00:30Z to 05:30Z (the end rolls to the next day)");
}

// ── 3. a Halloween event (no night list: a range) ──────────────────────────
const mangoni = fall("haunted-mangoni-2026");
const mangoniF = facts(mangoni);
ok(!!mangoniF && mangoniF.nights === null && mangoniF.start_time === null, "Halloween: Haunted Mangoni (Sep 5 to Oct 31) has a range and no start time");
{
  const n = R.reminderNights(mangoniF, TODAY);
  ok(n.kind === "range" && n.min === TODAY && n.max === "2026-10-31", "Halloween: an already running range offers today through the last day, not the days that have passed");
  ok(alarm(mangoniF, "2026-10-20", "am") === "2026-10-20T13:00:00Z" && alarm(mangoniF, "2026-10-20", "2h").startsWith("ERR:"), "Halloween: no start time means no '2 hours before' and an all day invite");
}

// ── 4. a Christmas multi-night event ───────────────────────────────────────
const sunset = xmas("sunset-walk-holiday-nights-2026");
const sunsetF = facts(sunset);
ok(!!sunsetF && sunsetF.nights.length === 24 && sunsetF.start_time === "18:00" && sunsetF.end_time === "22:00", "Christmas: Sunset Walk Holiday Nights has 24 nights, 6 PM to 10 PM");
ok(alarm(sunsetF, "2026-12-03", "eve") === "2026-12-02T23:00:00Z" && alarm(sunsetF, "2026-12-03", "2h") === "2026-12-03T21:00:00Z", "Christmas: the day before at 6 PM EST = 23:00Z; 2 hours before 6 PM = 4 PM EST = 21:00Z");

// ── 5. Central Time Panhandle ──────────────────────────────────────────────
const beach = xmas("pensacola-beach-fireworks-cruise-2026");
const beachF = facts(beach);
ok(!!beachF && beachF.tz === "America/Chicago" && beachF.start_time === "18:30", "Panhandle: Pensacola Beach (row timezone America/Chicago) is Central");
ok(alarm(beachF, "2026-12-04", "2h") === "2026-12-04T22:30:00Z" && alarm(beachF, "2026-12-04", "eve") === "2026-12-04T00:00:00Z", "Panhandle: 2 hours before 6:30 PM CST = 4:30 PM CST = 22:30Z; the day before at 6 PM CST = 00:00Z (Eastern would say 23:00Z)");
{
  const w = R.eventWindow(beachF, "2026-12-04");
  ok(iso(w.startMs) === "2026-12-05T00:30:00Z", "Panhandle: 6:30 PM CST is 00:30Z, not the 23:30Z an Eastern clock would give");
  const countyOnly = facts(xmas("pensacola-downtown-first-city-lights-2026"), { timezone: undefined, start_time: "19:00:00" });
  ok(countyOnly && countyOnly.tz === "America/Chicago", "Panhandle: Escambia County with no stored zone is Central (county rule)");
  const eastern = F.reminderZoneFor({ county: "Orange", lat: 28.5, lng: -81.4 });
  ok(eastern === "America/New_York", "Orange County is Eastern");
  const dstCt = facts({ ...beach, start_date: "2026-11-01", end_date: "2026-11-01", start_time: "18:00:00", end_time: "21:00:00" });
  ok(alarm(dstCt, "2026-11-01", "2h") === "2026-11-01T22:00:00Z" && alarm(dstCt, "2026-11-01", "1w") === "2026-10-25T14:00:00Z", "Panhandle DST: Nov 1 2026 2 hours before 6 PM CST = 22:00Z; 1 week before at 9 AM CDT = 14:00Z");
}
{
  const z = (row) => F.reminderZoneFor(row);
  for (const county of ["Escambia", "Santa Rosa", "Okaloosa", "Walton", "Holmes", "Washington", "Bay", "Jackson", "Calhoun", "Escambia County"]) ok(z({ county, state: "FL" }) === "America/Chicago", `county ${county} is Central`);
  for (const county of ["Franklin", "Wakulla", "Leon", "Liberty", "Gadsden", "Orange", "Hillsborough", "Miami-Dade"]) ok(z({ county, state: "FL" }) === "America/New_York", `county ${county} is Eastern`);
  ok(z({ county: "Gulf", lat: 29.94, lng: -85.42 }) === "America/Chicago", "Gulf County: Mexico Beach (west of -85.38) is Central");
  ok(z({ county: "Gulf", lat: 29.81, lng: -85.30 }) === "America/New_York", "Gulf County: Port St. Joe is Eastern");
  ok(z({ lat: 30.4, lng: -87.2 }) === "America/Chicago" && z({ lat: 30.16, lng: -85.66 }) === "America/Chicago", "no county: Pensacola and Panama City by coordinates are Central");
  ok(z({ lat: 30.77, lng: -85.23 }) === "America/Chicago" && z({ lat: 30.44, lng: -85.03 }) === "America/Chicago", "no county: inland Marianna (Jackson) and Blountstown (Calhoun) are Central, west of the Apalachicola River");
  ok(z({ lat: 30.44, lng: -84.28 }) === "America/New_York" && z({ lat: 30.33, lng: -81.66 }) === "America/New_York", "no county: Tallahassee and Jacksonville are Eastern");
  ok(z({}) === "America/New_York" && z({ lat: "", lng: "" }) === "America/New_York", "no county and no coordinates: America/New_York");
  ok(z({ timezone: "America/Chicago", county: "Orange" }) === "America/Chicago", "a row's own IANA zone wins over the county");
}

// ── 6. called off, past, undated ───────────────────────────────────────────
{
  for (const status of ["canceled", "cancelled", "Canceled", "CANCELLED", "postponed", "Postponed", "event postponed"]) {
    ok(F.eventCalledOff({ status }) && F.eventCalledOff({ event_status: status }) && F.reminderEligibility({ ...fruit, status }, { today: TODAY }).reason === "canceled", `"${status}" is called off (status and event_status) and yields no facts`);
  }
  for (const status of ["scheduled", "sold_out", "unannounced", "", null, undefined]) ok(!F.eventCalledOff({ status, event_status: status }), `"${status}" is not called off`);
  ok(EVENT_CALLED_OFF.source === "cancelled|canceled|postponed" && EVENT_CALLED_OFF.flags === "i", "the called-off regex is the one lib/eventResolve.js has always used");
  const resolve = readFileSync(path.join(ROOT, "lib/eventResolve.js"), "utf8");
  ok(/import \{ EVENT_CALLED_OFF \} from "\.\/eventTime\.js"/.test(resolve) && /EVENT_CALLED_OFF\.test\(event\.status/.test(resolve) && !/\/cancelled\|canceled\|postponed\/i/.test(resolve), "lib/eventResolve.js uses the shared EVENT_CALLED_OFF, not a private copy");
  ok(F.reminderEligibility({ ...fruit, start_date: "2026-09-01", end_date: "2026-09-30", occurrence_dates: ["2026-09-05"] }, { today: TODAY }).reason === "past", "past: every night has gone by");
  ok(F.reminderEligibility({ ...sunset, start_date: "2026-10-01", end_date: "2026-10-05", occurrence_dates: null, event_id: "x-past" }, { today: TODAY }).reason === "past", "past: a range that ended");
  ok(F.reminderEligibility({ ...sunset, season_undated: true }, { today: TODAY }).reason === "undated", "undated: season_undated");
  ok(F.reminderEligibility({ ...sunset, start_date: null, occurrence_dates: null, event_id: "x-nodate" }, { today: TODAY }).reason === "undated", "undated: no start date");
  ok(F.reminderEligibility({ ...sunset, christmas_watchlist: true }, { today: TODAY }).reason === "undated" && F.reminderEligibility({ ...sunset, christmas_excluded: true }, { today: TODAY }).reason === "undated", "undated: watchlist twins and excluded rows");
  ok(F.reminderEligibility({ ...sunset, slug: "" }, { today: TODAY }).reason === "no_page" && F.reminderEligibility(null).reason === "invalid", "no page slug and no row are refused");
  const withHref = (href, row = sunset) => F.reminderEligibility(row, { today: TODAY, href });
  ok(withHref("/florida-events/" + sunset.slug).facts && withHref("/florida-events/" + sunset.slug + "?x=1").facts, "a card that opens its event page gets facts");
  ok(withHref(null).reason === "no_page" && withHref("https://organizer.example/").reason === "no_page" && withHref("/p/abc").reason === "no_page" && withHref("/florida-events/another-event").reason === "no_page", "a card that opens a venue sheet, an organizer site, or a different event gets none");
  ok(F.reminderEligibility({ name: "Feed Concert", date: "2026-11-20", time: "19:00:00", endDate: "2026-11-20", endTime: "22:00:00", lat: 28.5, lng: -81.4 }, { today: TODAY, href: "/florida-events/feed-concert" }).facts?.start_time === "19:00", "feed field names (date, time, endDate, endTime) read like the JSON-LD builder does");
}

// ── 7. an event that has started ───────────────────────────────────────────
{
  const at = (nightLocal) => Date.parse(nightLocal);
  // multi-night, already running: only upcoming nights, and a night whose start has passed is dropped.
  const dec10Eve = at("2026-12-11T01:00:00Z"); // Dec 10, 8 PM EST: tonight's 6 PM start has passed
  const n = R.reminderNights(sunsetF, "2026-12-10", dec10Eve);
  ok(n.kind === "list" && !n.nights.includes("2026-12-10") && n.nights.every((d) => d > "2026-12-10") && n.default > "2026-12-10", "started multi-night: tonight (already started) and every earlier night are gone, only upcoming nights remain");
  const earlier = R.reminderNights(sunsetF, "2026-12-10", at("2026-12-10T15:00:00Z")); // 10 AM: tonight still ahead
  ok(earlier.nights[0] === "2026-12-10" || earlier.nights[0] === "2026-12-11" || earlier.nights[0] > "2026-12-09", "running multi-night before tonight's start: tonight is still a choice if it is a listed night");
  ok(R.isReminderNight(sunsetF, "2026-12-10", "2026-12-10", dec10Eve) === false && R.isReminderNight(sunsetF, "2026-12-03", "2026-12-10", dec10Eve) === false, "started multi-night: isReminderNight refuses a night that has begun or gone by");
  // already started today: only the presets still in the future.
  const dec3 = at("2026-12-03T20:00:00Z"); // Dec 3, 3 PM EST, event starts 6 PM
  const opts = R.reminderOptions(sunsetF, "2026-12-03", dec3);
  ok(opts.filter((o) => o.available).map((o) => o.id).join() === "2h", `started today (3 PM, show at 6 PM): only "2 hours before" is left (got ${opts.filter((o) => o.available).map((o) => o.id)})`);
  ok(alarm(sunsetF, "2026-12-03", "2h", dec3) === "2026-12-03T21:00:00Z" && alarm(sunsetF, "2026-12-03", "am", dec3).startsWith("ERR:") && alarm(sunsetF, "2026-12-03", "eve", dec3).startsWith("ERR:"), "started today: the route math refuses the presets that have passed and accepts the one that has not");
  const after = R.reminderOptions(sunsetF, "2026-12-03", at("2026-12-03T23:30:00Z")); // 6:30 PM: started
  ok(after.every((o) => !o.available) && R.customBounds(sunsetF, "2026-12-03", at("2026-12-03T23:30:00Z")) === null, "after the start there is nothing left to offer on that night");
  const range = facts({ ...sunset, occurrence_dates: null, event_id: "x-range", start_date: "2026-12-01", end_date: "2026-12-20" });
  const rn = R.reminderNights(range, "2026-12-10", dec10Eve);
  ok(rn.kind === "range" && rn.min === "2026-12-11", "started range: today's night (already begun) is skipped, the range starts tomorrow");
}

// ── 8. every row in the data ───────────────────────────────────────────────
{
  const rows = [...FALL.map((r) => ({ cat: "fall", row: r })), ...XMAS.map((r) => ({ cat: "christmas", row: r }))];
  const HALLOWEEN = /halloween|haunt|howl|scream|spook|fright|horror|ghost|scare/i;
  const counts = {};
  let checkedNights = 0, mismatches = 0, badZones = 0, badAlarms = 0;
  for (const { cat, row } of rows) {
    const href = "/florida-events/" + row.slug;
    const { facts: f, reason } = F.reminderEligibility(row, { today: TODAY, href });
    const key = (cat === "fall" && HALLOWEEN.test([row.event_name, (row.tags || []).join(" "), row.subcategory].join(" "))) ? "halloween" : cat;
    counts[key] = counts[key] || { rows: 0, eligible: 0, undated: 0, past: 0, canceled: 0, other: 0 };
    counts[key].rows++;
    if (!f) { counts[key][reason in counts[key] ? reason : "other"]++; continue; }
    counts[key].eligible++;
    if (f.tz !== "America/New_York" && f.tz !== "America/Chicago") badZones++;
    const nights = (R.reminderNights(f, TODAY).nights) || [];
    const days = nights.length ? nights : [R.reminderNights(f, TODAY).min || R.reminderNights(f, TODAY).default].filter(Boolean);
    for (const night of days) {
      if (!f.start_time) continue;
      checkedNights++;
      const engine = R.eventStartMs(f, night);
      const jsonld = Date.parse(eventIsoWithOffset(night, f.start_time, F.reminderZoneFor({ ...row })));
      if (engine !== jsonld) mismatches++;
      const a = R.presetAlarmMs("2h", f, night);
      if (a !== engine - 2 * 3600000) badAlarms++;
    }
  }
  ok(badZones === 0, "every eligible row resolves to America/New_York or America/Chicago");
  ok(checkedNights > 100, `PROBE: the start-instant cross-check ran (${checkedNights} nights)`);
  ok(mismatches === 0, `the engine's start instant equals lib/eventTime.js eventIsoWithOffset for every night of every eligible row (${mismatches} mismatches in ${checkedNights} nights)`);
  ok(badAlarms === 0, "2 hours before is exactly 2 hours of real time before the start on every night, DST included");
  ok(counts.fall && counts.fall.eligible > 5 && counts.christmas && counts.christmas.eligible > 100 && counts.halloween && counts.halloween.eligible > 5, `PROBE: eligible rows exist in every category (${JSON.stringify(counts)})`);
  ok(counts.christmas.undated > 20 && counts.christmas.eligible + counts.christmas.undated + counts.christmas.past + counts.christmas.canceled + counts.christmas.other === counts.christmas.rows, "every Christmas row is accounted for: eligible, undated, past or refused");
  console.log("  eligible dated events today (" + TODAY + ") by category, from the checked-in data: " + Object.entries(counts).map(([k, v]) => `${k} ${v.eligible} of ${v.rows} (undated ${v.undated}, past ${v.past}, canceled ${v.canceled}, other ${v.other})`).join("; "));
}

// ── 9. nights come from lib/eventOccurrences.js, never invented ────────────
{
  const bare = { ...fruit, occurrence_dates: undefined };
  ok(JSON.stringify(facts(bare).nights) === JSON.stringify(occurrenceDatesFor(fruit)) && facts(bare).nights.length === 10, "a server caller passing occurrenceDatesFor(row) gives a row with no list of its own the registry's verified nights (by event_id)");
  ok(F.reminderFactsFor(bare, { today: TODAY }).nights === null, "a card (no `occurrences`) uses only the list its row carries: it never reaches into the registries");
  const mod = readFileSync(path.join(ROOT, "lib/eventReminderFacts.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!/eventOccurrences\.js|fallDiscoveries|occurrenceDatesFor\(/.test(mod) && /from "\.\/eventOccurrenceDays\.js"/.test(mod), "the facts module imports only the tiny day cleaner, so the Fall registries stay out of the home bundle");
  ok(JSON.stringify(cleanOccurrences(["2026-11-02", "2026-11-01", "2026-11-01", "bad"])) === JSON.stringify(["2026-11-01", "2026-11-02"]) && occurrenceDatesFor({ occurrence_dates: ["2026-11-02"] })[0] === "2026-11-02", "cleanOccurrences keeps one definition: eventOccurrences.js re-exports it");
  const own = facts({ ...fruit, occurrence_dates: ["2026-11-07", "2026-11-14"] });
  ok(own.nights.join() === "2026-11-07,2026-11-14", "a row's own occurrence_dates win over the registry");
  const noList = facts({ ...sunset, occurrence_dates: undefined, event_id: "x-no-registry", start_date: "2026-11-20", end_date: "2026-11-22" });
  ok(noList.nights === null && R.reminderNights(noList, TODAY).kind === "range", "no list anywhere: the date range, with no nights derived from it");
  const single = facts({ ...sunset, occurrence_dates: undefined, event_id: "x-single", start_date: "2026-11-20", end_date: null });
  ok(R.reminderNights(single, TODAY).kind === "single", "no list and no end date: the single date");
}

if (fail) { console.log(`test-event-reminder-facts: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-event-reminder-facts: OK (${pass} assertions on real Fall, Halloween, Christmas and Panhandle rows: DST, called off, past, undated, started events, zone rules, start-instant cross-check against lib/eventTime.js)`);
