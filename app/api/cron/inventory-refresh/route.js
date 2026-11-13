import { gateShut, spendAllowRefresh, refundToLedger, refreshCounterSku, runWithTraffic, TRAFFIC, runWithBackgroundPriority, BACKGROUND_PRIORITY, backgroundDailyStatus, refreshRichAffordable } from "../../../../lib/spendGate";
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
import { planCheck, planEnterprise, tierOrder, tiersToTry, neverChecked, refreshEligible, fetchGoogleCheck, ESSENTIALS_MASK, PRO_MASK, TIER_SKU } from "../../../../lib/inventoryGoogleCheck.js";
import { classifyProviderFailure, breakerOpen, tripBreaker, breakerCooldownMs, GOOGLE_DETAILS_DAILY_BREAKER } from "../../../../lib/providerHealth.js";
import { recordPulse, budgetGateNote, budgetLimitNote, budgetDailyReserveNote } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

// Check anything not checked in this many days. Below the 30-day ceiling on
// purpose: rows are renewed BEFORE they expire.
const REFRESH_AFTER_DAYS = 25;
const PARALLEL = 5;
// Rows per hourly run. 12 x 24 = 288 a day, which is the refresh sub-cap spread over the month
// (8,000 / 30 = 267 a day) and sits under the scheduled-refresh line of the Google daily counter
// (lib/spendGate.js BACKGROUND_DAILY_LINES). It used to be 40 (960 a day), which is what let this
// job and the promoter exhaust Google's per-day Place Details quota every evening and left visitors
// with 429s until the Pacific reset (2026-11-12). ?limit= still overrides it.
const RUN_LIMIT_DEFAULT = 12;
const SKIP_FRESH = Symbol("skip-fresh");
// Never-checked rows are new inventory (priority B); everything else is scheduled refresh (C). The Google
// daily counter (lib/spendGate.js) refuses C before B, and every grant inside checkOne inherits this rank.
const rowPriority = (row) => (neverChecked(row) ? BACKGROUND_PRIORITY.NEW_OR_CHANGED : BACKGROUND_PRIORITY.SCHEDULED);
const BREAKER = "google_places_refresh";

// Traffic class (lib/spendGate.js human traffic reserve): REFRESH, not BACKGROUND. The refresh has its own refresh_* counters and the owner's half-and-half split (REFRESH_SUBCAPS), so the human reserve does not apply to it.
export async function GET(req) {
  return runWithTraffic(TRAFFIC.REFRESH, () => runInventoryRefresh(req));
}

async function runInventoryRefresh(req) {
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
  const open = (await breakerOpen(BREAKER)) || (await breakerOpen(GOOGLE_DETAILS_DAILY_BREAKER));
  if (open) {
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: `${open.kind}: breaker open, skipped (${open.reason})` });
    return Response.json({ skipped: "breaker open", kind: open.kind });
  }
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(120, Number(u.searchParams.get("limit")) || RUN_LIMIT_DEFAULT));
  const nowD = new Date();
  const cutoffMs = nowD.getTime() - REFRESH_AFTER_DAYS * 86400000;
  const cutoff = new Date(cutoffMs).toISOString();

  // GOOGLE DAILY LINE preflight (lib/spendGate.js BACKGROUND_DAILY_LINES): Google meters Place Details
  // per day, and visitors share that day. Past the line this job stops BEFORE it selects or calls
  // anything, so a paused run costs nothing and a visitor keeps the rest of the day. The pause is an
  // expected state (attempted 0, failed 0, "skipped: budget-reserve ..."), which job-watch reads as
  // idle. New inventory (priority B) keeps a higher line than scheduled refresh (C): between the two
  // lines only never-checked rows are taken. An unreadable counter pauses too (fail closed).
  const dailyNew = await backgroundDailyStatus(BACKGROUND_PRIORITY.NEW_OR_CHANGED, nowD);
  if (dailyNew.blocked) {
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: budgetDailyReserveNote(dailyNew.used, dailyNew.line).slice(0, 200) });
    return Response.json({ ok: true, skipped: "daily-line", used: dailyNew.used, line: dailyNew.line, unreadable: dailyNew.unreadable });
  }
  const newOnly = (await backgroundDailyStatus(BACKGROUND_PRIORITY.SCHEDULED, nowD)).blocked;
  // Which RICHER tiers can still be granted this month. A row that a cheap tier checked inside the
  // window is only selected again when a richer tier is affordable (a repeat of the same cheap tier
  // re-dates nothing: 2026-11-12, 7,402 essentials lookups on ~670 places in 11 days).
  const richNow = await refreshRichAffordable(nowD);

  // Rows whose Google content is older than the cutoff AND that no ENTERPRISE
  // check has re-dated within it. excluded rows are never served;
  // CLOSED_PERMANENTLY has nothing to renew. LOCKED rows are INCLUDED
  // (flag-only: tierOrder gives them the essentials tier and planCheck never
  // touches their coordinates/status).
  //
  // THE TRAP THIS FIXES (2026-11-03, #1893): the old third clause required
  // google_checked_at itself to be stale. Cheap tiers (essentials/pro) stamp
  // google_checked_at WITHOUT re-dating refreshed_at — only an enterprise
  // content patch may move refreshed_at — and search serves inventory on
  // refreshed_at alone. So one essentials check (Bern's Steak House,
  // 2026-10-26, content dated 2026-08-25) made the row ineligible for the
  // only refresh that could re-date it, and the place vanished from search
  // while looking "checked". 5,716 OPERATIONAL rows sat in that trap. A
  // recent ENTERPRISE check still throttles (it had its chance to re-date);
  // a recent cheap-tier check no longer blocks escalation.
  //
  // WHEN NO ENTERPRISE REFRESH CAN BE GRANTED (2026-11-12): the clause above is the #1893 rule and
  // stays exactly as is while enterprise is affordable. Once it is spent for the month, a cheap-tier
  // check inside the window cannot be improved on, so such a row leaves the queue until the window
  // passes (or, while Pro is affordable, until it can be escalated to Pro). Without this the 160
  // head rows (anchors, most reviewed) were re-checked at the same cheap tier every four hours.
  // Within the window never-checked rows (new inventory) are ordered ahead of re-checks.
  let windowQuery = db
    .from("wf_inventory")
    .select("place_id, metro, refreshed_at, locked, status, lat, lng, anchor, signals, independent_coords")
    .lt("refreshed_at", cutoff)
    .or("excluded.is.null,excluded.eq.false")
    .or("status.is.null,status.neq.CLOSED_PERMANENTLY")
    .or("signals->>google_checked_at.is.null,signals->>google_checked_at.lt." + cutoff + ",signals->>google_check_tier.is.null,signals->>google_check_tier.neq.enterprise")
    .order("anchor", { ascending: false })
    .order("signals->>google_checked_at", { ascending: true, nullsFirst: true })
    .order("signals->reviews", { ascending: false, nullsFirst: false });
  if (!richNow.enterprise) {
    // A second or() ANDs with the one above. Enterprise is spent: only rows no check covers inside the
    // window stay (plus, while Pro is affordable, rows whose last check was essentials).
    const narrowTo = "signals->>google_checked_at.is.null,signals->>google_checked_at.lt." + cutoff + (richNow.pro ? ",signals->>google_check_tier.is.null,signals->>google_check_tier.eq.essentials" : "");
    windowQuery = windowQuery.or(narrowTo);
  }
  const selected = await windowQuery.limit(limit * REFRESH_WINDOW_SLOTS);
  const { data: windowRows, error } = selected;
  if (error) return jobFailed("inventory-refresh", "stale-row select failed: " + error.message);
  // The same predicate again in code (defence in depth, and what the lock test executes), plus the
  // new-inventory-only rule between the scheduled and the new-or-changed daily lines.
  const eligibleRows = (windowRows || []).filter((r) => refreshEligible(r, cutoffMs, richNow) && (!newOnly || neverChecked(r)));
  // New inventory (never checked, priority B) is taken before scheduled re-checks (C); each group still rotates
  // through its own window (refreshSlice) so a row that cannot be written does not wedge the head of its queue.
  const slot = Math.floor(Date.now() / 3600000);
  const newRows = refreshSlice(eligibleRows.filter((r) => neverChecked(r)), limit, slot);
  const rows = newRows.concat(newRows.length < limit ? refreshSlice(eligibleRows.filter((r) => !neverChecked(r)), limit - newRows.length, slot) : []);
  if (!rows || !rows.length) {
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, note: "nothing unchecked for " + REFRESH_AFTER_DAYS + "d" });
    return Response.json({ ok: true, checked: 0, note: "nothing unchecked for " + REFRESH_AFTER_DAYS + "d" });
  }

  const tally = { enterprise: 0, pro: 0, essentials: 0 };
  let applied = 0, conflicts = 0, failed = 0, noGrant = 0, notFound = 0, skippedFresh = 0, denied = null;
  const exhausted = new Set();
  const queue = [...rows];

  // One grant, one Google call. An unbilled failure gives its grants back.
  async function checkOne(row) {
    // A row already checked inside the freshness window is only worth a call at a RICHER tier than
    // its last check (tiersToTry).
    const priority = rowPriority(row);
    const tiers = tiersToTry(row, cutoffMs);
    if (!tiers.length) return SKIP_FRESH; // already checked inside the window at every tier it may use: no call
    for (const tier of tiers) {
      const exKey = tier + "|" + priority; // a refusal at the scheduled line must not stop a new row that ranks above it
      if (exhausted.has(exKey)) continue;
      const sku = TIER_SKU[tier];
      if (!(await spendAllowRefresh(sku))) { exhausted.add(exKey); continue; }
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
        const got = await runWithBackgroundPriority(rowPriority(row), () => checkOne(row));
        if (got === SKIP_FRESH) { skippedFresh++; continue; }
        if (!got) { noGrant++; continue; }
        const { tier, res } = got;
        if (res.kind === "denied") {
          const kind = classifyProviderFailure(res.status, res.body);
          denied = { status: res.status, kind };
          if (kind) {
            const cool = breakerCooldownMs(kind, res.status, res.body);
            await tripBreaker(BREAKER, kind, "google " + res.status, cool);
            // A per-day quota is shared with promote-index: park both until the reset.
            if (kind === "quota" && Number(res.status) === 429 && /per\s*day/i.test(String(res.body || ""))) await tripBreaker(GOOGLE_DETAILS_DAILY_BREAKER, kind, "google " + res.status + " per day", cool);
          }
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
  const note = `checked ${spent} (enterprise ${tally.enterprise}, pro ${tally.pro}, essentials ${tally.essentials}); written ${applied}; conflicts ${conflicts}; not-found flagged ${notFound}; no grant ${noGrant}; skipped (fresh) ${skippedFresh}; nothing deleted or blanked`;
  if (denied) {
    const kind = denied.kind || "denied";
    return jobFailed("inventory-refresh", `${denied.kind ? denied.kind + ": " : ""}google ${denied.status} on place details, run stopped (${kind})`, { attempted: rows.length, succeeded: applied });
  }
  // A write that never matches its compare-and-swap is a bug, not a quiet success.
  if (spent >= 5 && applied === 0 && conflicts > 0) return jobFailed("inventory-refresh", `0/${spent} writes applied, ${conflicts} compare-and-swap conflicts`, { attempted: rows.length });
  if (spent === 0 && failed === 0 && noGrant === 0 && skippedFresh > 0) {
    // Every selected row was already checked inside its window at each tier it may use: nothing to buy, idle.
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: `nothing to check: ${skippedFresh} selected row(s) already checked inside the ${REFRESH_AFTER_DAYS}d window` });
    return Response.json({ ok: true, checked: 0, skippedFresh });
  }
  if (spent === 0 && failed === 0 && noGrant > 0) {
    // Every free-tier refresh grant is used up for now: idle, not a failure. If the Google daily line is
    // what refused them (it can be crossed mid-run), say that instead of blaming the monthly sub-cap.
    const dailyNow = await backgroundDailyStatus(BACKGROUND_PRIORITY.SCHEDULED, new Date());
    if (dailyNow.blocked) {
      await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: budgetDailyReserveNote(dailyNow.used, dailyNow.line).slice(0, 200) });
      return Response.json({ ok: true, checked: 0, note: "daily line reached", noGrant });
    }
    await recordPulse("inventory-refresh", { attempted: 0, succeeded: 0, failed: 0, note: budgetLimitNote("refresh", null, null, "free-tier refresh grants used up for this month") });
    return Response.json({ ok: true, checked: 0, note: "refresh grants used up", noGrant });
  }
  if (spent === 0 && failed > 0) return jobFailed("inventory-refresh", `0/${rows.length} rows checked (${failed} failures)`, { attempted: rows.length });
  await recordPulse("inventory-refresh", { attempted: rows.length, succeeded: applied, failed, note });
  return Response.json({ ok: true, checked: spent, tiers: tally, applied, conflicts, failed, noGrant, notFound, scanned: rows.length });
}
