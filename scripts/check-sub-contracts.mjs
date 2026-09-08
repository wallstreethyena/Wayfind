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
  "food:dinner": "a time of day, not a venue kind — CHIP_IDENTITY names it server-side; a client SUB_ALLOW blew the 496KB homepage ratchet. Lunch keeps isLunchPlace (#951). Bars stay (O'bricks).",
  "food:quickbites": "acknowledged debt: 'quick' is a service-speed promise with no Google type behind it — a SUB_ALLOW regex here blew the 496KB homepage ratchet",
  "food:delivery": "acknowledged debt: delivery is an attribute Google does not type. Needs a real signal — unioning unfiltered food would turn the chip into All",
  "food:dessert": "acknowledged debt: dessert identity lives in CHIP_IDENTITY / the meal-signal branch; a second SUB_ALLOW regex is homepage-JS weight",
  "hotels:luxury": "acknowledged debt — price/class tiering; CHIP_IDENTITY names it server-side, SUB_ALLOW on the client blew the 496KB ratchet",
  "hotels:budget": "acknowledged debt — price/class tiering; same ratchet",
  "hotels:beach": "acknowledged debt — proximity; same ratchet",
  "hotels:boutique": "acknowledged debt — no client contract; CHIP_IDENTITY names it server-side",
  "attractions:all": "the 'all' chip is the category by definition",
};

// Read SUBFILTERS from its source of truth. google.js is a client module with
// extensionless imports, so importing it from Node would exercise the wrong
// thing (and fail before reaching SUBFILTERS). Extracting and evaluating the
// balanced declaration does evaluate the actual initializer, including every
// category, while avoiding a fragile line/indentation scrape.
function balancedObject(source, start) {
  const open = source.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i], next = source[i + 1];
    if (lineComment) { if (ch === "\n") lineComment = false; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

function readSubfilters() {
  const source = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
  const marker = "export const SUBFILTERS =";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("lib/google.js has no export const SUBFILTERS declaration");
  const object = balancedObject(source, start + marker.length);
  if (!object) throw new Error("lib/google.js SUBFILTERS declaration is not balanced");
  // This initializer is the literal object in lib/google.js; no imports or
  // calls are permitted inside it. Keeping the evaluation here makes a
  // malformed declaration fail loudly instead of shrinking to zero chips.
  return Function(`"use strict"; return (${object});`)();
}

const SUBFILTERS = readSubfilters();
const EXPECTED_SUBCHIPS = new Set([
  "food:breakfast", "food:cafes", "food:lunch", "food:dinner", "food:quickbites", "food:delivery", "food:dessert",
  "nightlife:bars", "nightlife:clubs", "nightlife:speakeasy", "nightlife:karaoke", "nightlife:sports", "nightlife:music",
  "attractions:outdoors", "attractions:beaches", "attractions:museums", "attractions:family", "attractions:tours", "attractions:spa", "attractions:landmarks", "attractions:arts", "attractions:marinas",
  "beach:beaches", "family:toddlers", "family:kids", "family:adults", "family:rainy",
  "hotels:luxury", "hotels:budget", "hotels:beach", "hotels:boutique",
  "shopping:malls", "shopping:boutiques", "shopping:markets", "shopping:outlets", "shopping:giftshops",
]);

function enumerateSubchips(subfilters) {
  return new Set(Object.entries(subfilters).flatMap(([cat, subs]) =>
    (Array.isArray(subs) ? subs : []).filter((s) => s && s.id !== "all").map((s) => `${cat}:${s.id}`)));
}

function coverageErrors(subfilters) {
  const actual = enumerateSubchips(subfilters);
  const errors = [];
  for (const key of actual) {
    if (!EXPECTED_SUBCHIPS.has(key)) errors.push(`${key} is an unexpected SUBFILTERS chip; update the exact identity set and its contract`);
    const contract = SUB_ALLOW[key];
    if (!contract && !CATEGORY_WIDE[key]) errors.push(`${key} has no SUB_ALLOW contract and is not declared category-wide`);
    if (contract && (!(contract instanceof RegExp) || !String(contract).replace(/^\/(.*)\/[a-z]*$/, "$1").trim())) {
      errors.push(`${key} has an empty or non-regex SUB_ALLOW contract`);
    }
  }
  for (const key of EXPECTED_SUBCHIPS) if (!actual.has(key)) errors.push(`${key} is missing from the actual SUBFILTERS declaration`);
  for (const key of Object.keys(CATEGORY_WIDE)) {
    if (key !== "attractions:all" && !EXPECTED_SUBCHIPS.has(key)) errors.push(`${key} is category-wide but not in the exact non-All identity set`);
    if (typeof CATEGORY_WIDE[key] !== "string" || CATEGORY_WIDE[key].trim().length < 20) errors.push(`${key} category-wide declaration lacks a meaningful reason`);
  }
  return errors;
}

const chips = [...enumerateSubchips(SUBFILTERS)];
ok(chips.length === EXPECTED_SUBCHIPS.size, `found ${chips.length} non-All sub-chips; expected the exact ${EXPECTED_SUBCHIPS.size}`);
for (const error of coverageErrors(SUBFILTERS)) ok(false, error);

// Mutation proofs: remove a real Food chip and add an uncontracted chip. Both
// must be observed by this guard; otherwise a future parser regression can
// report green while silently losing the subject it is meant to protect.
const removedFood = structuredClone(SUBFILTERS);
removedFood.food = removedFood.food.filter((s) => s.id !== "breakfast");
const removedErrors = coverageErrors(removedFood);
ok(removedErrors.some((e) => e.includes("food:breakfast") && e.includes("missing")),
  "mutation proof: removing Food:breakfast is detected as missing");
const addedChip = structuredClone(SUBFILTERS);
addedChip.food = [...addedChip.food, { id: "parser_probe", label: "Parser probe", query: "parser probe" }];
const addedErrors = coverageErrors(addedChip);
ok(addedErrors.some((e) => e.includes("food:parser_probe") && e.includes("unexpected")),
  "mutation proof: adding an uncontracted chip is detected as unexpected");

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
