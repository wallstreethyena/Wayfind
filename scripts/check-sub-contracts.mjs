// scripts/check-sub-contracts.mjs — A CHIP THAT FILTERS NOTHING IS A LIE.
//
// WHY (owner, 2026-08-21, with a screenshot of Night out > CLUBS returning
// "Keke's Breakfast Cafe" at #1): "how is keke a fucking club ... audit the
// entire www.gowayfind for bugs like this and fix it and prevent it from
// happening ever again".
//
// placeAllowed resolves its allow-list as:
//     SUB_ALLOW[cat + ":" + sub]  ||  CAT_ALLOW[cat]
// so a sub-chip with NO SUB_ALLOW entry silently applies the same filter as
// "All". There was not one `nightlife:*` key, so all six Night out chips were
// decorative — and CAT_ALLOW.nightlife ends in `|restaurant|`, which is how a
// breakfast cafe with a 9.6 became the top nightclub in Bradenton.
//
// THE RULE: every chip in lib/google.js's SUBS either has a contract, or is
// declared here as deliberately category-wide WITH A REASON. Silence is not an
// option, because silence is what shipped.
import { readFileSync } from "node:fs";
import { SUB_ALLOW, NARROW_SUBS } from "../lib/placeFilter.js";

let checks = 0, bad = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-sub-contracts: FAIL — " + m); } };

// Chips whose promise really is the category's promise. Each needs a reason a
// human wrote, so "we forgot" can never masquerade as "we decided".
const CATEGORY_WIDE = {
  "food:dinner": "a time of day, not a venue kind — acknowledged debt; Lunch got a real contract in v8.50 (isLunchPlace) because a breakfast cafe led it",
  "food:quickbites": "acknowledged debt: 'quick' is a service-speed promise with no Google type behind it. Needs a real contract or renaming; category-wide today",
  "food:delivery": "acknowledged debt: delivery is an attribute Google does not type. Needs a real signal",
  "food:dessert": "acknowledged debt: the dessert regex exists inline in placeAllowed's meal-signal branch rather than as a SUB_ALLOW contract",
  "hotels:luxury": "acknowledged debt — price/class tiering, not a type contract",
  "hotels:budget": "acknowledged debt — price/class tiering, not a type contract",
  "hotels:beach": "acknowledged debt — proximity, not a type",
  "hotels:boutique": "acknowledged debt — no contract yet",
  "attractions:all": "the 'all' chip is the category by definition",
};

// Read the chips from their source of truth so adding one extends this guard.
const g = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const block = g.slice(g.indexOf("food:"), g.indexOf("export", g.indexOf("food:")));
let cur = null;
const chips = [];
for (const line of block.split("\n")) {
  const c = line.match(/^\s{2}([a-z]+):\s*\[/);
  if (c) { cur = c[1]; continue; }
  const i = line.match(/\{\s*id:\s*"([a-z]+)"/);
  if (i && cur && i[1] !== "all") chips.push(cur + ":" + i[1]);
}
ok(chips.length > 20, `found only ${chips.length} sub-chips — this guard has lost its subject`);

for (const key of chips) {
  ok(!!SUB_ALLOW[key] || !!CATEGORY_WIDE[key],
    `${key} has no SUB_ALLOW contract and is not declared category-wide. It therefore shows the SAME results as "All" — the chip is decorative. Write a contract, or declare it in CATEGORY_WIDE with a reason.`);
}

// A floor. The bug was the ABSENCE of these, so their absence must fail loudly
// rather than shrink the guard's subject back to green.
for (const key of ["nightlife:clubs", "nightlife:bars", "nightlife:sports", "nightlife:karaoke", "nightlife:speakeasy", "nightlife:music", "shopping:malls", "shopping:boutiques", "shopping:markets", "shopping:outlets"]) {
  ok(!!SUB_ALLOW[key], `${key} lost its contract — that is the exact regression that put a breakfast cafe at the top of Clubs`);
}

// The narrow chips must stay narrow: matching a secondary tag is how a vape
// shop and a comedy theatre qualified as nightclubs.
for (const key of ["nightlife:clubs", "nightlife:karaoke", "nightlife:sports", "nightlife:speakeasy", "nightlife:bars"]) {
  ok(NARROW_SUBS.has(key), `${key} must be in NARROW_SUBS so it matches PRIMARY identity, not any secondary type Google hangs on a place`);
}

// Anchoring is what makes the type tokens safe: `_` is a word character, so
// \bbar\b cannot match inside oyster_bar_restaurant. An unanchored bare token
// re-opens exactly that door.
for (const key of Object.keys(SUB_ALLOW).filter((k) => k.startsWith("nightlife:"))) {
  const src = String(SUB_ALLOW[key]);
  ok(!/(?<!\\b)\|(bar|pub|club|disco)\|/.test(src),
    `${key} contains an UNANCHORED bare token — it will match inside oyster_bar_restaurant / public_bath / discount_store. Use \\b...\\b.`);
}

if (bad) { console.error(`check-sub-contracts: ${bad} failure(s)`); process.exit(1); }
console.log(`check-sub-contracts: OK — ${checks} assertions over ${chips.length} sub-chips (${Object.keys(SUB_ALLOW).length} contracts, ${Object.keys(CATEGORY_WIDE).length} declared category-wide)`);
