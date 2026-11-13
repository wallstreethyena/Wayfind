// Locks the "This weekend" row (lib/christmasWeekend.js): the window math in
// US Eastern (Sat/Sun start today), the top 3 cap per category, categories
// without results are omitted, at most 4 categories, a card is never repeated,
// and a location reorders within the same results. Executes the functions on
// fixture listings (no network).
import assert from "node:assert/strict";
import { christmasWeekendWindow, christmasWeekendGroups, CHRISTMAS_WEEKEND_PER_GROUP, CHRISTMAS_WEEKEND_MAX_GROUPS } from "../lib/christmasWeekend.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// 2026-11-12 is a Thursday.
eq(christmasWeekendWindow("2026-11-12"), ["2026-11-13", "2026-11-15"], "Thursday: the coming Friday to Sunday");
eq(christmasWeekendWindow("2026-11-09"), ["2026-11-13", "2026-11-15"], "Monday: the coming Friday to Sunday");
eq(christmasWeekendWindow("2026-11-13"), ["2026-11-13", "2026-11-15"], "Friday: today to Sunday");
eq(christmasWeekendWindow("2026-11-14"), ["2026-11-14", "2026-11-15"], "Saturday: today to Sunday");
eq(christmasWeekendWindow("2026-11-15"), ["2026-11-15", "2026-11-15"], "Sunday: today only");
eq(christmasWeekendWindow("2026-11-16"), ["2026-11-20", "2026-11-22"], "Monday after: next weekend");
eq(christmasWeekendWindow("2026-12-31"), ["2027-01-01", "2027-01-03"], "year rollover");

const card = (id, rail, cats, extra = {}) => ({
  id, kind: "event", title: "T " + id, name: "T " + id, city: "Tampa", region: "Tampa Bay",
  christmasRail: rail, browse_categories: cats, own_categories: [], lat: 27.95, lng: -82.46,
  start_date: "2026-11-01", end_date: "2026-12-31", occurrence_dates: ["2026-11-13", "2026-11-14", "2026-11-15"],
  price_kind: "free", audience: "all-ages", wfScore: 70, ...extra,
});
const TODAY = "2026-11-12";
const listings = [
  // five light displays: only three may show
  card("l1", "lights", ["lights"], { wfScore: 90 }), card("l2", "lights", ["lights"], { wfScore: 80 }),
  card("l3", "lights", ["lights"], { wfScore: 70 }), card("l4", "lights", ["lights"], { wfScore: 60 }), card("l5", "lights", ["lights"], { wfScore: 50 }),
  // one parade, one market (tied to a different pill)
  card("p1", "parades", ["parade"], { wfScore: 66 }),
  card("m1", "towns-markets", ["market"], { wfScore: 64 }),
  // a theme park night, a party and a bar: pushes past 4 categories
  card("t1", "theme-parks", ["theme-park"], { wfScore: 60 }),
  card("q1", "parties", ["party"], { wfScore: 40 }),
  // not in the window: dated after the weekend, and undated season listings
  card("late", "lights", ["lights"], { wfScore: 99, occurrence_dates: ["2026-11-27"], start_date: "2026-11-27" }),
  card("undated", "lights", ["lights"], { wfScore: 99, season_undated: true, occurrence_dates: [], start_date: null, end_date: null }),
];

const r = christmasWeekendGroups(listings, TODAY);
eq(r.window, ["2026-11-13", "2026-11-15"], "result carries the window");
ok(r.groups.length <= CHRISTMAS_WEEKEND_MAX_GROUPS && CHRISTMAS_WEEKEND_MAX_GROUPS === 4, "at most 4 categories");
eq(r.groups.length, 4, "5 categories had results, 4 are kept");
for (const g of r.groups) ok(g.cards.length >= 1 && g.cards.length <= CHRISTMAS_WEEKEND_PER_GROUP && CHRISTMAS_WEEKEND_PER_GROUP === 3, "top 3 cap in " + g.id);
const lights = r.groups.find((g) => g.id === "lights");
ok(lights, "lights group present");
eq(lights.cards.map((c) => c.id), ["l1", "l2", "l3"], "best rated three lights, in order");
const ids = r.groups.flatMap((g) => g.cards.map((c) => c.id));
eq(new Set(ids).size, ids.length, "a card never appears twice");
ok(!ids.includes("late") && !ids.includes("undated"), "outside the window and undated season listings are excluded");

// Categories without results are omitted.
const only = christmasWeekendGroups([card("p1", "parades", ["parade"])], TODAY);
eq(only.groups.map((g) => g.id), ["parades"], "only the category with results");
eq(christmasWeekendGroups([], TODAY).groups, [], "empty listings give no groups");
eq(christmasWeekendGroups([card("late", "lights", ["lights"], { occurrence_dates: ["2026-11-27"], start_date: "2026-11-27", end_date: "2026-11-27" })], TODAY).groups, [], "nothing this weekend gives no groups");

// Saturday: Friday only listings are out, today and Sunday are in.
const fri = card("fri", "lights", ["lights"], { occurrence_dates: ["2026-11-13"], start_date: "2026-11-13", end_date: "2026-11-13" });
const sun = card("sun", "lights", ["lights"], { occurrence_dates: ["2026-11-15"], start_date: "2026-11-15", end_date: "2026-11-15" });
eq(christmasWeekendGroups([fri, sun], "2026-11-14").groups[0].cards.map((c) => c.id), ["sun"], "Saturday drops Friday only listings");
eq(christmasWeekendGroups([fri, sun], "2026-11-15").groups[0].cards.map((c) => c.id), ["sun"], "Sunday keeps Sunday");

// Location ordering: same rating, the nearer one leads when located.
const near = card("near", "lights", ["lights"], { wfScore: 80, lat: 27.95, lng: -82.46, city: "Tampa" });
const far = card("far", "lights", ["lights"], { wfScore: 80, lat: 30.33, lng: -81.66, city: "Jacksonville" });
const located = christmasWeekendGroups([far, near], TODAY, { lat: 27.95, lng: -82.46 });
eq(located.located, true, "located flag");
eq(located.groups[0].cards.map((c) => c.id), ["near", "far"], "nearer ring first when located");
const farOnly = christmasWeekendGroups([near, far], TODAY, { lat: 30.33, lng: -81.66 });
eq(farOnly.groups[0].cards.map((c) => c.id), ["far", "near"], "ordering follows the visitor");
// Rings dominate rating: a worse rated card in the nearest ring beats a better one two rings out.
const better = card("better", "lights", ["lights"], { wfScore: 95, lat: 30.33, lng: -81.66 });
const nearLow = card("nearLow", "lights", ["lights"], { wfScore: 40, lat: 27.95, lng: -82.46 });
eq(christmasWeekendGroups([better, nearLow], TODAY, { lat: 27.95, lng: -82.46 }).groups[0].cards.map((c) => c.id), ["nearLow", "better"], "20 mile rings come before rating");
eq(christmasWeekendGroups([better, nearLow], TODAY).groups[0].cards.map((c) => c.id), ["better", "nearLow"], "statewide: best rated first");

console.log("test-christmas-weekend: OK (" + n + " assertions)");
