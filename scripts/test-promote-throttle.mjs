// scripts/test-promote-throttle.mjs — local, offline tests for the adaptive
// batch-size logic (lib/promoteThrottle.js). NO network: every rule here is
// pure arithmetic over plain numbers, exactly like scripts/test-promote-index.mjs
// for the sibling decision core.
import {
  DEFAULT_BATCH_LIMIT, MIN_BATCH_LIMIT, MAX_BATCH_LIMIT, ADAPTIVE_FLOOR,
  clampBatchLimit, nextBatchLimit,
} from "../lib/promoteThrottle.js";

let pass = 0;
const fail = (m) => { console.error("test-promote-throttle: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const eq = (g, w, m) => { if (g !== w) fail(`${m}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); pass++; };

// ── clampBatchLimit — the ONE predicate route.js + promote-worker.mjs share ──
eq(clampBatchLimit(25), 25, "a value already in range passes through");
eq(clampBatchLimit(9999), MAX_BATCH_LIMIT, "clamps down to the 50 ceiling (wf_promotion_claim's own server-side cap)");
eq(clampBatchLimit(-5), MIN_BATCH_LIMIT, "clamps up to the 1 floor — never 0, which would silently stop the drain");
eq(clampBatchLimit(0), MIN_BATCH_LIMIT, "0 is a real (if useless) number, not a missing one — still clamps to 1, not the fallback");
// This is the "config-read failure -> falls back to 25 static (never zero,
// never unbounded)" requirement, proven at the unit the fallback actually
// lives in: fetchPromoteConfig() in both call sites returns null on failure,
// and clampBatchLimit(null) is exactly what they then feed to everything else.
eq(clampBatchLimit(null), DEFAULT_BATCH_LIMIT, "a missing config row (fetch failed / pre-migration) falls back to the static default");
eq(clampBatchLimit(undefined), DEFAULT_BATCH_LIMIT, "undefined falls back the same way");
eq(clampBatchLimit(""), DEFAULT_BATCH_LIMIT, "blank string falls back the same way");
eq(clampBatchLimit("not a number"), DEFAULT_BATCH_LIMIT, "unparseable garbage falls back rather than propagating NaN");
eq(clampBatchLimit(12.7), 13, "fractional values round rather than truncate silently");
eq(clampBatchLimit(null, 40), 40, "a caller-supplied fallback is honored, itself still clamped");
eq(clampBatchLimit(null, 9999), MAX_BATCH_LIMIT, "a caller-supplied fallback cannot itself escape the bounds");

// ── nextBatchLimit — the adaptive step ───────────────────────────────────────
// idle run: nothing claimed, nothing to learn — batch_limit is unchanged.
eq(nextBatchLimit(25, { attempted: 0 }), 25, "an idle run (queue empty) leaves batch_limit untouched");

// step DOWN: >20% combined error rate halves, floored at ADAPTIVE_FLOOR.
eq(nextBatchLimit(24, { attempted: 24, errors: 6, queueNonEmpty: true }), 12,
  "25% error rate (6/24) halves: floor(24/2)=12");
eq(nextBatchLimit(ADAPTIVE_FLOOR + 1, { attempted: 10, errors: 3 }), ADAPTIVE_FLOOR,
  "a halve that would go below the adaptive floor is clamped to it, not to 0 or 1");
eq(nextBatchLimit(5, { attempted: 5, errors: 5 }), ADAPTIVE_FLOOR, "already at the floor stays at the floor on more errors");
// ledgerDenials count toward the SAME error rate as errors — the spend
// ledger refusing calls is exactly the "back off" signal this exists for.
eq(nextBatchLimit(20, { attempted: 20, errors: 0, ledgerDenials: 5 }), 10,
  "ledger denials alone (25% of attempted) trigger the halve, with zero operational errors");
// a provider 429 forces the halve even when the raw error rate is tiny.
eq(nextBatchLimit(40, { attempted: 40, errors: 1, sawRateLimit: true }), 20,
  "a single Google 429 forces a halve regardless of the ~2.5% error rate");

// step UP: <5% error rate AND a non-empty queue raises 25%, capped at MAX_BATCH_LIMIT.
eq(nextBatchLimit(25, { attempted: 25, errors: 0, queueNonEmpty: true }), 32,
  "0% errors + full queue raises 25%: ceil(25*1.25)=32");
eq(nextBatchLimit(MAX_BATCH_LIMIT - 1, { attempted: 49, errors: 0, queueNonEmpty: true }), MAX_BATCH_LIMIT,
  "a raise that would exceed 50 is capped there, never beyond wf_promotion_claim's own server-side ceiling");
eq(nextBatchLimit(MAX_BATCH_LIMIT, { attempted: 50, errors: 0, queueNonEmpty: true }), MAX_BATCH_LIMIT,
  "already at the cap stays at the cap on another clean run");
// a clean run against an EMPTY queue must NOT raise — nothing to promote faster.
eq(nextBatchLimit(25, { attempted: 25, errors: 0, queueNonEmpty: false }), 25,
  "0% errors but the queue looks drained (queueNonEmpty:false) — unchanged, no reason to grow");

// the dead zone: between 5% and 20% error rate, unchanged either direction.
eq(nextBatchLimit(30, { attempted: 30, errors: 4, queueNonEmpty: true }), 30,
  "~13% error rate is neither clean enough to raise nor bad enough to halve — unchanged");

// self-test: the two directions must actually be distinguishable.
{
  const up = nextBatchLimit(20, { attempted: 20, errors: 0, queueNonEmpty: true });
  const down = nextBatchLimit(20, { attempted: 20, errors: 10, queueNonEmpty: true });
  ok(up > 20 && down < 20 && up !== down, "self-test: a clean run and a bad run from the same starting point move in opposite directions");
}
// self-test: an out-of-range `current` (a hand-edited config row) is itself
// clamped before any step is applied — the function can never propagate an
// impossible starting value into an equally impossible next one.
eq(nextBatchLimit(9999, { attempted: 10, errors: 0, queueNonEmpty: true }), MAX_BATCH_LIMIT,
  "self-test: a corrupt/out-of-range starting batch_limit is clamped before stepping, not stepped from as-is");

console.log(`test-promote-throttle: OK — ${pass} assertions (clamp bounds + fallback, adaptive step up/down/floor/cap, dead zone, 429 override, ledger denials)`);
