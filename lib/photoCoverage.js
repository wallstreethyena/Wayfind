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

// The first instant of next UTC month, 00:00:00.000Z. NO LONGER ON ANY
// SCHEDULING PATH (2026-09-09 — see the incident note at nextAttemptAt
// below). Kept exported for reporting/back-compat only: nothing in this
// lane calls it to produce a next_attempt_at any more.
export function firstOfNextMonthUTC(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

// THE INCIDENT THIS FIXES (measured in production, 2026-09-09). This
// function used to give a `spend-restricted` row next_attempt_at =
// firstOfNextMonthUTC(now) — a CALENDAR date, on the theory that the only
// way the ledger regains headroom is the monthly reset. That theory broke
// the same day it shipped: the owner raised the photos cap intraday
// (lib/spendGate.js's photosPaidCap), and 173 rows classified while the
// ledger was exhausted stayed pinned to 2026-10-01T00:00:00Z for three
// weeks after headroom actually reopened. Budget is a LIVE fact, checked
// against wf_spend_ledger fresh on every drain (lib/photoRepair.js), never
// a date baked in at classification time — so NO status may route through
// firstOfNextMonthUTC here, ever again. `reason` is accepted for call-site
// stability (every existing caller still passes one) but no longer changes
// the schedule: every reason follows the same ordinary backoff ladder. A
// row the ledger has genuinely exhausted does not get a shorter wait than
// backoff would give it anyway — it gets taken out of the backoff queue
// entirely, onto wf_photo_repair_queue.status = 'budget_blocked', which
// lib/photoRepair.js's fetchDueRows polls independently of next_attempt_at
// whenever headroom > 0. This function's contract is now unconditional:
// nextAttemptAt(now, n, ANYTHING) never exceeds now + backoffMs(n).
export function nextAttemptAt(now, attempts, reason) {
  const t = new Date(now).getTime();
  return new Date(t + backoffMs(attempts));
}

export const MAX_ATTEMPTS = 6;

// PHOTOS_OPERATING_FREE_CAP / PHOTOS_GOOGLE_FREE_LINE — the same two numbers
// lib/spendGate.js's CAPS.photos comment names: "photos 950/1000" (950 is
// Wayfind's own operating ceiling, ~5% under Google's published free-tier
// line of 1000, "so drift can never bill"). Duplicated here as plain
// literals rather than imported — this module stays I/O-free per its file
// header, and neither lib/photoRepair.js nor scripts/photo-monitor.mjs (both
// of which import THIS file) may import lib/spendGate.js at all
// (scripts/test-photo-protection.mjs case 5). The two 950s cannot silently
// drift apart because case 5b in that same test file reads BOTH files'
// source and asserts the literal is identical in each — a structural pin,
// not a runtime dependency.
export const PHOTOS_OPERATING_FREE_CAP = 950;
export const PHOTOS_GOOGLE_FREE_LINE = 1000;

// allowanceFromLedger — pure translation from a raw wf_spend_ledger row
// ({used, cap}) into the shape lib/photoRepair.js's headroom check and any
// future operator-facing report both want, computed exactly once so neither
// has to re-derive "what phase are we in" from raw numbers.
//
// AGENTS.md §5's corollary, applied here: a ZERO has two causes and they get
// OPPOSITE treatment. used=0/cap=0 (or any other pair of real numbers) is a
// MEASURED fact and gets full numeric output, including a real 0. An
// unreadable ledger (missing row, a non-numeric field, a failed fetch the
// caller could not complete) is an OPERATOR-VISIBLE unknown, not a silent
// 0 — every numeric field is `null`, and phase is "unknown". This is what
// makes the symmetric fail-closed rule in lib/photoRepair.js possible to
// state precisely: "unknown never blocks AND never releases" reads directly
// off `phase === "unknown"`, never off a fabricated headroom of 0.
//
// phase:
//   "unknown"   — used/cap could not be read as real numbers.
//   "exhausted" — used >= cap. headroom is 0 (measured, not a guess) — the
//                 ONLY value that may block a row in lib/photoRepair.js.
//   "paid"      — cap > PHOTOS_OPERATING_FREE_CAP and used has crossed the
//                 950-line into the paid ceiling the owner raised (#1186).
//   "free"      — used has not yet reached the 950 operating line.
// nearPaid — true only while still in "free" phase and within the same ~5%
// margin CAPS.photos itself reserves under Google's real free line (a
// judgment call, not a tuned threshold, same shape as
// isSampleDegraded's 10%) — an early warning that this month is about to
// cross into paid territory, before it actually does.
// `Number(null) === 0` and `Number([]) === 0` — both finite, both "valid"
// to a bare Number.isFinite check, and both would silently turn an
// UNMEASURED field into a MEASURED zero if allowanceFromLedger coerced
// first and validated second. isMeasured rejects null/undefined/boolean/
// object BEFORE coercion so an absent or malformed ledger field can never
// pass as a real 0 — the exact failure mode this module's header comment
// (and AGENTS.md §5's corollary) exists to name.
function isMeasured(v) {
  if (v === null || v === undefined || typeof v === "boolean" || typeof v === "object") return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

export function allowanceFromLedger({ used, cap } = {}) {
  const readable = isMeasured(used) && isMeasured(cap);
  if (!readable) {
    return {
      used: null,
      cap: null,
      headroom: null,
      googleFreeLine: PHOTOS_GOOGLE_FREE_LINE,
      freeLineRemaining: null,
      operatingFreeCap: PHOTOS_OPERATING_FREE_CAP,
      phase: "unknown",
      nearPaid: null,
    };
  }
  const u = Number(used);
  const c = Number(cap);
  const headroom = Math.max(0, c - u);
  const freeLineRemaining = Math.max(0, PHOTOS_GOOGLE_FREE_LINE - u);
  const phase = u >= c ? "exhausted" : u >= PHOTOS_OPERATING_FREE_CAP ? "paid" : "free";
  const nearPaidMargin = PHOTOS_OPERATING_FREE_CAP * 0.05;
  const nearPaid = phase === "free" && PHOTOS_OPERATING_FREE_CAP - u <= nearPaidMargin;
  return {
    used: u,
    cap: c,
    headroom,
    googleFreeLine: PHOTOS_GOOGLE_FREE_LINE,
    freeLineRemaining,
    operatingFreeCap: PHOTOS_OPERATING_FREE_CAP,
    phase,
    nearPaid,
  };
}

// #1188 (2026-09-09) added upload.wikimedia.org: the FREE, PERMANENT photo
// lane (lib/freePhoto.js, wf_place_photo) redirects there, not to Google, and
// a probe that classified it as anything other than "real" would page the
// owner over a photo that is loading correctly — the exact false-alarm shape
// this module exists to prevent. Same reasoning lib/placePhotoServe's
// isOwnedPhotoUrl already uses: a Commons photo of a specific, verified place
// is place-owned, not a shared stock pool.
const REAL_HOST_RX = /(^|\.)(?:googleusercontent\.com|upload\.wikimedia\.org)$/i;
const FALLBACK_SVG_RX = /wf-photo-fallback\.svg/i;

// The full x-wayfind-photo-result vocabulary (lib/placePhotoServe.js /
// app/api/photo/route.js), for reference by anything (this file included)
// that reasons about a reason string rather than a full HTTP response:
//   cache | inventory | inventory-ref-cache | same-place-cache | owned-free |
//     google -> a real photo, one way or another (302, real host — Google's
//     googleusercontent.com for every reason except owned-free, which is
//     upload.wikimedia.org, wf_place_photo's free PERMANENT lane)
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
// only a 302 to a googleusercontent.com OR upload.wikimedia.org host is
// "real". A 302 to the branded
// SVG is "compass" — a placeholder the reader can see is a placeholder. A 404
// carrying one of the honest-miss markers is "miss" — the client renders its
// own per-title monogram there, so it is placeholder-shaped for coverage
// purposes but structurally distinct from the shared SVG. Anything else is
// "error" — the probe could not classify the response, which is an
// operational finding, never treated as a placeholder.
//
// "rate-limited" (2026-09-09) — a 429 from the SAME origin's own per-IP rate
// limit (lib/apiGuard.js's RL_LIMIT), tripped by the monitor's own probe
// traffic, not by anything about the place. It is a THIRD thing, distinct
// from both "the reader saw a real photo" and "the reader saw a
// placeholder": the probe learned nothing about this place at all. Treated
// like "error" for placeholderRate (excluded from the numerator) but tracked
// in its own bucket so a run that got throttled is visibly different from a
// run that genuinely measured a high placeholder rate — see
// isSampleDegraded/computeBreach below.
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
  if (status === 429) return "rate-limited";
  return "error";
}

// A run where too many probes were rate-limited by our OWN per-IP limit
// (lib/apiGuard.js) has not actually measured the placeholder rate — it
// measured how much of its own traffic got throttled. 10% is a judgment
// call, not a tuned threshold: enough slack for a handful of unlucky 429s
// (which already got one retry each — see scripts/photo-monitor.mjs) to not
// flip a healthy run, while still catching a run where the rate limit bit
// hard enough that the sample is not trustworthy. Pure so it is testable
// without a live rate limiter.
export function isSampleDegraded(rateLimitedCount, sampled) {
  const total = Number(sampled) || 0;
  if (total <= 0) return false;
  return (Number(rateLimitedCount) || 0) / total > 0.1;
}

// The monitor's breach verdict, as a pure function — so scripts/photo-monitor.mjs's
// main() and this test suite compute the SAME answer from the same inputs,
// and the degraded-run rule ("an under-sampled run must not page" on
// placeholder rate) is provable without running the real network sweep.
// Growth is NOT suppressed by a degraded sample: openGrowth comes from the
// queue's own accumulated state (wf_photo_repair_queue), not from this run's
// probe reliability, so a genuinely growing backlog still pages even when
// this run's placeholder-rate reading cannot be trusted.
export function computeBreach({ placeholderRate, placeholderThreshold, openGrowth, openGrowthThreshold, sampleDegraded } = {}) {
  const placeholderBreach = !sampleDegraded && Number(placeholderRate) > Number(placeholderThreshold);
  const growthBreach = Number(openGrowth) >= Number(openGrowthThreshold);
  return placeholderBreach || growthBreach;
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
//   - existing "budget_blocked" (2026-09-09) -> status OMITTED, same rule as
//                             retired/unresolved: a monitor probe re-detecting
//                             the compass on an already-blocked row is not new
//                             information about WHY it is blocked, and only
//                             lib/photoRepair.js's own ledger read may move a
//                             row off budget_blocked (into "open" on release,
//                             never touched by this function at all).
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
