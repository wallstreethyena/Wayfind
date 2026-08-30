#!/usr/bin/env node
// scripts/test-datenight-shortlist.mjs — owner Date Night poster + 27-mile rails.
//
// Asserts ON THE CALL: the poster path is this file, Date Night results
// exclude places >27mi from the page center, a restaurant 28mi away is out,
// a rooftop 10mi in is in if inventory classifies it, empty if none.
import { readFileSync, existsSync } from "fs";
import { fillRails, selectFor, MIN_CARDS } from "../lib/railSelect.js";
import { DATENIGHT_NEAR_MI, isDateNightShortlist, isDateRoom, isRooftopDatePlace } from "../lib/dateRoom.js";
import { INTENT_PAGES, INTENT_HAS_TOURS } from "../lib/intentPages.js";
import { RAILS, RAIL_ART_V, railArtFallback } from "../lib/rails.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const POSTER = "public/cards/date-night-owner.png";
const SOURCE = "art/rail-sources/datenight.png";
ok(existsSync(POSTER), "the owner Date Night poster is committed at public/cards/date-night-owner.png");
ok(existsSync(SOURCE), "the owner source PNG is committed at art/rail-sources/datenight.png — going forward this file is the source of truth");
ok(existsSync("public/cards-v8/datenight-760.jpg"), "the homepage rail ladder was rebuilt from that poster");
ok(INTENT_PAGES["date-night"].art === "/cards/date-night-owner.png",
  "the /date-night landing hero is the owner poster, not Adobe Stock");
ok(INTENT_PAGES["date-night"].card.art === "/cards/date-night-owner.png",
  "the date-night share card is the same owner poster");
const rail = RAILS.find((r) => r.id === "datenight");
ok(!!rail && rail.art === "datenight", "the homepage Date Night tile still uses the datenight art basename");
ok(railArtFallback("datenight").includes("?v=" + RAIL_ART_V),
  "RAIL_ART_V busts the cached previous Date Night tile");
ok(RAIL_ART_V === "12", "RAIL_ART_V is 12 — the Date Night poster swap");

ok(!/Book date night/.test(readFileSync("lib/rails.js", "utf8")),
  "Date Night copy no longer says Book — no Book /go");
ok(rail.cta === "See date night", "the Date Night CTA is See date night, not Book");
ok(rail.sub.includes("Speakeasies") && rail.sub.includes("rooftops"),
  "rail copy names the categories the poster prints");

ok(DATENIGHT_NEAR_MI === 27, "DATENIGHT_NEAR_MI is 27.0 — the number the poster prints");
ok(INTENT_PAGES["date-night"].maxMi === 27, "the landing page caps at the same 27.0");
ok(INTENT_HAS_TOURS["date-night"] === false, "Date Night has no partner / Book tour rail");

const mk = (id, o) => ({
  id, name: o.name, rating: o.rating ?? 4.6, reviews: o.reviews ?? 400,
  types: o.types || ["restaurant"], primaryType: o.primaryType,
  distMi: o.distMi ?? 3, _s: o._s ?? 80,
  priceLevel: o.priceLevel || "PRICE_LEVEL_MODERATE",
  governed_score: o._s ?? 80, tags: o.tags,
});

ok(isRooftopDatePlace(mk("r", { name: "Harbor Rooftop Bar", types: ["rooftop_bar", "bar"], distMi: 10 })),
  "inventory rooftop_bar classifies as a rooftop");
ok(isDateNightShortlist(mk("r", { name: "Harbor Rooftop Bar", types: ["rooftop_bar", "bar"], distMi: 10 })),
  "that rooftop is on the Date Night shortlist");
ok(isDateRoom(mk("s", { name: "Fleming's", primaryType: "steak_house", types: ["steak_house"] })),
  "a steakhouse is still a date room");
ok(!isDateNightShortlist(mk("b", { name: "Sunshine Skyway Bridge", primaryType: "bridge", types: ["bridge"], priceLevel: null })),
  "a bridge is not on the shortlist");

const originPools = {
  datenight: [
    mk("in-room", { name: "Near Chophouse", types: ["steak_house"], distMi: 5, _s: 90 }),
    mk("in-roof", { name: "Harbor Rooftop Bar", types: ["rooftop_bar", "bar"], distMi: 10, _s: 84 }),
    mk("in-show", { name: "Comedy Room", types: ["comedy_club"], distMi: 12, _s: 78, priceLevel: null }),
    mk("in-28", { name: "Too Far Steakhouse", types: ["steak_house"], distMi: 28, _s: 99 }),
  ],
  restaurants: [],
  nightlife: [],
  events: [],
  summer: [],
  "things-to-do": [],
  beaches: [],
  creators: [],
  breakfast: [],
  quickeats: [],
  family: [],
  drive: [],
  birthday: [],
  localpicks: [],
  trending: [],
};

ok(selectFor("datenight", originPools).some((p) => p.id === "in-28"),
  "selectFor admits a 28mi steakhouse — identity is not the radius");
ok(selectFor("datenight", originPools).some((p) => p.id === "in-roof"),
  "selectFor admits the 10mi rooftop");

const filled = fillRails(originPools, (p) => p, { nearMi: 17, widenMi: 25, cityLabel: "Parrish" });
ok(filled.places.datenight.every((p) => p.distMi <= 27),
  "fillRails Date Night excludes every place >27mi from the page center");
ok(!filled.places.datenight.some((p) => p.id === "in-28"),
  "a restaurant 28 miles away is out");
ok(filled.places.datenight.some((p) => p.id === "in-roof"),
  "a rooftop 10 miles in is in");
ok(filled.places.datenight.some((p) => p.id === "in-show"),
  "a show venue inside 27 miles is in");

const none = fillRails({
  ...originPools,
  datenight: [],
  restaurants: [mk("taco", { name: "Corner Taco", types: ["fast_food_restaurant"], distMi: 1 })],
}, (p) => p, { nearMi: 17, widenMi: 25 });
ok(none.places.datenight.length === 0,
  "empty if inventory has no Date Night match in 27 miles — we do not invent places");
ok(none.places.datenight.length < MIN_CARDS,
  "a thin Date Night shortlist ships empty rather than stretching ranking");

const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
ok(/intent === "date-night"/.test(ic) && /\/api\/rails\?lat=/.test(ic),
  "the /date-night landing reads /api/rails — the same inventory shortlist as the home drop");
const dnStart = ic.indexOf('if (intent === "date-night") {');
const dnEnd = ic.indexOf("const qs = def.queries(now);");
ok(dnStart >= 0 && dnEnd > dnStart, "positive control: the date-night inventory fetch is a real branch");
const dnFetch = (dnStart >= 0 && dnEnd > dnStart ? ic.slice(dnStart, dnEnd) : "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
ok(dnFetch.length > 0 && !/\/api\/places\/search/.test(dnFetch),
  "that branch does not call /api/places/search — zero Google Places on Date Night");
ok(dnFetch.length > 0 && !/placeDetails|fetchPlaceDetail|photoRef|photo backfill/i.test(dnFetch),
  "that branch does not call Place Details or photo backfill");
ok(/intent === "date-night" \? null : <IntentPartnerPick/.test(ic),
  "Date Night landing renders no partner / Book rail");

const family = RAILS.find((r) => r.id === "family");
const breakfast = RAILS.find((r) => r.id === "breakfast");
const tonight = RAILS.find((r) => r.id === "tonight");
ok(family && family.art === "family", "Family poster basename is unchanged");
ok(breakfast && breakfast.art === "breakfast", "Breakfast poster basename is unchanged");
ok(tonight && tonight.art === "tonight", "Tonight poster basename is unchanged");

console.log(`test-datenight-shortlist: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
