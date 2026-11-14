// lib/nervousSystemReport.js — Mission 21 Wayfind Production Nervous System Observability.
//
// Aggregates all 11 operational health boundaries in one read-only, zero-paid-spend
// report so Wayfind can operate at scale without human babysitting:
//   1. ownedHoursCoverage
//   2. unknownOpenStatePct
//   3. googleDetailAttempts
//   4. googleDetail503s
//   5. humanVsBackgroundSpend
//   6. staleSnapshotCount
//   7. syntheticWritesBlocked
//   8. attributionContamination
//   9. migrationDrift
//  10. searchEligibilityRejections
//  11. christmasOpenTonightCount
//
// Strictly read-only: issues ZERO Google Places calls and mutates ZERO database rows.

import { evaluateOwnedHoursStatus, isUsableOwnedHours } from "./ownedHours.js";
import { rankHoursRefreshQueue } from "./hoursFreshnessQueue.js";
import { getDetailTelemetry } from "./detailTelemetry.js";
import { getSpendClassTelemetry } from "./spendGate.js";
import { getFirewallTelemetry } from "./productionWriteFirewall.js";
import { getSearchRejectionTelemetry } from "./searchSemantics.js";
import {
  VIATOR_CLEAN_CLICKS_POSTGREST_FILTER,
  VIATOR_SYNTHETIC_FIXTURE_POSTGREST_FILTER,
  TP_CLEAN_CLICKS_POSTGREST_FILTER,
} from "./attributionHygiene.js";
import { christmasBrowseListings } from "./christmasBrowse.js";
import { computeChristmasTemporalCounts } from "./christmasTemporalModes.js";
import { siteTodayStr } from "./siteTime.js";

function resolveSupabaseReadConfig(env = process.env) {
  const raw = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!raw || !key) return null;
  return {
    url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
    key,
  };
}

async function postgrestCount(sb, pathAndQuery, fetchImpl) {
  const r = await fetchImpl(`${sb.url}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: sb.key,
      Authorization: `Bearer ${sb.key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`${pathAndQuery} -> HTTP ${r.status}`);
  const cr = r.headers.get("content-range") || "";
  const total = Number(cr.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function fetchInventorySignals(sb, fetchImpl, maxPages = 30) {
  const all = [];
  const pageSize = 1000;
  for (let i = 0; i < maxPages; i++) {
    const offset = i * pageSize;
    const r = await fetchImpl(
      `${sb.url}/rest/v1/wf_inventory?status=eq.OPERATIONAL&excluded=not.is.true&select=place_id,metro,anchor,category,signals&limit=${pageSize}&offset=${offset}`,
      {
        headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(4500),
      },
    );
    if (!r.ok) throw new Error(`wf_inventory scan -> HTTP ${r.status}`);
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

/**
 * Builds the complete 11-metric Nervous System report.
 */
export async function buildNervousSystemReport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
  today = siteTodayStr(),
  migrationSummaryOverride = null,
} = {}) {
  const sb = resolveSupabaseReadConfig(env);
  if (!sb) {
    return { ok: false, status: 503, error: "unconfigured" };
  }

  let invRows = [];
  let viatorTotal = 0;
  let viatorClean = 0;
  let viatorFixtureRows = 0;
  let tpTotal = 0;
  let tpClean = 0;
  let spendDailyRows = [];
  let ledgerHashes = null;
  let curatedChristmasRows = [];

  try {
    [
      invRows,
      viatorTotal,
      viatorClean,
      viatorFixtureRows,
      tpTotal,
      tpClean,
      spendDailyRows,
      ledgerHashes,
      curatedChristmasRows,
    ] = await Promise.all([
      fetchInventorySignals(sb, fetchImpl),
      postgrestCount(sb, "wf_viator_clicks?select=*", fetchImpl).catch(() => 0),
      postgrestCount(sb, `wf_viator_clicks?select=*&${VIATOR_CLEAN_CLICKS_POSTGREST_FILTER}`, fetchImpl).catch(() => 0),
      postgrestCount(sb, `wf_viator_clicks?select=*&${VIATOR_SYNTHETIC_FIXTURE_POSTGREST_FILTER}`, fetchImpl).catch(() => 0),
      postgrestCount(sb, "wf_tp_clicks?select=*", fetchImpl).catch(() => 0),
      postgrestCount(sb, `wf_tp_clicks?select=*&${TP_CLEAN_CLICKS_POSTGREST_FILTER}`, fetchImpl).catch(() => 0),
      fetchImpl(
        `${sb.url}/rest/v1/wf_spend_daily?day=eq.${encodeURIComponent(today)}&select=sku,used,cap`,
        {
          headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3500),
        },
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetchImpl(`${sb.url}/rest/v1/rpc/wf_migration_ledger_hashes`, {
        method: "POST",
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchImpl(
        `${sb.url}/rest/v1/wf_events?select=event_id,slug,title,city,state,venue,lat,lng,start_date,end_date,start_time,schedule_note,select_nights,is_free,price_note,minimum_age,official_event_url,official_ticket_url,source_url,event_status,ticket_status,popularity_score,local_rank,last_verified_at&state=eq.FL&limit=1000`,
        {
          headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` },
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        },
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]);
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: "read_failed",
      detail: String(err?.message || err),
    };
  }

  // 1 & 2 & 6. Owned hours coverage, unknown open-state %, and stale snapshot count
  const totalOperational = invRows.length;
  let usableOwnedHoursCount = 0;
  let knownOpenCount = 0;
  let knownClosedCount = 0;
  let unknownOpenCount = 0;
  let staleSnapshotCount = 0;
  let expiredSnapshotCount = 0;

  for (const row of invRows) {
    const oh = row?.signals?.owned_hours;
    if (oh && isUsableOwnedHours(oh, nowMs)) {
      usableOwnedHoursCount++;
      const st = evaluateOwnedHoursStatus(oh, nowMs);
      if (st.freshness === "stale") staleSnapshotCount++;
      if (st.state === "open") knownOpenCount++;
      else if (st.state === "closed") knownClosedCount++;
      else unknownOpenCount++;
    } else {
      if (oh) expiredSnapshotCount++;
      unknownOpenCount++;
    }
  }

  const topQueue = rankHoursRefreshQueue(invRows, { nowMs })
    .slice(0, 10)
    .map((item) => ({
      place_id: item.row.place_id,
      metro: item.row.metro || null,
      category: item.row.category || null,
      score: item.score,
      reasons: item.reasons,
    }));

  const coveragePct = totalOperational > 0 ? Number(((usableOwnedHoursCount / totalOperational) * 100).toFixed(2)) : 0;
  const unknownPct = totalOperational > 0 ? Number(((unknownOpenCount / totalOperational) * 100).toFixed(2)) : 0;

  // 3 & 4. Detail telemetry (attempts + 503 rate)
  const detailTelem = getDetailTelemetry();

  // 5. Human vs Background Spend (in-process 5-class counters + live daily ledger rows)
  const spendTelem = getSpendClassTelemetry();
  const dailyLedgerBySku = {};
  if (Array.isArray(spendDailyRows)) {
    for (const r of spendDailyRows) {
      if (r?.sku) {
        dailyLedgerBySku[r.sku] = {
          used: Number(r.used) || 0,
          cap: r.cap != null ? Number(r.cap) : null,
        };
      }
    }
  }

  // 7. Synthetic writes blocked (firewall telemetry)
  const firewallTelem = getFirewallTelemetry();

  // 8. Attribution contamination
  const attributionContamination = {
    viator: {
      totalRows: viatorTotal,
      syntheticFixtureRows: viatorFixtureRows,
      syntheticTotalRows: Math.max(0, viatorTotal - viatorClean),
      cleanAnalyticalRows: viatorClean,
    },
    travelpayouts: {
      totalRows: tpTotal,
      syntheticQaRows: Math.max(0, tpTotal - tpClean),
      cleanAnalyticalRows: tpClean,
    },
  };

  // 9. Migration drift
  const migrationDrift = migrationSummaryOverride || {
    appliedLedgerCount: Array.isArray(ledgerHashes) ? ledgerHashes.length : null,
    rpcReachable: Array.isArray(ledgerHashes),
    note: "Run scripts/reconcile-migrations.mjs or scripts/ops-nervous-system-report.mjs for full 8-state repo-vs-live reconciliation.",
  };

  // 10. Search eligibility rejections
  const searchRejections = getSearchRejectionTelemetry();

  // 11. Christmas Open Tonight count
  const christmasListings = christmasBrowseListings(
    Array.isArray(curatedChristmasRows) ? curatedChristmasRows : [],
    today,
  );
  const christmasCounts = computeChristmasTemporalCounts(christmasListings, today, { nowMs });

  const alerts = [];
  if (detailTelem.detail_503_returned > 0) {
    alerts.push(`detail_503_nonzero:${detailTelem.detail_503_returned}`);
  }
  if (spendTelem?.byClass?.synthetic_qa?.granted > 0) {
    alerts.push(`synthetic_qa_spend_granted:${spendTelem.byClass.synthetic_qa.granted}`);
  }

  return {
    ok: alerts.length === 0,
    status: 200,
    surface: "nervous-system",
    checkedAt: new Date(nowMs).toISOString(),
    today,
    alerts,
    metrics: {
      ownedHoursCoverage: {
        usableOwnedHoursCount,
        totalOperationalInventory: totalOperational,
        coveragePct,
      },
      unknownOpenStatePct: {
        unknownCount: unknownOpenCount,
        knownOpenCount,
        knownClosedCount,
        unknownPct,
      },
      googleDetailAttempts: {
        paidLookupAttempted: detailTelem.paid_lookup_attempted,
        paidLookupSkipped: detailTelem.paid_lookup_skipped,
        snapshotServed: detailTelem.snapshot_served,
        snapshotStale: detailTelem.snapshot_stale,
        degradedPartialServed: detailTelem.degraded_partial_served,
        liveRefreshSuccess: detailTelem.live_refresh_success,
        liveRefreshFailure: detailTelem.live_refresh_failure,
      },
      googleDetail503s: {
        count: detailTelem.detail_503_returned,
        detail503Rate: detailTelem.detail503Rate,
      },
      humanVsBackgroundSpend: {
        inProcessByClass: spendTelem.byClass,
        dailyLedgerBySku,
      },
      staleSnapshotCount: {
        staleCount: staleSnapshotCount,
        expiredCount: expiredSnapshotCount,
        refreshQueueTop10: topQueue,
      },
      syntheticWritesBlocked: firewallTelem,
      attributionContamination,
      migrationDrift,
      searchEligibilityRejections: searchRejections,
      christmasOpenTonightCount: christmasCounts,
    },
  };
}
