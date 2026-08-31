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
} from "../lib/birthdayIntent.js";
import { BIRTHDAY_REWARD_MAX_AGE_DAYS, birthdayRewardFor } from "../lib/birthdayRewards.js";

let passed = 0;
function ok(condition, message) {
  if (!condition) throw new Error("FAIL: " + message);
  passed += 1;
}

ok(BIRTHDAY_RAIL_ORDER.join("|") === "gifts|upscale|private|rooftops|beachfront|clubs|speakeasies", "exact seven-rail order is locked");
ok(BIRTHDAY_RAIL_ORDER.length === 7, "exactly seven rails");

ok(!isDanceClub({ name: "Birthday Bistro", primaryType: "restaurant", types: ["night_club"] }), "restaurant with secondary nightclub tag is not a dance club");
ok(!isDanceClub({ name: "The Club Sandwich", primaryType: "sandwich_shop" }), "club in a food name is not a dance club");
ok(isDanceClub({ name: "Club Space", primaryType: "night_club" }), "primary nightclub identity qualifies");

ok(!isRooftop({ name: "Terrace Grill", editorial: "A beautiful terrace for dinner" }), "terrace alone is not rooftop");
ok(isRooftop({ name: "Sky Room", editorial: "A verified rooftop bar above downtown" }), "explicit rooftop qualifies");

ok(!isBeachfront({ name: "Miami Beach Bistro", editorial: "A waterfront dining room on the bay" }), "coastal city and waterfront are not beachfront");
ok(isBeachfront({ name: "Gulf House", editorial: "A Gulf-front dining room directly on the beach" }), "explicit Gulf-front evidence qualifies");

ok(!hasPrivateDiningRoom({ name: "Big Table", editorial: "Accepts large reservations and celebrations" }), "large-party language is not a private room");
ok(hasPrivateDiningRoom({ name: "The Reserve", editorial: "A private dining room for twelve" }), "explicit private dining room qualifies");

ok(!isSpeakeasy({ name: "Cocktail Lounge", editorial: "Craft cocktails in a low-lit lounge" }), "cocktail lounge alone is not a speakeasy");
ok(isSpeakeasy({ name: "The Door", editorial: "A hidden speakeasy behind the bookcase" }), "explicit speakeasy qualifies");

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

const batch = JSON.parse(readFileSync(new URL("../data/birthday/enrichment-batch-2026-08-31.json", import.meta.url), "utf8"));
ok(batch.places.length === 50, "owner enrichment batch preserves all 50 candidates");
ok(new Set(batch.places.map((place) => place.name + "|" + place.city)).size === 50, "enrichment batch has no duplicate name/city pair");
ok(batch.status === "needs_place_id_and_first_party_evidence", "enrichment candidates cannot publish by name alone");

console.log(`test-birthday-intent: OK — ${passed}/${passed} assertions`);
