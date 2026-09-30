#!/usr/bin/env node
// check-event-outing — the guard for lib/eventOuting.js, the before/after
// outing engine (owner, 2026-09-22): "every event page recommends places for
// BEFORE and AFTER that event based on what people actually do, never a
// generic top-rated list." Research sources and the archetype/slot table are
// written up in docs/proposals/events-outing-intelligence.md; this file is
// what proves the code actually does what that document claims.
//
// Two kinds of check:
//   1. SOURCE checks — the wiring can't quietly regress to a bare
//      governed-score sort, or route around the cache boundary, or leave a
//      surface passing the fields classifyEvent needs.
//   2. EXECUTED fixtures — classifyEvent + fillOutingSlots run for real
//      against a realistic downtown inventory (no network, no Supabase —
//      this module is pure). Every archetype-specific assertion is proven
//      by RUNNING the real functions, never by reading the SLOT_TABLE source.
//
// Hermetic: no ambient env is read. The two source-checked files each read
// their own real bytes from disk; nothing here talks to a network or a DB.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyEvent,
  fillOutingSlots,
  outingCopy,
  outingCacheKey,
  SLOT_TABLE,
  AVOID,
  OUTING_ARCHETYPES,
  OUTING_MIN_SCORE,
} from "../lib/eventOuting.js";
import { photoWorthy, PHOTO_WORTHY_COPY } from "../lib/photoWorthy.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ─────────────────────────────────────────────────────────── source checks

{
  const src = read("lib/eventPairings.js");
  ok(/const\s+outing\s*=\s*fillOutingSlots\(/.test(src), "eventPairings.js's final picks come from fillOutingSlots");
  ok(!/merged\s*\.\s*sort\s*\(/.test(src), "eventPairings.js no longer sorts the merged pool by a bare governed_score comparator");
  ok(!/return\s+merged\s*\.\s*slice\(/.test(src), "eventPairings.js no longer slices the merged pool directly — fillOutingSlots owns the final order");
  ok(/\(event\s*&&\s*event\.outing\)\s*\|\|\s*classifyEvent\(event\)/.test(src), "eventPairings.js classifies the event when it was not pre-classified, and trusts a pre-computed classification when it was");
}

{
  const floridaEvents = read("app/florida-events/[slug]/page.js");
  const guides = read("app/guides/[slug]/page.js");
  for (const [name, src] of [["app/florida-events/[slug]/page.js", floridaEvents], ["app/guides/[slug]/page.js", guides]]) {
    ok(/import\s*\{[^}]*\bcachedEventPairings\b[^}]*\}\s*from\s*["'][^"']*eventPairingsCache/.test(src), `${name} imports cachedEventPairings from the cache module`);
    ok(/await\s+cachedEventPairings\(/.test(src), `${name} fetches pairings through cachedEventPairings, not eventPairings directly`);
    ok(!/import\s*\{[^}]*\beventPairings\b[^}]*\}\s*from\s*["'][^"']*["']\s*;/.test(src.replace(/\bcachedEventPairings\b/g, "")), `${name} does not also import the uncached eventPairings entrypoint`);
  }
}

{
  const livePage = read("app/events/[city]/[slug]/page.js");
  const callMatch = /eventPairings\(\{[\s\S]{0,400}?\}, \{\}\)/.exec(livePage);
  ok(!!callMatch, "the live event page's eventPairings call is where expected");
  const callSrc = callMatch ? callMatch[0] : "";
  for (const needle of ["name: e.name", "date: e.date", "time: e.time", "segment: e.segment", "genre: e.genre"]) {
    ok(callSrc.includes(needle), `the live event page's eventPairings call passes "${needle}" so the outing engine can classify it`);
  }
}

{
  const grepDirs = ["app"];
  const { execSync } = await import("node:child_process");
  let hits = "";
  try {
    hits = execSync(`grep -rl "buildNearbyPool" ${grepDirs.join(" ")} --include=*.js 2>/dev/null || true`, { cwd: ROOT, encoding: "utf8" });
  } catch { hits = ""; }
  const offenders = hits.split("\n").map((l) => l.trim()).filter(Boolean);
  ok(offenders.length === 0, `no app/ file imports buildNearbyPool directly for event pairings (event surfaces must go through lib/eventPairings.js) — offenders: ${offenders.join(", ") || "none"}`);
}

// ─────────────────────────────────────────────────────── executed fixtures

// A realistic downtown mix: real restaurant identities, the full bar/drinks
// spread, sweet/cafe options, and every AVOID type the module must reject
// (tour_agency carries the highest score of anything in the set — 4.95
// stars — specifically so a bug that let it through would be OBVIOUS, not
// buried under a low-scoring decoy).
let seq = 0;
const row = (name, primaryType, distMi, governedScore, types) => {
  seq += 1;
  return { id: `dt-${seq}-${primaryType}`, name, primaryType, types: types || [primaryType], governed_score: governedScore, distMi };
};
function downtown() {
  seq = 0;
  return [
    row("Harbor House", "restaurant", 0.4, 88),
    row("Trattoria Bello", "italian_restaurant", 0.6, 85, ["italian_restaurant", "restaurant"]),
    row("The Chophouse", "steak_house", 0.9, 90),
    row("Slice Corner", "pizza_restaurant", 0.5, 80),
    row("Late Taco", "taco_restaurant", 0.7, 79, ["taco_restaurant", "mexican_restaurant"]),
    row("Burger Barrel", "hamburger_restaurant", 0.6, 77),
    row("Quik Fuel", "fast_food_restaurant", 0.4, 70),
    row("The Rail Bar", "bar", 0.3, 82),
    row("Velvet Room", "cocktail_bar", 0.5, 84),
    row("Cork & Barrel", "wine_bar", 0.7, 83),
    row("Iron Kettle Brewery", "brewery", 0.6, 81),
    row("Dugout Sports Bar", "sports_bar", 0.4, 86),
    row("Neon Nights", "night_club", 0.6, 87),
    row("Scoop Stop", "ice_cream_shop", 0.5, 89),
    row("Daily Grind Cafe", "cafe", 0.3, 91),
    row("Press Coffee Co", "coffee_shop", 0.4, 88),
    row("Sunrise Bakery", "bakery", 0.6, 85),
    row("Harborwalk Ghost Tours", "tour_agency", 0.5, 99), // 4.95★ — the tempting decoy
    row("Serenity Day Spa", "spa", 0.4, 90),
    row("City History Museum", "museum", 0.5, 88),
    row("Riverside Park", "park", 0.6, 70),
    row("Sunny Playground", "playground", 0.7, 65),
    row("Iron Pulse Gym", "gym", 0.5, 75),
    row("The Regency Hotel", "hotel", 0.6, 80),
    // a couple further out, so nothing here needs the widen/overflow passes
    row("Overlook Grille", "restaurant", 5.5, 92),
    row("Roadside Diner", "diner", 7.0, 74),
  ];
}

const ALCOHOL_TYPES = new Set(["bar", "pub", "irish_pub", "brewery", "brewpub", "wine_bar", "cocktail_bar", "night_club", "lounge", "sports_bar", "bar_and_grill", "liquor_store", "adult_entertainment"]);
const AVOID_SET_FOR_TEST = new Set(AVOID);
const EXPLORE_ALLOWED = new Set(["museum", "art_museum", "tourist_attraction"]);
const RESTAURANT_LIKE = (t) => t === "restaurant" || /_restaurant$/.test(t) || t === "steak_house" || t === "diner" || t === "food_court";
const RANKING_NOTE_RX = / · \d+\.\d mi from the venue( · (Filmed by local creators|A photo stop worth planning))?$/;

// 1. Evening concert.
{
  const ctx = classifyEvent({ name: "Arena Rock Night", segment: "Music", genre: "Indie Rock", time: "19:30" });
  ok(ctx.archetype === "concert_evening", `an evening Music-segment event classifies as concert_evening (got ${ctx.archetype})`);
  const picks = fillOutingSlots(ctx, downtown(), {});
  ok(picks.length >= 6, `an evening concert against a healthy downtown inventory yields at least 6 picks (got ${picks.length})`);
  ok(!picks.some((p) => AVOID_SET_FOR_TEST.has(p.primaryType)), "no AVOID type (tour agency, spa, museum, gym, hotel) appears in the concert picks");
  ok(new Set(picks.map((p) => p.outing.slotKey)).size >= 3, "the concert picks span at least 3 distinct slots");
  ok(picks.some((p) => RESTAURANT_LIKE(p.primaryType)), "the concert picks include a restaurant");
  ok(picks.some((p) => ALCOHOL_TYPES.has(p.primaryType)), "the concert picks include a bar");
  ok(picks[0] && picks[0].distMi <= 1, `the first pick is within 1 mile of the venue (got ${picks[0] && picks[0].distMi})`);
  ok(picks.every((p) => p.outing && typeof p.outing.slotKey === "string" && p.outing.slotKey.length > 0), "every concert pick carries outing.slotKey");
  ok(picks.every((p) => RANKING_NOTE_RX.test(p.rankingNote || "")), "every concert pick's rankingNote names its slot and distance");
}

// 2. Symphony (classical evening -> show_classy).
{
  const ctx = classifyEvent({ name: "City Symphony Orchestra", genre: "Classical", time: "19:00" });
  ok(ctx.archetype === "show_classy", `an evening symphony classifies as show_classy (got ${ctx.archetype})`);
  const picks = fillOutingSlots(ctx, downtown(), {});
  ok(!picks.some((p) => p.primaryType === "night_club" || p.primaryType === "fast_food_restaurant"), "the symphony picks contain no night club or fast food");
  ok(picks.some((p) => p.primaryType === "ice_cream_shop" || p.primaryType === "dessert_shop" || p.primaryType === "bakery" || p.primaryType === "wine_bar"), "the symphony picks include dessert or a wine bar");
}

// 3. Kids show, 10:00, Family segment.
{
  const ctx = classifyEvent({ name: "Storytime Sing Along", segment: "Family", time: "10:00" });
  ok(ctx.archetype === "family_day", `a morning Family-segment event classifies as family_day (got ${ctx.archetype})`);
  const picks = fillOutingSlots(ctx, downtown(), {});
  ok(!picks.some((p) => ALCOHOL_TYPES.has(p.primaryType)), "the kids-show picks contain zero alcohol types");
  ok(picks.some((p) => p.primaryType === "ice_cream_shop" || p.primaryType === "dessert_shop"), "the kids-show picks include ice cream or dessert");
}

// 4. Curated food festival.
{
  const ctx = classifyEvent({ category: "food", subcategory: "food-festival", event_name: "Downtown Food and Wine Festival" });
  ok(ctx.archetype === "festival_fed" && ctx.alreadyFed === true, `a food-festival curated row classifies as festival_fed (got ${ctx.archetype})`);
  const picks = fillOutingSlots(ctx, downtown(), {});
  ok(!picks.some((p) => RESTAURANT_LIKE(p.primaryType) || p.primaryType === "pizza_restaurant" || p.primaryType === "taco_restaurant" || p.primaryType === "hamburger_restaurant"), "the food-festival picks contain zero restaurant meal types");
  ok(picks.some((p) => ["cafe", "coffee_shop", "dessert_shop", "ice_cream_shop", "bakery"].includes(p.primaryType)), "the food-festival picks include cafe, dessert, or coffee");
}

// 5. 21+ hip hop, 22:00.
{
  const ctx = classifyEvent({ name: "Bass Drop Live", genre: "Hip-Hop", time: "22:00", minimum_age: 21 });
  ok(ctx.archetype === "club_night" && ctx.adult === true, `a 21+ hip-hop show classifies as club_night (got ${ctx.archetype})`);
  const picks = fillOutingSlots(ctx, downtown(), {});
  ok(picks.some((p) => p.primaryType === "night_club"), "a night club is admitted for a 21+ club night");
}

// 6. Day baseball vs. night baseball.
{
  const ctxDay = classifyEvent({ name: "Rays vs Yankees", segment: "Sports", time: "13:05" });
  const ctxNight = classifyEvent({ name: "Rays vs Yankees", segment: "Sports", time: "19:10" });
  ok(ctxDay.archetype === "sports_day" && ctxNight.archetype === "sports_night" && ctxDay.archetype !== ctxNight.archetype, `day and night baseball classify to different archetypes (got ${ctxDay.archetype} / ${ctxNight.archetype})`);
  const picksDay = fillOutingSlots(ctxDay, downtown(), {});
  const picksNight = fillOutingSlots(ctxNight, downtown(), {});
  const slotsDay = [...new Set(picksDay.map((p) => p.outing.slotKey))].sort().join(",");
  const slotsNight = [...new Set(picksNight.map((p) => p.outing.slotKey))].sort().join(",");
  ok(slotsDay !== slotsNight, `day and night baseball produce different slot sets (day: ${slotsDay} | night: ${slotsNight})`);
}

// 7. Suburban fixture — everything 2 to 9 miles out; the widen + overflow
// passes are what has to produce a real answer here.
{
  const suburban = () => {
    seq = 0;
    return [
      row("Trailhead Grill", "restaurant", 2.4, 84),
      row("Meadowview Tavern", "bar", 3.1, 80),
      row("Outpost Pizza", "pizza_restaurant", 4.8, 78),
      row("Sunset Creamery", "ice_cream_shop", 5.9, 86),
      row("Ridge Coffee Roasters", "cafe", 6.7, 89),
      row("Old Mill Steakhouse", "steak_house", 8.6, 91),
    ];
  };
  const ctx = classifyEvent({ name: "County Fairgrounds Show", segment: "Music", genre: "Country", time: "19:00" });
  const picks = fillOutingSlots(ctx, suburban(), {});
  ok(picks.length >= 3, `the suburban fixture still returns at least 3 picks (got ${picks.length})`);
  ok(picks.every((p) => p.distMi <= 12), "no suburban pick exceeds the 12 mile outer cap");
}

// 8. Determinism.
{
  const ctx = classifyEvent({ name: "Arena Rock Night", segment: "Music", genre: "Indie Rock", time: "19:30" });
  const a = fillOutingSlots(ctx, downtown(), {}).map((p) => p.id);
  const b = fillOutingSlots(ctx, downtown(), {}).map((p) => p.id);
  ok(JSON.stringify(a) === JSON.stringify(b), "the same event and candidate pool produce an identical pick order every time");
}

// 9. Self venue excluded — proven at the eventPairings() level, where
// self-exclusion actually happens (fillOutingSlots has no venue identity to
// compare against; it only ever sees candidates already merged).
{
  const STUB_SUPABASE_URL = "https://stub.supabase.co";
  const STUB_SUPABASE_ANON_KEY = "stub-anon-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = STUB_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = STUB_SUPABASE_ANON_KEY;
  const { eventPairings } = await import("../lib/eventPairings.js");
  const mkFoodRow = (i, dLat) => ({
    place_id: "sv" + i, name: "Self Venue Test " + i,
    lat: 25.7272 + dLat * i, lng: -80.2578,
    primary_type: "restaurant", google_types: ["restaurant", "food"],
    signals: { rating: 4.8, reviews: 2500 + i, priceNum: 2 }, status: "OPERATIONAL",
  });
  const stub = (rows) => async (url) => ({ ok: true, json: async () => (String(url).includes("category=eq.food") ? rows : []) });
  const rows = [1, 2, 3, 4].map((i) => mkFoodRow(i, 0.002));
  const res = await eventPairings(
    { lat: 25.7272, lng: -80.2578, city: "Miami", place_id: "sv2", name: "Self Venue Concert", segment: "Music", time: "19:30" },
    { fetchImpl: stub(rows) },
  );
  ok(!res.some((p) => p.id === "sv2"), "the event's own venue never appears among its own outing picks");
}

// 10. No more than 3 of the same primaryType.
{
  seq = 0;
  const manyRestaurants = Array.from({ length: 6 }, (_, i) => row(`Restaurant ${i}`, "restaurant", 0.3 + i * 0.05, 80 + i));
  const ctx = classifyEvent({ name: "Arena Rock Night", segment: "Music", time: "19:30" });
  const picks = fillOutingSlots(ctx, manyRestaurants, {});
  const restaurantCount = picks.filter((p) => p.primaryType === "restaurant").length;
  ok(restaurantCount <= 3, `no more than 3 picks share the same primaryType (got ${restaurantCount} restaurants)`);
}

// 11. HONESTY. Nothing here may claim hours, and nothing reader-facing uses a dash.
{
  const ctx = classifyEvent({ name: "Arena Rock Night", segment: "Music", time: "19:30" });
  const picks = fillOutingSlots(ctx, downtown(), {});
  const dump = JSON.stringify(picks);
  ok(!/open (late|until|now)|hours/i.test(dump), "the outing engine's output never claims hours, open-late, or open-now");

  const dashRx = /[-–—]/;
  const labelOffenders = [];
  for (const [archetype, slots] of Object.entries(SLOT_TABLE)) {
    for (const slot of slots) {
      if (dashRx.test(slot.label)) labelOffenders.push(`${archetype}.${slot.key}: "${slot.label}"`);
    }
  }
  for (const archetype of OUTING_ARCHETYPES) {
    const copy = outingCopy(archetype);
    if (dashRx.test(copy.railTitle)) labelOffenders.push(`${archetype} railTitle: "${copy.railTitle}"`);
    if (dashRx.test(copy.railNote)) labelOffenders.push(`${archetype} railNote: "${copy.railNote}"`);
  }
  ok(labelOffenders.length === 0, `no reader-facing SLOT_TABLE/outingCopy string contains a dash (offenders: ${labelOffenders.join("; ") || "none"})`);
  // The hours ban covers EVERY reader-facing string, not just one archetype's
  // output (a "After hours" club_night label slipped past a concert-only dump).
  const hoursRx = /open (late|until|now)|hours/i;
  const hoursOffenders = [];
  for (const [archetype, slots] of Object.entries(SLOT_TABLE)) {
    for (const slot of slots) if (hoursRx.test(slot.label)) hoursOffenders.push(`${archetype}.${slot.key}: "${slot.label}"`);
  }
  for (const archetype of OUTING_ARCHETYPES) {
    const copy = outingCopy(archetype);
    if (hoursRx.test(copy.railTitle) || hoursRx.test(copy.railNote)) hoursOffenders.push(`${archetype} copy`);
  }
  ok(hoursOffenders.length === 0, `no reader-facing SLOT_TABLE/outingCopy string claims hours (offenders: ${hoursOffenders.join("; ") || "none"})`);
}

// 15. Event SHAPE beats start time (Fable audit 2026-09-23, real curated rows).
{
  const bluegrass = classifyEvent({ event_name: "Thanksgiving Bluegrass Festival", category: "music", subcategory: "music-festival", start_date: "2026-11-26", end_date: "2026-11-29", start_time: "12:00:00" });
  ok(bluegrass.archetype === "festival_allday", `a noon, multi day music festival is festival_allday, not a dinner and nightcap concert (got ${bluegrass.archetype})`);
  const lights = classifyEvent({ event_name: "Holiday Lights Walk", category: "holiday", subcategory: "holiday lights", start_date: "2026-11-27", end_date: "2026-12-31", start_time: "17:30:00" });
  ok(lights.archetype === "family_evening", `a 17:30 multi day holiday lights run is family_evening (got ${lights.archetype})`);
  const crawl = classifyEvent({ event_name: "Zombie Pub Crawl", category: "halloween", subcategory: "bar-crawl", start_date: "2026-10-31", start_time: "19:00:00", minimum_age: null });
  ok(crawl.adult === true && crawl.alreadyFed === true, "a bar crawl with no minimum_age is still adult and already fed");
  const market = classifyEvent({ name: "The Market at Waterside Place", segment: "Community", genre: "Farmers market" });
  ok(market.archetype === "festival_fed", `a live seed farmers market (genre only) is festival_fed (got ${market.archetype})`);
}


// 12. classifyEvent({}) is a generic archetype, and AVOID still applies.
{
  const ctx = classifyEvent({});
  ok(OUTING_ARCHETYPES.includes(ctx.archetype), `an event with no fields at all still classifies to a known archetype (got ${ctx.archetype})`);
  ok(!/family|comedy|sports|festival|club|country|show/.test(ctx.archetype), `an event with no fields classifies to a GENERIC archetype, not a specific one (got ${ctx.archetype})`);
  const picks = fillOutingSlots(ctx, downtown(), {});
  // 2026-09-30: a DAYTIME generic event may admit a real sight (museum,
  // tourist_attraction) through the "Make a day of it" slot ONLY. Every other
  // AVOID type (tour agency decoy, spa, gym, hotel) stays out, and no other
  // slot may carry an avoided type.
  const leaked = picks.filter((p) => AVOID_SET_FOR_TEST.has(p.primaryType) && !(p.outing.slotKey === "explore_after" && EXPLORE_ALLOWED.has(p.primaryType)));
  ok(leaked.length === 0, `AVOID still applies to the generic fallback archetype outside the explore slot's allow list (leaked: ${leaked.map((p) => p.name).join(", ") || "none"})`);
}

// 13. RED PROOFS — prove this guard can actually fail, by sabotaging the
// exact protections above and watching the assertion flip.
{
  // 13a. AVOID: a lone, high-scoring tour agency with nothing else to fill
  // the slots. Normally excluded outright; emptying AVOID lets it leak into
  // the pass-4 "Also nearby" overflow.
  seq = 0;
  const soleTourAgency = [row("Harborwalk Ghost Tours", "tour_agency", 0.5, 99)];
  const ctx = classifyEvent({ name: "Arena Rock Night", segment: "Music", time: "19:30" });
  const normal = fillOutingSlots(ctx, soleTourAgency, { max: 8, min: 3 });
  ok(normal.length === 0, "red proof control: with AVOID intact, a lone tour agency is never admitted");
  const sabotaged = fillOutingSlots(ctx, soleTourAgency, { max: 8, min: 3, avoidSet: new Set() });
  ok(sabotaged.length === 1 && sabotaged[0].primaryType === "tour_agency", "red proof: emptying AVOID lets the tour agency through — proves this guard can fail");

  // 13b. Family alcohol exclusion: a lone bar for a family event. Normally
  // excluded by the family AVOID set (which folds in every alcohol type
  // precisely so pass-4 overflow can't leak one in either); emptying it
  // proves the exclusion is load-bearing, not decorative.
  seq = 0;
  const soleBar = [row("Downtown Pub", "bar", 0.3, 95)];
  const familyCtx = classifyEvent({ segment: "Family", time: "10:00" });
  const normalFamily = fillOutingSlots(familyCtx, soleBar, { max: 8, min: 3 });
  ok(normalFamily.length === 0, "red proof control: a family event never admits a bar, even as overflow");
  const sabotagedFamily = fillOutingSlots(familyCtx, soleBar, { max: 8, min: 3, avoidSet: new Set() });
  ok(sabotagedFamily.length === 1 && sabotagedFamily[0].primaryType === "bar", "red proof: emptying the family AVOID set lets a bar through — proves this guard can fail");

  // 13c. Bonus: a slot's own `exclude` (not just the global AVOID) is real.
  // show_classy's dinner slot explicitly excludes night_club.
  seq = 0;
  const soleNightClub = [row("Neon Nights", "night_club", 0.4, 95, ["night_club", "restaurant"])]; // dual-typed, as some venues are
  const classyCtx = classifyEvent({ name: "City Symphony Orchestra", genre: "Classical", time: "19:00" });
  const normalClassy = fillOutingSlots(classyCtx, soleNightClub, { max: 8, min: 3 });
  ok(normalClassy.length === 0, "red proof control: show_classy's own slot exclude keeps a night club out");
  const sabotagedClassy = fillOutingSlots(classyCtx, soleNightClub, { max: 8, min: 3, ignoreSlotExclude: true });
  ok(sabotagedClassy.length === 1, "red proof: bypassing the per-slot exclude lets the night club through — proves the exclude list is load-bearing");
}

// 14. Regressions found running the engine against LIVE inventory, 2026-09-23.
{
  // 14a. A kids show is a family outing before it is theater. "Disney Junior
  //      Live" (segment Family, genre Children's Theatre, 11:00) resolved to
  //      show_matinee and was handed a wine bar.
  const kidsTheater = classifyEvent({ name: "Disney Junior Live", segment: "Family", genre: "Children's Theatre", time: "11:00:00" });
  ok(kidsTheater.archetype === "family_day", `a Family segment children's theatre show classifies as family_day (got ${kidsTheater.archetype})`);
  const kidsPicks = fillOutingSlots(kidsTheater, downtown(), { max: 8, min: 3 });
  ok(kidsPicks.length >= 3 && !kidsPicks.some((p) => ALCOHOL_TYPES.has(p.primaryType)), "the children's theatre picks contain zero alcohol types");
  // 14b. Family flag vetoes alcohol in ANY archetype (a family day game).
  const familyGame = classifyEvent({ name: "Family Day: Rays vs. Red Sox", segment: "Sports", genre: "Baseball", time: "13:10" });
  ok(familyGame.family === true, "a Family Day game carries the family flag");
  const gamePicks = fillOutingSlots(familyGame, downtown(), { max: 8, min: 3 });
  ok(!gamePicks.some((p) => ALCOHOL_TYPES.has(p.primaryType)), "a family flagged game never gets an alcohol stop, whatever archetype it lands in");
  // 14c. A specific primaryType is the place's identity; a secondary Google
  //      type may not relabel it. A coffee_shop typed "bar" was labeled
  //      "Wine before"; a cocktail_bar typed "cafe" was labeled "Brunch before".
  const trickRows = [
    row("Cafe Arts", "coffee_shop", 0.2, 96, ["coffee_shop", "cafe", "bar"]),
    row("Intermezzo Coffee & Cocktails", "cocktail_bar", 0.2, 96, ["cocktail_bar", "cafe", "bar"]),
    ...downtown(),
  ];
  const classy = fillOutingSlots(classifyEvent({ name: "Masterworks", segment: "Arts & Theatre", genre: "Classical", time: "19:30" }), trickRows, { max: 8, min: 3 });
  const wineMislabel = classy.find((p) => p.name === "Cafe Arts" && /wine|drink/i.test(p.outing.slotLabel));
  ok(!wineMislabel, "a coffee shop is never labeled as a wine or drink stop because of a secondary type");
  const dayGame = fillOutingSlots(classifyEvent({ name: "Rays vs. Red Sox", segment: "Sports", genre: "Baseball", time: "13:10" }), trickRows, { max: 8, min: 3 });
  const brunchMislabel = dayGame.find((p) => p.name === "Intermezzo Coffee & Cocktails" && /brunch|lunch|breakfast|coffee/i.test(p.outing.slotLabel));
  ok(!brunchMislabel, "a cocktail bar is never labeled as a brunch or coffee stop because of a secondary type");
  // 14d. Every slotted (non overflow) pick's own primaryType is one the slot
  //      names, or a generic food identity. The label on a card must be true.
  const GENERIC = new Set(["restaurant", "food", "point_of_interest", "establishment", "store", "food_store", ""]);
  const honest = (picks, archetype) => picks.every((p) => {
    if (p.outing.slotKey === "also_nearby") return true;
    const slot = (SLOT_TABLE[archetype] || []).find((s) => s.key === p.outing.slotKey);
    if (!slot) return false;
    const pool = new Set([...(slot.primary || []), ...(slot.any || [])]);
    return pool.has(p.primaryType) || GENERIC.has(p.primaryType || "");
  });
  ok(honest(classy, "show_classy") && honest(dayGame, "sports_day") && honest(kidsPicks, "family_day"), "every slotted pick's primaryType matches the slot its card label names");
}


// 16. Recommendation intelligence (2026-09-30, owner: "the recommendations
//     needs to be good"). Every assertion RUNS fillOutingSlots.
{
  const concert = classifyEvent({ name: "Indie Rock Night", segment: "Music", genre: "Rock", time: "20:00" });
  const dayCtx = classifyEvent({ name: "Saturday Makers Fair", segment: "Community", time: "11:00" });

  // 16a. Daytime events get a real nearby sight; evening concerts never do.
  const dayPicks = fillOutingSlots(dayCtx, downtown(), { max: 12 });
  const explore = dayPicks.filter((p) => p.outing.slotKey === "explore_after");
  ok(explore.some((p) => p.name === "City History Museum"), `a daytime event's "Make a day of it" slot surfaces the nearby museum (got ${explore.map((p) => p.name).join(", ") || "nothing"})`);
  ok(!dayPicks.some((p) => p.primaryType === "tour_agency"), "the 4.95 star tour agency decoy never passes the explore slot's allow list");
  const nightPicks = fillOutingSlots(concert, downtown(), { max: 12 });
  ok(!nightPicks.some((p) => p.primaryType === "museum"), "an evening concert never gets a museum pick");

  // 16b. Quality floor: a close, perfectly typed but mediocre place loses its
  //      slot to a real one, and never appears while better picks exist.
  const withWeak = [...downtown(), { id: "weak-1", name: "Tired Tavern", primaryType: "bar", types: ["bar"], governed_score: OUTING_MIN_SCORE - 5, distMi: 0.05 }];
  ok(!fillOutingSlots(concert, withWeak, { max: 12 }).some((p) => p.id === "weak-1"), `a place under OUTING_MIN_SCORE (${OUTING_MIN_SCORE}) is not recommended when better picks exist`);

  // 16c. Price fit: a symphony dinner prefers the upscale room over an
  //      identically scored, identically placed cheap one.
  const classyCtx = classifyEvent({ name: "Symphony No. 9", genre: "Classical", time: "19:30" });
  const priced = [
    { id: "cheap", name: "Cheap Eats", primaryType: "restaurant", types: ["restaurant"], governed_score: 88, distMi: 0.4, priceLevel: 1 },
    { id: "upscale", name: "The Upscale Room", primaryType: "restaurant", types: ["restaurant"], governed_score: 88, distMi: 0.4, priceLevel: 3 },
    { id: "cafe", name: "Corner Cafe", primaryType: "cafe", types: ["cafe"], governed_score: 80, distMi: 0.3 },
    { id: "wine", name: "Wine Nook", primaryType: "wine_bar", types: ["wine_bar"], governed_score: 80, distMi: 0.3 },
  ];
  const classyDinner = fillOutingSlots(classyCtx, priced, { max: 8, min: 1 }).filter((p) => p.outing.slotKey === "dinner_before");
  ok(classyDinner[0] && classyDinner[0].id === "upscale", `show_classy dinner ranks the $$$ room over the $ one at equal score and distance (got ${classyDinner.map((p) => p.id).join(", ")})`);

  // 16f. Inside a five minute walk, a much better place is not beaten on distance.
  const walk = [
    { id: "a-closest", name: "Closest Room", primaryType: "restaurant", types: ["restaurant"], governed_score: 89, distMi: 0.06 },
    { id: "b-best", name: "Best Room", primaryType: "restaurant", types: ["restaurant"], governed_score: 99, distMi: 0.2 },
  ];
  const walkDinner = fillOutingSlots(concert, walk, { max: 8, min: 1 }).filter((p) => p.outing.slotKey === "dinner_before");
  ok(walkDinner[0] && walkDinner[0].id === "b-best", `a 99 at 0.2 mi outranks an 89 at 0.06 mi (got ${walkDinner.map((p) => p.id).join(", ")})`);

  // 16d. Editorial lift: a vetted Wayfind write up breaks a tie, and nothing more.
  const tie = [
    { id: "a-plain", name: "Plain Bar", primaryType: "bar", types: ["bar"], governed_score: 84, distMi: 0.3 },
    { id: "b-vetted", name: "Vetted Bar", primaryType: "bar", types: ["bar"], governed_score: 84, distMi: 0.3, editorial: "Order the frozen negroni." },
  ];
  const drinks = fillOutingSlots(concert, tie, { max: 2, min: 1 }).filter((p) => p.outing.slotKey === "drinks_before");
  ok(drinks[0] && drinks[0].id === "b-vetted", "a place with a Wayfind write up wins an exact tie");
  const farVetted = [
    { id: "near-great", name: "Near Great Bar", primaryType: "bar", types: ["bar"], governed_score: 92, distMi: 0.1 },
    { id: "far-vetted", name: "Far Vetted Bar", primaryType: "bar", types: ["bar"], governed_score: 80, distMi: 0.7, editorial: "Nice patio." },
  ];
  const lift = fillOutingSlots(concert, farVetted, { max: 2, min: 1 }).filter((p) => p.outing.slotKey === "drinks_before");
  ok(lift[0] && lift[0].id === "near-great", "the editorial lift never beats a clearly better, clearly closer place");

  // 16e. Cuisine variety: at most two picks share a lead cuisine.
  const sushiRow = (i) => ({ id: `sushi-${i}`, name: `Sushi ${i}`, primaryType: "restaurant", types: ["restaurant"], cuisines: ["Sushi"], governed_score: 95 - i, distMi: 0.2 });
  const varied = [...[1, 2, 3, 4].map(sushiRow), { id: "tacos", name: "Taco Spot", primaryType: "restaurant", types: ["restaurant"], cuisines: ["Mexican"], governed_score: 80, distMi: 0.5 }];
  const variedPicks = fillOutingSlots(concert, varied, { max: 8, min: 1 });
  ok(variedPicks.filter((p) => p.id.startsWith("sushi")).length === 2, `no more than two picks share a lead cuisine (got ${variedPicks.filter((p) => p.id.startsWith("sushi")).length} sushi)`);
  ok(variedPicks.some((p) => p.id === "tacos"), "the cuisine cap opens room for a different kind of meal");
}

// 17. An unforgettable night (2026-09-30, owner: "a lot more fun things to
//     do … make the person's night unforgettable … instagrammable places").
//     Every assertion RUNS fillOutingSlots / photoWorthy.
{
  const concert = classifyEvent({ name: "Indie Rock Night", segment: "Music", genre: "Rock", time: "20:00" });
  const r = (id, name, primaryType, governed, distMi, types) => ({ id, name, primaryType, types: types || [primaryType], governed_score: governed, distMi });
  const fun = [
    r("sail", "Tampa Bay Sunset Sail", "tour_agency", 90, 0.5),
    r("counter", "Best Tours Agency", "tour_agency", 99, 0.2),
    // "z-pier" sorts AFTER "a-statue", so a tie would go to the statue: only
    // the fishing_pier identity can put the pier first.
    r("z-pier", "City Pier", "tourist_attraction", 90, 0.6, ["tourist_attraction", "fishing_pier", "park"]),
    r("a-statue", "Old Statue", "tourist_attraction", 90, 0.6),
    r("jazz", "Blue Note Room", "bar", 90, 0.2, ["bar", "live_music_venue", "event_venue"]),
    r("hall", "Grand Wedding Hall", "event_venue", 95, 0.2),
    r("arcade", "Pixel Arcade", "video_arcade", 88, 0.4),
    r("bowl", "Strike Lanes", "bowling_alley", 86, 0.5),
    r("hookah", "Cloud Nine Hookah", "hookah_bar", 90, 0.3),
    r("tavern", "Corner Tavern", "bar", 85, 0.2),
    r("dinner", "Bistro One", "restaurant", 90, 0.2),
  ];
  const opts = { max: 12, min: 1, photoWorthy: false };
  const night = fillOutingSlots(concert, fun, opts);
  const bySlot = (picks, key) => picks.filter((p) => p.outing.slotKey === key).map((p) => p.id);

  // 17a. Experiences: a boat named for what it is gets in; a tours counter never does.
  ok(bySlot(night, "memorable_before").includes("sail"), `a named sunset sail is a "Make it memorable" pick for a concert (got ${bySlot(night, "memorable_before").join(", ") || "none"})`);
  ok(!night.some((p) => p.id === "counter"), "a generic tour agency storefront is never recommended, even at a 99");
  // 17b. Identity: a pier's secondary fishing_pier type makes it a full fit.
  const pierVsStatue = bySlot(fillOutingSlots(concert, fun.filter((p) => p.id !== "sail"), opts), "memorable_before");
  ok(pierVsStatue[0] === "z-pier", `a tourist attraction typed fishing_pier outranks an equal plain attraction (got ${pierVsStatue.join(", ")})`);
  // 17c. Second act: a music bar (event_venue typed) counts; a wedding hall never does.
  ok(bySlot(night, "second_act_after").includes("jazz"), `a bar typed live_music_venue is a "Keep the night going" pick (got ${bySlot(night, "second_act_after").join(", ") || "none"})`);
  ok(!night.some((p) => p.id === "hall"), "a plain event hall never enters any slot");
  // 17d. Classy stays quiet: no arcade, bowling or second act.
  const classy = fillOutingSlots(classifyEvent({ name: "Symphony No. 9", genre: "Classical", time: "19:30" }), fun, opts);
  ok(!classy.some((p) => ["arcade", "bowl", "hookah"].includes(p.id)) && bySlot(classy, "second_act_after").length === 0, "a symphony never gets an arcade, bowling or a second act");
  // 17e. Family evening: fun is kid fun. No boats for sale, no bar, no hookah.
  const kids = fillOutingSlots(classifyEvent({ name: "Disney Junior Live", segment: "Family", time: "18:00" }), fun, opts);
  ok(kids.some((p) => p.id === "arcade" || p.id === "bowl"), "a family evening gets arcade or bowling fun");
  ok(!kids.some((p) => ["sail", "counter", "jazz", "hookah", "tavern", "hall"].includes(p.id)), `a family evening never gets a boat sale, bar, hookah or event hall (got ${kids.map((p) => p.id).join(", ")})`);
  // 17e2. A family flagged NIGHT GAME (sports_night, which carries the
  //       memorable and second act slots) is just as kid safe (Fable audit).
  const familyGameCtx = classifyEvent({ name: "Rays vs Yankees Family Night", segment: "Sports", audience: ["family"], time: "19:00" });
  const familyFun = [...fun, r("kara", "Sing Along Karaoke", "karaoke", 92, 0.2), r("tiki", "Cruisin Tiki Boat", "boat_tour_agency", 92, 0.3), r("dock", "Sunset Marina", "marina", 92, 0.3)];
  const famGame = fillOutingSlots(familyGameCtx, familyFun, opts);
  ok(familyGameCtx.archetype === "sports_night" && familyGameCtx.family, `fixture control: the family night game is sports_night and family (got ${familyGameCtx.archetype}, family ${familyGameCtx.family})`);
  ok(!famGame.some((p) => ["sail", "tiki", "dock", "kara", "jazz", "hookah", "tavern"].includes(p.id)), `a family night game never gets a boat, marina, karaoke or bar (got ${famGame.map((p) => p.id).join(", ")})`);
  const unguarded = fillOutingSlots({ ...familyGameCtx, family: false }, familyFun, opts);
  ok(unguarded.some((p) => ["sail", "tiki", "kara"].includes(p.id)), "red proof control: the same night game without the family flag does admit them, so the guard is doing the work");

  // 17e3. Quota release stretches a slot by at most two.
  const bars = Array.from({ length: 14 }, (_, i) => r(`bar-${String(i).padStart(2, "0")}`, `Bar ${i}`, ["bar", "pub", "irish_pub", "brewery", "brewpub"][i % 5], 90 - i, 0.2));
  const barNight = fillOutingSlots(concert, bars, { max: 12, min: 1, photoWorthy: false });
  const drinksBefore = barNight.filter((p) => p.outing.slotKey === "drinks_before").length;
  ok(drinksBefore <= 4, `a bar heavy block never fills one slot past quota plus two (drinks before: ${drinksBefore})`);

  // 17f. Every archetype but already fed still reserves a full shelf of twelve.
  const sums = Object.entries(SLOT_TABLE).filter(([k]) => k !== "festival_fed").map(([k, v]) => [k, v.reduce((a, sl) => a + sl.quota, 0)]);
  ok(sums.every(([, n]) => n === 12), `slot quotas sum to 12 (got ${sums.filter(([, n]) => n !== 12).map(([k, n]) => k + "=" + n).join(", ") || "all 12"})`);
  // 17g. A food only block still fills: empty fun slots release their room.
  const foodOnly = downtown().filter((p) => !["tour_agency", "spa", "museum", "park", "playground", "gym", "hotel"].includes(p.primaryType));
  const filled = fillOutingSlots(concert, foodOnly, { max: 12, photoWorthy: false });
  ok(filled.length >= 11, `with no fun places nearby, food and drink fill the released room (got ${filled.length} picks)`);
}

// 18. photoWorthy: "instagrammable" only when we can prove it.
{
  const creator = photoWorthy({ id: "no-such-id", name: "Fortu" }, "St. Petersburg");
  ok(creator && creator.level === "creator" && creator.copy === "Filmed by local creators", `a place real creators filmed reads "Filmed by local creators" (got ${JSON.stringify(creator)})`);
  const curated = photoWorthy({ id: "x", name: "Perspective Rooftop Pool Bar" }, "Sarasota");
  ok(curated && curated.level === "curated", `a curated rooftop in its own city is a photo stop (got ${JSON.stringify(curated)})`);
  ok(photoWorthy({ id: "x", name: "Perspective Rooftop Pool Bar" }, "Tampa") === null, "a curated name in a different city is not proof");
  ok(photoWorthy({ id: "x", name: "Sunny Pier Park" }, "St. Petersburg") === null, "no proof, no claim: a pier named place with no creator or curated record gets nothing");
  // Bounded: the boost breaks a tie, never a clear quality gap.
  const concert = classifyEvent({ name: "Indie Rock Night", segment: "Music", genre: "Rock", time: "20:00" });
  const tie = [
    { id: "a-plain", name: "Plain Grill", primaryType: "restaurant", types: ["restaurant"], governed_score: 88, distMi: 0.2 },
    { id: "b-filmed", name: "Filmed Grill", primaryType: "restaurant", types: ["restaurant"], governed_score: 88, distMi: 0.2 },
  ];
  const stub = (p) => (p.id === "b-filmed" ? { level: "creator", copy: "Filmed by local creators" } : null);
  const tiePick = fillOutingSlots(concert, tie, { max: 2, min: 1, photoWorthy: stub }).filter((p) => p.outing.slotKey === "dinner_before");
  ok(tiePick[0] && tiePick[0].id === "b-filmed" && / · Filmed by local creators$/.test(tiePick[0].rankingNote), "a creator filmed place wins a tie and its card says why");
  const gap = [{ ...tie[0], governed_score: 98 }, tie[1]];
  const gapPick = fillOutingSlots(concert, gap, { max: 2, min: 1, photoWorthy: stub }).filter((p) => p.outing.slotKey === "dinner_before");
  ok(gapPick[0] && gapPick[0].id === "a-plain", "the photo boost never beats a clearly better place");
  ok(!/[-\u2013\u2014]/.test(Object.values(PHOTO_WORTHY_COPY).join(" ")), "photo copy carries no dashes");
}

// 19. Optional reach slots never switch off the suburban widen (live preview
//     regression 2026-09-30: Clearwater Jazz Holiday 6 picks on main, 3 on
//     the branch). A classy show whose meals sit 1.2 to 1.5 mi out, with one
//     attraction next door, must still get dinner, dessert and a drink.
{
  const classyCtx = classifyEvent({ name: "Clearwater Jazz Holiday", genre: "Jazz", time: "19:00" });
  const r = (id, name, primaryType, governed, distMi) => ({ id, name, primaryType, types: [primaryType], governed_score: governed, distMi });
  const block = [
    r("near-1", "Harbor Grill", "restaurant", 92, 0.1),
    r("near-2", "Dock Diner", "restaurant", 89, 0.5),
    r("pad", "Splash Pad", "tourist_attraction", 85, 0.3),
    r("fine", "DeLukas", "fine_dining_restaurant", 91, 1.2),
    r("drink", "Terrace Bar", "cocktail_bar", 95, 1.5),
    r("cafe", "Corner Cafe", "cafe", 90, 1.3),
  ];
  const got = fillOutingSlots(classyCtx, block, { max: 12, photoWorthy: false });
  const keys = new Set(got.map((p) => p.outing.slotKey));
  ok(got.length >= 5 && keys.has("dessert_after") && (keys.has("quiet_drink_after") || keys.has("wine_before")), `an empty core slot still triggers the widen; optional slots cannot suppress it (got ${got.map((p) => p.id + ":" + p.outing.slotKey).join(", ")})`);
  // Control: with every core slot filled nearby, the widen is not taken.
  const dense = [...block.slice(0, 3), r("w", "Wine Nook", "wine_bar", 90, 0.2), r("d", "Scoops", "ice_cream_shop", 88, 0.3), r("q", "Velvet", "cocktail_bar", 87, 0.3), r("far", "Far Fine", "fine_dining_restaurant", 99, 1.5)];
  ok(!fillOutingSlots(classyCtx, dense, { max: 12, photoWorthy: false }).some((p) => p.id === "far"), "control: when every core slot fills nearby, a 1.5 mi place does not replace them");
}

// outingCacheKey sanity — used by lib/eventPairingsCache.js to split the
// Data Cache; two different classifications must produce different keys, and
// the same classification must always produce the same key.
{
  const a = outingCacheKey(classifyEvent({ segment: "Music", time: "19:30" }));
  const b = outingCacheKey(classifyEvent({ segment: "Music", time: "19:30" }));
  const c = outingCacheKey(classifyEvent({ category: "food", subcategory: "food-festival" }));
  ok(a === b, "outingCacheKey is deterministic for identical classifications");
  ok(a !== c, "outingCacheKey differs for different classifications");
}

if (fail.length) {
  for (const m of fail) console.log("  FAIL:", m);
  console.log(`check-event-outing: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  process.exit(1);
}
console.log(`check-event-outing: OK — ${pass} assertions (before/after classification, per-archetype slot fill, AVOID + family alcohol exclusion, determinism, no-hours honesty, red-proofs)`);
