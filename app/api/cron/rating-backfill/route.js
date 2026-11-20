// app/api/cron/rating-backfill/route.js - the owner-approved, ONE-OFF paid rating buy.
//
// Owner decision 2026-11-20 ("I approve the pay run ... I don't want to wait till
// December 1st"): buy Google's rating + review count for the places in the five held
// Florida towns that have none (lib/ratingBackfill.js picks them). OFF BY DEFAULT and
// NOT scheduled in vercel.json: it runs only when an operator calls it with CRON_SECRET
// AND both switches are valid:
//   RATING_BACKFILL_PAID=1
//   RATING_BACKFILL_MONTH_CAP=<positive integer>   paid lookups allowed this month
// Every lookup takes one grant from its OWN ledger row (details_enterprise_backfill,
// lib/spendGate.js), so the cap is enforced atomically and the site, promoter and free
// refresh lines are untouched. WAYFIND_GATE=shut still means zero calls.
//
// The write is the inventory refresh's own enterprise plan (lib/inventoryGoogleCheck
// planEnterprise): real Google values only, compare-and-swap on the signals it read,
// nothing deleted or blanked. The served Wayfind Score is computed from rating/reviews
// at read time, so this route stores inputs, never a score.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { createClient } from "@supabase/supabase-js";
import { gateShut, spendAllowCapped, refundToLedger, ratingBackfillCap, RATING_BACKFILL_SKU, runWithTraffic, TRAFFIC } from "../../../../lib/spendGate";
import { normalizeDetails, PLACE_DETAILS_FIELDS, PLACE_DETAILS_CACHE_MS } from "../../../../lib/placeDetails";
import { cset } from "../../../../lib/serverCache.js";
import { inventoryRefreshPatch } from "../../../../lib/inventoryRefreshPatch.js";
import { planEnterprise, fetchGoogleCheck } from "../../../../lib/inventoryGoogleCheck.js";
import { HELD_TOWNS, townBox, selectBackfillTargets } from "../../../../lib/ratingBackfill.js";
import { classifyProviderFailure, breakerOpen, tripBreaker, breakerCooldownMs, GOOGLE_DETAILS_DAILY_BREAKER } from "../../../../lib/providerHealth.js";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

const BREAKER = "google_places_refresh";
const PARALLEL = 5;
const RUN_LIMIT_DEFAULT = 40;
const SELECT = "place_id, category, refreshed_at, locked, status, excluded, lat, lng, signals, independent_coords";

export async function GET(req) {
  // BACKGROUND: an operator-run cron job, never a person waiting. Its SKU is not visitor-shared,
  // so the human reserve does not apply; the cap is its own ledger row.
  return runWithTraffic(TRAFFIC.BACKGROUND, () => runRatingBackfill(req));
}

async function runRatingBackfill(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (gateShut()) return Response.json({ skipped: "gate shut", gate: "shut" });
  const cap = ratingBackfillCap();
  if (cap == null) return Response.json({ ok: true, skipped: "off (RATING_BACKFILL_PAID=1 and RATING_BACKFILL_MONTH_CAP are both required)" });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const gkey = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("rating-backfill", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!gkey) return jobCannotRun("rating-backfill", "GOOGLE_MAPS_SERVER_KEY is missing");
  const open = (await breakerOpen(BREAKER)) || (await breakerOpen(GOOGLE_DETAILS_DAILY_BREAKER));
  if (open) return Response.json({ skipped: "breaker open", kind: open.kind });
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(60, Number(u.searchParams.get("limit")) || RUN_LIMIT_DEFAULT));
  const dryRun = u.searchParams.get("dry") === "1";

  const candidates = [];
  for (const town of HELD_TOWNS) {
    const b = townBox(town);
    const { data, error } = await db.from("wf_inventory").select(SELECT)
      .gte("lat", b.minLat).lte("lat", b.maxLat).gte("lng", b.minLng).lte("lng", b.maxLng)
      .is("signals->>rating", null)
      .limit(2000);
    if (error) return jobFailed("rating-backfill", "target select failed: " + error.message);
    candidates.push(...(data || []));
  }
  const targets = selectBackfillTargets(candidates);
  if (dryRun) return Response.json({ ok: true, dryRun: true, remaining: targets.length, cap });
  if (!targets.length) {
    await recordPulse("rating-backfill", { attempted: 0, succeeded: 0, failed: 0, note: "no held-town place is missing a rating" });
    return Response.json({ ok: true, bought: 0, remaining: 0 });
  }

  const queue = targets.slice(0, limit);
  let bought = 0, rated = 0, applied = 0, conflicts = 0, failed = 0, notFound = 0, capped = false, denied = null;

  async function writePlan(row, plan) {
    let q = db.from("wf_inventory").update(plan.update).eq("place_id", row.place_id);
    q = plan.expect.signals == null ? q.is("signals", null) : q.eq("signals", JSON.stringify(plan.expect.signals));
    if (plan.expect.independent_coords !== undefined && plan.update.independent_coords !== undefined) {
      q = plan.expect.independent_coords == null ? q.is("independent_coords", null) : q.eq("independent_coords", JSON.stringify(plan.expect.independent_coords));
    }
    const { data, error } = await q.select("place_id");
    if (error) return "error";
    return data && data.length ? "applied" : "conflict";
  }

  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row || denied || capped) return;
      try {
        if (!(await spendAllowCapped(RATING_BACKFILL_SKU, cap))) { capped = true; return; }
        const res = await fetchGoogleCheck(row.place_id, PLACE_DETAILS_FIELDS, { key: gkey, signal: AbortSignal.timeout(8000) });
        if (!res.billed) await refundToLedger(RATING_BACKFILL_SKU, 1);
        if (res.kind === "denied") {
          const kind = classifyProviderFailure(res.status, res.body);
          denied = { status: res.status, kind };
          if (kind) await tripBreaker(BREAKER, kind, "google " + res.status, breakerCooldownMs(kind, res.status, res.body));
          return;
        }
        if (res.kind === "error") { failed++; continue; }
        bought++;
        if (res.kind === "not_found") notFound++;
        const norm = res.kind === "ok" ? normalizeDetails(res.place) : null;
        if (norm) { try { await cset("pd1|" + row.place_id, norm, PLACE_DETAILS_CACHE_MS); } catch {} }
        if (res.kind === "ok" && typeof res.place?.rating === "number") rated++;
        const now = Date.now();
        const patch = norm ? inventoryRefreshPatch(row.place_id, { details: norm, live: true, fetchedAt: new Date(now).toISOString() }, now, row.refreshed_at) : null;
        const plan = planEnterprise(row, res, patch, now);
        if (!plan) continue;
        const w = await writePlan(row, plan);
        if (w === "applied") applied++; else if (w === "conflict") conflicts++; else failed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const remaining = Math.max(0, targets.length - applied);
  const note = `bought ${bought} (Google returned a rating for ${rated}); written ${applied}; conflicts ${conflicts}; not found ${notFound}; failed ${failed}; ${capped ? "monthly cap reached; " : ""}~${remaining} left; nothing deleted or blanked`;
  if (denied) return jobFailed("rating-backfill", `${denied.kind ? denied.kind + ": " : ""}google ${denied.status} on place details, run stopped`, { attempted: queue.length, succeeded: applied });
  if (bought >= 5 && applied === 0 && conflicts > 0) return jobFailed("rating-backfill", `0/${bought} writes applied, ${conflicts} compare-and-swap conflicts`, { attempted: bought });
  await recordPulse("rating-backfill", { attempted: bought, succeeded: applied, failed, note: note.slice(0, 200) });
  return Response.json({ ok: true, bought, rated, applied, conflicts, notFound, failed, capped, remaining, cap });
}
