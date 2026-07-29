// scripts/test-nightlife-ranking.mjs — locks lib/nightlifeRail.js.
//
// The eyeball check in the nightlife brief failed TWICE before it passed, which
// means it is load-bearing and must not live in anyone's head:
//
//   pass 1  gated on types[] incl. amenity tags  -> Olive Garden, Maggiano's and
//           Dave & Buster's entered a nightlife rail (`wine_bar` is an amenity
//           Google attaches to restaurants).
//   pass 2  gated on primaryType instead         -> House of Blues DISAPPEARED.
//           Places types it `american_restaurant`; Hard Rock Cafe is `cafe`;
//           The Beacham is `event_venue`.
//
// Every fixture below is a REAL Google Places row from the Orlando candidate
// pool (2026-07-29), with its real types and review count — not invented.
import {
  railFloorFor, RAIL_FLOOR_MIN, RAIL_FLOOR_CAP, isNightlifeVenue, railProminence,
  rankNightlife, isOperational, publishableWebsite, hostOfUrl, isDeniedHost,
  BAR_PRIMARY_TYPES, diningWeight, isDiningType, DINING_VETO_THRESHOLD,
} from "../lib/nightlifeRail.js";

let pass = 0;
const fail = (m) => { console.error("test-nightlife-ranking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── real Places rows ──────────────────────────────────────────────────────
const HOUSE_OF_BLUES = { name: "House of Blues Orlando", rating: 4.4, reviews: 7546,
  primaryType: "american_restaurant", types: ["live_music_venue", "american_restaurant", "restaurant"] };
const SAK           = { name: "SAK Comedy Lab", rating: 4.8, reviews: 1746, primaryType: "comedy_club", types: ["comedy_club"] };
const WILLS_PUB     = { name: "Will's Pub", rating: 4.6, reviews: 1074, primaryType: "pub", types: ["pub", "live_music_venue"] };
const MATHERS       = { name: "Mathers Social Gathering", rating: 4.6, reviews: 1688, primaryType: "cocktail_bar", types: ["cocktail_bar", "bar"] };
const THE_BEACHAM   = { name: "The Beacham", rating: 4.0, reviews: 930, primaryType: "event_venue", types: ["event_venue", "live_music_venue"] };
const TIMUCUA       = { name: "Timucua Arts Foundation", rating: 4.9, reviews: 292,
  primaryType: "association_or_organization", types: ["live_music_venue", "event_venue"] };

// Restaurants that carry a bar AMENITY tag. None may enter the rail.
const OLIVE_GARDEN  = { name: "Olive Garden Italian Restaurant", rating: 4.5, reviews: 10995, primaryType: "italian_restaurant", types: ["italian_restaurant", "wine_bar", "restaurant"] };
const MAGGIANOS     = { name: "Maggiano's Little Italy", rating: 4.6, reviews: 9509, primaryType: "italian_restaurant", types: ["italian_restaurant", "wine_bar"] };
const TOPGOLF       = { name: "Topgolf Orlando", rating: 4.5, reviews: 5622, primaryType: "restaurant", types: ["restaurant", "sports_bar"] };
const SEASONS_52    = { name: "Seasons 52", rating: 4.6, reviews: 4267, primaryType: "american_restaurant", types: ["american_restaurant", "wine_bar"] };
const NBC_GRILL     = { name: "NBC Sports Grill & Brew", rating: 3.9, reviews: 5013, primaryType: "bar_and_grill", types: ["bar_and_grill", "sports_bar", "american_restaurant"] };

// ── the §3.5 fixture the brief asks for by name ───────────────────────────
// One high-star / low-volume, one lower-star / high-volume. The high-volume one
// must rank above. This is the PR #390 bug restated as a test.
{
  const SPEAKEASY = { name: "30-review speakeasy", rating: 5.0, reviews: 30, primaryType: "cocktail_bar", types: ["cocktail_bar"] };
  const ranked = rankNightlife([SPEAKEASY, HOUSE_OF_BLUES]);
  ok(ranked.length === 1, `the 30-review speakeasy is below the floor and never reaches the rail (got ${ranked.length})`);
  ok(ranked[0].name === HOUSE_OF_BLUES.name, "House of Blues is the surviving entry");

  // Same shape ABOVE the floor, so the ordering itself is proven, not just the gate.
  const BOUTIQUE = { name: "boutique bar", rating: 5.0, reviews: 300, primaryType: "cocktail_bar", types: ["cocktail_bar"] };
  const both = rankNightlife([BOUTIQUE, HOUSE_OF_BLUES]);
  ok(both.length === 2, "both are eligible");
  ok(both[0].name === HOUSE_OF_BLUES.name,
    `5.0/300 must NOT outrank 4.4/7546 (got ${both[0].name}; prom ${both[0].prominence} vs ${both[1].prominence})`);
  ok(railProminence(5.0, 300) < railProminence(4.4, 7546), "prominence orders volume over stars at this spread");
}

// ── the eyeball check, as a guard ─────────────────────────────────────────
// PASS 1's failure: restaurants with amenity bar tags must not be eligible.
for (const r of [OLIVE_GARDEN, MAGGIANOS, TOPGOLF, SEASONS_52]) {
  ok(!isNightlifeVenue(r), `restaurant leak: "${r.name}" (${r.primaryType}, types ${r.types.join("/")}) must NOT be nightlife`);
}
{
  const railed = rankNightlife([OLIVE_GARDEN, MAGGIANOS, TOPGOLF, SEASONS_52, HOUSE_OF_BLUES, SAK, WILLS_PUB]);
  ok(railed.length === 3, `only the three real venues survive (got ${railed.length}: ${railed.map((r) => r.name).join(", ")})`);
  ok(!railed.some((p) => /Olive Garden|Maggiano|Topgolf|Seasons/.test(p.name)), "zero restaurant leaks in a mixed set");
}

// PASS 2's failure: venues Places types as restaurants/halls must still qualify.
for (const v of [HOUSE_OF_BLUES, THE_BEACHAM, TIMUCUA]) {
  ok(isNightlifeVenue(v), `"${v.name}" is a real venue and must qualify despite primaryType=${v.primaryType}`);
}
ok(isNightlifeVenue(SAK) && isNightlifeVenue(WILLS_PUB) && isNightlifeVenue(MATHERS),
  "comedy club, pub and cocktail bar all qualify on their own identity");

// bar_and_grill is a restaurant format and must stay out of the primary set.
ok(!BAR_PRIMARY_TYPES.includes("bar_and_grill"), "bar_and_grill is NOT a bar-family primary type");
ok(!isNightlifeVenue(NBC_GRILL), "NBC Sports Grill & Brew (bar_and_grill) must not enter the rail");

// ── the floor ─────────────────────────────────────────────────────────────
// The floor is MARKET-RELATIVE — derived from the pool, clamped both ends.
{
  const mk = (n, reviews) => ({ name: "v" + n, rating: 4.5, reviews, primaryType: "bar", types: ["bar"] });
  // p10 INSIDE the band is used as-is. 20 rows -> index floor(20*0.10)=2.
  const inBand = [100, 110, 120, 200, 300, 400, 500, 700, 900, 1200,
                  1500, 1800, 2200, 2800, 3500, 4400, 5600, 7000, 9000, 13000].map((r, i) => mk(i, r));
  ok(railFloorFor(inBand) === 120, `p10 inside the band is used as-is (got ${railFloorFor(inBand)}, expected 120)`);
  // Thin market: p10 is tiny -> clamped UP, so the speakeasy still cannot enter.
  const thin = [12, 18, 22, 30, 41, 55, 70, 88, 120, 190].map((r, i) => mk(i, r));
  ok(railFloorFor(thin) === RAIL_FLOOR_MIN, `thin market clamps up to ${RAIL_FLOOR_MIN} (got ${railFloorFor(thin)})`);
  ok(rankNightlife(thin).length > 0, "a thin market still returns a rail — the floor does not empty it");
  // Dense market: p10 is huge -> clamped DOWN, no market stricter than Orlando.
  const dense = [900, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 40000].map((r, i) => mk(i, r));
  ok(railFloorFor(dense) === RAIL_FLOOR_CAP, `dense market clamps down to ${RAIL_FLOOR_CAP} (got ${railFloorFor(dense)})`);
  // Too few rows to infer anything -> the absolute minimum, never zero.
  ok(railFloorFor([mk(0, 500), mk(1, 600)]) === RAIL_FLOOR_MIN, "a 2-row pool falls back to the minimum, not to 0");
  ok(railFloorFor([]) === RAIL_FLOOR_MIN, "an empty pool falls back to the minimum");
}
ok(rankNightlife([SAK, HOUSE_OF_BLUES, WILLS_PUB, MATHERS, THE_BEACHAM, TIMUCUA]).some((p) => p.name === TIMUCUA.name),
  "Timucua (292) survives in a pool of real venues — the floor is not 500");

// ── null in, null out — never a fabricated 0 ──────────────────────────────
ok(railProminence(null, 99999) === null, "no rating -> no prominence");
ok(railProminence(0, 500) === null, "a zero rating yields null, not 0");
ok(rankNightlife([{ ...SAK, rating: null }]).length === 0, "an unrated venue never reaches the rail");
ok(rankNightlife([{ ...SAK, reviews: 5 }], 250).length === 0, "an explicit floor override is honoured");

// ── business status is an ALLOWLIST, not a denylist of CLOSED_* ───────────
ok(isOperational({ businessStatus: "OPERATIONAL" }), "OPERATIONAL passes");
ok(isOperational({}), "absent status passes (Places omits it for many rows)");
for (const s of ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY", "SOME_FUTURE_ENUM_GOOGLE_ADDS"]) {
  ok(!isOperational({ businessStatus: s }), `"${s}" is not OPERATIONAL and is excluded`);
}
ok(rankNightlife([{ ...SAK, businessStatus: "CLOSED_PERMANENTLY" }]).length === 0, "a closed venue never reaches the rail");

// ── AGENTS.md §7 — officialWebsite host rule ──────────────────────────────
// Real hosts, read from the websiteUri Places returned. Never fetched.
ok(publishableWebsite("https://locations.houseofblues.com/orlando") !== null, "House of Blues (Live Nation host) is publishable");
ok(publishableWebsite("https://www.theedisonfla.com/") !== null, "The Edison (independent host) is publishable");
ok(publishableWebsite("https://paradiso37.com/") !== null, "Paradiso 37 (independent host) is publishable");
ok(publishableWebsite("https://www.splitsvillelanes.com/") !== null, "Splitsville (independent host) is publishable");
ok(publishableWebsite("https://www.disneysprings.com/dining/jock-lindseys-hangar-bar/") === null,
  "Jock Lindsey's (disneysprings.com) is OMITTED — the only Disney-hosted one of the five");

// Entity rule, not a list: these appear in no denylist literal.
for (const h of ["booking.disneyworld.disney.go.com", "reservations.disney.com", "tickets.disneyholidays.co.uk", "DISNEYSPRINGS.COM", "www.disney.go.com."]) {
  ok(isDeniedHost(hostOfUrl("https://" + h.replace(/\.$/, "") + "/x")), `${h} is recognised as Disney`);
}
ok(!isDeniedHost(hostOfUrl("https://splitsvillelanes.com/")), "a non-Disney venue in a Disney district is not denied by association");

// ── the dining-weight veto ────────────────────────────────────────────────
// Every types[] array below is a VERBATIM Places response captured 2026-07-29.
// The table proves BOTH sides: a threshold that only demonstrates what it
// excludes has not been calibrated, it has been asserted.
const DINING_FIXTURES = [
  // name                         primaryType            types[]                                                                        dining  keep
  ["Cafe 34 Istanbul",            "turkish_restaurant",  ["turkish_restaurant","halal_restaurant","hookah_bar","mediterranean_restaurant","bar","restaurant","food"],            4, false],
  ["Eddie V's Prime Seafood",     "seafood_restaurant",  ["seafood_restaurant","oyster_bar_restaurant","cocktail_bar","fine_dining_restaurant","lounge_bar","steak_house","live_music_venue","night_club","american_restaurant","bar","restaurant","food"], 6, false],
  ["Ocean Prime",                 "seafood_restaurant",  ["seafood_restaurant","sushi_restaurant","fine_dining_restaurant","lounge_bar","steak_house","night_club","american_restaurant","japanese_restaurant","bar","restaurant","food"],                  7, false],
  ["KaLa Rooftop",                "restaurant",          ["restaurant","brunch_restaurant","hookah_bar","halal_restaurant","fine_dining_restaurant","lounge_bar","night_club","seafood_restaurant","bar","food"],                                           5, false],
  // ...and the venues that must SURVIVE. These are why the threshold is 4 and not 3.
  ["Ole Red",                     "restaurant",          ["restaurant","live_music_venue","event_venue","bar","food"],                                                            1, true],
  ["House of Blues Orlando",      "american_restaurant", ["american_restaurant","restaurant","live_music_venue","bar","food"],                                                    2, true],
  ["Senor Frog's",                "mexican_restaurant",  ["mexican_restaurant","latin_american_restaurant","restaurant","night_club","bar","food"],                               3, true],
  ["Jimmy Buffett's Margaritaville","bar_and_grill",     ["bar_and_grill","hamburger_restaurant","american_restaurant","restaurant","live_music_venue","bar","food"],             3, true],
  ["Splitsville Luxury Lanes",    "bowling_alley",       ["bowling_alley","sushi_restaurant","japanese_restaurant","restaurant","night_club","bar","food"],                       3, true],
];
for (const [name, primaryType, types, expectDining, expectKeep] of DINING_FIXTURES) {
  const place = { displayName: { text: name }, primaryType, types };
  ok(diningWeight(place) === expectDining,
    `${name}: dining weight ${expectDining} (got ${diningWeight(place)})`);
  ok(isNightlifeVenue(place) === expectKeep,
    `${name}: ${expectKeep ? "SURVIVES" : "VETOED"} at threshold ${DINING_VETO_THRESHOLD} (dining ${expectDining})`);
}
// Both sides of the table are non-empty, or the loop above proves nothing.
ok(DINING_FIXTURES.some(([, , , , k]) => k), "the fixture table contains venues that must survive");
ok(DINING_FIXTURES.some(([, , , , k]) => !k), "the fixture table contains venues that must be vetoed");
ok(DINING_FIXTURES.length >= 9, `fixture table covers >=9 measured venues (got ${DINING_FIXTURES.length})`);

// The veto applies to tier 1 ONLY. A bar-family primaryType is the venue's own
// identity and food volume cannot override it — this is what keeps Twin Peaks
// (sports_bar + american_restaurant + restaurant) and Tom's Watch Bar on the rail.
ok(isNightlifeVenue({ primaryType: "sports_bar", types: ["sports_bar","american_restaurant","restaurant","food","bar"] }),
  "Twin Peaks: bar-family primaryType is never vetoed by dining weight");
ok(isNightlifeVenue({ primaryType: "bar", types: ["sports_bar","bar","live_music_venue","event_venue","restaurant","food"] }),
  "Tin Roof: bar primaryType survives regardless of restaurant/food types");
ok(isNightlifeVenue({ primaryType: "bar", types: Array.from({ length: 9 }, (_, i) => `x${i}_restaurant`).concat("bar") }),
  "even 9 dining types cannot veto a bar-family primaryType — the veto is tier-1 only");

// The classifier itself.
for (const t of ["seafood_restaurant", "turkish_restaurant", "restaurant", "steak_house", "cafe", "brunch_restaurant"])
  ok(isDiningType(t), `${t} counts as dining`);
for (const t of ["bar", "night_club", "live_music_venue", "bowling_alley", "event_venue", "point_of_interest", "food"])
  ok(!isDiningType(t), `${t} does NOT count as dining`);
ok(!isDiningType(undefined) && !isDiningType(null) && !isDiningType(42), "isDiningType is total over junk input");
ok(diningWeight({}) === 0 && diningWeight(null) === 0, "diningWeight handles a missing types[] as 0, not a throw");

// A venue with NO venue-identity type and a non-bar primary is still out —
// the veto must not accidentally become an admission path.
ok(!isNightlifeVenue({ primaryType: "italian_restaurant", types: ["italian_restaurant","restaurant","food"] }),
  "a plain restaurant with 0 venue types stays out (the veto is not an allow)");

console.log(`test-nightlife-ranking: OK — ${pass} assertions (market-relative floor [${RAIL_FLOOR_MIN}..${RAIL_FLOOR_CAP}], prominence over stars, dining-weight veto >=${DINING_VETO_THRESHOLD}, §7 host rule)`);
