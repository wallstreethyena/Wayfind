// scripts/check-promote-batch-clamp.mjs
//
// The promotion drain's batch size is now decided in TWO call sites —
// app/api/cron/promote-index/route.js (the automated cron) and
// scripts/promote-worker.mjs (the hand-run tool) — and both are supposed to
// bound it with the SAME predicate: clampBatchLimit() in
// lib/promoteThrottle.js. That is the same shape as decidePromotion() in
// lib/promoteIndex.js, and this repo has already paid once for what happens
// when two call sites reimplement one rule slightly differently instead of
// sharing it (#486 — see CLAUDE.md's "Guard pattern — assert the invariant").
// A second, locally-reinvented clamp is silently invisible to this file's
// tests and can drift the moment one site's bounds change without the other.
//
// OFFLINE, structural + a real call (CLAUDE.md: "assert on the CALL, not the
// string" — a regex over the function body proves nothing about its
// behavior, so the bound values themselves are pinned by calling the real
// function, not by reading its source).
import { readFileSync } from "node:fs";
import { clampBatchLimit, MIN_BATCH_LIMIT, MAX_BATCH_LIMIT, DEFAULT_BATCH_LIMIT } from "../lib/promoteThrottle.js";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

const ROUTE = "app/api/cron/promote-index/route.js";
const WORKER = "scripts/promote-worker.mjs";
const route = readFileSync(ROUTE, "utf8");
const worker = readFileSync(WORKER, "utf8");

// Named-import regex, not a bare substring — CLAUDE.md's "assert the
// syntactic position" law. Matches `import { clampBatchLimit }` and
// `import { a, clampBatchLimit, b }` from lib/promoteThrottle(.js), but not
// an unrelated identifier that merely contains the same substring.
function importsClamp(src) {
  return /import\s*\{[^}]*\bclampBatchLimit\b[^}]*\}\s*from\s*["'][^"']*lib\/promoteThrottle(?:\.js)?["']/.test(src);
}
ok(importsClamp(route), `${ROUTE} must import clampBatchLimit from lib/promoteThrottle.js — a route-local reimplementation is the #486 parallel-path bug in a new costume`);
ok(importsClamp(worker), `${WORKER} must import clampBatchLimit from lib/promoteThrottle.js — same law, same shared function`);

// Imported is not called — CLAUDE.md's "reachability is transitive" trap.
ok(/\bclampBatchLimit\s*\(/.test(route), `${ROUTE} imports clampBatchLimit but never calls it`);
ok(/\bclampBatchLimit\s*\(/.test(worker), `${WORKER} imports clampBatchLimit but never calls it`);

// Both must read the live config table this clamp exists to bound.
ok(/wf_promote_config/.test(route), `${ROUTE} must read public.wf_promote_config`);
ok(/wf_promote_config/.test(worker), `${WORKER} must read public.wf_promote_config`);

// The route additionally OWNS the adaptive step and the write-back — the
// worker deliberately does not (see its fetchPromoteConfig comment: a manual
// tool honors the ceiling, it does not self-tune it). Assert that split
// holds rather than assuming it from the design doc.
ok(/\bnextBatchLimit\s*\(/.test(route), `${ROUTE} must drive the adaptive step (call nextBatchLimit) — that is the whole point of this PR`);
ok(!/\bnextBatchLimit\s*\(/.test(worker), `${WORKER} must NOT CALL the adaptive step — a manual run adjusting the shared config while the cron also adjusts it is a race the design doc explicitly avoids; it should only clamp against the current value (mentioning the function in a comment, e.g. to explain why it's absent, is fine — this checks for a call)`);

// The route's write-back is a mutating fetch inside app/api/cron — this
// repo's own check-cron-post-nostore.mjs already enforces cache:"no-store" on
// every such call generically; this one extra check pins it specifically to
// the wf_promote_config write so a regression here reads as "batch clamp
// broke", not just "some cron route somewhere lost no-store".
{
  const idx = route.indexOf("wf_promote_config?id=eq.1");
  ok(idx > -1, `${ROUTE} must PATCH wf_promote_config?id=eq.1 to write back the next batch_limit`);
  if (idx > -1) {
    // cache:"no-store" is a sibling property inside the SAME fetch() options
    // object, which is written AFTER the URL argument — look forward, to the
    // next fetch( call or end of file, not backward.
    const nextCallIdx = route.indexOf("fetch(", idx + 1);
    const around = route.slice(idx, nextCallIdx > -1 ? nextCallIdx : idx + 500);
    ok(/cache:\s*"no-store"/.test(around), `${ROUTE}'s wf_promote_config write-back is missing cache:"no-store"`);
  }
}

// Execute the real, shared function — pin its behavior here once so both
// call sites are provably bound by the SAME bounds (CLAUDE.md: assert on the
// call, not the string).
ok(clampBatchLimit(9999) === MAX_BATCH_LIMIT, `clampBatchLimit must cap at ${MAX_BATCH_LIMIT} — wf_promotion_claim's own server-side ceiling`);
ok(clampBatchLimit(-1) === MIN_BATCH_LIMIT, `clampBatchLimit must floor at ${MIN_BATCH_LIMIT} — never 0, which would silently stop the drain with no error`);
ok(clampBatchLimit(0) === MIN_BATCH_LIMIT, "clampBatchLimit(0) must clamp to the floor, not pass 0 through");
ok(clampBatchLimit(null) === DEFAULT_BATCH_LIMIT, `a missing/invalid config value must fall back to the static default (${DEFAULT_BATCH_LIMIT}), never 0, never unbounded`);
ok(clampBatchLimit(undefined) === DEFAULT_BATCH_LIMIT, "same fallback for undefined");

// Prove the import-checker can fail, or it is decoration (CLAUDE.md: "a guard
// that fires on CORRECT code is worse than no guard" — the inverse risk here
// is a guard that never fires on WRONG code either).
ok(!importsClamp('import { somethingElse } from "../lib/promoteThrottle.js";'),
  "self-test: importing a different name from the same module must NOT count as importing clampBatchLimit");
ok(!importsClamp('const clampBatchLimit = (n) => n;'),
  "self-test: a locally-defined function of the same name must NOT satisfy the shared-import check");
ok(importsClamp('import { a, clampBatchLimit, b } from "../lib/promoteThrottle.js";'),
  "self-test: a multi-name named import must still be recognized");

if (fails) {
  console.error(`check-promote-batch-clamp: ${fails} failure(s)`);
  process.exit(1);
}
console.log("check-promote-batch-clamp: OK — route and worker both import + call the ONE clampBatchLimit, both read wf_promote_config, the route (not the worker) owns the adaptive step and no-stores its write-back, clamp bounds pinned by execution");
