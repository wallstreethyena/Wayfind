// app/api/cron/schema-watch/route.js — the layer that was missing for the DATABASE.
//
// job-watch watches metered jobs that run and accomplish nothing. coverage-watch
// watches us telling readers a place is covered when the feed cannot fill it.
// This watches the third silence: THE SCHEMA QUIETLY DRIFTING BACK OPEN.
//
// On 2026-08-25 the Supabase email led with a CRITICAL that was already fixed,
// and buried under it were two advisor ERRORs plus three findings the advisor
// never checks for: an anon-readable SECURITY DEFINER view serving the whole
// affiliate worklist, an anon-callable RPC that enqueues PAID Google calls, and
// anon holding TRUNCATE — which RLS does not restrict — on all 60 tables.
//
// A build guard cannot cover this. 129 migrations are applied and 10 exist as
// files in the repo, so the schema never passes through a commit, and
// check-guard-hermeticity rightly forbids a guard from holding a live
// credential. scripts/check-schema-watch.mjs locks the SHAPES this route and its
// SQL must keep; the live invariants can only be checked against the live
// database, which is what this route is for.
//
// Auth: CRON_SECRET bearer, fail-closed — same contract as job-watch,
// coverage-watch and cc-alerts.
// Cost: one Postgres RPC plus at most one Resend send. Nothing metered, no Google.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { classifyAudit, findingLine, emailHtml } from "../../../../lib/schemaWatch";
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";
import { resolveOverride } from "../../../../lib/envAudit";
import { credential } from "../../../../lib/envPlaceholder.js";

const JOB = "schema-watch";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const s = sbEnv();
  if (!s) {
    // 503, never 200. A watchdog that cannot see the database has not had a
    // clean run — and if the MISSING thing is the service key, recordPulse
    // cannot write either, so the status code is the only signal that survives.
    // Eight crons answered 200 through three days of dead-key silence in August;
    // jobCannotRun() is that lesson expressed as a response.
    return jobCannotRun(JOB, "no service env — the watchdog cannot see the database, which is NOT the same as nothing being wrong");
  }

  let rows = null, readErr = null;
  try {
    const r = await fetch(`${s.url}/rest/v1/rpc/wf_schema_audit`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (r.ok) rows = await r.json();
    else readErr = `${r.status} ${(await r.text()).slice(0, 200)}`;
  } catch (e) { readErr = String((e && e.message) || e).slice(0, 200); }

  // A watchdog that cannot read is not a quiet watchdog, it is a broken one.
  // Returning a reassuring "0 findings" here would BE the vulnerability: it is
  // the same shape as the stale CRITICAL that hid two live ERRORs for two days.
  if (!Array.isArray(rows)) {
    console.error(`[schema-watch] AUDIT UNREADABLE ${readErr || "non-array response"}`);
    return jobFailed(JOB, "wf_schema_audit unreadable — this is an incident, not a clean run", {
      attempted: 1, succeeded: 0, detail: readErr || "non-array response",
    });
  }

  const { findings, context, counts, scanned, alarming } = classifyAudit(rows);

  // An EMPTY array is a legitimate clean result here, unlike coverage-watch:
  // wf_schema_audit returns one row per FINDING, so zero findings is the goal
  // state. It is distinguishable from unreadable because it parsed as an array.
  await recordPulse(JOB, {
    attempted: 1,
    succeeded: 1,
    note: alarming ? `${counts.critical} critical / ${counts.high} high` : null,
  });

  for (const f of findings) {
    if (f.severity === "critical" || f.severity === "high") {
      try { console.error("[schema-watch] " + findingLine(f)); } catch (e) {}
    }
  }

  const summary = {
    ok: true,
    scanned,
    counts,
    findings: findings.map(findingLine),
    recentMigrations: context.map((c) => `${c.object} ${c.detail}`),
  };
  if (!alarming) return Response.json({ ...summary, sent: false, reason: "no critical or high findings" });

  const resendKey = credential(process.env.RESEND_API_KEY);
  const to = resolveOverride("DIGEST_EMAIL").value;
  const from = resolveOverride("WF_ALERT_FROM").value;
  if (!resendKey || !to) {
    // Say why it could not send. A silent no-send would reproduce the failure
    // mode this route exists to catch.
    return Response.json({ ...summary, sent: false, reason: "RESEND_API_KEY or DIGEST_EMAIL not set — findings are real and undelivered" });
  }

  let sent = false, sendStatus = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to],
        subject: `Wayfind: ${counts.critical} critical / ${counts.high} high schema exposure finding(s)`,
        html: emailHtml({ findings, counts, context }),
      }),
      cache: "no-store",
    });
    sendStatus = r.status;
    sent = r.ok;
    if (!r.ok) console.error(`[schema-watch] resend failed status=${r.status}`);
  } catch (e) {
    console.error(`[schema-watch] resend threw ${String(e && e.message).slice(0, 160)}`);
  }

  return Response.json({ ...summary, sent, sendStatus });
}
