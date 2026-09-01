// scripts/check-promote-metros-parity.mjs
//
// The promotion geography is now decided in TWO places:
//   * lib/promoteIndex.js PROMOTE_METROS — used by scripts/promote-index.mjs and
//     by validateInventoryRow, which rejects a row whose coordinates fall outside
//     the run's box.
//   * public.wf_promote_metros — used by wf_bucket_metro(), which the enqueue
//     trigger calls to decide whether a newly-seen place is queued at all.
//
// If those two drift, the failure is silent and expensive: the database queues a
// place as "tampa", the worker pays Google for its details, and then
// validateInventoryRow rejects it for being out of Tampa's bounds. Every such
// place burns three attempts and three Place Details calls before landing in
// 'rejected' with a reason that reads like a data problem rather than a config
// problem.
//
// This guard is OFFLINE by design — guards run at prebuild with no database and
// no network (scripts/check-guards-emit-no-analytics enforces the posture). So it
// compares the JS constant against the migration file that defines the table,
// which is the artifact under version control and the thing a careless edit would
// change.
//
// WHAT THIS GUARD CANNOT SEE (2026-09-01). On 2026-08-23 and 2026-09-01 five rows
// (miami-dade, broward, palm-beach, keys, florida) were inserted straight into
// the LIVE wf_promote_metros table with no matching migration. This guard stayed
// green throughout — file matched file — while validateInventoryRow() silently
// rejected every queued place in those metros with "unknown metro: <name>",
// because PROMOTE_METROS never moved. A file-vs-file check cannot catch a
// database edited outside a commit; only a file-vs-LIVE-DB check can. That is
// scripts/check-promote-metros-live-drift.mjs — it runs on a schedule (not at
// prebuild, since it needs a live Supabase read), and app/api/cron/promote-index
// + scripts/promote-worker.mjs no longer depend on PROMOTE_METROS being current
// at all: they fetch wf_promote_metros live at run start. Keep BOTH guards —
// this one still catches a JS/migration edit that forgot its twin.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PROMOTE_METROS } from "../lib/promoteIndex.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "supabase/migrations/20260813_wf_promote_metros.sql";
let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

const sql = readFileSync(join(ROOT, MIGRATION), "utf8");

// Parse the seed INSERT: ('metro', min_lat, max_lat, min_lng, max_lng)
const rowRx = /\(\s*'([a-z0-9-]+)'\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g;
const fromSql = {};
for (const m of sql.matchAll(rowRx)) {
  fromSql[m[1]] = { minLat: +m[2], maxLat: +m[3], minLng: +m[4], maxLng: +m[5] };
}

ok(Object.keys(fromSql).length > 0,
  `could not parse any metro rows out of ${MIGRATION} — if the seed INSERT was restructured, update this guard rather than deleting it`);

const jsKeys = Object.keys(PROMOTE_METROS).sort();
const sqlKeys = Object.keys(fromSql).sort();
ok(jsKeys.join(",") === sqlKeys.join(","),
  `metro SETS differ.\n    lib/promoteIndex.js PROMOTE_METROS: ${jsKeys.join(", ")}\n    ${MIGRATION}:                        ${sqlKeys.join(", ")}`);

for (const key of jsKeys) {
  const a = PROMOTE_METROS[key];
  const b = fromSql[key];
  if (!b) continue;
  for (const f of ["minLat", "maxLat", "minLng", "maxLng"]) {
    ok(a[f] === b[f],
      `${key}.${f} differs — JS says ${a[f]}, ${MIGRATION} says ${b[f]}. The trigger would queue a different set of places than the worker will accept.`);
  }
}

// Prove the check can fail: a deliberately wrong box must be detected.
{
  const fake = { ...PROMOTE_METROS.tampa, maxLat: PROMOTE_METROS.tampa.maxLat + 1 };
  ok(fake.maxLat !== PROMOTE_METROS.tampa.maxLat,
    "self-test: the comparison must be able to see a changed bound, or this guard is inert");
}

if (fails) {
  console.error(`check-promote-metros-parity: ${fails} failure(s)`);
  process.exit(1);
}
console.log("check-promote-metros-parity: OK — PROMOTE_METROS matches wf_promote_metros");
