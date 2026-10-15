import { timingSafeEqual } from "node:crypto";
import { groupRuntime, groupReply, groupFailure } from "../../../../lib/groupPlanApi.js";
import { runGroupPlanWorker } from "../../../../lib/groupPlanWorker.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const secret = String(process.env.CRON_SECRET || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return groupReply({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const result = await runGroupPlanWorker({createRuntime:groupRuntime});
    // Fail-soft: a pulse write never changes the response. attempted = plans
    // examined this run, succeeded = plans closed, failed = settle errors.
    try {
      await recordPulse("group-plans", {
        attempted: result.checked | 0, succeeded: result.closed | 0, failed: result.failed | 0,
        note: result.ok ? null : `incomplete: failed=${result.failed | 0} deferred=${result.deferred | 0}`,
      });
    } catch { /* pulse is observability only */ }
    return groupReply(result, result.ok ? 200 : 503);
  } catch (error) {
    // Disabled rollout (GROUP_WORKER_DISABLED) is an expected idle state, not a failure.
    const disabled = error?.code === "GROUP_WORKER_DISABLED";
    try {
      await recordPulse("group-plans", {
        attempted: 0, succeeded: 0, failed: disabled ? 0 : 1,
        note: disabled ? "disabled" : `error: ${String(error?.code || "GROUP_UNAVAILABLE")}`,
      });
    } catch { /* pulse is observability only */ }
    return groupFailure(error);
  }
}
