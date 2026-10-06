import { timingSafeEqual } from "node:crypto";
import { groupRuntime, groupReply, groupFailure } from "../../../../lib/groupPlanApi.js";
import { runGroupPlanWorker } from "../../../../lib/groupPlanWorker.js";

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
    return groupReply(result, result.ok ? 200 : 503);
  } catch (error) {
    return groupFailure(error);
  }
}
