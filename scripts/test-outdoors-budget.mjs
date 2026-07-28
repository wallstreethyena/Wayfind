#!/usr/bin/env node
/**
 * test-outdoors-budget — the outdoors provider may never become the long pole
 * of a non-beach search, and must never lose its full budget on a beach one.
 *
 * Measured on production 2026-07-28: searchPlaces() awaits Google, Foursquare
 * and /api/outdoors together, so the merge is only as fast as its slowest leg.
 * Google answered in ~1.5s; /api/outdoors took 4285ms. The homepage's "things to
 * do" rail therefore waited ~2.8s on a source that was only topping up a pool
 * already filled by the other two.
 *
 * Two regressions this locks, in opposite directions:
 *   1. Someone "simplifies" the per-category budget back to one constant, and
 *      the attractions rail silently gets slow again.
 *   2. Someone tunes the assist budget down globally and takes `beach` with it —
 *      where outdoors is not an assist, it IS the inventory behind the 23-mile
 *      rule and the beach pages. Thinning it there is a correctness bug that
 *      would look like a perf win.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const src = readFileSync(path.resolve("lib/sources.js"), "utf8");

const hang = Number((src.match(/const OUTDOORS_HANG_MS = (\d+);/) || [])[1] || 0);
const assist = Number((src.match(/const OUTDOORS_ASSIST_MS = (\d+);/) || [])[1] || 0);

ok(hang > 0, "OUTDOORS_HANG_MS is defined — beach keeps a real budget");
ok(assist > 0, "OUTDOORS_ASSIST_MS is defined — non-beach searches have their own, shorter budget");
ok(assist < hang, `the assist budget must be SHORTER than the hang budget (assist=${assist}, hang=${hang})`);

// The whole point: outdoors must not dominate a merge whose other legs land in
// ~1.5-1.9s. A budget at or above that is indistinguishable from no fix.
ok(assist <= 2500, `the assist budget must stay at or under 2500ms or outdoors is the long pole again (got ${assist})`);

// ...but not so tight that it can never succeed on a warm cache, which would
// make the source effectively dead outside beach.
ok(assist >= 800, `the assist budget must leave room for a warm-cache hit (got ${assist})`);

// Beach must keep enough budget to actually collect its inventory.
ok(hang >= 5000, `beach must keep a full budget — outdoors is its inventory, not a top-up (got ${hang})`);

// The call site must actually BRANCH on category, not pass one constant.
ok(/outdoorsSearch\(center, radiusMeters, categoryId === "beach" \? OUTDOORS_HANG_MS : OUTDOORS_ASSIST_MS\)/.test(src),
  "searchPlaces picks the budget by category — beach gets the hang budget, everything else the assist budget");

// The parameter must be plumbed through and actually used to abort.
ok(/async function outdoorsSearch\(center, radiusMeters, budgetMs = OUTDOORS_HANG_MS\)/.test(src),
  "outdoorsSearch takes a budget, defaulting to the safe (longer) one so an un-updated caller cannot accidentally get the short budget");
ok(/setTimeout\(\(\) => ctrl\.abort\(\), budgetMs\)/.test(src),
  "the budget is what actually aborts the request — a parameter nothing reads is not a budget");

// Fail-soft contract: a timed-out outdoors call must yield [], never throw or
// poison the merged pool.
ok(/catch \(e\) \{ return \[\]; \}/.test(src.slice(src.indexOf("async function outdoorsSearch"))),
  "a timed-out or failed outdoors call returns [] — the merge keeps Google + Foursquare rather than failing");

if (fail.length) {
  console.error("test-outdoors-budget: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-outdoors-budget: OK — ${pass} assertions (outdoors assists fast elsewhere, stays authoritative for beach)`);
