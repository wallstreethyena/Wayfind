// app/api/cron/deals-health/route.js — keeps the wf_deals coupon feed honest:
// (A) expiry sweep — flip active=false on any deal past ends_at, and
// (B) link-health — for every deal that needs checking, verify the CJ affiliate
//     link actually FORWARDS the user (not the tracking pixel) and the UT
//     destination still exists, REPAIR the dead ?url= pixel form to the working
//     raw-path form in place, and set link_ok/http_status/fail_count so the
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
import { repairAffiliateUrl, judgeLink, hasCjPid } from "../../../../lib/deals.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const PARALLEL = 4;
const FAIL_THRESHOLD = 2; // consecutive fails before we pull a deal (transient-blip tolerant)

async function probe(url, follow) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { method: "GET", redirect: follow ? "follow" : "manual", headers: { "User-Agent": UA }, signal: ctrl.signal });
    return { status: r.status, location: r.headers.get("location") || "" };
  } catch { return { status: 0, location: "" }; }
  finally { clearTimeout(t); }
}

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
  if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const job = new URL(req.url).searchParams.get("job") || "all";

  // (A) EXPIRY SWEEP — explicit active=false for anything past its window.
  let expired = 0;
  if (job === "all" || job === "expiry") {
    const { data } = await db.from("wf_deals").update({ active: false })
      .lte("ends_at", new Date().toISOString()).eq("active", true).select("id");
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
    .select("id, affiliate_url, dest_url, fail_count, link_ok, last_checked_at, ends_at")
    .eq("active", true);
  if (error) return Response.json({ ok: false, expired, error: "deals read failed" }, { status: 200 });
  const nowMs = Date.now();
  const rows = (all || []).filter((r) =>
    r.link_ok !== true ||
    !r.last_checked_at ||
    (nowMs - new Date(r.last_checked_at).getTime() > STALE_MS) ||
    (r.ends_at && new Date(r.ends_at).getTime() <= nowMs)
  );

  const stats = { checked: 0, ok: 0, repaired: 0, failed: 0, pulled: 0, untracked_skipped: 0 };
  await pool(rows || [], PARALLEL, async (row) => {
    stats.checked++;
    const { url: affUrl, repaired } = repairAffiliateUrl(row.affiliate_url, row.dest_url);
    // Never write an untracked link. If a repair somehow lost the PID, leave the
    // row quarantined and flag it — better dark than unattributed.
    if (!hasCjPid(affUrl)) { stats.untracked_skipped++; return; }
    const aff = await probe(affUrl, false);       // manual: see the redirect, not the destination
    const dest = await probe(row.dest_url, true); // follow: final status of the UT page
    const verdict = judgeLink({ affFirstHop: aff.status, affLocation: aff.location, destStatus: dest.status });

    const patch = { last_checked_at: new Date().toISOString(), http_status: verdict.http_status };
    if (repaired) patch.affiliate_url = affUrl;
    if (verdict.pass) {
      patch.link_ok = true; patch.fail_count = 0; stats.ok++; if (repaired) stats.repaired++;
    } else {
      const fc = (row.fail_count || 0) + 1;
      patch.fail_count = fc; stats.failed++;
      if (fc >= FAIL_THRESHOLD) { patch.link_ok = false; stats.pulled++; } // 2 strikes → pull
    }
    await db.from("wf_deals").update(patch).eq("id", row.id);
  });

  return Response.json({ ok: true, job, expired, ...stats }, { headers: { "Cache-Control": "no-store" } });
}
