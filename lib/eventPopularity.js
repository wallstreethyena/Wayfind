// Demand-aware ordering for small, intent-specific event shelves.
//
// This deliberately does not replace frontEvents.bestFirst. That function is
// the app-wide presentation law; this helper is for callers that have already
// selected an intent (for example comedy/concerts) and want measured demand to
// decide the order when the row actually carries it.
import { eventStature } from "./frontEvents.js";

const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim() || !NUMERIC.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inRange(value, min, max) {
  const n = finiteNumber(value);
  return n != null && n >= min && n <= max ? n : null;
}

// Attendance is unbounded while the other available signals already have a
// bounded scale. A log scale preserves real headcount order without allowing a
// stadium-sized estimate to create an unbounded sort key: 10, 100, 1k, 10k and
// 100k attendees map to roughly 21, 40, 60, 80 and 100. Larger non-negative
// estimates remain 100. Negative attendance is invalid, not "unknown = zero".
function attendanceScore(value) {
  const n = finiteNumber(value);
  if (n == null || n < 0) return null;
  return Math.min(100, 20 * Math.log10(n + 1));
}

/**
 * Return the strongest locally useful demand observation carried by an event.
 * `value` is always bounded to 0..100; `rawValue`, `field`, and `provenance`
 * preserve what it means. Missing/malformed/out-of-range data returns null.
 *
 * Priority is intentionally simple and deterministic: PredictHQ local rank,
 * then its global rank, then its predicted attendance, then Wayfind's curated
 * 0..10 popularity score. We never infer popularity from an image, a ticket
 * URL, ticketed status, category, or a sold-out label.
 */
export function eventPopularitySignal(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;

  const localRank = inRange(row.local_rank, 0, 100);
  if (localRank != null) return {
    value: localRank,
    rawValue: localRank,
    field: "local_rank",
    provenance: "PredictHQ",
  };

  const rank = inRange(row.rank, 0, 100);
  if (rank != null) return {
    value: rank,
    rawValue: rank,
    field: "rank",
    provenance: "PredictHQ",
  };

  const attendance = finiteNumber(row.phq_attendance);
  const attendanceValue = attendanceScore(row.phq_attendance);
  if (attendanceValue != null) return {
    value: attendanceValue,
    rawValue: attendance,
    field: "phq_attendance",
    provenance: "PredictHQ",
  };

  const curated = inRange(row.popularity_score, 0, 10);
  if (curated != null) return {
    value: curated * 10,
    rawValue: curated,
    field: "popularity_score",
    provenance: "Wayfind curated",
  };

  return null;
}

function whenKey(row) {
  return `${String((row && row.date) || "9999")}T${String((row && row.time) || "99")}`;
}

/**
 * Sort a preselected event intent without mutating it.
 *
 * Rows with an observed demand signal lead rows whose demand is unknown; a
 * measured zero therefore remains distinct from missing data. Demand sorts
 * descending. Equal signals, and all unknown-demand rows, fall back to the
 * existing eventStature rule and then the existing soonest-first date rule.
 * Original position is the final deterministic tie-break.
 */
export function rankIntentEvents(rows, bucketOf) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index, signal: eventPopularitySignal(row) }))
    .sort((a, b) => {
      if (!!a.signal !== !!b.signal) return a.signal ? -1 : 1;
      if (a.signal && b.signal && a.signal.value !== b.signal.value) {
        return b.signal.value - a.signal.value;
      }
      const statureDelta = eventStature(b.row, bucketOf) - eventStature(a.row, bucketOf);
      if (statureDelta) return statureDelta;
      const dateDelta = whenKey(a.row).localeCompare(whenKey(b.row));
      return dateDelta || a.index - b.index;
    })
    .map(({ row }) => row);
}
