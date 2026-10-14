// app/api/cron/partner-path/route.js — PARTNER PATH WATCH.
//
// Revenue-guard layer added after the 2026-10-13 partner drop (see
// lib/partnerPathHealth.js). Revenue-heartbeat watches one site-wide ratio that
// Viator keeps healthy; this watches each non-Viator earning path on its own:
//   1. deterministic validity — live, eligible offers per provider (and Clipp city),
//      from code registries + wf_deals, as of the venue-local date;
//   2. exposure — commerce_impression per provider over the last 7 days;
//   3. traffic — pageviews, so a quiet week cannot page.
// It pages ONLY when the path is invalid (or its renewal deadline has passed) while
// traffic is healthy. Zero clicks alone never pages. It never renews anything.
//
// NOT A NEW ALERT PATH. Same pattern as revenue-heartbeat / affiliate-coverage: the
// pulse goes through recordPulse (lib/jobPulse.js) and app/api/cron/job-watch
// delivers. The renewal queue (provider, offer, expires, owner, deadline) is in the
// response body.
//
// CRON_SECRET-gated. Read-only against wf_deals and PostHog; the only write is the pulse.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import * as ph from "../../../../lib/commandCenter/sources/posthog.js";
import { collectPartnerOffers, REQUIRED_CITIES } from "../../../../lib/partnerPathInventory.js";
import { evaluatePartnerPaths, partnerPathVerdict, partnerPathPulseRow } from "../../../../lib/partnerPathHealth.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

const JOB = "partner-path";
const WINDOW_DAYS = 7;

export function exposureFromRows(rows) {
  const impressions = {};
  const clicks = {};
  let pageviews = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    pageviews += Number(r.pageviews) || 0;
    if (r.provider && r.provider !== "$pageview" && r.provider !== "(none)") {
      impressions[r.provider] = (impressions[r.provider] || 0) + (Number(r.impressions) || 0);
      clicks[r.provider] = (clicks[r.provider] || 0) + (Number(r.clicks) || 0);
    }
  }
  return { pageviews, impressions, clicks };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun(JOB, "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing — cannot read wf_deals (Undercover Tourist inventory)");
  if (!ph.posthogConfigured()) return jobCannotRun(JOB, "POSTHOG_PERSONAL_API_KEY is not set — cannot measure traffic or exposure");

  const db = createClient(url, svc, { auth: { persistSession: false } });
  const { data: deals, error } = await db.from("wf_deals").select("id,provider,active,link_ok,ends_at").eq("provider", "undercover_tourist").limit(2000);
  if (error) return jobFailed(JOB, "wf_deals read failed: " + String(error.message || error).slice(0, 120));

  const now = new Date();
  const exposure = await ph.partnerPathExposure(new Date(now.getTime() - WINDOW_DAYS * 86400000), now);
  if (!exposure.source || exposure.source.connected === false) {
    return jobFailed(JOB, "PostHog query failed: " + (exposure.source && exposure.source.note || "unknown error"));
  }

  const today = siteTodayStr();
  const { offers, unmeasured } = collectPartnerOffers({ dbDeals: Array.isArray(deals) ? deals : undefined });
  const report = evaluatePartnerPaths(offers, today, { requiredCities: REQUIRED_CITIES, unmeasured });
  const traffic = exposureFromRows(exposure.data);
  const verdict = partnerPathVerdict(report, traffic);
  const pulseRow = partnerPathPulseRow(verdict);
  const pulsed = await recordPulse(JOB, pulseRow);

  return Response.json({
    ok: true, job: JOB, today, windowDays: WINDOW_DAYS,
    providers: report.providers, renewalQueue: report.queue,
    traffic, incidents: verdict.incidents, warnings: verdict.warnings,
    pulse: { ...pulseRow, recorded: pulsed },
    note: "delivery is via the existing app/api/cron/job-watch pulse alert, not a new alert path; renewals are never automatic",
  }, { headers: { "Cache-Control": "no-store" } });
}
