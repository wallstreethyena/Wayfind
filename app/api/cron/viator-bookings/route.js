// app/api/cron/viator-bookings/route.js — Scheduled Viator booking ingestion,
// attribution reconciliation, 90-day identifier redaction, and staged Google
// Ads offline conversion & adjustment queue processor.
//
// FAIL-CLOSED & HONESTY INVARIANTS
// --------------------------------
// 1. Requires `Authorization: Bearer <CRON_SECRET>`; fails closed with 401 if
//    `CRON_SECRET` is unset or the header does not match.
// 2. If `VIATOR_API_KEY` or Supabase admin credentials are absent, returns
//    503 via `jobCannotRun` and records a `cannot-run` pulse in `wf_job_pulse`
//    so a missing credential never looks like "0 bookings".
// 3. Supports `?dry_run=1` for a secret-safe read-only contract probe against
//    Viator `/partner/bookings/modified-since`.
// 4. Executes all 4 operational phases on each scheduled run:
//    - Phase 1: Lease-protected Viator `/partner/bookings/modified-since` sync
//      & reconciliation (`syncViatorBookings`).
//    - Phase 2: 90-day click identifier & JSONB snapshot redaction
//      (`wf_viator_redact_expired_clicks`).
//    - Phase 3: Staged Google Ads offline conversion & cancellation/amendment
//      adjustment queue (`processGoogleConversionUploadQueue`, gated by
//      `WF_VIATOR_GOOGLE_UPLOAD_MODE`, default `"off"`).
//    - Phase 4: Job pulse telemetry (`recordPulse`) surfacing stalled polling,
//      unrecognized provider events, or rejected uploads to `job-watch`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sbAdmin } from "../../../../lib/commandCenter/supabaseAdmin.js";
import { credential } from "../../../../lib/envPlaceholder.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { syncViatorBookings } from "../../../../lib/viatorBookings.js";
import {
  processGoogleConversionUploadQueue,
  WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
} from "../../../../lib/googleOfflineConversions.js";

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

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  try {
    if (dryRun) {
      const probe = await syncViatorBookings({
        apiKey,
        sb,
        dryRun: true,
      });
      if (!probe.ok) {
        return jobFailed(JOB, probe.reason || "viator_dry_run_probe_failed", {
          startedAt,
          extra: {
            dry_run: true,
            upstream_status: probe.http_status ?? null,
            provider_error_code: probe.provider_error_code ?? null,
          },
        });
      }
      await recordPulse(JOB, {
        attempted: 1,
        succeeded: 1,
        failed: 0,
        note: `dry_run ok status=${probe.http_status} bookings=${probe.raw_booking_count}`,
      });
      return Response.json(
        { status: "ok", job: JOB, ...probe },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Phase 1: Lease-protected Viator booking sync and reconciliation.
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
          provider_error_code: result.provider_error_code ?? null,
          pages_processed: result.pagesProcessed ?? 0,
        },
      });
    }

    // Phase 2: 90-day identifier & JSONB snapshot redaction across all 3 tables.
    let redactedClicks = 0;
    let redactionError = null;
    if (!result.skipped_locked) {
      try {
        const redactRes = await fetch(
          `${sb.url}/rest/v1/rpc/wf_viator_redact_expired_clicks`,
          {
            method: "POST",
            cache: "no-store",
            headers: {
              apikey: sb.key,
              Authorization: `Bearer ${sb.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ p_now: new Date().toISOString() }),
          },
        );
        if (redactRes.ok) {
          const n = await redactRes.json();
          if (Number.isFinite(Number(n))) redactedClicks = Number(n);
        } else {
          redactionError = `redact_rpc_http_${redactRes.status}`;
        }
      } catch (e) {
        redactionError = `redact_rpc_error:${e?.message || "err"}`;
      }
    }

    // Phase 3: Staged Google Ads offline conversion & cancellation/amendment queue.
    const uploadMode = String(
      process.env["WF_VIATOR_GOOGLE_UPLOAD_MODE"] || "off",
    )
      .trim()
      .toLowerCase();
    const uploadQueueResult = result.skipped_locked
      ? { ok: true, mode: uploadMode, attempted: 0, succeeded: 0, failed: 0, skipped_before_upload: 0 }
      : await processGoogleConversionUploadQueue({
          sb,
          uploadMode,
          accessToken: credential(process.env["GOOGLE_ADS_OAUTH_ACCESS_TOKEN"]),
          clientId: credential(process.env["GOOGLE_ADS_OAUTH_CLIENT_ID"]),
          clientSecret: credential(process.env["GOOGLE_ADS_OAUTH_CLIENT_SECRET"]),
          refreshToken: credential(process.env["GOOGLE_ADS_OAUTH_REFRESH_TOKEN"]),
          developerToken: credential(process.env["GOOGLE_ADS_DEVELOPER_TOKEN"]),
          loginCustomerId: credential(process.env["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]),
          operatingAccountId:
            credential(process.env["GOOGLE_ADS_OPERATING_ACCOUNT_ID"]) ||
            WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
          conversionActionId: credential(
            process.env["GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID"],
          ),
        });

    const unrecognizedCount = Number(result.unrecognized_events || 0);
    const uploadFailures = Number(uploadQueueResult.failed || 0);
    const totalFailures =
      unrecognizedCount + uploadFailures + (redactionError ? 1 : 0);

    if (totalFailures > 0) {
      return jobFailed(
        JOB,
        unrecognizedCount > 0
          ? `unrecognized_viator_events:${unrecognizedCount}`
          : redactionError || uploadQueueResult.reason || `google_upload_failures:${uploadFailures}`,
        {
          startedAt,
          extra: {
            pages_processed: result.pages_processed,
            events_inserted: result.events_inserted,
            unrecognized_events: unrecognizedCount,
            unmatched_missing_booking_timestamp:
              result.unmatched_missing_booking_timestamp || 0,
            redacted_clicks: redactedClicks,
            redaction_error: redactionError,
            upload_queue: uploadQueueResult,
          },
        },
      );
    }

    const attemptedCount =
      Math.max(1, Number(result.pages_processed || 0)) +
      Number(uploadQueueResult.attempted || 0);
    const succeededCount = attemptedCount;
    const pulseNote = result.skipped_locked
      ? `skipped_locked owner=${result.active_lease_owner || "other"}`
      : `pages=${result.pages_processed} raw=${result.raw_events_received ?? 0} events=${result.events_inserted} matched=${result.matched} redacted=${redactedClicks} uploads=${uploadQueueResult.succeeded}/${uploadQueueResult.attempted} (${uploadQueueResult.mode})`;

    const summary = {
      status: "ok",
      job: JOB,
      skipped_locked: Boolean(result.skipped_locked),
      sync_epoch: result.sync_epoch ?? null,
      query_mode: result.query_mode ?? null,
      queried_modified_since: result.queried_modified_since ?? null,
      pages_processed: result.pages_processed,
      raw_events_received: result.raw_events_received ?? 0,
      unparseable_events: result.unparseable_events ?? 0,
      events_normalized: result.events_normalized,
      events_inserted: result.events_inserted,
      matched: result.matched,
      unmatched_no_token: result.unmatched_no_token,
      unmatched_unknown_token: result.unmatched_unknown_token,
      unmatched_expired: result.unmatched_expired,
      unmatched_missing_booking_timestamp:
        result.unmatched_missing_booking_timestamp || 0,
      unrecognized_events: unrecognizedCount,
      redacted_clicks: redactedClicks,
      upload_queue: uploadQueueResult,
      next_cursor: result.next_cursor ?? null,
      watermark: result.watermark ?? null,
    };

    try {
      console.log(
        JSON.stringify({
          tag: "viator_bookings_sync",
          sync_epoch: summary.sync_epoch,
          query_mode: summary.query_mode,
          pages_processed: summary.pages_processed,
          raw_events_received: summary.raw_events_received,
          events_inserted: summary.events_inserted,
          matched: summary.matched,
          unrecognized_events: summary.unrecognized_events,
          upload_mode: uploadQueueResult.mode,
          watermark: summary.watermark,
        }),
      );
    } catch {}

    await recordPulse(JOB, {
      attempted: attemptedCount,
      succeeded: succeededCount,
      failed: 0,
      note: pulseNote.slice(0, 240),
    });
    return Response.json(summary, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return jobFailed(JOB, e?.message || "unhandled_exception", { startedAt });
  }
}
