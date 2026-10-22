// lib/eventLinkPulse.js — how the nightly events-link-health sweep reports itself
// to wf_job_pulse (2026-10-22).
//
// THE BUG THIS REPLACES. route.js recorded `failed: counts.unknown`, so every
// probe that could not be read (Cloudflare challenge, JS-only ticket page,
// timeout, 403/429/5xx) made the run "failed". Some probes are ALWAYS
// inconclusive, so the job was red every night from 2026-10-08 on while it was
// working: 0 green / 7 red in a week, with 110-118 of 120 rows succeeding.
// A probe we could not read is not a failed unit of work (AGENTS.md: a bot wall
// is our problem, never the venue's). It is SKIPPED: left out of `attempted`,
// counted in the note, and never in `failed`.
//
// WHEN IT STILL GOES RED (the escalations that keep this honest):
//   - a persistence error (we could not write what we found)
//   - SYSTEMIC: >= SYSTEMIC_MIN_PROBES rows and >= SYSTEMIC_RATIO of them
//     inconclusive -> the probe path itself is broken (egress blocked, DNS down)
//   - STUCK: more than STUCK_RED_ROWS rows have been inconclusive for longer than
//     STUCK_DAYS -> a wall nobody is looking at has become permanent
// Real dead links never reach here as "unknown": they are bad/strike and count
// as succeeded work (the sweep did its job by finding them).
export const STUCK_DAYS = 14;
export const STUCK_RED_ROWS = 25;
export const SYSTEMIC_MIN_PROBES = 20;
export const SYSTEMIC_RATIO = 0.5;
const UNKNOWN_PREFIX = "unknown:";

/** "unknown:2026-10-08" -> "2026-10-08"; anything else -> null. */
export function unknownSince(linkVerdict) {
  const v = String(linkVerdict || "");
  if (!v.startsWith(UNKNOWN_PREFIX)) return null;
  const d = v.slice(UNKNOWN_PREFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function daysBetween(fromDay, toDay) {
  const a = Date.parse(fromDay + "T00:00:00Z"), b = Date.parse(toDay + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / 86400000) : 0;
}

/**
 * @param {{rows:number, alive:number, bad:number, strike:number, unknown:number, stuck?:number, err?:string|null}} c
 * @returns {{attempted:number, succeeded:number, failed:number, note:string|null}}
 */
export function summarizeLinkHealthPulse(c) {
  const rows = c.rows | 0, unknown = c.unknown | 0, stuck = c.stuck | 0;
  const succeeded = (c.alive | 0) + (c.bad | 0) + (c.strike | 0);
  const attempted = Math.max(0, rows - unknown); // inconclusive probes are skipped, not attempted
  if (c.err) {
    return { attempted, succeeded, failed: 1, note: `persistence error: ${c.err}`.slice(0, 200) };
  }
  const parts = [];
  if (c.bad) parts.push(`${c.bad} event link(s) darkened`);
  if (unknown) parts.push(`${unknown} link probe(s) inconclusive (skipped)`);
  if (stuck) parts.push(`${stuck} inconclusive >${STUCK_DAYS}d`);
  let failed = 0;
  if (rows >= SYSTEMIC_MIN_PROBES && unknown / rows >= SYSTEMIC_RATIO) {
    failed = unknown; parts.unshift("systemic: probes unreadable");
  } else if (stuck > STUCK_RED_ROWS) {
    failed = stuck; parts.unshift("stuck: persistent bot walls need review");
  }
  return { attempted, succeeded, failed, note: parts.join("; ").slice(0, 200) || null };
}
