#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  BIRTHDAY_RAIL_ORDER,
  birthdayRailMembership,
  composeBirthdayRails,
  hasPrivateDiningRoom,
  isBeachfront,
  isDanceClub,
  isRooftop,
  isSpeakeasy,
  isUpscaleBirthdayDinner,
} from "../lib/birthdayIntent.js";
import { birthdayAttributesFor } from "../lib/birthdayAttributes.js";
import { BIRTHDAY_REWARD_MAX_AGE_DAYS, BIRTHDAY_REWARD_PLACE_IDS, birthdayRewardFor } from "../lib/birthdayRewards.js";

let passed = 0;
function ok(condition, message) {
  if (!condition) throw new Error("FAIL: " + message);
  passed += 1;
}

ok(BIRTHDAY_RAIL_ORDER.join("|") === "gifts|upscale|private|rooftops|beachfront|clubs|speakeasies", "exact seven-rail order is locked");
ok(BIRTHDAY_RAIL_ORDER.length === 7, "exactly seven rails");

ok(!isDanceClub({ name: "Birthday Bistro", primaryType: "restaurant", types: ["night_club"] }), "restaurant with secondary nightclub tag is not a dance club");
ok(!isDanceClub({ name: "The Club Sandwich", primaryType: "sandwich_shop" }), "club in a food name is not a dance club");
ok(isDanceClub({ name: "Club Space", primaryType: "night_club", rating: 4.5, reviews: 1000 }), "quality primary nightclub identity qualifies");
ok(!isDanceClub({ name: "Side Splitters Comedy Club", primaryType: "night_club" }), "a comedy venue mislabeled as a nightclub is not a dance club");
ok(isDanceClub({ name: "Joyland", primaryType: "night_club", editorial: "DJs and line-dancing lessons", rating: 4.3, reviews: 313 }), "a primary nightclub with direct dance evidence qualifies");

ok(!isRooftop({ name: "Terrace Grill", editorial: "A beautiful terrace for dinner" }), "terrace alone is not rooftop");
ok(isRooftop({ name: "Sky Room", primaryType: "bar", editorial: "A verified rooftop bar above downtown", rating: 4.5, reviews: 200 }), "explicit quality rooftop bar qualifies");
ok(!isRooftop({ name: "Arcade Monsters", primaryType: "video_arcade", editorial: "An arcade with a rooftop deck" }), "an arcade with a roof deck is not a rooftop celebration venue");
ok(!isRooftop({ name: "SpringHill Suites", primaryType: "hotel", editorial: "A hotel with a rooftop pool" }), "a hotel rooftop pool is not a rooftop venue");
ok(!isRooftop({ name: "TAIGA", primaryType: "night_club", editorial: "A rooftop nightclub", rating: 4.1, reviews: 300 }), "a below-floor rooftop does not clear the Birthday quality bar");

ok(!isBeachfront({ name: "Miami Beach Bistro", editorial: "A waterfront dining room on the bay" }), "coastal city and waterfront are not beachfront");
ok(isBeachfront({ name: "Gulf House", primaryType: "restaurant", types: ["restaurant"], editorial: "A Gulf-front dining room directly on the beach", rating: 4.5, reviews: 200 }), "explicit quality Gulf-front restaurant evidence qualifies");

ok(!hasPrivateDiningRoom({ name: "Big Table", editorial: "Accepts large reservations and celebrations" }), "large-party language is not a private room");
ok(hasPrivateDiningRoom({ name: "The Reserve", editorial: "A private dining room for twelve" }), "explicit private dining room qualifies");
ok(birthdayAttributesFor("ChIJy_kXMwA5w4gRrR3QiupGkCA")?.privateDining === true, "Fleming's exact venue carries first-party private-room evidence");
ok(birthdayAttributesFor("ChIJxepVxb04w4gR7b1DL9dOt8M")?.privateDining === true, "Capital Grille's exact venue carries first-party private-room evidence");

ok(!isSpeakeasy({ name: "Cocktail Lounge", editorial: "Craft cocktails in a low-lit lounge" }), "cocktail lounge alone is not a speakeasy");
ok(isSpeakeasy({ name: "The Door", editorial: "A hidden speakeasy behind the bookcase", rating: 4.6, reviews: 150 }), "explicit quality speakeasy qualifies");
ok(!isSpeakeasy({ name: "Pangea Alchemy Lab", editorial: "A lounge with a speakeasy vibe" }), "speakeasy vibe does not become an actual speakeasy");
ok(isSpeakeasy({ name: "Craftails Speakeasy", primaryType: "bar", rating: 4.5, reviews: 69 }), "an explicitly named quality speakeasy qualifies");

const upscaleBase = { primaryType: "restaurant", types: ["restaurant"], rating: 4.6, reviews: 800, priceNum: 2 };
ok(!isUpscaleBirthdayDinner({ ...upscaleBase, name: "Miller's Ale House", editorial: "Casual sports-pub chain" }), "an ale house cannot enter upscale through a secondary type");
ok(!isUpscaleBirthdayDinner({ ...upscaleBase, name: "Woody's River Roo", editorial: "Casual tiki bar and grill", types: ["restaurant", "fine_dining_restaurant"] }), "a casual tiki grill cannot enter upscale through a false fine-dining tag");
ok(!isUpscaleBirthdayDinner({ ...upscaleBase, name: "Applebee's", editorial: "Informal family restaurant", types: ["restaurant", "steak_house"] }), "a family chain cannot enter upscale through a steakhouse tag");
ok(isUpscaleBirthdayDinner({ ...upscaleBase, name: "Michael John's", primaryType: "french_restaurant", priceNum: 3, editorial: "Polished French-American steak and seafood room" }), "a polished expensive restaurant clears the upscale promise");

const multi = {
  id: "multi", name: "Birthday Roof", primaryType: "fine_dining_restaurant",
  types: ["restaurant"], priceNum: 4, rating: 4.8, reviews: 500,
  editorial: "Fine dining with a verified rooftop and private dining room",
  distMi: 4,
};
const composed = composeBirthdayRails([multi]);
ok(composed.rails.length === 7, "composer returns all seven rails, including honest empties");
ok(birthdayRailMembership("upscale", multi), "upscale predicate admits a real fine-dining meal");
ok(birthdayRailMembership("private", multi) && birthdayRailMembership("rooftops", multi), "legitimate multi-rail membership is preserved");

const reward = birthdayRewardFor("ChIJCTw8qAE9w4gRV4bsIMbQ2H8", new Date("2026-08-31T00:00:00Z"));
ok(!!reward && reward.gift.includes("handcrafted"), "fresh exact reward resolves by place ID");
ok(birthdayRewardFor("not-a-place", new Date("2026-08-31T00:00:00Z")) === null, "unknown place ID has no reward");
ok(birthdayRewardFor("ChIJCTw8qAE9w4gRV4bsIMbQ2H8", new Date("2026-10-01T00:00:00Z")) === null, "stale reward fails closed");
ok(BIRTHDAY_REWARD_MAX_AGE_DAYS === 30, "reward freshness ceiling is locked at 30 days");
ok(BIRTHDAY_REWARD_PLACE_IDS.length === 18, "the exact-gift registry preserves all 18 offers with a stated item");
ok(birthdayRewardFor("ChIJbQc50hEWw4gRekS45lcFEFU", new Date("2026-08-31T00:00:00Z"), "Bradenton Donut Shop") === null, "a changed venue cannot inherit Duck Donuts' gift");
ok(birthdayRewardFor("ChIJiVUwo8Y9w4gRyfRSxgrLTps", new Date("2026-08-31T00:00:00Z"), "Nick & Moes Bradenton 005") === null, "a changed venue cannot inherit Moe's burrito");

const ranked = composeBirthdayRails([
  { ...multi, id: "lower", name: "Lower", rating: 4.4, reviews: 2000, distMi: 2 },
  { ...multi, id: "higher", name: "Higher", rating: 4.8, reviews: 2000, distMi: 20 },
]).rails.find((rail) => rail.id === "upscale").places;
ok(ranked[0]?.id === "higher", "Birthday rails rank by displayed Wayfind Score before distance");

const batch = JSON.parse(readFileSync(new URL("../data/birthday/enrichment-batch-2026-08-31.json", import.meta.url), "utf8"));
ok(batch.places.length === 50, "owner enrichment batch preserves all 50 candidates");
ok(new Set(batch.places.map((place) => place.name + "|" + place.city)).size === 50, "enrichment batch has no duplicate name/city pair");
ok(batch.status === "needs_place_id_and_first_party_evidence", "enrichment candidates cannot publish by name alone");

console.log(`test-birthday-intent: OK — ${passed}/${passed} assertions`);
