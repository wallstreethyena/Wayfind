#!/usr/bin/env node
// scripts/test-date-night-intent.mjs — Date Night is a QUALIFIED INTENT.
//
// Founder lock, 2026-08-29: the homepage Date Night poster must not open one
// generic list. It opens a journey that orchestrates existing categories.
// This file CALLS the composer. Source assertions that remain are scoped to
// a syntactic position and say so.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATE_NIGHT_NEAR_MI,
  DATE_NIGHT_WIDEN_MI,
  DATE_NIGHT_RAIL_ORDER,
  composeDateNightRails,
  dateNightBeachOk,
  isDateDinner,
  isDateRoomDinner,
  isDateDessert,
  isDateSpeakeasy,
  isDateLiveMusic,
  isDateClub,
  isDateTogether,
  isDateSpa,
  isDateTour,
  isSpecialDateDinner,
} from "../lib/dateNightIntent.js";
import { dateNightIntentHref, orderFor } from "../lib/dayparts.js";
import { RAIL_IDS } from "../lib/rails.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const p = (row) => ({ rating: 4.6, reviews: 400, distMi: 4, types: [], ...row });

const DINNER = p({
  id: "dinner-1", name: "Bern's Steak House", primaryType: "steak_house",
  types: ["steak_house", "restaurant", "food"], rating: 4.7, reviews: 8000, priceNum: 3,
});
const DINNER_CASUAL = p({
  id: "dinner-2", name: "Sofra Kitchen Bar & Bistro", primaryType: "italian_restaurant",
  types: ["italian_restaurant", "restaurant", "food"], rating: 4.8, reviews: 1200, priceNum: 2,
});
const DINNER_PLAIN = p({
  id: "dinner-3", name: "Tony's Pizza", primaryType: "pizza_restaurant",
  types: ["pizza_restaurant", "restaurant", "food"], rating: 4.9, reviews: 9000, priceNum: 1,
});
const DESSERT = p({
  id: "dessert-1", name: "American Honey Creamery", primaryType: "ice_cream_shop",
  types: ["ice_cream_shop", "dessert_shop", "food"],
});
const SPEAKEASY = p({
  id: "speak-1", name: "Bahi Hut Tiki Cocktail Lounge", primaryType: "cocktail_bar",
  types: ["cocktail_bar", "speakeasy", "bar"],
});
const LIVE = p({
  id: "live-1", name: "Skipper's Smokehouse", primaryType: "live_music_venue",
  types: ["live_music_venue", "concert_hall", "music_venue"],
});
const CLUB = p({
  id: "club-1", name: "Prana Nightclub", primaryType: "night_club",
  types: ["night_club", "dance_hall", "disco"],
});
const SPA = p({
  id: "spa-1", name: "The Spa at The Epicurean", primaryType: "spa",
  types: ["spa", "wellness"],
});
const TOUR = p({
  id: "tour-1", name: "Tampa Bay Sunset Cruise", primaryType: "boat_tour",
  types: ["boat_tour", "tour_agency", "tour"],
});
const BEACH = p({
  id: "beach-1", name: "Pass-a-Grille Beach", primaryType: "beach",
  types: ["beach", "natural_feature"],
});
const MUSEUM = p({
  id: "museum-1", name: "The Dalí Museum", primaryType: "museum",
  types: ["museum", "art_gallery"],
});
const FAST = p({
  id: "fast-1", name: "McDonald's", primaryType: "fast_food_restaurant",
  types: ["fast_food_restaurant", "restaurant", "food"], rating: 4.1, reviews: 9000, distMi: 1,
});
const SHAKE = p({
  id: "shake-1", name: "Shake Station", primaryType: "hamburger_restaurant",
  types: ["hamburger_restaurant", "restaurant", "food"], rating: 4.6, reviews: 800, distMi: 9.6,
});
const WINE = p({
  id: "wine-1", name: "Vintage Wine Room", primaryType: "wine_bar",
  types: ["wine_bar", "bar"],
});
const FAR = p({
  id: "far-1", name: "Distant Chophouse", primaryType: "steak_house",
  types: ["steak_house", "restaurant", "food"], priceNum: 3, distMi: 40,
});

const FULL = [DINNER, DINNER_CASUAL, DINNER_PLAIN, DESSERT, SPEAKEASY, LIVE, CLUB, SPA, TOUR, BEACH, MUSEUM, FAST, WINE, FAR];
const GOOD = { weatherKnown: true, outdoorOK: true, beachShow: true };
const BAD = { weatherKnown: true, outdoorOK: false, beachShow: false };

// ── Membership, executed ────────────────────────────────────────────────────
ok(isDateDinner(DINNER) && isDateDinner(DINNER_CASUAL), "steakhouse / trattoria are date dinners");
ok(!isDateDinner(WINE), "a wine bar is a date room but not Dinner — Night Out / hide, not the dinner rail");
ok(!isDateDinner(FAST), "fast food is not a date dinner");
ok(!isDateDinner(SHAKE), "Shake Station is not a date-night dinner — the live Parrish #1");
ok(isDateDinner(DINNER_PLAIN), "a sit-down pizza still qualifies as Dinner so Parrish cannot go empty when date-rooms are thin");
ok(isDateRoomDinner(DINNER) && !isDateRoomDinner(SHAKE), "date-room is a RANK signal, not the only admit");
ok(isDateDessert(DESSERT) && !isDateDessert(DINNER), "dessert chip admits a creamery, not a steakhouse");
ok(isDateSpeakeasy(SPEAKEASY) && !isDateSpeakeasy(CLUB), "speakeasy is cocktail/speakeasy, not a dance club");
ok(isDateLiveMusic(LIVE) && !isDateLiveMusic(CLUB), "Live Music excludes night_club so Clubs can own that rail");
ok(isDateClub(CLUB) && !isDateClub(LIVE), "Clubs is night_club / dance_hall");
ok(isDateSpa(SPA) && isDateTour(TOUR) && isDateTogether(SPA) && isDateTogether(TOUR), "Spa and Tours both belong on Things To Do Together");
ok(isSpecialDateDinner(DINNER) && isSpecialDateDinner(DINNER_CASUAL), "price ≥ 2 is the existing 'special' dinner signal");

// ── Radius is the datenight RAIL pair; Worth the Drive stays 27 ─────────────
{
  const tb = readFileSync(join(ROOT, "lib/todaysBest.js"), "utf8");
  const drive = readFileSync(join(ROOT, "lib/railSelect.js"), "utf8");
  const nearLit = tb.match(/export const NEAR_RADIUS_MI = (\d+)/);
  const widenLit = tb.match(/export const WIDEN_RADIUS_MI = (\d+)/);
  const driveLit = drive.match(/export const DRIVE_REACH_MI = (\d+)/);
  ok(nearLit && Number(nearLit[1]) === DATE_NIGHT_NEAR_MI, `DATE_NIGHT_NEAR_MI (${DATE_NIGHT_NEAR_MI}) equals todaysBest NEAR_RADIUS_MI (${nearLit && nearLit[1]})`);
  ok(widenLit && Number(widenLit[1]) === DATE_NIGHT_WIDEN_MI, `DATE_NIGHT_WIDEN_MI (${DATE_NIGHT_WIDEN_MI}) equals todaysBest WIDEN_RADIUS_MI (${widenLit && widenLit[1]})`);
  ok(driveLit && Number(driveLit[1]) === 27, `DRIVE_REACH_MI stays 27 (got ${driveLit && driveLit[1]}) — Date Night must not touch Worth the Drive`);
}
ok(!/DRIVE_REACH_MI/.test(stripComments(readFileSync(join(ROOT, "lib/dateNightIntent.js"), "utf8"))),
  "dateNightIntent never names DRIVE_REACH_MI in code (comment mention is the isolation note)");

// ── Beach gate fails CLOSED ─────────────────────────────────────────────────
ok(dateNightBeachOk(GOOD) === true, "known + outdoorOK + beachShow → Beach");
ok(dateNightBeachOk({}) === false, "empty signals → Museums (fail closed)");
ok(dateNightBeachOk({ weatherKnown: true, outdoorOK: true }) === false, "missing beachShow → Museums");
ok(dateNightBeachOk({ weatherKnown: false, outdoorOK: true, beachShow: true }) === false, "unknown weather → Museums");
ok(dateNightBeachOk({ weatherKnown: true, outdoorOK: false, beachShow: true }) === false, "outdoorOK false → Museums");
ok(dateNightBeachOk(BAD) === false, "bad weather → Museums");

// ── Compose: order, Dinner first, Clubs last nightlife, Spa+Tours share ─────
const good = composeDateNightRails(FULL, GOOD);
ok(good.beachOk === true, "good signals set beachOk");
ok(good.rails[0] && good.rails[0].id === "dinner", "Dinner is the first rail when inventory exists");
ok(good.rails.map((r) => r.id).join(",") === "dinner,dessert,speakeasies,livemusic,clubs,together,beach",
  `good-weather rail order (got ${good.rails.map((r) => r.id).join(",")})`);
ok(DATE_NIGHT_RAIL_ORDER.join(",") === "dinner,dessert,speakeasies,livemusic,clubs,together,beach,museums",
  "canonical order is Dinner → Dessert → Speakeasies → Live Music → Clubs → Together → Beach|Museums");

const nightIds = good.rails.filter((r) => r.group === "nightlife").map((r) => r.id);
ok(nightIds[0] === "speakeasies" && nightIds[nightIds.length - 1] === "clubs",
  "Clubs is last among nightlife rails");
ok(nightIds.join(",") === "speakeasies,livemusic,clubs", "Night Out is three rails, not one mixed list");

const together = good.rails.find((r) => r.id === "together");
ok(together && together.places.some((x) => x.id === "spa-1") && together.places.some((x) => x.id === "tour-1"),
  "Spa & Wellness + Tours share the Things To Do Together rail");
ok(!good.rails.some((r) => r.id === "spa" || r.id === "tours"), "Spa and Tours are not their own rails");

ok(good.rails.some((r) => r.id === "beach") && !good.rails.some((r) => r.id === "museums"),
  "good weather: Beach shown, Museums hidden");
ok(good.hidden.includes("museums") && !good.hidden.includes("beach"), "XOR hidden list matches Beach-on");

const bad = composeDateNightRails(FULL, BAD);
ok(bad.beachOk === false, "bad signals clear beachOk");
ok(bad.rails.some((r) => r.id === "museums") && !bad.rails.some((r) => r.id === "beach"),
  "bad weather: Museums replace Beach — never both");
ok(bad.hidden.includes("beach") && !bad.hidden.includes("museums"), "XOR hidden list matches Museums-on");

const unknown = composeDateNightRails(FULL, {});
ok(unknown.beachOk === false && unknown.rails.some((r) => r.id === "museums") && !unknown.rails.some((r) => r.id === "beach"),
  "unknown weather fails closed to Museums");

// ── Hide empty rather than fill with off-intent ─────────────────────────────
const thin = composeDateNightRails([DINNER, FAST, WINE, FAR], GOOD);
ok(thin.rails.length === 1 && thin.rails[0].id === "dinner", "only Dinner survives when the rest of the journey has no honest inventory");
ok(thin.hidden.includes("dessert") && thin.hidden.includes("clubs") && thin.hidden.includes("together"),
  "empty dessert / clubs / together are hidden, not padded");
ok(!thin.rails[0].places.some((x) => x.id === "fast-1" || x.id === "wine-1" || x.id === "far-1"),
  "fast food, wine bars, and places past the Date Night radius do not fill Dinner");
ok(thin.rails[0].places.map((x) => x.id).join(",") === "dinner-1", "Dinner keeps the date room only");

const noDinner = composeDateNightRails([DESSERT, CLUB], GOOD);
ok(noDinner.rails[0] && noDinner.rails[0].id === "dessert", "when Dinner is empty it is hidden, not filled");
ok(noDinner.hidden.includes("dinner"), "empty Dinner is in hidden[]");

// Exclusive assignment: one place, one rail
const ids = good.rails.flatMap((r) => r.places.map((x) => x.id));
ok(new Set(ids).size === ids.length, "a place is assigned to exactly one rail");
ok(!ids.includes("fast-1") && !ids.includes("wine-1") && !ids.includes("far-1"),
  "off-intent / out-of-radius rows never appear");

const valueFood = composeDateNightRails([SHAKE, FAST, DINNER_PLAIN], GOOD);
ok(valueFood.rails[0] && valueFood.rails[0].id === "dinner", "Dinner still exists when the pool is mostly value food");
ok(valueFood.rails[0].places.every((x) => x.id === "dinner-3"), "Dinner keeps the sit-down meal and drops Shake Station / McDonald's");
ok(!valueFood.rails.some((r) => r.places.some((x) => x.id === "shake-1")), "Shake Station appears on no Date Night rail");
ok(valueFood.rails.some((r) => r.id === "dinner") && valueFood.rails[0].places.length >= 1,
  "an empty isDateRoom gate must not replace the whole page — Dinner from inventory still renders");

// Dinner ranks special-enough rooms first (existing signal, not a paid boost)
const dinnerRail = good.rails.find((r) => r.id === "dinner");
ok(dinnerRail && dinnerRail.places.some((x) => x.id === "dinner-3"), "a highly rated pizza still competes on Dinner");
ok(dinnerRail.places.findIndex((x) => x.id === "dinner-1") < dinnerRail.places.findIndex((x) => x.id === "dinner-3"),
  "special date-room signal (price ≥ 2) ranks ahead of a higher-scored ordinary restaurant — not a paid boost");

// ── Entry: homepage tap navigates; /date-night is the intent page ───────────
const href = dateNightIntentHref({ href: "/date-night", cityLabel: "Tampa", lat: 27.95, lng: -82.46 });
ok(href.startsWith("/date-night?"), `dateNightIntentHref stays on /date-night (got ${href})`);
ok(/[?&]city=Tampa/.test(href) && /[?&]lat=27\.95/.test(href), "city and coordinates ride along");
ok(dateNightIntentHref({}) === "/date-night", "no city is not invented");

const nightOrder = orderFor("night", RAIL_IDS);
const afternoonOrder = orderFor("afternoon", RAIL_IDS);
ok(nightOrder[0] !== "datenight", `Date Night is not the leading night carousel card (lead is ${nightOrder[0]})`);
ok(afternoonOrder[0] !== "datenight", "Date Night is not the leading afternoon carousel card");
ok(nightOrder.includes("datenight"), "Date Night still exists in the night order — it just does not lead");

// Source: /date-night renders the intent page (syntactic position)
{
  const src = stripComments(readFileSync(join(ROOT, "app/date-night/client.js"), "utf8"));
  ok(/<DateNightIntentPage[\s/>]/.test(src), "app/date-night/client.js RENDERS <DateNightIntentPage (weaker: source position)");
  ok(!/<IntentPageClient[\s/>]/.test(src), "app/date-night/client.js no longer mounts <IntentPageClient — that was the generic list");
}
{
  const src = stripComments(readFileSync(join(ROOT, "app/components/DateNightIntentPage.js"), "utf8"));
  ok(/<IconicPlaceCard[\s/>]/.test(src), "the intent page uses the existing IconicPlaceCard (no new card chrome)");
  ok(/<RankedExperiencePage[\s/>]/.test(src), "the intent page keeps the existing RankedExperiencePage shell");
  ok(/toHookLine\(/.test(src), "editorial lines go through toHookLine — empty stays empty");
  ok(!/places\.googleapis|searchText|placeDetails/.test(src), "the client does not call Google Places");
  ok(!/room for it tonight/.test(src) && !/clears this bar/.test(src),
    "the intent page never uses the empty-rail 'room for it tonight' copy");
}
{
  const src = stripComments(readFileSync(join(ROOT, "app/api/date-night/route.js"), "utf8"));
  ok(/serveFromInventory\(/.test(src), "the API reads owned inventory");
  ok(/dateNightBeachOk|composeDateNightRails/.test(src), "the API composes through dateNightIntent");
  ok(!/places\.googleapis|searchText|placeDetails/.test(src), "the API does not call Google Places");
  ok(/weatherKnown/.test(src) && /beachShow/.test(src), "the API feeds the fail-closed beach gate");
  const invAll = src.match(/await Promise\.all\(\[[\s\S]*?serveFromInventory\("attractions", lat, lng, radiusM, n, "beaches"\),[\s\S]*?\]\)/);
  ok(!!invAll, "inventory Promise.all is a readable block (positive control)");
  ok(invAll && !/fetchWeather|getBeachConditions/.test(invAll[0]),
    "weather / beach-condition fetches are NOT awaited with inventory — Dinner must not wait on weather");
  ok(/Promise\.race\(\[wxReady/.test(src), "weather is raced; unknown weather fails closed to Museums");
}
{
  const src = stripComments(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
  const click = src.match(/const tileClick = \(e, id\) => \{[\s\S]*?\n  \};/);
  ok(!!click, "DaypartRail tileClick is a function we can read (positive control)");
  const body = click ? click[0] : "";
  ok(body.indexOf('id === "datenight"') < body.indexOf("preventDefault"),
    "datenight is handled BEFORE the generic preventDefault that opens the drop");
  const dn = body.match(/if \(id === "datenight"\) \{[\s\S]*?\n    \}/);
  ok(!!dn, "tileClick has an explicit id === \"datenight\" branch (weaker: source position)");
  ok(dn && /goDateNightIntent\(/.test(dn[0]), "datenight tap navigates via goDateNightIntent");
  ok(dn && !/\bopen\(/.test(dn[0]), "datenight tap does not open the in-rail drop");
  ok(/const goDateNightIntent = useCallback/.test(src) && /location\.assign\(dest\)/.test(src),
    "goDateNightIntent assigns /date-night (the journey), not a list");
  ok(/initialRail === "datenight"/.test(src), "a shared ?rail=datenight link also navigates — it does not open the drop");
  ok(/selected && selected !== "datenight"/.test(src),
    "the drop's selRail never binds to datenight — no empty-bar copy, no Shake Station FOOD rail");
}

// Poster art is not this PR
{
  const intent = readFileSync(join(ROOT, "lib/intentPages.js"), "utf8");
  ok(/art: "\/cards\/date-night-owner\.png"/.test(intent), "date-night landing art stays the owner poster — this PR does not encode rail images");
}

if (fail) {
  console.log(`test-date-night-intent: ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`test-date-night-intent: OK — ${pass} assertions (composer executed; Beach XOR Museums; hide-empty; Dinner first; Clubs last nightlife; Spa+Tours share together; homepage tap navigates)`);
