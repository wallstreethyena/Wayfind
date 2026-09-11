import assert from "node:assert/strict";
import { browseBookableMatches } from "../lib/browseBookableMatch.js";
import { prepareBrowseExperienceRows, readCompleteBrowseExperiences, selectExperienceView } from "../lib/experiencesServe.js";

const row = (title, categories = []) => ({ title, categories });

assert.equal(browseBookableMatches(row("Peppa Pig Theme Park Tickets", ["theme"]), "family", "toddlers"), true);
assert.equal(browseBookableMatches(row("Children's Museum Indoor Family Admission", ["museums"]), "family", "rainy"), true);
assert.equal(browseBookableMatches(row("Family-Friendly Food and History Walk for Parents and Kids"), "family", "adults"), true);
assert.equal(browseBookableMatches(row("Live Jazz Music Walking Tour"), "nightlife", "music"), true);
assert.equal(browseBookableMatches(row("Thermal Spa and Massage Experience"), "attractions", "spa"), true);
assert.equal(browseBookableMatches(row("Clearwater Beach Dolphin Boat Tour"), "attractions", "beaches"), true);
assert.equal(browseBookableMatches(row("Orlando Kayak Nature Adventure"), "attractions", "outdoors"), true);
assert.equal(browseBookableMatches(row("Sarasota Art Gallery Tour"), "attractions", "arts"), true);
assert.equal(browseBookableMatches(row("Tampa Sailboat Cruise"), "attractions", "marinas"), true);

assert.equal(browseBookableMatches(row("Outdoor Theme Park Admission", ["theme"]), "family", "rainy"), false);
assert.equal(browseBookableMatches(row("Aquarium and Outdoor Boat Tour", ["museums"]), "family", "rainy"), false);
assert.equal(browseBookableMatches(row("Theme Park Thrill Ride", ["theme"]), "family", "toddlers"), false);
assert.equal(browseBookableMatches(row("Orlando Shooting Experience", ["theme"]), "family", "all"), false);
assert.equal(browseBookableMatches(row("Family-friendly 21+ party experience", ["theme"]), "family", "all"), false);
assert.equal(browseBookableMatches(row("Family adults-only sunset cruise", ["theme"]), "family", "all"), false);
assert.equal(browseBookableMatches(row("Haunted Family Ghost Tour", ["theme"]), "family", "kids"), false);
assert.equal(browseBookableMatches(row("Formula 1 Racing Simulator", ["theme"]), "family", "all"), true);
assert.equal(browseBookableMatches(row("Formula 1 Racing Simulator", ["theme"]), "family", "kids"), false);
assert.equal(browseBookableMatches(row("Adults Only Kayak Adventure", ["adventure"]), "family", "adults"), false);
assert.equal(browseBookableMatches(row("Haunted Ghost Tour at Night"), "nightlife", "music"), false);
assert.equal(browseBookableMatches(row("Clear Kayak Ecotour", ["kayaking"]), "attractions", "spa"), false);
assert.equal(browseBookableMatches(row("Downtown Walking Food Tour"), "food", "all"), false);
assert.equal(browseBookableMatches(row("Hotel Pickup City Tour"), "hotels", "all"), false);
assert.equal(browseBookableMatches(row("Anything"), "family", "not-a-chip"), false);
assert.equal(browseBookableMatches(row("Beach Street Haunted Ghost Tour"), "attractions", "beaches"), false);
assert.equal(browseBookableMatches(row("The Art of Chocolate Food Tour"), "attractions", "arts"), false);
assert.equal(browseBookableMatches(row("Historic Museum Boat Exhibit"), "attractions", "marinas"), false);
assert.equal(browseBookableMatches(row("Downtown Food and Cocktail Walking Tour"), "attractions", "outdoors"), false);

assert.equal(browseBookableMatches({ title: "Peppa Pig Theme Park tickets", subcategory: "theme_parks" }, "family", "toddlers", { kind: "deal" }), true);
assert.equal(browseBookableMatches({ title: "Fun Spot admission", subcategory: "theme_parks" }, "family", "all", { kind: "deal" }), true);
assert.equal(browseBookableMatches({ title: "Universal theme park admission", subcategory: "theme_parks" }, "family", "rainy", { kind: "deal" }), false);
assert.equal(browseBookableMatches({ title: "Premium five-star resort package", subcategory: "theme_park_hotels" }, "hotels", "luxury", { kind: "deal" }), true);
assert.equal(browseBookableMatches({ title: "Museum admission", subcategory: "museum" }, "attractions", "museums", { kind: "deal" }), true);
assert.equal(browseBookableMatches({ title: "Theme park hotel package", subcategory: "theme_park_hotels" }, "hotels", "beach", { kind: "deal" }), false);
assert.equal(browseBookableMatches({ title: "Haunted Halloween night", subcategory: "seasonal_events" }, "nightlife", "music", { kind: "deal" }), false);
assert.equal(browseBookableMatches({ title: "Mystery offer", subcategory: "unknown" }, "attractions", "all", { kind: "deal" }), false);
assert.equal(browseBookableMatches({ title: "Theme park", subcategory: "theme_parks" }, "unknown", "all", { kind: "deal" }), false);

const qualified = Array.from({ length: 55 }, (_, i) => ({
  title: `Live Music Concert Experience ${i}`,
  categories: [], image: `https://img/${i}.jpg`, product_url: `https://viator/${i}`, link_ok: true,
}));
qualified.unshift(
  { title: "Live Music dead", image: "https://img/dead.jpg", product_url: "https://viator/dead", link_ok: false },
  { title: "Live Music no image", image: null, product_url: "https://viator/no-image", link_ok: true },
  { title: "Ghost Tour", image: "https://img/ghost.jpg", product_url: "https://viator/ghost", link_ok: true },
);
const eligible = prepareBrowseExperienceRows(qualified, "nightlife", "music");
assert.equal(eligible.slice(0, 50).length, 50);
assert.equal(eligible.some((r) => /dead|no image|Ghost/.test(r.title)), false);
assert.equal(selectExperienceView(eligible, "concept:nightlife", true).length, 55,
  "exact browse membership is authoritative; the older nightlife concept must not discard music rows afterward");
assert.equal(selectExperienceView(eligible, "concept:nightlife", false).length, 0,
  "legacy callers retain their existing catalogue/concept filter behavior");

const corpus = Array.from({ length: 2051 }, (_, i) => ({ product_code: String(i).padStart(5, "0") }));
corpus.splice(1000, 0, { product_code: "00999" }); // duplicate straddles two pages
const ranges = [];
const pageUrls = [];
const fakeFetch = async (url, init) => {
  const [from, to] = init.headers.Range.split("-").map(Number);
  ranges.push([from, to]);
  pageUrls.push(url);
  return { ok: true, status: 200, json: async () => corpus.slice(from, to + 1) };
};
const complete = await readCompleteBrowseExperiences({ url: "https://db.test", key: "test" }, ["25738"], { fetchImpl: fakeFetch, pageSize: 1000, maxRows: 3000 });
assert.equal(complete.length, 2051);
assert.equal(complete.at(-1).product_code, "02050", "a qualifying row after the old 2,000 cut remains readable");
assert.equal(complete.filter((r) => r.product_code === "00999").length, 1, "paged results dedupe by stable product key");
assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
assert.ok(pageUrls.every((url) => url.includes("order=product_code.asc")), "every page uses the stable unique product key");

const overCap = async (_url, init) => {
  const [from, to] = init.headers.Range.split("-").map(Number);
  return { ok: true, status: 200, json: async () => Array.from({ length: to - from + 1 }, (_, i) => ({ product_code: from + i })) };
};
await assert.rejects(
  readCompleteBrowseExperiences({ url: "https://db.test", key: "test" }, ["25738"], { fetchImpl: overCap, pageSize: 2, maxRows: 4 }),
  /complete-read ceiling/,
);

let slowPage = 0;
await assert.rejects(
  readCompleteBrowseExperiences({ url: "https://db.test", key: "test" }, ["25738"], {
    pageSize: 1, maxRows: 3, deadlineMs: 1,
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, status: 200, json: async () => [{ product_code: String(slowPage++) }] };
    },
  }),
  /deadline/,
);

console.log("test-browse-bookable-match: OK");
