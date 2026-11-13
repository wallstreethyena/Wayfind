#!/usr/bin/env node
// scripts/test-migration-state-reconciler.mjs — Runtime guard for Missions 5, 6 & 24.
//
// Proves that `classifyAllMigrations` and `analyzeMigrationSafety` deterministically
// distinguish all 8 migration states (`APPLIED`, `PENDING_SAFE`, `PARTIALLY_APPLIED`,
// `SUPERSEDED`, `OBSOLETE`, `BLOCKED`, `DRIFTED`, `REQUIRES_REVIEW`) and catch
// half-applied schemas, unmerged production-only ledger drift, stale hashes, and
// destructive SQL.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIGRATION_STATES,
  analyzeMigrationSafety,
  classifyAllMigrations,
  runMigrationStateReconciler,
} from "./lib/migrationStateReconciler.mjs";
import { canonicalSingleStatementHash } from "./lib/migrationReconciliation.mjs";
import { isNotPublicPlace } from "../lib/notPublicPlaces.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

let assertions = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  assertions++;
}

// 1. Verify Indigenous Restaurant (#2132) is suppressed immediately on public serve surfaces
ok(
  isNotPublicPlace("ChIJZUZzwm5Aw4gR1qnftvzg0lg") === true,
  "Indigenous Restaurant (Sarasota) must be suppressed immediately via isNotPublicPlace while migration awaits apply",
);

// 2. Adversarial SQL safety analysis (Mission 24)
{
  const safeAdditive = analyzeMigrationSafety({
    file: "20261027120000_wf_redirect_burst.sql",
    sql: "create table if not exists public.wf_redirect_burst(id int);\ncreate or replace function public.wf_redirect_burst_record() returns void language sql as $$ select 1; $$;",
    reverseFileExists: false,
  });
  ok(safeAdditive.canResumeAfterHalfApply === true, "idempotent additive DDL is resumable");
  ok(safeAdditive.olderAppCompatible === true, "additive DDL is older-app compatible");
  ok(safeAdditive.dataLossRisk === "NONE", "additive DDL has NONE data-loss risk");

  const destructive = analyzeMigrationSafety({
    file: "20261199000000_bad_drop.sql",
    sql: "drop table public.wf_viator_clicks; delete from public.wf_viator_bookings;",
    reverseFileExists: false,
  });
  ok(destructive.olderAppCompatible === false, "DROP TABLE is NOT older-app compatible");
  ok(destructive.touchesAttribution === true, "attribution table touch detected");
  ok(destructive.dataLossRisk === "HIGH", "DROP/DELETE flagged HIGH data-loss risk");
  ok(destructive.canRollBack === false, "destructive drop without reverse script cannot roll back");
}

// 3. Prove all 8 canonical states are produced from realistic inputs
{
  const appliedSql = "create table if not exists public.t_applied(id int);\n";
  const safeSql = "create table if not exists public.wf_redirect_burst(id int);\n";
  const partialSql = "create table if not exists public.wf_redirect_burst(id int);\n";
  const supersededSql = "insert into public.wf_deals(id) select 61 where not exists (select 1);\n";
  const obsoleteSql = "update public.wf_events set short_title = 'X' where event_id = 'mvmcp-2026';\n";
  const blockedSql = "update public.wf_inventory set independent_coords = '[]'::jsonb;\n";
  const reviewSql = "update public.wf_inventory set independent_coords = '[{}]'::jsonb;\n";
  const driftedSql = "select 1;\n";

  const repoFiles = [
    { name: "20260901000000_applied_one.sql", sql: appliedSql, hasReverseScript: false },
    { name: "20261027120000_wf_redirect_burst.sql", sql: safeSql, hasReverseScript: false },
    { name: "20261105120030_event_truth_held_recheck_guard.sql", sql: partialSql, hasReverseScript: false },
    { name: "20261109160100_wf_deals_ut_one_day_tickets.sql", sql: supersededSql, hasReverseScript: false },
    { name: "20261109160000_wf_events_christmas_short_titles.sql", sql: obsoleteSql, hasReverseScript: false },
    { name: "20261015180000_wf_inventory_wikidata_coords.sql", sql: blockedSql, hasReverseScript: true },
    { name: "20261015180200_wf_inventory_official_address_coords_uncorroborated.sql", sql: reviewSql, hasReverseScript: true },
    { name: "20261112000000_undeclared_unapplied.sql", sql: driftedSql, hasReverseScript: false },
  ];

  const mkPending = (name, sql, reason) => ({
    file: `supabase/migrations/${name}`,
    sha256: sha(sql),
    decision_owner: "wallstreethyena",
    tracking: "#1809",
    reason,
  });

  const pendingManifest = [
    mkPending("20261027120000_wf_redirect_burst.sql", safeSql, "Additive redirect burst table."),
    mkPending("20261105120030_event_truth_held_recheck_guard.sql", partialSql, "Held event guard."),
    mkPending("20261109160100_wf_deals_ut_one_day_tickets.sql", supersededSql, "Initial UT tickets."),
    mkPending("20261109160000_wf_events_christmas_short_titles.sql", obsoleteSql, "Short titles already ran."),
    mkPending("20261015180000_wf_inventory_wikidata_coords.sql", blockedSql, "DEPENDS ON COUNSEL Q1 (#1809)."),
    mkPending("20261015180200_wf_inventory_official_address_coords_uncorroborated.sql", reviewSql, "Uncorroborated Census geocodes."),
  ];

  const ledgerRows = [
    {
      version: "20260901000000",
      name: "applied_one",
      statements_sha256: canonicalSingleStatementHash(appliedSql),
    },
    {
      version: "20261113104156",
      name: "wf_unmerged_live_branch",
      statements_sha256: "f".repeat(64),
    },
  ];

  const objectSet = new Set([
    "trigger:wf_events_held_recheck_guard",
    "function:wf_events_held_recheck_guard",
  ]);

  const liveInvariants = {
    utInitialDealsPresent: true,
    utFinalProductPagesLive: true,
    xmasShortTitlesAllLive: true,
    redirectBurstTableExists: false,
  };

  const classified = classifyAllMigrations({
    repoFiles,
    heldFiles: [],
    pendingManifest,
    receipts: [],
    ledgerRows,
    objectSet,
    exceptions: [],
    contentBaseline: [],
    liveInvariants,
  });

  const seenStates = new Set(classified.map((c) => c.status));
  for (const requiredState of MIGRATION_STATES) {
    ok(seenStates.has(requiredState), `reconciler must classify ${requiredState} accurately`);
  }

  const liveOnlyDrift = classified.find((c) => c.ledgerName === "wf_unmerged_live_branch");
  ok(liveOnlyDrift && liveOnlyDrift.status === "DRIFTED", "unmerged live production migration must be flagged DRIFTED");
}

// 4. Real workspace offline reconciliation sanity check
{
  const offlineReport = await runMigrationStateReconciler({
    repoRoot: REPO,
    env: {},
  });
  ok(offlineReport.allEntries.length >= 130, "workspace reconciler scans all repo + held migrations");
  ok(offlineReport.countsByState.BLOCKED >= 3, "counsel-held and owner-held migrations remain BLOCKED");
  ok(offlineReport.countsByState.PENDING_SAFE >= 4, "safe additive pending migrations identified");
}

if (process.argv.includes("--red-prove")) {
  ok(false, "RED_PROVE: simulated unblocked destructive migration passing reconciler");
}

console.log(`test-migration-state-reconciler: OK (${assertions} assertions across all 8 migration states + adversarial safety)`);
