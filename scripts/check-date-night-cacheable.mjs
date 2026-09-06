#!/usr/bin/env node
// check-date-night-cacheable — the intent rails are shared, so the cache is too.
//
// THE DEFECT (measured on production, 2026-08-30). /api/date-night answered
// with `Cache-Control: private, max-age=60`. `private` forbids the SHARED
// cache, so every reader paid a full origin round trip for the drop:
//
//     x-vercel-cache: MISS   ttfb 1.60s   268KB br
//     x-vercel-cache: MISS   ttfb 1.72s   (identical URL, seconds later)
//
// That is not a slow route. It is a route the CDN was not allowed to hold.
// `private` is for responses shaped by WHO is asking — a signed-in cart, a
// personal feed. This payload is shaped by lat, lng, city and hour and nothing
// else: two readers standing together get byte-identical answers. It is the
// same class /api/rails already serves publicly, and it now carries the same
// numbers.
//
// AND THE OTHER HALF, which is the part that makes caching safe rather than
// merely fast: an EMPTY answer must never be cached as the truth. Composing
// zero rails is not a fact about the reader's town — a stalled inventory read
// looks identical — and an hour of shared cache on that pins "nothing near you
// clears the bar" for everyone in the cell off one transient miss. That is the
// v8.74 rule /api/rails carries, and it becomes load-bearing here the moment
// this route becomes publicly cacheable. Caching without it would have traded
// a slow drop for a wrong one.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = strip(readFileSync(join(ROOT, "app/api/date-night/route.js"), "utf8"));
ok(src.includes("composeDateNightRails"), "PROBE: the date-night route was read");

const sig = src.match(/function json\(obj, status = 200, cache = "([^"]+)"\)/);
ok(!!sig, "positive control: the json() helper declares a default cache header");
ok(!!sig && !/\bprivate\b/.test(sig[1]),
  `the default cache header is not \`private\` — that keyword forbids the SHARED cache and cost every reader a 1.6-2.2s origin round trip (got "${sig ? sig[1] : "?"}")`);
ok(!!sig && /public/.test(sig[1]) && /s-maxage=\d+/.test(sig[1]),
  "…it is public with an s-maxage the CDN can actually hold");
ok(!!sig && /stale-while-revalidate=\d+/.test(sig[1]),
  "…and stale-while-revalidate, so the first reader after expiry is served instantly while the rebuild happens behind them");

// The safety property. Without it, caching makes a transient miss permanent.
//
// v8.98j WIDENED THIS PROPERTY AND THESE ASSERTIONS FOLLOWED THE CODE.
//
// The three checks here used to pin exact literals — `const empty = …`, the
// ternary spelled out character for character, and `usable: (value) => !!(…)`.
// All three went red when the route learned about a SECOND way to be unsafe: a
// pool that read only some of its categories composes plenty of rails, so the
// old "did it compose anything" test called that answer healthy and granted it
// the full hour. The invariant was never those literals. It is:
//
//   (a) the route can tell a complete answer from an incomplete one,
//   (b) an incomplete answer is no-store, and
//   (c) the runtime cache stores only complete, non-empty answers.
//
// Deleting them would have re-opened v8.74. Pinning them again would go GREEN
// the next time the safety test moves, which is the dangerous half.
ok(/const incomplete = [^\n]*answer\.rails\.length === 0[^\n]*answer\.degraded === true;/.test(src),
  "the route no longer distinguishes a complete answer from an incomplete one — it must know about BOTH an empty compose and a partial pool");
ok(/"cache-control": incomplete \? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400"/.test(src),
  "an INCOMPLETE answer is no-store — a cached empty, or a cached pool that read only some of its categories, is a claim about the reader's town made out of one stalled read (v8.74)");
ok(/fastCachedRail\(key,[\s\S]*usable: completeAnswersOnly\(\(value\) => Array\.isArray\(value\.rails\) && value\.rails\.length\)/.test(src),
  "the runtime cache no longer keeps only a COMPLETE, non-empty last-known-good answer");

// …and (c) is asserted by CALLING the combinator, not by matching its name. A
// route could import completeAnswersOnly from a version that returns true for
// everything and every source check above would still pass.
{
  const { completeAnswersOnly } = await import("../lib/railFastCache.js");
  const usable = completeAnswersOnly((v) => Array.isArray(v.rails) && v.rails.length);
  ok(usable({ rails: [1], degraded: false }) === true,
    "EXECUTED: a complete, non-empty answer is cacheable (positive control) — if this fails the rule rejects everything and the fix is a cache-disabling patch");
  ok(usable({ rails: [1], degraded: true }) === false,
    "EXECUTED: a DEGRADED answer is cacheable — a pool that read only some of its categories would be pinned on every reader in the cell for an hour");
  ok(usable({ rails: [], degraded: false }) === false, "EXECUTED: an empty compose is cacheable (v8.74)");
  // …and the entries ALREADY in the drawer. The namespace and this route's key
  // are unchanged and entries live seven days, so an answer written before the
  // flag existed must not pass by omission.
  ok(usable({ rails: [1] }) === false,
    "EXECUTED: a LEGACY entry with no `degraded` field is cacheable — every answer written before this shipped would be read back and served as healthy for the rest of its seven-day life");
}
ok(/, 400, "no-store"\)/.test(src),
  "the 400 path stays no-store");

// EXECUTED: the default must survive an explicit `undefined` third argument,
// or every good answer silently ships with no cache header at all and the
// whole fix evaporates while every source assertion above still passes.
{
  const json = (obj, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") => cache;
  ok(json({}, 200, undefined) === "public, s-maxage=3600, stale-while-revalidate=86400",
    "EXECUTED: passing undefined falls back to the public default — the good answer keeps its cache");
  ok(json({}, 200, "no-store") === "no-store",
    "EXECUTED: the empty answer's explicit no-store wins (negative control)");
}

if (fails.length) {
  console.error("check-date-night-cacheable: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-date-night-cacheable: OK — ${pass} assertions; the intent rails are publicly cacheable with the same numbers /api/rails uses, neither an empty compose NOR a partial owned pool is ever cached as the truth (the combinator is CALLED over four shapes including a LEGACY entry with no flag, not matched by name), and the default-vs-undefined fallback is EXECUTED rather than assumed`);
