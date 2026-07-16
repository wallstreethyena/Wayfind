// scripts/test-cache-refresh.mjs — offline tests for the v6.35 refresh-ahead
// jitter (lib/serverCache pure helpers). No network, no clock: deterministic.
import { refreshAgeFor, refreshDue, REFRESH_MIN_MS, REFRESH_MAX_MS, DAY } from "../lib/serverCache.js";

let pass = 0;
const fail = (m) => { console.error("test-cache-refresh: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── refreshAgeFor: stable, in-range, spread across keys ──────────────────────
ok(REFRESH_MIN_MS === 20 * DAY && REFRESH_MAX_MS === 27 * DAY, "refresh window is [20d, 27d)");
const keys = ["v1|coffee|28.54|-81.38|30|20", "v1|hotels|27.34|-82.53|24|20", "v1|beaches|27.33|-82.55|40|12", "v1|tacos|28.41|-81.24|10|20", "v1|museums|28.57|-81.37|30|20"];
for (const k of keys) {
  const a = refreshAgeFor(k);
  ok(a >= REFRESH_MIN_MS && a < REFRESH_MAX_MS, `refreshAgeFor(${k}) in [20d,27d): got ${(a / DAY).toFixed(1)}d`);
  ok(refreshAgeFor(k) === a, "refreshAgeFor is deterministic (same key → same age)");
  ok(a < 30 * DAY, "refresh age is safely under the 30-day cap");
}
// jitter actually spreads: the 5 keys don't all land on the same age
ok(new Set(keys.map(refreshAgeFor)).size >= 3, "jitter spreads keys across the window (no synchronized day-30 herd)");

// ── refreshDue: only fresh entries past their jittered age ───────────────────
const K = keys[0];
const age = refreshAgeFor(K);           // this key's trigger age (~20–27d)
const NOW = 1_000_000_000_000;          // fixed reference instant (ms)
const exp = (wroteAgo) => NOW - wroteAgo + 30 * DAY; // FRESH_TTL = 30d after write
// fresh + aged just past threshold → due
ok(refreshDue(K, NOW - (age + DAY), exp(age + DAY), NOW) === true, "fresh entry past its jittered age is due");
// fresh + not yet at threshold → not due
ok(refreshDue(K, NOW - (age - DAY), exp(age - DAY), NOW) === false, "fresh entry before its jittered age is NOT due");
// brand-new entry → not due
ok(refreshDue(K, NOW - 60_000, NOW + 30 * DAY, NOW) === false, "a minute-old entry is not due");
// EXPIRED entry → not due (takes the normal live/inventory path, not a hot-swap)
ok(refreshDue(K, NOW - 31 * DAY, NOW - DAY, NOW) === false, "an expired entry is not 'due' (no hot-swap)");
// missing wrote time → not due
ok(refreshDue(K, null, NOW + 30 * DAY, NOW) === false, "no wrote time → not due");

console.log(`test-cache-refresh: OK — ${pass} assertions (jittered refresh age is stable/in-range/spread, refreshDue gates on fresh+aged only)`);
