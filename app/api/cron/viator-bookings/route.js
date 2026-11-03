// app/api/cron/viator-bookings/route.js — Scheduled Viator booking ingestion,
// attribution reconciliation, and Google Ads offline conversion queue sync.
//
// FAIL-CLOSED & HONESTY INVARIANTS
// --------------------------------
// 1. Requires `Authorization: Bearer <CRON_SECRET>`; fails closed with 401 if
//    `CRON_SECRET` is unset or the header does not match.
// 2. If `VIATOR_API_KEY` or Supabase admin credentials are absent, returns
//    503 via `jobCannotRun` and records a `cannot-run` pulse in `wf_job_pulse`
//    so a missing credential never looks like "0 bookings".
// 3. Advances the `/partner/bookings/modified-since` cursor only after each
//    batch is durably reconciled into `wf_viator_booking_events` and
//    `wf_viator_bookings`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sbAdmin } from "../../../../lib/commandCenter/supabaseAdmin.js";
import { credential } from "../../../../lib/envPlaceholder.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { recordPulseDetailed as recordPulse } from "../../../../lib/jobPulse.js";
import { syncViatorBookings } from "../../../../lib/viatorBookings.js";

const JOB = "viator-bookings";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== "Bearer " + secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const apiKey = credential(process.env["VIATOR_API_KEY"]);
  if (!apiKey) {
    return jobCannotRun(JOB, "VIATOR_API_KEY not set or placeholder", { startedAt });
  }

  const sb = sbAdmin();
  if (!sb) {
    return jobCannotRun(
      JOB,
      "Supabase service role not set (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
      { startedAt },
    );
  }

  try {
    const result = await syncViatorBookings({
      apiKey,
      sb,
      maxPages: 5,
    });

    if (!result.ok) {
      return jobFailed(JOB, result.reason || "viator_sync_failed", {
        startedAt,
        extra: {
          upstream_status: result.status ?? null,
          pages_processed: result.pagesProcessed ?? 0,
        },
      });
    }

    const summary = {
      status: "ok",
      job: JOB,
      pages_processed: result.pages_processed,
      events_normalized: result.events_normalized,
      events_inserted: result.events_inserted,
      matched: result.matched,
      unmatched_no_token: result.unmatched_no_token,
      unmatched_unknown_token: result.unmatched_unknown_token,
      unmatched_expired: result.unmatched_expired,
      next_cursor: result.next_cursor,
      watermark: result.watermark,
    };

    await recordPulse(JOB, summary, { startedAt });
    return Response.json(summary, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return jobFailed(JOB, e?.message || "unhandled_exception", { startedAt });
  }
}
