// Birthday rewards that passed Wayfind's first-party-source review.
//
// Exact place IDs are deliberate. A chain name is not enough evidence that a
// particular franchise participates, and vague promises ("a surprise", "a
// treat") do not answer the user's question. Stale rows fail closed so an old
// freebie can never keep advertising itself indefinitely.
//
// `claim` (2026-09-01, owner): the card must tell the reader HOW to get the
// gift, not just what it is and what the gate is. One plain sentence, in
// the order a person actually does it: sign up / where it shows up / how to
// redeem. `requirement` stays the terse eligibility line the guide uses.
//
// Two verification cohorts. VERIFIED_AT_CHAINS is the 2026-08-19 review of
// the chain programs against their own terms. VERIFIED_AT_OWNER is 2026-09-01:
// the owner personally received these rewards (screenshots in the session
// record) — Cooper's Hawk, Wahlburgers, and five Toast-app "Happy Birthday"
// offers. Each row carries its own date so the 30-day fail-closed rule ages
// them independently.

export const BIRTHDAY_REWARD_MAX_AGE_DAYS = 30;

const VERIFIED_AT_CHAINS = "2026-08-19";
const VERIFIED_AT_OWNER = "2026-09-01";

const CHAIN_REWARDS = [
  { placeId: "ChIJCTw8qAE9w4gRV4bsIMbQ2H8", gift: "1 handcrafted drink, food item, or bottled drink", requirement: "Join Starbucks Rewards 7+ days early and make 1 Star-earning purchase", claim: "Join Starbucks Rewards at least a week before your birthday, buy one thing through the app, then order in the app on the day and the reward applies at checkout", window: "Birthday day at entry tier" },
  { placeId: "ChIJVcT9hOc4w4gREnfUoBV42RA", gift: "1 rotating Beauty Insider mini gift set", requirement: "Beauty Insider membership; no in-store minimum", claim: "Join Beauty Insider (free), then walk in any day of your birthday month and give the register your account phone number; nothing to buy", window: "Birthday month, while supplies last" },
  { placeId: "ChIJ1wH4N3QWw4gREDvfx8VmUSY", gift: "1 large popcorn", requirement: "AMC Stubs Insider membership; paid tiers also receive a large drink", claim: "Join AMC Stubs Insider (free) with your birthdate, then show the reward in the AMC app at the concession stand", window: "Check the issued reward window" },
  { placeId: "ChIJ2RTKm1tHw4gRK4xtJw-jqWI", gift: "1 personal-size Bundtlet", requirement: "Bundtastic Rewards membership; no purchase stated", claim: "Join Bundtastic Rewards in the app with your birthdate; the Bundtlet reward appears in the app and you scan it at the counter", window: "Birthday reward window in the app" },
  { placeId: "ChIJ16W70NY9w4gRG9cBamnCpn0", gift: "1 scoop", requirement: "Baskin-Robbins app account; participation varies", claim: "Download the Baskin-Robbins app and add your birthday; the coupon lands in the app on the day, so call this shop first to confirm they take it", window: "Birthday day" },
  { placeId: "ChIJ_1KKw-oXw4gRGao51ByvSIc", gift: "A cookie or brownie at entry tier; larger gifts at higher tiers", requirement: "Chick-fil-A One membership; the gift depends on tier", claim: "Join Chick-fil-A One in the app with your birthdate; the gift shows under Rewards and you redeem it on a mobile order or scan at the register", window: "Check the issued reward" },
  { placeId: "ChIJZ0W_vt04w4gRlbOczIeB2k0", gift: "1 slice of cheesecake or layer cake", requirement: "Cheesecake Rewards membership and any purchase", claim: "Join Cheesecake Rewards, then order anything and show the birthday reward in the app when you pay", window: "Birthday reward window in the app" },
  { placeId: "ChIJ_5OG3Z45w4gRbGmfLDXwT6A", gift: "1 single cookie", requirement: "Crumbl Rewards Silver status", claim: "Reach Silver in Crumbl Rewards before your birthday; the free cookie appears in the app and you scan it at pickup", window: "Birthday reward window in the app" },
  { placeId: "ChIJ6yU9i-IVw4gRo01we-1UEZU", gift: "Birthday pancakes", requirement: "International Bank of Pancakes membership", claim: "Join the International Bank of Pancakes in the IHOP app; the birthday reward appears in the app and you show it to your server", window: "Check the issued reward" },
  { placeId: "ChIJmyxjyZgXw4gRB3WmGve_TxY", gift: "1 rotating Ulta birthday gift", requirement: "Rewards profile with birthdate and marketing opt-in; online redemption requires purchase", claim: "Add your birthdate to your Ulta Rewards profile and stay opted in to emails; walk in during your birthday month and ask for the gift at the register", window: "Birthday month" },
  { placeId: "ChIJHaxvqjIjw4gRAr21gNtVWBw", gift: "1 pretzel", requirement: "Pretzel Perks membership; no purchase stated", claim: "Join Pretzel Perks in the app with your birthdate; the free pretzel appears in the app and you scan it at the counter", window: "30-day birthday window" },
  { placeId: "ChIJyUVHMkMRw4gRWxSSGDprdYQ", gift: "1 Create Your Own Dish with 2 toppings", requirement: "MyCulver's membership", claim: "Join MyCulver's in the app with your birthdate; the reward appears in the app during your birthday month and you scan it when you order", window: "Birthday month" },
  { placeId: "ChIJObBe1x8Ww4gRZocRz7u1X2g", gift: "1 dessert", requirement: "My Chili's Rewards membership", claim: "Join My Chili's Rewards with your birthdate; the dessert reward appears in the app and you apply it when you pay at the table", window: "Expires 10 days after issue" },
  { placeId: "ChIJbQc50hEWw4gRekS45lcFEFU", gift: "1 donut", requirement: "Duck Donuts Rewards account active within the prior 365 days", claim: "Join Duck Donuts Rewards and make one purchase sometime in the year before; the birthday donut appears in the app and you scan it at the counter", window: "Birthday month" },
  { placeId: "ChIJafhu4hYWw4gRyNie7mo17V4", gift: "72 Shore Points — enough for a regular sub", requirement: "MyMike's membership and a regular or giant sub purchase in the prior 12 months", claim: "Join MyMike's and buy one sub in the year before; the birthday points land in your account and you redeem them for a regular sub at checkout", window: "Birthday reward window in the account" },
  { placeId: "ChIJiVUwo8Y9w4gRyfRSxgrLTps", gift: "1 burrito", requirement: "Moe Rewards membership", claim: "Join Moe Rewards in the app with your birthdate; the burrito reward appears in the app and you scan it when you order", window: "Check the issued reward" },
  { placeId: "ChIJ82ZQGhEWw4gRyW9_GZld-8I", gift: "1 dessert with dine-in meal", requirement: "Tell the restaurant it is your birthday", claim: "Dine in and tell your server it is your birthday; no app, no sign-up", window: "During the birthday meal" },
  { placeId: "ChIJ3TqagqwXw4gRSzSibPN094s", gift: "1 free 20 oz smoothie", requirement: "Smoothie King Healthy Rewards Champion tier", claim: "Reach Champion tier in Healthy Rewards before your birthday; the smoothie reward appears in the app and you scan it at the register", window: "Birthday reward window in the app" },
].map((reward) => ({ ...reward, verifiedAt: VERIFIED_AT_CHAINS }));

// Toast "Happy Birthday" rewards: restaurants on the Toast point-of-sale
// system can hand out a birthday credit through the Toast app. Same mechanism
// at every one of these: add your birthday to your Toast profile, the reward
// appears under Happy Birthday in the Toast app for a short window, and you
// tap "Redeem at checkout" when you pay. Dollar amounts are set per restaurant.
const TOAST_CLAIM = "Add your birthday to your profile in the Toast app; the credit appears under Happy Birthday for about a week and you tap Redeem at checkout when you pay";

const OWNER_VERIFIED_REWARDS = [
  { placeId: "ChIJg3dcWgZHw4gRXN7pMNzP_pA", gift: "$15 birthday reward", requirement: "Cooper's Hawk Wine Club member; in-restaurant only, not online ordering", claim: "Join the Cooper's Hawk Wine Club, make a reservation in the Cooper's Hawk app, and tell your server you are using the birthday reward; about 30 days to use it", window: "About 30 days from issue" },
  { placeId: "ChIJz5Lpb5c_w4gRivPISVkQG3A", gift: "1 free non-alcoholic shake", requirement: "Wahlburgers email list with your birthdate", claim: "Sign up for Wahlburgers emails with your birthdate; the offer arrives by email and you show that email when you visit; good for 14 days", window: "14 days from the email" },
  { placeId: "ChIJM8axstRBw4gRHspeUf6y0LQ", gift: "$10 birthday credit", requirement: "Toast app profile with your birthday", claim: TOAST_CLAIM, window: "About 1 week around your birthday" },
  { placeId: "ChIJ80Omqfw7w4gRgrn1EifPaLI", gift: "$10 birthday credit", requirement: "Toast app profile with your birthday", claim: TOAST_CLAIM, window: "About 1 week around your birthday" },
  { placeId: "ChIJ32YG_ao5w4gRpzcR49e5sMo", gift: "$8 birthday credit", requirement: "Toast app profile with your birthday", claim: TOAST_CLAIM, window: "About 2 weeks around your birthday" },
  { placeId: "ChIJ93xkycqB3YgRNZsM0xQxc4g", gift: "$5 birthday credit", requirement: "Toast app profile with your birthday", claim: TOAST_CLAIM, window: "About 1 week around your birthday" },
  { placeId: "ChIJZ0WpaL9954gRFo0ONKNKC-w", gift: "$5 birthday credit", requirement: "Toast app profile with your birthday", claim: TOAST_CLAIM, window: "About 2 weeks around your birthday" },
].map((reward) => ({ ...reward, verifiedAt: VERIFIED_AT_OWNER }));

export const BIRTHDAY_REWARDS = [...CHAIN_REWARDS, ...OWNER_VERIFIED_REWARDS];

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
  ["ChIJg3dcWgZHw4gRXN7pMNzP_pA", "coopers hawk"],
  ["ChIJz5Lpb5c_w4gRivPISVkQG3A", "wahlburgers"],
  ["ChIJM8axstRBw4gRHspeUf6y0LQ", "turmeric indian"],
  ["ChIJ80Omqfw7w4gRgrn1EifPaLI", "wheat water"],
  ["ChIJ32YG_ao5w4gRpzcR49e5sMo", "riviera french"],
  ["ChIJ93xkycqB3YgRNZsM0xQxc4g", "k bob"],
  ["ChIJZ0WpaL9954gRFo0ONKNKC-w", "melao bakery"],
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
