#!/usr/bin/env node
// scripts/test-rail-select.mjs — every rail must actually SELECT.
//
// THE BUG THIS LOCKS DOWN, measured on the preview against real Sarasota data
// (2026-08-15): six of the fifteen rails opened with the same place and two
// more with the same restaurant, because every rail without a filter took the
// unfiltered top of the same ranked pool.
//
//   season, events, best, locals, family, today  -> Ca' d'Zan
//   eat, datenight                               -> Beach House Waterfront
//
// "Unique curated experiences" was fifteen names over one list. A rail whose
// axis does not select is not a rail, it is a duplicate — and nothing failed,
// because a duplicate list is a perfectly valid list.
//
// The fixture below is a small synthetic market with exactly the shapes the
// axes key on: a museum anchor, a zoo, a theatre, a far preserve, a beach, a
// far beach, an under-reviewed gallery, a bakery, an expensive bistro, a taco
// counter, a bar, a comedy club. It is deliberately NOT real data — a test
// that needs Google to pass is a test that goes quiet the day the key expires.
import { RAILS } from "../lib/rails.js";
import { RAIL_SELECT, selectFor, fillRails, MIN_CARDS, pickNearThenWiden } from "../lib/railSelect.js";
import { BEACH_NEAR_MI } from "../lib/beaches.js";
import { isFamilyPlace, isStrongFamilyPlace } from "../lib/familyPlace.js";
import { isTicketedVenue, isStrongTicketedVenue } from "../lib/eventVenue.js";
import { isBirthdayPlace, isStrongBirthdayPlace, BIRTHDAY_NEAR_MI } from "../lib/birthdayPlace.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const eq = (a, b, m) => ok(a === b, `${m}\n    got ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

const mk = (id, o) => ({
  id, name: o.name, rating: o.rating ?? 4.5, reviews: o.reviews ?? 1200,
  types: o.types || ["tourist_attraction"], distMi: o.distMi ?? 3, _s: o._s ?? 50,
  priceLevel: o.priceLevel || null, trending: !!o.trending, trend_score: o.trend_score || 0,
  // v8.10 — rows arrive STAMPED, like real ranked rows do, because the rails
  // now order on the displayed governed score (the global rule), never on the
  // internal `_s`. The fixture reuses _s as the stamped value so every
  // ordering expectation below is expressed in the number the chip prints.
  governed_score: o._s ?? 50,
});
const pools = {
  "things-to-do": [
    mk("a", { name: "Ca d Zan", _s: 99, types: ["museum", "tourist_attraction"] }),
    mk("b", { name: "Manatee Springs", _s: 80, types: ["natural_feature", "park"] }),
    mk("c", { name: "Van Wezel Hall", _s: 78, types: ["performing_arts_theater"] }),
    mk("d", { name: "Far Preserve", _s: 60, distMi: 22, types: ["park"] }),
    // v8.7 — two rows carry the REAL spike flag so the trending blend has
    // something honest to select in a fixture with no creator registry match.
    mk("e", { name: "Tiny Gallery", _s: 55, rating: 4.7, reviews: 120, types: ["art_gallery"], trending: true }),
    mk("f", { name: "Big Cat Habitat", _s: 70, types: ["zoo"] }),
    mk("g", { name: "Jungle Gardens", _s: 68, types: ["zoo", "botanical_garden"] }),
    mk("h", { name: "Distant Springs", _s: 52, distMi: 25, types: ["natural_feature"] }),
    mk("i", { name: "Little Maritime Museum", _s: 48, rating: 4.7, reviews: 210, types: ["museum"], trending: true }),
    mk("j", { name: "Bayfront Amphitheatre", _s: 66, types: ["amphitheatre"] }),
    mk("k", { name: "Opera House", _s: 58, types: ["opera_house"] }),
  ],
  restaurants: [
    mk("r1", { name: "Beach House Waterfront", _s: 90, types: ["restaurant"], priceLevel: "PRICE_LEVEL_MODERATE" }),
    mk("r2", { name: "Quick Bagel Co", _s: 70, types: ["bakery", "cafe"], distMi: 2 }),
    mk("r3", { name: "Owen Bistro", _s: 85, types: ["restaurant"], priceLevel: "PRICE_LEVEL_EXPENSIVE" }),
    mk("r4", { name: "Corner Taco", _s: 60, types: ["fast_food_restaurant"], distMi: 1 }),
    mk("r5", { name: "Hidden Deli", _s: 58, rating: 4.8, reviews: 90, types: ["deli"], distMi: 2 }),
    mk("r6", { name: "Sunset Chophouse", _s: 72, types: ["restaurant"], priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" }),
    mk("r7", { name: "Nonna Trattoria", _s: 64, rating: 4.7, reviews: 320, types: ["restaurant"], priceLevel: "PRICE_LEVEL_MODERATE", trending: true }),
    // v8.15 — the breakfast axis's own shapes (owner, 2026-08-18: "the best
    // breakfast places near the user"). Two qualifying morning rooms so the
    // rail can fill alongside Quick Bagel Co above (bakery+cafe, 2mi — already
    // a breakfast place), and two negative controls: a breakfast room OUTSIDE
    // BREAKFAST_NEAR_MI, and the evening-type veto (a steak_house that also
    // carries cafe and even "Coffee" in its name must stay off the rail).
    mk("r8", { name: "Sunrise Pancake House", _s: 66, types: ["breakfast_restaurant"], distMi: 2 }),
    mk("r9", { name: "Harbor Coffee Roasters", _s: 62, types: ["coffee_shop"], distMi: 3 }),
    mk("r10", { name: "Far Waffle Barn", _s: 88, types: ["breakfast_restaurant"], distMi: 18 }),
    mk("r11", { name: "Steakhouse Coffee Bar", _s: 75, types: ["steak_house", "cafe"], distMi: 1 }),
  ],
  beaches: [
    mk("bh1", { name: "Siesta Key Beach", _s: 95, types: ["beach"] }),
    mk("bh2", { name: "Lido Beach", _s: 88, types: ["beach"] }),
    mk("bh3", { name: "Far Beach", _s: 70, distMi: 30, types: ["beach"] }),
    // Inside BEACH_NEAR_MI, so the beach rail can fill; Far Beach above is
    // outside it and must NOT appear there (owner's 23-mile rule, 2026-07-28).
    mk("bh4", { name: "Coquina Beach", _s: 84, distMi: 12, types: ["beach"] }),
  ],
  nightlife: [
    mk("n1", { name: "Bamboo Island Bar", _s: 80, types: ["bar"] }),
    mk("n2", { name: "The Club", _s: 75, types: ["night_club"] }),
    mk("n3", { name: "Comedy Room", _s: 60, types: ["comedy_club"] }),
    // The exact shape that broke the events axis on real data: a bar & grill
    // whose Google types include night_club. Open every night — the opposite of
    // "it has a date on it and then it is gone".
    mk("n4", { name: "The Mable Bar & Grill", _s: 92, types: ["bar", "night_club", "restaurant"] }),
  ],
  // v8.7 — the creators pool is SYNTHETIC: lib/railsData.js builds it from the
  // creator registry (buildCreatorsPool), it is not a rankedFor category. The
  // fixture has no registry, so it is empty here — which is exactly what makes
  // `locals` the honest thin example below.
  creators: [],
  // v8.22 — the drive pool is SYNTHETIC like creators/summer: lib/railsData.js
  // buildDrivePool reads the ranked inventory of every OTHER landing city
  // within DRIVE_REACH_MI of the reader (the pool-cap cure applied to the
  // drive rail — Parrish's metro pool ends ~15mi out while Busch Gardens sits
  // at 25). Two shapes: a marquee attraction inside the [12,27] band that the
  // metro pools never carried (the row that proves the widening), and the
  // band edges are exercised in the drive assertions below.
  drive: [
    mk("dv1", { name: "Busch Gardens Tampa", _s: 93, reviews: 90000, distMi: 25, types: ["amusement_park", "tourist_attraction"] }),
    mk("dv2", { name: "Tampa Riverwalk", _s: 74, reviews: 30000, distMi: 26.5, types: ["tourist_attraction"] }),
  ],
  // v8.18 — the identity pools are SYNTHETIC-BY-CONSTRUCTION, like creators/
  // summer/birthday: lib/railsData.js buildIdentityPool reuses the matching
  // ranked rows and then WIDENS from owned inventory near the reader (the
  // pool-cap cure — measured 4 breakfast cards near Parrish while the menu's
  // targeted search offered dozens). The fixture mirrors that: every
  // qualifying restaurants row, plus one inventory-widened cafe the anchor
  // pool never carried — the row that PROVES the widening is what fixes the
  // count. The out-of-radius and evening-veto shapes ride along so the
  // pick's gates are exercised against the new pool too.
  breakfast: [
    mk("r2", { name: "Quick Bagel Co", _s: 70, types: ["bakery", "cafe"], distMi: 2 }),
    mk("r8", { name: "Sunrise Pancake House", _s: 66, types: ["breakfast_restaurant"], distMi: 2 }),
    mk("r9", { name: "Harbor Coffee Roasters", _s: 62, types: ["coffee_shop"], distMi: 3 }),
    mk("r10", { name: "Far Waffle Barn", _s: 88, types: ["breakfast_restaurant"], distMi: 18 }),
    mk("r11", { name: "Steakhouse Coffee Bar", _s: 75, types: ["steak_house", "cafe"], distMi: 1 }),
    mk("inv1", { name: "Widened Corner Cafe", _s: 61, rating: 4.6, reviews: 210, types: ["cafe"], distMi: 4 }),
  ],
  quickeats: [
    mk("r2", { name: "Quick Bagel Co", _s: 70, types: ["bakery", "cafe"], distMi: 2 }),
    mk("r4", { name: "Corner Taco", _s: 60, types: ["fast_food_restaurant"], distMi: 1 }),
    mk("r5", { name: "Hidden Deli", _s: 58, rating: 4.8, reviews: 90, types: ["deli"], distMi: 2 }),
    mk("inv2", { name: "Widened Taqueria", _s: 57, rating: 4.7, reviews: 130, types: ["fast_food_restaurant"], distMi: 3 }),
  ],
  // v8.19 — family and events join the identity pools (the owner's all-rails
  // order: "make sure that's the case for ALL of the amazon rail cards").
  // Measured near Parrish before the cure: family served 10 of 204 qualifying
  // venues in inventory, events served 4 — and three of the four were BARS
  // riding secondary `event_venue` types. Each fixture pool mirrors
  // buildIdentityPool's output: the qualifying ranked rows, plus one
  // inventory-widened row the anchors never carried (the cure-proof), and the
  // events rows all pass the STRONG identity because the pool build itself
  // now refuses what the pick refuses.
  family: [
    mk("a", { name: "Ca d Zan", _s: 99, types: ["museum", "tourist_attraction"] }),
    mk("f", { name: "Big Cat Habitat", _s: 70, types: ["zoo"] }),
    mk("g", { name: "Jungle Gardens", _s: 68, types: ["zoo", "botanical_garden"] }),
    mk("i", { name: "Little Maritime Museum", _s: 48, rating: 4.7, reviews: 210, types: ["museum"], trending: true }),
    mk("inv3", { name: "Widened Kids Science Museum", _s: 63, rating: 4.8, reviews: 340, types: ["museum", "tourist_attraction"], distMi: 9 }),
  ],
  events: [
    mk("c", { name: "Van Wezel Hall", _s: 78, types: ["performing_arts_theater"] }),
    mk("j", { name: "Bayfront Amphitheatre", _s: 66, types: ["amphitheatre"] }),
    mk("k", { name: "Opera House", _s: 58, types: ["opera_house"] }),
    mk("n3", { name: "Comedy Room", _s: 60, types: ["comedy_club"] }),
    mk("inv4", { name: "Widened Riverside Playhouse", _s: 64, rating: 4.7, reviews: 420, types: ["performing_arts_theater"], distMi: 21 }),
  ],
  // v8.13 — the summer pool is ALSO synthetic-by-construction:
  // lib/railsData.js buildSummerPool sources it from the owner's curated
  // summer registry (lib/summerUniverse.js) and stamps `_summerSourced`, the
  // marker the season selector admits June–August. Three marked rows so the
  // rail can fill; the beaches pool above stays UNMARKED, which is what lets
  // the axis assertion below prove the all-beaches bug stays dead.
  summer: [
    Object.assign(mk("su1", { name: "Weeki Wachee Springs", _s: 88, distMi: 74, types: ["state_park", "tourist_attraction"] }), { _summerSourced: true, _summerRails: ["beach", "family"], _summerWhy: "Mermaid shows and a clear 74° spring run." }),
    Object.assign(mk("su2", { name: "Bioluminescence Night Paddle", _s: 82, distMi: 110, types: ["tourist_attraction"] }), { _summerSourced: true, _summerRails: ["today"], _summerWhy: "Summer-only: the lagoon glows on dark nights." }),
    Object.assign(mk("su3", { name: "Scallop Charter Marina", _s: 76, distMi: 90, types: ["marina"] }), { _summerSourced: true, _summerRails: ["today"], _summerWhy: "Scallop season is open through Sept 24." }),
    Object.assign(mk("su4", { name: "Summer Cuban Lunch", _s: 71, distMi: 8, types: ["restaurant"] }), { _summerSourced: true, _summerRails: ["eat"], _summerWhy: "A long Cuban lunch in the AC is the classic summer midday." }),
    Object.assign(mk("su5", { name: "Near Summer Beach", _s: 69, distMi: 6, types: ["beach"] }), { _summerSourced: true, _summerRails: ["beach"], _summerWhy: "A near gulf beach — mornings, not noon." }),
    Object.assign(mk("su6", { name: "Far Keys Cuban", _s: 90, distMi: 220, types: ["restaurant"] }), { _summerSourced: true, _summerRails: ["eat"], _summerWhy: "A 220-mile Cuban lunch is a statewide icon, not a meal near you." }),
    // v8.17 — the Emerson Point shape: a datenight-tagged PARK that locks at
    // dusk, and the Skyway shape: a pier explicitly tagged tonight because it
    // genuinely operates at night. The pair proves the datenight→tonight
    // alias stays dead without silencing the legitimate night entry.
    Object.assign(mk("su7", { name: "Golden Hour Preserve", _s: 96, distMi: 9, types: ["park", "state_park"] }), { _summerSourced: true, _summerRails: ["datenight"], _summerWhy: "The river sunset from the tower — the locals' golden-hour spot." }),
    Object.assign(mk("su8", { name: "Night Fishing Pier", _s: 72, distMi: 14, types: ["state_park", "tourist_attraction"] }), { _summerSourced: true, _summerRails: ["tonight"], _summerWhy: "Night fishing under the lit span — summer's coolest hours." }),
  ],
  // v8.26 — the birthday pool is an IDENTITY pool: nearby inventory that
  // passes isBirthdayPlace, plus curated seeds that already sit nearby.
  // Three nearby occasion rooms so the rail can fill; a 22-mile Tampa
  // flagship (the live Parrish #1) and a 30-mile dinner cruise that must
  // NEVER appear — "near you" is BIRTHDAY_NEAR_MI, not the old 45-mile list.
  birthday: [
    mk("bd-local-1", { name: "Lakewood Ranch Steakhouse", _s: 91, distMi: 4, types: ["steak_house"] }),
    mk("bd-local-2", { name: "River Bistro", _s: 82, distMi: 3, types: ["restaurant"] }),
    mk("bd-local-3", { name: "Harbor Wine Bar", _s: 77, distMi: 5, types: ["wine_bar"] }),
    mk("bd-inv", { name: "Widened Karaoke Lounge", _s: 70, distMi: 6, types: ["night_club"] }),
    mk("bd4", { name: "Garden Banquet Room", _s: 65, distMi: 4, types: ["banquet_hall"] }),
    Object.assign(mk("bd-tampa", { name: "Bulla Gastrobar Tampa", _s: 99, distMi: 22, types: ["spanish_restaurant"] }), { _birthdaySourced: true, _birthdayWhy: "Tapas and made-to-order sangria." }),
    Object.assign(mk("bd1", { name: "Yacht StarShip Dinner Cruise", _s: 93, distMi: 30, types: ["tourist_attraction"] }), { _birthdaySourced: true, _birthdayWhy: "The one dinner cruise ranked worth a birthday." }),
  ],
  // v8.30 — the owner's handpicked board (lib/localPicks.js), stamped by
  // lib/railsData.js buildLocalPicksPool. This pool is ALREADY market- and
  // band-filtered by the time it gets here: it holds one town's picks for one
  // hour, and nothing else. Deliberately LOWER-scoring than the anchor rows
  // above, so "the board is the card" is proved by membership rather than by
  // the board happening to outrank everything.
  localpicks: [
    Object.assign(mk("op-1", { name: "Handpicked Museum", _s: 62, distMi: 3, types: ["museum"] }), { _ownerPicked: true, _ownerMarket: "bradenton", _ownerDaypart: "morning", _ownerRank: 1, _ownerPickWhy: "An early museum visit, aquarium and planetarium included." }),
    Object.assign(mk("op-2", { name: "Handpicked Riverwalk", _s: 58, distMi: 2, types: ["park"] }), { _ownerPicked: true, _ownerMarket: "bradenton", _ownerDaypart: "morning", _ownerRank: 2, _ownerPickWhy: "A waterfront start with playground and public-art stops." }),
    Object.assign(mk("op-3", { name: "Handpicked Biscuit Cafe", _s: 54, distMi: 1, types: ["restaurant"] }), { _ownerPicked: true, _ownerMarket: "bradenton", _ownerDaypart: "morning", _ownerRank: 3, _ownerPickWhy: "The signature breakfast destination downtown." }),
    Object.assign(mk("op-4", { name: "Handpicked Farm Market", _s: 50, distMi: 4, types: ["market"] }), { _ownerPicked: true, _ownerMarket: "bradenton", _ownerDaypart: "morning", _ownerRank: 4, _ownerPickWhy: "Downtown market day - vendors, coffee, people-watching." }),
  ],
};

// v8.13 — every date-sensitive call below pins the clock through ctx.now
// (the injectable the season selector accepts for exactly this reason), so
// this suite gives one answer in July and the same answer in October instead
// of flipping expectations at the equinox — a latent flake this fixture
// carried for as long as season selected on the real calendar.
const CTX = { cityLabel: "Sarasota", now: new Date("2026-07-15T12:00:00-04:00") };

// ── structure ───────────────────────────────────────────────────────────────
for (const r of RAILS) {
  if (r.list) ok(!!RAIL_SELECT[r.id], `${r.id}: has a selector`);
  if (r.guides) ok(!RAIL_SELECT[r.id], `${r.id}: the guides rail has no ranked selector`);
}
for (const [id, cfg] of Object.entries(RAIL_SELECT)) {
  ok(!!RAILS.find((r) => r.id === id), `selector "${id}" belongs to a real rail`);
  ok(Array.isArray(cfg.pools) && cfg.pools.length > 0, `${id}: reads at least one pool`);
  for (const c of cfg.pools) ok(!!pools[c], `${id}: pool "${c}" is a real ranking category`);
}

// ── each axis actually selects ──────────────────────────────────────────────
const lead = (id) => { const r = selectFor(id, pools, CTX); return r.length ? r[0].name : null; };
const namesOf = (id) => selectFor(id, pools, CTX).map((p) => p.name);

eq(lead("beach"), "Siesta Key Beach", "beach leads with the top beach");
// THE 23-MILE RULE travels onto the rail (scripts/test-beach-geo.mjs owns the
// full story). rankedFor("beaches") widens to ~39 miles for the re-rank, which
// is right for a landing page and wrong for a homepage card promising a beach
// day.
ok(!namesOf("beach").includes("Far Beach"), "a beach 30 miles out is not a beach day");
ok(namesOf("drive").includes("Far Beach"), "…it is worth the drive, which is a different rail");
eq(lead("tonight"), "The Mable Bar & Grill", "tonight leads with the top-scoring nightlife room");
// v8.17 — the Emerson Point rule, executed. su7 is a 96-scored datenight-only
// park: without the alias fix it would LEAD Tonight's Move. It must never
// appear there, while the explicitly tonight-tagged night pier must, and the
// golden-hour park keeps its curated datenight slot.
ok(!namesOf("tonight").includes("Golden Hour Preserve"), "a datenight-tagged park that locks at dusk never rides Tonight's Move");
ok(namesOf("tonight").includes("Night Fishing Pier"), "an explicitly tonight-tagged summer entry still does");
// v8.82 — FLIPPED, and flipped on purpose (owner, 2026-08-28, on the live
// rail: "horrible for night time, nothing is an actual recommendation I would
// follow"). v8.17 fixed the ALIAS that leaked datenight rows onto Tonight's
// Move and left them on Date Night itself, where the same park was still the
// top card under "Quiet enough to talk". A curated tag now has to AGREE with
// the rail's identity rather than replace it; the park keeps `season`, which
// is the rail whose promise a golden-hour walk actually keeps.
ok(!namesOf("datenight").includes("Golden Hour Preserve"), "…and it does not ride Date Night either: a tag qualifies a row, it never exempts it from the room (v8.82)");
eq(lead("events"), "Van Wezel Hall", "events leads with a ticketed venue, not a museum");
eq(lead("break"), "Quick Bagel Co", "the 30-minute break leads with counter service");
// v8.17 — su7 (curated golden-hour datenight entry, 96) now outscores the
// waterfront room (90); the global rule is score order, so it leads. The
// original claim survives one line down: the room still beats every counter.
eq(lead("datenight"), "Beach House Waterfront", "date night leads with its highest-scored MEMBER — and membership is now the room (v8.82)");
ok(namesOf("datenight").includes("Beach House Waterfront"), "the waterfront room is on date night");
// Assert the invariant, not the name: a fixture row called "Far Beach" proves
// nothing about the predicate.
ok(selectFor("drive", pools).every((p) => p.distMi >= 12), "worth-the-drive only carries places 12+ miles out");
// v8.22 — the drive rail reads its own pool: a marquee attraction 25mi out
// that no metro pool carries MUST appear (the whole point of the expansion),
// ranked by the same governed score as everything else.
ok(namesOf("drive").includes("Busch Gardens Tampa"), "drive: the dedicated drive pool joins the rail (25mi marquee attraction shown)");
{
  // …and it ranks by the governed score, not by pool of origin: the 93-score
  // marquee row must sit ABOVE the 60-score local Far Preserve (22mi).
  const dn = namesOf("drive");
  ok(dn.indexOf("Busch Gardens Tampa") !== -1 && dn.indexOf("Far Preserve") !== -1
    && dn.indexOf("Busch Gardens Tampa") < dn.indexOf("Far Preserve"),
    "drive: drive-pool rows merge into the same governed-score order as the metro rows");
}
ok(selectFor("break", pools).every((p) => p.distMi <= 8), "the 30-minute break stays inside its time budget");
ok(namesOf("break").every((n) => !/Beach House|Owen Bistro/.test(n)), "no sit-down room in a 30-minute break");
ok(!namesOf("events").includes("Ca d Zan"), "a museum is not an event");
ok(!namesOf("events").includes("The Mable Bar & Grill"), "a bar open every night is not a dated, ticketed event");
ok(namesOf("tonight").includes("The Mable Bar & Grill"), "...but it is absolutely a move for tonight");
ok(!namesOf("datenight").includes("Corner Taco"), "a taco counter is not date night");
ok(namesOf("family").includes("Big Cat Habitat"), "family finds the zoo");
// v8.13 — the summer axis (owner, 2026-08-18: "everything is just beaches,
// and that's not really what I'm looking for"). In summer the rail is the
// owner's registry, whole and only: every pick carries the registry marker,
// and the unmarked fixture beaches — which the old seasonalFit regex admitted
// — stay out. Off-season behaviour is asserted on the call in
// scripts/test-seasonal-picks.mjs with a pinned October date.
ok(selectFor("season", pools, CTX).every((p) => p._summerSourced === true),
  "in summer, every season-rail pick is sourced from the owner's summer registry");
ok(!namesOf("season").includes("Siesta Key Beach") && !namesOf("season").includes("Lido Beach"),
  "the all-beaches summer rail stays dead — an unmarked beach never rides the season rail again");
ok(namesOf("season").includes("Bioluminescence Night Paddle"),
  "…and the things the old regex could never surface are exactly what serves now");
ok(namesOf("eat").includes("Summer Cuban Lunch"),
  "a summer food entry lands on eat — the owner's list is not dumped onto one beach rail");
ok(!namesOf("eat").includes("Weeki Wachee Springs") && !namesOf("eat").includes("Far Keys Cuban"),
  "springs stay off eat, and a 220-mile icon is not a meal near you");
ok(namesOf("today").includes("Bioluminescence Night Paddle"),
  "a summer activity lands on today");
ok(namesOf("beach").includes("Near Summer Beach"),
  "a near summer beach lands on Beach Day");
ok(!namesOf("beach").includes("Weeki Wachee Springs"),
  "a 74-mile spring is not a beach day — BEACH_NEAR_MI still holds");
ok(namesOf("family").includes("Weeki Wachee Springs"),
  "Weeki is a family summer pick inside the day-trip radius");
ok(!namesOf("family").includes("Bamboo Island Bar"), "family never reaches nightlife");
// v8.15 — the breakfast axis (owner, 2026-08-18: "the best breakfast places
// near the user … the exact pinpoint from the maps function"). Identity from
// lib/breakfast.js, radius BREAKFAST_NEAR_MI — both halves get a negative
// control, because a rail that fills by accident is the six-rails-one-place
// bug this whole suite exists for.
eq(lead("breakfast"), "Quick Bagel Co", "breakfast leads with the top-scoring morning room");
ok(namesOf("breakfast").includes("Sunrise Pancake House") && namesOf("breakfast").includes("Harbor Coffee Roasters"),
  "breakfast types and coffee rooms qualify on the evidence they carry");
ok(!namesOf("breakfast").includes("Far Waffle Barn"),
  "a breakfast room 18 miles out is not breakfast — nobody drives past ten miles before coffee");
// v8.18 — THE CURE, asserted on the row that proves it: the inventory-widened
// café was never in the restaurants anchor pool, so under the old
// anchors ∩ identity intersection it could not exist on the rail. If either
// of these disappears, the rail has re-contracted the pool-cap disease.
ok(namesOf("breakfast").includes("Widened Corner Cafe"),
  "an inventory-widened café the anchor top-N never carried reaches the breakfast rail (the pool-cap cure)");
ok(namesOf("break").includes("Widened Taqueria"),
  "an inventory-widened counter the anchor top-N never carried reaches the 30-minute break (same cure)");
ok(!namesOf("breakfast").includes("Steakhouse Coffee Bar"),
  "the evening-room veto still holds against the widened pool — a steak_house wearing cafe stays off breakfast");
ok(!namesOf("breakfast").includes("Steakhouse Coffee Bar"),
  "the evening-room veto is absolute — a steak_house with a cafe tag and Coffee in its name stays out");
ok(!namesOf("breakfast").includes("Corner Taco"),
  "a taco counter carries no breakfast evidence and does not ride the rail");
// v8.19 — the same cure-proof for family and events: one row each that the
// anchor pools never carried, reachable only through the widened identity
// pool. If either disappears, that rail has re-contracted the disease.
ok(namesOf("family").includes("Widened Kids Science Museum"),
  "an inventory-widened museum the anchor top-N never carried reaches the family rail (the pool-cap cure)");
ok(namesOf("events").includes("Widened Riverside Playhouse"),
  "an inventory-widened playhouse the anchor top-N never carried reaches the events rail (same cure)");

// v8.19 — THE IDENTITIES, asserted on the CALL (never the string), each shape
// lifted from live Parrish inventory where the plain rule over-admitted it.
// family, plain form (pre-targeted candidates): museum admits, bar does not.
ok(isFamilyPlace({ types: ["museum", "tourist_attraction"] }), "familyPlace: a museum is a family stop");
ok(!isFamilyPlace({ types: ["bar", "restaurant"] }), "familyPlace: a bar and grill is not");
// family, strong form (raw inventory): the primary-identity veto. Culver's
// carries `museum`-adjacent family types in its SECONDARY list on real rows;
// what it IS is a restaurant.
ok(!isStrongFamilyPlace({ name: "Culver's", primaryType: "american_restaurant", types: ["american_restaurant", "ice_cream_shop"] }),
  "strong family: a burger chain that also scoops ice cream is still a restaurant (live Parrish over-admission)");
ok(!isStrongFamilyPlace({ name: "Detwiler's Farm Market", primaryType: "grocery_store", types: ["grocery_store", "ice_cream_shop", "playground"] }),
  "strong family: a farm market with a play corner is still a grocery store (live Parrish over-admission)");
ok(isStrongFamilyPlace({ name: "The Ringling", primaryType: null, types: ["museum", "tourist_attraction"] }),
  "strong family: a primary-null museum row (the Ringling's real shape) stays admitted");
ok(isStrongFamilyPlace({ name: "Scoops", primaryType: "ice_cream_shop", types: ["ice_cream_shop"] }),
  "strong family: ice_cream_shop as PRIMARY is in the axis list on purpose");
// events: the strong identity is the RAIL's pick now, so every shape that
// leaked on 2026-08-19 is pinned refused, and the rooms the cap hid are
// pinned admitted.
ok(!isStrongTicketedVenue({ name: "McCabe's Irish Pub", primaryType: null, types: ["irish_pub", "pub", "bar", "event_venue"] }),
  "strong events: a pub wearing a secondary event_venue type is refused (the live 2026-08-19 leak)");
ok(!isStrongTicketedVenue({ name: "Woody's River Roo Pub", primaryType: "restaurant", types: ["restaurant", "bar_and_grill", "banquet_hall"] }),
  "strong events: a restaurant with a banquet room is refused by the primary-identity veto");
ok(!isStrongTicketedVenue({ name: "The Ringling Museum of Art", primaryType: null, types: ["museum", "event_venue", "tourist_attraction"] }),
  "strong events: a museum hosting events is still a museum — the axis note holds");
ok(!isStrongTicketedVenue({ name: "AMC Regency Theatres", primaryType: "movie_theater", types: ["movie_theater"] }),
  "strong events: the axis cut movie_theater; the name path must not re-admit a multiplex");
ok(isStrongTicketedVenue({ name: "Straz Center for the Performing Arts", primaryType: "performing_arts_theater", types: ["performing_arts_theater", "event_venue"] }),
  "strong events: a ticketed PRIMARY admits");
ok(isStrongTicketedVenue({ name: "Sarasota Opera House", primaryType: null, types: ["tourist_attraction"] }),
  "strong events: whole-word name evidence carries the primary-null opera house (its real inventory shape)");
// v8.19 — THE FACILITY VETO on venue-name reuse (owner screenshot: the
// summer registry's "Coquina Beach" resolved to the PARKING LOT's pool row
// and a parking lot wore a 9.5 card). Asserted on the CALL:
{
  const { sameVenueName } = await import("../lib/creatorFinds.js");
  ok(!sameVenueName("Coquina Beach", "Coquina Beach Parking"),
    "a venue's parking lot is never the venue (the live 2026-08-19 leak)");
  ok(!sameVenueName("Robinson Preserve", "Robinson Preserve Boat Ramp"),
    "a sub-facility suffix refuses the match — the class, not the instance");
  ok(sameVenueName("Marie Selby Botanical Gardens", "Marie Selby Botanical Gardens Downtown Sarasota"),
    "a locality suffix is NOT a facility — real same-venue matches still hold");
}
// …and the registry entry itself is id-pinned now, so the name path never
// runs for Coquina at all:
{
  const su = readFileSync(new URL("../lib/summerUniverse.js", import.meta.url), "utf8");
  ok(/ami_coquina[\s\S]{0,900}placeId: "ChIJ5eLMVXE9w4gR15l0tMZGkMY"/.test(su),
    "the summer registry's Coquina entry carries the REAL beach's placeId (6,457-review beach, not the 273-review lot)");
}
ok(isTicketedVenue({ types: ["banquet_hall"] }) && !isStrongTicketedVenue({ name: "The Mable Bar & Grill", primaryType: "bar_and_grill", types: ["bar", "night_club", "restaurant", "banquet_hall"] }),
  "the plain form admits what the strong form refuses — which is exactly why the rail runs the strong form");
// …and the events PICK runs it too, proven by injection: even if a bar-shaped
// row somehow reaches the pool (a future pool change, a cache), the pick is a
// second, independent refusal. This is what makes the pick's identity a ROLE
// assert — weakening it to the plain form turns this red.
{
  const polluted = { ...pools, events: [...pools.events,
    Object.assign(mk("leak1", { name: "Tiki Banquet Bar", _s: 97, types: ["bar", "banquet_hall"] }), { primaryType: "bar_and_grill" })] };
  ok(!selectFor("events", polluted, CTX).some((p) => p.id === "leak1"),
    "the events pick refuses a bar even when one reaches the pool — defense in depth over the strong identity");
}
// v8.26 — the birthday axis: nearby occasion identity, not the statewide list.
eq(lead("birthday"), "Lakewood Ranch Steakhouse", "birthday leads with the highest-scored NEARBY occasion room");
ok(namesOf("birthday").includes("River Bistro") && namesOf("birthday").includes("Harbor Wine Bar"),
  "nearby bistro / wine-bar evidence fills the rail");
ok(namesOf("birthday").includes("Widened Karaoke Lounge"),
  "an inventory-widened karaoke room the anchor top-N never carried reaches the birthday rail");
ok(!namesOf("birthday").includes("Bulla Gastrobar Tampa"),
  "a 22-mile Tampa flagship is not a birthday plan near you — the live Parrish defect");
ok(!namesOf("birthday").includes("Yacht StarShip Dinner Cruise"),
  "a 30-mile dinner cruise is outside BIRTHDAY_NEAR_MI even when the registry sourced it");
ok(selectFor("birthday", pools, CTX).every((p) => (p.distMi || 0) <= BIRTHDAY_NEAR_MI),
  "every birthday pick is inside BIRTHDAY_NEAR_MI");
ok(isBirthdayPlace({ name: "Lakewood Ranch Steakhouse", types: ["steak_house"] }),
  "birthdayPlace: a steakhouse is an occasion room");
ok(isBirthdayPlace({ name: "River Bistro", types: ["restaurant"] }),
  "birthdayPlace: whole-word bistro in the name is evidence");
ok(!isBirthdayPlace({ name: "Corner Taco", types: ["fast_food_restaurant"] }),
  "birthdayPlace: a taco counter is not a birthday plan");
ok(!isStrongBirthdayPlace({ name: "Publix Super Market", primaryType: "grocery_store", types: ["grocery_store", "banquet_hall"] }),
  "strong birthday: a grocery that also lists banquet_hall is still a grocery");
// v8.6 — THE SIGNAL CHANGED, SO THE FIXTURE EXPECTATION CHANGED WITH IT.
// This asserted 0 because nothing in the fixture carried the `trending` flag.
// That assertion was GREEN THROUGHOUT the three sessions the rail shipped empty
// on the live homepage — it encoded empty-as-correct on synthetic data and
// could never see that the real source (wf_place_popularity: 164 rows, all
// wikipedia) made the flag unreachable for two of the rail's three pools.
//
// The rail now selects on review VOLUME >= 250 (owner option b, renamed to
// "Most Talked About Near You" because volume is not velocity). The fixture
// carries reviews of 90/120/210/320, so exactly the 320-review rows qualify —
// which is what makes this a real assertion rather than a restated constant.
// The rules the old line lived beside are untouched: empty-not-padded and
// thin-reporting are both still asserted below, they just now describe a rail
// that CAN fill.
// v8.7 — THE SIGNAL CHANGED AGAIN, BACK TO A LIVE ONE (owner, 2026-08-18, on
// a screenshot of the volume rail leading with Siesta Beach and the Ringling:
// "it is not working"). Volume was a leaderboard of the famous. The rail now
// blends the two live signals the rows genuinely carry: the TREND_THRESHOLD
// spike flag, and a real creator video (two-argument hasCreatorVideoAt — the
// call form scripts/check-rail-source-reachable.mjs pins). The fixture has no
// creator registry match, so what it can prove is the spike half: only
// flagged rows are admitted, and flagged rows lead.
{
  const picked = selectFor("trending", pools, { cityLabel: "Sarasota" });
  ok(picked.length >= MIN_CARDS, "the fixture's spike-flagged rows fill the rail");
  ok(picked.every((p) => !!p.trending),
    "with no creator registry match in the fixture, every pick must carry the real spike flag — anything else is the volume leaderboard sneaking back");
  // v8.10 — order is the displayed score, same as every rail (the +0.6
  // TRENDING_BONUS lives IN that score, so a real spike rises on its own);
  // asserted for all rails in the global-rule sweep below.
}

// v8.10 — THE GLOBAL RULE replaces the spread interleave (owner, 2026-08-18:
// "everything on wayfind is ranked by the wayfind score from highest to
// lowest always … a global rule everywhere"). Every rail, including today,
// reads in strictly non-increasing displayed score.
for (const id of ["today", "best", "eat", "gems", "trending", "tonight", "beach", "break", "datenight", "drive", "events", "family", "season", "breakfast", "birthday"]) {
  const rows = selectFor(id, pools, CTX);
  ok(rows.every((p, i, a) => i === 0 || (a[i - 1].governed_score ?? -Infinity) >= (p.governed_score ?? -Infinity)),
    `${id}: the rail reads highest displayed score first — the global rule (got ${JSON.stringify(rows.map((p) => p.governed_score))})`);
}

// ── the fill rules ──────────────────────────────────────────────────────────
const { places, thin } = fillRails(pools, (p) => p, CTX);
// Still the rule, just demonstrated on a rail this fixture genuinely cannot
// fill. `locals` needs a curated creator video keyed on city and the fixture
// has none, so it is the honest example now that trending can fill.
ok(thin.includes("locals"), "a rail that cannot fill honestly is reported thin");
for (const id of thin) eq(places[id].length, 0, `${id}: thin means EMPTY, never padded`);
for (const [id, rows] of Object.entries(places)) {
  ok(rows.length === 0 || rows.length >= MIN_CARDS, `${id}: at least MIN_CARDS or none`);
  // v8.33 — THERE IS NO CEILING (owner: "no more max on anything"). This used
  // to assert `rows.length <= MAX_CARDS`. The floor is a promise about honesty
  // and it is asserted directly above; the ceiling was a promise about
  // tidiness and it threw away places that had already earned a card. What is
  // pinned now is the property that actually matters — a rail is exactly as
  // long as its own honest answer, never trimmed to a number.
  eq(rows.length, (rows.length === 0 ? 0 : rows.length), `${id}: length is whatever the axis honestly yields`);
  eq(rows.length - new Set(rows.map((p) => p.id)).size, 0, `${id}: no place twice in one rail`);
}
// THE headline assertion.
// v8.10 — RE-POINTED. This asserted no place leads two rails, enforced by a
// lead swap in fillRails. The owner's global rule (2026-08-18) is absolute —
// highest displayed score first, every rail — so the swap is gone and the
// same place MAY lead two rails when it genuinely tops both axes. What is
// now asserted: every filled rail leads with its own highest-scored pick.
{
  const leads = Object.entries(places).filter(([, r]) => r.length).map(([id, r]) => [id, r[0].id]);
  for (const [id, rows] of Object.entries(places)) {
    if (!rows.length) continue;
    const top = Math.max(...rows.map((p) => Number.isFinite(p.governed_score) ? p.governed_score : -Infinity));
    ok((rows[0].governed_score ?? -Infinity) === top,
      `${id}: the lead card carries the rail's highest displayed score (got ${rows[0].governed_score}, max ${top})`);
  }
  // Pinned, not a floor: an 18-row fixture is thin on purpose, and naming the
  // exact set means a selector that silently stops matching shows up here as a
  // named rail rather than a count that still clears a bar.
  // v8.15 — birthday and breakfast join the fillable set: the fixture carries
  // three marked registry rows and three qualifying morning rooms.
  eq(leads.map(([id]) => id).sort().join(","),
    "beach,birthday,break,breakfast,datenight,drive,eat,events,family,season,today,tonight,trending",
    "exactly the rails this fixture can fill honestly, and no others");
  // locals needs a real creator video and trending needs real demand data.
  // Neither can be faked into a fixture, and neither may be faked onto a page.
  // v8.33 — `cindy` joins them, for the STRICTEST version of the same reason:
  // it needs a real video by ONE named creator on a place that is also a real
  // café. A fixture row cannot produce that without inventing a post by a real
  // person, which is the one thing this file must never do. Its emptiness here
  // is the guard working.
  eq(thin.sort().join(","), "cindy,locals",
    "and exactly these cannot — each for its own stated reason");
}
// Determinism: same pools in, same lists out. The route is ISR-cached, so a
// selector that depended on iteration order would produce a different homepage
// per regeneration and nothing would ever reproduce a report.
{
  const again = fillRails(pools, (p) => p, CTX);
  eq(JSON.stringify(again.places), JSON.stringify(places), "fillRails is deterministic");
}
// A rail must not crash on a junk row — a live pool carries nulls and rows
// with no types the day an upstream field mask changes.
{
  const junk = { "things-to-do": [null, {}, { id: "x" }, ...pools["things-to-do"]], restaurants: [], beaches: [], nightlife: [] };
  let threw = null;
  try { fillRails(junk); } catch (e) { threw = e; }
  ok(!threw, `fillRails survives null / typeless rows (${threw && threw.message})`);
}

// ── visitor-origin radius: 17 first, 25 only when 17 cannot fill ─────────
{
  const tb = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");
  ok(/export const NEAR_RADIUS_MI = 17/.test(tb), "NEAR_RADIUS_MI is the existing 17 — do not invent a third radius");
  ok(/export const WIDEN_RADIUS_MI = 25/.test(tb), "WIDEN_RADIUS_MI is the existing 25");
}
eq(BEACH_NEAR_MI, 23, "beach keeps the documented 23-mile exception");
const NEAR_RADIUS_MI = 17;
const WIDEN_RADIUS_MI = 25;
{
  const near3 = [
    mk("n1", { name: "Near One", types: ["restaurant"], distMi: 4, _s: 90 }),
    mk("n2", { name: "Near Two", types: ["restaurant"], distMi: 9, _s: 80 }),
    mk("n3", { name: "Near Three", types: ["restaurant"], distMi: 16, _s: 70 }),
    mk("w1", { name: "Widen One", types: ["restaurant"], distMi: 20, _s: 95 }),
    mk("f1", { name: "Far One", types: ["restaurant"], distMi: 40, _s: 99 }),
  ];
  const first = pickNearThenWiden(near3, NEAR_RADIUS_MI, WIDEN_RADIUS_MI, MIN_CARDS);
  ok(first.every((p) => p.distMi <= 17), "17-first: a full 17mi set does not widen");
  ok(!first.some((p) => p.id === "w1" || p.id === "f1"), "17-first: 20mi and 40mi stay out when 17 can fill");
  eq(first.length, 3, "17-first keeps the three near rows");
}
{
  const thinNear = [
    mk("n1", { name: "Only Near", types: ["restaurant"], distMi: 6, _s: 80 }),
    mk("w1", { name: "Widen A", types: ["restaurant"], distMi: 20, _s: 90 }),
    mk("w2", { name: "Widen B", types: ["restaurant"], distMi: 24, _s: 70 }),
    mk("f1", { name: "Too Far", types: ["restaurant"], distMi: 40, _s: 99 }),
  ];
  const wide = pickNearThenWiden(thinNear, NEAR_RADIUS_MI, WIDEN_RADIUS_MI, MIN_CARDS);
  ok(wide.some((p) => p.id === "w1") && wide.some((p) => p.id === "w2"),
    "25 only when 17 cannot fill MIN_CARDS");
  ok(!wide.some((p) => p.id === "f1"), "widen stops at 25 — 40mi is not near me");
  eq(wide.length, 3, "widen admits the two 20-24mi rows plus the one near row");
}
{
  const none = pickNearThenWiden(pools.restaurants, NaN, 25, MIN_CARDS);
  eq(none.length, pools.restaurants.length, "no nearMi (no visitor origin) does not invent a radius");
}
{
  const visitor = {
    restaurants: [
      mk("r-near", { name: "Near Meal", types: ["restaurant"], distMi: 5, _s: 90, priceLevel: "PRICE_LEVEL_MODERATE" }),
      mk("r-mid", { name: "Mid Meal", types: ["restaurant"], distMi: 20, _s: 80, priceLevel: "PRICE_LEVEL_MODERATE" }),
      mk("r-far", { name: "Far Meal", types: ["restaurant"], distMi: 40, _s: 99, priceLevel: "PRICE_LEVEL_MODERATE" }),
      mk("r-near2", { name: "Near Meal 2", types: ["restaurant"], distMi: 8, _s: 70, priceLevel: "PRICE_LEVEL_MODERATE" }),
      mk("r-near3", { name: "Near Meal 3", types: ["restaurant"], distMi: 12, _s: 60, priceLevel: "PRICE_LEVEL_MODERATE" }),
    ],
    "things-to-do": pools["things-to-do"],
    beaches: [
      mk("bh-near", { name: "Near Beach", types: ["beach"], distMi: 10, _s: 90 }),
      mk("bh-mid", { name: "Mid Beach", types: ["beach"], distMi: 15, _s: 85 }),
      mk("bh-23", { name: "Edge Beach", types: ["beach"], distMi: 22, _s: 80 }),
      mk("bh-24", { name: "Past Beach", types: ["beach"], distMi: 24, _s: 95 }),
    ],
    nightlife: pools.nightlife,
    creators: [],
    breakfast: pools.breakfast,
    quickeats: pools.quickeats,
    // v8.22 — band-edge shapes for the drive rail's OWN horizon: 26.9mi is
    // inside DRIVE_REACH_MI (27) and must survive the visitor-origin clamp
    // that caps every other rail at 25; 28.5mi is past it and must not.
    drive: [
      mk("dv-in", { name: "Marquee Park 26mi", _s: 92, reviews: 80000, distMi: 26.9, types: ["amusement_park"] }),
      mk("dv-out", { name: "Too Far Park", _s: 96, reviews: 90000, distMi: 28.5, types: ["amusement_park"] }),
    ],
    // v8.26 — birthday owns BIRTHDAY_NEAR_MI and does not widen to 25.
    // Three nearby occasion rooms fill the rail; the 22-mile Tampa seed
    // is the live Parrish #1 and must stay out even though 17 cannot
    // "need" it — stretching a market to fill is the forbidden move.
    birthday: [
      mk("bd-n1", { name: "Near Steakhouse", _s: 88, distMi: 4, types: ["steak_house"] }),
      mk("bd-n2", { name: "Near Wine Bar", _s: 80, distMi: 6, types: ["wine_bar"] }),
      mk("bd-n3", { name: "Near Karaoke", _s: 72, distMi: 8, types: ["night_club"] }),
      Object.assign(mk("bd-tampa", { name: "Bulla Gastrobar Tampa", _s: 99, distMi: 22, types: ["spanish_restaurant"] }), { _birthdaySourced: true }),
    ],
  };
  const filled = fillRails(visitor, (p) => p, { nearMi: NEAR_RADIUS_MI, widenMi: WIDEN_RADIUS_MI, cityLabel: "Tampa" });
  ok(filled.places.eat.every((p) => p.distMi <= 17), "eat (meals) fills from 17 when 17 can");
  ok(!filled.places.eat.some((p) => p.id === "r-far"), "eat never keeps a 40mi leftover");
  ok(filled.places.beach.every((p) => p.distMi <= BEACH_NEAR_MI), "beach stays on BEACH_NEAR_MI, not 25");
  ok(!filled.places.beach.some((p) => p.id === "bh-24"), "beach does not widen to 25");
  // v8.22 — the drive rail's far edge is DRIVE_REACH_MI, not the generic
  // 17/25 clamp: a 26.9mi marquee row survives, a 28.5mi one never shows,
  // and nothing under DRIVE_MIN_MI wears the day-trip label.
  ok(filled.places.drive.some((p) => p.id === "dv-in"), "drive: keeps a 26.9mi row — its horizon is 27, not the 25mi widen");
  ok(!filled.places.drive.some((p) => p.id === "dv-out"), "drive: refuses a 28.5mi row — 27 is a cap, not a suggestion");
  ok(filled.places.drive.every((p) => p.distMi >= 12), "drive: near edge holds under visitor origin");
  ok(filled.places.birthday && filled.places.birthday.length >= MIN_CARDS,
    "birthday fills from nearby occasion rooms under visitor origin");
  ok(filled.places.birthday.every((p) => p.distMi <= BIRTHDAY_NEAR_MI),
    "birthday stays on BIRTHDAY_NEAR_MI — no 17/25 stretch");
  ok(!filled.places.birthday.some((p) => p.id === "bd-tampa"),
    "birthday does not widen to admit a 22-mile Tampa flagship");
}
{
  const data = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/rails/route.js", import.meta.url), "utf8");
  ok(/NEAR_RADIUS_MI/.test(data) && /WIDEN_RADIUS_MI/.test(data),
    "loadRailPlaces reuses todaysBest 17/25 — no third radius");
  ok(/if \(!origin\)/.test(api.replace(/\/\*[\s\S]*?\*\//g, " ")) || /if \(!origin\)/.test(api),
    "api/rails fail-closes when the visitor origin is missing");
  ok(/requireOrigin/.test(data) && /requireOrigin/.test(api),
    "near-me rails require the visitor origin — city centroid is not a fallback");
  ok(!/LANDING_CITIES\.sarasota/.test(api.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")),
    "api/rails has no Sarasota leftover fallback");
  // v8.18 — the identity pools are actually BUILT and wired (the ROLE, not a
  // name): buildIdentityPool called with the predicate and radius each selector
  // gates on, and its result ASSIGNED to the pool key. Without these the
  // fixture pools above assert a pipeline that does not exist in production.
  //
  // v8.73 — the builders moved into two Promise.all waves, so the call and the
  // assignment are now separate statements (the cold /api/rails path measured
  // 25.4s against a 12s client deadline; see check-rail-pool-waves.mjs). These
  // assertions FOLLOWED that, and each one gained its second half: a builder
  // called inside a wave whose result is never assigned produces exactly the
  // empty rail this block exists to prevent, and would have passed a check that
  // only looked for the call.
  const dcode = data.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
  ok(/buildIdentityPool\(pools, origin, isBreakfastPlace, BREAKFAST_NEAR_MI/.test(dcode),
    "railsData builds the breakfast identity pool from owned inventory (the pool-cap cure)");
  ok(/pools\.breakfast = breakfast;/.test(dcode),
    "…and ASSIGNS it to pools.breakfast — a pool computed inside a wave and never attached is the same empty rail, wearing a longer request");
  ok(/buildIdentityPool\(pools, origin, isQuickService, 8/.test(dcode),
    "railsData builds the quickeats identity pool for the 30-minute break");
  ok(/pools\.quickeats = quickeats;/.test(dcode),
    "…and ASSIGNS it to pools.quickeats — a pool computed inside a wave and never attached is the same empty rail, wearing a longer request");
  // v8.22 — the drive pool is BUILT (the exact call, on the pools object, from
  // the pooled-cities list) and bounded by the same band the selector reads.
  ok(/buildDrivePool\(pools, origin, cities\)/.test(dcode),
    "railsData builds the drive pool (27mi horizon) — without it the fixture above asserts a pipeline that does not exist");
  ok(/pools\.drive = drive;/.test(dcode),
    "…and ASSIGNS it to pools.drive — a pool computed inside a wave and never attached is the same empty rail, wearing a longer request");
  ok(/d >= DRIVE_MIN_MI && d <= DRIVE_REACH_MI/.test(dcode),
    "buildDrivePool admits rows only inside the [DRIVE_MIN_MI, DRIVE_REACH_MI] band measured from the reader");
  // v8.19 — family and events wired the same way (the ROLE: the exact call,
  // predicate and radius the selectors gate on).
  ok(/buildIdentityPool\(pools, origin, isFamilyPlace, FAMILY_NEAR_MI/.test(dcode),
    "railsData builds the family identity pool — plain reuse, strong widen, type-targeted read");
  ok(/pools\.family = family;/.test(dcode),
    "…and ASSIGNS it to pools.family — a pool computed inside a wave and never attached is the same empty rail, wearing a longer request");
  ok(/buildIdentityPool\(pools, origin, isStrongTicketedVenue, EVENTS_NEAR_MI/.test(dcode),
    "railsData builds the events identity pool with the STRONG identity on both sources (the bar-leak fix)");
  ok(/pools\.events = events;/.test(dcode),
    "…and ASSIGNS it to pools.events — a pool computed inside a wave and never attached is the same empty rail, wearing a longer request");
  ok(/google_types=ov\.%7B/.test(dcode),
    "typeOv reaches the REST query as an array-overlap filter — the cap must only ever trim QUALIFYING rows (3-of-54 starvation, measured live)");
  ok(/primaryType: row\.primary_type \|\| null/.test(dcode),
    "the widened shape carries primaryType — without it every strong identity degrades to its name fallback");
  // v8.19.1 — REGISTRY FLAGS NEVER LEAK INTO ANCHOR POOLS. buildCreatorsPool
  // stamped _creatorSourced on pool-REUSED row objects, so a creator-scouted
  // venue read registry-exempt on every rail (Anna Maria Oyster Bar rode 4
  // uncapped, measured live 2026-08-19). All three registry builders must
  // clone before flagging.
  ok(/\.filter\(Boolean\)\.map\(\(r\) => \(\{ \.\.\.r \}\)\);/.test(dcode),
    "buildCreatorsPool clones every row before stamping _creatorSourced");
  eq((dcode.match(/row = \{ \.\.\.row \};/g) || []).length, 1,
    "summer clones a pool-reused row before stamping its source flag");
  ok(/const clone = \{ \.\.\.row \}/.test(dcode),
    "birthday clones a pool-reused row before stamping a seed flag");
  ok(/buildIdentityPool\(\s*pools,\s*origin,\s*isBirthdayPlace,\s*BIRTHDAY_NEAR_MI/.test(dcode),
    "buildBirthdayPool widens from owned inventory via the identity pool (the pool-cap cure)");
  {
    const fn = (dcode.match(/async function buildBirthdayPool[\s\S]*?\nasync function /) || [""])[0];
    ok(fn.length > 80, "buildBirthdayPool function body was found for the no-Details assert");
    ok(!/getPlaceDetails/.test(fn),
      "birthday never hydrates via Place Details — inventory/pool match or skip");
  }
  ok(/rest\/v1\/wf_inventory/.test(dcode) && /status=eq\.OPERATIONAL/.test(dcode),
    "the widening reads OWNED inventory — never Google in a request path (the architecture rule)");
}

// ── v8.33: THERE IS NO EXPOSURE CAP (owner: "no more max on anything") ─────
// This section used to pin RAIL_EXPOSURE_CAP = 2 and assert that an organic row
// rode at most two rails. That cap shipped in v8.19 against a real complaint
// ("the cards are very repetitive") and it was the right fix for a codebase
// where rails had NO identities and several were drawing the unfiltered top of
// the same pool.
//
// Both halves of that changed on 2026-08-22. The rails got identities (eat asks
// for a meal, tonight for a nightlife venue, datenight for a room, gems for an
// independent, things-to-do for an outing), so the repetition the cap treated
// was mostly a symptom of what has now been cured. And the ceiling came off, so
// the cap stopped trading visible variety for anything: measured on a
// 40-restaurant fixture it removed EIGHT of them from `eat` entirely.
//
// What is asserted now is the property that replaced it, and it is a stronger
// one because it is about not losing anything: a row that passes a rail's
// identity and pick REACHES that rail, every time, no matter how many other
// rails it also qualifies for.
{
  const RSmod = await import("../lib/railSelect.js");
  ok(RSmod.RAIL_EXPOSURE_CAP === undefined, "the exposure cap is gone — it was a max");
  const filled = fillRails(pools, (p) => p, CTX);
  const railsWith = (name) => Object.keys(filled.places).filter((id) => (filled.places[id] || []).some((p) => p.name === name));
  // Ca' d'Zan qualifies for today and family in this fixture. The retired Best
  // homepage poster no longer adds a duplicate destination.
  ok(railsWith("Ca d Zan").length >= 2,
    `a row that qualifies for many rails now reaches them all (Ca d Zan rode ${railsWith("Ca d Zan").join(",") || "none"})`);
  ok(railsWith("Weeki Wachee Springs").length >= 2,
    "a summer-registry row still rides ALL its tagged rails — owner curation was never capped and still is not");
  // Nothing was silently dropped: every rail's output is exactly what its own
  // identity and pick selected from the pools, in score order.
  for (const [id, rows] of Object.entries(filled.places)) {
    if (!rows.length) continue;
    const expected = selectFor(id, pools, CTX);
    const gated = Number.isFinite(CTX.nearMi)
      ? pickNearThenWiden(expected, id === "beach" ? 23 : id === "drive" ? 27 : CTX.nearMi, id === "beach" ? 23 : id === "drive" ? 27 : CTX.widenMi, MIN_CARDS)
      : expected;
    eq(rows.length, gated.length, `${id}: the rail ships every row its axis selected — nothing is trimmed away`);
    const sc = rows.map((p) => (Number.isFinite(p.governed_score) ? p.governed_score : p._s));
    ok(sc.every((v, i) => i === 0 || sc[i - 1] >= v), `${id}: still in governed-score order`);
  }
  // Every rail that filled before still fills.
  ok(Object.keys(filled.places).every((id) => !filled.places[id].length || filled.places[id].length >= MIN_CARDS),
    "the MIN_CARDS floor survives the removal of every ceiling");
}

// ── v8.30 · the handpicked board IS the today card ─────────────────────────
// Owner, 2026-08-22, pointing at the tile: "Its for this card btw". Two
// properties, and both are invisible in source:
//   · with a board, `today` serves the board and NOT the ranked pool — even
//     though every anchor row outscores every pick in the fixture above, which
//     is exactly how a merge would look if someone reintroduced one;
//   · without a board, the rail is byte-for-byte what it was before v8.30.
{
  const withBoard = selectFor("today", pools, { ...CTX, ownerBoard: true });
  const ids = withBoard.map((p) => p.id);
  ok(ids.length === 4 && ids.every((id) => id.startsWith("op-")),
    `today with a board serves the board and only the board (got ${ids.join(",") || "none"})`);
  ok(!ids.includes("a"), "today with a board does not fall back to the top-scoring anchor");
  // Order is still the governed score, highest first — the board decides
  // membership, never sequence (the v8.10 global rule).
  const scores = withBoard.map((p) => p.governed_score ?? p._s);
  ok(scores.every((v, i) => i === 0 || scores[i - 1] >= v), `the board is still score-ordered (${scores.join(">")})`);

  const noBoard = selectFor("today", pools, { ...CTX, ownerBoard: false }).map((p) => p.id);
  const legacy = selectFor("today", { ...pools, localpicks: [] }, CTX).map((p) => p.id);
  eq(noBoard.filter((id) => !id.startsWith("op-")).join(","), legacy.join(","),
    "today without a board is exactly the pre-v8.30 rail");

  // The board rides the today card and NOTHING else — the registry is for one
  // card, so no other rail may read the pool even when it is full.
  for (const [id, cfg] of Object.entries(RAIL_SELECT)) {
    if (id === "today") continue;
    ok(!cfg.pools.includes("localpicks"), `${id}: does not read the handpicked board`);
    ok(!selectFor(id, pools, { ...CTX, ownerBoard: true }).some((p) => p._ownerPicked),
      `${id}: no handpicked row reaches this rail`);
  }
  // Registry rows are exempt from the exposure cap for the same reason
  // summer/birthday/creator rows are (v8.13) — but with the board owning the
  // card outright, what that has to guarantee is simply that all four survive
  // fillRails rather than being capped away by rows on other rails.
  const filled3 = fillRails(pools, (p) => p, { ...CTX, ownerBoard: true });
  eq(filled3.places.today.map((p) => p.id).sort().join(","), "op-1,op-2,op-3,op-4",
    "all four picks survive the exposure cap and reach the card");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
