#!/usr/bin/env node
// test-trending-rails — the TRENDING NOW poster's five shelves (owner,
// 2026-11-05). Asserted by CALL: selectPosterEvents("trending") is invoked on
// fixture events and splitTrendingPlaces on fixture places.
import { selectPosterEvents } from "../lib/posterEvents.js";
import { splitTrendingPlaces, trendingEventRail, trendingPlaceRail, trendRailFromTags, inTrendingWindow, TRENDING_RAIL_IDS } from "../lib/trendingRails.js";
import { orderFor } from "../lib/dayparts.js";
import { readFileSync } from "node:fs";

let pass = 0;
const ok = (c, m) => { if (!c) { console.error("test-trending-rails: FAIL — " + m); process.exit(1); } pass++; };

ok(JSON.stringify(TRENDING_RAIL_IDS) === JSON.stringify(["food", "festivals", "parties", "shows", "more"]), "five shelves in the owner's order");

const now = new Date("2026-11-05T17:00:00Z");
const base = { dest: "x", lat: 27.95, lng: -82.46, city: "Tampa", state: "FL", venue: "Venue", time: "18:00" };
const ev = (id, name, extra) => ({ ...base, id, name, date: "2026-11-07", ...extra });
const events = [
  ev("a", "Tampa Greek Festival", { segment: "Food", tags: ["wf-trending"] }),
  ev("b", "SAVOR St. Pete", { segment: "Food", tags: ["wf-trending", "trend-food"] }),
  ev("c", "Ed Sheeran LOOP Tour", { segment: "Music", popularity_score: 9 }),
  ev("d", "Quiet Library Talk", { segment: "Community" }),
  ev("e", "Rooftop Silent Disco Party", { segment: "", tags: ["wf-trending"] }),
  ev("f", "Far Future Fest", { segment: "Festival", tags: ["wf-trending"], date: "2026-12-20" }),
];
const rails = selectPosterEvents(events, { mode: "trending", center: { lat: 27.95, lng: -82.46 }, now });
const where = (id) => Object.keys(rails).find((k) => rails[k].some((e) => e.id === id)) || null;
ok(Object.keys(rails).length === 5, "trending mode returns the five shelves");
// If validateEvent rejects the fixture shape, every assertion below would pass vacuously: positive control first.
ok(where("a") === "festivals", `a scout-tagged festival lands on Festivals (got ${where("a")})`);
ok(where("b") === "food", "a trend-food tag pins the row to Food even though its name is a festival-free food event");
ok(where("c") === "shows", "a concert with a measured demand signal lands on Shows and Events");
ok(where("d") === null, "a happening with no scout tag and no demand signal is NOT called trending");
ok(where("e") === "parties", "a party lands on Parties");
ok(where("f") === null, "a happening outside the 10-day window is not on this week's shelves");

ok(trendRailFromTags(["trend-shows"]) === "shows" && trendRailFromTags(["trend-bogus"]) === null, "only real shelf ids can be pinned by tag");
ok(trendingEventRail({ name: "Badass Beer Fest" }) === "festivals", "a beer fest is a festival");
ok(inTrendingWindow({ date: "2026-11-01", endDate: "2026-11-08" }, "2026-11-05") && !inTrendingWindow({ date: "2026-11-01", endDate: "2026-11-04" }, "2026-11-05"), "a running multi-day event counts, a finished one does not");

const split = splitTrendingPlaces([
  { id: "1", name: "Bar", types: ["bar"] }, { id: "2", name: "Cafe", types: ["cafe"] },
  { id: "3", name: "Theater", primaryType: "performing_arts_theater" }, { id: "4", name: "Museum", types: ["museum"] },
  { id: "2", name: "dupe", types: ["cafe"] },
]);
ok(split.parties.length === 1 && split.food.length === 1 && split.shows.length === 1 && split.more.length === 1 && split.festivals.length === 0,
  "places sort onto Parties / Food / Shows / Everything Else, never Festivals, deduped");
ok(trendingPlaceRail({ types: ["restaurant", "bar"] }) === "parties", "a bar restaurant reads as nightlife");

const order = orderFor("afternoon", ["augtober", "christmas", "break", "trending", "season"], "2026-11-05");
ok(order[0] === "christmas" && order[1] === "augtober" && order[2] === "trending", `Trending Now sits immediately right of Fall in Florida, Christmas first (got ${order.slice(0, 3)})`);
const noFall = orderFor("afternoon", ["christmas", "break", "trending", "season"], "2026-11-30");
ok(noFall[0] === "christmas" && noFall[1] === "trending", `with Fall off the track Trending Now is right next to Christmas (got ${noFall.slice(0, 3)})`);
const summer = orderFor("afternoon", ["augtober", "christmas", "break", "trending", "season"], "2026-07-05");
ok(summer[0] !== "christmas", "outside the Christmas window the static order is untouched");

const dpr = readFileSync("app/components/DaypartRail.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
ok(/selRail\.id === "trending" \? \(\s*<TrendingRails[\s/>]/.test(dpr), "the trending drop mounts TrendingRails");
console.log(`test-trending-rails: OK — ${pass} assertions (shelf routing, evidence gate, window, place split, poster order) by CALL`);
