#!/usr/bin/env node
/**
 * test-cc-stale-cache-shape — the Command Center's stale-on-error cache keeps
 * the SHAPE of what it serves (2026-10-01, Website user flow analysis).
 *
 * lib/commandCenter/cache.js memTTL serves the last-known value when a loader
 * fails. It used to return `{ ...stale.value, _stale: true }` for every object
 * — and almost every loader (firstParty daily/funnel/breakdown, every PostHog
 * query) returns an ARRAY, so a provider flap turned [a, b] into {0: a, 1: b}
 * and the panels that .map() it broke instead of showing stale data.
 *
 * CALLS memTTL with a loader that succeeds once and then throws:
 *   - array value  -> served as an array, same items, flagged _stale;
 *   - object value -> still an object with its fields, flagged _stale (unchanged);
 *   - scalar value -> returned as-is (unchanged);
 *   - fresh hit    -> the value itself, NOT flagged (positive control);
 *   - no prior value -> the loader's error is rethrown (unchanged).
 */
const { memTTL } = await import("../lib/commandCenter/cache.js");
let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;

async function staleOf(value) {
  const key = `test-cc-stale-shape:${n++}`;
  let calls = 0;
  const loader = async () => { calls++; if (calls === 1) return value; throw new Error("upstream down"); };
  const fresh = await memTTL(key, 50, loader);
  await wait(100); // past the 50ms TTL, well inside the 10x (500ms) stale window
  const stale = await memTTL(key, 50, loader);
  return { fresh, stale, calls };
}

const arr = await staleOf([{ day: "2026-09-30", n: 3 }, { day: "2026-10-01", n: 5 }]);
ok(arr.fresh && Array.isArray(arr.fresh) && !arr.fresh._stale, "positive control: a fresh hit is the array itself, not flagged stale");
ok(arr.calls === 2, `the loader must have been re-run and failed (calls=${arr.calls})`);
ok(Array.isArray(arr.stale), `an array served stale must stay an array, got ${Object.prototype.toString.call(arr.stale)}`);
ok(arr.stale && arr.stale._stale === true, "the stale array is flagged _stale");
ok(Array.isArray(arr.stale) && arr.stale.length === 2 && arr.stale[1].n === 5 && typeof arr.stale.map === "function", "the stale array keeps its items and is .map()-able");
ok(arr.fresh !== arr.stale && !arr.fresh._stale, "flagging the stale copy must not mutate the cached value");

const obj = await staleOf({ total: 7, rows: [1, 2] });
ok(obj.stale && !Array.isArray(obj.stale) && obj.stale.total === 7 && obj.stale._stale === true, "an object served stale keeps its fields and is flagged");

const num = await staleOf(42);
ok(num.stale === 42, `a scalar served stale is returned as-is, got ${num.stale}`);

let threw = false;
try { await memTTL(`test-cc-stale-shape:${n++}`, 50, async () => { throw new Error("never worked"); }); } catch (e) { threw = /never worked/.test(e.message); }
ok(threw, "with no prior value the loader's error is rethrown");

if (fail.length) {
  console.error(`✗ test-cc-stale-cache-shape: ${fail.length} failure(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ test-cc-stale-cache-shape: ${pass} assertions (memTTL called: array, object, scalar, fresh, cold-error)`);
