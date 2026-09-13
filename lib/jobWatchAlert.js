// Persistent notification policy for /api/cron/job-watch.
// The cron still evaluates health every hour. This module only decides when a
// human should be emailed, so an unchanged incident does not become hourly spam.

import { createHash } from "node:crypto";

export const JOB_WATCH_REMINDER_MS = 24 * 60 * 60 * 1000;
const STATE_PREFIX = "watch-state:v1:";

function normalizeReason(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+x\d+\b/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

// Do not include consecutive_zero or attempted/succeeded counters: those move
// every hour while the underlying incident is unchanged. Hash the stable source
// so the state always fits inside wf_job_pulse.note's 200-character ceiling.
export function incidentFingerprint(incidents) {
  const source = (incidents || [])
    .map((r) => `${String(r?.job || "unknown").trim()}|${normalizeReason(r?.last_note)}`)
    .sort()
    .join(";");
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

export function encodeJobWatchState({ status, fingerprint = "", lastSentAt = 0 } = {}) {
  const safeStatus = status === "open" ? "open" : "clear";
  const sent = Number.isFinite(Number(lastSentAt)) ? Math.max(0, Math.trunc(Number(lastSentAt))) : 0;
  return `${STATE_PREFIX}${safeStatus}:${sent}:${String(fingerprint || "").slice(0, 32)}`;
}

export function decodeJobWatchState(note) {
  const raw = String(note || "");
  if (!raw.startsWith(STATE_PREFIX)) return null;
  const rest = raw.slice(STATE_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 3) return null;
  const status = parts[0];
  const lastSentAt = Number(parts[1]);
  const fingerprint = parts[2] || "";
  if (!['open', 'clear'].includes(status) || !Number.isFinite(lastSentAt) || lastSentAt < 0 || fingerprint.length > 32) return null;
  return { status, lastSentAt, fingerprint };
}

export function jobWatchNotificationDecision(incidents, previousState, now = Date.now()) {
  const open = Array.isArray(incidents) && incidents.length > 0;
  if (!open) {
    if (previousState?.status === "open") return { send: true, kind: "recovery", fingerprint: "" };
    return { send: false, kind: "quiet", fingerprint: "" };
  }

  const fingerprint = incidentFingerprint(incidents);
  if (previousState?.status !== "open" || previousState.fingerprint !== fingerprint) {
    return { send: true, kind: "incident", fingerprint };
  }
  if (!Number.isFinite(previousState.lastSentAt) || now - previousState.lastSentAt >= JOB_WATCH_REMINDER_MS) {
    return { send: true, kind: "reminder", fingerprint };
  }
  return { send: false, kind: "suppressed", fingerprint };
}

export async function readJobWatchAlertState({ url, key, fetchImpl = fetch } = {}) {
  if (!url || !key) return null;
  try {
    const endpoint = new URL('/rest/v1/wf_job_pulse', url);
    endpoint.search = new URLSearchParams({
      job: 'eq.job-watch',
      note: 'like.watch-state:v1:*',
      select: 'note,ran_at',
      order: 'ran_at.desc,id.desc',
      limit: '1',
    });
    const response = await fetchImpl(endpoint, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    return decodeJobWatchState(rows[0]?.note);
  } catch {
    return null;
  }
}
