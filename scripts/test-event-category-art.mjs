import assert from "node:assert/strict";
import { communityEventArtKind, eventCategoryArt } from "../lib/eventCategoryArt.js";

const cases = [
  ["Saturday Storytime for Kids", "kids"],
  ["Family Splash Day", "kids"],
  ["Summer Learning Balloon Show", "kids"],
  ["Downtown Farmers Market", "market"],
  ["Holiday Artisan Bazaar", "market"],
  ["Taste of Main Street Food Festival", "food"],
  ["Local Brewery Dinner", "food"],
  ["Oakwood Neighborhood Block Party", "neighborhood"],
  ["Community Heritage Parade", "neighborhood"],
  ["Friday Social Gathering", "social"],
];

for (const [name, expected] of cases) {
  assert.equal(communityEventArtKind({ name }), expected, `${name} should use ${expected} artwork`);
}

assert.equal(
  communityEventArtKind({ name: "Community Family Food Festival" }),
  "kids",
  "kid-friendly language must take priority over broad community and food terms",
);
assert.equal(
  communityEventArtKind({ name: "Community Farmers Market Dinner" }),
  "market",
  "explicit market formats must take priority over food language",
);
assert.equal(
  communityEventArtKind({ name: "From Debt to Direction", category: "Community" }),
  "social",
  "the generic Community bucket must not force neighborhood artwork",
);
assert.equal(eventCategoryArt("concerts"), "/events/concerts-audience.jpg");
assert.equal(eventCategoryArt("community", { name: "Neighborhood Cleanup" }), "/events/community-neighborhood.jpg");

console.log(`test-event-category-art: OK — ${cases.length + 4} matching and priority assertions`);
