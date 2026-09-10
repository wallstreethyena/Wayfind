import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectPosterEvents, posterEventBucket } from "../lib/posterEvents.js";
import { composeSummerPickRails } from "../lib/summerPicks.js";
import { withSummerSportsRail } from "../lib/summerSports.js";

const center = { lat: 27.34, lng: -82.54 };
const now = new Date("2026-09-10T16:00:00Z");
const event = (id, fields = {}) => ({ id, name: id, date: "2026-09-11", lat: 27.34, lng: -82.54, dest: "/events/test/" + id, segment: "Music", ...fields });
const pick = (rows, mode) => selectPosterEvents(rows, { mode, center, now });
const crowd = Array.from({ length: 30 }, (_, i) => event("sport" + i, { segment: "Sports" }));
const lateConcert = event("concert-after-30");
assert.deepEqual(pick([...crowd, lateConcert], "date-night").livemusic.map(e => e.id), [lateConcert.id], "a concert beyond the old shared top 24 reaches its own rail");
assert.equal(pick(crowd, "summer-sports").sports.length, 30, "sports are not silently capped by the mixed event rail");
const bad = [
  event("wrong-city", { lat: 28.54, lng: -81.38, distMi: 1 }),
  event("missing-lat", { lat: null }), event("missing-lng", { lng: "" }),
  event("past", { date: "2026-09-09" }), event("cancelled", { status: "cancelled" }),
  event("building", { date: undefined }), event("no-dest", { dest: null }),
];
assert.equal(pick(bad, "date-night").livemusic.length, 0, "stale, wrong-city, unknown-location, undated and destinationless rows cannot fill a rail");
assert.equal(pick([lateConcert, lateConcert], "date-night").livemusic.length, 1, "duplicate event ids are rendered once per rail");
const top = Array.from({ length: 15 }, (_, i) => event("concert" + i, { local_rank: i * 5 }));
const entertainment = pick([...crowd, ...top, event("comedy", { segment: "Arts & Theatre", genre: "Comedy", local_rank: 95 })], "today-entertainment").entertainment;
assert.equal(entertainment.length, 10, "Do Something Better contains only the top ten eligible comedy/concerts");
assert.equal(entertainment[0].id, "comedy", "a demand-backed comedy event can lead concerts");
assert(entertainment.every(e => ["concerts", "comedy"].includes(posterEventBucket(e))));
const play = event("The Comedy of Errors", { segment: "Arts & Theatre" });
assert.equal(posterEventBucket(play), "theater", "a play is not standup because comedy appears in its title");
const night = pick([play, lateConcert], "night-out");
assert(night["live-music"].some(e => e.id === play.id), "the requested theater overlap reaches Live Music");
assert(night.shows.some(e => e.id === lateConcert.id), "concerts also reach Shows");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
assert(home.includes("setForyouEvents(frontPageEvents(evs, eventBucket).usable)"), "the full source pool reaches poster selection before any UI cap");
assert(home.includes("selectPosterEvents(fp.usable.filter"), "the real homepage event slot delegates selection to the tested boundary");
assert(!/import\s+\{[^}]*selectPosterEvents[^}]*\}\s+from/.test(home), "poster selectors do not enter the eager homepage bundle");
assert(home.includes('mode = "events", selectPosterEvents = null'), "the event slot receives its selector from the opened poster");
for (const [component, mode] of [["NightOutRails", "night-out"], ["DateNightRails", "date-night"], ["SummerIntentRails", "summer-sports"], ["TodayDiscoveryRails", "today-entertainment"]]) {
  const source = readFileSync(new URL(`../app/components/${component}.js`, import.meta.url), "utf8");
  assert(source.includes(`eventsSlot("${mode}", selectPosterEvents)`), `${component} supplies the real selector to its homepage slot`);
}
const dateNightRails = readFileSync(new URL("../app/components/DateNightRails.js", import.meta.url), "utf8");
assert(dateNightRails.includes("payload == null && !failed && !hasLiveMusicAnswer"), "ready concerts are not hidden behind the unrelated venue loading state");
assert(dateNightRails.includes("failed && !hasLiveMusicAnswer"), "ready concerts survive an unrelated venue collection failure");
const summerIntentRails = readFileSync(new URL("../app/components/SummerIntentRails.js", import.meta.url), "utf8");
assert(summerIntentRails.includes("const eventRailAvailable = sports.length > 0 || !!eventSurface?.pending || !!eventSurface?.failed"), "the Summer sports rail owns its availability independently of places and tours");
const supermarket = { id: "publix", name: "Publix Super Market at University Walk", primaryType: "supermarket", types: ["supermarket", "grocery_store", "food", "store"], rating: 4.9, reviews: 2400, photoRef: "places/publix/photos/owned", distMi: 2 };
const boutique = { ...supermarket, id: "boutique", name: "Harbor Vintage Boutique", primaryType: "clothing_store", types: ["clothing_store", "store"] };
const summer = composeSummerPickRails([supermarket, boutique], []);
assert(!summer.some(rail => rail.cards.some(card => card.id === "publix")), "a grocery store cannot enter Summer local finds through Market in its name");
assert(summer.find(rail => rail.id === "shopping").cards.some(card => card.id === "boutique"), "the grocery veto preserves a genuine local shopping destination");
const summerWithSports = withSummerSportsRail(summer, crowd);
assert.equal(summerWithSports.length, 10, "sports replaces the broken events shelf rather than making an eleventh rail");
assert.equal(summerWithSports[2].id, "sports", "real sports events are the third summer rail");
assert.deepEqual(
  summerWithSports.filter(rail => rail.id !== "sports").map(rail => rail.id),
  summer.filter(rail => rail.id !== "events").map(rail => rail.id),
  "the other nine valid summer categories keep their order"
);
assert(!summerWithSports.some(rail => rail.id === "events"), "the tour-only events shelf is removed");
console.log("test-poster-events: 28 checks passed");
