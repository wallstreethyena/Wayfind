#!/usr/bin/env node
/**
 * check-wikimedia-backoff-ledger-truth — a Wikimedia throttle is not an
 * observed negative, and it must not read like real API traffic.
 *
 * THE INCIDENT (2026-09-07, PR #1159). wf_job_pulse, production, gbhtoehdxkzjsmmkisgu:
 *
 *   popularity:wikipedia  2026-09-07 10:23:30 UTC  attempted=100 succeeded=17 failed=83  note="http_429 x52"
 *   popularity:wikipedia  2026-09-07 12:23:26 UTC  attempted=100 succeeded=18 failed=82  note="http_429 x52"
 *
 * (both rows read live via Supabase MCP, execute_sql against wf_job_pulse —
 * not paraphrased). Wikimedia throttled more than half of every 100-candidate
 * batch, twice in a row, two hours apart. The PRE-FIX route recorded every one
 * of those 52 throttled candidates into wf_popularity_attempts as a plain
 * "no_data" outcome — confirmed live: `select last_outcome, count(*) from
 * wf_popularity_attempts where source='wikipedia' group by 1` returns
 * {ok:431, no_data:82} on the still-deployed pre-fix code, i.e. the 429s are
 * commingled into the same bucket as a genuine "Wikipedia has no article for
 * this place" miss. wf_popularity_stale_batch (see below) orders its next
 * batch by last_attempted_at, which wf_popularity_record_attempts bumps to
 * now() on every recorded row — so every one of those 52 unobserved
 * candidates was rotated to the BACK of a 19,000+ row queue for a reason that
 * has nothing to do with whether Wikipedia covers that place.
 *
 * lib/wikimediaFetchPolicy.js and app/api/cron/popularity/route.js (this PR)
 * fix the transport: arm Retry-After on 429/503, hold subsequent Wikipedia
 * candidates locally, and never call wf_popularity_record_attempts for a
 * candidate we did not get an answer for. lib/popularity.js — where matching,
 * CONFIDENCE_FLOOR and identity verification live — is untouched (verified
 * separately: `git diff origin/main...HEAD -- lib/popularity.js` is empty,
 * same git blob hash both sides). test-popularity.mjs already behaviorally
 * proves the wikimediaFetchPolicy MODULE in isolation (real concurrency cap,
 * real Retry-After honoring, real maxlag handling) and structurally greps
 * route.js for gate ordering. What neither file proves EXECUTED is the thing
 * the owner actually asked for: that route.js's own ledger-write decision,
 * driven by the real policy object, actually keeps a throttled batch out of
 * wf_popularity_attempts, and that doing so actually leaves those places
 * reachable in the very next wf_popularity_stale_batch call. That is this
 * guard's entire job — two things, executed, not asserted by description:
 *
 *   PART A — STRUCTURAL, anchored to route.js's real text, with a verbatim
 *   pre-fix negative control (captured from origin/main, not paraphrased).
 *   PART B — EXECUTED simulation of route.js's actual Wikipedia work-loop
 *   shape (verified against Part A so it cannot silently drift from the real
 *   file), driving the REAL createWikimediaFetchPolicy (imported, not
 *   reimplemented) through a fixture shaped exactly like the measured 10:23
 *   run (17 real successes, then a real 429 on the 18th call, Retry-After
 *   long enough that it never reopens inside this simulated run — one
 *   representative shape among several a real Retry-After value could
 *   produce, not a claim about the exact wire-call count a future production
 *   run will show; see the AFTER-MERGE queries in the PR report for how that
 *   gets checked against reality). Proves items 1/2/3/5 of the owner's proof
 *   bar. PART C replays the real wf_popularity_stale_batch ORDER BY (pulled
 *   live via Supabase MCP, pg_get_functiondef, 2026-09-07 — its SQL text is
 *   independently locked by check-popularity-attempt-ledger.mjs against the
 *   migration file; this guard reuses the identical shape to test the
 *   DOWNSTREAM eligibility consequence of THIS run's ledger-write decisions,
 *   not the ordering itself) to prove item 4: the candidate that received the
 *   429 — not a generic stand-in, that literal candidate — is selected again
 *   in the next batch, while the old code's version of the same candidate is
 *   buried behind unrelated filler.
 *
 * FALSE-POSITIVE SURFACE, stated so a reviewer can falsify it: this guard
 * never touches a live database or the real Wikimedia API. Part B's
 * "fetchWikipediaLike" calls policy.fetch(...) directly rather than going
 * through lib/popularity.js's jf() over process-global fetch — equivalent
 * once installWikimediaFetchPolicy() has patched global fetch (proved
 * separately in this file, PART D), without mutating process-global fetch
 * inside a guard that spawnSync's other guards in the same run-guards.mjs
 * pass. Part C's ORDER BY reimplementation is a closed-form JS mirror of the
 * live Postgres function text, not a test of Postgres itself.
 */
import { createWikimediaFetchPolicy, installWikimediaFetchPolicy } from "../lib/wikimediaFetchPolicy.js";
import { SOURCE_CAPS } from "../lib/popularity.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const rel = (p) => path.join(REPO, p);

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// Real measured production pulse, 2026-09-07 10:23:30 UTC (wf_job_pulse,
// read live via Supabase MCP — see header). This is what the CURRENT,
// still-deployed pre-fix code produces; PART B's RED baseline must reproduce
// it exactly or the simulation is not calibrated to reality.
const PRODUCTION_1023 = Object.freeze({ attempted: 100, succeeded: 17, failed: 83 });
ok(PRODUCTION_1023.succeeded + PRODUCTION_1023.failed === PRODUCTION_1023.attempted, "self-test: the recorded production numbers must be internally consistent (succeeded+failed=attempted) or they were transcribed wrong");

// ═══════════════════════════════════════════════════════════════════════════
// PART A — STRUCTURAL: the live route actually gates BOTH the places a
// throttle can be discovered (before starting a new candidate, and after a
// candidate's own fetch comes back empty during an active backoff), before
// EITHER budget accounting (spent++) or the ledger write (attempts.push).
// ═══════════════════════════════════════════════════════════════════════════

const ROUTE_PATH = "app/api/cron/popularity/route.js";
const route = readFileSync(rel(ROUTE_PATH), "utf8");

ok(route.includes("installWikimediaFetchPolicy()"), `${ROUTE_PATH} must install the Wikimedia transport policy — without it, global fetch is the unmodified native fetch and nothing in this file's proof applies`);
// route.js's own header comment discusses wf_popularity_stale_batch in prose
// well before GET() even starts — search for the real RPC CALL syntax, not
// the bare name, or an early comment mention would make this check pass
// vacuously (fail closed for the wrong reason) against the real file.
ok(route.indexOf("installWikimediaFetchPolicy()") < route.indexOf('db.rpc("wf_popularity_stale_batch"'), "the policy must be installed BEFORE the stale-batch selection / work loop, not after — installing it late would let early Wikipedia work bypass it entirely");

const workFnStart = route.indexOf("const work = workItems.map(");
const runOneStart = route.indexOf("const runOne = async (p, src)");
ok(workFnStart > -1 && runOneStart > -1, `${ROUTE_PATH} must define both the work-item mapper and runOne — shape changed, update this guard`);

// Gate 1: before a candidate is even STARTED (guards spent++ and every
// candidate queued behind an already-armed backoff).
const preFetchGateIdx = route.indexOf('src === "wikipedia" && !wikimediaPolicy.canRequest()', runOneStart);
const spentIdx = route.indexOf("spent[src] = (spent[src] || 0) + 1;", runOneStart);
const fetchCallIdx = route.indexOf("out = await FETCHERS[src](p);", runOneStart);
ok(preFetchGateIdx > -1 && spentIdx > -1 && fetchCallIdx > -1 && preFetchGateIdx < spentIdx && spentIdx < fetchCallIdx,
  "Gate 1 (pre-fetch canRequest check) must run BEFORE spent++, which must run BEFORE the provider is actually called — spent must count REAL calls only (item 5: pulse truth), and a candidate held here must never touch the ledger (item 3)");

// Gate 2: AFTER the candidate's own fetch, for the candidate that itself
// RECEIVED the 429/503 (out is null and the backoff is NOW armed) — this is
// the gate that specifically excludes the throttled candidate itself, not
// just the ones queued behind it. Must appear a SECOND time, after the fetch
// call and before attempts.push.
const pushIdx = route.indexOf("attempts.push(", runOneStart);
const postFetchGateIdx = route.indexOf('src === "wikipedia" && !out && !wikimediaPolicy.canRequest()', fetchCallIdx);
ok(postFetchGateIdx > -1 && postFetchGateIdx > fetchCallIdx && postFetchGateIdx < pushIdx,
  "Gate 2 (post-fetch canRequest check, keyed on !out) must run AFTER the fetch and BEFORE attempts.push — this is what keeps the candidate that received the ACTUAL 429/503 out of the ledger, not merely the ones behind it (item 3's strongest case, and the one a single pre-fetch-only gate would miss)");
ok(pushIdx > spentIdx, "attempts.push must come after spent++ in source order — sanity check that the indices above are measuring the same function body");

// Serialization: a fetch-level concurrency cap alone cannot guarantee ledger
// truth (five workers can all pass Gate 1 before the first 429 lands) — the
// route must serialize the WIKIPEDIA CANDIDATE lifecycle itself, and must
// NOT serialize the other three (fully-parallel) sources.
ok(route.includes("withWikipediaCandidateSlot"), "the route must serialize Wikipedia candidates one-at-a-time through their own lifecycle — a semaphore on the wire alone lets multiple candidates pass Gate 1 before the first 429 arrives");
ok(/src === "wikipedia"\s*\n?\s*\?\s*withWikipediaCandidateSlot/.test(route), "only wikipedia work items must route through the serialization slot — yelp/foursquare/tripadvisor must stay fully parallel (this guard's PART B relies on wikipedia executing in strict array order because of this)");

// Pulse truth (item 5): attempted must be spent[src], the real-call counter
// gated by Gate 1 above — not candidates_by_source (the batch SIZE, which
// includes every held-back candidate) and not workItems.length.
ok(/attempted:\s*onlyNoKey\s*\?\s*0\s*:\s*spent\[src\]\s*\|\|\s*0/.test(route), "recordPulse's attempted field must read spent[src] (real calls made, gated by Gate 1) — reading candidates_by_source or workItems.length here would silently reintroduce the exact 'attempted=100' lie item 5 forbids");
ok(!/attempted:\s*candidates_by_source/.test(route), "negative control: attempted must never be wired to candidates_by_source (the batch size, not the call count)");

// ── self-test: verbatim pre-fix negative control ────────────────────────────
// Captured from origin/main (git show origin/main:app/api/cron/popularity/route.js)
// at the commit this PR branched from — not paraphrased. The detectors above
// must find NEITHER gate in this fragment, or they prove nothing.
const PRE_FIX_WORK_FRAGMENT = `const work = workItems.map(({ p, src }) => async () => {
    const cap = SOURCE_CAPS[src];
    if (cap != null && (spent[src] || 0) >= cap) return; // budget spent — untouched, no ledger write, stays eligible
    spent[src] = (spent[src] || 0) + 1;
    let out = null;
    try { out = await FETCHERS[src](p); } catch (e) { out = null; }
    let outcome;
    if (!out || out.metric_value == null) {
      stats.skipped_no_data++;
      outcome = "no_data";
    } else if (!(out.match_confidence >= CONFIDENCE_FLOOR)) {
      stats.skipped_low_confidence++;
      outcome = "low_confidence";
    } else {
      outcome = "ok";
      rows.push({
        place_id: p.place_id,
        source: src,
        metric_value: out.metric_value,
        raw: out.raw || null,
        external_id: out.external_id || null,
        match_confidence: out.match_confidence,
        fetched_at: new Date().toISOString(),
      });
      stats.by_source[src] = (stats.by_source[src] || 0) + 1;
    }
    attempts.push({ place_id: p.place_id, source: src, outcome });
  });`;
ok(!PRE_FIX_WORK_FRAGMENT.includes("wikimediaPolicy.canRequest"), "self-test: the captured pre-fix fragment must not already contain either gate — otherwise the checks above prove nothing about this PR");
ok(!PRE_FIX_WORK_FRAGMENT.includes("withWikipediaCandidateSlot"), "self-test: the captured pre-fix fragment must not already contain the serialization wrapper");
// And the fragment must reproduce exactly what production measured: every
// null `out` — 429 or genuine miss alike — becomes outcome "no_data", pushed.
ok(/if \(!out \|\| out\.metric_value == null\) \{\s*stats\.skipped_no_data\+\+;\s*outcome = "no_data";/.test(PRE_FIX_WORK_FRAGMENT),
  "self-test: the pre-fix fragment must show a 429 collapsing into the SAME 'no_data' outcome as a genuine miss — this is the exact commingling item 3 forbids, and it is what production actually did (wf_popularity_attempts: {ok:431, no_data:82} today)");

ok(SOURCE_CAPS.wikipedia == null, "positive control (EXECUTED against the real export): wikipedia must carry no SOURCE_CAPS entry, or a cap could truncate the batch before this guard's 18th/100th-candidate math means anything");

// ═══════════════════════════════════════════════════════════════════════════
// PART B — EXECUTED: route.js's real Wikipedia work-loop shape (locked by
// PART A above), driving the REAL createWikimediaFetchPolicy — imported, not
// reimplemented — through a 100-candidate fixture shaped like the measured
// 10:23 run. Because of the serialization PART A just verified, Wikipedia
// candidates execute strictly in array order, one at a time — a plain
// sequential loop over 100 candidates is what route.js actually does for
// Wikipedia, not a simplification of it.
// ═══════════════════════════════════════════════════════════════════════════

function make100WikipediaCandidates() {
  return Array.from({ length: 100 }, (_, i) => ({ place_id: `wiki_${i + 1}`, seen_at: i + 1 }));
}

// The real jf() (lib/popularity.js) treats any !response.ok as null. Calling
// fetchFn(url) directly is equivalent to jf()'s fetch(url) call — with
// fetchFn being either the RAW native fetch (pre-fix: nothing intercepts
// Wikimedia calls) or policy.fetch (post-fix, once installWikimediaFetchPolicy()
// has patched global fetch — see PART D for the proof that install step
// itself does that correctly).
async function fetchWikipediaLike(fetchFn) {
  const r = await fetchFn("https://en.wikipedia.org/w/api.php?action=query&format=json");
  if (!r.ok) return null;
  return { metric_value: 1, match_confidence: 0.9 };
}

// PRE-FIX shape — route.js's real work function (PART A's PRE_FIX_WORK_FRAGMENT)
// reproduced as an executable loop: no gates, every candidate started, every
// result (success or null) pushed to the ledger. Takes the RAW base fetch —
// production before this PR never installed any policy, so nothing between
// jf() and the wire is backoff-aware; every candidate is a real request.
async function runOldRoute(candidates, rawFetch) {
  const attempts = [];
  let spent = 0;
  for (const p of candidates) {
    spent++;
    const out = await fetchWikipediaLike(rawFetch);
    const outcome = out ? "ok" : "no_data";
    attempts.push({ place_id: p.place_id, outcome });
  }
  return { attempts, spent };
}

// FIXED shape — route.js's real Gate 1 / Gate 2, in the order PART A verified.
// Takes the INSTALLED policy: both the route's own gates AND the policy's
// internal local-refusal layer (defense-in-depth) are in play, exactly as in
// production once installWikimediaFetchPolicy() has run.
async function runFixedRoute(candidates, policy) {
  const attempts = [];
  let spent = 0, skippedBackoff = 0;
  for (const p of candidates) {
    if (!policy.canRequest()) { skippedBackoff++; continue; } // Gate 1
    spent++;
    const out = await fetchWikipediaLike(policy.fetch);
    if (!out && !policy.canRequest()) { skippedBackoff++; continue; } // Gate 2
    const outcome = out ? "ok" : "no_data";
    attempts.push({ place_id: p.place_id, outcome });
  }
  return { attempts, spent, skippedBackoff };
}

// Wire fixture: candidates 1-17 succeed (200), candidate 18 gets a real 429
// with a long Retry-After — matching the measured shape (succeeded=17,
// first failure onward is throttle) closely enough to test the mechanism,
// without claiming to predict a future run's exact wire-call count (see the
// file header). baseFetch is the raw wire — used directly by the OLD
// simulation, and wrapped in the REAL policy for the FIXED one. A fresh pair
// is built per run below so the two simulations cannot leak state into
// each other, and each RESETS its own call counter.
function makeFixture() {
  let baseCalls = 0;
  const baseFetch = async () => {
    baseCalls++;
    if (baseCalls <= 17) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    return new Response("rate limited", { status: 429, headers: { "retry-after": "600" } }); // long enough to stay armed for the rest of this simulated run
  };
  return { baseFetch, policy: createWikimediaFetchPolicy(baseFetch), baseCalls: () => baseCalls };
}

const candidates = make100WikipediaCandidates();

// ── RED baseline: the pre-fix shape must reproduce the measured 10:23 pulse ──
// Uses baseFetch DIRECTLY — production before this PR had no policy between
// jf() and the wire, so every one of the 100 candidates was a real request.
let oldResult;
{
  const { baseFetch, baseCalls } = makeFixture();
  oldResult = await runOldRoute(candidates, baseFetch);
  ok(oldResult.spent === PRODUCTION_1023.attempted, `RED BASELINE: pre-fix spent (pulse "attempted") must equal the measured production value ${PRODUCTION_1023.attempted} — got ${oldResult.spent}. If this fails, the fixture is not calibrated to the real incident.`);
  ok(baseCalls() === PRODUCTION_1023.attempted, `RED BASELINE: pre-fix code puts one real Wikimedia wire call on the network for EVERY candidate, throttled or not — ${PRODUCTION_1023.attempted} candidates in, ${PRODUCTION_1023.attempted} real requests out. This is the "continuing to hammer" item 2 forbids, reproduced by execution.`);
  const oldSucceeded = oldResult.attempts.filter((a) => a.outcome === "ok").length;
  ok(oldSucceeded === PRODUCTION_1023.succeeded, `RED BASELINE: pre-fix succeeded count must equal the measured ${PRODUCTION_1023.succeeded} — got ${oldSucceeded}`);
  ok(oldResult.attempts.length === PRODUCTION_1023.attempted, `RED BASELINE: pre-fix ledger write count must equal ${PRODUCTION_1023.attempted} — EVERY candidate, including all 83 that never got a real answer, is stamped into wf_popularity_attempts. This is today's live production bug (wf_popularity_attempts: {ok:431, no_data:82}), reproduced by execution, not asserted by description.`);
  ok(oldResult.attempts.some((a) => a.place_id === "wiki_18" && a.outcome === "no_data"), "RED BASELINE: candidate 18 — the one that received the ACTUAL 429 — is stamped as a plain no_data attempt under the pre-fix shape, indistinguishable from a genuine Wikipedia miss");
}

// ── GREEN: the fixed shape must keep the throttled 83 out of the ledger ────
// Uses the REAL policy — production after this PR runs every Wikipedia
// candidate through installWikimediaFetchPolicy()'s controller.
let fixedResult;
{
  const { policy, baseCalls } = makeFixture();
  fixedResult = await runFixedRoute(candidates, policy);
  ok(fixedResult.spent === 18, `ITEMS 1/2/5: fixed spent (pulse "attempted") must be 18 — the 17 real successes plus the one candidate that actually made contact with Wikimedia and got throttled — got ${fixedResult.spent}. NOT 100: a value of 100 here would mean the pulse is lying about how many real calls were made.`);
  ok(baseCalls() === 18, `ITEM 2: real Wikimedia wire traffic must collapse to 18 requests for this 100-candidate batch (was ${PRODUCTION_1023.attempted} pre-fix) — got ${baseCalls()}. This is "subsequent candidates held locally instead of continuing to hammer Wikimedia", measured as an 82% cut in real requests, not asserted.`);
  ok(fixedResult.skippedBackoff === 83, `ITEM 2/3: exactly 83 candidates (18 through 100 — the one that received the real 429, plus the 82 behind it) must be held by Gate 1/Gate 2 — got ${fixedResult.skippedBackoff}`);
  ok(fixedResult.attempts.length === 17, `ITEM 3: the ledger must record exactly 17 attempts — the 17 real successes. None of the 83 held candidates (including candidate 18, which received the actual 429) may appear — got ${fixedResult.attempts.length}`);
  ok(fixedResult.attempts.every((a) => a.outcome === "ok"), "ITEM 3: every recorded attempt under the fixed shape must be a genuine success — zero throttle-caused 'no_data' rows should ever reach wf_popularity_attempts");
  ok(!fixedResult.attempts.some((a) => a.place_id === "wiki_18"), "ITEM 3 (the strongest case): candidate 18 — the literal candidate that received the 429 — must NOT appear in the ledger at all, success or failure. A provider throttle is not an observed negative.");
  for (let n = 19; n <= 100; n++) ok(!fixedResult.attempts.some((a) => a.place_id === `wiki_${n}`), `ITEM 3: held candidate wiki_${n} must not appear in the ledger`);
}

// ── negative control on the pulse formula itself ────────────────────────────
{
  const wrongAttempted = candidates.length; // what "attempted: candidates_by_source[src]" would report
  ok(wrongAttempted !== fixedResult.spent, `self-test: candidates_by_source (${wrongAttempted}) must disagree with the real call count (${fixedResult.spent}) in this fixture, or this guard could not tell a truthful pulse formula from a lying one`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART C — ITEM 4: replay the real wf_popularity_stale_batch ORDER BY (pulled
// live from production via Supabase MCP, pg_get_functiondef, 2026-09-07:
//   order by a.last_attempted_at asc nulls first,
//            p.fetched_at asc nulls first,
//            i.seen_at asc
// — its correspondence to the migration file is independently locked by
// check-popularity-attempt-ledger.mjs) against the two ledger states PART B
// just produced, to prove the candidate that received the throttle is
// selectable again, not buried.
// ═══════════════════════════════════════════════════════════════════════════

function nextBatch(pool, n) {
  return [...pool].sort((a, b) => {
    if (a.last_attempted_at == null && b.last_attempted_at != null) return -1;
    if (a.last_attempted_at != null && b.last_attempted_at == null) return 1;
    if (a.last_attempted_at != null && b.last_attempted_at != null && a.last_attempted_at !== b.last_attempted_at) return a.last_attempted_at - b.last_attempted_at;
    if (a.fetched_at == null && b.fetched_at != null) return -1;
    if (a.fetched_at != null && b.fetched_at == null) return 1;
    if (a.fetched_at != null && b.fetched_at != null && a.fetched_at !== b.fetched_at) return a.fetched_at - b.fetched_at;
    return a.seen_at - b.seen_at;
  }).slice(0, n);
}

// wf_popularity_record_attempts bumps last_attempted_at to now() for EVERY
// row it is handed — only rows in `attempts` get bumped; everything else
// (including a candidate never offered to it) keeps its prior value (null,
// for a wikipedia place never before attempted — the realistic case for a
// starved queue: see check-popularity-attempt-ledger.mjs's 19,673-of-20,086
// measurement).
function applyAttempts(candidates, attempts, now) {
  const attempted = new Set(attempts.map((a) => a.place_id));
  return candidates.map((c) => ({ ...c, last_attempted_at: attempted.has(c.place_id) ? now : null, fetched_at: null }));
}

const FILLER_N = 50; // stand-in for "the rest of the 19,000+ row queue" — a
// batch this small forces a real ordering competition instead of trivially
// including everything.
const filler = Array.from({ length: FILLER_N }, (_, i) => ({ place_id: `filler_${i + 1}`, seen_at: 1000 + i, last_attempted_at: null, fetched_at: null }));
const NEXT_BATCH_N = 50;

{
  const oldPool = [...applyAttempts(candidates, oldResult.attempts, 1), ...filler];
  const oldNext = nextBatch(oldPool, NEXT_BATCH_N);
  ok(oldNext.every((p) => p.place_id.startsWith("filler_")), "PRE-FIX (RED BASELINE): the very next batch must be composed ENTIRELY of unrelated filler — every one of the 100 just-attempted wikipedia candidates (including #18, throttled) was stamped with a fresh last_attempted_at and is now buried behind places that were never touched at all. Reproduced by executing the real ORDER BY, not asserted.");
  ok(!oldNext.some((p) => p.place_id === "wiki_18"), "PRE-FIX (RED BASELINE): candidate 18 specifically must NOT appear in the next batch — this is the burial item 4 forbids, shown to actually happen under the old shape");

  const newPool = [...applyAttempts(candidates, fixedResult.attempts, 1), ...filler];
  const newNext = nextBatch(newPool, NEXT_BATCH_N);
  ok(newNext.some((p) => p.place_id === "wiki_18"), "ITEM 4: candidate 18 — the literal candidate that received the 429 — MUST be selectable in the very next wf_popularity_stale_batch call. Its last_attempted_at was never bumped, so it sorts with the never-attempted tier instead of the back of the queue.");
  const heldStillNull = newNext.filter((p) => /^wiki_(1[89]|[2-9]\d|100)$/.test(p.place_id));
  ok(heldStillNull.length === NEXT_BATCH_N, `ITEM 4: the next batch should be filled entirely from the 83 held-back candidates (18-100) before reaching for filler or the 17 already-answered ones — got ${heldStillNull.length}/${NEXT_BATCH_N} from the held set`);
  ok(!newNext.some((p) => /^wiki_(1[0-7]|[1-9])$/.test(p.place_id)), "ITEM 4: none of the 17 candidates that WERE genuinely answered this run should crowd out an unanswered one in the very next batch — a real success is correctly deprioritized behind unobserved candidates, exactly like the general ledger fix this PR builds on");
  ok(!newNext.some((p) => p.place_id.startsWith("filler_")), "ITEM 4: with 83 held candidates outnumbering a 50-slot batch, filler should not be needed at all this cycle — if it appears, some held candidate is being skipped that should not be");
}

// ═══════════════════════════════════════════════════════════════════════════
// PART D — installWikimediaFetchPolicy() itself. PART B tested the POLICY
// (createWikimediaFetchPolicy) and the ROUTE's use of it in isolation; this
// is the one thing route.js actually calls in production
// (`const wikimediaPolicy = installWikimediaFetchPolicy();`), and until now
// nothing in this repo executed it — route.js's structural check (PART A)
// only proves the TEXT calls it, not that the function correctly patches
// global fetch, is idempotent, or leaves non-Wikimedia traffic alone.
// Restores globalThis.fetch afterward — a guard mutating process-global fetch
// permanently would be a false-positive risk for any guard that runs later in
// the same process (run-guards.mjs currently spawnSync's every guard as its
// own process, so this is defensive, not currently load-bearing).
// ═══════════════════════════════════════════════════════════════════════════
{
  const nativeFetch = globalThis.fetch;
  let nativeCalls = 0;
  globalThis.fetch = async (input, init) => { nativeCalls++; return new Response("native", { status: 200 }); };
  const preInstallFetch = globalThis.fetch;
  try {
    const installed1 = installWikimediaFetchPolicy();
    ok(globalThis.fetch !== preInstallFetch, "installWikimediaFetchPolicy() must replace globalThis.fetch — otherwise jf() in lib/popularity.js keeps calling the native fetch and none of this PR's transport policy ever runs in production");
    ok(typeof installed1.canRequest === "function" && typeof installed1.fetch === "function", "installWikimediaFetchPolicy() must return the real controller (canRequest/fetch), not just install a side effect — route.js reads wikimediaPolicy.canRequest() directly");

    const installed2 = installWikimediaFetchPolicy();
    ok(installed2 === installed1, "installWikimediaFetchPolicy() must be idempotent (same controller instance) — a warm serverless invocation calling it again must not stack a second wrapper around the first and double-queue every request");

    await globalThis.fetch("https://example.com/not-wikimedia");
    ok(nativeCalls === 1, "a non-Wikimedia URL through the INSTALLED global fetch must reach the real underlying fetch exactly once — this is what makes it safe to install the policy for the whole cron run without touching Yelp/Foursquare/TripAdvisor (item 6: matching/other-source behavior byte-for-byte unchanged)");
  } finally {
    globalThis.fetch = nativeFetch;
    // Also clear the module's install cache so a later guard process (or a
    // future re-run in the same process) gets a clean install against the
    // restored native fetch rather than silently reusing a controller that
    // wraps a fetch this block just discarded.
    delete globalThis[Symbol.for("wayfind.wikimedia-fetch-policy.v1")];
  }
  ok(globalThis.fetch === nativeFetch, "cleanup: globalThis.fetch must be exactly the pre-test native fetch after this block — a guard must not leak global state");
}

if (fails.length) {
  console.error(`check-wikimedia-backoff-ledger-truth: ${fails.length} FAILURE(S)`);
  for (const m of fails) console.error("  FAIL: " + m);
  process.exit(1);
}
console.log(`check-wikimedia-backoff-ledger-truth: OK — ${pass} assertions (calibrated to the measured 2026-09-07 10:23 UTC production run: 100 attempted, 17 succeeded, http_429 x52 — real wire calls collapse 100→18, ledger writes collapse 100→17, and the throttled candidate is proven selectable again in the very next batch)`);
