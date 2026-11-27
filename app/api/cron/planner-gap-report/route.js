// app/api/cron/planner-gap-report/route.js — the planner's end of day gap
// report (owner order 2026-11-27: "it provides a report at the end of the day
// ... this is an area of opportunity. We need to build on it").
//
// Once a day it reads the last 24 hours of wf_planner_gaps (privacy safe rows,
// see lib/plannerGaps.js), groups them, looks up to MAX_LEADS of the most asked
// for missing places on the web through the capped AI engine
// (lib/aiEngine.js engineSearch, which shares the weekly OpenAI budget), and
// stores one plain text report in wf_planner_gap_reports. Leads are pages to
// check, never facts: this job writes nothing into Wayfind's places, events,
// hours or photos. Rows older than 90 days are deleted.
//
// Fail closed: no CRON_SECRET -> 401; no Supabase env -> 503. Every terminal
// path records a wf_job_pulse row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { sbEnv } from "../../../../lib/serverCache.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { siteTodayStr } from "../../../../lib/siteTime";
import { COVERED_CITIES } from "../../../../lib/landingCities.js";
import { engineSearch } from "../../../../lib/aiEngine.js";
import { summarizeGaps, reportText, readLeadAnswer, pickLeadUrl, leadQuestion } from "../../../../lib/plannerGaps.js";

const JOB = "planner-gap-report";
const MAX_LEADS = 8;
const KEEP_DAYS = 90;

function cityName(metro) {
  const c = metro && COVERED_CITIES[metro];
  return c && c.name ? c.name : null;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const s = sbEnv();
  if (!s) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const headers = { apikey: s.key, Authorization: "Bearer " + s.key };
  const today = siteTodayStr();
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_planner_gaps?created_at=gte.${encodeURIComponent(sinceIso)}&select=outcome,metro,requested_city,interests,kids,unmatched,weather_lean&order=created_at.desc&limit=5000`, { headers, cache: "no-store" });
    if (!r.ok) return jobFailed(JOB, "gap read failed: " + r.status, { attempted: 0, succeeded: 0 });
    const rows = (await r.json()) || [];
    const summary = summarizeGaps(rows);

    const leads = [];
    for (const p of summary.missingPlaces.slice(0, MAX_LEADS)) {
      const res = await engineSearch(leadQuestion(p.name, cityName(p.metro)));
      if (!res.ok) { leads.push({ name: p.name, answer: "unchecked", reason: res.reason }); if (/cap_reached|ledger_unavailable|BUDGET|credentials/.test(res.reason || "")) break; continue; }
      const { url, official } = pickLeadUrl(res.urls);
      leads.push({ name: p.name, answer: readLeadAnswer(res.text), url, official });
    }

    const text = reportText(today, summary, leads);
    const body = { summary, leads, window_start: sinceIso };
    const up = await fetch(`${s.url}/rest/v1/wf_planner_gap_reports?on_conflict=report_date`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ report_date: today, requests: summary.requests, summary: text, body }),
      cache: "no-store",
    });
    if (!up.ok) return jobFailed(JOB, "report write failed: " + up.status, { attempted: 1, succeeded: 0 });

    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    await fetch(`${s.url}/rest/v1/wf_planner_gaps?created_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" }, cache: "no-store" }).catch(() => null);

    const checked = leads.filter((l) => l.answer !== "unchecked").length;
    await recordPulse(JOB, { attempted: 1, succeeded: 1, failed: 0, note: `rows=${rows.length} leads=${checked}/${leads.length}` });
    return Response.json({ ok: true, report_date: today, requests: summary.requests, leads: checked }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jobFailed(JOB, String((e && e.message) || e), { attempted: 1, succeeded: 0 });
  }
}
