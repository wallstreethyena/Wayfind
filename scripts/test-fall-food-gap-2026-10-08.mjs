// scripts/test-fall-food-gap-2026-10-08.mjs
//
// Owner brief, 2026-10-08: Naples had zero fall food cards; Venice, Port
// Charlotte and Fort Myers were thin; Prana Farms and Farmer Mike's were
// published but hidden; the Events tab sent four #1653 farm cards to a 404.
// This guard CALLS the real code (composer, merge, feed mapper, destination
// resolver) and asserts what a reader gets, never a registry grep.
import assert from "node:assert/strict";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";
import { FALL_FEATURED_FESTIVALS_2026 } from "../lib/fallFeaturedFestivals2026.js";
import { FALL_GAP_FILL_2026_10_07 } from "../lib/fallGapFill20261007.js";
import { FALL_FOOD_GAP_2026_10_08 } from "../lib/fallFoodGap20261008.js";
import { fallEventRail, composeFallIntentRails, hasUpcomingFallOccurrence, FALL_RAIL_RADIUS_MI } from "../lib/fallIntentRails.js";
import { isTrusted } from "../lib/curatedEvents.js";
import { fallEventLive } from "../lib/fallPool.js";
import { fallEventCardImageSrc, mergeFallDiscoveryRows } from "../lib/fallEventImage.js";
import { curatedFeedEventsWithFall } from "../lib/curatedFallFeed.js";
import { resolveDestination } from "../lib/eventsPipeline.js";

let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("  OK  " + name); };
const TODAY = "2026-10-08";
const NOW = new Date("2026-10-08T12:00:00-04:00");
const CITY = {
  Naples: [26.1420, -81.7948],
  Venice: [27.0998, -82.4543],
  "Port Charlotte": [26.9762, -82.0906],
  "Fort Myers": [26.6406, -81.8723],
};
const miles = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};

// Production-shaped copies of the two hidden wf_events rows (place_id null,
// hero_image null) exactly as read from the database on 2026-10-08.
const HIDDEN = [
  { event_id: "fl26-prana-farms-pumpkin-festival-2026", slug: "prana-farms-pumpkin-festival-2026", event_name: "Prana Farms Pumpkin Festival", city: "Punta Gorda", lat: 26.946, lng: -81.959, start_date: "2026-10-01", end_date: "2026-10-31", place_id: null, hero_image: null, event_status: "scheduled", source_tier: 1, verification_confidence: "medium", card_hook: "Pick a carving pumpkin, sip apple cider from the Treat Barn and visit the petting zoo and butterfly exhibit.", category: "seasonal", subcategory: "pumpkin-patch", tags: ["fall", "pumpkins", "farm"], audience: ["families"], official_event_url: "https://prana-farms.com/prana-gatherings/", year: 2026 },
  { event_id: "fl26-farmer-mike-s-fall-fest-and-corn-maze-2026", slug: "farmer-mike-s-fall-fest-and-corn-maze-2026", event_name: "Farmer Mike's Fall Fest and Corn Maze", city: "Bonita Springs", lat: 26.349, lng: -81.733, start_date: "2026-09-26", end_date: "2026-10-31", place_id: null, hero_image: null, event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "Solve a 5-acre corn maze with 16 game stations, then pick pumpkins.", category: "seasonal", subcategory: "pumpkin-patch", tags: ["fall", "pumpkins", "farm", "corn-maze"], audience: ["families"], official_event_url: "https://www.farmermikesupick.com/farmermikesfallfest26", year: 2026 },
];
const registry = [...FALL_DISCOVERIES_2026, ...FALL_FEATURED_FESTIVALS_2026, ...FALL_GAP_FILL_2026_10_07, ...FALL_FOOD_GAP_2026_10_08];
const merged = mergeFallDiscoveryRows(HIDDEN, registry);
const shelf = (city, rail, today = TODAY) => new Set(composeFallIntentRails(merged, [], { lat: CITY[city][0], lng: CITY[city][1], today, now: new Date(today + "T12:00:00-04:00") })
  .rails.find((r) => r.id === rail).cards.map((c) => c.event_id));

check("every new food row is trusted, live, image-backed, cited, and on the food shelf", () => {
  assert.equal(FALL_FOOD_GAP_2026_10_08.length, 10, "ten verified rows (positive control on the registry itself)");
  for (const row of FALL_FOOD_GAP_2026_10_08) {
    assert.ok(isTrusted(row), `${row.event_id} passes isTrusted`);
    assert.ok(fallEventLive(row, TODAY) && hasUpcomingFallOccurrence(row, TODAY), `${row.event_id} live on ${TODAY}`);
    assert.equal(fallEventRail(row), "food", `${row.event_id} classified by the live classifier`);
    assert.match(String(row.place_id), /^ChIJ/, `${row.event_id} carries an exact venue identity`);
    assert.match(fallEventCardImageSrc(row, 640, null), /^\/api\/photo\?/, `${row.event_id} resolves the venue's own photo`);
    assert.match(String(row.official_event_url), /^https:\/\//);
    assert.match(String(row.verify_note), /^2026-10-08: /, `${row.event_id} records dated 2026 evidence`);
    assert.ok(!/\$\d/.test(row.card_hook + row.editorial_summary) || row.price_min != null, `${row.event_id} prints no unsourced price`);
    if (!row.end_date) assert.match(row.schedule_note, /not published/i, `${row.event_id} flags its unknown end date`);
  }
});

check("each row sits inside its own city's food radius (no distant padding)", () => {
  for (const row of FALL_FOOD_GAP_2026_10_08) {
    const d = miles([row.lat, row.lng], CITY[row.city]);
    assert.ok(d <= FALL_RAIL_RADIUS_MI.food, `${row.event_id} is ${d.toFixed(1)} mi from ${row.city}`);
  }
});

check("Naples, Venice, Port Charlotte and Fort Myers food shelves carry the new rows", () => {
  const expect = {
    Naples: ["bean-trolley-fall-drinks-naples-2026", "black-letter-fall-menu-naples-2026", "perry-coffee-shop-fall-naples-2026"],
    Venice: ["venice-avenue-creamery-fall-flavors-2026", "seed-and-bean-venice-fall-menu-2026"],
    "Port Charlotte": ["hallowbean-halloween-treats-port-charlotte-2026", "brix-coffee-pumpkin-menu-port-charlotte-2026", "goombah-coffee-dessert-lattes-port-charlotte-2026"],
    "Fort Myers": ["banyan-cafe-pumpkin-edison-ford-2026", "savour-coffee-october-specials-fort-myers-2026"],
  };
  for (const [city, ids] of Object.entries(expect)) {
    const food = shelf(city, "food");
    for (const id of ids) assert.ok(food.has(id), `${city} food shelf carries ${id}`);
  }
  assert.ok(!shelf("Naples", "food").has("seed-and-bean-venice-fall-menu-2026"), "a Venice cafe never reaches Naples (negative control)");
});

check("dated rows expire on their published end date; open runs keep their 90-day cap", () => {
  const byId = new Map(FALL_FOOD_GAP_2026_10_08.map((r) => [r.event_id, r]));
  assert.ok(!fallEventLive(byId.get("seed-and-bean-venice-fall-menu-2026"), "2026-11-01"), "Seed & Bean ends October 31");
  assert.ok(!fallEventLive(byId.get("savour-coffee-october-specials-fort-myers-2026"), "2026-11-01"), "Savour specials end October 31");
  assert.ok(fallEventLive(byId.get("bean-trolley-fall-drinks-naples-2026"), "2026-12-15"), "Bean Trolley runs to December 31");
  assert.ok(!fallEventLive(byId.get("bean-trolley-fall-drinks-naples-2026"), "2027-01-01"), "and stops after it");
  assert.ok(!fallEventLive(byId.get("perry-coffee-shop-fall-naples-2026"), "2027-02-01"), "an open run does not live forever");
});

check("the two hidden farms now carry identity, image, real dates and honest geography", () => {
  const byId = new Map(merged.map((r) => [r.event_id, r]));
  const prana = byId.get("fl26-prana-farms-pumpkin-festival-2026");
  const mikes = byId.get("fl26-farmer-mike-s-fall-fest-and-corn-maze-2026");
  for (const row of [prana, mikes]) {
    assert.match(String(row.place_id), /^ChIJ/, `${row.event_id} identity filled at the serve boundary`);
    assert.ok(fallEventCardImageSrc(row, 640, null), `${row.event_id} resolves a card image`);
    assert.ok(isTrusted(row), `${row.event_id} trusted`);
    assert.ok(Array.isArray(row.occurrence_dates) && row.occurrence_dates.length >= 15, `${row.event_id} lists open days`);
  }
  assert.equal(prana.price_min, 10, "Prana $10 admission from the organizer page");
  assert.match(prana.schedule_note, /does not print an exact first and last day/, "Prana's inferred October window is flagged");
  assert.ok(shelf("Port Charlotte", "farms").has(prana.event_id), "Prana reaches Port Charlotte farms");
  assert.ok(shelf("Fort Myers", "farms").has(mikes.event_id) && shelf("Naples", "farms").has(mikes.event_id), "Farmer Mike's reaches Fort Myers and Naples");
  assert.ok(miles([mikes.lat, mikes.lng], CITY["Port Charlotte"]) > FALL_RAIL_RADIUS_MI.farms, "Farmer Mike's is outside Port Charlotte's farm radius");
  assert.ok(!shelf("Port Charlotte", "farms").has(mikes.event_id), "so it never pads Port Charlotte");
});

check("HarvestMoon shows its next real open day, not 'Select dates'", () => {
  const hm = FALL_GAP_FILL_2026_10_07.find((r) => r.event_id === "harvestmoon-fun-farm-fall-2026");
  assert.ok(hm.occurrence_dates.includes("2026-10-12") && !hm.occurrence_dates.includes("2026-10-13"), "Monday Oct 12 open, Tuesday closed");
  assert.ok(hasUpcomingFallOccurrence(hm, "2026-11-02"), "still upcoming before Nov 7");
});

check("Events tab: registry-only rows link to their official page, real pages keep /florida-events", () => {
  const feed = curatedFeedEventsWithFall(HIDDEN, { now: NOW });
  const byId = new Map(feed.map((e) => [String(e.id).replace(/^wfc:/, ""), e]));
  const registryOnly = ["lakes-park-pumpkin-patch-fort-myers-2026", "north-port-pumpkin-plunge-2026", "utc-pumpkin-patch-sarasota-2026", "harvestmoon-fun-farm-fall-2026", "bean-trolley-fall-drinks-naples-2026"];
  for (const id of registryOnly) {
    const e = byId.get(id);
    assert.ok(e, `${id} reaches the Events feed`);
    const d = resolveDestination(e);
    assert.ok(d && !String(d.dest).startsWith("/florida-events/"), `${id} must not link to a page that does not exist (got ${d?.dest})`);
    assert.match(String(d.dest), /^https:\/\//, `${id} links to its official page`);
  }
  const dbBacked = byId.get("fl26-prana-farms-pumpkin-festival-2026");
  assert.ok(dbBacked, "positive control: a database row is in the feed");
  assert.equal(resolveDestination(dbBacked).dest, "/florida-events/prana-farms-pumpkin-festival-2026", "a row with a real page keeps its internal link");
});

console.log(`test-fall-food-gap-2026-10-08: ${n} checks passed`);
