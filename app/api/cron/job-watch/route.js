// app/api/cron/job-watch/route.js
// Watches metered jobs that repeatedly produce nothing. Detection still runs
// every hour; human notification is stateful so the same incident does not
// become an hourly email.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { jobHealth, classifyHealth, incidentLine, recordPulse, DEAD_RUN_THRESHOLD } from "../../../../lib/jobPulse";
import { resolveOverride } from "../../../../lib/envAudit";
import { sbEnv } from "../../../../lib/serverCache";
import {
  encodeJobWatchState,
  jobWatchNotificationDecision,
  readJobWatchAlertState,
} from "../../../../lib/jobWatchAlert";
import * as Sentry from "@sentry/nextjs";

const LOOKBACK_HOURS = 48;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function incidentHtml(incidents, idle, healthy, kind) {
  const rows = incidents.map((r) => `<li style="margin:6px 0"><code>${escapeHtml(r.job)}</code> — <b>${Number(r.consecutive_zero || 0)} consecutive runs produced nothing</b> (${Number(r.succeeded || 0)}/${Number(r.attempted || 0)} succeeded in ${LOOKBACK_HOURS}h)${r.last_note ? `<br><span style="color:#666">last reason: ${escapeHtml(r.last_note)}</span>` : ""}</li>`).join("");
  const heading = kind === "reminder" ? "Wayfind — incident reminder" : "Wayfind — a metered job is producing nothing";
  return `<div style="font:14px/1.5 -apple-system,system-ui,sans-serif">
    <h2 style="margin:0 0 4px">${heading}</h2>
    <p style="color:#666;margin:0 0 14px">${kind === "reminder" ? "These incidents are still open after 24 hours." : "A new or materially changed incident needs attention."}</p>
    <ul style="padding-left:18px">${rows}</ul>
    <p style="color:#666">Window ${LOOKBACK_HOURS}h · threshold ${DEAD_RUN_THRESHOLD} consecutive dead runs · ${healthy.length} job(s) healthy, ${idle.length} idle.</p>
  </div>`;
}

function recoveryHtml() {
  return `<div style="font:14px/1.5 -apple-system,system-ui,sans-serif">
    <h2 style="margin:0 0 4px">Wayfind — monitored incidents recovered</h2>
    <p style="margin:0">The previously reported metered-job incident set is clear. The hourly watchdog remains active.</p>
  </div>`;
}

async function reportUndelivered(reason, incidents) {
  try {
    Sentry.captureException(
      new Error(`job-watch: ${incidents.length} incident(s) undelivered — ${reason}`),
      {
        level: "fatal",
        tags: { job: "job-watch", alarm: "delivery-failed" },
        extra: { reason, incidentCount: incidents.length, incidents: incidents.map(incidentLine) },
      }
    );
    await Sentry.flush(2000);
  } catch {
    // Telemetry is best-effort and must never take down the watcher.
  }
}

async function sendAlert({ resendKey, from, to, subject, html }) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return { sent: r.ok, status: r.status };
  } catch {
    return { sent: false, status: null };
  }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const rows = await jobHealth(LOOKBACK_HOURS);
  const { incidents, healthy, idle } = classifyHealth(rows);

  if (!rows.length) {
    const reason = "no pulse rows in window — health feed unavailable or nothing is reporting";
    await recordPulse("job-watch", { attempted: 0, succeeded: 0, failed: 1, note: reason });
    await reportUndelivered(reason, []);
    return Response.json({ ok: false, incidents: null, note: reason }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const s = sbEnv();
  const previousState = await readJobWatchAlertState({ url: s?.url, key: s?.key });
  const now = Date.now();
  const decision = jobWatchNotificationDecision(incidents, previousState, now);

  for (const r of incidents) {
    try { console.error(`[job-watch] INCIDENT ${incidentLine(r)}`); } catch {}
  }

  if (!decision.send) {
    if (!incidents.length) {
      await recordPulse("job-watch", { attempted: 0, succeeded: 0, failed: 0, note: "healthy: no incidents" });
    } else {
      const lastSentAt = previousState?.lastSentAt || now;
      await recordPulse("job-watch", {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        note: encodeJobWatchState({ status: "open", fingerprint: decision.fingerprint, lastSentAt }),
      });
    }
    return Response.json({
      ok: true,
      incidents: incidents.length,
      notified: false,
      notification: decision.kind,
      healthy: healthy.length,
      idle: idle.length,
    });
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const to = resolveOverride("DIGEST_EMAIL").value;
  const from = resolveOverride("WF_ALERT_FROM").value;
  if (!resendKey || !to) {
    const reason = "RESEND_API_KEY or DIGEST_EMAIL not set";
    const attempted = Math.max(1, incidents.length);
    await recordPulse("job-watch", { attempted, succeeded: 0, failed: attempted, note: "CANNOT SEND: " + reason + ` — ${incidents.length} incident(s) undelivered` });
    await reportUndelivered(reason, incidents);
    return Response.json(
      { ok: false, incidents: incidents.length, sent: false, reason, notification: decision.kind, detail: incidents.map(incidentLine) },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  const isRecovery = decision.kind === "recovery";
  const subject = isRecovery
    ? "Wayfind recovery: monitored incidents cleared"
    : decision.kind === "reminder"
      ? `Wayfind reminder: ${incidents.length} incident(s) still open`
      : `Wayfind incident: ${incidents.length} metered job(s) need attention`;
  const html = isRecovery ? recoveryHtml() : incidentHtml(incidents, idle, healthy, decision.kind);
  const { sent, status: sendStatus } = await sendAlert({ resendKey, from, to, subject, html });

  if (!sent) {
    const attempted = Math.max(1, incidents.length);
    await recordPulse("job-watch", {
      attempted,
      succeeded: 0,
      failed: attempted,
      note: `SEND FAILED status=${sendStatus} — ${incidents.length} incident(s) undelivered`,
    });
    await reportUndelivered(`Resend send failed (status=${sendStatus ?? "n/a"})`, incidents);
    return Response.json(
      { ok: false, incidents: incidents.length, sent: false, sendStatus, notification: decision.kind, detail: incidents.map(incidentLine) },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  const nextState = isRecovery
    ? { status: "clear", fingerprint: "", lastSentAt: now }
    : { status: "open", fingerprint: decision.fingerprint, lastSentAt: now };
  const delivered = Math.max(1, incidents.length);
  const stateNote = encodeJobWatchState(nextState);
  await recordPulse("job-watch", {
    attempted: delivered,
    succeeded: delivered,
    failed: 0,
    note: `${stateNote}:delivered ${decision.kind}`,
  });

  return Response.json({
    ok: true,
    incidents: incidents.length,
    sent: true,
    sendStatus,
    notification: decision.kind,
    detail: incidents.map(incidentLine),
  });
}
