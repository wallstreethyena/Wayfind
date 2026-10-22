// app/api/cron/apple-place-match/route.js — the Apple Place ID backfill as a
// scheduled, bounded, resumable job (lib/appleMatchJob.js). Free: every Apple
// call reserves one unit of the shared 'apple_maps' daily ceiling first, and
// the backfill's own share is capped at 6,000/day with headroom kept for live
// map traffic. No Google call.
//
// Runs in an off-hour window (vercel.json, 03:13-08:13 UTC = 11pm-4am ET), up
// to RUN_MAX Apple calls and RUN_BUDGET_MS per run, so one night drains at most
// the daily backfill limit. Each run re-derives the backlog from the tables and
// resumes where the last one stopped. Controlled outcomes, each ONE pulse and
// zero Apple calls: credentials not configured / invalid (once per day), the
// ledger migration not applied yet, backlog exhausted. None of these notes
// carries a deterministic-failure prefix, so they never page; the map keeps
// its existing pins and the browser Search fallback either way.
//
// CRON_SECRET-gated (Bearer), service role server-side, never cached. Tokens
// and keys are never logged or put in a pulse.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { sbEnv } from "../../../../lib/serverCache.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { PROMOTE_METROS, metrosFromRows } from "../../../../lib/promoteIndex.js";
import {
  JOB, appleCredentials, createAppleSearch, ledgerProvisioned, credentialsAlreadyRefusedToday, runAppleMatch, pulseNote,
  CREDENTIALS_MISSING_NOTE, CREDENTIALS_INVALID_NOTE, LEDGER_MISSING_NOTE,
} from "../../../../lib/appleMatchJob.js";

const RUN_MAX = 1000;          // Apple calls per run (6 runs/night <= 6,000/day cap)
const RUN_BUDGET_MS = 240_000; // stop starting calls with 60 s of platform time left
const NO_STORE = { "cache-control": "no-store" };

async function loadBoxes(sb, fetchImpl) {
  try {
    const r = await fetchImpl(`${sb.url}/rest/v1/wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true`, { headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` }, cache: "no-store" });
    if (r && r.ok) { const live = metrosFromRows(await r.json()); if (Object.keys(live).length) return live; }
  } catch { /* fall back to the committed boxes */ }
  return PROMOTE_METROS;
}

export async function GET(req) {
  // Resolved per request (not at import) so the guard can stub fetch / env.
  const fetchImpl = (url, init) => globalThis.fetch(url, init);
  const env = process.env;
  const clock = () => Date.now();
  const secret = env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sb = sbEnv();
  if (!sb) return jobCannotRun(JOB, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot read wf_inventory / wf_apple_place_ids");

  // ONE pulse per run, written right before the one response (every outcome
  // below lands here). The only unpulsed outcome is "credentials invalid and
  // already reported today": once per day, never a paging storm.
  const out = await (async () => {
    const creds = appleCredentials(env);
    if (!creds) return { note: CREDENTIALS_MISSING_NOTE, extra: { appleCalls: 0 } };
    if (!(await ledgerProvisioned({ sb, fetchImpl }))) return { note: LEDGER_MISSING_NOTE, extra: { appleCalls: 0 } };
    const recheck = new URL(req.url).searchParams.get("recheck") === "1";
    if (!recheck && await credentialsAlreadyRefusedToday({ sb, fetchImpl, nowMs: clock() })) {
      return { note: CREDENTIALS_INVALID_NOTE, extra: { appleCalls: 0, skipped: "already reported today" }, silent: true };
    }
    const started = clock();
    let stats;
    try {
      stats = await runAppleMatch({
        sb, fetchImpl, search: createAppleSearch({ creds, fetchImpl, now: clock }), boxes: await loadBoxes(sb, fetchImpl),
        nowMs: started, maxCalls: RUN_MAX, deadlineAt: started + RUN_BUDGET_MS, clock, sleepMs: 150,
      });
    } catch (e) {
      return { failed: "unavailable: " + String((e && e.message) || e).slice(0, 160) };
    }
    try { console.log(JSON.stringify({ tag: "apple_place_match", ...stats })); } catch {}
    // Invalid credentials are an owner action, not an outage: reported as idle
    // (attempted 0), never as a dead-run streak that pages.
    if (stats.stop === "credentials-invalid") return { note: pulseNote(stats), extra: stats };
    return { note: pulseNote(stats), extra: stats, attempted: stats.appleCalls, succeeded: stats.checked };
  })();
  if (out.failed) return jobFailed(JOB, out.failed);
  const pulsed = out.silent ? false : await recordPulse(JOB, { attempted: out.attempted || 0, succeeded: out.succeeded || 0, note: out.note });
  return Response.json({ ok: true, job: JOB, pulsed, note: out.note, ...out.extra }, { headers: NO_STORE });
}
