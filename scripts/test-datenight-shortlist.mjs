#!/usr/bin/env node
// scripts/test-datenight-shortlist.mjs — owner Date Night poster + 27-mile rails.
import { readFileSync, existsSync } from "fs";
import { fillRails, selectFor, MIN_CARDS } from "../lib/railSelect.js";
import { DATENIGHT_NEAR_MI, isDateRoom, isRooftopDatePlace } from "../lib/dateRoom.js";
import { INTENT_PAGES, INTENT_HAS_TOURS } from "../lib/intentPages.js";
import { RAILS, RAIL_ART_V, railArtFallback } from "../lib/rails.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

ok(existsSync("public/cards/date-night-owner.png"), "owner poster is at public/cards/date-night-owner.png");
ok(existsSync("art/rail-sources/datenight.png"), "owner source PNG is at art/rail-sources/datenight.png");
ok(existsSync("public/cards-v8/datenight-760.jpg"), "homepage rail ladder exists");
ok(INTENT_PAGES["date-night"].art === "/cards/date-night-owner.png", "/date-night hero is the owner poster");
ok(INTENT_PAGES["date-night"].card.art === "/cards/date-night-owner.png", "share card is the same poster");
ok(RAILS.find((r) => r.id === "datenight")?.art === "datenight", "DaypartRail still uses art basename datenight");
ok(railArtFallback("datenight").includes("?v=" + RAIL_ART_V), "RAIL_ART_V busts the cached tile");
ok(RAIL_ART_V === "12", "RAIL_ART_V is 12");
ok(DATENIGHT_NEAR_MI === 27, "DATENIGHT_NEAR_MI is 27.0");
ok(INTENT_PAGES["date-night"].maxMi === 27, "landing caps at 27.0");
ok(INTENT_HAS_TOURS["date-night"] === false, "Date Night has no partner / Book rail");

const mk = (id, o) => ({
  id, name: o.name, rating: o.rating ?? 4.6, reviews: o.reviews ?? 400,
  types: o.types || ["restaurant"], primaryType: o.primaryType,
  distMi: o.distMi ?? 3, _s: o._s ?? 80,
  priceLevel: o.priceLevel || "PRICE_LEVEL_MODERATE",
  governed_score: o._s ?? 80,
});

ok(isRooftopDatePlace(mk("r", { name: "Harbor Rooftop Bar", types: ["rooftop_bar", "bar"] })),
  "rooftop_bar classifies");
ok(isDateRoom(mk("s", { name: "Fleming's", primaryType: "steak_house", types: ["steak_house"] })),
  "a steakhouse is still a date room");
ok(!isDateRoom(mk("b", { name: "Sunshine Skyway Bridge", primaryType: "bridge", types: ["bridge"], priceLevel: null })),
  "a bridge is not a date room");

const emptyPools = {
  restaurants: [], nightlife: [], events: [], "things-to-do": [], summer: [],
  beaches: [], creators: [], breakfast: [], quickeats: [], family: [], drive: [],
  birthday: [], localpicks: [], trending: [],
};
const originPools = {
  ...emptyPools,
  restaurants: [
    mk("in-room", { name: "Near Chophouse", types: ["steak_house"], distMi: 5, _s: 90 }),
    mk("in-28", { name: "Too Far Steakhouse", types: ["steak_house"], distMi: 28, _s: 99 }),
  ],
  nightlife: [
    mk("in-roof", { name: "Harbor Rooftop Bar", types: ["rooftop_bar", "bar"], distMi: 10, _s: 84 }),
  ],
  events: [
    mk("in-show", { name: "Comedy Room", types: ["comedy_club"], distMi: 12, _s: 78, priceLevel: null }),
  ],
};

ok(selectFor("datenight", originPools).some((p) => p.id === "in-28"),
  "selectFor admits a 28mi steakhouse — identity is not the radius");
const filled = fillRails(originPools, (p) => p, { nearMi: 17, widenMi: 25, cityLabel: "Parrish" });
ok(filled.places.datenight.every((p) => p.distMi <= 27), "fillRails Date Night excludes >27mi");
ok(!filled.places.datenight.some((p) => p.id === "in-28"), "a restaurant 28 miles away is out");
ok(filled.places.datenight.some((p) => p.id === "in-roof"), "a rooftop 10 miles in is in");
ok(filled.places.datenight.some((p) => p.id === "in-show"), "a show venue inside 27 miles is in");

const none = fillRails({
  ...emptyPools,
  restaurants: [mk("taco", { name: "Corner Taco", types: ["fast_food_restaurant"], distMi: 1 })],
}, (p) => p, { nearMi: 17, widenMi: 25 });
ok(none.places.datenight.length === 0, "empty if inventory has no Date Night match — we do not invent");
ok(none.places.datenight.length < MIN_CARDS, "a thin shortlist ships empty rather than stretching ranking");

const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
ok(/\/api\/rails\?lat=/.test(ic), "/date-night reads /api/rails");
const dnStart = ic.indexOf('if (intent === "date-night") {');
const dnEnd = ic.indexOf("const qs = def.queries(now);");
ok(dnStart >= 0 && dnEnd > dnStart, "date-night inventory fetch is a real branch");
const dnFetch = ic.slice(dnStart, dnEnd).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
ok(dnFetch.length > 0 && !/\/api\/places\/search/.test(dnFetch), "that branch does not call Places");
ok(/intent === "date-night" \? null : <IntentPartnerPick/.test(ic), "no partner / Book rail on Date Night");

ok(RAILS.find((r) => r.id === "family")?.art === "family", "Family poster unchanged");
ok(RAILS.find((r) => r.id === "breakfast")?.art === "breakfast", "Breakfast poster unchanged");
ok(RAILS.find((r) => r.id === "tonight")?.art === "tonight", "Tonight poster unchanged");
ok(RAILS.find((r) => r.id === "drive")?.art === "drive", "Worth the Drive poster unchanged");

console.log(`test-datenight-shortlist: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
