#!/usr/bin/env node
// scripts/photo-repair-worker.mjs — THIN CLI. All the logic (exact-ref and
// same-place cache recovery, classification, backoff) lives in
// lib/photoRepair.js so app/api/cron/photo-repair imports from lib/, not from
// scripts/ — the only app/ -> scripts/ import in the repo would otherwise
// have been one future .vercelignore/outputFileTracing exclude away from a
// green-locally, broken-in-production deploy. This file just wires argv ->
// runRepair and prints the result / files the CLI's own pulse.
//
// TWO RULES THAT MAY NEVER BE CROSSED (also enforced on lib/photoRepair.js):
// no import of lib/spendGate.js, and no occurrence of the string
// "places.googleapis.com" anywhere in this file
// (scripts/test-photo-protection.mjs case 9 greps both).
//
// USAGE
//   node scripts/photo-repair-worker.mjs [--limit=200] [--dry-run] [--json]
//
// NOT GUARD-SHAPED (a `photo-` prefix), so it sits outside
// scripts/check-guard-manifest.mjs / check-guard-hermeticity / the guard
// registry by construction, same as scripts/photo-monitor.mjs — it touches
// the network and must never be able to block a code merge.
import { runRepair } from "../lib/photoRepair.js";
import { recordPulse } from "../lib/jobPulse.js";

const DEFAULT_LIMIT = 200;

function parseArgs(argv) {
  const out = { limit: DEFAULT_LIMIT, dryRun: false, json: false };
  for (const a of argv) {
    if (a.startsWith("--limit=")) out.limit = Math.max(1, parseInt(a.slice(8), 10) || DEFAULT_LIMIT);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runRepair({ limit: args.limit, dryRun: args.dryRun });
  if (!result.ok) {
    console.error(`photo-repair-worker: FAIL — ${result.reason}`);
    process.exit(1);
  }
  // Fail-soft (v8.56.12): wf_photo_repair_queue may not exist yet. runRepair
  // reports that as ok:true, attempted:0, queueUnavailable:true rather than
  // throwing — still file a pulse (so the queue's absence is visible in
  // wf_job_pulse too) and exit 0.
  const note = result.queueUnavailable
    ? `photos: queue unavailable (${result.queueStatus != null ? result.queueStatus : "error"})`
    : `photos: ${result.recovered} recovered, ${result.classified} classified, ${result.failed} failed${result.dryRun ? " (dry-run)" : ""}`;
  await recordPulse("photo-repair", {
    attempted: result.attempted,
    succeeded: result.recovered + result.classified,
    note,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.queueUnavailable) {
    console.log(`photo-repair-worker: queue: unavailable (${result.queueStatus != null ? result.queueStatus : "error"})`);
  } else {
    console.log(
      `photo-repair-worker: attempted=${result.attempted} recovered=${result.recovered} classified=${result.classified} failed=${result.failed}${result.dryRun ? " [dry-run]" : ""}`
    );
  }
  if (result.attempted > 0 && result.failed === result.attempted) {
    console.error("photo-repair-worker: FAIL — every due row errored.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`photo-repair-worker: FAIL — ${(e && e.stack) || e}`);
    process.exit(1);
  });
}
