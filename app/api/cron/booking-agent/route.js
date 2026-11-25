// app/api/cron/booking-agent/route.js — runs one queued OpenTable booking agent run on
// Wayfind's own hosting (owner decision 2026-11-25: no separate worker server).
//
// Every minute, and right after a guest's tap (app/api/reserve/agent/start uses after()).
// Dark unless BOOKING_AGENT_ENABLED=1, BOOKING_AGENT_SITE_OPENTABLE=1 and the opentable site row
// is "on"; the restaurant allowlist limits it further (lib/bookingAgent/flags.js). Idle minutes
// cost one database read and launch no browser.
//
// Fail closed: no CRON_SECRET -> 401. Every terminal path records a wf_job_pulse row for
// job-watch: attempted 1 when a queued run was handled, 0 when idle or switched off. A run that
// ends in a hand back to the guest is the agent working as designed, not a failed job; only an
// error inside the pass counts as failed. Logs carry run ids and statuses, never guest details.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { runBookingAgentOnce } from "../../../../lib/bookingAgent/serverlessRun.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobFailed } from "../../../../lib/jobFail.js";

const JOB = "booking-agent";
const HEADERS = { "cache-control": "no-store" };

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });
  if (String(process.env.BOOKING_AGENT_ENABLED || "") !== "1" || String(process.env.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 0, note: "off: switches not set" });
    return Response.json({ ok: true, ran: false, reason: "off" }, { headers: HEADERS });
  }
  try {
    const out = await runBookingAgentOnce();
    if (out.ran || out.reaped) console.log(JSON.stringify({ tag: "booking_agent_run", id: out.id || null, status: out.status || null, launched: Boolean(out.launched), reaped: out.reaped || 0 }));
    const handled = out.ran ? 1 : 0;
    await recordPulse(JOB, { attempted: handled, succeeded: handled, failed: 0, note: out.ran ? `run ${out.status}` : (out.busy ? "busy: a run is in progress" : "idle") + (out.reaped ? `, closed ${out.reaped} stale` : "") });
    return Response.json({ ok: true, ran: Boolean(out.ran), status: out.status || null, reaped: out.reaped || 0 }, { headers: HEADERS });
  } catch (e) {
    return jobFailed(JOB, "booking agent pass failed: " + String((e && e.code) || "error").slice(0, 40));
  }
}
