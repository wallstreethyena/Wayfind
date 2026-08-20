// app/api/cron/promote-backfill/route.js — OPTIONAL drain of the cheap
// in-box enqueue. OFF BY DEFAULT.
//
// Kill-switch: WAYFIND_PROMOTE_BACKFILL must be the exact string "on", and
// WAYFIND_PROMOTE_BACKFILL_LIMIT must be a positive integer. See
// lib/promoteEnqueue.js. This route is NOT scheduled in vercel.json — an
// unset switch is a no-op even if someone hits the URL.
//
// NO Google. Enqueue only (wf_promotion_backfill). Place Details spend, if
// any, happens later on the existing /api/cron/promote-index worker.
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { planBackfillEnqueue } from "../../../../lib/promoteEnqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = planBackfillEnqueue(process.env);
  if (!plan.enabled || plan.willEnqueue <= 0) {
    await recordPulse("promote-backfill", { attempted: 0, succeeded: 0, note: plan.reason.slice(0, 200) });
    return Response.json({ ok: true, skipped: true, ...plan });
  }

  const s = sbEnv();
  if (!s) {
    await recordPulse("promote-backfill", { attempted: 0, succeeded: 0, note: "no supabase service env" });
    return Response.json({ ok: false, error: "no supabase service env", ...plan });
  }

  const r = await fetch(`${s.url}/rest/v1/rpc/${plan.rpc}`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_metro: null, p_limit: plan.willEnqueue }),
  });
  if (!r.ok) {
    const err = `rpc ${plan.rpc} → ${r.status}: ${(await r.text()).slice(0, 200)}`;
    await recordPulse("promote-backfill", { attempted: plan.willEnqueue, succeeded: 0, note: err.slice(0, 200) });
    return Response.json({ ok: false, error: err, ...plan });
  }
  const queued = await r.json();
  await recordPulse("promote-backfill", { attempted: plan.willEnqueue, succeeded: Number(queued) || 0, note: null });
  return Response.json({ ok: true, skipped: false, queued, ...plan });
}
