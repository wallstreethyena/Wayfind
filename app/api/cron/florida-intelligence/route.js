// app/api/cron/florida-intelligence/route.js — scheduled AI monitor
// for What is Trending in Florida and Holiday Special picks.
//
// The cron refreshes deterministic picks even during an AI outage. Its pulse
// tracks AI output so the fallback refresh cannot hide a provider failure.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { BUDGET_LIMIT_PREFIX, recordPulse } from "../../../../lib/jobPulse.js";
import { floridaIntelligenceAiSkipped, runFloridaIntelligenceMonitor } from "../../../../lib/floridaIntelligenceServer.js";

const JOB = "florida-intelligence";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const result = await runFloridaIntelligenceMonitor();
    const active = result.aiStatus === "active";
    const skipped = floridaIntelligenceAiSkipped(result.aiStatus);
    const failed = !active && !skipped;
    const prefix = result.breakerKind === "billing" ? "billing: "
      : result.breakerKind === "quota" ? "quota: "
      : skipped ? BUDGET_LIMIT_PREFIX + " "
      : "";
    const refresh = active ? "ai" : "fallback";
    const note = (
      prefix +
      `ai=${result.aiStatus}(${result.model}); refresh=${refresh}` +
      (result.aiReason ? `; ${result.aiReason}` : "") +
      `; health=${result.healthScore}/100(${result.auditStatus}); ` +
      `trending=${result.trendingCount}; holiday=${result.holidayKey || "none"}; issues=${result.issuesCount}`
    ).slice(0, 200);

    await recordPulse(JOB, { attempted: Number(!skipped), succeeded: Number(active), failed: Number(failed), note });

    return Response.json(
      {
        ok: !failed,
        job: JOB,
        today: result.today,
        model: result.model,
        aiStatus: result.aiStatus,
        aiReason: result.aiReason,
        refresh,
        healthScore: result.healthScore,
        auditStatus: result.auditStatus,
        issuesCount: result.issuesCount,
        trendingCount: result.trendingCount,
        holidayKey: result.holidayKey,
        floridaBrief: result.snapshot.floridaBrief,
        holidayBrief: result.snapshot.holiday ? result.snapshot.holiday.brief : null,
      },
      { status: failed ? 503 : 200, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    const msg = String((err && err.message) || err || "monitor-failed").slice(0, 140);
    await recordPulse(JOB, { attempted: 1, succeeded: 0, failed: 1, note: "FAILED: " + msg });
    return Response.json({ ok: false, job: JOB, error: "monitor_failed" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
