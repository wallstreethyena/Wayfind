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

import { jobHealth, classifyHealth, incidentLine, DEAD_RUN_THRESHOLD } from "../../../../lib/jobPulse";
import { resolveOverride } from "../../../../lib/envAudit";

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
    return Response.json({ ok: true, incidents: incidents.length, sent: false, reason: "RESEND_API_KEY or DIGEST_EMAIL not set", detail: incidents.map(incidentLine) });
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

  return Response.json({ ok: true, incidents: incidents.length, sent, sendStatus, detail: incidents.map(incidentLine) });
}
