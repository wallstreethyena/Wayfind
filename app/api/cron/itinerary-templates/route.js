// app/api/cron/itinerary-templates/route.js — twice daily refresh of the itinerary
// templates OpenAI drafts from Wayfind's own places and events (owner order
// 2026-11-27). Fixed set: lib/itineraryTemplates.js TEMPLATE_METROS x
// TEMPLATE_THEMES (at most 12 drafts a run), each one OpenAI call through the capped
// engine lane (lib/aiEngine.js). A metro whose candidate list did not change
// since the last draft is skipped (no call). If OpenAI is unavailable the
// rules planner fills the same template from the same candidates.
// Fail closed: no CRON_SECRET -> 401; no Supabase env -> 503. Every terminal
// path records a wf_job_pulse row.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { sbEnv } from "../../../../lib/serverCache.js";
import { TEMPLATE_METROS, TEMPLATE_THEMES, buildCandidates, loadCandidateRows, draftTemplate, upsertTemplate, inputHash } from "../../../../lib/itineraryTemplates.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { siteTodayStr, utcCalendarDateKey } from "../../../../lib/siteTime";

const JOB = "itinerary-templates";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const s = sbEnv();
  if (!s) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  const cfg = { url: s.url, service: s.key };
  const todayStr = siteTodayStr();
  const horizonStr = utcCalendarDateKey(Date.parse(todayStr + "T12:00:00Z") + 10 * 86400000);
  const force = new URL(req.url).searchParams.get("force") === "1";
  let attempted = 0, written = 0, skipped = 0, ai = 0;
  const notes = [];
  try {
    const prevR = await fetch(`${cfg.url}/rest/v1/wf_itinerary_templates?select=metro,theme,input_hash`, { headers: { apikey: cfg.service, Authorization: "Bearer " + cfg.service }, cache: "no-store" });
    const prev = new Map((prevR.ok ? (await prevR.json()) || [] : []).map((r) => [r.metro + "|" + r.theme, r.input_hash]));
    for (const m of TEMPLATE_METROS) {
      const rows = await loadCandidateRows(cfg, m, { todayStr, horizonStr });
      if (!rows) { notes.push(m.metro + ":read_failed"); continue; }
      for (const theme of Object.values(TEMPLATE_THEMES)) {
        const cands = buildCandidates(rows.places, theme.events ? rows.events : [], { todayStr, horizonStr });
        if (!force && prev.get(m.metro + "|" + theme.id) === inputHash(cands, theme.id)) { skipped += 1; continue; }
        attempted += 1;
        const rec = await draftTemplate(cands, { metro: m.metro, city: m.city, theme });
        if (!rec) { notes.push(`${m.metro}/${theme.id}:too_few`); continue; }
        if (await upsertTemplate(cfg, rec)) { written += 1; if (rec.writer === "openai") ai += 1; }
        else notes.push(`${m.metro}/${theme.id}:write_failed`);
      }
    }
    const note = `ai=${ai} skipped=${skipped}${notes.length ? " " + notes.slice(0, 6).join(" ") : ""}`;
    await recordPulse(JOB, { attempted, succeeded: written, failed: attempted - written, note });
    return Response.json({ ok: true, attempted, written, ai, skipped, notes }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jobFailed(JOB, String((e && e.message) || e), { attempted, succeeded: written });
  }
}
