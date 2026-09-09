#!/usr/bin/env node
// scripts/backfill-place-photos.mjs — THIN CLI. All the logic (candidate
// selection, priority, Commons resolution, writes) lives in
// lib/placePhotoBackfill.js so app/api/cron/place-photos imports from lib/,
// not from scripts/ — same reasoning as scripts/photo-repair-worker.mjs's
// header. This file just wires argv -> runBackfill and prints the result /
// files the CLI's own pulse.
//
// NEVER CALLS GOOGLE, same rule as scripts/photo-repair-worker.mjs: no
// import of lib/spendGate.js, no occurrence of "places.googleapis.com"
// anywhere in this file or in lib/placePhotoBackfill.js / lib/commonsPhotos.js.
// This backfill is keyless and free by construction (Wikimedia only).
//
// USAGE
//   node scripts/backfill-place-photos.mjs [--limit=25] [--scan=1000] [--dry-run] [--json] [--source=at-risk|all]
//
// --source (2026-09-09, "beat the cliff"): unset drains wf_photo_at_risk
// (earliest-expiring places first) then fills the rest of --limit from the
// general beach/attractions scan — see lib/placePhotoBackfill.js's header.
// --source=at-risk / --source=all drive one worklist exclusively, by hand.
//
// NOT GUARD-SHAPED (a `backfill-` prefix), so it sits outside
// scripts/check-guard-manifest.mjs / check-guard-hermeticity / the guard
// registry by construction, same as scripts/photo-repair-worker.mjs — it
// touches the network and a live database and must never be able to block a
// code merge.
import { runBackfill, describeAtRisk } from "../lib/placePhotoBackfill.js";
import { recordPulse } from "../lib/jobPulse.js";

const DEFAULT_LIMIT = 25;
const DEFAULT_SCAN_LIMIT = 1000;

function parseArgs(argv) {
  const out = { limit: DEFAULT_LIMIT, scanLimit: DEFAULT_SCAN_LIMIT, dryRun: false, json: false, source: undefined };
  for (const a of argv) {
    if (a.startsWith("--limit=")) out.limit = Math.max(1, parseInt(a.slice(8), 10) || DEFAULT_LIMIT);
    else if (a.startsWith("--scan=")) out.scanLimit = Math.max(1, parseInt(a.slice(7), 10) || DEFAULT_SCAN_LIMIT);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a.startsWith("--source=")) {
      const v = a.slice(9);
      out.source = v === "at-risk" || v === "all" ? v : undefined;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runBackfill({ limit: args.limit, scanLimit: args.scanLimit, dryRun: args.dryRun, source: args.source });
  if (!result.ok) {
    console.error(`backfill-place-photos: FAIL — ${result.reason}`);
    process.exit(1);
  }

  const note = result.tableUnavailable
    ? `place-photos: table unavailable (${result.tableStatus != null ? result.tableStatus : "error"})`
    : result.note
      ? `place-photos: ${result.note}`
      : `place-photos: ${result.active} active (${result.vaulted || 0} vaulted), ${result.rejected} rejected, ${result.failed} failed (${describeAtRisk({ ...result, source: args.source })}, general scanned ${result.scanned}, ${result.alreadyCovered} already covered)${result.dryRun ? " (dry-run)" : ""}`;

  await recordPulse("place-photos", { attempted: result.attempted, succeeded: result.active, note });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.tableUnavailable) {
    console.log(`backfill-place-photos: table: unavailable (${result.tableStatus != null ? result.tableStatus : "error"})`);
  } else {
    console.log(
      `backfill-place-photos: source=${args.source || "at-risk-then-all"} atRisk=${result.atRiskTaken || 0}/${result.atRiskScanned || 0} scanned=${result.scanned} attempted=${result.attempted} active=${result.active} vaulted=${result.vaulted || 0} rejected=${result.rejected} failed=${result.failed}${result.dryRun ? " [dry-run]" : ""}`
    );
  }

  if (result.attempted > 0 && result.failed === result.attempted) {
    console.error("backfill-place-photos: FAIL — every attempted place errored.");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`backfill-place-photos: FAIL — ${(e && e.stack) || e}`);
    process.exit(1);
  });
}
