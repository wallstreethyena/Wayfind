// lib/photoCoverage.js — pure, server-safe building blocks for photo
// monitoring, health/os-state reporting, and the persistent repair queue. No
// I/O, no client import, no process.env read that decides a verdict (see
// scripts/check-guard-hermeticity.mjs).
//
// THE INCIDENT THIS SUPPORTS (2026-09-08). The `photos` ledger exhausted
// 2026-09-01 and stays exhausted through September (facts.md). 15,088 of
// 19,852 active photo_refs have no cache row for their EXACT ref, and nothing
// measured what a reader actually saw. This module is the math behind that
// measurement, plus the repair queue's own bookkeeping rules:
//   - a monitor probe classification must never mistake the branded
//     fallback SVG's own redirect for a real photo (classifyProbe)
//   - a repair-queue retry must never be scheduled to run again before the
//     exhausted ledger resets, and never earlier (backoffMs / nextAttemptAt)
//   - a coverage percentage must never be fabricated from absent inputs
//     (computePhotoCoverage)
//   - an alert must fire once per real incident, not once per pulse
//     (pulseVerdict) and growth must be measured run-over-run, not
//     run-versus-total (openGrowthRatio)
//
// SAME-PLACE CACHE RECOVERY ITSELF (finding a fresh cache row under an OLDER
// photo ref for the same place) now lives entirely in lib/photoCacheRecovery.js
// (#1184, shipped in the route layer) — this module no longer duplicates any
// of that read or its identity guard. lib/photoRepair.js (the batch worker)
// imports findSamePlaceCachedPhoto from there directly.
//
// lib/photoRepair.js and scripts/photo-monitor.mjs both import this file.
// Neither of those may import lib/spendGate.js, and neither may contain the
// string "places.googleapis.com" — see scripts/test-photo-protection.mjs
// case 9.

// Backoff schedule for the repair queue, indexed by `attempts` (0-based —
// the value BEFORE this attempt runs). 1h, 4h, 1d, 3d, 7d, then capped at 7d.
const BACKOFF_STEPS_MS = [1, 4, 24, 72, 168].map((hours) => hours * 60 * 60 * 1000);
export function backoffMs(attempts) {
  const i = Math.max(0, Math.floor(Number(attempts) || 0));
  return BACKOFF_STEPS_MS[Math.min(i, BACKOFF_STEPS_MS.length - 1)];
}

// The first instant of next UTC month, 00:00:00.000Z.
export function firstOfNextMonthUTC(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

// A `spend-restricted` row can never be retried before the exhausted ledger
// resets — retrying inside the same exhausted month would just rediscover
// "still exhausted" every backoff cycle and burn a ledger read for nothing.
// Every other reason follows the ordinary backoff ladder.
export function nextAttemptAt(now, attempts, reason) {
  const t = new Date(now).getTime();
  if (reason === "spend-restricted") return firstOfNextMonthUTC(t);
  return new Date(t + backoffMs(attempts));
}

export const MAX_ATTEMPTS = 6;

const REAL_HOST_RX = /(^|\.)googleusercontent\.com$/i;
const FALLBACK_SVG_RX = /wf-photo-fallback\.svg/i;

// The full x-wayfind-photo-result vocabulary (lib/placePhotoServe.js /
// app/api/photo/route.js), for reference by anything (this file included)
// that reasons about a reason string rather than a full HTTP response:
//   cache | inventory | inventory-ref-cache | same-place-cache | google  ->
//     a real photo, one way or another (302, real host)
//   no-photo -> genuinely no photo at all for this place (302 to the branded
//     SVG, private no-store)
//   spend-denied | gate-shut | probe-no-spend | owned-miss | unconfigured
//     (#1182 / v8.56.12) -> a catalogued ref whose bytes were not served this
//     time, 404 JSON. The card's own <img> error path renders a per-title
//     monogram, never one shared branded SVG — a catalogued ref is not the
//     same thing as a genuinely photoless place. probe-no-spend is
//     deliberately distinct from spend-denied: a probe never asks the ledger
//     at all (lib/placePhotoServe.js skips authorizeSpend entirely while
//     probing), so asserting "spend-denied" here would claim a denial that
//     never happened. Both classify identically below (both a 404 carrying
//     one of these markers) — the distinction is for the REPAIR QUEUE, not
//     the reader: only lib/photoRepair.js's worker, which actually reads
//     wf_spend_ledger, gets to decide spend-restricted vs source-unavailable.
//
// The monitor's whole verdict for one probe response. Deliberately narrow:
// only a 302 to a googleusercontent.com host is "real". A 302 to the branded
// SVG is "compass" — a placeholder the reader can see is a placeholder. A 404
// carrying one of the honest-miss markers is "miss" — the client renders its
// own per-title monogram there, so it is placeholder-shaped for coverage
// purposes but structurally distinct from the shared SVG. Anything else is
// "error" — the probe could not classify the response, which is an
// operational finding, never treated as a placeholder.
const MISS_REASONS = new Set(["spend-denied", "gate-shut", "probe-no-spend", "owned-miss", "unconfigured"]);

export function classifyProbe({ status, resultHeader, location } = {}) {
  const raw = location == null ? "" : String(location);
  let pathname = raw;
  let hostname = "";
  try {
    const u = new URL(raw, "https://www.gowayfind.com");
    pathname = u.pathname;
    hostname = u.hostname;
  } catch {
    // relative/opaque value — use the raw string as the "path" to test
  }

  if (status === 302 && REAL_HOST_RX.test(hostname)) return "real";
  if (status === 302 && FALLBACK_SVG_RX.test(pathname)) return "compass";
  if (status === 404 && MISS_REASONS.has(String(resultHeader || ""))) return "miss";
  return "error";
}

// Real-photo coverage and the queue's live shape, in one place so
// scripts/os-state.mjs, app/api/health/photos and the monitor's --json output
// can never compute this three different ways. Every input is a plain count
// the caller already has (from wf_places_cache / wf_inventory / the queue) —
// this function does no I/O of its own.
// AGENTS.md §5's corollary, applied here: A ZERO HAS TWO CAUSES AND THEY GET
// OPPOSITE TREATMENT. "0 of 19,852 refs resolve to a real photo" is a product
// state; "nobody supplied exactFresh/samePlaceFresh" is a caller error, and
// rendering the second as the first publishes a confident lie on a dashboard
// whose entire purpose is that live numbers are generated, not typed
// (scripts/check-os-state.mjs). So when NEITHER coverage input is supplied,
// the three coverage fields are `null` — a caller must then say "not measured"
// rather than print a fabricated 0.0%.
function suppliedCount(v) {
  return v === undefined || v === null ? null : Math.max(0, Number(v) || 0);
}

export function computePhotoCoverage(counts = {}) {
  const activeWithRef = Math.max(0, Number(counts.activeWithRef) || 0);
  const exactFreshIn = suppliedCount(counts.exactFresh);
  const samePlaceFreshIn = suppliedCount(counts.samePlaceFresh);
  const openRows = Math.max(0, Number(counts.openRows) || 0);
  const unresolvedRows = Math.max(0, Number(counts.unresolvedRows) || 0);
  const recoveries7d = Math.max(0, Number(counts.recoveries7d) || 0);

  const measured = exactFreshIn !== null || samePlaceFreshIn !== null;
  const exactFresh = exactFreshIn === null ? 0 : exactFreshIn;
  const samePlaceFresh = samePlaceFreshIn === null ? 0 : samePlaceFreshIn;

  const realPhotos = measured ? exactFresh + samePlaceFresh : null;
  const realPhotoCoveragePct = measured && activeWithRef > 0 ? (realPhotos / activeWithRef) * 100 : (measured ? 0 : null);
  const placeholderRatePct = realPhotoCoveragePct === null ? null : 100 - realPhotoCoveragePct;

  return {
    activeWithRef,
    exactFresh,
    samePlaceFresh,
    measured,
    realPhotos,
    realPhotoCoveragePct,
    placeholderRatePct,
    openRows,
    unresolvedRows,
    recoveries7d,
  };
}

// ── The queue upsert body, as a pure function (2026-09-08, Astra review) ───
//
// TWO DEFECTS A PLAIN `Prefer: resolution=merge-duplicates` UPSERT CANNOT
// AVOID, both of which make the queue lie about its own contents:
//
//   1. `detections` never moves. A column absent from the body is left alone
//      on conflict, so every row read 1 forever — a counter that cannot count
//      is worse than no counter, because a reader believes it.
//   2. A row already marked `recovered` STAYS recovered when a probe sees the
//      compass on it again. The open count then under-reports live breakage,
//      and the run-over-run growth alert below cannot see a regression at all.
//
// So the monitor reads the existing rows first and this function decides the
// body. The status rules are deliberately asymmetric:
//   - no existing row      -> "open" (a new detection)
//   - existing "recovered" -> "open" (it broke again — this is the fix for 2)
//   - existing "retired"   -> status OMITTED. `retired` is an operator verdict
//                             ("this place will never have a photo"); a monitor
//                             must never overturn a human's decision.
//   - existing "open"/"unresolved" -> status OMITTED, left as-is. Re-opening an
//                             `unresolved` row would loop forever against the
//                             worker, which re-marks it `unresolved` on the very
//                             next drain; `unresolved` already means "still
//                             visible, still counted".
//
// first_seen_at / attempts / next_attempt_at are NEVER in the body — that is
// what preserves them across a re-detection.
export function mergeQueueUpsert(existingRows, candidates, nowIso) {
  const stamp = String(nowIso || new Date().toISOString());
  const existing = new Map();
  for (const r of Array.isArray(existingRows) ? existingRows : []) {
    if (r && r.place_id) existing.set(String(r.place_id), r);
  }
  const out = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (!c || !c.placeId) continue;
    const prior = existing.get(String(c.placeId));
    const body = {
      place_id: c.placeId,
      current_ref: c.currentRef || null,
      failure_reason: c.failureReason,
      last_seen_at: stamp,
      updated_at: stamp,
      detections: prior ? Math.max(1, Number(prior.detections) || 0) + 1 : 1,
    };
    if (!prior || prior.status === "recovered") body.status = "open";
    out.push(body);
  }
  return out;
}

// ── Run-over-run open-row growth (2026-09-08, Astra review) ────────────────
//
// The first cut compared THIS RUN'S detection count against the CURRENT open
// total (`candidates.length / previousOpen`), which is not growth at all: on a
// first run it is 1/0 -> always breach, and once the queue holds a few hundred
// rows a sampled run contributes tens, so the ratio sits near 0.02 and the
// condition can never fire again. A metric that alarms once and then never
// again is decorative, and CLAUDE.md is explicit that a wrong metric does not
// merely mismeasure — it misdirects the fix.
//
// Real growth needs the PREVIOUS run's total, which nothing persisted. The
// monitor now writes `open=<total>` into its own pulse note and reads it back
// off the last pulse, so this is a genuine run-over-run comparison. No
// baseline (first run ever, or an unparseable note) is 0 — never an alarm on
// an absent measurement.
export function parseOpenTotal(note) {
  const m = /\bopen=(\d+)\b/.exec(String(note || ""));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function openGrowthRatio(previousTotal, currentTotal) {
  const prev = previousTotal == null ? null : Number(previousTotal);
  const now = currentTotal == null ? null : Number(currentTotal);
  if (prev === null || now === null || !Number.isFinite(prev) || !Number.isFinite(now)) return 0;
  if (prev <= 0) return now > 0 ? 1 : 0;
  const growth = (now - prev) / prev;
  return growth > 0 ? growth : 0;
}

// ── Amendment A1 — the alert-dedup verdict, as a pure function ─────────────
//
// Astra's original §5c rule ("if the last pulse had the same key with
// succeeded=0, file succeeded=1") produces 0,1,0,1,... on a persisting
// incident and never raises it, because classifyHealth needs
// DEAD_RUN_THRESHOLD (2) CONSECUTIVE zero-success pulses (lib/jobPulse.js).
//
// The corrected rule: count how many of the most recent pulses, from THE
// SAME UTC day, carry the SAME incident key AND succeeded=0. If that streak
// is still under 2, file succeeded:0 (this is what BUILDS the streak that
// raises the incident). Once it reaches 2 or more, the incident has already
// been raised today — file succeeded:1 so job-watch stops paging, but keep
// filing the measured rate/count in the note so a suppressed run stays
// readable. A different UTC day means a different key (the date is baked
// into the key itself), so the streak re-arms automatically at rollover.
//
// A non-breached run always files succeeded:1 — there is no incident to
// build a streak toward.
//
// `recentPulses` is ordered NEWEST FIRST (the shape
// `?order=ran_at.desc&limit=6` returns), each `{ note, ranAt, succeeded }`.
export function pulseVerdict({ breached, key, recentPulses } = {}) {
  if (!breached) return { succeeded: 1, suppressed: false, streak: 0 };

  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  for (const p of Array.isArray(recentPulses) ? recentPulses : []) {
    const ranAt = p && p.ranAt;
    const day = typeof ranAt === "string" ? ranAt.slice(0, 10) : null;
    if (day !== today) break; // pulses are newest-first; a different day ends the streak
    const note = String((p && p.note) || "");
    const sameKey = key && note.includes("key=" + key);
    const zero = Number(p && p.succeeded) === 0;
    if (sameKey && zero) streak++;
    else break; // a gap (different key, or a success) breaks the streak
  }

  if (streak < 2) return { succeeded: 0, suppressed: false, streak };
  return { succeeded: 1, suppressed: true, streak };
}
