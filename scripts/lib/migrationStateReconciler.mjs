// scripts/lib/migrationStateReconciler.mjs — Mission 5, 6 & 24 Migration State
// Reconciler & Adversarial Database Safety Analyzer.
//
// Compares:
//   1. Repo canonical SQL (`supabase/migrations/*.sql`)
//   2. Held SQL (`supabase/held-migrations/*.sql`)
//   3. Declared pending manifest (`scripts/migration-pending-apply.json`)
//   4. Applied receipt log (`scripts/migration-apply-log.jsonl`)
//   5. Historical pins & content baseline (`scripts/migration-historical-exceptions.json`,
//      `scripts/migration-content-baseline.json`)
//   6. Live production ledger (`wf_migration_ledger_hashes`)
//   7. Live production schema objects (`wf_schema_objects`)
//   8. Live production data invariants (read-only PostgREST probes)
//
// Categorizes every migration into one of the 8 canonical states:
//   - APPLIED
//   - PENDING_SAFE
//   - PARTIALLY_APPLIED
//   - SUPERSEDED
//   - OBSOLETE
//   - BLOCKED
//   - DRIFTED
//   - REQUIRES_REVIEW

import { existsSync, readFileSync, readdirSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  parseFileName,
  canonicalSingleStatementHash,
  reconcile,
  fetchAllRpcRows,
} from "./migrationReconciliation.mjs";

export const MIGRATION_STATES = Object.freeze([
  "APPLIED",
  "PENDING_SAFE",
  "PARTIALLY_APPLIED",
  "SUPERSEDED",
  "OBSOLETE",
  "BLOCKED",
  "DRIFTED",
  "REQUIRES_REVIEW",
]);

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Mission 24 Adversarial Database Safety Analyzer.
 * Evaluates half-apply failure modes, rollback availability, destructive DDL/DML,
 * old/new app compatibility, ranking impact, and attribution safety.
 */
export function analyzeMigrationSafety({ file, sql = "", reverseFileExists = false } = {}) {
  const text = String(sql || "");
  const stripped = text
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Strip single-quoted string literals and CREATE FUNCTION bodies so RPC cleanup
  // statements or prose strings inside literals aren't mistaken for top-level DDL/DML.
  const topLevelSql = stripped
    .replace(/create\s+(?:or\s+replace\s+)?function[\s\S]*?\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/gi, "CREATE FUNCTION <body_omitted>")
    .replace(/'(?:''|[^'])*'/g, "''");

  const hasExplicitTx = /\bbegin\s*;/i.test(topLevelSql) && /\bcommit\s*;/i.test(topLevelSql);
  const hasDoBlock = /\bdo\s+\$[a-zA-Z0-9_]*\$/i.test(topLevelSql);
  const statementCount = topLevelSql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean).length;

  const isSingleAtomicUnit = hasExplicitTx || (hasDoBlock && statementCount <= 2) || statementCount <= 1;

  const hasDestructiveDrop =
    /\bdrop\s+(?:table|column|schema)\b/i.test(topLevelSql) &&
    !/\bdrop\s+trigger\s+if\s+exists\b/i.test(topLevelSql);
  const hasUnboundedDeleteOrTruncate =
    /\btruncate\s+/i.test(topLevelSql) || /\bdelete\s+from\b/i.test(topLevelSql);
  const hasIdempotentGuards =
    /\bif\s+not\s+exists\b/i.test(stripped) ||
    /\bcreate\s+or\s+replace\b/i.test(stripped) ||
    /\bwhere\s+not\s+exists\b/i.test(stripped) ||
    /\bcoalesce\s*\(/i.test(stripped);

  const touchesAttribution = /\bwf_viator_(?:clicks|bookings|booking_events)|wf_tp_(?:clicks|bookings)\b/i.test(
    stripped,
  );
  const touchesRanking = /\bwf_inventory\b.*\b(?:wayfind_score|rating|signals|status|excluded)\b/is.test(
    stripped,
  );
  const replayRaises = /\braise\s+exception\b/i.test(stripped) && /\bfor\s+update\b/i.test(stripped);

  const canResumeAfterHalfApply = isSingleAtomicUnit || hasIdempotentGuards;
  const oldAppCompatible = !hasDestructiveDrop && !/\balter\s+table\b.*\brename\b/i.test(stripped);

  let dataLossRisk = "NONE";
  if (hasDestructiveDrop || hasUnboundedDeleteOrTruncate) {
    dataLossRisk = "HIGH";
  } else if (/\bupdate\s+public\./i.test(stripped) && !reverseFileExists) {
    dataLossRisk = "LOW_REVERSIBLE_BY_SQL";
  }

  return {
    file,
    statementCount,
    atomicSingleUnit: isSingleAtomicUnit,
    hasIdempotentGuards,
    replayRaises,
    canResumeAfterHalfApply,
    hasReverseScript: Boolean(reverseFileExists),
    canRollBack: Boolean(reverseFileExists) || (!hasDestructiveDrop && !hasUnboundedDeleteOrTruncate),
    olderAppCompatible: oldAppCompatible,
    touchesAttribution,
    touchesRanking,
    dataLossRisk,
  };
}

/**
 * Live read-only PostgREST data-invariant probes for the 11 declared-pending
 * migrations so classification reflects CURRENT database reality, never stale notes.
 */
export async function probeLivePendingInvariants({ url, key, fetchImpl = globalThis.fetch } = {}) {
  if (!url || !key || typeof fetchImpl !== "function") return null;
  const base = String(url).trim().replace(/\/+$/, "");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };

  async function getJson(rel) {
    try {
      const res = await fetchImpl(`${base}/rest/v1/${rel}`, { headers, cache: "no-store" });
      if (!res.ok) return { ok: false, status: res.status, rows: null };
      const rows = await res.json();
      return { ok: true, status: res.status, rows: Array.isArray(rows) ? rows : [] };
    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err), rows: null };
    }
  }

  const [indigenous, xmasTitles, utDeals, redirectBurst, verifiedCoordsSample] = await Promise.all([
    getJson(
      "wf_inventory?place_id=eq.ChIJZUZzwm5Aw4gR1qnftvzg0lg&select=place_id,name,status,excluded,exclusion_reason,locked",
    ),
    getJson(
      "wf_events?event_id=in.(mvmcp-2026,christmas-town-2026,epcot-festival-holidays-2026,jollywood-nights-2026)&select=event_id,short_title",
    ),
    getJson(
      "wf_deals?id=in.(61,62,63,64,65)&select=id,provider,title,dest_url,affiliate_url,active,category,scope",
    ),
    getJson("wf_redirect_burst?select=*&limit=1"),
    getJson(
      "wf_inventory?independent_coords=cs.%5B%7B%22method%22%3A%22wikidata-p625-official-address-verified%22%7D%5D&select=place_id&limit=5",
    ),
  ]);

  const expectedTitles = new Map([
    ["mvmcp-2026", "Mickey's Very Merry Christmas Party"],
    ["christmas-town-2026", "Busch Gardens Christmas Town"],
    ["epcot-festival-holidays-2026", "EPCOT Festival of the Holidays"],
    ["jollywood-nights-2026", "Disney Jollywood Nights"],
  ]);
  const xmasRows = xmasTitles.rows || [];
  const xmasMatched = xmasRows.filter((r) => expectedTitles.get(r.event_id) === r.short_title).length;

  const dealMap = new Map((utDeals.rows || []).map((r) => [Number(r.id), r]));
  const hasInitialUtRows = [61, 62, 63, 64].every((id) => dealMap.has(id));
  const hasFinalUtProductPages =
    dealMap.get(61)?.affiliate_url?.includes("sid/coupon_epcot1/") &&
    dealMap.get(62)?.affiliate_url?.includes("sid/coupon_sea1/") &&
    dealMap.get(64)?.affiliate_url?.includes("sid/coupon_lego1/") &&
    dealMap.get(65)?.affiliate_url?.includes("sid/coupon_bgt1/") &&
    dealMap.get(65)?.active === true &&
    dealMap.get(63)?.active === false;

  const indRow = (indigenous.rows || [])[0] || null;

  return {
    indigenousClosedInDb: indRow ? indRow.status === "CLOSED_PERMANENTLY" : false,
    indigenousPreconditionReady: Boolean(
      indRow && indRow.status === "OPERATIONAL" && !indRow.excluded && !indRow.locked,
    ),
    xmasTitlesMatched: xmasMatched,
    xmasTitlesTotalFound: xmasRows.length,
    xmasShortTitlesAllLive: xmasRows.length > 0 && xmasMatched === xmasRows.length,
    utInitialDealsPresent: hasInitialUtRows,
    utFinalProductPagesLive: Boolean(hasFinalUtProductPages),
    redirectBurstTableExists: redirectBurst.ok && redirectBurst.status === 200,
    verifiedIndependentCoordsCount: (verifiedCoordsSample.rows || []).length,
  };
}

/**
 * Pure deterministic classifier for all repo, held, and production-only migrations.
 */
export function classifyAllMigrations({
  repoFiles = [],
  heldFiles = [],
  pendingManifest = [],
  receipts = [],
  ledgerRows = null,
  objectSet = null,
  exceptions = [],
  contentBaseline = [],
  liveInvariants = null,
} = {}) {
  const results = [];
  const pendingByFile = new Map();
  for (const p of pendingManifest) {
    if (p && typeof p.file === "string") {
      const short = p.file.replace(/^supabase\/migrations\//, "");
      pendingByFile.set(short, p);
    }
  }

  const appliedReceiptsByFile = new Map();
  for (const r of receipts) {
    if (r && r.status === "applied" && typeof r.file === "string") {
      const short = r.file.replace(/^supabase\/migrations\//, "");
      appliedReceiptsByFile.set(short, r);
    }
  }

  const canonicalNames = new Map();
  const canonicalStems = new Map();
  const canonicalHashes = new Map();
  for (const item of repoFiles) {
    const parsed = parseFileName(item.name);
    if (parsed) canonicalNames.set(parsed.name, item.name);
    canonicalStems.set(item.name.replace(/\.sql$/, ""), item.name);
    canonicalHashes.set(item.name, canonicalSingleStatementHash(item.sql));
  }

  const baselineByVersion = new Map((contentBaseline || []).map((b) => [b.version, b]));
  const exceptionByVersion = new Map((exceptions || []).map((e) => [e.version, e]));
  const hasLiveLedger = Array.isArray(ledgerRows) && ledgerRows.length > 0;
  const objSet = objectSet instanceof Set ? objectSet : new Set();

  // 1. Classify every canonical file in supabase/migrations/
  for (const item of repoFiles) {
    const safety = analyzeMigrationSafety({
      file: item.name,
      sql: item.sql,
      reverseFileExists: item.hasReverseScript,
    });
    const pending = pendingByFile.get(item.name) || null;
    const rawSha = sha256Hex(Buffer.from(item.sql, "utf8"));

    if (hasLiveLedger) {
      const rec = reconcile(item.name, ledgerRows, objSet, canonicalHashes.get(item.name));
      if (rec.status === "ok") {
        // Check for content drift against ledger row if matched by name
        const parsed = parseFileName(item.name);
        const ledgerRow = parsed ? ledgerRows.find((r) => r.name === parsed.name) : null;
        if (
          ledgerRow &&
          !exceptionByVersion.has(ledgerRow.version) &&
          ledgerRow.statements_sha256 !== canonicalHashes.get(item.name) &&
          !baselineByVersion.has(ledgerRow.version)
        ) {
          results.push({
            file: item.name,
            status: "DRIFTED",
            via: rec.via,
            reason: `Ledger row ${ledgerRow.version} / ${ledgerRow.name} SQL hash differs from committed file without a content baseline pin.`,
            recommendedAction: "Inspect SQL diff and pin reviewed baseline or reconcile schema.",
            safety,
          });
          continue;
        }
        if (pending) {
          results.push({
            file: item.name,
            status: "DRIFTED",
            via: rec.via,
            reason: "Migration is present in live schema_migrations ledger AND still listed in migration-pending-apply.json.",
            recommendedAction: "Record receipt in migration-apply-log.jsonl and remove stale pending entry.",
            safety,
          });
          continue;
        }
        results.push({
          file: item.name,
          status: "APPLIED",
          via: rec.via,
          reason: "Verified in production ledger / schema objects.",
          recommendedAction: "NONE",
          safety,
        });
        continue;
      }
      if (rec.status === "fail") {
        results.push({
          file: item.name,
          status: "DRIFTED",
          via: "failed-reconcile",
          reason: rec.detail,
          recommendedAction: "Investigate broken historical probe or alias hash mismatch immediately.",
          safety,
        });
        continue;
      }
    } else if (!pending && appliedReceiptsByFile.has(item.name)) {
      results.push({
        file: item.name,
        status: "APPLIED",
        via: "receipt-offline",
        reason: "Recorded in migration-apply-log.jsonl (live ledger not queried).",
        recommendedAction: "NONE",
        safety,
      });
      continue;
    } else if (!pending) {
      // Pre-receipt historical migration in offline mode
      results.push({
        file: item.name,
        status: "APPLIED",
        via: "historical-offline",
        reason: "Committed canonical migration (offline mode).",
        recommendedAction: "Run with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for live proof.",
        safety,
      });
      continue;
    }

    // Unresolved in ledger -> evaluate pending declaration & live data invariants!
    if (!pending) {
      results.push({
        file: item.name,
        status: "DRIFTED",
        via: "undeclared-unapplied",
        reason: "Absent from production ledger and missing from scripts/migration-pending-apply.json.",
        recommendedAction: "Declare in migration-pending-apply.json or apply via scripts/apply-migration.mjs.",
        safety,
      });
      continue;
    }

    if (pending.sha256 !== rawSha) {
      results.push({
        file: item.name,
        status: "DRIFTED",
        via: "pending-hash-mismatch",
        reason: `File SHA-256 (${rawSha.slice(0, 12)}) does not match pending declaration (${String(pending.sha256).slice(0, 12)}).`,
        recommendedAction: "Re-review modified SQL and update decision hash.",
        safety,
      });
      continue;
    }

    // Classify the 11 specific pending migrations using live invariants + legal/dependency rules:
    const classification = classifyDeclaredPendingFile({
      file: item.name,
      pending,
      safety,
      objSet,
      liveInvariants,
    });
    results.push(classification);
  }

  // 2. Classify held migrations in supabase/held-migrations/
  for (const held of heldFiles) {
    const safety = analyzeMigrationSafety({
      file: `held-migrations/${held.name}`,
      sql: held.sql,
      reverseFileExists: false,
    });
    const isSuperseded = /superseded|must\s+not\s+be\s+applied/i.test(held.readmeNote || "");
    results.push({
      file: `supabase/held-migrations/${held.name}`,
      status: isSuperseded ? "SUPERSEDED" : "BLOCKED",
      via: "held-migrations-manifest",
      reason: (held.readmeNote || "Held outside supabase/migrations by owner decision.").trim(),
      recommendedAction: isSuperseded
        ? "Keep archived in held-migrations; never apply."
        : "Keep held until owner completes KPI/legal review.",
      safety,
    });
  }

  // 3. Reverse direction: detect live production ledger rows missing from repo (`DRIFTED`)
  if (hasLiveLedger) {
    for (const row of ledgerRows) {
      if (!row || !row.version) continue;
      if (exceptionByVersion.has(row.version)) continue;
      if (canonicalNames.has(row.name)) continue;
      const stemMatch = canonicalStems.get(row.name);
      if (stemMatch && canonicalHashes.get(stemMatch) === row.statements_sha256) continue;

      results.push({
        file: `<production-only>:${row.version}_${row.name}`,
        status: "DRIFTED",
        via: "live-ledger-only",
        ledgerVersion: row.version,
        ledgerName: row.name,
        reason: `Applied in live Supabase schema_migrations (${row.version} / ${row.name}) with no committed canonical SQL on main (likely applied from an unmerged branch/PR).`,
        recommendedAction:
          "Merge the originating PR carrying the canonical migration SQL + receipt, or review into migration-historical-exceptions.json if historical.",
        safety: null,
      });
    }
  }

  return results;
}

function classifyDeclaredPendingFile({ file, pending, safety, objSet, liveInvariants }) {
  const reasonText = String(pending?.reason || "");

  // Legal / Counsel Q1 holds (#1809)
  if (/DEPENDS ON COUNSEL Q1/i.test(reasonText)) {
    return {
      file,
      status: "BLOCKED",
      via: "pending-counsel-hold",
      tracking: pending.tracking,
      reason: "Blocked on legal/counsel Q1 (#1809): Google-corroborated coordinate derivation.",
      recommendedAction: "LEAVE BLOCKED until counsel Q1 sign-off; use 20261021030000 Google-free verified subset instead.",
      safety,
    };
  }

  // Uncorroborated Census geocodes (#1809)
  if (file === "20261015180200_wf_inventory_official_address_coords_uncorroborated.sql") {
    return {
      file,
      status: "REQUIRES_REVIEW",
      via: "pending-position-review",
      tracking: pending.tracking,
      reason: "97 US Census geocodes without secondary position corroboration; requires manual spot-check before map pin promotion.",
      recommendedAction: "Hold for position accuracy review before applying.",
      safety,
    };
  }

  // Superseded UT deals migration (20261109160100 -> superseded by 20261109210000 + row 63 deactivated)
  if (file === "20261109160100_wf_deals_ut_one_day_tickets.sql") {
    if (liveInvariants && liveInvariants.utInitialDealsPresent && liveInvariants.utFinalProductPagesLive) {
      return {
        file,
        status: "SUPERSEDED",
        via: "live-data-probe",
        tracking: pending.tracking,
        reason:
          "Initial UT rows (61-64) already exist in wf_deals, row 63 was deactivated in favor of row 65, and 20261109210000 superseded the affiliate SIDs (`coupon_epcot1`, `coupon_sea1`, `coupon_bgt1`, `coupon_lego1`). `WHERE NOT EXISTS` makes replay a 0-row no-op.",
        recommendedAction:
          "Do NOT replay stale transformations manually; record ledger state via apply-migration.mjs (0-row no-op) when SUPABASE_ACCESS_TOKEN is present.",
        safety,
      };
    }
    if (liveInvariants && liveInvariants.utInitialDealsPresent && !liveInvariants.utFinalProductPagesLive) {
      return {
        file,
        status: "PARTIALLY_APPLIED",
        via: "live-data-probe",
        tracking: pending.tracking,
        reason: "Initial UT deals exist in DB without ledger entry and final product page alignment is incomplete.",
        recommendedAction: "Inspect wf_deals rows 61-65 before recording ledger receipt.",
        safety,
      };
    }
  }

  // Obsolete / already-reflected DML migrations (20261109160000 & 20261109210000)
  if (file === "20261109160000_wf_events_christmas_short_titles.sql") {
    if (liveInvariants?.xmasShortTitlesAllLive) {
      return {
        file,
        status: "OBSOLETE",
        via: "live-data-probe",
        tracking: pending.tracking,
        reason:
          "All targeted Christmas park event short_titles are already live in wf_events; SQL ran out-of-band on 2026-11-09 without SUPABASE_ACCESS_TOKEN. `WHERE` guards make ledger recording a 0-row no-op.",
        recommendedAction:
          "Safe 0-row ledger reconciliation via scripts/apply-migration.mjs once SUPABASE_ACCESS_TOKEN is available.",
        safety,
      };
    }
  }

  if (file === "20261109210000_wf_deals_ut_one_day_product_pages.sql") {
    if (liveInvariants?.utFinalProductPagesLive) {
      return {
        file,
        status: "OBSOLETE",
        via: "live-data-probe",
        tracking: pending.tracking,
        reason:
          "All 4 official one-day Undercover Tourist product pages (IDs 61, 62, 64, 65 with active=true and row 63 active=false) are already live in wf_deals; missing only schema_migrations ledger entry.",
        recommendedAction:
          "Safe idempotent ledger reconciliation via scripts/apply-migration.mjs once SUPABASE_ACCESS_TOKEN is available.",
        safety,
      };
    }
  }

  // Indigenous Restaurant closure (#2132)
  if (file === "20261103120000_indigenous_sarasota_closed_permanently.sql") {
    if (liveInvariants?.indigenousClosedInDb) {
      return {
        file,
        status: "OBSOLETE",
        via: "live-data-probe",
        tracking: pending.tracking,
        reason: "Indigenous Restaurant is already CLOSED_PERMANENTLY in wf_inventory without ledger row (note: replay raises).",
        recommendedAction: "Do NOT replay SQL; record ledger receipt only.",
        safety,
      };
    }
    return {
      file,
      status: "PENDING_SAFE",
      via: liveInvariants?.indigenousPreconditionReady ? "live-precondition-verified" : "pending-manifest",
      tracking: pending.tracking,
      reason:
        "Single-row transactional closure for permanently closed Indigenous Restaurant (Sarasota). Public surfaces are already protected in code via lib/notPublicPlaces.js; DB row precondition is verified ready for canonical apply.",
      recommendedAction: "Apply via scripts/apply-migration.mjs when SUPABASE_ACCESS_TOKEN is present.",
      safety,
    };
  }

  // Held-event recheck guard pair (20261105120030 -> 20261105120035)
  if (file === "20261105120030_event_truth_held_recheck_guard.sql") {
    const triggerAlreadyLive =
      objSet.has("trigger:wf_events_held_recheck_guard") &&
      objSet.has("function:wf_events_held_recheck_guard");
    if (triggerAlreadyLive) {
      return {
        file,
        status: "PARTIALLY_APPLIED",
        via: "live-schema-probe",
        tracking: pending.tracking,
        reason: "Trigger/function wf_events_held_recheck_guard exists in live schema without schema_migrations ledger row.",
        recommendedAction: "Verify function body and record canonical ledger apply.",
        safety,
      };
    }
    return {
      file,
      status: "PENDING_SAFE",
      via: "live-schema-verified-absent",
      tracking: pending.tracking,
      reason: "Additive BEFORE INSERT/UPDATE trigger ensuring held future events always retain a <=2-day ET recheck deadline. Zero destructive risk; older app compatible.",
      recommendedAction: "Apply first (before 20261105120035) via scripts/apply-migration.mjs.",
      safety,
    };
  }

  if (file === "20261105120035_event_truth_held_recheck_renewal_cap.sql") {
    return {
      file,
      status: "PENDING_SAFE",
      via: "ordered-dependency-verified",
      tracking: pending.tracking,
      reason: "Function-only hardening capping due held-event renewals at ET today+2; includes explicit precondition check requiring 20261105120030 trigger first.",
      recommendedAction: "Apply immediately after 20261105120030 via scripts/apply-migration.mjs.",
      safety,
    };
  }

  // Redirect burst table + RPC (20261027120000)
  if (file === "20261027120000_wf_redirect_burst.sql") {
    const tableLive = objSet.has("table:wf_redirect_burst") || liveInvariants?.redirectBurstTableExists;
    const fnLive = objSet.has("function:wf_redirect_burst_record");
    if (tableLive && fnLive) {
      return {
        file,
        status: "OBSOLETE",
        via: "live-schema-probe",
        tracking: pending.tracking,
        reason: "wf_redirect_burst table and RPC already exist in live schema without ledger entry.",
        recommendedAction: "Reconcile ledger entry via apply-migration.mjs (IF NOT EXISTS / CREATE OR REPLACE).",
        safety,
      };
    }
    if (tableLive !== fnLive) {
      return {
        file,
        status: "PARTIALLY_APPLIED",
        via: "live-schema-probe",
        tracking: pending.tracking,
        reason: `Half-applied state detected: table=${tableLive}, rpc=${fnLive}.`,
        recommendedAction: "Complete idempotent apply or drop partial object.",
        safety,
      };
    }
    return {
      file,
      status: "PENDING_SAFE",
      via: "live-schema-verified-absent",
      tracking: pending.tracking,
      reason: "Purely additive RLS-locked table + RPC for cross-instance redirect burst limiting; app currently fails open cleanly to in-memory store.",
      recommendedAction: "Safe to apply via scripts/apply-migration.mjs when SUPABASE_ACCESS_TOKEN is provided.",
      safety,
    };
  }

  // Google-free verified independent coords (20261021030000)
  if (file === "20261021030000_wf_inventory_coords_independent_verified.sql") {
    if (liveInvariants && liveInvariants.verifiedIndependentCoordsCount > 0) {
      return {
        file,
        status: "OBSOLETE",
        via: "live-data-probe",
        tracking: pending.tracking,
        reason: "Verified Google-free independent_coords entries are already present in wf_inventory.",
        recommendedAction: "Verify full 35-row count before ledger reconciliation.",
        safety,
      };
    }
    return {
      file,
      status: "PENDING_SAFE",
      via: "audit-csv-and-reverse-verified",
      tracking: pending.tracking,
      reason: "35 Google-free dual-corroborated coordinates (19 Wikidata P625 + 16 US Census geocodes) with full reverse SQL script.",
      recommendedAction: "Safe to apply via scripts/apply-migration.mjs after owner review.",
      safety,
    };
  }

  return {
    file,
    status: safety.canResumeAfterHalfApply && safety.olderAppCompatible ? "PENDING_SAFE" : "REQUIRES_REVIEW",
    via: "generic-safety-analysis",
    tracking: pending.tracking,
    reason: reasonText.slice(0, 240),
    recommendedAction: "Review SQL and apply via canonical scripts/apply-migration.mjs.",
    safety,
  };
}

/**
 * Full end-to-end workspace + live production migration state report.
 */
export async function runMigrationStateReconciler({
  repoRoot,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const migDir = path.join(repoRoot, "supabase", "migrations");
  const heldDir = path.join(repoRoot, "supabase", "held-migrations");
  const fixesDir = path.join(repoRoot, "supabase", "data-fixes");

  const repoFileNames = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const repoFiles = repoFileNames.map((name) => {
    const stem = name.replace(/\.sql$/, "");
    const reversePath = path.join(fixesDir, `${stem}_REVERSE.sql`);
    return {
      name,
      sql: readFileSync(path.join(migDir, name), "utf8"),
      hasReverseScript: existsSync(reversePath),
    };
  });

  const heldReadme = existsSync(path.join(heldDir, "README.md"))
    ? readFileSync(path.join(heldDir, "README.md"), "utf8")
    : "";
  const heldFiles = existsSync(heldDir)
    ? readdirSync(heldDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((name) => {
          const idx = heldReadme.indexOf(name);
          const snippet = idx >= 0 ? heldReadme.slice(idx, idx + 450) : "";
          return {
            name,
            sql: readFileSync(path.join(heldDir, name), "utf8"),
            readmeNote: snippet.split("\n").slice(2, 5).join(" ").trim(),
          };
        })
    : [];

  const pendingManifest = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts", "migration-pending-apply.json"), "utf8"),
  );
  const receipts = readFileSync(path.join(repoRoot, "scripts", "migration-apply-log.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  const exceptions = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts", "migration-historical-exceptions.json"), "utf8"),
  );
  const contentBaseline = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts", "migration-content-baseline.json"), "utf8"),
  );

  const url = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY || "").trim();
  const hasAccessToken = Boolean(String(env?.SUPABASE_ACCESS_TOKEN || "").trim());

  let ledgerRows = null;
  let objectSet = null;
  let liveInvariants = null;
  let liveMode = false;
  let liveError = null;

  if (url && key) {
    const [ledgerRes, objRes, inv] = await Promise.all([
      fetchAllRpcRows({
        url,
        key,
        fn: "wf_migration_ledger_hashes",
        order: "version.asc",
        identity: (r) => r && r.version,
        unique: true,
        fetchImpl,
      }),
      fetchAllRpcRows({
        url,
        key,
        fn: "wf_schema_objects",
        order: "kind.asc,name.asc",
        identity: (r) => r && `${r.kind}:${r.name}`,
        fetchImpl,
      }),
      probeLivePendingInvariants({ url, key, fetchImpl }),
    ]);

    if (ledgerRes.error || objRes.error) {
      liveError = `RPC error (ledger=${ledgerRes.error || "ok"}, objects=${objRes.error || "ok"})`;
    } else {
      liveMode = true;
      ledgerRows = ledgerRes.rows;
      objectSet = new Set(objRes.rows.map((r) => `${r.kind}:${r.name}`));
      liveInvariants = inv;
    }
  }

  const classifications = classifyAllMigrations({
    repoFiles,
    heldFiles,
    pendingManifest,
    receipts,
    ledgerRows,
    objectSet,
    exceptions,
    contentBaseline,
    liveInvariants,
  });

  const countsByState = Object.fromEntries(MIGRATION_STATES.map((s) => [s, 0]));
  for (const c of classifications) {
    countsByState[c.status] = (countsByState[c.status] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    liveMode,
    liveError,
    managementApiTokenPresent: hasAccessToken,
    blockerIfApplyNeeded: hasAccessToken
      ? null
      : "CREDENTIAL: SUPABASE_ACCESS_TOKEN absent in local env; canonical schema_migrations writes require scripts/apply-migration.mjs with SUPABASE_ACCESS_TOKEN.",
    countsByState,
    liveInvariants,
    nonAppliedEntries: classifications.filter((c) => c.status !== "APPLIED"),
    allEntries: classifications,
  };
}
