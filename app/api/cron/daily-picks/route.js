// app/api/cron/daily-picks/route.js — one personalized pick a day for members
// who turned on browser notifications (owner order 2026-11-27).
// All limits (opt in only, one a day, quiet hours 8 PM to 9 AM local, no pick
// no push, real places only) live in lib/dailyPicks.js. Kill switch:
// WEB_PUSH_DAILY_PICKS=off stops every send without a deploy.
// Fail closed: no CRON_SECRET -> 401; no Supabase env -> 503. Every terminal
// path records a wf_job_pulse row for job-watch. No push to Gabe from here: a
// run with nobody subscribed yet is an EXPECTED state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { sbEnv } from "../../../../lib/serverCache.js";
import { runDailyPicks } from "../../../../lib/dailyPicks.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { siteTodayStr } from "../../../../lib/siteTime";

const JOB = "daily-picks";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const s = sbEnv();
  if (!s) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  if (String(process.env.WEB_PUSH_DAILY_PICKS || "").trim().toLowerCase() === "off") {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "skipped: WEB_PUSH_DAILY_PICKS=off" });
    return Response.json({ ok: true, skipped: "off" }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const r = await runDailyPicks({ cfg: s, todayStr: siteTodayStr() });
    if (!r.ok) {
      await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "skipped: " + r.reason });
      return Response.json(r, { headers: { "cache-control": "no-store" } });
    }
    await recordPulse(JOB, { attempted: r.attempted, succeeded: r.sent, failed: r.failed, note: `quiet=${r.skippedQuiet} nopick=${r.skippedNoPick} gone=${r.gone}` });
    try { console.log(JSON.stringify({ tag: "daily_picks", ...r })); } catch {}
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jobFailed(JOB, String((e && e.message) || e));
  }
}
