// app/api/cron/place-photos-openverse/route.js — hourly drain of the photo
// repair queue through the SECOND free licensed source, Openverse
// (lib/openversePhotos.js, lib/openverseBackfill.js). Thin caller, same
// fail-closed contract as app/api/cron/place-photos: CRON_SECRET bearer or
// 401, jobCannotRun() on missing Supabase env, jobFailed() when the worker
// throws, recordPulse() on every completed run.
//
// BUDGET. Openverse's anonymous tier is 20 requests/minute and 200/day per
// client. 8 places an hour = 192 a day, spaced 3.5s apart. A 429 stops the
// run without recording a verdict (lib/openverseBackfill.js).
//
// SUCCESS = a verdict per place. Finding no licensed photo for a small cafe
// is a correct answer, so `succeeded` counts every decided place (active or
// rejected); only errors and no-answer runs are failures.
//
// Keyless and Google-free by construction.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WORK_BUDGET_MS = 90_000;

import { runOpenverseBackfill, describeOpenverseRun } from "../../../../lib/openverseBackfill";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("place-photos-openverse", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(8, Number(u.searchParams.get("limit")) || 8));

  let result;
  try {
    result = await runOpenverseBackfill({
      limit,
      deadlineAt: Date.now() + WORK_BUDGET_MS,
      sbEnv: { url: /^https?:\/\//i.test(url) ? url : "https://" + url, key: svc },
    });
  } catch (e) {
    return jobFailed("place-photos-openverse", "worker threw: " + (e && e.message ? e.message : String(e)));
  }
  if (!result.ok) return jobCannotRun("place-photos-openverse", result.reason || "worker could not run");

  const note = describeOpenverseRun(result);
  await recordPulse("place-photos-openverse", {
    attempted: result.attempted,
    succeeded: result.active + result.rejected,
    note,
  });

  return Response.json({
    ok: true,
    worklist: result.worklist,
    attempted: result.attempted,
    active: result.active,
    rejected: result.rejected,
    unvaulted: result.unvaulted,
    deferred: result.deferred,
    stoppedOn: result.stoppedOn,
  });
}
