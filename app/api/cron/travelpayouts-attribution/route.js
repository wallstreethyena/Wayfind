// Reconcile provider bookings only after durable Wayfind clicks exist. Link
// provisioning creates a single bounded batch and never opens partner URLs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { createClient } from "@supabase/supabase-js";
import { sbAdmin } from "../../../../lib/commandCenter/supabaseAdmin.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { recordPulseDetailed as recordPulse } from "../../../../lib/jobPulse.js";
import { provisionTpLinks } from "../../../../lib/travelpayoutsProvisioning.js";
import { earliestTravelpayoutsClick, fetchTravelpayoutsBookings, reconcileTravelpayouts } from "../../../../lib/travelpayoutsStats.js";

const JOB = "travelpayouts-attribution";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== "Bearer " + secret) {
    return new Response("unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  }
  const token = String(process.env.TRAVELPAYOUTS_TOKEN || "").trim();
  if (!token) return jobCannotRun(JOB, "TRAVELPAYOUTS_TOKEN is missing");
  const sb = sbAdmin();
  if (!sb) return jobCannotRun(JOB, "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");

  let provisioning = null;
  let provisioningError = null;
  let counts = null;
  let received = 0;
  try {
    // One deadline covers every statistics page, body and reconciliation batch.
    // Provisioning has three separate 8s requests; pulse has its own 15s bound.
    const signal = AbortSignal.timeout(240000);
    const db = createClient(sb.url, sb.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) },
    });
    // New mappings and existing bookings are independent: a provider link
    // failure must not stop pending bookings from receiving status updates.
    try {
      provisioning = await provisionTpLinks({ sb });
      if (provisioning.failed) provisioningError = "Travelpayouts link provisioning failed; pending mappings remain";
    } catch (error) {
      provisioningError = String(error?.message || error).slice(0, 180);
    }
    const from = await earliestTravelpayoutsClick(db, { signal });
    const idle = from === null;
    if (!idle) {
      const rows = await fetchTravelpayoutsBookings({ from, token, signal });
      received = rows.length;
      counts = await reconcileTravelpayouts(db, rows, { signal });
    }
    if (provisioningError) throw new Error(provisioningError);
    const pulse = await recordPulse(JOB, {
      attempted: received + provisioning.attempted,
      succeeded: (counts ? counts.inserted + counts.updated + counts.stale : 0) + provisioning.succeeded,
      failed: 0,
      note: idle ? "idle: no durable Travelpayouts clicks; statistics not requested" : "Travelpayouts bookings reconciled",
    });
    return Response.json({ ok: true, job: JOB, idle, provisioning, counts, pulse }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const rejectedCounts = error?.counts || counts;
    return jobFailed(JOB, String(error?.message || error).slice(0, 180), {
      attempted: received + (provisioning?.attempted || 0),
      succeeded: (provisioning?.succeeded || 0) + (rejectedCounts ? rejectedCounts.inserted + rejectedCounts.updated + rejectedCounts.stale : 0),
      provisioning,
      provisioningError,
      counts: rejectedCounts,
    });
  }
}
