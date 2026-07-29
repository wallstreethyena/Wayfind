#!/usr/bin/env node
/**
 * check-cuisine-chip-floor — the chip list is DERIVED and the floor is honest.
 *
 * Owner's rules, 2026-07-29:
 *   3+ high-confidence places -> full chip
 *   1-2                       -> shown WITH the honest count, not hidden
 *   0                         -> absent
 *   never widen the radius past the metro to pad a list
 *   only HIGH-CONFIDENCE rows count toward the gate
 *   order by real local coverage, never national search volume
 *
 * The revenue argument for the middle tier is why it must not drift to "hide it":
 * an honest thin chip still routes a user to a bookable place; a hidden one routes
 * them to Google.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { ALL_CUISINES } from "../lib/cuisine.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const sql = readFileSync(path.resolve("supabase/migrations/20260730_wf_cuisine_chips.sql"), "utf8");
const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
ok(code.length > sql.length * 0.2, "stripping SQL comments left the function body intact");

// ── the floor, both boundaries ────────────────────────────────────────────
ok(/places_hi >= 3 then 'full'/.test(code), "3+ high-confidence is a FULL chip");
ok(/else 'thin'/.test(code), "1-2 is THIN, not excluded");
ok(/where places_hi >= 1/.test(code), "0 high-confidence rows are ABSENT entirely");
ok(/nearby/.test(code), "a thin chip carries its honest COUNT in the label, so the user sees 2 and not a promise");
ok(!/places_hi >= 3\s*$/m.test(code) || /places_hi >= 1/.test(code),
  "the 1-2 band is not silently dropped by a single >=3 filter");

// ── high-confidence only ──────────────────────────────────────────────────
ok(/cuisine_confidence >= 0\.70/.test(code),
  "only rows at 0.70+ count toward the gate — a 0.55 editorial guess can tag a place but must not promise a category exists");
ok(/places_all/.test(code),
  "places_all is returned beside places, so the gap between TAGGED and CONFIDENT stays visible instead of being averaged away");

// ── never widen the radius ────────────────────────────────────────────────
ok(!/radius|p_radius|km|miles/i.test(code),
  "the chip function takes no radius: widening past the metro to pad a thin list is the other way the filter-not-a-query rule breaks");
ok(/i\.metro = p_metro/.test(code), "it is scoped to ONE metro — chips are per-metro, never one national list");

// ── ordered by real coverage, not national volume ─────────────────────────
ok(/order by places_hi desc/.test(code),
  "ordered by REAL LOCAL COVERAGE — national search volume would bury cuban, puerto-rican and brazilian, the three this feature exists for");
ok(!/volume|popularity_rank|national/i.test(code), "no national ranking input");

// ── closed places never inflate a count ───────────────────────────────────
ok(/status = 'OPERATIONAL'/.test(code), "a closed restaurant does not count toward a chip");

// ── no static chip array anywhere in the app ──────────────────────────────
// The whole point is derivation. A hardcoded list would silently stop matching
// coverage the first time inventory moved.
{
  const GENERIC_FOOD_WORDS = new Set([
    "breakfast", "burgers", "pizza", "sushi", "seafood", "steakhouse", "american",
    "asian", "italian", "mexican", "chinese", "thai", "indian", "japanese",
    "barbecue", "vegan", "vegetarian", "mediterranean", "greek", "french",
    "caribbean", "ramen", "latin-american",
  ]);
  const DISTINCTIVE = ALL_CUISINES.filter((c) => !GENERIC_FOOD_WORDS.has(c));
  const offenders = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); continue; }
      if (!e.name.endsWith(".js")) continue;
      const src = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      // Only DISTINCTIVE cuisines indicate a chip list. Words like breakfast,
      // burgers, italian, mexican and asian are ordinary food-tag vocabulary and
      // already appear in lib/tags.js, lib/orderInRails.js and home.js for
      // unrelated pre-existing features. Flagging those was a false positive on
      // the first run: it named three real arrays that have nothing to do with
      // the cuisine chooser. A chip list is identifiable by the cuisines nothing
      // ELSE in the app would enumerate.
      for (const m of src.matchAll(/\[[^\]]{0,600}\]/g)) {
        const hits = DISTINCTIVE.filter((c) => new RegExp(`["']${c}["']`).test(m[0]));
        // lib/cuisine.js is the taxonomy itself and is exempt by definition.
        if (hits.length >= 4 && !/lib\/cuisine\.js$/.test(p)) {
          offenders.push(`${p}: array literal with ${hits.length} cuisine strings (${hits.slice(0, 4).join(", ")}…)`);
          break;
        }
      }
    }
  };
  walk(path.resolve("app"));
  walk(path.resolve("lib"));
  ok(DISTINCTIVE.includes("puerto-rican") && DISTINCTIVE.includes("cuban") && DISTINCTIVE.includes("colombian"),
    "the distinctive set covers the cuisines that only a chip list would enumerate");
  ok(DISTINCTIVE.length >= 8, `the distinctive set is non-trivial (${DISTINCTIVE.length}) — an empty set would make this assertion vacuous`);
  ok(offenders.length === 0,
    "no STATIC cuisine chip array — the list must come from wf_cuisine_chips():\n      " + offenders.join("\n      "));
}

if (fail.length) {
  console.error("check-cuisine-chip-floor: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-cuisine-chip-floor: OK — ${pass} assertions (3+/1-2/0 tiers, high-confidence only, per-metro, no radius, coverage order, no static array)`);
