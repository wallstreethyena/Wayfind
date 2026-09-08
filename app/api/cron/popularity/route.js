export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Tier-2 popularity cron — one stale-batch selection PER SOURCE (v9.0,
// 2026-09-07; wf_popularity_stale_batch, service-role only), category-routed
// fetchers from lib/popularity, one oriented metric per source upserted into
// wf_place_popularity. wf_best_picks auto-blends via
// wf_place_popularity_scored — no ranker change. Every 2 hours (vercel.json,
// accelerated 2026-08-08 to rebuild coverage after the Foursquare v3 sunset
// left the table wikipedia-only). CRON_SECRET-gated like /api/cron/cwv.
//
// v9.0 — THE ATTEMPT LEDGER (see 20260907_wf_popularity_attempt_ledger.sql
// for the full incident). wf_popularity_stale_batch used to order by
// `min(wf_place_popularity.fetched_at)` — written on SUCCESS only — so a
// place that never once matched sorted first FOREVER and every run just
// re-failed the same head of the queue. Measured: 19,673 of 20,086 eligible
// places held no popularity row of any source; four attractions proven to
// match Wikipedia on the first real call sat at ranks ~9,917-18,782,
// unreachable behind a batch of 100. wikipedia rows/day fell 54→33→19→15→10→
// 1→1→1 as the reachable slice ran dry.
//
// The fix: wf_popularity_attempts.last_attempted_at is bumped on EVERY
// attempt this cron makes, success or failure — a failed lookup is still an
// attempt — and the selector orders by THAT (never-attempted, then
// oldest-attempted), with wf_place_popularity.fetched_at demoted to a
// third-order tie-break so a fresh failure can never impersonate fresh data.
// A repeatedly-failing place now moves to the BACK of the queue like any
// other attempt, instead of monopolising the front of it.
//
// PER SOURCE, not one shared batch: each of yelp/foursquare/tripadvisor/
// wikipedia now gets its OWN wf_popularity_stale_batch call and rotates on
// its own clock. This closes two real gaps the old shared-batch shape had —
// a SOURCE_CAPS-skipped source (foursquare, 30/run) getting silently
// stamped "attempted" when it was never asked, and a place with one working
// source masking three that have never been tried — see the migration
// comment for both in full. yelp is additionally capped (SOURCE_CAPS,
// lib/popularity.js) now that it gets a dedicated food/nightlife batch
// instead of whatever happened to land in the old shared one.
import { createClient } from "@supabase/supabase-js";
import { FETCHERS, categoriesForSource, primaryTypesForSource, minReviewsForSource, SOURCE_CAPS, CONFIDENCE_FLOOR, POP_DIAG, resetPopDiag } from "../../../../lib/popularity";
import { installWikimediaFetchPolicy } from "../../../../lib/wikimediaFetchPolicy";
import { popularityAvailability } from "../../../../lib/popularity";
import { breakerOpen } from "../../../../lib/providerHealth";
import { FSQ_BREAKER } from "../../../../lib/foursquare";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

const BATCH = 100; // per SOURCE now, not shared across all four
const PARALLEL = 5;
const SOURCES = Object.keys(FETCHERS); // ["yelp", "foursquare", "tripadvisor", "wikipedia"]

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("popularity", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const db = createClient(url, svc, { auth: { persistSession: false } });

  // Wikimedia's 2026 API limits are a provider transport concern, not a
  // matching concern. The controller wraps global fetch only for Wikimedia
  // hosts: max 2 in-flight, maxlag=5 on Action API, and Retry-After backoff.
  // Every other provider still sees the native fetch unchanged.
  const wikimediaPolicy = installWikimediaFetchPolicy();

  // one stale-batch selection PER SOURCE — see the v9.0 note above for why a
  // single shared batch cannot correctly drive four independently-throttled,
  // independently-successful sources.
  const bySourcePlaces = {};
  const uniquePlaces = new Set();
  const unavailable = {};
  for (const src of SOURCES) {
    let availability = popularityAvailability(src, process.env);
    if (src === 'foursquare' && availability.ready) {
      const held = await breakerOpen(FSQ_BREAKER);
      if (held) availability = { ready: false, failure: true, reason: `${held.kind || 'quota'}: breaker_open` };
    }
    if (!availability.ready) {
      bySourcePlaces[src] = [];
      unavailable[src] = availability.reason;
      await recordPulse('popularity:' + src, { attempted: 0, succeeded: 0, failed: availability.failure ? 1 : 0, note: availability.reason });
      continue;
    }
  }
  for (const src of SOURCES) {
    if (Object.hasOwn(unavailable, src)) continue;
    const { data, error } = await db.rpc("wf_popularity_stale_batch", {
      p_source: src,
      p_categories: categoriesForSource(src),
      p_n: BATCH,
      // v9.1 (2026-09-07) — eligibility pre-filter, wikipedia only (both
      // null/no-op for every other source): see primaryTypesForSource /
      // minReviewsForSource in lib/popularity.js for the measured evidence.
      p_primary_types: primaryTypesForSource(src),
      p_min_reviews: minReviewsForSource(src),
    });
    if (error || !Array.isArray(data)) return jobFailed("popularity", `wf_popularity_stale_batch(${src}) returned no batch`);
    bySourcePlaces[src] = data;
    for (const p of data) uniquePlaces.add(p.place_id);
  }

  // flatten to the actual (place, source) work items — a place selected only
  // because wikipedia needed it does not also get a redundant yelp call it
  // was never chosen for.
  const workItems = [];
  for (const src of SOURCES) for (const p of bySourcePlaces[src]) workItems.push({ p, src });

  const spent = {}; // per-source candidate fetches invoked this run
  resetPopDiag(); // per-run outcome tally — see lib/popularity POP_DIAG
  const stats = {
    unavailable_sources: unavailable,
    unique_places: uniquePlaces.size,
    candidates_by_source: Object.fromEntries(SOURCES.map((s) => [s, bySourcePlaces[s].length])),
    upserts: 0,
    skipped_low_confidence: 0,
    skipped_no_data: 0,
    skipped_rate_limit_backoff: 0,
    by_source: {},
  };
  const rows = [];
  // Every (place, source) pair for which the provider actually gave us a
  // completed answer path below, success or failure, lands here. A cap-skipped
  // pair or a Wikipedia pair blocked by Retry-After never reaches this array.
  // Critically, the Wikipedia candidate that RECEIVES the 429/503 is also left
  // out: a provider throttle is not an observed negative and must not move that
  // place to the back of the attempt queue.
  const attempts = [];

  // The cron has five generic workers. A fetch-level semaphore alone is not
  // enough to protect ledger truth: five Wikipedia candidates can all pass the
  // preflight before the first 429 arrives, then three can be refused locally
  // by the fetch policy but still look "attempted" to the route. Serialize the
  // Wikipedia CANDIDATE lifecycle so the moment one candidate arms Retry-After,
  // every following candidate sees the closed window before spent++ or ledger
  // work. Yelp/Foursquare/Tripadvisor remain fully parallel.
  let wikipediaCandidateTail = Promise.resolve();
  const withWikipediaCandidateSlot = async (fn) => {
    let release;
    const previous = wikipediaCandidateTail;
    wikipediaCandidateTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await fn(); }
    finally { release(); }
  };

  // Define the tasks before runOne so the long-standing source-order guard can
  // inspect the real work boundary. The callbacks execute only after runOne is
  // initialized below; this is a closure, not an early call.
  const work = workItems.map(({ p, src }) => async () => (
    src === "wikipedia"
      ? withWikipediaCandidateSlot(() => runOne(p, src))
      : runOne(p, src)
  ));

  const runOne = async (p, src) => {
    // 2026-09-07: the 12:23 run recorded http_429 x52 on Wikipedia. Once the
    // transport sees a 429/503, stop STARTING new Wikipedia candidates for the
    // Retry-After window. This check is BEFORE spent++ and attempts.push, so a
    // row held only because the provider told us to back off stays eligible for
    // a later run instead of being stamped as if Wikipedia answered it.
    if (src === "wikipedia" && !wikimediaPolicy.canRequest()) {
      stats.skipped_rate_limit_backoff++;
      return;
    }

    const cap = SOURCE_CAPS[src];
    if (cap != null && (spent[src] || 0) >= cap) return; // budget spent — untouched, no ledger write, stays eligible
    spent[src] = (spent[src] || 0) + 1;
    let out = null;
    try { out = await FETCHERS[src](p); } catch (e) { out = null; }

    // A Wikipedia 429/503 can happen at opensearch, identity-info, or pageviews.
    // In every case fetchWikipedia returns null, while the transport policy has
    // armed Retry-After. That candidate is UNOBSERVED, not "no_data": do not
    // increment no-data, do not push an attempt row, and therefore do not rotate
    // it away from the next eligible batch merely because Wikimedia throttled us.
    if (src === "wikipedia" && !out && !wikimediaPolicy.canRequest()) {
      stats.skipped_rate_limit_backoff++;
      return;
    }

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
  };

  // small rolling pool. Wikimedia candidates are serialized so ledger truth is
  // exact across Retry-After; the transport policy independently remains capped
  // at two wire requests for defense-in-depth/future call shapes. PARALLEL stays
  // 5 so provider-independent work does not get slower.
  let i = 0;
  const runners = Array.from({ length: PARALLEL }, async () => {
    while (i < work.length) { const j = i++; await work[j](); }
  });
  await Promise.all(runners);

  for (let k = 0; k < rows.length; k += 200) {
    const { error: upErr } = await db.from("wf_place_popularity").upsert(rows.slice(k, k + 200), { onConflict: "place_id,source" });
    if (!upErr) stats.upserts += Math.min(200, rows.length - k);
  }

  // Persist completed observations in bulk (200 per call, same chunking as the
  // metric upsert above). A genuine provider answer that yields no match is still
  // an attempt. A transport throttle is not — that distinction is what prevents
  // rate limiting from masquerading as matching evidence.
  let attemptWriteErrors = 0;
  for (let k = 0; k < attempts.length; k += 200) {
    const { error: attErr } = await db.rpc("wf_popularity_record_attempts", { p_attempts: attempts.slice(k, k + 200) });
    if (attErr) {
      attemptWriteErrors++;
      try { console.error(JSON.stringify({ tag: "popularity_cron_attempt_write_failed", error: attErr.message, chunk: k })); } catch (e) {}
    }
  }
  stats.attempt_write_errors = attemptWriteErrors;

  try { console.log(JSON.stringify({ tag: "popularity_cron", ...stats, outcomes: POP_DIAG, wikimedia_transport: wikimediaPolicy.state() })); } catch (e) {}
  // ── the self-healing loop's alarm (2026-08-08) ────────────────────────────
  // The trend-signal audit found Foursquare's fetcher dead for ~3 MONTHS (v3
  // API sunset) while the cron returned 200 and wikipedia's trickle kept the
  // aggregate "upserts" number nonzero — the exact atlas-build failure shape
  // jobPulse exists for, one level down: the JOB looked alive while whole
  // SOURCES were dead. So each source records its OWN pulse:
  //   attempted  = candidate fetches invoked for that source this run
  //   succeeded  = calls that produced a metric row ("ok" in POP_DIAG)
  //   note       = the dominant failure outcome (http_401, network, no_match…)
  // A source with a missing key pulses attempted:0 (idle — "not configured"
  // is a state, not a failure; envAudit doctrine), so removing a key on
  // purpose never pages anyone, while a key that stops WORKING flatlines its
  // pulse and /api/cron/job-watch emails with the source's name and reason.
  // As the site grows this scales by itself: new places enter wf_inventory,
  // each source's own wf_popularity_stale_batch feeds it never-attempted
  // places first (v9.0), and any link in that chain that stops producing
  // shows up here within DEAD_RUN_THRESHOLD runs instead of next quarter.
  for (const src of Object.keys(spent)) {
    const o = POP_DIAG[src] || {};
    const onlyNoKey = o.no_key && Object.keys(o).length === 1;
    const dominant = Object.entries(o).filter(([k]) => k !== "ok").sort((a, b) => b[1] - a[1])[0];
    await recordPulse("popularity:" + src, {
      attempted: onlyNoKey ? 0 : spent[src] || 0,
      succeeded: o.ok || 0,
      note: dominant ? dominant[0] + " x" + dominant[1] : null,
    });
  }
  return Response.json(stats, { status: 200 });
}
