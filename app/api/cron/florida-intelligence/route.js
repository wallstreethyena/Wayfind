// app/api/cron/florida-intelligence/route.js — scheduled Gemini AI monitor
// for What is Trending in Florida and Holiday Special picks.
//
// Fail-closed CRON_SECRET Bearer auth. Never spends on visitor traffic: only
// this scheduled job invokes Gemini (via lib/paidGemini.js behind WAYFIND_GATE,
// GEMINI_MONTHLY_REQUEST_CAP, atomic wf_spend_take, and the gemini breaker).
// Every terminal path reports a wf_job_pulse row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { recordPulse } from "../../../../lib/jobPulse.js";
import { runFloridaIntelligenceMonitor } from "../../../../lib/floridaIntelligenceServer.js";
import { createAiBulletinBoard } from "../../../../lib/aiBulletinBoard.server.js";
import { createFloridaPosterBulletin } from "../../../../lib/floridaPosterBulletin.js";

const JOB = "florida-intelligence";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const now = new Date();
    const bulletinEnabled = process.env.WF_AI_BULLETIN_BOARD_ENABLED === "1";
    const bulletin = bulletinEnabled
      ? createFloridaPosterBulletin({ createBoard: () => createAiBulletinBoard({ req }), now })
      : null;
    const boardContext = bulletin ? await bulletin.readContext() : null;
    const result = await runFloridaIntelligenceMonitor({ now, boardContext });
    const boardStatus = bulletin ? await bulletin.report(result.boardOutcomes) : null;
    const posterBands = Object.keys(result.snapshot.posterPlan?.bands || {}).length;
    const prefix = result.breakerKind === "billing" ? "billing: "
      : result.breakerKind === "quota" ? "quota: "
      : "";
    const succeeded = result.breakerKind ? 0 : 1;
    const note = (
      prefix +
      `ai=${result.aiStatus}(${result.model}); health=${result.healthScore}/100(${result.auditStatus}); ` +
      `trending=${result.trendingCount}; poster_bands=${posterBands}; holiday=${result.holidayKey || "none"}; issues=${result.issuesCount}` +
      (boardStatus ? (boardStatus.notAvailable ? "; bulletin=unavailable" : "; bulletin=reported") : "") +
      (result.aiReason ? `; ${result.aiReason}` : "")
    ).slice(0, 200);

    await recordPulse(JOB, { attempted: 1, succeeded, failed: succeeded ? 0 : 1, note });

    return Response.json(
      {
        ok: succeeded === 1,
        job: JOB,
        today: result.today,
        model: result.model,
        aiStatus: result.aiStatus,
        aiReason: result.aiReason,
        healthScore: result.healthScore,
        auditStatus: result.auditStatus,
        issuesCount: result.issuesCount,
        trendingCount: result.trendingCount,
        holidayKey: result.holidayKey,
        floridaBrief: result.snapshot.floridaBrief,
        holidayBrief: result.snapshot.holiday ? result.snapshot.holiday.brief : null,
      },
      { status: succeeded === 1 ? 200 : 503, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    const msg = String((err && err.message) || err || "monitor-failed").slice(0, 140);
    await recordPulse(JOB, { attempted: 1, succeeded: 0, failed: 1, note: "FAILED: " + msg });
    return Response.json({ ok: false, job: JOB, error: "monitor_failed" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
