// app/api/cron/ai-board/route.js — the AI team board's daily check-in.
//
// Once a day every ONLINE AI (key + monthly cap + gate open + no billing
// breaker) reads the private board and posts its update, any new claim, help
// request, replies and at most one proposal for Gabe. Offline AIs are skipped
// with a plain reason, never an error. AIs only post to the board: nothing here
// changes the site, data, flags or spend beyond the one request per AI that
// goes through its existing capped gate.
//
// Fail closed: no CRON_SECRET -> 401; no Supabase env -> 503. No push, email or
// alert is sent from here (an offline AI is an EXPECTED state, CLAUDE.md
// Expected-State Rule); the result is on the board's "last check-in" line.
// Every terminal path records a wf_job_pulse row for job-watch:
//   attempted = AIs that were online and asked, succeeded = AIs that posted.
// All AIs offline is attempted 0 (idle, not a failure); only "every online AI
// failed" reads as a dead run.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { sbEnv } from "../../../../lib/serverCache.js";
import { runBoardRound } from "../../../../lib/aiBoard/server.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";

const JOB = "ai-board";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!sbEnv()) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; cannot read or write the board");
  try {
    const out = await runBoardRound("cron");
    // Counts only: board text never goes to logs.
    try { console.log(JSON.stringify({ tag: "ai_board_round", ok: out.ok, online: out.online, posted: out.posted, reason: out.reason || null })); } catch {}
    const turns = Array.isArray(out.turns) ? out.turns : [];
    const attempted = turns.filter((t) => !t.offline).length;
    const succeeded = turns.filter((t) => t.posted > 0).length;
    const failedNames = turns.filter((t) => !t.offline && !(t.posted > 0)).map((t) => `${t.provider}=${t.reason || "no_posts"}`);
    await recordPulse(JOB, { attempted, succeeded, failed: failedNames.length, note: out.ok ? (failedNames.length ? "partial: " + failedNames.join(",").slice(0, 160) : null) : "skipped: " + String(out.reason || "unknown") });
    return Response.json({ ok: out.ok, reason: out.reason || null, online: out.online || [], posted: out.posted || 0 }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jobFailed(JOB, "round failed: " + String((e && e.message) || "error").slice(0, 120));
  }
}
