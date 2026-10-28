// lib/eventSafety.js — event safety that does NOT depend on the LLM task.
//
// THE INCIDENT (2026-10-26/27). Event truth (wf_events verification) is done
// by a Claude scheduled task that writes `event-truth-daily` /
// `event-truth-sla` pulses. When that account hit USAGE_LIMIT_REACHED, two
// things happened that nothing deterministic prevented:
//   1. ended events stayed `scheduled` (47 rows) — still DISPLAYABLE, so the
//      site kept advertising events that were over;
//   2. 347 imminent events went past the 1-day verification SLA.
// heartbeat-watch paged OVERDUE (no pulse), but a run that DOES pulse while
// accomplishing nothing (attempted>0 succeeded=0, or attempted=0 "checked 0")
// is invisible to a liveness check, and no watcher looked at the data itself.
//
// This module is the pure core of /api/cron/event-safety:
//   (a) ROLLOVER — which displayable rows are definitely over, so the cron can
//       set event_status='completed'. Deterministic, idempotent, never deletes.
//   (b) FRESHNESS — classifies verification freshness of imminent displayable
//       events from the DATA (last_verified_at), plus whether the LLM task did
//       useful work recently, and decides whether the `event-freshness` pulse
//       must carry failed>0 so the existing job-watch paging path fires.
//
// Pure: no I/O. `now` is always injected so tests can pin the clock.

export const ROLLOVER_JOB = "event-rollover";
export const FRESHNESS_JOB = "event-freshness";
export const TRUTH_JOB = "event-truth-daily";

// Must equal lib/curatedEvents.js DISPLAYABLE_STATUS (asserted by
// scripts/test-event-safety.mjs against that file's source).
export const DISPLAYABLE_STATUSES = Object.freeze(["scheduled", "sold_out"]);
export const SITE_TZ = "America/New_York";

export const IMMINENT_DAYS = 7;
export const SLA_MS = 24 * 3600_000; // 1 day
export const FUSE_MS = 3 * 24 * 3600_000; // 3 days
export const PAST_SLA_PAGE_THRESHOLD = 10; // page when MORE than this many
export const USEFUL_WORK_MAX_AGE_MS = 30 * 3600_000; // 30h
export const ROLLOVER_NOTE_PREFIX = "ROLLOVER";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" calendar day of `now` in `tz`. Throws on an unknown zone. */
export function dayInZone(now, tz = SITE_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now instanceof Date ? now : new Date(now));
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** ISO day + n days (UTC arithmetic on a calendar date, no tz involved). */
export function addDays(day, n) {
  // Pure calendar arithmetic on a date string (never "today"), read back with
  // getUTC* parts so no timezone can shift it.
  const d = new Date(Date.parse(day + "T00:00:00Z") + n * 86400_000);
  const p2 = (v) => String(v).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

function isoDay(v) {
  const s = v == null ? "" : String(v).slice(0, 10);
  return ISO_DAY.test(s) ? s : null;
}

/**
 * The last calendar day this row runs: max(end_date, start_date, verified
 * occurrence days). null when the row has no usable date at all — such a row
 * is NEVER rolled over (no date = we do not know it ended).
 */
export function finalOccurrenceDate(row, occurrences = null) {
  if (!row) return null;
  const days = [isoDay(row.end_date), isoDay(row.start_date)];
  if (Array.isArray(occurrences)) for (const d of occurrences) days.push(isoDay(d));
  const valid = days.filter(Boolean).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

/**
 * "Today" for this row: the EARLIER of the site day (America/New_York) and the
 * row's own timezone day. An event in Chicago that ends on D is still running
 * at 00:30 ET on D+1, so it must not roll over until Chicago reaches D+1 too.
 * An unknown/blank timezone falls back to the site day only.
 */
export function rowToday(row, now) {
  const site = dayInZone(now, SITE_TZ);
  const tz = row && typeof row.timezone === "string" ? row.timezone.trim() : "";
  if (!tz || tz === SITE_TZ) return site;
  let local;
  try { local = dayInZone(now, tz); } catch { return site; }
  return local < site ? local : site;
}

/** True when the row is displayable and its final occurrence is before its today. */
export function isRolloverCandidate(row, now, occurrences = null) {
  if (!row || !DISPLAYABLE_STATUSES.includes(row.event_status)) return false;
  const final = finalOccurrenceDate(row, occurrences);
  if (!final) return false;
  return final < rowToday(row, now);
}

/**
 * Plan the rollover. `occurrencesFor(row)` is optional (verified day lists).
 * Returns { today, candidates:[{event_id, final_date, note}], skipped }.
 * The note keeps the previous verify_note after the ROLLOVER prefix, so the
 * human verification history is not destroyed.
 */
export function planRollover(rows, now, { occurrencesFor = null, maxNoteLen = 1000 } = {}) {
  const today = dayInZone(now, SITE_TZ);
  const candidates = [];
  let skipped = 0;
  for (const row of rows || []) {
    const occ = occurrencesFor ? occurrencesFor(row) : null;
    if (!row || !row.event_id || !isRolloverCandidate(row, now, occ)) { skipped++; continue; }
    const final = finalOccurrenceDate(row, occ);
    const prev = row.verify_note ? String(row.verify_note) : "";
    // Already carries a ROLLOVER prefix (e.g. a status was flipped back by
    // hand): do not stack prefixes.
    const base = `${ROLLOVER_NOTE_PREFIX} ${today}: ${row.event_status}→completed (final date ${final}; deterministic event-safety cron)`;
    const note = (prev && !prev.startsWith(ROLLOVER_NOTE_PREFIX + " ") ? `${base} | prev: ${prev}` : base).slice(0, maxNoteLen);
    candidates.push({ event_id: String(row.event_id), final_date: final, from_status: row.event_status, note });
  }
  return { today, candidates, skipped };
}

/**
 * Is this row an IMMINENT displayable event for freshness purposes?
 * start within IMMINENT_DAYS of today (ET), still displayable, and not over
 * (coalesce(end,start) >= today ET).
 */
export function isImminent(row, now) {
  if (!row || !DISPLAYABLE_STATUSES.includes(row.event_status)) return false;
  const start = isoDay(row.start_date);
  if (!start) return false;
  const today = dayInZone(now, SITE_TZ);
  const final = isoDay(row.end_date) || start;
  return start <= addDays(today, IMMINENT_DAYS) && final >= today;
}

/** A pulse is USEFUL WORK only when it succeeded at something. */
export function isUsefulWorkPulse(p) {
  return !!p && p.job === TRUTH_JOB && Number(p.succeeded || 0) > 0 && Number.isFinite(Date.parse(p.ran_at));
}

/**
 * Classify freshness. `events` = candidate rows (filtered again here, so a
 * loose query can never inflate counts); `pulses` = recent event-truth-daily
 * pulses in any order (zero-work pulses included on purpose).
 */
export function classifyFreshness(events, pulses, now, {
  pastSlaThreshold = PAST_SLA_PAGE_THRESHOLD,
  usefulMaxAgeMs = USEFUL_WORK_MAX_AGE_MS,
  endedDisplayable = 0,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  let imminent = 0, pastSla = 0, pastFuse = 0, neverVerified = 0;
  let oldestAgeMs = null;
  for (const row of events || []) {
    if (!isImminent(row, nowMs)) continue;
    imminent++;
    const at = row.last_verified_at ? Date.parse(row.last_verified_at) : NaN;
    if (!Number.isFinite(at)) {
      neverVerified++; pastSla++; pastFuse++;
      oldestAgeMs = Infinity;
      continue;
    }
    const age = nowMs - at;
    if (age > SLA_MS) pastSla++;
    if (age > FUSE_MS) pastFuse++;
    if (oldestAgeMs !== Infinity && (oldestAgeMs == null || age > oldestAgeMs)) oldestAgeMs = age;
  }
  const useful = (pulses || []).filter(isUsefulWorkPulse)
    .sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at))[0] || null;
  const usefulAgeMs = useful ? nowMs - Date.parse(useful.ran_at) : null;
  const reasons = [];
  if (pastSla > pastSlaThreshold) reasons.push(`imminent_past_sla ${pastSla} > ${pastSlaThreshold}`);
  if (pastFuse > 0) reasons.push(`imminent_past_fuse ${pastFuse}`);
  if (!useful) reasons.push(`no useful ${TRUTH_JOB} pulse (succeeded>0) in window`);
  else if (usefulAgeMs > usefulMaxAgeMs) reasons.push(`last useful ${TRUTH_JOB} pulse ${fmtAge(usefulAgeMs)} old > ${fmtAge(usefulMaxAgeMs)}`);
  if (Number(endedDisplayable) > 0) reasons.push(`ended_still_displayable ${Number(endedDisplayable)}`);
  const degraded = reasons.length > 0;
  return {
    degraded,
    reasons,
    imminent, pastSla, pastFuse, neverVerified,
    oldestAgeMs,
    lastUseful: useful ? { id: useful.id ?? null, ran_at: useful.ran_at, succeeded: Number(useful.succeeded) } : null,
    usefulAgeMs,
    endedDisplayable: Number(endedDisplayable) || 0,
  };
}

export function fmtAge(ms) {
  if (ms == null) return "n/a";
  if (ms === Infinity) return "never";
  const h = ms / 3600_000;
  return h >= 48 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`;
}

/**
 * The wf_job_pulse row for `event-freshness`. failed>0 when degraded, so
 * public.wf_job_health counts it dead and job-watch's existing streak rule
 * (DEAD_RUN_THRESHOLD consecutive dead runs, hourly) pages.
 */
export function freshnessPulse(c) {
  const head = c.degraded ? `DEGRADED: ${c.reasons.join("; ")}` : "fresh";
  const facts = `imminent ${c.imminent} past_sla ${c.pastSla} past_fuse ${c.pastFuse} oldest ${fmtAge(c.oldestAgeMs)} last_useful ${c.lastUseful ? c.lastUseful.ran_at.slice(0, 16) + "Z/" + fmtAge(c.usefulAgeMs) : "none"} ended_displayable ${c.endedDisplayable}`;
  return {
    attempted: 1,
    succeeded: c.degraded ? 0 : 1,
    failed: c.degraded ? 1 : 0,
    note: `${head} | ${facts}`.slice(0, 200),
  };
}

/** The wf_job_pulse row for `event-rollover`. */
export function rolloverPulse({ today, attempted, succeeded, failed, capped = false, error = null }) {
  const head = error ? `unavailable: ${error}` : `${ROLLOVER_NOTE_PREFIX} ${today}: ${succeeded}/${attempted} ended rows → completed`;
  const tail = [failed ? `${failed} failed` : null, capped ? "CAPPED (more remain, next run continues)" : null].filter(Boolean).join("; ");
  return {
    attempted: attempted | 0,
    succeeded: succeeded | 0,
    failed: (failed | 0) + (error ? 1 : 0),
    note: (tail ? `${head}; ${tail}` : head).slice(0, 200),
  };
}
