#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  NIGHT_OUT_MAX_MI, NIGHT_OUT_NEAR_MI, NIGHT_OUT_RAIL_DEFS,
  composeNightOutRails, nightOutDistanceMi, nightOutEventRail, nightOutPlaceRail,
} from "../lib/nightOutIntent.js";
import { windowRailAnswer } from "../lib/railResponse.js";
import { NIGHT_OUT_EDITORIAL_EVIDENCE, nightOutEditorialEvidence } from "../lib/nightOutEvidence.js";

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
ok(nightOutPlaceRail(place({ primaryType: "bar", description: "A friendly neighborhood bar" })) === "cocktails", "a real bar enters the broad Bars and Cocktails rail without being relabelled as a rooftop");
ok(nightOutPlaceRail(place({ primaryType: "cocktail_bar", description: "Craft cocktails" })) === "cocktails", "a cocktail room enters Bars and Cocktails");
ok(nightOutPlaceRail(place({ primaryType: "bar", description: "Patio drinks with city views" })) === "cocktails", "a patio remains a bar and is never used as rooftop evidence");
ok(nightOutPlaceRail(place({ primaryType: "bar", description: "Explicit rooftop bar and skyline" })) === "cocktails", "explicit rooftop evidence enters the cocktail rail");
ok(nightOutPlaceRail(place({ primaryType: "live_music_venue", name: "The Jazz Room" })) === "live-music", "a live-music venue enters Live Music");
ok(nightOutPlaceRail(place({ primaryType: "restaurant", name: "Mystery Dinner Theater" })) === "dinner-entertainment", "a dinner show enters Dinner + Entertainment");
ok(nightOutPlaceRail(place({ primaryType: "fine_dining_restaurant", name: "Candlelit Omakase", description: "Romantic tasting menu" })) === "date-dining", "occasion-level dining enters Date-Night Dining");
ok(nightOutPlaceRail(place({ primaryType: "restaurant", name: "Ordinary Grill" })) == null, "an ordinary restaurant cannot become Date-Night Dining");
ok(nightOutPlaceRail(place({ primaryType: "comedy_club", name: "Laugh House Comedy Club" })) === "shows", "a comedy club enters Shows rather than Clubs");
ok(nightOutPlaceRail(place({ primaryType: "tourist_attraction", name: "Disney Springs Entertainment District" })) === "districts", "an explicit after-dark district enters Districts");
ok(nightOutPlaceRail(place({ primaryType: "tour_operator", name: "Moonlight Harbor Cruise" })) === "waterfront", "a night cruise enters Waterfront");
ok(nightOutPlaceRail(place({ primaryType: "tour_operator", name: "Downtown Ghost Night Tour" })) === "night-tours", "a ghost walk enters Night Tours");
ok(nightOutPlaceRail(place({ primaryType: "bar", name: "Player One Arcade Bar" })) === "social-play", "an arcade bar stays exclusively in Social Play");

ok(nightOutEventRail({ id: "concert", name: "The National in Concert", segment: "Music", date: "2026-09-02" }) === "live-music", "a dated concert enters Live Music");
ok(nightOutEventRail({ id: "comedy", name: "Kevin Nealon Comedy", segment: "Arts & Theatre", date: "2026-09-02" }) === "shows", "a dated comedy show enters Shows");
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
ok(composed.rails.flatMap((rail) => rail.places).length === new Set(composed.rails.flatMap((rail) => rail.places.map((row) => row.id))).size, "each venue belongs to at most one Night Out rail");

const longAnswer = { rails: [{ id: "cocktails", places: Array.from({ length: 20 }, (_, id) => ({ id })) }] };
const firstWindow = windowRailAnswer(longAnswer);
ok(firstWindow.rails[0].places.length === 12, "first paint carries a bounded ranked window");
ok(firstWindow.rails[0].total === 20 && firstWindow.hasMore === true, "the compact answer preserves the full truthful count");
ok(windowRailAnswer(longAnswer, true).rails[0].places.length === 20, "the full cached inventory remains available on request");

const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/NightOutRails.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/night-out/route.js", import.meta.url), "utf8");
const clientJson = readFileSync(new URL("../lib/clientJson.js", import.meta.url), "utf8");
ok(/id: "events"[\s\S]{0,420}retiredInto: "tonight"/.test(rails), "the standalone Events poster is retired into Night Out without deleting its metadata");
ok(/!r\.retiredInto/.test(daypart), "retired posters are hidden from the tile track");
ok(/requested\.retiredInto \|\| id/.test(daypart), "legacy Events deep links resolve to Night Out");
ok(/NightOutRails = dynamic/.test(daypart) && /<NightOutRails/.test(daypart), "the ten-rail Night Out component is lazy and mounted behind its tile");
ok(/eventsSlot=\{eventsSlot\}/.test(daypart) && /eventsSlot\("night-out"\)/.test(component), "Night Out consumes the existing dated event inventory");
ok(/mode === "night-out"/.test(home) && /nightOutEventRail\(event\)/.test(home), "home subdivides real EventRailCards through the same Night Out taxonomy");
ok(!/selRail\.id === "events" && eventsSlot/.test(daypart), "the obsolete standalone Events drop is gone");
ok(/selRail\.id === "augtober" \|\| selRail\.id === "tonight"/.test(daypart), "Night Out owns its complete answer and cannot fall through to generic places");
ok(/No verified event or venue within 27 miles/.test(component), "an empty intent tells the truth instead of using a look-alike");
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
const retrieval = route + "\n" + pool;
ok(/\["food", "nightlife", "attractions"\]/.test(retrieval) && /Promise\.allSettled/.test(retrieval),
  "Night Out no longer reads its three owned categories with allSettled — one stalled category would blank every shelf");
{
  const { fetchNightOutPool } = await import("../lib/nightOutPool.js");
  const env = { url: "https://example.invalid", key: "k" };
  const page = (rows) => ({ ok: true, json: async () => rows });
  const okRow = { place_id: "cc1", name: "Comedy Cellar", lat: 27.60, lng: -82.43, primary_type: "comedy_club", google_types: [], status: "OPERATIONAL", signals: { rating: 4.7, reviews: 900 } };
  let calls = 0;
  const urls = [];
  const oneCategoryDies = async (url) => {
    calls++;
    urls.push(url);
    if (/category\.eq\.attractions|secondary_categories\.cs\.\{attractions\}/.test(url)) throw new Error("attractions timed out");
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
  ok(urls.length > 0 && urls.every((u) => /select=[^&]*\beditorial\b/.test(u)),
    "the Night Out read no longer selects `editorial` — the predicates read editorial text, so trimming it starves the evidence instead of the candidates");
  ok(urls.every((u) => /order=place_id\.asc/.test(u)),
    "the Night Out read is no longer ordered — an unordered paged read returns an arbitrary heap slice, which is the upstream half of the starvation bug");
  ok(urls.some((u) => /secondary_categories\.cs\.\{/.test(u)),
    "the issued query dropped secondary-category membership");
}
ok(/secondary_categories\.cs\.\{/.test(retrieval), "Night Out no longer includes secondary-category membership — clubs, cabarets and dinner shows are commonly stored under their venue's primary type");
ok(/nightOutEditorialEvidence/.test(route) && /editorialOverride/.test(retrieval),
  "the governed dinner-show evidence override is no longer handed to the reader — a place whose only night-evidence is curated would be refused at admission");
ok(/fetchJsonWithDeadline\("\/api\/night-out/.test(component), "Night Out has a bounded, retryable reader request");
ok(/CLIENT_RAIL_DEADLINE_MS = 10000/.test(clientJson) && /AbortController/.test(clientJson), "reader-facing place rails cannot remain on a permanent skeleton");

if (failures.length) {
  console.error("test-night-out-intent: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`test-night-out-intent: OK — ${pass} assertions`);
