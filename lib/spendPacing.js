// lib/spendPacing.js — pacing forecast + early warning for monthly spend caps.
//
// WHY. October 2026 capped five rows in the first 8 days (details_enterprise
// day 1, details_pro/provider_viator day 2, anthropic_requests day 3,
// events_ticketmaster day 8). Nothing said so until a user path degraded: the
// ledger (public.wf_spend_ledger, one row per (month, sku): used, cap) is
// fail-closed by design, so a cap is only ever discovered by its consequence.
//
// THIS FILE CHANGES NO CAP, NO BUDGET, NO GATE. Free-first is an owner
// directive: degrade, never auto-raise. It only READS rows and classifies them.
//
// Pure: no I/O, no Date.now(). The clock is always passed in, so every
// boundary is testable with a fixed instant (scripts/test-spend-pacing.mjs).

/** Days left in the month at/below which a projected overrun is not "early". */
export const WARN_MIN_DAYS_LEFT = 3;
/** Fraction of cap used at/above which a row is WARN whatever its pace. */
export const WARN_USED_FRACTION = 0.8;
/** CAPPED on or before this day-of-month is an incident, not a warning. */
export const EARLY_CAP_DAY = 10;

export function daysInUtcMonth(now) {
  const d = now instanceof Date ? now : new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** { month: "YYYY-MM", dayOfMonth, daysInMonth } from an injected instant (UTC, the ledger's own month key). */
export function clockParts(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(d.getTime())) throw new Error("spendPacing: invalid clock");
  return {
    // UTC on purpose: the ledger RPC keys rows on the UTC month, to_char(now() at time zone 'utc', 'YYYY-MM').
    month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    dayOfMonth: d.getUTCDate(),
    daysInMonth: daysInUtcMonth(d),
  };
}

/**
 * Linear pacing for ONE ledger row.
 *   used/cap       integers from the ledger
 *   dayOfMonth     1-based day we are IN (elapsed days, counted inclusively: deliberately
 *                  a slight over-estimate of rate early in a day, i.e. the cautious side)
 *   daysInMonth    28..31
 * Returns { status, pctUsed, projected, projectedPct, exhaustionDay, daysLeft }.
 *   status         OK | WARN | CAPPED | INVALID
 *   projected      round(used / dayOfMonth * daysInMonth)
 *   exhaustionDay  day-of-month the cap is projected to be reached (null when the
 *                  projection stays under cap, or when already CAPPED -> the
 *                  actual day is in updated_at, not derivable here).
 *   INVALID        cap or clock unusable: surfaced loudly by the caller, never "OK".
 */
export function paceSku({ used, cap, dayOfMonth, daysInMonth }) {
  const u = Number(used), c = Number(cap), d = Number(dayOfMonth), n = Number(daysInMonth);
  if (!Number.isFinite(u) || u < 0 || !Number.isFinite(c) || c <= 0 ||
      !Number.isInteger(d) || !Number.isInteger(n) || d < 1 || n < d) {
    return { status: "INVALID", pctUsed: null, projected: null, projectedPct: null, exhaustionDay: null, daysLeft: null };
  }
  const daysLeft = n - d;
  const perDay = u / d;
  const projected = Math.round(perDay * n);
  const pctUsed = u / c;
  const out = {
    pctUsed,
    projected,
    projectedPct: projected / c,
    exhaustionDay: null,
    daysLeft,
  };
  if (u >= c) return { ...out, status: "CAPPED" };
  if (perDay > 0 && projected > c) out.exhaustionDay = Math.min(n, Math.ceil(c / perDay));
  const overrunEarly = projected > c && daysLeft > WARN_MIN_DAYS_LEFT;
  if (overrunEarly || pctUsed >= WARN_USED_FRACTION) return { ...out, status: "WARN" };
  return { ...out, status: "OK" };
}

/** Pace every ledger row of the current month. rows: [{ sku, used, cap }]. */
export function paceLedger(rows, now) {
  const clock = clockParts(now);
  const results = (rows || []).map((r) => ({
    sku: String(r.sku),
    used: Number(r.used),
    cap: Number(r.cap),
    ...paceSku({ used: r.used, cap: r.cap, dayOfMonth: clock.dayOfMonth, daysInMonth: clock.daysInMonth }),
  }));
  results.sort((a, b) => (b.pctUsed ?? -1) - (a.pctUsed ?? -1) || a.sku.localeCompare(b.sku));
  return { ...clock, results };
}

/**
 * Collapse a pacing run into one wf_job_pulse row for app/api/cron/job-watch.
 *
 *  - CAPPED on/before EARLY_CAP_DAY  -> INCIDENT. succeeded=0 and a `quota:` note
 *    (lib/jobPulse.js DETERMINISTIC_NOTE_PREFIX) so job-watch escalates on this very
 *    run: a cap exhausted in the first third of the month is a budget/pacing
 *    decision for the owner, never a transient blip.
 *  - INVALID row                      -> INCIDENT (`unavailable:`): a cap the pacing
 *    cannot read is a cap nobody is watching.
 *  - WARN, or CAPPED after day 10     -> NON-PAGING: succeeded=attempted, the note
 *    carries "warn:" so the pulse feed / owner watch shows it without an email.
 *  - otherwise                        -> ok.
 */
export function pacingPulse(report) {
  const { results, dayOfMonth } = report;
  const attempted = results.length;
  const cappedEarly = dayOfMonth <= EARLY_CAP_DAY ? results.filter((r) => r.status === "CAPPED") : [];
  const invalid = results.filter((r) => r.status === "INVALID");
  const warn = results.filter((r) => r.status === "WARN" || (r.status === "CAPPED" && dayOfMonth > EARLY_CAP_DAY));
  const names = (xs) => xs.map((r) => r.sku).join(",");
  if (invalid.length) {
    return { level: "incident", attempted, succeeded: 0, note: `unavailable: unreadable cap for ${names(invalid)}`.slice(0, 200) };
  }
  if (cappedEarly.length) {
    return {
      level: "incident", attempted, succeeded: 0,
      note: `quota: capped by day ${dayOfMonth} (<=${EARLY_CAP_DAY}): ${names(cappedEarly)}`.slice(0, 200),
    };
  }
  if (warn.length) {
    return { level: "warn", attempted, succeeded: attempted, note: `warn: ${names(warn)}`.slice(0, 200) };
  }
  return { level: "ok", attempted, succeeded: attempted, note: "ok: all caps on pace" };
}
