// scripts/check-events-running-order.mjs
//
// THE INCIDENT (2026-10-08, live audit after #1664). The Events feed dropped
// every event whose START date was before today, so season-long Halloween
// events that opened in September (Howl-O-Scream, Halloween Horror Nights, the
// Sarasota haunted trolley, pumpkin patches) were missing from the Events tab
// while still open: 17 for Sarasota, 24 Tampa, 32 Orlando versus the fall rail.
// The day strip also matched only the start date, the list sorted a 42 mile
// Oktoberfest above a 6 mile pumpkin patch, the "Fall and Halloween" filter let
// in holiday lights and a musical, and a Ticketmaster copy of a curated show
// kept two cards.
//
// Everything here is CALLED: lib/eventsPipeline.js processEvents/validateEvent,
// the Events screen helpers loaded through scripts/lib/jsxLoad.mjs, and
// curatedToFeedEvent. One syntactic check covers the route's cache filter
// (a Next route file cannot export its helper), comments stripped.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { processEvents, validateEvent, lastEventDay, absorbCuratedTwins } from "../lib/eventsPipeline.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

const NOW = new Date("2026-10-08T12:00:00-04:00");
const TODAY = "2026-10-08";
const HERE = { lat: 27.34, lng: -82.53 };

// ── 1. validateEvent: past means the LAST day is past ───────────────────────
ok(validateEvent({ name: "Howl-O-Scream", date: "2026-09-11", endDate: "2026-11-01" }, NOW).ok === true, "a run that opened Sep 11 and closes Nov 1 is NOT past on Oct 8");
ok(validateEvent({ name: "Yesterday", date: "2026-10-07" }, NOW).reason === "past", "a one-day event yesterday is past");
ok(validateEvent({ name: "Ended", date: "2026-09-01", endDate: "2026-10-07" }, NOW).reason === "past", "a run that ended yesterday is past");
ok(validateEvent({ name: "Bad end", date: "2026-10-01", endDate: "2026-09-01" }, NOW).reason === "past", "an end date before the start is ignored (start decides)");
ok(lastEventDay({ date: "2026-10-01", endDate: "nope" }) === "2026-10-01", "a malformed end date never extends a run");

// ── 2. curated twins of aggregator rows collapse to one card ───────────────
const tm = { id: "tm1", name: "The Vampire Circus", venue: "Van Wezel Performing Arts Hall", date: "2026-10-25", time: "19:30", source: "Ticketmaster", url: "https://www.ticketmaster.com/x", lat: 27.34, lng: -82.55 };
const cur = { id: "wfc:v", name: "The Vampire Circus at the Van Wezel", venue: "Van Wezel Performing Arts Hall", date: "2026-10-25", time: "", source: "Wayfind curated", curated: true, url: "", lat: 27.34, lng: -82.55 };
const twins = absorbCuratedTwins([{ ...tm }, { ...cur }]);
ok(twins.length === 1 && twins[0].curated === true, "Ticketmaster's copy of a curated show is absorbed into the curated card");
ok(twins[0].url === tm.url, "…and the curated card borrows the buy URL it lacked");
ok(absorbCuratedTwins([{ ...tm, date: "2026-10-26" }, { ...cur }]).length === 2, "a different day is a different show");
ok(absorbCuratedTwins([{ ...tm, venue: "Straz Center" }, { ...cur }]).length === 2, "a different venue is a different show");
ok(absorbCuratedTwins([{ ...tm, name: "Boo" }, { ...cur, name: "Boo Bash" }]).length === 2, "titles shorter than 8 characters never merge");

// ── 3. the incident at scale: 1,100 curated rows + 300 aggregator rows ─────
function curRow(i, start, end, extra = {}) {
  return curatedToFeedEvent({
    event_id: "e" + i, slug: "e" + i, event_name: extra.name || "Haunted Event " + i, start_date: start, end_date: end,
    city: "Sarasota", venue: "Venue " + i, lat: 27.34 + (extra.dLat || 0), lng: -82.53, category: "halloween",
    tags: extra.tags || ["halloween"], select_nights: !!extra.select, card_hook: "h", event_status: "scheduled",
    official_event_url: "https://example.org/" + i,
  });
}
const curated = [];
let n = 0;
for (let i = 0; i < 40; i++) curated.push(curRow(n++, "2026-09-12", "2026-10-31"));                // running, opened before today
for (let i = 0; i < 1060; i++) curated.push(curRow(n++, "2026-10-" + String(9 + (i % 23)).padStart(2, "0"), null));
const runningId = curated[0].id;
const halloweenNight = curated.filter((e) => e.date === "2026-10-31");
const agg = [];
for (let i = 0; i < 300; i++) agg.push({ id: "tm" + i, name: "Concert " + i, venue: "Hall " + i, date: "2026-10-" + String(8 + (i % 20)).padStart(2, "0"), time: "20:00", source: "Ticketmaster", segment: "Music", url: "https://www.ticketmaster.com/" + i, lat: 27.35, lng: -82.53 });
const out = processEvents([{ provider: "Wayfind curated", configured: true, events: curated }, { provider: "Ticketmaster", configured: true, events: agg }], { ...HERE, radius: 25, city: "Sarasota", now: NOW });
const ids = new Set(out.events.map((e) => e.id));
ok(ids.has(runningId), "a run that opened before today reaches the feed");
ok(halloweenNight.length > 40 && halloweenNight.every((e) => ids.has(e.id)), `every Oct 31 curated row survives the 250 aggregator cap (${halloweenNight.length})`);
ok(out.events.filter((e) => e.curated).length === curated.length, "no curated row is cut by the cap (curated rows are lifted out before it)");
ok(out.events.filter((e) => !e.curated).length === 250, "the cap still governs aggregator rows");
ok(!out.events.some((e) => lastEventDay(e) < TODAY), "nothing in the feed is already over");

// ── 4. the screen: theme filter, day strip, ordering ───────────────────────
const REPO = fileURLToPath(new URL("..", import.meta.url));
const ev = await loadComponent(fileURLToPath(new URL("../app/components/screens/Events.js", import.meta.url)), REPO);
const fallF = ev.eventFiltersFor(true).find((f) => f.key === "fall");
const bucketOf = () => "community";
const themed = out.events.filter((e) => ev.filterMatches(fallF, e, bucketOf));
ok(themed.some((e) => e.id === runningId) && halloweenNight.every((e) => themed.some((t) => t.id === e.id)), "the Fall and Halloween filter keeps the running event and every Oct 31 event");
const lights = curatedToFeedEvent({ event_id: "hl", slug: "hl", event_name: "Holiday Lights in Largo Central Park", start_date: "2026-11-26", end_date: "2027-01-03", category: "holiday", tags: ["festival", "holiday", "fall"], city: "Largo", card_hook: "h", event_status: "scheduled" });
ok(!ev.filterMatches(fallF, lights, bucketOf), "holiday lights tagged fall stay out of Fall and Halloween");

const running = curated[0];
const selectRun = curRow(9001, "2026-10-02", "2026-11-01", { select: true });
ok(ev.eventRunsOn(running, TODAY) && ev.eventRunsOn(running, "2026-10-15"), "an every-day run appears under Today and later days of its run");
ok(!ev.eventRunsOn(running, "2026-11-01"), "…but not after its last day");
ok(ev.eventRunsOn(selectRun, "2026-10-02") && !ev.eventRunsOn(selectRun, "2026-10-09"), "a select-nights run is never claimed for a day it may be dark");
ok(ev.effectiveEventDate(running, TODAY) === TODAY && ev.effectiveEventDate(curated[50], TODAY) === curated[50].date, "a running event orders as today; a future event as its own date");

const near = { id: "near", date: "2026-10-09", time: "", lat: 27.36, lng: -82.53 };
const far = { id: "far", date: "2026-10-09", time: "10:00", lat: 27.95, lng: -82.46 };
const nearLater = { id: "nearLater", date: "2026-10-10", time: "09:00", lat: 27.35, lng: -82.53 };
const runToday = { id: "runToday", date: "2026-09-12", endDate: "2026-10-31", time: "", lat: 27.35, lng: -82.53 };
const oneToday = { id: "oneToday", date: TODAY, time: "19:00", lat: 27.36, lng: -82.53 };
const dist = (e) => { const R = 3958.8, t = (d) => (d * Math.PI) / 180; const s = Math.sin(t(e.lat - HERE.lat) / 2) ** 2 + Math.cos(t(HERE.lat)) * Math.cos(t(e.lat)) * Math.sin(t(e.lng - HERE.lng) / 2) ** 2; return R * 2 * Math.asin(Math.sqrt(s)); };
const order = ev.sortEventsForList([far, nearLater, near, runToday, oneToday], { today: TODAY, distMi: dist }).map((e) => e.id);
ok(order.join(",") === "oneToday,runToday,near,far,nearLater", `soonest day first; one-offs before still-open runs; nearby (within 25 mi) before a 42 mi event on the same day (got ${order.join(",")})`);
ok(ev.sortEventsForList([far, near], { today: TODAY, distMi: dist }).length === 2, "ordering never drops a row");

// ── 5. the route's cache filter uses the same last-day rule ────────────────
const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
ok(/const upcoming = \(evs\) => \(evs \|\| \[\]\)\.filter\(\(e\) => e && \(!e\.date \|\| lastEventDay\(e\) >= todayStr\)\)/.test(route), "the cached-feed filter keeps running events until their last day");
ok(/evK = "ev2\|" \+ FALL_FEED_CACHE_VERSION \+ "\|" \+ EVENTS_FEED_RULES \+/.test(route) && /const EVENTS_FEED_RULES = "running-v1"/.test(route), "the feed cache key carries the rules version, so pre-fix payloads are never served");
const screen = readFileSync(new URL("../app/components/screens/Events.js", import.meta.url), "utf8");
ok(/up to 60 mi away/.test(screen) && /CURATED_REACH_MI = 60;/.test(readFileSync(new URL("../lib/curatedEvents.js", import.meta.url), "utf8")), "the screen states the curated 60 mile reach, and it matches CURATED_REACH_MI");

if (fail.length) {
  console.error(`check-events-running-order: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-events-running-order: OK — ${pass} assertions; processEvents CALLED over 1,100 curated + 300 Ticketmaster rows (running event kept, every Oct 31 row past the 250 cap, nothing expired); Events screen helpers loaded and called (theme filter, run-aware day strip, nearest-first ordering); route cache filter checked syntactically`);
