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
ok(composed.rails.find((rail) => rail.id === "clubs").places.map((row) => row.id).join("|") === "club-near|club", "nearby inventory leads a higher-scoring wider-ring card");
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
ok(/\["food", "nightlife", "attractions"\]\.map/.test(route) && /Promise\.allSettled/.test(route), "Night Out reads owned categories in parallel without one stalled category blanking every shelf");
ok(/primaryOnly: false/.test(route) && /nightOutEditorialEvidence/.test(route), "Night Out includes secondary category identity and governed dinner-show evidence");
ok(/fetchJsonWithDeadline\("\/api\/night-out/.test(component), "Night Out has a bounded, retryable reader request");
ok(/CLIENT_RAIL_DEADLINE_MS = 10000/.test(clientJson) && /AbortController/.test(clientJson), "reader-facing place rails cannot remain on a permanent skeleton");

if (failures.length) {
  console.error("test-night-out-intent: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`test-night-out-intent: OK — ${pass} assertions`);
