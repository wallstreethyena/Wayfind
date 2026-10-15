// app/api/cron/seasonal-revalidate/route.js - makes a season change show up at
// midnight US Eastern instead of up to an hour later.
//
// app/page.js is ISR (revalidate = 3600). On a day a season starts or ends the
// first hour could serve yesterday's HTML (a hidden poster, the wrong card skin).
// vercel.json fires this at 04:01 and 05:01 UTC, which is 00:01 Eastern in EDT and
// in EST respectively (the other run lands at 23:01 or 01:01 and is harmless:
// off a boundary day it skips, on one it only marks the page stale again).
// It calls revalidatePath ONLY on a boundary day (lib/seasonBoundaries.js, derived
// from the season predicates themselves). No polling, no paid calls, no network.
//
// Same fail-closed contract as every cron route: CRON_SECRET bearer or 401
// (scripts/check-cron-failclosed.mjs), a pulse on every terminal path
// (scripts/check-cron-pulse-coverage.mjs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { runSeasonalRevalidate } from "../../../../lib/seasonBoundaries.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

const JOB = "seasonal-revalidate";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  let result;
  try {
    result = runSeasonalRevalidate({ revalidatePath });
  } catch (e) {
    await recordPulse(JOB, { attempted: 1, succeeded: 0, failed: 1, note: "error: " + String((e && e.message) || e).slice(0, 160) });
    return Response.json({ ok: false, error: "revalidate failed" }, { status: 500 });
  }
  await recordPulse(JOB, {
    attempted: result.skipped ? 0 : result.revalidated.length,
    succeeded: result.skipped ? 0 : result.revalidated.length,
    failed: 0,
    note: result.skipped ? "healthy idle: " + result.today + " is not a season boundary day" : "boundary day " + result.today + ": revalidated " + result.revalidated.join(", "),
  });
  return Response.json({ ok: true, ...result });
}
