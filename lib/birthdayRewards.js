// Birthday rewards that passed Wayfind's first-party-source review.
//
// Exact place IDs are deliberate. A chain name is not enough evidence that a
// particular franchise participates, and vague promises ("a surprise", "a
// treat") do not answer the user's question. Stale rows fail closed so an old
// freebie can never keep advertising itself indefinitely.

export const BIRTHDAY_REWARD_MAX_AGE_DAYS = 30;

const VERIFIED_AT = "2026-08-19";

export const BIRTHDAY_REWARDS = [
  { placeId: "ChIJCTw8qAE9w4gRV4bsIMbQ2H8", gift: "1 handcrafted drink, food item, or bottled drink", requirement: "Join Starbucks Rewards 7+ days early and make 1 Star-earning purchase", window: "Birthday day at entry tier" },
  { placeId: "ChIJVcT9hOc4w4gREnfUoBV42RA", gift: "1 rotating Beauty Insider mini gift set", requirement: "Beauty Insider membership; no in-store minimum", window: "Birthday month, while supplies last" },
  { placeId: "ChIJ1wH4N3QWw4gREDvfx8VmUSY", gift: "1 large popcorn", requirement: "AMC Stubs Insider membership; paid tiers also receive a large drink", window: "Check the issued reward window" },
  { placeId: "ChIJ2RTKm1tHw4gRK4xtJw-jqWI", gift: "1 personal-size Bundtlet", requirement: "Bundtastic Rewards membership; no purchase stated", window: "Birthday reward window in the app" },
  { placeId: "ChIJ16W70NY9w4gRG9cBamnCpn0", gift: "1 scoop", requirement: "Baskin-Robbins app account; participation varies", window: "Birthday day" },
  { placeId: "ChIJ_1KKw-oXw4gRGao51ByvSIc", gift: "A cookie or brownie at entry tier; larger gifts at higher tiers", requirement: "Chick-fil-A One membership; the gift depends on tier", window: "Check the issued reward" },
  { placeId: "ChIJZ0W_vt04w4gRlbOczIeB2k0", gift: "1 slice of cheesecake or layer cake", requirement: "Cheesecake Rewards membership and any purchase", window: "Birthday reward window in the app" },
  { placeId: "ChIJ_5OG3Z45w4gRbGmfLDXwT6A", gift: "1 single cookie", requirement: "Crumbl Rewards Silver status", window: "Birthday reward window in the app" },
  { placeId: "ChIJ6yU9i-IVw4gRo01we-1UEZU", gift: "Birthday pancakes", requirement: "International Bank of Pancakes membership", window: "Check the issued reward" },
  { placeId: "ChIJmyxjyZgXw4gRB3WmGve_TxY", gift: "1 rotating Ulta birthday gift", requirement: "Rewards profile with birthdate and marketing opt-in; online redemption requires purchase", window: "Birthday month" },
  { placeId: "ChIJHaxvqjIjw4gRAr21gNtVWBw", gift: "1 pretzel", requirement: "Pretzel Perks membership; no purchase stated", window: "30-day birthday window" },
  { placeId: "ChIJyUVHMkMRw4gRWxSSGDprdYQ", gift: "1 Create Your Own Dish with 2 toppings", requirement: "MyCulver's membership", window: "Birthday month" },
  { placeId: "ChIJObBe1x8Ww4gRZocRz7u1X2g", gift: "1 dessert", requirement: "My Chili's Rewards membership", window: "Expires 10 days after issue" },
  { placeId: "ChIJbQc50hEWw4gRekS45lcFEFU", gift: "1 donut", requirement: "Duck Donuts Rewards account active within the prior 365 days", window: "Birthday month" },
  { placeId: "ChIJafhu4hYWw4gRyNie7mo17V4", gift: "72 Shore Points — enough for a regular sub", requirement: "MyMike's membership and a regular or giant sub purchase in the prior 12 months", window: "Birthday reward window in the account" },
  { placeId: "ChIJiVUwo8Y9w4gRyfRSxgrLTps", gift: "1 burrito", requirement: "Moe Rewards membership", window: "Check the issued reward" },
  { placeId: "ChIJ82ZQGhEWw4gRyW9_GZld-8I", gift: "1 dessert with dine-in meal", requirement: "Tell the restaurant it is your birthday", window: "During the birthday meal" },
  { placeId: "ChIJ3TqagqwXw4gRSzSibPN094s", gift: "1 free 20 oz smoothie", requirement: "Smoothie King Healthy Rewards Champion tier", window: "Birthday reward window in the app" },
].map((reward) => ({ ...reward, verifiedAt: VERIFIED_AT }));

const BY_PLACE_ID = new Map(BIRTHDAY_REWARDS.map((reward) => [reward.placeId, reward]));

export const BIRTHDAY_REWARD_PLACE_IDS = BIRTHDAY_REWARDS.map((reward) => reward.placeId);

// Place IDs survive indefinitely, but businesses can close, rename, or be
// replaced at the same pin. The gift must therefore agree with BOTH the exact
// ID and the brand identity currently returned by inventory. This is what
// keeps a former Duck Donuts pin from promising a Duck Donuts reward after it
// becomes "Bradenton Donut Shop", and a former Moe's pin from promising a
// burrito after it becomes a convenience store.
const BRAND_BY_PLACE_ID = new Map([
  ["ChIJCTw8qAE9w4gRV4bsIMbQ2H8", "starbucks"],
  ["ChIJVcT9hOc4w4gREnfUoBV42RA", "sephora"],
  ["ChIJ1wH4N3QWw4gREDvfx8VmUSY", "amc"],
  ["ChIJ2RTKm1tHw4gRK4xtJw-jqWI", "nothing bundt cakes"],
  ["ChIJ16W70NY9w4gRG9cBamnCpn0", "baskin robbins"],
  ["ChIJ_1KKw-oXw4gRGao51ByvSIc", "chick fil a"],
  ["ChIJZ0W_vt04w4gRlbOczIeB2k0", "cheesecake factory"],
  ["ChIJ_5OG3Z45w4gRbGmfLDXwT6A", "crumbl"],
  ["ChIJ6yU9i-IVw4gRo01we-1UEZU", "ihop"],
  ["ChIJmyxjyZgXw4gRB3WmGve_TxY", "ulta"],
  ["ChIJHaxvqjIjw4gRAr21gNtVWBw", "auntie annes"],
  ["ChIJyUVHMkMRw4gRWxSSGDprdYQ", "culvers"],
  ["ChIJObBe1x8Ww4gRZocRz7u1X2g", "chilis"],
  ["ChIJbQc50hEWw4gRekS45lcFEFU", "duck donuts"],
  ["ChIJafhu4hYWw4gRyNie7mo17V4", "jersey mikes"],
  ["ChIJiVUwo8Y9w4gRyfRSxgrLTps", "moes"],
  ["ChIJ82ZQGhEWw4gRyW9_GZld-8I", "olive garden"],
  ["ChIJ3TqagqwXw4gRSzSibPN094s", "smoothie king"],
]);

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function brandMatches(placeName, brand) {
  const name = normalizedName(placeName);
  const expected = normalizedName(brand);
  return name === expected || name.startsWith(expected + " ") || name.startsWith("the " + expected);
}

export function birthdayRewardFor(placeId, now = new Date(), placeName = "") {
  const reward = BY_PLACE_ID.get(String(placeId || ""));
  if (!reward) return null;
  const brand = BRAND_BY_PLACE_ID.get(reward.placeId);
  if (placeName && brand && !brandMatches(placeName, brand)) return null;
  const verified = new Date(reward.verifiedAt + "T00:00:00Z");
  const current = now instanceof Date ? now : new Date(now);
  const ageDays = (current.getTime() - verified.getTime()) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > BIRTHDAY_REWARD_MAX_AGE_DAYS) return null;
  return { ...reward };
}
