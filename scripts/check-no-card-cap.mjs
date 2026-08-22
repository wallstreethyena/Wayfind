#!/usr/bin/env node
/**
 * check-no-card-cap — THERE IS NO MAX.
 *
 * Owner, 2026-08-22: *"fuck the 12 max, removed the 12 max and lets have no
 * max"* … *"no more max on anything"*.
 *
 * WHY A GUARD AND NOT JUST A DELETED CONSTANT. A ceiling is the easiest thing
 * in this codebase to reintroduce by accident, because every one of its
 * disguises looks like tidy code: a `.slice(0, 12)` while rendering, a `limit`
 * while merging, a "sane default" while paginating. It also always LOOKS
 * correct — a rail trimmed to twelve is a full, beautiful, correctly-ordered
 * rail. Exactly like a rail with no identity looked correct
 * (scripts/check-rail-identity.mjs), the damage is invisible: the cards that
 * were thrown away had already passed the identity and earned their place, and
 * nothing renders to say they existed.
 *
 * MAX_CARDS itself came back twice already — 8, then 12 — each time described
 * in the source as "cosmetic". Cosmetic is precisely the problem: it was never
 * a quality rule, it was a tidiness rule, and it was quietly deciding how much
 * of the owner's own curation the product was willing to show. The batch-2
 * brief said "send 10-12 per slot" for no reason except this constant.
 *
 * WHAT IS PINNED
 *   1. MAX_CARDS does not exist, under that name or any other.
 *   2. No module in the rail path trims a rail or a pool on the way out.
 *   3. A rail built from a deep pool is LONGER than the old ceiling — the
 *      property is demonstrated by execution, not by reading source.
 *   4. MIN_CARDS survives. The floor is a promise about HONESTY (a rail that
 *      cannot fill ships empty rather than borrowing) and is the opposite kind
 *      of rule from the ceiling. Deleting it in the name of "no max on
 *      anything" would make rails lie, so it is asserted here on purpose.
 *   5. The ladder stop (NEARBY_TARGET_ROWS) survives too, for the same reason:
 *      it is what stops the 6-mile ring from widening to 17 when it is already
 *      full, which is the entire mechanism that keeps retrieval LOCAL. It caps
 *      distance, never inventory.
 */
import { readFileSync } from "node:fs";
import * as RS from "../lib/railSelect.js";
import * as NP from "../lib/nearbyPool.js";
import { MIN_CARDS, fillRails } from "../lib/railSelect.js";
import { NEARBY_TARGET_ROWS } from "../lib/nearbyPool.js";

let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ── 1. the constant is gone, and stays gone ─────────────────────────────────
for (const [mod, name] of [[RS, "lib/railSelect.js"], [NP, "lib/nearbyPool.js"]]) {
  for (const key of Object.keys(mod)) {
    ok(!/^(MAX_CARDS|MAX_ROWS|CARD_CAP|RAIL_CAP|NEARBY_POOL_CAP|POOL_CAP)$/.test(key),
      `${name} exports "${key}" — a ceiling by another name is still a ceiling`);
  }
}
ok(RS.MAX_CARDS === undefined, "MAX_CARDS must not exist");
ok(NP.NEARBY_POOL_CAP === undefined, "NEARBY_POOL_CAP must not exist");

// ── 2. nothing trims on the way out ─────────────────────────────────────────
// Deliberately narrow: `.slice(0, N)` inside a SHAPE (types.slice(0, 8)) is a
// field-width rule and is fine. What is banned is trimming a list of PLACES.
const RAIL_SRC = read("../lib/railSelect.js");
const POOL_SRC = read("../lib/nearbyPool.js");
const DATA_SRC = read("../lib/railsData.js");
const TRIM_RX = /\b(rows|out|best|picked|windows\[[a-z]+\]|places\[[a-z]+\]|pickedByRail\[[a-z]+\])\s*\.slice\(\s*0\s*,/;
for (const [src, name] of [[RAIL_SRC, "lib/railSelect.js"], [POOL_SRC, "lib/nearbyPool.js"], [DATA_SRC, "lib/railsData.js"]]) {
  const hit = src.split("\n").find((l) => TRIM_RX.test(l) && !/^\s*(\/\/|\*)/.test(l));
  ok(!hit, `${name} trims a list of places on the way out: ${String(hit).trim().slice(0, 90)}`);
}
ok(!/w\.length\s*>=\s*[A-Z_]+\)\s*break/.test(RAIL_SRC),
  "the exposure window must not break out at a ceiling — that is MAX_CARDS wearing a loop");

// ── 3. demonstrated by execution, not by reading ────────────────────────────
// 40 qualifying restaurants in, and the rail must come out longer than the old
// twelve. A source-only guard would pass against a ceiling applied downstream.
{
  const mk = (i) => ({
    id: "r" + i, name: "Restaurant " + i, rating: 4.5, reviews: 500 - i,
    types: ["italian_restaurant", "restaurant"], primaryType: "italian_restaurant",
    distMi: 3, _s: 90 - i, governed_score: 90 - i, priceLevel: "PRICE_LEVEL_MODERATE",
  });
  const many = Array.from({ length: 40 }, (_, i) => mk(i));
  const pools = { restaurants: many, "things-to-do": [], beaches: [], nightlife: [], creators: [], summer: [], birthday: [], breakfast: [], quickeats: [], family: [], events: [], drive: [], localpicks: [] };
  const { places } = fillRails(pools, (p) => p, { cityLabel: "Test" });
  ok((places.eat || []).length > 12,
    `40 qualifying restaurants must produce a rail longer than the old ceiling (eat came out ${(places.eat || []).length})`);
  ok((places.eat || []).length === 40,
    `…and in fact ALL of them: every row passed the identity and earned a card (${(places.eat || []).length} of 40)`);
  const sc = (places.eat || []).map((p) => p.governed_score);
  ok(sc.every((v, i) => i === 0 || sc[i - 1] >= v), "…still in governed-score order — no ceiling, no reorder");
}

// ── 4. the FLOOR is not a ceiling and must survive ──────────────────────────
ok(MIN_CARDS === 3,
  "MIN_CARDS is a promise about HONESTY — a rail that cannot fill ships empty rather than borrowing. " +
  "It is the opposite kind of rule from the ceiling and must not be deleted alongside it.");
{
  const two = [{ id: "a", name: "A", rating: 4.5, reviews: 100, types: ["italian_restaurant"], primaryType: "italian_restaurant", distMi: 2, _s: 90, governed_score: 90 },
               { id: "b", name: "B", rating: 4.5, reviews: 100, types: ["italian_restaurant"], primaryType: "italian_restaurant", distMi: 2, _s: 89, governed_score: 89 }];
  const pools = { restaurants: two, "things-to-do": [], beaches: [], nightlife: [], creators: [], summer: [], birthday: [], breakfast: [], quickeats: [], family: [], events: [], drive: [], localpicks: [] };
  const { places, thin } = fillRails(pools, (p) => p, { cityLabel: "Test" });
  ok((places.eat || []).length === 0 && thin.includes("eat"),
    "a rail below MIN_CARDS still ships EMPTY — removing the ceiling must not have removed the floor");
}

// ── 5. the ladder stop caps DISTANCE, never inventory ───────────────────────
ok(Number.isFinite(NEARBY_TARGET_ROWS) && NEARBY_TARGET_ROWS > 15,
  "NEARBY_TARGET_ROWS must survive: it stops the 6-mile ring widening to 17 when it is already full, " +
  "which is what keeps retrieval local. It bounds the RADIUS, not the number of cards.");

// ── 6. the exposure cap is gone too, because it was a max ───────────────────
// It removed EIGHT of forty qualifying restaurants from `eat` — not from the
// visible top, from the rail entirely — because they also led best/today/
// datenight. That trade bought visible variety when a rail was twelve cards
// long; with no ceiling it just deletes inventory a reader could scroll to.
// The answer to repetition is a sharper IDENTITY on the echoing rail
// (scripts/check-rail-identity.mjs), never a cap.
ok(RS.RAIL_EXPOSURE_CAP === undefined, "RAIL_EXPOSURE_CAP must not exist — it is a max");
ok(!/capExposure/.test(RAIL_SRC), "…and neither may the function that applied it");
ok(!/ban\.set\(/.test(RAIL_SRC), "…nor any ban map that deletes a row from a rail it qualified for");

if (failures) {
  console.error(`\ncheck-no-card-cap: ${failures} FAILED of ${asserts} assertions`);
  process.exit(1);
}
console.log(`check-no-card-cap: ${asserts} assertions OK — no ceiling in the rail path, 40 in gives 40 out, the MIN_CARDS floor and the distance ladder both survive`);
