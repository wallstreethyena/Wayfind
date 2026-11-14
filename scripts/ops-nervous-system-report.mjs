#!/usr/bin/env node
// scripts/ops-nervous-system-report.mjs — Mission 21 Operator Nervous System Report CLI.
//
// Runs read-only against live Supabase (zero Google Places calls, zero DB writes)
// and prints all 11 operational nervous-system metrics + full 8-state migration
// reconciliation + production data-hygiene head-counts.

import "./lib/nodeResolveHook.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrationStateReconciler } from "./lib/migrationStateReconciler.mjs";
import { buildNervousSystemReport } from "../lib/nervousSystemReport.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const jsonOnly = process.argv.includes("--json");

async function postgrestHeadCount(baseUrl, key, query) {
  const r = await fetch(`${baseUrl}/rest/v1/${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    signal: AbortSignal.timeout(4500),
  });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const cr = r.headers.get("content-range") || "";
  const n = Number(cr.split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

const mig = await runMigrationStateReconciler({ repoRoot: REPO, env: process.env });
const migrationSummaryOverride = {
  liveMode: mig.liveMode,
  countsByState: mig.countsByState,
  nonAppliedCount: mig.nonAppliedEntries.length,
  blockerIfApplyNeeded: mig.blockerIfApplyNeeded,
};

const report = await buildNervousSystemReport({
  env: process.env,
  migrationSummaryOverride,
});

let dataHygiene = null;
const rawUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const sbKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (rawUrl && sbKey) {
  const baseUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const [nullIslandCoords, testPlaceIds, localhostEvents, fakeSignups] = await Promise.all([
    postgrestHeadCount(
      baseUrl,
      sbKey,
      "wf_inventory?status=eq.OPERATIONAL&excluded=not.is.true&and=(lat.eq.0,lng.eq.0)&select=place_id",
    ),
    postgrestHeadCount(
      baseUrl,
      sbKey,
      "wf_inventory?status=eq.OPERATIONAL&excluded=not.is.true&or=(place_id.ilike.ChIJ_TEST*,place_id.ilike.test-*,place_id.ilike.fixture-*)&select=place_id",
    ),
    postgrestHeadCount(
      baseUrl,
      sbKey,
      "wf_events?or=(official_ticket_url.ilike.*localhost*,official_event_url.ilike.*localhost*,source_url.ilike.*localhost*)&select=event_id",
    ),
    postgrestHeadCount(
      baseUrl,
      sbKey,
      "wf_email_signups?or=(email.ilike.*@example.com,email.ilike.*@test.invalid,email.ilike.*@localhost)&select=email",
    ),
  ]);
  dataHygiene = {
    nullIslandInventoryRows: nullIslandCoords,
    testPlaceIdInventoryRows: testPlaceIds,
    localhostEventRows: localhostEvents,
    fakeEmailSignupRows: fakeSignups,
  };
}

const fullPayload = {
  ...report,
  dataHygiene,
};

if (jsonOnly) {
  console.log(JSON.stringify(fullPayload, null, 2));
  process.exit(report.status === 200 ? 0 : 1);
}

console.log("=== WAYFIND PRODUCTION NERVOUS SYSTEM REPORT ===");
console.log(`Checked At: ${report.checkedAt || new Date().toISOString()} | Status: HTTP ${report.status} | OK: ${report.ok}`);
if (report.status !== 200) {
  console.error("Error:", report.error, report.detail || "");
  process.exit(1);
}
const m = report.metrics;
console.log(`1. Owned Hours Coverage:   ${m.ownedHoursCoverage.usableOwnedHoursCount} / ${m.ownedHoursCoverage.totalOperationalInventory} (${m.ownedHoursCoverage.coveragePct}%)`);
console.log(`2. Unknown Open-State %:   ${m.unknownOpenStatePct.unknownPct}% (open=${m.unknownOpenStatePct.knownOpenCount}, closed=${m.unknownOpenStatePct.knownClosedCount}, unknown=${m.unknownOpenStatePct.unknownCount})`);
console.log(`3. Google Detail Attempts: attempted=${m.googleDetailAttempts.paidLookupAttempted}, skipped=${m.googleDetailAttempts.paidLookupSkipped}, snapshotServed=${m.googleDetailAttempts.snapshotServed}, partial=${m.googleDetailAttempts.degradedPartialServed}`);
console.log(`4. Google Detail 503s:     count=${m.googleDetail503s.count}, rate=${m.googleDetail503s.detail503Rate}`);
console.log(`5. Spend Ledger Today:     ${JSON.stringify(m.humanVsBackgroundSpend.dailyLedgerBySku)}`);
console.log(`6. Stale Hours Snapshots:  stale=${m.staleSnapshotCount.staleCount}, expired=${m.staleSnapshotCount.expiredCount}, topRefreshQueue=${m.staleSnapshotCount.refreshQueueTop10.length}`);
console.log(`7. Synthetic Writes Block: blockedTotal=${m.syntheticWritesBlocked.blockedTotal}`);
console.log(`8. Attribution Hygiene:    viator(total=${m.attributionContamination.viator.totalRows}, syntheticFixture=${m.attributionContamination.viator.syntheticFixtureRows}, clean=${m.attributionContamination.viator.cleanAnalyticalRows}) | tp(total=${m.attributionContamination.travelpayouts.totalRows}, clean=${m.attributionContamination.travelpayouts.cleanAnalyticalRows})`);
console.log(`9. Migration Drift:        ${JSON.stringify(m.migrationDrift.countsByState)}`);
console.log(`10. Search Rejections:     rejected=${m.searchEligibilityRejections.totalRejected} / evaluated=${m.searchEligibilityRejections.totalEvaluated}`);
console.log(`11. Christmas Temporal:    tonight=${m.christmasOpenTonightCount.tonight} (confirmed=${m.christmasOpenTonightCount.tonightConfirmed}, checkHours=${m.christmasOpenTonightCount.tonightHoursUnverified}) | weekend=${m.christmasOpenTonightCount.weekend} | openingSoon=${m.christmasOpenTonightCount.openingSoon} | all=${m.christmasOpenTonightCount.all}`);
if (dataHygiene) {
  console.log(`12. Live Data Hygiene:     ${JSON.stringify(dataHygiene)}`);
}
if (report.alerts.length) {
  console.log(`Alerts: ${report.alerts.join(", ")}`);
}
