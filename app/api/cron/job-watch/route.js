// app/api/cron/job-watch/route.js — the layer that was missing.
//
// atlas-build ran 100% failed for five days behind HTTP 200s. Four layers said
// green: the 200s themselves, a guard asserting the cron was scheduled, an env
// audit that only checked key presence, and an Anthropic spend column nobody was
// reading. The credential was the trigger; the blindness was the bug.
//
// This route watches the generic version of that failure — a metered job that
// ATTEMPTS work and SUCCEEDS at none of it, for DEAD_RUN_THRESHOLD consecutive
// runs — and emails. It is not atlas-specific: any job calling recordPulse() is
// covered, so Places going quiet or blurbs dying reads the same way.
//
// Deliberately not a billing integration: provider spend APIs lag hours to days,
// and "this job stopped accomplishing anything" is observable immediately.
//
// Auth: CRON_SECRET bearer, fail-closed, same as cc-alerts and cwv.
// Cost: one RPC plus at most one Resend send. Nothing metered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { jobHealth, classifyHealth, incidentLine, recordPulse, DEAD_RUN_THRESHOLD } from "../../../../lib/jobPulse";
import { resolveOverride } from "../../../../lib/envAudit";
// Same import shape as sentry.server.config.js / sentry.edge.config.js: a
// static top-level import of the SDK. This file only ever runs server-side
// (runtime: nodejs, a cron route), so unlike app/components/SentryClient.js —
// which loads the SDK dynamically post-hydration to protect the homepage's
// client bundle ceiling — there is no client-bundle reason to defer it here.
// Sentry.init() already ran once at process start (instrumentation.js ->
// sentry.server.config.js) and stays dark (enabled:false) until SENTRY_DSN is
// set, so captureException below is always safe to call unconditionally.
import * as Sentry from "@sentry/nextjs";

const LOOKBACK_HOURS = 48;

function emailHtml(incidents, idle, healthy) {
  const rows = incidents.map((r) => `<li style="margin:6px 0"><code>${r.job}</code> — <b>${r.consecutive_zero} consecutive runs produced nothing</b> (${r.succeeded}/${r.attempted} succeeded in ${LOOKBACK_HOURS}h)${r.last_note ? `<br><span style="color:#666">last reason: ${String(r.last_note).replace(/</g, "&lt;")}</span>` : ""}</li>`).join("");
  return `<div style="font:14px/1.5 -apple-system,system-ui,sans-serif">
    <h2 style="margin:0 0 4px">Wayfind — a metered job is producing nothing</h2>
    <p style="color:#666;margin:0 0 14px">A job that runs and succeeds at nothing looks healthy from the outside. atlas-build did exactly this for five days behind HTTP 200s.</p>
    <ul style="padding-left:18px">${rows}</ul>
    <p style="color:#666">Window ${LOOKBACK_HOURS}h · threshold ${DEAD_RUN_THRESHOLD} consecutive dead runs · ${healthy.length} job(s) healthy, ${idle.length} idle (nothing to do, not a failure).</p>
  </div>`;
}

// v8.99.16 — THE WATCHER MUST BE WATCHED, LAYER TWO (owner, 2026-09-07,
// incident review). RESEND_API_KEY has never been set in Vercel. Measured on
// production 2026-09-07: job-watch ran hourly all day, correctly detected 5
// real incidents every run, correctly filed its own failed self-pulse
// (succeeded:0, "CANNOT SEND..."), and every single run still answered HTTP
// 200 — because the ONLY channel this route had for saying "nobody was told"
// was Resend, the exact channel that was down. Detection was never broken.
// Notification was, and the failure of notification was reported nowhere a
// human or a monitor would see it. That is the same shape as the atlas-build
// incident this whole route exists to prevent, one level up: a job that
// SUCCEEDS at nothing while answering 200.
//
// The owner's requirement, verbatim in intent: the alarm system must not
// depend on one optional email secret. So an undelivered alarm now escapes
// through two channels Resend does not gate: a high-severity Sentry event
// (below) and a non-200 HTTP status (at each call site), on top of the
// failed self-pulse this route already filed. Resend stays one channel among
// three, not the single point of failure.
//
// Fail-soft on purpose, same as recordPulse: Sentry itself must never be the
// reason this route fails to answer its caller.
function reportUndelivered(reason, incidents) {
  try {
    Sentry.captureException(
      new Error(`job-watch: ${incidents.length} incident(s) undelivered — ${reason}`),
      {
        level: "fatal",
        tags: { job: "job-watch", alarm: "delivery-failed" },
        extra: { reason, incidentCount: incidents.length, incidents: incidents.map(incidentLine) },
      }
    );
  } catch (e) {
    /* telemetry is best-effort; it must never take the response down with it */
  }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const rows = await jobHealth(LOOKBACK_HOURS);
  const { incidents, healthy, idle } = classifyHealth(rows);

  // No pulse data at all is itself worth saying out loud rather than reporting
  // "0 incidents" — an empty table and a healthy fleet are different facts, and
  // conflating them is the exact mistake this route exists to stop.
  if (!rows.length) {
    return Response.json({ ok: true, incidents: 0, note: "no pulse rows in window — nothing is reporting, which is NOT the same as nothing being wrong" });
  }
  if (!incidents.length) {
    return Response.json({ ok: true, incidents: 0, healthy: healthy.length, idle: idle.length });
  }

  for (const r of incidents) {
    try { console.error(`[job-watch] INCIDENT ${incidentLine(r)}`); } catch (e) {}
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const to = resolveOverride("DIGEST_EMAIL").value;
  const from = resolveOverride("WF_ALERT_FROM").value;
  if (!resendKey || !to) {
    // Say why it could not send. A silent no-send here would reproduce the
    // failure mode this whole route exists to catch.
    // v8.29.13 — THE WATCHER MUST BE WATCHED. Returning a reason in a cron's
    // JSON body is not telling anyone: nobody reads a cron's response, and this
    // still answers HTTP 200. Measured on production 2026-08-21, wf_job_health(48)
    // returned SIX incidents — atlas-build and atlas-retry at 48 consecutive dead
    // runs, and four popularity providers at 24 each, 19,997 failed upstream calls
    // over seven days — and the owner learned about none of it. Detection was
    // never broken. DELIVERY was, and the no-send path reported its own failure
    // into a void.
    //
    // So job-watch now files its own pulse, into the same table it reads. A
    // watcher that cannot deliver becomes an incident in its own feed rather than
    // a silent 200 — which is the exact failure this route was built to end, one
    // level up.
    const reason = "RESEND_API_KEY or DIGEST_EMAIL not set";
    await recordPulse("job-watch", { attempted: Math.max(1, incidents.length), succeeded: 0, note: "CANNOT SEND: " + reason + " — " + incidents.length + " incident(s) undelivered" });
    reportUndelivered(reason, incidents);
    // 500, not 200: job-watch RAN and its detection worked (these are real
    // incidents, correctly classified) — this is the "ran but the work
    // failed" shape lib/jobFail.js's jobFailed() already answers with 500
    // elsewhere in this repo, applied to job-watch's own critical side
    // effect (notifying a human) rather than to the jobs it watches. A
    // status-code monitor on this cron — the exact layer the atlas-build
    // incident showed nobody had — now sees the failure too.
    return Response.json(
      { ok: false, incidents: incidents.length, sent: false, reason, detail: incidents.map(incidentLine) },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  let sent = false, sendStatus = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to],
        subject: `Wayfind: ${incidents.length} metered job(s) producing nothing`,
        html: emailHtml(incidents, idle, healthy),
      }),
    });
    sendStatus = r.status;
    sent = r.ok;
    if (!r.ok) console.error(`[job-watch] resend failed status=${r.status}`);
  } catch (e) {
    console.error(`[job-watch] resend threw ${String(e && e.message).slice(0, 160)}`);
  }

  // The delivering path files a pulse too, so "job-watch has not run" and
  // "job-watch ran and everything was fine" stop looking identical from outside.
  await recordPulse("job-watch", {
    attempted: Math.max(1, incidents.length),
    succeeded: sent ? Math.max(1, incidents.length) : 0,
    note: sent ? `delivered ${incidents.length} incident(s)` : `SEND FAILED status=${sendStatus} — ${incidents.length} incident(s) undelivered`,
  });
  if (!sent) {
    // Same undelivered-alarm shape as the missing-config branch above, for the
    // same reason: a key that IS set but a send that fails (Resend down, rate
    // limited, bad address) is just as undelivered as a key that was never
    // set, and must not read as success either.
    reportUndelivered(`Resend send failed (status=${sendStatus ?? "n/a"})`, incidents);
    return Response.json(
      { ok: false, incidents: incidents.length, sent, sendStatus, detail: incidents.map(incidentLine) },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
  return Response.json({ ok: true, incidents: incidents.length, sent, sendStatus, detail: incidents.map(incidentLine) });
}
