#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  NIGHT_OUT_MAX_MI, NIGHT_OUT_NEAR_MI, NIGHT_OUT_RAIL_DEFS,
  composeNightOutRails, isNightOutEligiblePlace, nightOutDistanceMi,
  nightOutEventRail, nightOutEventRails, nightOutPlaceRail, nightOutPlaceRails,
} from "../lib/nightOutIntent.js";
import { windowRailAnswer } from "../lib/railResponse.js";
import {
  NIGHT_OUT_DISTRICT_EVIDENCE, NIGHT_OUT_DISTRICT_IDS,
  NIGHT_OUT_EDITORIAL_EVIDENCE, nightOutEditorialEvidence,
} from "../lib/nightOutEvidence.js";
import { fetchJsonWithDeadline } from "../lib/clientJson.js";

let pass = 0;
const failures = [];
const ok = (condition, message) => condition ? pass++ : failures.push(message);
const place = (over = {}) => ({ id: "fixture", name: "Fixture", distMi: 5, rating: 4.6, reviews: 180, types: [], ...over });

const expected = ["clubs", "cocktails", "live-music", "dinner-entertainment", "date-dining", "shows", "districts", "waterfront", "night-tours", "social-play"];
ok(NIGHT_OUT_RAIL_DEFS.length === 10, "Night Out has exactly ten intent rails");
ok(NIGHT_OUT_RAIL_DEFS.map((rail) => rail.id).join("|") === expected.join("|"), "the approved ten intents are present in order");
ok(new Set(NIGHT_OUT_RAIL_DEFS.map((rail) => rail.title)).size === 10, "all ten titles are unique");
ok(NIGHT_OUT_NEAR_MI === 17, "the first Night Out ring ends at 17 miles");
ok(NIGHT_OUT_MAX_MI === 27, "Night Out never widens beyond 27 miles");

ok(nightOutPlaceRail(place({ primaryType: "night_club", description: "A real nightclub with DJs and a dance floor" })) === "clubs", "actual dancing evidence enters Clubs");
ok(nightOutPlaceRail(place({ primaryType: "bar", editorial: "A lively room with a cozy dance floor and DJs" })) === "clubs", "a bar with direct dance-floor evidence enters Clubs");
ok(nightOutPlaceRail(place({ primaryType: "bar", editorial: "A neighborhood bar with music" })) !== "clubs", "a generic bar does not become a dance club");
ok(NIGHT_OUT_EDITORIAL_EVIDENCE.ChIJrYGdKBJAw4gRafewzUWWYnk?.source.startsWith("https://") && /dinner theatre/.test(nightOutEditorialEvidence("ChIJrYGdKBJAw4gRafewzUWWYnk")), "Dinner + Entertainment evidence is source-backed and addressable by inventory ID");
ok(NIGHT_OUT_DISTRICT_IDS.length === 3 && NIGHT_OUT_DISTRICT_IDS.every((id) => NIGHT_OUT_DISTRICT_EVIDENCE[id]?.verifiedAt === "2026-07-18" && NIGHT_OUT_DISTRICT_EVIDENCE[id].sources.every((url) => url.startsWith("https://"))), "the three governed district IDs carry dated source evidence");
ok(nightOutPlaceRail(place({ primaryType: "bar", description: "A friendly neighborhood bar" })) === "cocktails", "a real bar enters the broad Bars and Cocktails rail without being relabelled as a rooftop");
ok(nightOutPlaceRail(place({ primaryType: "cocktail_bar", description: "Craft cocktails" })) === "cocktails", "a cocktail room enters Bars and Cocktails");
ok(nightOutPlaceRail(place({ primaryType: "bar", description: "Patio drinks with city views" })) === "cocktails", "a patio remains a bar and is never used as rooftop evidence");
ok(nightOutPlaceRail(place({ primaryType: "bar", description: "Explicit rooftop bar and skyline" })) === "cocktails", "explicit rooftop evidence enters the cocktail rail");
ok(nightOutPlaceRail(place({ primaryType: "live_music_venue", name: "The Jazz Room" })) === "live-music", "a live-music venue enters Live Music");
ok(nightOutPlaceRails(place({ primaryType: "live_music_venue", name: "The Jazz Room" })).join("|") === "live-music|shows|dinner-entertainment", "live music keeps its canonical rail and also enters Shows and Dinner + Entertainment");
ok(nightOutPlaceRails(place({ primaryType: "performing_arts_theater", name: "Mahaffey Theater", editorial: "Touring concerts and theater" })).includes("live-music"), "a theater with direct concert evidence enters Live Music & Concerts");
ok(nightOutPlaceRail(place({ primaryType: "restaurant", name: "Mystery Dinner Theater" })) === "dinner-entertainment", "a dinner show enters Dinner + Entertainment");
ok(nightOutPlaceRail(place({ primaryType: "fine_dining_restaurant", name: "Candlelit Omakase", description: "Romantic tasting menu" })) === "date-dining", "occasion-level dining enters Date-Night Dining");
ok(nightOutPlaceRail(place({ primaryType: "restaurant", name: "Ordinary Grill" })) == null, "an ordinary restaurant cannot become Date-Night Dining");
ok(nightOutPlaceRail(place({ primaryType: "comedy_club", name: "Laugh House Comedy Club" })) === "shows", "a comedy club enters Shows rather than Clubs");
ok(nightOutPlaceRails(place({ primaryType: "comedy_club", name: "Laugh House Comedy Club" })).includes("shows"), "comedy remains admitted to Shows");
ok(nightOutPlaceRail(place({ primaryType: "tourist_attraction", name: "Disney Springs Entertainment District" })) === "districts", "an explicit after-dark district enters Districts");
ok(nightOutPlaceRail(place({ primaryType: "shopping_mall", name: "Generic Shopping Center" })) == null, "a generic shopping center cannot fill a thin Districts rail");
ok(nightOutPlaceRail(place({ id: "invented", primaryType: "shopping_mall", name: "Invented District", _nightOutAttributes: { district: true } })) == null, "an arbitrary caller attribute cannot self-admit an ungoverned district ID");
ok(nightOutPlaceRail(place({ id: "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8", primaryType: "shopping_mall", name: "St. Armands Circle", _nightOutAttributes: { district: true } })) === "districts", "a source-backed exact district overlay can admit its governed shopping-and-dining center");
ok(nightOutPlaceRail(place({ primaryType: "tour_operator", name: "Moonlight Harbor Cruise" })) === "waterfront", "a night cruise enters Waterfront");
ok(nightOutPlaceRail(place({ primaryType: "tour_operator", name: "Downtown Ghost Night Tour" })) === "night-tours", "a ghost walk enters Night Tours");
ok(nightOutPlaceRail(place({ primaryType: "bar", name: "Player One Arcade Bar" })) === "social-play", "an arcade bar stays exclusively in Social Play");
ok(nightOutPlaceRails(place({ primaryType: "bar", name: "Player One Karaoke Bar" })).join("|") === "social-play|dinner-entertainment", "karaoke can serve Social Play and Dinner + Entertainment without changing its first rail");
ok(nightOutPlaceRails(place({ primaryType: "cocktail_bar", name: "The Hidden Room Speakeasy", editorial: "A genuine speakeasy cocktail bar" })).join("|") === "cocktails|dinner-entertainment", "a speakeasy from the nightlife menu also enters Dinner + Entertainment");
ok(nightOutPlaceRails(place({ primaryType: "cocktail_bar", name: "Sky Bar", editorial: "An explicit rooftop bar overlooking downtown" })).join("|") === "cocktails|dinner-entertainment", "an evidenced rooftop from the nightlife menu also enters Dinner + Entertainment");

// Exact identities from the 2026-09-10 Sarasota production response. These
// reached rails before scoring because unrelated words were treated as venue
// evidence; the identity floor now refuses them before rankRailPlaces runs.
const publixUniversityWalk = place({
  id: "ChIJT2tT7QM_w4gRuD7XeYf3wJE", name: "Publix Super Market at University Walk",
  primaryType: "supermarket", category: "food",
  wfScore: 1000,
  types: ["supermarket", "florist", "grocery_store", "deli", "market", "bakery", "food_store", "store", "food"],
  editorial: "Supermarket chain with a wide selection of groceries, plus deli & bakery departments.",
});
ok(!isNightOutEligiblePlace(publixUniversityWalk) && nightOutPlaceRails(publixUniversityWalk).length === 0, "Publix University Walk is rejected globally rather than pairing food and walk into a Night Tour");
ok(nightOutPlaceRail({ ...publixUniversityWalk, primaryType: null }) == null, "a missing primary cannot let supermarket secondary types bypass the identity veto");
ok(nightOutPlaceRail(place({ name: "University Walk", primaryType: "tourist_attraction", editorial: "A food market near campus" })) == null, "tour words in one field and food words in another cannot combine into false evidence");
ok(nightOutPlaceRail(place({ name: "L’Opera Bakery Bistro", primaryType: "bakery", category: "food", types: ["bakery", "food_store", "food", "store"] })) == null, "L’Opera Bakery Bistro cannot enter Shows from a word in its retail name");
ok(nightOutPlaceRail(place({ name: "G.T. Bray Park", primaryType: "park", category: "attractions", types: ["park", "sports_complex"], editorial: "Large recreational park offering sports fields & an amphitheater." })) == null, "a generic daytime park cannot enter Live Music from an amphitheater mention");
ok(nightOutPlaceRail(place({ name: "Riverwalk Splash Park", primaryType: "water_park", category: "attractions", types: ["water_park", "amusement_park"] })) == null, "Riverwalk Splash Park cannot enter Waterfront from its name");
ok(!nightOutPlaceRails(place({ name: "Mattison's Riverwalk", primaryType: "american_restaurant", types: ["american_restaurant", "bar", "live_music_venue"], editorial: "Sprawling gastropub with bar classics." })).includes("waterfront"), "a restaurant named Riverwalk needs actual waterfront-night evidence for the Waterfront rail");

// Genuine rows from the same complete Sarasota/Bradenton corpus. Tightening
// false positives must retain provider spelling variants and real venue hosts.
for (const liveVenue of [
  place({ id: "ChIJ5TCV780Xw4gR9tilZdFHw24", name: "McCabe's Irish Pub", primaryType: "irish_pub", types: ["irish_pub", "pub", "live_music_venue"], editorial: "Brick-walled neighborhood pub with Bloody Marys & live music." }),
  place({ id: "ChIJV1EQn5wRw4gRL9F20zVGaG4", name: "The Bridge Tender Inn Dockside & Tiki Bar", primaryType: "bar_and_grill", types: ["bar_and_grill", "seafood_restaurant", "bar"], editorial: "Lively American bar & eatery with a dockside bar & occasional live music." }),
  place({ id: "ChIJJe-UU1sRw4gRnDNft0Vfbl0", name: "Cortez Clam Factory", primaryType: "bar_and_grill", types: ["bar_and_grill", "seafood_restaurant", "bar"], editorial: "Laid-back local eatery offering seafood, beers & live music." }),
  place({ id: "ChIJvbSu0gtqw4gRlCerUAMFIkM", name: "The Hub Baja Grill", primaryType: "bar_and_grill", types: ["bar_and_grill", "bar", "restaurant"], editorial: "Festive, tropical-themed eatery with live music." }),
]) ok(nightOutPlaceRail(liveVenue) === "live-music", `${liveVenue.name} retains genuine live-music admission`);
ok(nightOutPlaceRail(place({ id: "ChIJK_DWONEXw4gR3jEk9vxm5L4", name: "Mosaic Riverwalk Amphitheater", primaryType: "amphitheatre", types: ["amphitheatre", "performing_arts_theater", "event_venue"] })) === "live-music", "the provider's amphitheatre spelling is a first-class concert venue identity");
ok(nightOutPlaceRail(place({ id: "ChIJY3qV_tYXw4gRoy-jOe1OAo4", name: "Riverwalk", primaryType: "park", types: ["park", "tourist_attraction"], editorial: "Picturesque riverside park for strolling." })) === "waterfront", "the exact governed Bradenton Riverwalk park retains Waterfront admission");
ok(nightOutPlaceRail(place({ id: "ChIJdyBKQzM9w4gRrAVyE50uvX8", name: "Riverwalk East", primaryType: "park", types: ["park"] })) === "waterfront", "the exact governed Riverwalk East park retains Waterfront admission");
ok(nightOutPlaceRail(place({ id: "invented-riverwalk", name: "Riverwalk", primaryType: "park", types: ["park"] })) == null, "a name-only generic Riverwalk park cannot bypass the exact waterfront identity gate");

ok(nightOutEventRail({ id: "concert", name: "The National in Concert", segment: "Music", date: "2026-09-02" }) === "live-music", "a dated concert enters Live Music");
ok(nightOutEventRail({ id: "comedy", name: "Kevin Nealon Comedy", segment: "Arts & Theatre", date: "2026-09-02" }) === "shows", "a dated comedy show enters Shows");
ok(nightOutEventRails({ id: "concert-theater", name: "Live at the Theater", segment: "Concerts", genre: "Rock", date: "2026-09-02" }).includes("live-music"), "a dated theater concert enters Live Music & Concerts from its event taxonomy");
ok(nightOutEventRail({ id: "venue", name: "Downtown Event Venue", category: "event_venue" }) == null, "a generic event venue cannot impersonate a happening");
ok(nightOutEventRail({ id: "sports", name: "Baseball Game", segment: "Sports", date: "2026-09-02" }) == null, "an unrelated event is not forced into the ten rails");

ok(nightOutDistanceMi({ lat: 27.95, lng: -82.46 }, { lat: 27.95, lng: -82.46 }) === 0, "coordinate distance resolves at the reader's point");
ok(nightOutDistanceMi({}, { lat: 27.95, lng: -82.46 }) == null, "unknown distance stays unknown");

const fixtures = [
  place({ id: "club", name: "Club Eleven", primaryType: "night_club", description: "Nightclub dance floor and DJ", distMi: 20, wfScore: 99 }),
  place({ id: "club-near", name: "Club Near", primaryType: "night_club", description: "Nightclub dance floor and DJ", distMi: 8, wfScore: 70 }),
  place({ id: "cocktail", name: "Velvet Cocktail Room", primaryType: "cocktail_bar" }),
  place({ id: "music", name: "The Live Music Hall", primaryType: "live_music_venue" }),
  place({ id: "dinner-show", name: "Mystery Dinner Theater", primaryType: "restaurant" }),
  place({ id: "date", name: "Romantic Tasting Room", primaryType: "fine_dining_restaurant", description: "Candlelit tasting menu" }),
  place({ id: "show", name: "City Comedy Club", primaryType: "comedy_club" }),
  place({ id: "district", name: "CityWalk Entertainment District", primaryType: "tourist_attraction" }),
  place({ id: "cruise", name: "Sunset Dinner Cruise", primaryType: "tour_operator" }),
  place({ id: "tour", name: "Historic Ghost Night Tour", primaryType: "tour_operator" }),
  place({ id: "arcade", name: "Arcade Bar", primaryType: "bar" }),
  publixUniversityWalk,
  place({ id: "far", name: "Far Cocktail Room", primaryType: "cocktail_bar", distMi: 27.1 }),
  { id: "unknown", name: "Unknown Cocktail Room", primaryType: "cocktail_bar" },
];
const composed = composeNightOutRails([], fixtures, {});
ok(composed.rails.length === 10, "composition always returns all ten rails, including honest empties");
ok(composed.rails.every((rail) => expected.includes(rail.id)), "composition returns only approved intents");
// THE OWNER'S BUG, exactly: a 9.9-scored wider-ring club used to be exiled
// below a 7.0-scored near one by a distance RING evaluated ahead of the
// score. lib/railRank.js's law is score DESC first, distance a tie-break
// only, so the higher score leads regardless of which ring it falls in.
ok(composed.rails.find((rail) => rail.id === "clubs").places.map((row) => row.id).join("|") === "club|club-near", "the higher-scoring club leads even though it is in the wider ring — score first, distance only a tie-break");
ok(!composed.rails.flatMap((rail) => rail.places).some((row) => row.id === "far"), "anything beyond 27 miles is rejected");
ok(!composed.rails.flatMap((rail) => rail.places).some((row) => row.id === "unknown"), "unknown-distance places are rejected");
ok(composed.rails.find((rail) => rail.id === "live-music").places.some((row) => row.id === "music")
  && composed.rails.find((rail) => rail.id === "dinner-entertainment").places.some((row) => row.id === "music"),
"explicitly requested venue identities can belong to more than one Night Out rail");
ok(!composed.rails.flatMap((rail) => rail.places).some((row) => row.id === publixUniversityWalk.id), "ineligible identities never reach a ranked bucket");

const longAnswer = { rails: [{ id: "cocktails", places: Array.from({ length: 20 }, (_, id) => ({ id })) }] };
const firstWindow = windowRailAnswer(longAnswer);
ok(firstWindow.rails[0].places.length === 12, "first paint carries a bounded ranked window");
ok(firstWindow.rails[0].total === 20 && firstWindow.hasMore === true, "the compact answer preserves the full truthful count");
ok(windowRailAnswer(longAnswer, true).rails[0].places.length === 20, "the full cached inventory remains available on request");

const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const posterEvents = readFileSync(new URL("../lib/posterEvents.js", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/night-out/route.js", import.meta.url), "utf8");
const clientJson = readFileSync(new URL("../lib/clientJson.js", import.meta.url), "utf8");
const pagedRail = readFileSync(new URL("../app/components/usePagedRail.js", import.meta.url), "utf8");
ok(/id: "events"[\s\S]{0,420}retiredInto: "tonight"/.test(rails), "the standalone Events poster is retired into Night Out without deleting its metadata");
ok(/!r\.retiredInto/.test(daypart), "retired posters are hidden from the tile track");
ok(/requested\.retiredInto \|\| id/.test(daypart), "legacy Events deep links resolve to Night Out");
ok(/NightOutRails = dynamic/.test(daypart) && /<NightOutRails/.test(daypart), "the ten-rail Night Out component is lazy and mounted behind its tile");
ok(/eventsSlot=\{eventsSlot\}/.test(daypart) && /eventsSlot\("night-out", selectPosterEvents\)/.test(component), "Night Out consumes the existing dated event inventory");
ok(/import \{ selectPosterEvents \} from "\.\.\/\.\.\/lib\/posterEvents\.js"/.test(component)
  && /mode = "events", selectPosterEvents = null/.test(home)
  && /selectPosterEvents\(fp\.usable\.filter[\s\S]{0,240}\{ mode, center/.test(home)
  && /mode === "night-out"/.test(posterEvents) && /nightOutEventRails\(event\)/.test(posterEvents),
"home reaches the shared poster selector, which subdivides real EventRailCards through the plural Night Out taxonomy");
ok(!/selRail\.id === "events" && eventsSlot/.test(daypart), "the obsolete standalone Events drop is gone");
ok(/selRail\.id === "augtober" \|\| selRail\.id === "tonight"/.test(daypart), "Night Out owns its complete answer and cannot fall through to generic places");
ok(/if \(!count\) return null/.test(component), "a healthy empty intent hides its shelf instead of using a look-alike");
// v8.97b — FOLLOWED, NOT LOOSENED. Both assertions below used to read the ROUTE
// for strings the retrieval happened to contain. The retrieval moved into
// lib/nightOutPool.js (identity before the cost bound), so a path-pinned check
// would have gone red on a correct move — and, far worse, would have gone GREEN
// on a version that kept the strings in the route and dropped the behaviour.
//
// The first one earned its keep during that move: the new reader was written
// with Promise.all, which turns ONE slow category into a 503 for the whole
// surface. That is the exact regression this assertion exists to prevent, and
// it caught it. So it is now asserted on the UNION of the two files, and the
// resilience is asserted by CALLING the reader with a failing category rather
// than by matching the word "allSettled".
const pool = readFileSync(new URL("../lib/nightOutPool.js", import.meta.url), "utf8");
// v8.98 — the retrieval spans THREE files now. lib/ownedPool.js holds the one
// definition of "page wf_inventory deterministically and exhaustively", which
// nightOutPool delegates to; the SHAPE (rowToNightOutPlace) and the LAW
// (nightOutPlaceRail, exactly 27 miles) stayed here. Following the code rather
// than deleting the assertions is the rule (CLAUDE.md): a guard that reads one
// path goes GREEN the moment the code leaves it, which is the dangerous half.
const owned = readFileSync(new URL("../lib/ownedPool.js", import.meta.url), "utf8");
const retrieval = route + "\n" + pool + "\n" + owned;
// …and the union is only honest while the delegation is real, so that is
// asserted rather than assumed. Without this line, every source assertion below
// could be satisfied by ownedPool.js alone while Night Out read some other way.
ok(/from "\.\/ownedPool\.js"/.test(pool) && /readOwnedCategory\(env, category, box,/.test(pool),
  "lib/nightOutPool.js no longer delegates its read to lib/ownedPool.js — the source assertions below would then be satisfied by a module Night Out does not use");
ok(/\["food", "nightlife", "attractions"\]/.test(retrieval) && /Promise\.allSettled/.test(retrieval),
  "Night Out no longer reads its three owned categories with allSettled — one stalled category would blank every shelf");
{
  const { fetchNightOutPool } = await import("../lib/nightOutPool.js");
  const env = { url: "https://example.invalid", key: "k" };
  // Fresh objects per response, as res.json() gives in production: the reader
  // hydrates photo_ref onto the rows it was handed, and a shared fixture would
  // carry one run's reference into the next and hide a hydration that never ran.
  const page = (rows) => ({ ok: true, json: async () => rows.map((r) => ({ ...r })) });
  const okRow = { place_id: "cc1", name: "Comedy Cellar", lat: 27.60, lng: -82.43, primary_type: "comedy_club", google_types: [], status: "OPERATIONAL", signals: { rating: 4.7, reviews: 900 } };
  let calls = 0;
  const urls = [];
  const oneCategoryDies = async (url) => {
    calls++;
    urls.push(url);
    if (/category\.eq\.attractions|secondary_categories\.cs\.\{attractions\}/.test(url)) throw new Error("attractions timed out");
    // The post-admission photo lookup (place_id=in.(…)) answers with the
    // reference for the one admitted row, so the served card can be checked
    // for it below.
    if (/select=place_id,photo_ref/.test(url)) return page([{ place_id: "cc1", photo_ref: "places/cc1/photos/p1" }]);
    if (/place_id=in\./.test(url)) return page([]);
    return page(/nightlife/.test(url) ? [okRow] : []);
  };
  let served = null;
  try { served = await fetchNightOutPool(27.5949, -82.4265, { env, fetchImpl: oneCategoryDies }); } catch (e) { served = { error: String(e.message) }; }
  ok(calls > 0, "positive control: the injected fetch was actually called");
  ok(served && Array.isArray(served.places) && served.places.some((p) => p.id === "cc1"),
    `one failed category blanked the whole Night Out pool — the surviving categories must still serve (${served && served.error ? served.error : "no places"})`);
  ok(served && served.stats && served.stats.sourceFailures === 1,
    "the failed category is not reported in stats — a degraded answer must say it is degraded");
  const allDie = async () => { throw new Error("db down"); };
  let threw = false;
  try { await fetchNightOutPool(27.5949, -82.4265, { env, fetchImpl: allDie }); } catch (e) { threw = true; }
  ok(threw, "every category failing returned an EMPTY answer instead of throwing — an empty rail set is a claim about the town, and the caller must be able to 503 instead");

  // EVIDENCE STARVATION IS THE LATERAL MOVE. isShow / isLiveMusic / isDateDining
  // and the rest match against name + types + EDITORIAL, so a reader that trims
  // `editorial` out of its select to save bytes would cure candidate starvation
  // by causing evidence starvation — and every count would still look better.
  // Asserted on the REQUEST the reader actually issued, not on the field list as
  // a string, because the string is what a well-meaning payload optimisation
  // edits. (Added after a mutation that removed `editorial` left this suite
  // green.)
  // The POOL pages are the exhaustive category reads; the photo lookup that
  // follows admission is a different request with a different job, so each is
  // asserted on its own shape rather than on "every URL".
  const poolReads = urls.filter((u) => /category\.eq\.|secondary_categories\.cs\./.test(u));
  const photoReads = urls.filter((u) => /select=place_id,photo_ref/.test(u));
  ok(poolReads.length > 0 && poolReads.every((u) => /select=[^&]*\beditorial\b/.test(u)),
    "the Night Out read no longer selects `editorial` — the predicates read editorial text, so trimming it starves the evidence instead of the candidates");
  ok(poolReads.every((u) => /order=place_id\.asc/.test(u)),
    "the Night Out read is no longer ordered — an unordered paged read returns an arbitrary heap slice, which is the upstream half of the starvation bug");
  ok(poolReads.some((u) => /secondary_categories\.cs\.\{/.test(u)),
    "the issued query dropped secondary-category membership");

  // BYTES AFTER IDENTITY (2026-09-09). photo_ref was 59% of every pool page
  // (469 KB of 970 KB, Parrish food page 0) and nothing in admission reads it;
  // that payload is what pushed thirty concurrent pages past their deadline on
  // the 2026-09-09 deploy and served ten 503s. So the exhaustive read must NOT
  // select it, the reference must arrive by a separate lookup for the ADMITTED
  // rows only, and the served card must still carry it — a "payload
  // optimisation" that quietly drops the thumbnail is the failure this guards.
  ok(poolReads.every((u) => !/select=[^&]*\bphoto_ref\b/.test(u)),
    "the exhaustive Night Out pool read selects photo_ref again — that column was 59% of every page and no predicate reads it; hydrate it after admission instead");
  ok(photoReads.length === 1 && /select=place_id,photo_ref/.test(photoReads[0]) && /cc1/.test(decodeURIComponent(photoReads[0])),
    "photo_ref is not hydrated by ONE place_id=in.(…) lookup scoped to the admitted rows");
  ok(served && served.places.find((p) => p.id === "cc1")?.photoRef === "places/cc1/photos/p1",
    "the served Night Out place lost its photoRef — the post-admission hydration must land on the card");
  ok(served && served.stats && served.stats.photoRefs && served.stats.photoRefs.hydrated === 1 && served.stats.photoRefs.failed === 0,
    "the pool stats do not report the photo hydration funnel (requested/hydrated/failed)");

  // A missing thumbnail is not a 503. When the photo lookup itself fails the
  // rails are still served (the card falls back to its monogram), and the
  // answer says it is degraded so completeAnswersOnly() keeps it out of the
  // hour-long cache instead of pinning photo-less rails on every reader.
  const photosDie = async (url) => {
    if (/select=place_id,photo_ref/.test(url)) throw new Error("photo lookup timed out");
    if (/place_id=in\./.test(url)) return page([]);
    return page(/nightlife/.test(url) ? [okRow] : []);
  };
  let photoless = null;
  try { photoless = await fetchNightOutPool(27.5949, -82.4265, { env, fetchImpl: photosDie }); } catch (e) { photoless = { error: String(e.message) }; }
  ok(photoless && Array.isArray(photoless.places) && photoless.places.some((p) => p.id === "cc1" && p.photoRef == null),
    `a failed photo lookup blanked the Night Out pool — the rails must still serve without the thumbnail (${photoless && photoless.error ? photoless.error : "no places"})`);
  ok(photoless && photoless.stats && photoless.stats.degraded === true && photoless.stats.photoRefs.failed === 1,
    "a pool whose photo lookup failed reports degraded:false — it would be cached for an hour without thumbnails");

  const districtRow = {
    place_id: "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8", name: "St. Armands Circle",
    lat: 27.319, lng: -82.577, primary_type: "shopping_mall", category: "shopping",
    google_types: ["shopping_mall"], status: "OPERATIONAL", excluded: false,
    signals: { rating: 4.7, reviews: 4000 },
  };
  const districtUrls = [];
  const districtsOnly = async (url) => {
    districtUrls.push(url);
    if (/select=place_id,photo_ref/.test(url)) return page([{ place_id: districtRow.place_id, photo_ref: "places/district/photos/p1" }]);
    if (/place_id=in\./.test(url)) return page([districtRow]);
    return page([]);
  };
  const districtAnswer = await fetchNightOutPool(27.34, -82.54, { env, fetchImpl: districtsOnly });
  const governedDistrict = districtAnswer.places.find((p) => p.id === districtRow.place_id);
  ok(governedDistrict && nightOutPlaceRail(governedDistrict) === "districts" && governedDistrict.photoRef === "places/district/photos/p1",
    "the exact-ID district read shares normal serviceability, geo admission, taxonomy, and post-admission photo hydration");
  const exactRead = districtUrls.find((url) => /select=place_id,name/.test(url) && /place_id=in\./.test(url));
  ok(exactRead && NIGHT_OUT_DISTRICT_IDS.every((id) => decodeURIComponent(exactRead).includes(id)) && !/category\.eq\.shopping/.test(exactRead),
    "district retrieval is one bounded exact-ID read, never a broad shopping-category scan");
  const absentDistricts = await fetchNightOutPool(27.34, -82.54, { env, fetchImpl: async () => page([]) });
  ok(absentDistricts.places.length === 0 && absentDistricts.stats.governedDistrictRows === 0
    && absentDistricts.stats.degraded === false,
  "healthy missing governed IDs stay an honest empty result rather than an error or fabricated card");

  const districtDies = async (url) => {
    if (/select=place_id,photo_ref/.test(url)) return page([]);
    if (/place_id=in\./.test(url)) throw new Error("district lookup timed out");
    return page(/nightlife/.test(url) ? [okRow] : []);
  };
  const degradedDistricts = await fetchNightOutPool(27.5949, -82.4265, { env, fetchImpl: districtDies });
  ok(degradedDistricts.places.some((p) => p.id === "cc1") && degradedDistricts.stats.degraded === true
    && degradedDistricts.stats.districtSourceFailures === 1,
  "a failed governed-district lookup preserves surviving rails and marks the answer degraded");
}
ok(/secondary_categories\.cs\.\{/.test(retrieval), "Night Out no longer includes secondary-category membership — clubs, cabarets and dinner shows are commonly stored under their venue's primary type");
ok(/nightOutEditorialEvidence/.test(route) && /editorialOverride/.test(retrieval),
  "the governed dinner-show evidence override is no longer handed to the reader — a place whose only night-evidence is curated would be refused at admission");
ok(/fetchJsonWithDeadline\("\/api\/night-out[\s\S]{0,180}timeoutMs: 22000/.test(component), "Night Out must allow its bounded server pool plus hydration path to finish before the client deadline");
ok(/usePagedRail\([\s\S]{0,180}timeoutMs: 22000/.test(component) && /timeoutMs \? \{ timeoutMs \} : undefined/.test(pagedRail), "Night Out paging must use the same extended client deadline while shared rails retain their default");
ok(/CLIENT_RAIL_DEADLINE_MS = 10000/.test(clientJson) && /AbortController/.test(clientJson), "reader-facing place rails cannot remain on a permanent skeleton");

// Execute the real client helper with the timeout options extracted from the
// Night Out call. A virtual clock models a 15s server response: the old 10s
// default aborts, while Night Out's 22s override completes.
{
  const timeoutMatch = component.match(/fetchJsonWithDeadline\("\/api\/night-out[^\n]*\n?\s*\{\s*timeoutMs:\s*(\d+),\s*retries:\s*1\s*\}/);
  const nightOutTimeout = Number(timeoutMatch?.[1]);
  const run = async (timeoutMs) => {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const realFetch = globalThis.fetch;
    let clock = 0;
    let next = 1;
    const timers = new Map();
    globalThis.setTimeout = (fn, ms) => { const id = next++; timers.set(id, { at: clock + ms, fn }); return id; };
    globalThis.clearTimeout = (id) => { timers.delete(id); };
    try {
      globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason || new Error("aborted")), { once: true });
        const id = globalThis.setTimeout(() => resolve({ ok: true, json: async () => ({ rails: ["server"] }) }), 15000);
        init.signal.addEventListener("abort", () => globalThis.clearTimeout(id), { once: true });
      });
      const pending = fetchJsonWithDeadline("/api/night-out?fixture=1", { timeoutMs, retries: 1 });
      while (timers.size) {
        const [id, timer] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        timers.delete(id); clock = timer.at; timer.fn();
        await Promise.resolve();
      }
      return await pending;
    } catch (error) { return { error }; }
    finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; globalThis.fetch = realFetch; }
  };
  const old = await run(10000);
  const current = await run(nightOutTimeout);
  ok(nightOutTimeout === 22000, `Night Out timeout option was not extracted as 22000ms (${nightOutTimeout})`);
  ok(old.error, "the old 10s client deadline did not abort a simulated 15s server response");
  ok(current?.rails?.[0] === "server", "the current Night Out client deadline did not allow a simulated 15s server response");
}

if (failures.length) {
  console.error("test-night-out-intent: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`test-night-out-intent: OK — ${pass} assertions`);
