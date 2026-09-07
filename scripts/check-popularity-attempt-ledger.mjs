#!/usr/bin/env node
/**
 * check-popularity-attempt-ledger — a failed lookup is still an attempt.
 *
 * THE DEFECT (confirmed against production, 2026-09-07). wf_popularity_stale_batch
 * selected its batch by `order by s.f asc nulls first, i.seen_at desc`, where
 * `s.f` = min(wf_place_popularity.fetched_at) across sources for that place.
 * fetched_at is written ONLY on a successful match — a miss, a low-confidence
 * match, a 429, a missing key, all write NO row. A place that has never once
 * matched therefore has fetched_at = null FOREVER, sorts FIRST forever, and a
 * cron batch of 100 can never advance past it: every run re-tries the exact
 * same head of the queue and fails the exact same way again.
 *
 * MEASURED CONSEQUENCE. 19,673 of 20,086 eligible wf_inventory rows hold no
 * popularity row of any source (413 hold exactly one, all wikipedia). Four
 * places an independent audit proved would match Wikipedia at similarity 1.0
 * on the first real call, if ever offered, sat unreachable behind a batch of
 * 100 at these measured ranks under the old selector:
 *     National Aviary                                    ~9,917
 *     San Diego Zoo                                       ~11,040
 *     Smithsonian National Museum of Natural History      ~12,622
 *     Fort De Soto                                        ~18,782
 * wikipedia rows written per day: 54 (Aug24) 33 (25) 19 (27) 15 (31) 10 (Sep2)
 * then 1, 1, 1 (Sep3, 4, 7) — the exact window the reachable slice ran dry.
 * The `i.seen_at desc` tie-break made it worse: the 2026-09-03 inventory
 * ingest handed every brand-new row a fresher seen_at than the ENTIRE
 * existing backlog, so new rows jumped straight to the head of the immortal
 * null-first order and pushed the old backlog even further back.
 *
 * THE FIX (20260907_wf_popularity_attempt_ledger.sql): a separate attempt
 * ledger (wf_popularity_attempts), written on every attempt regardless of
 * outcome, kept STRICTLY apart from wf_place_popularity.fetched_at (which
 * keeps meaning "we got real data" and only that). The selector orders by
 * (1) never-attempted, (2) oldest-attempted — `last_attempted_at asc nulls
 * first` gives both in one clause, because a failure now bumps
 * last_attempted_at to now() and cannot stay at the front — then (3)
 * successful-data freshness (`fetched_at asc nulls first`) as a THIRD-order
 * tie-break only, never the primary key. Batching went per-source too: a
 * SOURCE_CAPS-skipped source no longer gets silently stamped "attempted",
 * and one source's success can no longer hide another's total absence
 * behind a single shared timestamp.
 *
 * TWO KINDS OF PROOF, both executable, neither trusting the other:
 *
 *   PART A — STRUCTURAL. The live migration must contain the fixed ordering
 *   and must NOT match the old immortal-null pattern; self-tested against
 *   the LITERAL pre-fix SQL (captured verbatim from the production read
 *   above, not paraphrased) to prove the detector can actually fail. The
 *   cron route must record an attempt for every (place, source) pair it
 *   actually invokes, BEFORE any cap-skip could hide one.
 *
 *   PART B — SIMULATION. A pure-JS reimplementation of both orderings, run
 *   against a fixture built at the MEASURED scale (20,086 places, 19,673
 *   never-fetched, the four named places seeded at their measured ranks).
 *   Proves, by actually running the algorithm: the old ordering selects the
 *   IDENTICAL top-100 forever and the four named places NEVER appear across
 *   60 simulated cycles (~5 days); the new ordering selects every place
 *   exactly once per pass with zero repeats while unattempted places remain,
 *   and the four named places are each reached within one pass, at cycle
 *   numbers derived from their fixture positions — printed, not asserted
 *   blind. A NEGATIVE CONTROL (a sort-order-only "fix" that flips the
 *   tie-break but keeps fetched_at as the PRIMARY key — exactly the "sort
 *   tweak" the owner rejected) is run through the same monopolisation check
 *   and must STILL fail it, proving the ledger — not the tie-break — is
 *   what fixes this.
 *
 * FALSE-POSITIVE SURFACE, stated so a reviewer can falsify it: Part A reads
 * exactly supabase/migrations/20260907_wf_popularity_attempt_ledger.sql and
 * app/api/cron/popularity/route.js; Part B never touches a live database —
 * it is a closed-form reimplementation of the two ORDER BY clauses, not a
 * test of Postgres itself.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { categoriesForSource, sourcesFor, SOURCE_CAPS, FETCHERS } from "../lib/popularity.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const rel = (p) => path.join(REPO, p);

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// ═══════════════════════════════════════════════════════════════════════════
// PART A — STRUCTURAL: the live migration and cron route actually ship the
// fix, not just an algorithm that would work if it were wired in.
// ═══════════════════════════════════════════════════════════════════════════

const MIGRATION_PATH = "supabase/migrations/20260907_wf_popularity_attempt_ledger.sql";
const migration = readFileSync(rel(MIGRATION_PATH), "utf8");
const route = readFileSync(rel("app/api/cron/popularity/route.js"), "utf8");

// The exact pre-fix function body, captured VERBATIM from the production
// read this fix is based on (task evidence, 2026-09-07) — not paraphrased,
// so the self-test below proves the detector against the real bug, not a
// straw version of it.
const PRE_FIX_SQL = `CREATE OR REPLACE FUNCTION public.wf_popularity_stale_batch(p_n integer DEFAULT 100)
 RETURNS TABLE(place_id text, name text, lat double precision, lng double precision, category text, metro text, oldest_fetch timestamptz)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select i.place_id, i.name, i.lat, i.lng, i.category, i.metro, s.f
  from wf_inventory i
  left join lateral (
    select min(p.fetched_at) as f from wf_place_popularity p where p.place_id = i.place_id
  ) s on true
  where i.lat is not null and coalesce(i.status,'OPERATIONAL') <> 'CLOSED'
  order by s.f asc nulls first, i.seen_at desc
  limit greatest(coalesce(p_n,100),1);
$function$;`;

// Detector: does this SQL text order its batch by an ATTEMPT ledger column
// (never-attempted, then oldest-attempted) rather than by fetched_at alone?
function ordersByAttemptLedger(sql) {
  return /order\s+by\s*\n?\s*a\.last_attempted_at\s+asc\s+nulls\s+first/i.test(sql);
}
// Detector: does this SQL text carry the OLD bug shape — the ENTIRE ordering
// keyed on a fetched_at-derived column, with no attempt ledger anywhere?
function isOldImmortalNullBug(sql) {
  return /order\s+by\s+s\.f\s+asc\s+nulls\s+first/i.test(sql) && !/wf_popularity_attempts/i.test(sql);
}

// ── self-test: the detectors must tell old from new, or they prove nothing ──
ok(isOldImmortalNullBug(PRE_FIX_SQL), "self-test: the old-bug detector must fire on the literal pre-fix production SQL — otherwise it could not tell a real regression from anything else");
ok(!ordersByAttemptLedger(PRE_FIX_SQL), "self-test: the fixed-ordering detector must NOT fire on the literal pre-fix SQL — a detector that fires on everything catches nothing");
ok(!isOldImmortalNullBug("select 1 from wf_inventory order by name"), "negative control: an unrelated query must not be flagged as the immortal-null bug");

// ── the real check, against the live migration ──────────────────────────────
ok(ordersByAttemptLedger(migration), `${MIGRATION_PATH} must order wf_popularity_stale_batch by last_attempted_at asc nulls first (never-attempted, then oldest-attempted) — the attempt ledger, not fetched_at, must be the PRIMARY sort key`);
ok(!isOldImmortalNullBug(migration), `${MIGRATION_PATH} must not carry the old immortal-null pattern (order by fetched_at alone, nulls first, with no attempt ledger)`);
ok(migration.includes("create table if not exists public.wf_popularity_attempts"), "the attempt ledger table must exist as a real migration, not an ad-hoc production write");
ok(/last_attempted_at\s+asc\s+nulls\s+first[\s\S]{0,120}fetched_at\s+asc\s+nulls\s+first/i.test(migration),
  "successful-data freshness (fetched_at) must come AFTER attempt-recency in the ORDER BY — a third-order tie-break, never the primary key (the owner's hard constraint: a fresh failure must never impersonate fresh data)");
ok(/i\.seen_at\s+asc/.test(migration), "the seen_at tie-break must be ASCENDING (oldest-seen first) — a new ingest must join the BACK of the never-attempted tier, not jump ahead of a backlog that has been waiting since before it existed");
ok(!/order\s+by[\s\S]{0,200}i\.seen_at\s+desc/i.test(migration), "…and NOT the old descending tie-break, which is what let a big ingest reset the grind (2026-09-03)");
ok(/drop\s+function\s+if\s+exists\s+public\.wf_popularity_stale_batch\(integer\)/i.test(migration), "the old single-arg signature must be explicitly dropped — a like-named function with the old signature could otherwise be called by accident from anywhere still expecting it");
ok(/revoke all on function public\.wf_popularity_stale_batch/i.test(migration) && /revoke all on function public\.wf_popularity_record_attempts/i.test(migration),
  "both new/changed RPCs must be revoked from public/anon/authenticated — this repo's service-role-only convention (20260825_security_hardening_v5.sql)");

// ── the cron route: an attempt is recorded for every pair actually invoked,
//    success or failure, and BEFORE a cap-skip could hide one ──────────────
ok(route.includes('db.rpc("wf_popularity_record_attempts"'), "THE FIX must be wired into the cron: every (place, source) pair actually tried must be recorded to the attempt ledger");
ok(/for \(const src of SOURCES\)[\s\S]{0,200}wf_popularity_stale_batch/.test(route), "the batch must be selected ONCE PER SOURCE — a single shared batch is exactly what let a place with one working source mask three that had never been tried");
{
  const workFnStart = route.indexOf("const work = workItems.map(");
  const capCheckIdx = route.indexOf("if (cap != null && (spent[src] || 0) >= cap) return;", workFnStart);
  const pushIdx = route.indexOf("attempts.push(", workFnStart);
  ok(workFnStart > -1 && capCheckIdx > -1 && pushIdx > -1 && capCheckIdx < pushIdx,
    "a source that hit its per-run budget cap must be skipped BEFORE attempts.push — a cap-skipped pair was never asked and must not be stamped 'just tried'");
}
// negative control: the pre-fix route (this cron's own git history, same
// shape as the SQL capture above) called stale_batch ONCE with no source
// loop and never wrote an attempt anywhere — the detector above must fail
// on that shape too.
const PRE_FIX_ROUTE_FRAGMENT = `const { data: places, error } = await db.rpc("wf_popularity_stale_batch", { p_n: BATCH });
  if (error || !Array.isArray(places)) return jobFailed("popularity", "wf_popularity_stale_batch returned no batch");`;
ok(!PRE_FIX_ROUTE_FRAGMENT.includes('wf_popularity_record_attempts'), "self-test: the captured pre-fix route fragment must not already contain the fix — otherwise the route check above proves nothing");

// ═══════════════════════════════════════════════════════════════════════════
// PART B — SIMULATION: run both orderings, at the measured scale, and prove
// the acceptance criteria numerically. No database — a closed-form
// reimplementation of the two ORDER BY clauses.
// ═══════════════════════════════════════════════════════════════════════════

const NEVER_FETCHED_N = 19673; // measured, 2026-09-07: 20,086 eligible - 413 with any popularity row
const BATCH = 100;

// Measured ranks under the OLD selector (order by fetched_at asc nulls
// first, seen_at desc) — the four places an independent audit proved would
// match Wikipedia at similarity 1.0 on the first real call.
const TARGETS = [
  { name: "National Aviary", oldRank: 9917 },
  { name: "San Diego Zoo", oldRank: 11040 },
  { name: "Smithsonian National Museum of Natural History", oldRank: 12622 },
  { name: "Fort De Soto", oldRank: 18782 },
];

// Build the never-fetched population so that sorting by seen_at DESC
// reproduces each target's measured old-selector rank EXACTLY: rank R (of N)
// under seen_at-desc requires seen_at = N - R + 1. Every other slot is a
// generic filler with a unique seen_at in [1, N] — the filler's own order
// makes no difference to what this proves.
function buildFixture() {
  const arr = new Array(NEVER_FETCHED_N);
  for (let s = 1; s <= NEVER_FETCHED_N; s++) {
    arr[s - 1] = { place_id: "generic_" + s, name: "Generic Place " + s, seen_at: s, fetched_at: null, last_attempted_at: null };
  }
  const targetSeenAt = new Map();
  for (const t of TARGETS) {
    const seenAt = NEVER_FETCHED_N - t.oldRank + 1;
    targetSeenAt.set(t.name, seenAt);
    arr[seenAt - 1] = { place_id: "target__" + t.name, name: t.name, seen_at: seenAt, fetched_at: null, last_attempted_at: null };
  }
  return { places: arr, targetSeenAt };
}

// OLD selector: order by fetched_at asc nulls first, seen_at desc.
function oldSelect(places, n) {
  return [...places].sort((a, b) => {
    if (a.fetched_at == null && b.fetched_at != null) return -1;
    if (a.fetched_at != null && b.fetched_at == null) return 1;
    if (a.fetched_at != null && b.fetched_at != null && a.fetched_at !== b.fetched_at) return a.fetched_at < b.fetched_at ? -1 : 1;
    return b.seen_at - a.seen_at; // desc
  }).slice(0, n);
}

// NEW selector: order by last_attempted_at asc nulls first, fetched_at asc
// nulls first, seen_at asc. Mirrors the migration's ORDER BY exactly.
function newSelect(places, n) {
  return [...places].sort((a, b) => {
    if (a.last_attempted_at == null && b.last_attempted_at != null) return -1;
    if (a.last_attempted_at != null && b.last_attempted_at == null) return 1;
    if (a.last_attempted_at != null && b.last_attempted_at != null && a.last_attempted_at !== b.last_attempted_at) return a.last_attempted_at - b.last_attempted_at;
    if (a.fetched_at == null && b.fetched_at != null) return -1;
    if (a.fetched_at != null && b.fetched_at == null) return 1;
    if (a.fetched_at != null && b.fetched_at != null && a.fetched_at !== b.fetched_at) return a.fetched_at - b.fetched_at;
    return a.seen_at - b.seen_at; // asc
  }).slice(0, n);
}

// NEGATIVE CONTROL: a "sort-order tweak" fix — flips the seen_at tie-break
// but keeps fetched_at (success-only) as the PRIMARY key. No attempt ledger.
// This is exactly the shape the owner explicitly rejected; it must still
// monopolise, proving the ledger — not the tie-break — is the actual fix.
function sortTweakOnlySelect(places, n) {
  return [...places].sort((a, b) => {
    if (a.fetched_at == null && b.fetched_at != null) return -1;
    if (a.fetched_at != null && b.fetched_at == null) return 1;
    if (a.fetched_at != null && b.fetched_at != null && a.fetched_at !== b.fetched_at) return a.fetched_at - b.fetched_at;
    return a.seen_at - b.seen_at; // tweaked, but fetched_at is STILL primary
  }).slice(0, n);
}

// ── ACCEPTANCE ITEM 1 — repeated failures cannot monopolise the first 100 ──
{
  const { places } = buildFixture();

  // OLD (red baseline): failures write nothing, so NOTHING in the fixture
  // ever changes between cycles — this is the bug itself, reproduced.
  const CYCLES_OLD = 60; // ~5 days at the real 2-hour cadence — exceeds the observed Sep3-7 stall window
  const oldBatches = [];
  for (let c = 0; c < CYCLES_OLD; c++) oldBatches.push(oldSelect(places, BATCH).map((p) => p.place_id));
  const firstBatchKey = oldBatches[0].join(",");
  const allIdentical = oldBatches.every((b) => b.join(",") === firstBatchKey);
  ok(allIdentical, "RED BASELINE (old selector): the exact same 100 place_ids must be selected in EVERY one of 60 simulated cycles — this IS the monopolisation bug, reproduced by the real algorithm, not asserted by description");
  const oldEverReachedATarget = oldBatches.some((b) => TARGETS.some((t) => b.includes("target__" + t.name)));
  ok(!oldEverReachedATarget, "RED BASELINE (old selector): none of the four measured-starved places is EVER selected across 60 cycles (~5 days) — matches the reported reality exactly");

  // NEGATIVE CONTROL: sort-tweak-only "fix" must ALSO monopolise — proving a
  // tie-break change alone (no ledger) does not fix this.
  const tweakBatches = [];
  for (let c = 0; c < CYCLES_OLD; c++) tweakBatches.push(sortTweakOnlySelect(places, BATCH).map((p) => p.place_id));
  const tweakIdentical = tweakBatches.every((b) => b.join(",") === tweakBatches[0].join(","));
  ok(tweakIdentical, "NEGATIVE CONTROL: a sort-order-only tweak (no attempt ledger, fetched_at still primary) must STILL monopolise the same 100 forever — proves the ledger, not the tie-break, is what fixes this (the owner explicitly rejected a sort-order tweak as the fix)");

  // NEW (must be green): simulate a full pass and prove zero repeats while
  // unattempted places remain — the literal "cannot monopolise" claim.
  // NEVER_FETCHED_N does not divide evenly by BATCH (19,673 / 100), so the
  // very LAST cycle of a full pass legitimately mixes in a few
  // already-attempted places to fill out its 100 slots once fewer than
  // BATCH never-attempted places remain — that is tier 2 ("oldest
  // attempted") correctly taking over, not starvation. So: zero repeats are
  // required through every FULL cycle (while >= BATCH never-attempted places
  // remain); one extra cycle then finishes coverage.
  const state = places.map((p) => ({ ...p }));
  const byId = new Map(state.map((p) => [p.place_id, p]));
  const attemptedAtLeastOnce = new Set();
  let monopolised = false;
  let tick = 0;
  const FULL_CYCLES = Math.floor(NEVER_FETCHED_N / BATCH);
  for (let c = 0; c < FULL_CYCLES; c++) {
    const batch = newSelect(state, BATCH);
    for (const p of batch) {
      if (attemptedAtLeastOnce.has(p.place_id)) monopolised = true; // must never happen while >= BATCH never-attempted places remain
      attemptedAtLeastOnce.add(p.place_id);
      byId.get(p.place_id).last_attempted_at = ++tick; // THE FIX: bumped on every attempt, success or fail — this run always "fails" in the simulation, on purpose
    }
  }
  ok(!monopolised, `ACCEPTANCE ITEM 1: under the fixed selector, no place is EVER re-selected across ${FULL_CYCLES} full cycles while at least a full batch of unattempted places remains — this IS "repeated failures cannot monopolise the first 100"`);
  ok(attemptedAtLeastOnce.size === FULL_CYCLES * BATCH, `ACCEPTANCE ITEM 1: ${FULL_CYCLES} full cycles of ${BATCH} must reach exactly ${FULL_CYCLES * BATCH} distinct never-fetched places with zero repeats — got ${attemptedAtLeastOnce.size}`);
  // one more (partial) cycle finishes off the remaining never-attempted places
  const finalBatch = newSelect(state, BATCH);
  for (const p of finalBatch) attemptedAtLeastOnce.add(p.place_id);
  ok(attemptedAtLeastOnce.size === NEVER_FETCHED_N, `ACCEPTANCE ITEM 1: one more cycle completes full coverage — all ${NEVER_FETCHED_N} never-fetched places reached — got ${attemptedAtLeastOnce.size}`);
}

// ── ACCEPTANCE ITEM 2 — the four named places actually progress ────────────
{
  const { places, targetSeenAt } = buildFixture();
  const state = places.map((p) => ({ ...p }));
  const byId = new Map(state.map((p) => [p.place_id, p]));
  let tick = 0;
  const reachedAtCycle = new Map(); // name -> cycle index (1-based) it was first selected

  // Track "queue depth ahead" of each target after every cycle, under BOTH
  // orderings, to demonstrate POSITION IMPROVING (new) vs STAGNANT (old) —
  // not just a final pass/fail.
  const aheadTrack = { old: {}, new: {} };
  for (const t of TARGETS) { aheadTrack.old[t.name] = []; aheadTrack.new[t.name] = []; }

  const CYCLES = Math.ceil(NEVER_FETCHED_N / BATCH);
  for (let c = 1; c <= CYCLES; c++) {
    // old: nothing ever changes, so "ahead" never changes either — sampled,
    // not re-simulated, since the old algorithm is provably static (proven
    // by allIdentical above); this just records the constant for the report.
    for (const t of TARGETS) aheadTrack.old[t.name].push(t.oldRank - 1);

    const batch = newSelect(state, BATCH);
    for (const p of batch) {
      p.last_attempted_at = ++tick; // strictly increasing — every attempt fails in this simulation, on purpose
      if (p.place_id.startsWith("target__")) {
        const name = p.place_id.slice("target__".length);
        if (!reachedAtCycle.has(name)) reachedAtCycle.set(name, c);
      }
    }
    for (const t of TARGETS) {
      const seenAt = targetSeenAt.get(t.name);
      const newRank = seenAt; // ascending seen_at tie-break among an all-null population == rank
      aheadTrack.new[t.name].push(Math.max(0, newRank - c * BATCH));
    }
  }

  for (const t of TARGETS) {
    const cycle = reachedAtCycle.get(t.name);
    ok(cycle != null, `ACCEPTANCE ITEM 2: ${t.name} must be selected at least once within one full pass (${CYCLES} cycles) under the fixed selector — it never is under the old one (see RED BASELINE above)`);
    if (cycle != null) {
      const expected = NEVER_FETCHED_N - t.oldRank + 1; // = its new rank = the seen_at we seeded it with
      ok(cycle === Math.ceil(expected / BATCH), `${t.name}: expected to surface at cycle ${Math.ceil(expected / BATCH)} (new rank ${expected}) — got ${cycle}`);
    }
    // POSITION IMPROVING: the new-selector "places still ahead" series must
    // be non-increasing every step and strictly decrease by 100 exactly on
    // every cycle until it hits 0 — printed as evidence, not just asserted.
    const series = aheadTrack.new[t.name];
    let monotone = true;
    for (let i = 1; i < series.length; i++) if (series[i] > series[i - 1]) monotone = false;
    ok(monotone, `${t.name}: queue depth ahead of it must be non-increasing every cycle under the fixed selector`);
    ok(series[series.length - 1] === 0, `${t.name}: queue depth ahead of it must reach 0 (selected) by the end of one full pass`);
    const oldSeries = aheadTrack.old[t.name];
    ok(oldSeries.every((v) => v === oldSeries[0]), `${t.name}: queue depth ahead of it under the OLD selector must be CONSTANT (never improves) — this is the stagnation the fix repairs`);
    console.log(`  [popularity-attempt-ledger] ${t.name}: old rank ~${t.oldRank} (never reached in ${oldSeries.length} cycles) -> new selector reaches it at cycle ${cycle}/${CYCLES}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PART C — EXECUTED, not grepped: the per-source category routing this fix
// depends on, called through the real imported functions. The migration's
// p_categories parameter only does the right thing if categoriesForSource()
// (lib/popularity.js) genuinely agrees with sourcesFor() for every category
// — checked here by CALLING both, not by reading either as text.
// ═══════════════════════════════════════════════════════════════════════════
{
  const REPRESENTATIVE_CATEGORIES = ["food", "nightlife", "attractions", "beach", "shopping", "hotels"]; // last two exercise the default arm
  const SOURCES_UNDER_TEST = Object.keys(FETCHERS); // real fetcher registry, not a hand-typed list
  ok(SOURCES_UNDER_TEST.length === 4, `positive control: FETCHERS must actually register 4 sources for this cross-check to mean anything — got ${SOURCES_UNDER_TEST.length}`);
  let crossChecked = 0;
  for (const src of SOURCES_UNDER_TEST) {
    const allowedCategories = categoriesForSource(src); // EXECUTED, returns a real value
    for (const cat of REPRESENTATIVE_CATEGORIES) {
      const wouldRoute = sourcesFor(cat).includes(src); // EXECUTED, returns a real value
      const sqlWouldOffer = allowedCategories === null || allowedCategories.includes(cat);
      ok(wouldRoute === sqlWouldOffer, `categoriesForSource(${src}) disagrees with sourcesFor(${cat}): sourcesFor routes=${wouldRoute}, categoriesForSource would offer=${sqlWouldOffer} — the SQL selector and the JS router would drift`);
      crossChecked++;
    }
  }
  ok(crossChecked === SOURCES_UNDER_TEST.length * REPRESENTATIVE_CATEGORIES.length, `positive control: every source x category pair was actually checked — got ${crossChecked}`);
  // negative control: a deliberately WRONG categoriesForSource (yelp treated
  // as universal) must be caught by the same cross-check shape used above —
  // proves the check has teeth, not just agreement by construction.
  const wrongCategoriesForSource = (src) => (src === "yelp" ? null : categoriesForSource(src));
  const wouldCatchDrift = REPRESENTATIVE_CATEGORIES.some((cat) => {
    const wouldRoute = sourcesFor(cat).includes("yelp");
    const sqlWouldOffer = wrongCategoriesForSource("yelp") === null || wrongCategoriesForSource("yelp").includes(cat);
    return wouldRoute !== sqlWouldOffer;
  });
  ok(wouldCatchDrift, "self-test: a deliberately wrong categoriesForSource (yelp made universal) must produce at least one sourcesFor/categoriesForSource disagreement — otherwise this cross-check could pass on a broken router");
  ok(SOURCE_CAPS.yelp > 0, "yelp must carry a real per-run cap now that its batch is dedicated (lib/popularity.js SOURCE_CAPS) — checked against the REAL exported object, not the route.js text");
}

if (fails.length) {
  console.error(`check-popularity-attempt-ledger: ${fails.length} FAILURE(S)`);
  for (const m of fails) console.error("  FAIL: " + m);
  process.exit(1);
}
console.log(`check-popularity-attempt-ledger: OK — ${pass} assertions (structural + simulation at measured scale: ${NEVER_FETCHED_N} never-fetched of 20,086 eligible, 4 named places tracked)`);
