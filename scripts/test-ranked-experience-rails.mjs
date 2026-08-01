// Every score-bearing bookable-experience collection must use the same order
// users can verify from the card badges: Wayfind Score, highest to lowest.
// Story rails, chronological event lists, contextual "right now" picks and
// unscored deal shelves are intentionally outside this contract.
import { readFileSync } from "node:fs";
import { rankExperiences, experienceWayfindScore } from "../lib/experiencesData.js";

let pass = 0;
const fail = (m) => { console.error("test-ranked-experience-rails: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const rows = [
  { title: "Low", rating: 4.1, reviews: 9000 },
  { title: "Tiny five", rating: 5, reviews: 3, sellingFast: true, fromPrice: 1 },
  { title: "Best", rating: 4.8, reviews: 5000 },
  { title: "New", rating: null, reviews: 0 },
];
const ranked = rankExperiences(rows);
ok(ranked.every((x, i) => i === 0 || experienceWayfindScore(ranked[i - 1]) >= experienceWayfindScore(x)), "scores are non-increasing");
ok(ranked[0].title === "Best", "the highest displayed Wayfind Score is first");
ok(ranked.at(-1).title === "New", "unscored inventory sorts after scored inventory");
ok(ranked.indexOf(rows[1]) > 0, "selling-fast and low price cannot buy the first position");
ok(rows[0].title === "Low", "the helper does not mutate its input");

const consumers = [
  ["app/components/ViatorRail.js", /rankExperiences\(items\)/],
  ["app/components/FoodTourRail.js", /rankExperiences\(offers\)/],
  ["app/components/TourStrip.js", /rankExperiences\(arr\.filter/],
  ["app/components/BookingCTA.js", /rankExperiences\(viaTours\[placeId\]\.items\)/],
  ["app/components/screens/Events.js", /rankExperiences\(eventsTours\)/],
  ["lib/experiencesServe.js", /rankExperiences\(view\.map\(rowToCard\)\)/],
];
for (const [file, pattern] of consumers) {
  const src = read(file);
  ok(/rankExperiences/.test(src) && pattern.test(src), file + " delegates its displayed collection to the shared ranker");
}

const home = read("app/home.js");
ok((home.match(/rankExperiences\(/g) || []).length >= 5, "home bookable rails and their API fallbacks all use the shared ranker");
const bookableWindow = home.slice(home.indexOf("v4.84 Viator as a real activity source"), home.indexOf("// v4.62: real nearby teasers"));
ok(!/\.sort\([^\n]*(sellingFast|sellingOut|reviews|rating)/.test(bookableWindow), "home has no competing inline bookable-rail sort");

console.log(`test-ranked-experience-rails: OK — ${pass} assertions (all score-bearing bookable collections share visible-score order)`);
