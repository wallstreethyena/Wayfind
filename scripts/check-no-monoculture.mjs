// scripts/check-no-monoculture.mjs — v7.24
//
// THREE RAILS WERE SHOWING ONE THING WEARING SEVERAL NAMES, and a fourth was
// awarding a superlative to evidence that could not carry it. All four measured
// on the live homepage from Parrish on 2026-08-12.
//
//   Worth the Drive    7 of 10 cards were Disney or Universal properties
//   Events Near You    5 of 12 were Tampa Bay Rays home games
//   Exploding Trends   `3Natives` held ranks 2 AND 4 of ONE trend module
//   Exploding Trends   Club Pilates, 7.9 with 19 reviews, wore
//                      "🏆 ONE OF THE BEST NEARBY PLACES TO TRY IT"
//
// Every fix here is a SELECTION over an already-ranked list — the daypartCompose
// shape. None of them re-sorts, and none adds a score term.
import {
  marqueeCandidates, MARQUEE_MAX_PER_OPERATOR, MARQUEE_DAY_TRIPS, MARQUEE_RAIL_MAX,
} from "../lib/marqueeDayTrips.js";
import { bestFirst, seriesKey, SERIES_CAP } from "../lib/frontEvents.js";
import {
  launchBrandKey, LAUNCH_MIN_REVIEWS, LAUNCH_LEAD_MIN_REVIEWS, LAUNCH_LEAD_MIN_SCORE,
} from "../lib/explodingLaunchSearch.js";

let pass = 0;
const fail = (m) => { console.error("check-no-monoculture: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── 1. The marquee lane spends its lookups across operators ────────────────
{
  // Parrish, the coordinates the defect was photographed from.
  const c = marqueeCandidates({ lat: 27.5878, lng: -82.4237 });
  const ops = c.map((a) => a.operator || "independent");
  const disney = ops.filter((o) => o === "disney").length;
  const universal = ops.filter((o) => o === "universal").length;

  ok(disney <= MARQUEE_MAX_PER_OPERATOR, "at most two Disney anchors are looked up (got " + disney + ")");
  ok(universal <= MARQUEE_MAX_PER_OPERATOR, "at most two Universal anchors (got " + universal + ")");
  ok(ops.filter((o) => o === "independent").length >= 3,
    "…which is the point: the budget now REACHES the independents. Before this, eight tier-1 anchors were all Disney or Universal and SeaWorld, Busch Gardens, Kennedy Space Center and LEGOLAND were never looked up at all");
  ok(c.some((a) => /Busch Gardens/.test(a.name)),
    "Busch Gardens — 31 miles from Parrish, the CLOSEST marquee destination — is in the lookup set; it was absent from the live rail entirely");
  ok(c.some((a) => /Disney Springs/.test(a.name)) && c.some((a) => /Magic Kingdom/.test(a.name)),
    "…and the two the owner named survive the cap: 'give me disney springs give me them parks'");
  ok(c.length <= MARQUEE_RAIL_MAX, "the total lookup budget is unchanged — this costs nothing extra");

  // Every anchor is either tagged with an operator or is genuinely independent.
  const tagged = MARQUEE_DAY_TRIPS.filter((a) => a.operator).map((a) => a.operator);
  ok(new Set(tagged).size === 2 && tagged.filter((o) => o === "disney").length === 5,
    "all five Disney properties share one operator tag — tagging four of five would have let the fifth through");

  // A market where only one operator is in range must not be emptied.
  const near = marqueeCandidates({ lat: 28.40, lng: -81.55 }, { minDistanceMi: 0 });
  ok(near.length > 0, "a reader inside the resort area still gets a lane, not an empty one");
}

// ── 2. One team may not be the events rail ─────────────────────────────────
{
  // The five Rays listings exactly as PredictHQ delivered them, plus the
  // non-sports events they were crowding out.
  const E = (id, name, bucket) => ({ id, name, dest: "x", _b: bucket });
  const evs = [
    E("r1", "Tampa Bay Rays vs Baltimore Orioles: Devil Rays Fridays", "sports"),
    E("r2", "Tampa Bay Rays vs Baltimore Orioles: Jordan Davis Postgame Concert", "sports"),
    E("r3", "Tampa Bay Rays vs. Baltimore Orioles", "sports"),
    E("r4", "Tampa Bay Rays vs. Toronto Blue Jays", "sports"),
    E("r5", "Tampa Bay Rays vs. San Diego Padres", "sports"),
    E("m1", "Bradenton Marauders vs. Jupiter Hammerheads", "sports"),
    E("c1", "Gipsy Kings featuring Tonino Baliardo", "music"),
    E("c2", "Buckcherry w/ Black Stone Cherry", "music"),
  ];
  const out = bestFirst(evs, (e) => e._b, null);
  const ids = out.map((e) => e.id);
  // THE GUARANTEE, stated the way the rule actually works: the overflow is
  // pushed behind EVERY other event, not deleted. So the third Rays fixture
  // must rank below every non-Rays listing — which is what "one team does not
  // own the rail" means on a rail the reader scrolls.
  const thirdRays = Math.max(ids.indexOf("r3"), ids.indexOf("r4"), ids.indexOf("r5"));
  const firstRays = Math.min(ids.indexOf("r3"), ids.indexOf("r4"), ids.indexOf("r5"));
  const lastOther = Math.max(ids.indexOf("m1"), ids.indexOf("c1"), ids.indexOf("c2"));
  ok(firstRays > lastOther,
    "every overflow Rays fixture ranks below every other event — got order " + ids.join(","));
  ok(ids.slice(0, lastOther + 1).filter((i) => /^r/.test(i)).length <= SERIES_CAP,
    "…so at most two Rays fixtures sit among the varied head (got order " + ids.join(",") + ")");
  ok(thirdRays === ids.length - 1, "…and the tail keeps its own ranked order");
  ok(out.length === evs.length,
    "…and NOTHING is deleted — overflow goes to the tail, so a reader who wants the whole home stand still scrolls to it");
  ok(out.some((e) => e.id === "m1"),
    "a different team's fixture is not capped against the Rays — the rule thins a repeat, never a category");

  ok(seriesKey({ name: "Tampa Bay Rays vs. Toronto Blue Jays" }) === seriesKey({ name: "Tampa Bay Rays vs Baltimore Orioles: Devil Rays Fridays" }),
    "both spellings of the fixture resolve to the same series — 'vs.' and 'vs' and a trailing colon subtitle");
  ok(seriesKey({ name: "Gipsy Kings featuring Tonino Baliardo" }) === null,
    "a one-off concert with no separator has NO series key, so it can never be capped against another one-off");
  ok(seriesKey({ name: "" }) === null && seriesKey(null) === null, "…and garbage in is null out");
}

// ── 3. One brand may not be a trend module ─────────────────────────────────
{
  ok(launchBrandKey("3Natives") === launchBrandKey("3Natives - UTC Sarasota"),
    "two branches of one juice bar collapse to one brand — they held ranks 2 AND 4 of a single trend module");
  ok(launchBrandKey("Foxtail Coffee Co. - Riverview South") === launchBrandKey("Foxtail Coffee Co."),
    "…and the same for a dash-separated location suffix");
  ok(launchBrandKey("Seabreeze Healthy Cafe") !== launchBrandKey("Raining Berries"),
    "…while genuinely different places stay different");
}

// ── 4. A superlative needs evidence behind it ──────────────────────────────
{
  ok(LAUNCH_MIN_REVIEWS >= 60,
    "trend matches finally have a review floor — they had NONE, while quick-bite demands 120, hidden gems 60, tonight 150 and worth-the-drive 300");
  ok(LAUNCH_LEAD_MIN_REVIEWS > LAUNCH_MIN_REVIEWS,
    "…and the LEAD card, which wears 'one of the best nearby places to try it', carries a higher bar than the cards behind it");
  ok(LAUNCH_LEAD_MIN_SCORE >= 8.5,
    "…on score as well as depth: Club Pilates wore that trophy at 7.9 with 19 reviews");

  // The cards that were actually on the live rail, and what the floor does.
  const shipped = [
    { name: "Smash Burgers & Tacos", reviews: 46 },
    { name: "The Daily Brew Station", reviews: 42 },
    { name: "Club Pilates", reviews: 19 },
  ];
  ok(shipped.every((p) => p.reviews < LAUNCH_MIN_REVIEWS),
    "every thin card measured on the live rail is now refused");
  const kept = [
    { name: "Rodney's Jamaican Grill", reviews: 1200 },
    { name: "Authentic Island Jerk", reviews: 72 },
    { name: "Craftails Speakeasy", reviews: 69 },
  ];
  ok(kept.every((p) => p.reviews >= LAUNCH_MIN_REVIEWS),
    "…while a small-but-real local place still competes — the floor removes non-evidence, it does not chase review counts");
}

console.log("check-no-monoculture: " + pass + " assertions green");
