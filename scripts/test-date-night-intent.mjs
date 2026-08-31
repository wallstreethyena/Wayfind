#!/usr/bin/env node
// scripts/test-date-night-intent.mjs — Date Night is a QUALIFIED INTENT.
//
// Founder lock, 2026-08-29: the homepage Date Night poster must not open one
// generic list. It opens a journey that orchestrates existing categories.
// This file CALLS the composer. Source assertions that remain are scoped to
// a syntactic position and say so.
import { readFileSync, existsSync } from "node:fs";
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
  isDateMuseum,
  isDateShopping,
  isSpecialDateDinner, DATE_NIGHT_RAIL_DEFS } from "../lib/dateNightIntent.js";
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
const BURGER = p({
  id: "burger-1", name: "The Burger Bar", primaryType: "restaurant",
  types: ["restaurant", "food"], rating: 4.9, reviews: 2000, priceNum: 2, distMi: 3,
});
const SHELL_KEY = p({
  id: "shell-1", name: "Shell Key Clear Kayak Sunset & Glow Tours",
  primaryType: "tour_agency", types: ["tour_agency", "boat_tour", "tourist_attraction"],
  rating: 4.9, reviews: 711, distMi: 18,
});
const WINE = p({
  id: "wine-1", name: "Vintage Wine Room", primaryType: "wine_bar",
  types: ["wine_bar", "bar"],
});
const FAR = p({
  id: "far-1", name: "Distant Chophouse", primaryType: "steak_house",
  types: ["steak_house", "restaurant", "food"], priceNum: 3, distMi: 40,
});
const RESTAURANT_WITH_MUSIC_TAG = p({
  id: "music-leak", name: "Ocean Prime", primaryType: "seafood_restaurant",
  types: ["seafood_restaurant", "restaurant", "live_music_venue"],
});
const PRESERVE_WITH_MUSEUM_TAG = p({
  id: "museum-leak-1", name: "Weedon Island Preserve", primaryType: "nature_preserve",
  types: ["nature_preserve", "museum", "tourist_attraction"],
});
const THEME_PARK_WITH_MUSEUM_TAG = p({
  id: "museum-leak-2", name: "Hogwarts", primaryType: "theme_park",
  types: ["theme_park", "museum", "tourist_attraction"],
});
const BREAKFAST_DESSERT_LEAK = p({
  id: "dessert-leak", name: "First Watch", primaryType: "breakfast_restaurant",
  types: ["breakfast_restaurant", "dessert_shop", "restaurant"],
});
const ACTIVITY_SHOP_LEAK = p({
  id: "shopping-leak", name: "SURFIT USA Kayak Shop", primaryType: "sporting_goods_store",
  types: ["sporting_goods_store", "store", "kayak_rental"],
});

const FULL = [DINNER, DINNER_CASUAL, DINNER_PLAIN, DESSERT, SPEAKEASY, LIVE, CLUB, SPA, TOUR, BEACH, MUSEUM, FAST, WINE, FAR];
const GOOD = { weatherKnown: true, outdoorOK: true, beachShow: true };
const BAD = { weatherKnown: true, outdoorOK: false, beachShow: false };

// ── Membership, executed ────────────────────────────────────────────────────
ok(isDateDinner(DINNER) && isDateDinner(DINNER_CASUAL), "steakhouse / trattoria are date dinners");
ok(!isDateDinner(WINE), "a wine bar is a date room but not Dinner — Night Out / hide, not the dinner rail");
ok(!isDateDinner(FAST), "fast food is not a date dinner");
ok(!isDateDinner(SHAKE), "Shake Station is not a date-night dinner — the live Parrish #1");
ok(!isDateDinner(BURGER), "a highly-rated burger shop is not a date dinner, even at $$");
ok(!isDateDinner(DINNER_PLAIN), "a $ pizza is not special enough — hide Dinner rather than fill with a value spot");
ok(isDateRoomDinner(DINNER) && !isDateRoomDinner(SHAKE), "date-room is a RANK signal; Shake Station is neither dinner nor a room");
ok(isDateTour(TOUR) && !isDateTour(SHELL_KEY), "Sunset Cruise is a couples tour; Shell Key kayak/glow is generic outdoor rec");
ok(!isDateTogether(SHELL_KEY), "Shell Key is not Things To Do Together");
ok(isDateDessert(DESSERT) && !isDateDessert(DINNER), "dessert chip admits a creamery, not a steakhouse");
ok(isDateSpeakeasy(SPEAKEASY) && !isDateSpeakeasy(CLUB), "speakeasy is cocktail/speakeasy, not a dance club");
ok(isDateLiveMusic(LIVE) && !isDateLiveMusic(CLUB), "Live Music excludes night_club so Clubs can own that rail");
ok(isDateClub(CLUB) && !isDateClub(LIVE), "Clubs is night_club / dance_hall");
ok(isDateSpa(SPA) && isDateTour(TOUR) && isDateTogether(SPA) && isDateTogether(TOUR), "Spa and Tours both belong on Things To Do Together");
ok(isSpecialDateDinner(DINNER) && isSpecialDateDinner(DINNER_CASUAL), "price ≥ 2 is the existing 'special' dinner signal");
ok(!isDateLiveMusic(RESTAURANT_WITH_MUSIC_TAG), "a restaurant with a secondary music tag is not a factual Live Music venue");
ok(!isDateMuseum(PRESERVE_WITH_MUSEUM_TAG) && !isDateMuseum(THEME_PARK_WITH_MUSEUM_TAG),
  "nature preserves and theme parks cannot leak into Museum through secondary tags");
ok(!isDateDessert(BREAKFAST_DESSERT_LEAK), "a breakfast restaurant cannot leak into the Dessert stop");
ok(!isDateShopping(ACTIVITY_SHOP_LEAK), "an activity/rental shop is an errand, not a Date Night browse");

// ── Radius is the datenight RAIL pair; Worth the Drive stays 27 ─────────────
{
  const tb = readFileSync(join(ROOT, "lib/todaysBest.js"), "utf8");
  const drive = readFileSync(join(ROOT, "lib/railSelect.js"), "utf8");
  const nearLit = tb.match(/export const NEAR_RADIUS_MI = (\d+)/);
  const driveLit = drive.match(/export const DRIVE_REACH_MI = (\d+)/);
  ok(nearLit && Number(nearLit[1]) === DATE_NIGHT_NEAR_MI, `DATE_NIGHT_NEAR_MI (${DATE_NIGHT_NEAR_MI}) equals todaysBest NEAR_RADIUS_MI (${nearLit && nearLit[1]})`);
  ok(DATE_NIGHT_WIDEN_MI === 27, `Date Night reconciles to the owner-approved 27mi reach (got ${DATE_NIGHT_WIDEN_MI})`);
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
// v8.93 — Shopping joins the journey, LAST (owner, 2026-08-30: "we should
// replace it with shopping and the events"). Last is the claim being made: the
// browse is the optional beat, so it never displaces the table.
ok(DATE_NIGHT_RAIL_ORDER.join(",") === "dinner,dessert,speakeasies,livemusic,clubs,together,beach,museums,shopping",
  `canonical order is Dinner → Dessert → Speakeasies → Live Music → Clubs → Together → Beach|Museums → Shopping (got ${DATE_NIGHT_RAIL_ORDER.join(",")})`);
ok(DATE_NIGHT_RAIL_ORDER[DATE_NIGHT_RAIL_ORDER.length - 1] === "shopping",
  "…and Shopping is last, never ahead of the dinner it decorates");

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

const valueFood = composeDateNightRails([SHAKE, FAST, DINNER_PLAIN, BURGER], GOOD);
ok(!valueFood.rails.some((r) => r.id === "dinner"), "Dinner hides when the only meals are Shake Station / burgers / cheap pizza");
ok(!valueFood.rails.some((r) => r.places.some((x) => x.id === "shake-1" || x.id === "burger-1")),
  "Shake Station and burger shops appear on no Date Night rail");

const withDinner = composeDateNightRails([SHAKE, FAST, DINNER_PLAIN, DINNER_CASUAL], GOOD);
ok(withDinner.rails[0] && withDinner.rails[0].id === "dinner", "Dinner still leads when a special-enough sit-down exists");
ok(withDinner.rails[0].places.every((x) => x.id === "dinner-2"), "Dinner keeps the trattoria and drops Shake Station / pizza / McDonald's");

const kayakLead = composeDateNightRails([SHELL_KEY, SPA], GOOD);
ok(!kayakLead.rails.some((r) => r.places.some((x) => x.id === "shell-1")),
  "Shell Key kayak/glow never appears on Date Night — not even on Together");
ok(kayakLead.rails.some((r) => r.id === "together") && kayakLead.rails.find((r) => r.id === "together").places.every((x) => x.id === "spa-1"),
  "Together keeps the spa and hides the generic kayak tour");

// Dinner ranks special-enough rooms first (existing signal, not a paid boost)
const dinnerRail = good.rails.find((r) => r.id === "dinner");
ok(dinnerRail && dinnerRail.places.some((x) => x.id === "dinner-1") && dinnerRail.places.some((x) => x.id === "dinner-2"),
  "Dinner keeps the steakhouse and the $$ trattoria");
ok(!dinnerRail.places.some((x) => x.id === "dinner-3"), "cheap pizza does not pad Dinner");
{
  const higherScorePlainRoom = p({ ...DINNER_CASUAL, id: "score-first", name: "Sofra Kitchen", rating: 4.9, reviews: 5000 });
  const lowerScoreNamedRoom = p({ ...DINNER, id: "room-second", name: "Waterfront Steak House", rating: 4.5, reviews: 300 });
  const ranked = composeDateNightRails([lowerScoreNamedRoom, higherScorePlainRoom], GOOD).rails.find((r) => r.id === "dinner");
  ok(ranked && ranked.places[0].id === "score-first", "Dinner is displayed-score first; room character only breaks score ties");
}

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
  const rails = stripComments(readFileSync(join(ROOT, "app/components/DateNightRails.js"), "utf8"));
  // v8.92 — FOLLOWED THE CODE. The rails moved out of the page into
  // <DateNightRails> so the DROP and the PAGE render one definition; the page
  // keeps the shell. Both assertions are unchanged in meaning and are now made
  // against the file that actually draws a card.
  // v8.93 — FOLLOWED THE CODE, on the owner's instruction (2026-08-30, with a
  // screenshot of the open drop): "the size of the cards is also wrong … since
  // we will be displaying multiple rails we need to use the style from
  // Exploding Trends Near You, I want the place card style to be like that."
  // The invariant this line has always protected is "no NEW card chrome" — a
  // shared card, never a bespoke one. That still holds; the shared card is now
  // RailCard, in the same `.wf-rail` + RailNav + RailDots structure
  // ExplodingNearby builds, so the sizing is inherited rather than guessed.
  ok(/<RailCard[\s/>]/.test(rails), "the intent rails use the existing RailCard — no new card chrome");
  ok(/className="wf-rail wf-rail-exploding"/.test(rails),
    "…inside the Exploding Trends rail container, so card width and the peek come from the design system, not an inline 300px guess");
  ok(/<RailNav[\s/>]/.test(rails) && /<RailDots[\s/>]/.test(rails),
    "…with the same there-is-more affordances that rail ships");
  // v8.93.1 — AND EVERY RAIL STILL SAYS WHAT IT IS. The first pass at the
  // Exploding Trends structure dropped the <h2> along with the old markup, and
  // the owner's screenshot showed a Dinner rail with no word "Dinner" on it.
  // RailNav's line is a COUNT, not a heading — "18 places for clubs" tells the
  // reader how many and never what.
  ok(/<h2[^>]*>\{rail\.title\}<\/h2>/.test(rails),
    "every Date Night rail renders its own title — RailNav's count line is not a heading");
  // v8.93.1 — AND EVERY RAIL EXPLAINS ITSELF. Owner, 2026-08-30: "on Exploding
  // Trends you have an explanation of what the rail is … Date Night does not.
  // I would like that everywhere multiple rails are showing." The deck is the
  // PROMISE, so the rules are asserted, not just its presence: every rail has
  // one, none repeats its own title, none states a number (RailNav owns the
  // count, and a number the rail cannot keep is the "20 trends" claim this
  // release deleted), and each fits one line at 390px.
  ok(/\{rail\.deck \? \(/.test(rails) && /\{rail\.deck\}<\/p>/.test(rails),
    "the rails render the deck when there is one, and nothing when there is not");
  ok(rails.indexOf("{rail.deck}") > rails.indexOf("{rail.title}") && rails.indexOf("{rail.deck}") < rails.indexOf("<RailNav"),
    "…between the title and the count line, which is where Exploding Trends puts its dek");
  for (const def of DATE_NIGHT_RAIL_DEFS) {
    ok(typeof def.deck === "string" && def.deck.length > 20,
      `${def.id}: has a deck that says what the rail is for`);
    ok(def.deck.length <= 78, `${def.id}: deck fits one line at 390px (${def.deck.length} chars)`);
    ok(!new RegExp("\\b" + def.title.split(" ")[0] + "\\b", "i").test(def.deck),
      `${def.id}: the deck does not just repeat its own title`);
    ok(!/\d/.test(def.deck), `${def.id}: the deck states no number — RailNav owns the count`);
  }
  ok(rails.indexOf("{rail.title}</h2>") < rails.indexOf("<RailNav"),
    "…above the count line, not below it");
  ok(!/<IconicPlaceCard[\s/>]/.test(rails),
    "…and the old card is gone rather than left beside it — two card styles in one drop is the drift this file exists to stop");
  ok(/<RankedExperiencePage[\s/>]/.test(src), "the intent page keeps the existing RankedExperiencePage shell");
  ok(/toHookLine\(/.test(rails), "editorial lines go through toHookLine — empty stays empty");
  ok(/<DateNightRails[\s/>]/.test(src), "…and the page RENDERS those shared rails rather than a second copy of them");
  // ONE definition. Two copies of "what is a date night" is how that claim came
  // to have three different rules in v8.82.
  {
    const drop = stripComments(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
    const declarations = [src, drop].filter((f) => /function DateNightRails|const DateNightRails = \(/.test(f)).length;
    ok(declarations === 0, "neither the page nor the rail re-declares the rails — they import the one component");
    ok(/<RailCard[\s/>]/.test(rails), "positive control: the shared component really is the one drawing cards");
  }
  ok(!/places\.googleapis|searchText|placeDetails/.test(src), "the client does not call Google Places");
  ok(!/room for it tonight/.test(src) && !/clears this bar/.test(src),
    "the intent page never uses the empty-rail 'room for it tonight' copy");
}
{
  const raw = readFileSync(join(ROOT, "app/api/date-night/route.js"), "utf8");
  const src = stripComments(raw);
  ok(/serveFromInventory\(/.test(src), "the API reads owned inventory");
  ok(/dateNightBeachOk|composeDateNightRails/.test(src), "the API composes through dateNightIntent");
  ok(!/places\.googleapis|searchText|placeDetails/.test(src), "the API does not call Google Places");
  ok(/weatherKnown/.test(src) && /beachShow/.test(src), "the API feeds the fail-closed beach gate");
  const invAll = src.match(/await Promise\.all\(\[[\s\S]*?serveFromInventory\("attractions", lat, lng, radiusM, n, "beaches"\),[\s\S]*?\]\)/);
  ok(!!invAll, "inventory Promise.all is a readable block (positive control)");
  ok(invAll && !/fetchWeather|getBeachConditions/.test(invAll[0]),
    "weather / beach-condition fetches are NOT awaited with inventory — Dinner must not wait on weather");
  ok(/Promise\.race\(\[wxReady/.test(src), "weather is raced; unknown weather fails closed to Museums");
  const rels = [...raw.matchAll(/from\s+["']((?:\.\.\/)+lib\/[^"']+)["']/g)].map((m) => m[1]);
  ok(rels.length >= 5, `date-night route imports lib via ../../../lib (got ${rels.length})`);
  ok(rels.every((r) => r.startsWith("../../../lib/")),
    "every lib import is three levels up (app/api/date-night → repo root), not four");
  ok(!/from\s+["']\.\.\/\.\.\/\.\.\/\.\.\/lib\//.test(raw),
    "date-night route does not use ../../../../lib — that resolved outside the repo and broke next build");
  const routeDir = join(ROOT, "app/api/date-night");
  for (const rel of rels) {
    ok(existsSync(join(routeDir, rel)), `import ${rel} resolves from app/api/date-night`);
  }
}
{
  const src = stripComments(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
  const click = src.match(/const tileClick = \(e, id\) => \{[\s\S]*?\n  \};/);
  ok(!!click, "DaypartRail tileClick is a function we can read (positive control)");
  const body = click ? click[0] : "";
  // ── v8.92 — SIX ASSERTIONS FLIPPED, DELIBERATELY, WITH THE OWNER'S WORDS ──
  //
  // Owner, 2026-08-30, on the live homepage: "the date night card should just
  // open, but now it's opening on a different page. I don't know why it did
  // that. I want it to go back and do the same as before … when the user clicks
  // on it, it should look exactly like the Exploding Trends and have individual
  // rails."
  //
  // These six encoded #1033's SECOND fix, not its first. The first fix was
  // real and is kept in full: lib/dateNightIntent.js killed the Parrish "nothing
  // nearby has the room" empty bar and Shake Station leading FOOD. Navigating
  // away was then layered on top to avoid a drop that the first fix had already
  // repaired — and it cost the interaction the owner designed.
  //
  // So the tap comes home and the rails come with it. What is asserted now is
  // the thing that actually has to hold: the drop MOUNTS the same intent engine
  // the page does. That is a stronger claim than "it navigates" ever was —
  // navigation could be true with an empty page behind it.
  ok(!/if \(id === "datenight"\) \{/.test(body),
    "tileClick has NO navigate-away branch for datenight — it falls through to the same preventDefault + open() every other tile uses");
  ok(!/goDateNightIntent/.test(src),
    "goDateNightIntent is gone entirely — its only two callers were the removed navigations, and a helper computed for nobody is the defect check-events-rail-renders exists for");
  ok(/selRail && selRail\.id === "datenight" \? \(/.test(src) && /<DateNightRails/.test(src),
    "the DROP mounts <DateNightRails> — the same intent engine the page renders, in the position <ExplodingNearby> holds for trending");
  ok(/const DateNightRails = dynamic\(\(\) => import\("\.\/DateNightRails"\), \{ ssr: false \}\)/.test(src),
    "…lazily, on the same contract as ExplodingNearby, so a closed drop costs the homepage nothing");
  ok(!/initialRail === "datenight"/.test(src),
    "a shared ?rail=datenight link opens the DROP, like every other shared rail card");
  ok(!/selected && selected !== "datenight"/.test(src),
    "the drop's selRail binds to datenight again — the pool fix is what keeps it honest, not a locked door");
  ok(/\{href\s*\?\s*<a className="wf8-tlink"/.test(src),
    "PROBE: the tile link ternary is still `{href ? <a className=\"wf8-tlink\"` (check-daypart-art-ready)");
  const tileA = src.match(/\{href\s*\?\s*<a className="wf8-tlink"[^>]*>/);
  ok(!!tileA, "the tile <a> opening tag is a readable JSX expression (positive control)");
  ok(tileA && /data-wf-date-night-intent=\{id === "datenight" \? "1" : undefined\}/.test(tileA[0]),
    "datenight tile is marked data-wf-date-night-intent");
  ok(tileA && /onClick=\{function \(e\) \{ tileClick\(e, id\); \}\}/.test(tileA[0]),
    "the datenight <a> calls tileClick like every other tile — an onClick of undefined is what stopped the drop binding (v8.92)");
  // …and the href SURVIVES, which is the half that was always right: cmd-click,
  // middle-click, a crawler and a pasted link all still reach the real page.
  ok(tileA && /href=\{href\}/.test(tileA[0]),
    "the tile is still a real <a href> to the intent page — only the plain left click came back to the drop");
  ok(/id === "datenight"[\s\S]{0,180}dateNightIntentHref\(/.test(src),
    "datenight tile href is dateNightIntentHref (the intent URL, not a drop)");
  // The OPEN tile has to look open. #1033 suppressed .is-sel on datenight for
  // the same reason it suppressed selRail — the tile was never meant to stay.
  // Now it stays, and a selected card with no selection state is the v8.22
  // half-cropped-card complaint wearing a different hat (the centering effect
  // below finds the open tile by `.wf8-tile.is-sel`, so without it the drop
  // also stops scrolling itself into view).
  ok(/wf8-tile\$\{selected === id \? " is-sel" : ""\}/.test(src),
    "the open datenight tile wears .is-sel like every other tile — the centering effect queries for it");
  // A rail that brings its own skeleton, its own empty and its own failure copy
  // must not ALSO get the shared pool's. Date Night's drop ending in "nothing
  // near you clears this bar" underneath six full rails is the v8.82 empty-bar
  // screenshot arriving by a different road.
  ok(/const railOwnsItsOwnAnswer = !!\(selRail && \(selRail\.id === "datenight" \|\| selRail\.id === "events"\)\)/.test(src),
    "the drop knows which rails answer for themselves");
  const branches = src.match(/\) : selRail && [^?]*\?/g) || [];
  ok(branches.length === 4, `the pool ternary chain is readable (positive control: ${branches.length} branches after the cards)`);
  // The CARDS branch stays open to Date Night on purpose: the pool below the
  // rails is what trending does too (ExplodingNearby above, ranked rooms
  // below), and it is the shelf the owner asked to come back. Only the three
  // branches that SPEAK FOR AN EMPTY POOL are closed.
  const speaksForEmpty = branches.filter((b) => !/dropList\.length/.test(b));
  ok(speaksForEmpty.length === 3, `three fallback branches speak for an empty pool (got ${speaksForEmpty.length})`);
  ok(speaksForEmpty.every((b) => /railOwnsItsOwnAnswer/.test(b)),
    "EVERY pool fallback branch (pending skeleton, thin copy, honest terminal) is skipped for a rail that owns its own answer");
  // v8.93 — THIS ASSERTION IS INVERTED, and the owner's screenshot is the
  // reason. v8.92 kept the pool under Date Night by analogy with trending. The
  // pool is the generic FOOD rail for the reader's location, so under a
  // qualified date-night journey it served C & K Smokehouse BBQ: ranked
  // correctly, and nobody's date night. Trending's pool works because "the
  // best places near you, period" is a true caption for it; there is no true
  // caption for a BBQ joint under "Date Night". Owner, 2026-08-30: "the date
  // night card still has the old rail … we should replace it with shopping and
  // the events" — and both of those now exist as things that qualify.
  ok(branches.every((b) => /railOwnsItsOwnAnswer/.test(b)),
    "the pool does not speak for Date Night AT ALL — not its cards, not its empty copy");
  ok(/selRail && selRail\.id === "datenight" && eventsSlot/.test(src),
    "…and the dated events ride under the journey, from the SAME eventsSlot thunk the events tile renders");
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
console.log(`test-date-night-intent: OK — ${pass} assertions (composer executed; Beach XOR Museums; hide-empty; Dinner first; Clubs last nightlife; Spa+Tours share together; the homepage tap OPENS THE DROP and the drop mounts the same rails)`);
