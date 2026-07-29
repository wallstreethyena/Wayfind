#!/usr/bin/env node
/**
 * check-cuisine-never-queried — THE rule, and it fails the build.
 *
 * A cuisine label is a FILTER on already-geofenced local inventory. It is NEVER
 * a search query.
 *
 * If "Puerto Rican" reaches a Places text search, Google returns restaurants in
 * Puerto Rico — 1,100 miles from Orlando, with real names, real ratings and real
 * photos. That is what makes this bug dangerous rather than obvious: the results
 * look completely legitimate. The owner caught the risk before any code existed;
 * this guard is what stops it being reintroduced by someone who did not.
 *
 * WHAT IT CHECKS
 *  1. The cuisine module never itself builds a query, fetches, or names a Places
 *     endpoint.
 *  2. No query builder imports the cuisine module. lib/google.js queryFor(),
 *     SUBFILTERS, textQuery and searchText are all query construction; a cuisine
 *     import into any of those files is the leak.
 *  3. No SUBFILTERS entry carries a `query` string built from a cuisine label —
 *     that is the specific shape the leak would take, because adding cuisines as
 *     sub-filters is the obvious wrong way to build this feature.
 *  4. The coverage RPC reads inventory and does not accept a radius — "widen the
 *     radius to pad a thin list" is the other way this rule gets broken.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { ALL_CUISINES } from "../lib/cuisine.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const raw = (p) => readFileSync(path.resolve(p), "utf8");
const stripped = (p) => raw(p)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// ── 1. the module itself never queries ────────────────────────────────────
{
  const mod = stripped("lib/cuisine.js");
  for (const forbidden of ["fetch(", "searchText", "textQuery", "places.googleapis.com", "queryFor", "locationBias"]) {
    ok(!mod.includes(forbidden),
      `lib/cuisine.js must not contain "${forbidden}" — it classifies rows we already hold and never reaches out`);
  }
  ok(/FILTER/.test(raw("lib/cuisine.js")) && /never/i.test(raw("lib/cuisine.js")),
    "the module states the rule in its own header, so the next reader meets it before the code");
}

// ── 2. no query builder imports the cuisine module ────────────────────────
// A "query builder" is any file that constructs Places search text.
{
  const roots = ["lib", "app/api", "app/components"];
  const builders = [], leaks = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); continue; }
      if (!e.name.endsWith(".js")) continue;
      const src = stripped(p);
      const isBuilder = /textQuery\s*:|searchText|function queryFor|SUBFILTERS\s*=/.test(src);
      if (!isBuilder) continue;
      builders.push(p);
      if (/from\s+["'][^"']*\/cuisine["']|require\(["'][^"']*\/cuisine["']/.test(src)) {
        leaks.push(p);
      }
    }
  };
  for (const r of roots) walk(path.resolve(r));
  ok(builders.length >= 3,
    `the sweep found the query builders (${builders.length}: ${builders.map((b) => path.basename(b)).join(", ")}) — an empty sweep would pass for the wrong reason`);
  ok(leaks.length === 0,
    `a QUERY BUILDER imports the cuisine module. This is the Puerto-Rico bug:\n      ` + leaks.join("\n      "));
}

// ── 3. no cuisine label appears as a SUBFILTERS query string ──────────────
// Adding cuisines as sub-filters is the obvious wrong way to build this, because
// every existing sub-filter IS a text search (lib/google.js: "Each runs a real,
// targeted Google text search").
{
  const g = raw("lib/google.js");
  const queryStrings = [...g.matchAll(/query:\s*"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  ok(queryStrings.length >= 20, `read the SUBFILTERS query strings (${queryStrings.length})`);
  // Only flag cuisines distinctive enough that their presence means cuisine
  // intent. "american"/"seafood"/"pizza" are legitimate general search words.
  const DISTINCTIVE = ALL_CUISINES.filter((c) =>
    !["american", "seafood", "pizza", "burgers", "breakfast", "asian", "barbecue",
      "steakhouse", "vegan", "vegetarian", "sushi", "mediterranean", "caribbean"].includes(c));
  const bad = [];
  for (const q of queryStrings) {
    for (const c of DISTINCTIVE) {
      const word = c.replace(/-/g, "[ -]?");
      if (new RegExp(`\\b${word}\\b`).test(q)) bad.push(`query "${q}" contains cuisine "${c}"`);
    }
  }
  ok(bad.length === 0,
    `a SUBFILTERS query string carries a cuisine label — every sub-filter runs a REAL Google text search, so this ships the Puerto-Rico bug:\n      ` + bad.join("\n      "));
  ok(DISTINCTIVE.includes("puerto-rican") && DISTINCTIVE.includes("cuban"),
    "the distinctive list covers the cases that motivated the rule");
  // Falsifiable: the detector must actually fire on the bad shape.
  const probe = "best puerto rican restaurants";
  ok(DISTINCTIVE.some((c) => new RegExp(`\\b${c.replace(/-/g, "[ -]?")}\\b`).test(probe)),
    "the detector fires on a deliberately bad query string — otherwise assertion 3 is decoration");
}

// ── 4. coverage is read-only over inventory, and never widens a radius ────
{
  const migRaw = raw("supabase/migrations/20260730_wf_inventory_cuisine.sql");
  // Strip SQL comments FIRST. The migration's own comment explains that the
  // radius is never widened, and a raw-text check fails on that prose rather
  // than on any code. Fourth time this trap has fired today (see
  // check-editorial-publish, check-env-value-overrides, check-editorial-retry-state).
  const mig = migRaw.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  ok(mig.length > migRaw.length * 0.2, "stripping comments left the migration's SQL intact");
  ok(/from public\.wf_inventory/.test(mig), "coverage reads wf_inventory — local rows only");
  ok(!/radius|p_radius|locationBias/i.test(mig),
    "the coverage RPC takes no radius: widening the search to pad a thin cuisine list is the other way this rule gets broken");
  ok(/count\(\*\)::int as places/.test(mig),
    "coverage returns an honest COUNT, so a thin cuisine can be gated out or shown with its real number");
  ok(/status = 'OPERATIONAL'/.test(mig), "closed places do not inflate a coverage count");
}

if (fail.length) {
  console.error("check-cuisine-never-queried: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-cuisine-never-queried: OK — ${pass} assertions (the module never fetches, no query builder imports it, no cuisine in a SUBFILTERS query, coverage is radius-free)`);
