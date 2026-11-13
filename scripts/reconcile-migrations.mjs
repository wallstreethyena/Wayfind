#!/usr/bin/env node
// scripts/reconcile-migrations.mjs — Operator CLI for Mission 5, 6 & 24
// Migration State Reconciler.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrationStateReconciler } from "./lib/migrationStateReconciler.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const jsonMode = process.argv.includes("--json");

const report = await runMigrationStateReconciler({ repoRoot: REPO, env: process.env });

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        liveMode: report.liveMode,
        liveError: report.liveError,
        managementApiTokenPresent: report.managementApiTokenPresent,
        blockerIfApplyNeeded: report.blockerIfApplyNeeded,
        countsByState: report.countsByState,
        liveInvariants: report.liveInvariants,
        nonAppliedEntries: report.nonAppliedEntries,
      },
      null,
      2,
    ),
  );
  process.exit(report.liveError ? 1 : 0);
}

console.log(`=== WAYFIND MIGRATION STATE RECONCILER (${report.liveMode ? "LIVE DB PROBED" : "OFFLINE REPO MODE"}) ===`);
if (report.liveError) {
  console.error(`ERROR: ${report.liveError}`);
  process.exit(1);
}
console.log("Counts by state:", JSON.stringify(report.countsByState));
if (report.blockerIfApplyNeeded) {
  console.log(`Apply capability note: ${report.blockerIfApplyNeeded}`);
}
console.log("\nNon-APPLIED entries:");
for (const entry of report.nonAppliedEntries) {
  console.log(`  [${entry.status}] ${entry.file}`);
  console.log(`    reason: ${entry.reason}`);
  console.log(`    action: ${entry.recommendedAction}`);
  if (entry.safety) {
    console.log(
      `    safety: atomic=${entry.safety.atomicSingleUnit} resumable=${entry.safety.canResumeAfterHalfApply} reverseScript=${entry.safety.hasReverseScript} oldAppCompat=${entry.safety.olderAppCompatible} dataLossRisk=${entry.safety.dataLossRisk}`,
    );
  }
}
