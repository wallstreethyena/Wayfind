import { gateShut, spendAllowRefresh, refundToLedger, refreshCounterSku } from "../../../../lib/spendGate";
// app/api/cron/inventory-refresh/route.js — keep wf_inventory checked against
// Google at $0 EXTRA cost, a few rows at a time, and NEVER lose anything.
//
// HISTORY (v8.12, 2026-08-18). lib/trendMatch.matchConcept refuses any row whose
// refreshed_at is older than 30 days (Google's content ceiling). Freshness is a
// pipeline, not a one-time import. Until 2026-10-25 this job returned early in
// WAYFIND_GATE=free, so it refreshed nothing after 2026-08-25.
//
// OWNER DECISION 2026-10-25 ("refresh, but I don't want to pay and don't want to
// lose anything"):
//   * It runs in free mode, spending ONLY inside Google's free monthly lines,
//     through lib/spendGate.spendAllowRefresh: one grant per Google call, taken
//     from the same ledger row as the site and the promoter AND from its own
//     refresh_<sku> counter (a sub-cap), and never above the free line, so it
//     can never take a paid grant. WAYFIND_GATE=shut still means zero calls.
//   * Three tiers per row, richest affordable first (lib/inventoryGoogleCheck.js):
//       enterprise  (Nov 2026 on)  full content; re-dates refreshed_at as before
//       pro         (Nov 2026 on)  status + coordinate; does NOT re-date content
//       essentials  (now)          exists-in-Google + coordinate; does NOT re-date
//   * Queue: anchors first, then most-reviewed (what people see), never checked
//     or longest-unchecked first.
//   * NOTHING is deleted or blanked. Writes carry only real Google values and are
//     compare-and-swap on the signals / independent_coords they were judged on.
//     CLOSED_PERMANENTLY updates status; NOT_FOUND adds signals.google_not_found_at
//     and leaves the row in place for owner review; locked rows get flags only.
//
// check-cron-honesty: a failed run answers non-2xx via jobFailed; an
// unconfigured run answers jobCannotRun. No failure hides behind a 200.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { normalizeDetails, PLACE_DETAILS_FIELDS, PLACE_DETAILS_CACHE_MS } from "../../../../lib/placeDetails";
import { cset } from "../../../../lib/serverCache.js";
import { inventoryRefreshPatch, refreshSlice, REFRESH_WINDOW_SLOTS } from "../../../../lib/inventoryRefreshPatch.js";
import { planCheck, planEnterprise, tierOrder, fetchGoogleCheck, ESSENTIALS_MASK, PRO_MASK, TIER_SKU } from "../../../../lib/inventoryGoogleCheck.js";
import { classifyProviderFailure, breakerOpen, tripBreaker } from "../../../../lib/providerHealth.js";
import { recordPulse, budgetGateNote, budgetLimitNote } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

// Check anything not checked in this many days. Below the 30-day ceiling on
// purpose: rows are renewed BEFORE they expire.
const REFRESH_AFTER_DAYS = 25;
const PARALLEL = 5;
const BREAKER = "google_places_refresh";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  // COST GUARD: WAYFIND_GATE=shut stops ALL metered Google spend. Free mode runs,
  // but every Google call below sits behind spendAllowRefresh (free line only).
  if (gateShut()) {
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: budgetGateNote("shut", "inventory checks are off; Google-sourced pins age out of the 30-day window") });
    return Response.json({ skipped: "gate shut", gate: "shut" });
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const gkey = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("inventory-refresh", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!gkey) return jobCannotRun("inventory-refresh", "GOOGLE_MAPS_SERVER_KEY is missing");
  const open = await breakerOpen(BREAKER);
  if (open) {
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: `${open.kind}: breaker open, skipped (${open.reason})` });
    return Response.json({ skipped: "breaker open", kind: open.kind });
  }
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(120, Number(u.searchParams.get("limit")) || 40));
  const cutoff = new Date(Date.now() - REFRESH_AFTER_DAYS * 86400000).toISOString();

  // Rows whose Google content is older than the cutoff AND that no tier has
  // checked within it. excluded rows are never served; CLOSED_PERMANENTLY has
  // nothing to renew. LOCKED rows are INCLUDED (flag-only: tierOrder gives them
  // the essentials tier and planCheck never touches their coordinates/status).
  const { data: windowRows, error } = await db
    .from("wf_inventory")
    .select("place_id, metro, refreshed_at, locked, status, lat, lng, anchor, signals, independent_coords")
    .lt("refreshed_at", cutoff)
    .or("excluded.is.null,excluded.eq.false")
    .or("status.is.null,status.neq.CLOSED_PERMANENTLY")
    .or("signals->>google_checked_at.is.null,signals->>google_checked_at.lt." + cutoff)
    .order("anchor", { ascending: false })
    .order("signals->reviews", { ascending: false, nullsFirst: false })
    .limit(limit * REFRESH_WINDOW_SLOTS);
  if (error) return jobFailed("inventory-refresh", "stale-row select failed: " + error.message);
  const rows = refreshSlice(windowRows || [], limit, Math.floor(Date.now() / 3600000));
  if (!rows || !rows.length) {
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, note: "nothing unchecked for " + REFRESH_AFTER_DAYS + "d" });
    return Response.json({ ok: true, checked: 0, note: "nothing unchecked for " + REFRESH_AFTER_DAYS + "d" });
  }

  const tally = { enterprise: 0, pro: 0, essentials: 0 };
  let applied = 0, conflicts = 0, failed = 0, noGrant = 0, notFound = 0, denied = null;
  const exhausted = new Set();
  const queue = [...rows];

  // One grant, one Google call. An unbilled failure gives its grants back.
  async function checkOne(row) {
    for (const tier of tierOrder(row)) {
      if (exhausted.has(tier)) continue;
      const sku = TIER_SKU[tier];
      if (!(await spendAllowRefresh(sku))) { exhausted.add(tier); continue; }
      const mask = tier === "enterprise" ? PLACE_DETAILS_FIELDS : tier === "pro" ? PRO_MASK : ESSENTIALS_MASK;
      const res = await fetchGoogleCheck(row.place_id, mask, { key: gkey, signal: AbortSignal.timeout(8000) });
      if (!res.billed) { await refundToLedger(refreshCounterSku(sku), 1); await refundToLedger(sku, 1); }
      return { tier, res };
    }
    return null;
  }

  async function writePlan(row, plan) {
    let q = db.from("wf_inventory").update(plan.update).eq("place_id", row.place_id);
    q = plan.expect.signals == null ? q.is("signals", null) : q.eq("signals", JSON.stringify(plan.expect.signals));
    if (plan.expect.independent_coords !== undefined && plan.update.independent_coords !== undefined) {
      q = plan.expect.independent_coords == null ? q.is("independent_coords", null) : q.eq("independent_coords", JSON.stringify(plan.expect.independent_coords));
    }
    const { data, error: upErr } = await q.select("place_id");
    if (upErr) return "error";
    return data && data.length ? "applied" : "conflict";
  }

  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row || denied) return;
      try {
        const got = await checkOne(row);
        if (!got) { noGrant++; continue; }
        const { tier, res } = got;
        if (res.kind === "denied") {
          const kind = classifyProviderFailure(res.status, res.body);
          denied = { status: res.status, kind };
          if (kind) await tripBreaker(BREAKER, kind, "google " + res.status);
          continue;
        }
        if (res.kind === "error") { failed++; continue; }
        tally[tier]++;
        let plan;
        if (tier === "enterprise") {
          const norm = res.kind === "ok" ? normalizeDetails(res.place) : null;
          if (norm) { try { await cset("pd1|" + row.place_id, norm, PLACE_DETAILS_CACHE_MS); } catch {} }
          const now = Date.now();
          const patch = norm ? inventoryRefreshPatch(row.place_id, { details: norm, live: true, fetchedAt: new Date(now).toISOString() }, now, row.refreshed_at) : null;
          plan = planEnterprise(row, res, patch, now);
        } else {
          plan = planCheck(row, tier, res, Date.now());
        }
        if (res.kind === "not_found") notFound++;
        if (!plan) continue;
        const w = await writePlan(row, plan);
        if (w === "applied") applied++; else if (w === "conflict") conflicts++; else failed++;
      } catch (e) {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const spent = tally.enterprise + tally.pro + tally.essentials;
  const note = `checked ${spent} (enterprise ${tally.enterprise}, pro ${tally.pro}, essentials ${tally.essentials}); written ${applied}; conflicts ${conflicts}; not-found flagged ${notFound}; no grant ${noGrant}; nothing deleted or blanked`;
  if (denied) {
    const kind = denied.kind || "denied";
    return jobFailed("inventory-refresh", `${denied.kind ? denied.kind + ": " : ""}google ${denied.status} on place details, run stopped (${kind})`, { attempted: rows.length, succeeded: applied });
  }
  // A write that never matches its compare-and-swap is a bug, not a quiet success.
  if (spent >= 5 && applied === 0 && conflicts > 0) return jobFailed("inventory-refresh", `0/${spent} writes applied, ${conflicts} compare-and-swap conflicts`, { attempted: rows.length });
  if (spent === 0 && failed === 0 && noGrant > 0) {
    // Every free-tier refresh grant is used up for now: idle, not a failure.
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: budgetLimitNote("refresh", null, null, "free-tier refresh grants used up for this month") });
    return Response.json({ ok: true, checked: 0, note: "refresh grants used up", noGrant });
  }
  if (spent === 0 && failed > 0) return jobFailed("inventory-refresh", `0/${rows.length} rows checked (${failed} failures)`, { attempted: rows.length });
  await recordPulse("inventory-refresh", { attempted: rows.length, succeeded: applied, failed, note });
  return Response.json({ ok: true, checked: spent, tiers: tally, applied, conflicts, failed, noGrant, notFound, scanned: rows.length });
}
