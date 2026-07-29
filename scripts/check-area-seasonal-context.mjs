#!/usr/bin/env node
/**
 * check-area-seasonal-context — the city x season header prose stays true.
 *
 * Same standard the rest of the site already enforces, applied to a new grain:
 *   - no price, hours, phone number, review count or rating in prose. Those are
 *     structured fields; prose that states them goes stale silently and nothing
 *     catches it (the rule check-copy applies to user-facing strings and
 *     check-intent-copy-matches-filter applies to subheads).
 *   - no fabricated superlatives or "#1" claims. This copy has no ranking
 *     mechanism behind it, so it may not imply one.
 *   - coverage is partial ON PURPOSE. A city with no entry must render NOTHING
 *     rather than a generic line, so this asserts the absence of a default.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const src = readFileSync(path.resolve("lib/areaSeasonalContext.js"), "utf8");
const mod = await import(path.resolve("lib/areaSeasonalContext.js"));
const { AREA_SEASONAL_CONTEXT, areaSeasonalContext } = mod;

const SEASONS = ["winter", "spring", "summer", "fall"];
const cities = Object.keys(AREA_SEASONAL_CONTEXT);
ok(cities.length >= 3, `at least three cities are seeded (got ${cities.length})`);

// Banned in prose. Each pattern is a STRUCTURED field that lives elsewhere.
const BANNED = [
  [/\$\s?\d|\d+\s?(dollars|bucks)|\bfree admission\b/i, "a price"],
  [/\b\d{1,2}\s?(am|pm)\b|\bopens? at\b|\bcloses? at\b|\buntil \d/i, "an hour"],
  [/\(\d{3}\)|\b\d{3}[-.]\d{3}[-.]\d{4}\b/, "a phone number"],
  [/\b[\d,]+\s?(reviews|ratings)\b/i, "a review count"],
  [/\b[0-5]\.\d\s?★|\b[0-5]\.\d\s?stars?\b/i, "a rating"],
  [/\bnumber one\b|\b#1\b|\bthe best\b|\bworld[- ]class\b|\bvoted\b/i, "an unbacked superlative"],
];

let sentences = 0;
for (const city of cities) {
  for (const season of SEASONS) {
    const e = AREA_SEASONAL_CONTEXT[city][season];
    ok(!!e, `${city}.${season} exists — a seeded city must cover all four seasons or the header vanishes for part of the year`);
    if (!e) continue;
    for (const field of ["headline_context", "area_known_for"]) {
      const v = e[field] || "";
      sentences++;
      ok(v.length >= 40, `${city}.${season}.${field} is a real sentence, not a stub (got ${v.length} chars)`);
      ok(v.length <= 220, `${city}.${season}.${field} stays caption-length (got ${v.length} chars)`);
      for (const [re, what] of BANNED) {
        ok(!re.test(v), `${city}.${season}.${field} must not state ${what} — that is a structured field and prose stating it goes stale silently`);
      }
    }
  }
}

// The whole point of the grain: season copy must actually DIFFER by season.
// If headline_context were identical across seasons it would be area copy
// wearing a season label.
for (const city of cities) {
  const heads = SEASONS.map((s) => AREA_SEASONAL_CONTEXT[city][s].headline_context);
  ok(new Set(heads).size === SEASONS.length, `${city}: headline_context differs across all four seasons — otherwise it is not seasonal context`);
}

// Unknown city -> nothing. No generic default is allowed to creep in.
ok(areaSeasonalContext("Nowheresville", "summer") === null, "an unseeded city returns null — coverage is partial on purpose, and a generic default is what this replaces");
ok(areaSeasonalContext("Orlando", "summer") !== null, "a seeded city resolves case-insensitively from display-cased page context");
ok(!/default|fallback\s*=/.test(src) || !/AREA_SEASONAL_CONTEXT\s*\|\|/.test(src), "no default entry is substituted for an unseeded city");

if (fail.length) {
  console.error("check-area-seasonal-context: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-area-seasonal-context: OK — ${pass} assertions over ${sentences} sentences (${cities.length} cities x 4 seasons, no price/hours/phone/reviews/ratings, no generic default)`);
