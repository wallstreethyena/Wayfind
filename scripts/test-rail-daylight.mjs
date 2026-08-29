#!/usr/bin/env node
// scripts/test-rail-daylight.mjs — THE RAILS HAVE A CLOCK, AND IT IS EXECUTED.
//
// v8.82 (owner, 2026-08-28, on the live homepage): the date night and tonight
// cards "are horrible for night time — nothing is an actual recommendation I
// would follow … I need a deep audit and a fix to the list."
//
// What the audit measured against production, reader in Bradenton, 19:12 ET:
//   · 16 of 17 rails returned BYTE-IDENTICAL lists for band=morning and
//     band=night. Only `today` moves with the hour, and only because the owner
//     hand-filed two boards.
//   · Date Night's top four: a dolphin-tour boat, a beach 16 miles out, a
//     room, and a nature preserve that locks at dusk.
//   · 19 of 1,404 rows across all rails carry opening hours at all.
//
// This file is the lock. Every assertion CALLS the rule — none of it reads
// source — because the whole class of defect here is a list that looks right
// and is wrong for the minute you are in.
import {
  sunTimesUtc, isAfterDark, isDaylightOnlyPlace, primaryTypeOf,
  servableNow, servableRows, isNowRail, NOW_RAILS,
} from "../lib/daylight.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const BRADENTON = { lat: 27.4989, lng: -82.5748 };
const at = (iso) => new Date(iso).getTime();
const etClock = (ms) => new Date(ms).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
const etDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// ── 1. SUNSET IS COMPUTED, AND PINNED TO PUBLISHED TIMES ────────────────────
// A fixed "after 8pm" rule would be wrong by more than 90 minutes twice a
// year in Florida, so the math has to be right rather than roughly right.
// Tolerance is 6 minutes: published tables differ from each other by a few
// minutes over refraction and observer elevation, and nothing downstream can
// tell the difference — the gate only asks which side of sunset we are on.
// Both directions of the earlier bugs are pinned here: anchoring on UTC
// midnight resolved the PREVIOUS day's sun, and ceil() resolved the NEXT day's
// after local noon. Asserting the DATE is what catches those; asserting only
// the clock time would have passed both, because sunset barely moves overnight.
const SUN = [
  // label,                lat/lng,     instant (UTC),           ET date,      sunrise, sunset
  ["Bradenton, Aug 28 2pm", BRADENTON, "2026-08-28T18:00:00Z", "2026-08-28", "07:02", "19:56"],
  ["Bradenton, Aug 28 7pm", BRADENTON, "2026-08-28T23:12:00Z", "2026-08-28", "07:02", "19:56"],
  ["Bradenton, Aug 28 11pm", BRADENTON, "2026-08-29T03:00:00Z", "2026-08-28", "07:02", "19:56"],
  ["Bradenton, winter solstice", BRADENTON, "2026-12-21T17:00:00Z", "2026-12-21", "07:17", "17:38"],
  ["Bradenton, summer solstice", BRADENTON, "2026-06-21T16:00:00Z", "2026-06-21", "06:35", "20:28"],
  ["Miami, Aug 28", { lat: 25.7617, lng: -80.1918 }, "2026-08-28T18:00:00Z", "2026-08-28", "06:56", "19:45"],
  ["Jacksonville, Aug 28", { lat: 30.3322, lng: -81.6557 }, "2026-08-28T18:00:00Z", "2026-08-28", "07:02", "19:58"],
];
const TOL_MIN = 6;
const minsOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
for (const [label, pt, iso, wantDate, wantRise, wantSet] of SUN) {
  const { sunrise, sunset } = sunTimesUtc(pt.lat, pt.lng, new Date(iso));
  ok(sunrise != null && sunset != null, `${label}: the sun resolves at all`);
  if (sunrise == null || sunset == null) continue;
  eq(etDate(sunset), wantDate, `${label}: sunset lands on the reader's own calendar day`);
  const dRise = Math.abs(minsOf(etClock(sunrise)) - minsOf(wantRise));
  const dSet = Math.abs(minsOf(etClock(sunset)) - minsOf(wantSet));
  ok(dRise <= TOL_MIN, `${label}: sunrise ${etClock(sunrise)} within ${TOL_MIN}min of published ${wantRise} (off by ${dRise})`);
  ok(dSet <= TOL_MIN, `${label}: sunset ${etClock(sunset)} within ${TOL_MIN}min of published ${wantSet} (off by ${dSet})`);
}
// The seasonal swing is the reason this is computed rather than a constant.
{
  const w = sunTimesUtc(BRADENTON.lat, BRADENTON.lng, new Date("2026-12-21T17:00:00Z")).sunset;
  const s = sunTimesUtc(BRADENTON.lat, BRADENTON.lng, new Date("2026-06-21T16:00:00Z")).sunset;
  const swing = minsOf(etClock(s)) - minsOf(etClock(w));
  ok(swing > 150, `sunset swings ${swing} minutes between solstices — a fixed hour cannot serve both (this is why the math is here)`);
}

// ── 2. THE DARK BOUNDARY ────────────────────────────────────────────────────
// Positive AND negative: a rule that answers "dark" to everything would pass a
// one-sided test and empty every rail on the site at noon.
for (const [iso, wantDark, note] of [
  ["2026-08-28T18:00:00Z", false, "2pm is not dark"],
  ["2026-08-28T23:12:00Z", false, "7:12pm, 45min before sunset, is not dark — the minute the owner was looking"],
  ["2026-08-29T00:30:00Z", true, "8:30pm, after sunset, is dark"],
  ["2026-08-29T03:00:00Z", true, "11pm is dark"],
  ["2026-08-29T09:00:00Z", true, "5am, before sunrise, is dark"],
  ["2026-08-29T13:00:00Z", false, "9am is not dark"],
]) eq(isAfterDark(BRADENTON.lat, BRADENTON.lng, at(iso)), wantDark, note);
eq(isAfterDark(null, null, at("2026-08-29T03:00:00Z")), false, "unknown coordinates are never 'dark' — an unlocated reader must not have their rails emptied");

// ── 3. THE IDENTITY, AND THE ONE ROW IT MUST NOT EAT ────────────────────────
// N Skyway Fishing Pier State Park is the control that matters. It carries
// `park`, `state_park` and `tourist_attraction` in its SECONDARY types and it
// is the deliberate, curated night venue on Tonight's Move ("night fishing
// under the lit Skyway span"). A rule that read secondary tokens would delete
// the best card on the rail this whole change exists to fix.
const SKYWAY = { name: "N Skyway Fishing Pier State Park", primaryType: "fishing_pier", types: ["fishing_pier", "tourist_attraction", "state_park", "park", "point_of_interest"] };
eq(primaryTypeOf(SKYWAY), "fishing_pier", "the primary type is the claim, not the first secondary token");
eq(isDaylightOnlyPlace(SKYWAY), false, "the lit night-fishing pier is NOT daylight-only, despite carrying park and state_park (v8.30.1 primary-type discipline, load-bearing here)");
for (const [primary, want, note] of [
  ["beach", true, "a beach"], ["nature_preserve", true, "a nature preserve"],
  ["city_park", true, "a city park"], ["botanical_garden", true, "a botanical garden"],
  ["tour_agency", true, "a sightseeing tour operator"], ["fishing_charter", true, "a fishing charter"],
  ["playground", true, "a playground"], ["marina", true, "a marina"],
  ["restaurant", false, "a restaurant"], ["bar", false, "a bar"],
  ["live_music_venue", false, "a live music venue"], ["movie_theater", false, "a cinema"],
  ["museum", false, "a museum — it closes, but closing is an HOURS fact, not a daylight one"],
  ["indoor_playground", false, "an indoor playground — indoors is indoors after dark"],
]) eq(isDaylightOnlyPlace({ primaryType: primary, types: [primary] }), want, `daylight identity: ${note}`);
eq(isDaylightOnlyPlace({}), false, "a row with no types at all is not daylight-only — unknown is served");

// ── 4. THE GATE: EVIDENCE OUTRANKS INFERENCE ────────────────────────────────
const DARK = at("2026-08-29T03:00:00Z");   // 11pm ET
const DAY = at("2026-08-28T18:00:00Z");    // 2pm ET
const ctx = (now) => ({ ...BRADENTON, now });
const preserve = { name: "Emerson Point Preserve", primaryType: "nature_preserve", types: ["nature_preserve", "park"] };
const room = { name: "Sofra Kitchen Bar & Bistro", primaryType: "italian_restaurant", types: ["italian_restaurant", "restaurant"] };
eq(servableNow(preserve, ctx(DAY)), true, "a preserve is a fine answer in daylight");
eq(servableNow(preserve, ctx(DARK)), false, "a preserve is not an answer at 11pm");
eq(servableNow(room, ctx(DARK)), true, "a restaurant with no hours is UNKNOWN at 11pm, and unknown is served — this rule never invents a closing time");
// Layer 1 beats layer 2, in both directions.
const OPEN_LATE = { periods: [{ open: { day: 0, hour: 6, minute: 0 }, close: { day: 0, hour: 23, minute: 59 } },
  { open: { day: 1, hour: 6, minute: 0 }, close: { day: 1, hour: 23, minute: 59 } },
  { open: { day: 2, hour: 6, minute: 0 }, close: { day: 2, hour: 23, minute: 59 } },
  { open: { day: 3, hour: 6, minute: 0 }, close: { day: 3, hour: 23, minute: 59 } },
  { open: { day: 4, hour: 6, minute: 0 }, close: { day: 4, hour: 23, minute: 59 } },
  { open: { day: 5, hour: 6, minute: 0 }, close: { day: 5, hour: 23, minute: 59 } },
  { open: { day: 6, hour: 6, minute: 0 }, close: { day: 6, hour: 23, minute: 59 } }] };
const litPark = { ...preserve, oh: OPEN_LATE, utcOffset: -240 };
eq(servableNow(litPark, ctx(DARK)), true, "a park that PUBLISHES late hours is open at 11pm — real hours outrank the daylight inference");
// v8.89 — THE CLOCK THIS ASSERTION IS ACTUALLY ABOUT.
//
// The line above went red on a clean tree between midnight and 6am, every
// night, and passed the other eighteen hours: servableNow's hours layer called
// openNowFromHours WITHOUT the `now` it had been handed, so businessStatus fell
// back to Date.now() while the daylight layer below it used `now`. Two layers
// of one decision, reading two different clocks.
//
// So the fixture is walked at four instants that are NOT the current one, and
// the answers have to disagree with each other — a pair that came back
// identical would be the bug, restated.
eq(servableNow(litPark, ctx(at("2026-08-29T04:30:00Z"))), false,
  "…and CLOSED at 12:30am ET, when the same published hours say so — the hours layer answers for the instant it was given, not for whenever the test happens to run");
eq(servableNow(litPark, ctx(at("2026-08-29T14:00:00Z"))), true, "…open again at 10am ET");
eq(servableNow(litPark, ctx(at("2026-08-29T09:00:00Z"))), false, "…still closed at 5am ET");

// ── 5. WHICH RAILS ANSWER "RIGHT NOW" ───────────────────────────────────────
// Pinned as a set. Adding or removing a rail here is a product decision about
// what its tile promises, and it should have to be made on purpose.
eq(NOW_RAILS.join(","), "tonight,datenight,eat,break,breakfast,best,gems,trending,family",
  "the now-rail set is exactly the rails whose tiles claim the current moment");
for (const id of ["beach", "drive", "season", "today", "events", "birthday", "locals", "cindy"])
  eq(isNowRail(id), false, `${id} is a PLAN rail — you read it to decide about tomorrow, so the current minute must not filter it`);

// ── 6. END TO END, ON THE SHAPE PRODUCTION ACTUALLY RETURNED ────────────────
// These four rows are the measured top of Date Night at 19:12 ET on
// 2026-08-28, with their real primary types.
const DATENIGHT_LIVE = [
  { name: "Anna Maria Island Dolphin Tours", primaryType: "tour_agency", types: ["tour_agency", "travel_agency"] },
  { name: "Siesta Beach", primaryType: "beach", types: ["beach", "natural_feature"] },
  { name: "Sofra Kitchen Bar & Bistro", primaryType: "italian_restaurant", types: ["italian_restaurant"] },
  { name: "Emerson Point Preserve", primaryType: "nature_preserve", types: ["nature_preserve", "park"] },
];
const afterDark = servableRows("datenight", DATENIGHT_LIVE, ctx(DARK));
eq(afterDark.length, 1, "after dark, three of the four live Date Night leaders are gone");
eq(afterDark[0].name, "Sofra Kitchen Bar & Bistro", "and the one that survives is the room — which is what the tile promised");
eq(servableRows("datenight", DATENIGHT_LIVE, ctx(DAY)).length, 4, "in daylight nothing is removed: a golden-hour pick at golden hour is honest");
// The plan rail is untouched at the same instant — proof the filter is scoped
// and not simply deleting outdoor places everywhere.
eq(servableRows("beach", DATENIGHT_LIVE, ctx(DARK)).length, 4, "Beach Day is NOT filtered after dark — planning tomorrow's beach at 11pm is the point of that rail");
// Tonight's Move keeps its curated night venue at the hour it exists for.
eq(servableRows("tonight", [SKYWAY], ctx(DARK)).length, 1, "the lit fishing pier survives Tonight's Move at 11pm — the rail's whole reason to exist");

// ── 7. THE PROBE FINDS A KNOWN POSITIVE ─────────────────────────────────────
// A filter that returned everything unchanged would pass most of the file
// above. This is the control that separates "the rule is correct" from "the
// rule never fired".
{
  const before = DATENIGHT_LIVE.length;
  const after = servableRows("datenight", DATENIGHT_LIVE, ctx(DARK)).length;
  ok(after < before, `positive control: the filter actually removed rows (${before} -> ${after}); a no-op would satisfy almost every other assertion here`);
}

console.log(`\ntest-rail-daylight: ${fail ? "FAIL" : "OK"} — ${pass} assertions, every one a CALL: sunset pinned to published times at three latitudes and both solstices, the dark boundary in both directions, the Skyway primary-type control, hours outranking inference, and the measured Date Night top four resolved at 11pm`);
process.exit(fail ? 1 : 0);
