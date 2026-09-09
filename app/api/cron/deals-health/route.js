// app/api/cron/deals-health/route.js — keeps the wf_deals coupon feed honest:
// (A) expiry sweep — flip active=false on any deal past ends_at, and
// (B) link-health — validate CJ link structure offline and request only the UT
//     merchant destination. Blocked responses stay unknown. REPAIR the dead
//     ?url= pixel form to the known raw-path form without clicking it;
//     set link_ok/http_status/fail_count so the
//     wf_deals_live view drops anything broken within one cycle.
//
// CRON_SECRET-gated like the other crons. Writes with the service role at
// runtime (this is the sanctioned path for wf_deals writes — the app owns them,
// not a hand-run SQL). All link decisions come from lib/deals.js (unit-tested).
//
// NOTE ON SCHEDULING: Vercel's scheduler invokes the *.vercel.app deployment URL,
// which is behind Deployment Protection (SSO) on this project, so scheduled runs
// are blocked until "Protection Bypass for Automation" is enabled. This route is
// always reachable+triggerable on the PUBLIC custom domain with the Bearer
// secret (curl https://www.gowayfind.com/api/cron/deals-health -H "Authorization:
// Bearer $CRON_SECRET"), which is how it can run today and lift the quarantine.
import { createClient } from "@supabase/supabase-js";
import { repairAffiliateUrl, hasCjPid } from "../../../../lib/deals.js";
import { probeMerchant, trackedDeal, healthPatch, destinationHealth } from "../../../../lib/dealHealth.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PARALLEL = 4;
const FAIL_THRESHOLD = 2; // consecutive fails before we pull a deal (transient-blip tolerant)

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) { const j = i++; await fn(items[j]); }
  }));
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const manual = new URL(req.url).searchParams.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("deals-health", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const job = new URL(req.url).searchParams.get("job") || "all";

  // (A) EXPIRY SWEEP — explicit active=false for anything past its window.
  let expired = 0;
  if (job === "all" || job === "expiry") {
    const { data, error: expiryError } = await db.from("wf_deals").update({ active: false })
      .lte("ends_at", new Date().toISOString()).eq("active", true).select("id");
    if (expiryError) return jobFailed("deals-health", "expiry update failed");
    expired = Array.isArray(data) ? data.length : 0;
    if (job === "expiry") return Response.json({ ok: true, job, expired }, { headers: { "Cache-Control": "no-store" } });
  }

  // (B) LINK-HEALTH — read the BASE table, not wf_deals_needs_check: that view
  // omits fail_count AND excludes quarantined rows (its filter is stale/expired
  // only, no link_ok=false clause), so it could never surface a freshly-
  // quarantined deal to repair. We select every active deal and pick the work
  // set in JS: anything not currently healthy (link_ok != true), never checked,
  // stale (>12h), or expired. Table is tiny; this is the correct repair target.
  const STALE_MS = 12 * 3600 * 1000;
  const { data: all, error } = await db.from("wf_deals")
    .select("id, affiliate_url, dest_url, fail_count, link_ok, http_status, last_checked_at, ends_at")
    .eq("active", true);
  if (error) return jobFailed("deals-health", "deals read failed", { expired });
  const nowMs = Date.now();
  const rows = (all || []).filter((r) =>
    (r.link_ok === true && [403, 429].includes(r.http_status)) ||
    !r.last_checked_at ||
    (nowMs - new Date(r.last_checked_at).getTime() > STALE_MS) ||
    (r.ends_at && new Date(r.ends_at).getTime() <= nowMs)
  );

  const stats = { checked: 0, ok: 0, unknown: 0, repaired: 0, failed: 0, pulled: 0, untracked_skipped: 0, write_errors: 0 };
  const cache = new Map();
  await pool(rows || [], PARALLEL, async (row) => {
    stats.checked++;
    const { url: affUrl, repaired } = repairAffiliateUrl(row.affiliate_url, row.dest_url);
    // Never write an untracked link. If a repair somehow lost the PID, leave the
    // row quarantined and flag it — better dark than unattributed.
    if (!hasCjPid(affUrl) || !trackedDeal(affUrl, row.dest_url)) {
      stats.untracked_skipped++;
      const { data: held, error: holdError } = await db.from("wf_deals").update({ link_ok: false }).eq("id", row.id).select("id");
      if (holdError || held?.length !== 1) stats.write_errors++;
      return;
    }
    if (!cache.has(row.dest_url)) cache.set(row.dest_url, probeMerchant(row.dest_url));
    const dest = await cache.get(row.dest_url);
    const patch = { ...healthPatch(row, dest.status), last_checked_at: new Date().toISOString(), http_status: dest.status };
    if (repaired) patch.affiliate_url = affUrl;
    const { data: saved, error: writeError } = await db.from("wf_deals").update(patch).eq("id", row.id).select("id");
    if (writeError || saved?.length !== 1) { stats.write_errors++; return; }
    if (repaired) stats.repaired++;
    if (destinationHealth(dest.status) === null) stats.unknown++;
    else if (patch.link_ok === true) stats.ok++;
    else { stats.failed++; if (patch.fail_count >= FAIL_THRESHOLD) stats.pulled++; }
  });

  if (stats.write_errors || stats.untracked_skipped) return jobFailed("deals-health", "link validation or persistence failed", { expired, ...stats });
  return Response.json({ ok: true, job, expired, ...stats, commission: "unknown" }, { headers: { "Cache-Control": "no-store" } });
}
