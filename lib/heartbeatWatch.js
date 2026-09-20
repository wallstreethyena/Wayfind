// lib/heartbeatWatch.js — independent liveness check for the Supabase watcher.
//
// public.wf_heartbeat_watch() runs from Supabase pg_cron every 15 minutes and
// writes a `heartbeat-watch` pulse. That protects GitHub/Vercel-scheduled jobs,
// but a stopped pg_cron job can otherwise disappear silently. job-watch runs
// from Vercel on a different clock, so it reads the newest persisted watcher
// pulse directly and treats an hour of silence as an incident.

export const HEARTBEAT_WATCH_JOB = "heartbeat-watch";
export const HEARTBEAT_WATCH_MAX_STALENESS_MS = 60 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;

export function heartbeatWatchSilenceFailure(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length !== 1) return "No latest heartbeat-watch pulse";
  const row = rows[0];
  const at = Date.parse(row?.ran_at);
  if (row?.job !== HEARTBEAT_WATCH_JOB || !Number.isFinite(at)) return "Malformed heartbeat-watch pulse";
  if (at > now + FUTURE_SKEW_MS) return "Heartbeat-watch pulse has an invalid future timestamp";
  if (now - at > HEARTBEAT_WATCH_MAX_STALENESS_MS) return "Heartbeat-watch pulse is stale";
  return null;
}

export async function readHeartbeatWatchPulse({ url, key, fetchImpl = fetch, now = Date.now() }) {
  if (!url || !key) throw new Error("Heartbeat-watch liveness check requires Supabase URL and service-role credentials");
  const endpoint = new URL("/rest/v1/wf_job_pulse", url);
  endpoint.search = new URLSearchParams({
    job: `eq.${HEARTBEAT_WATCH_JOB}`,
    select: "job,ran_at",
    order: "ran_at.desc,id.desc",
    limit: "1",
  });
  const response = await fetchImpl(endpoint, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Heartbeat-watch pulse read failed: HTTP ${response.status}`);
  const rows = await response.json();
  return { rows, failure: heartbeatWatchSilenceFailure(rows, now) };
}

export function heartbeatWatchSilenceIncident(reason) {
  return {
    job: HEARTBEAT_WATCH_JOB,
    attempted: 1,
    succeeded: 0,
    failed: 1,
    // job-watch normally waits for two dead runs. Silence is already a
    // persisted one-hour absence on a 15-minute clock, so make it visible on
    // the first independent Vercel check instead of waiting another hour.
    consecutive_zero: 2,
    last_note: `unavailable: heartbeat-watch silence — ${String(reason || "unknown").slice(0, 120)}`,
  };
}
