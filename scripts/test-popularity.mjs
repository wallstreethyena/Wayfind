// scripts/test-popularity.mjs — lock test for the Tier-2 popularity fetchers
// (lib/popularity.js + the cron). Pins: metrics are oriented higher=better
// and NEVER fabricated (missing field or weak match -> no row), routing by
// category, the TripAdvisor budget cap, service-only batch fn, cron auth.
import { readFileSync } from "fs";
import { nameSim, matchConfidence, bestMatch, sourcesFor, categoriesForSource, SOURCE_CAPS, CONFIDENCE_FLOOR } from "../lib/popularity.js";
import { popularityAvailability, FETCHERS, primaryTypesForSource, minReviewsForSource, FOURSQUARE_PARKED_REASON, FOURSQUARE_PARKED, fetchFoursquare } from "../lib/popularity.js";
import {
  createWikimediaFetchPolicy,
  retryAfterMs,
  WIKIMEDIA_MAX_CONCURRENCY,
  WIKIMEDIA_RETRY_FALLBACK_MS,
  WIKIMEDIA_MAXLAG,
} from "../lib/wikimediaFetchPolicy.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
ok(popularityAvailability('tripadvisor', {}).ready === false, 'retired provider does not select candidate work');
ok(popularityAvailability('tripadvisor', {}).failure === false, 'explicit retirement is disclosed, not a fake failed request');
ok(popularityAvailability('yelp', {YELP_API_KEY:'a'.repeat(127)}).failure === true, 'malformed key is a failed preflight');
ok(popularityAvailability('yelp', {YELP_API_KEY:'a'.repeat(128)}).ready === true, 'valid-shaped key reaches the provider');
ok(popularityAvailability('yelp', {}).reason === 'no_key', 'absent optional key stays explicit');
ok(popularityAvailability('foursquare', {}).ready === false, 'unconfigured Foursquare does not select work');
ok(popularityAvailability('wikipedia', {}).ready === true, 'keyless Wikimedia stays enabled');

// ── FOURSQUARE PARKED 2026-09-09 — asserted BY CALL, not by reading source ───
// Foursquare never produced a wf_place_popularity row: `popularity` is a
// Premium attribute and the Places endpoints return Pro fields, so the ~360
// calls/day (12 runs x SOURCE_CAPS.foursquare) bought nothing but 429s past the
// 500/month free allowance. Parked, deliberately NOT deleted.
ok(popularityAvailability('foursquare', { FOURSQUARE_API_KEY: 'x'.repeat(40) }).ready === false,
  'PARKED: a CONFIGURED Foursquare key still does not select work — the plan is what is missing, not the credential');
ok(popularityAvailability('foursquare', { FOURSQUARE_API_KEY: 'x'.repeat(40) }).failure === false,
  'PARKED: an intentionally parked provider is NOT a failed preflight (job-watch must stay quiet)');
ok(popularityAvailability('foursquare', {}).reason === FOURSQUARE_PARKED_REASON,
  'PARKED: the reason names the park, so an operator reading a pulse is not told "no_key" about a key that exists');
// The reason string is load-bearing: lib/jobPulse.classifyHealth escalates a
// billing:/quota: prefix to an incident on the FIRST dead run. Parking must not
// page. This asserts the ROLE (does the real classifier escalate it?), not the
// spelling — a renamed-but-still-safe reason keeps passing, a renamed-and-unsafe
// one goes red.
{
  const { classifyHealth } = await import("../lib/jobPulse.js");
  // (a) the shape the park actually produces: zeros across the board -> idle.
  const parkedRow = { job: 'popularity:foursquare', attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: FOURSQUARE_PARKED_REASON };
  const c = classifyHealth([parkedRow]);
  ok(c.incidents.length === 0 && c.idle.length === 1,
    `PARKED: the REAL classifier files a parked pulse as idle, never an incident (got ${c.incidents.length} incident(s))`);
  // (b) THE REASON STRING ITSELF. At consecutive_zero 0 no note can escalate
  // (the rule is `zero >= (deterministic ? 1 : threshold)`), so (a) alone says
  // nothing about the WORDS we chose — proven: a red-prove renaming the reason
  // to "quota: parked" left (a) green. The prefix only decides anything on a row
  // counted dead, so assert it there, where a wrong prefix pages on run one.
  const oneDeadRun = { job: 'popularity:foursquare', attempted: 0, succeeded: 0, consecutive_zero: 1, last_note: FOURSQUARE_PARKED_REASON };
  ok(classifyHealth([oneDeadRun]).incidents.length === 0,
    `PARKED: the chosen reason does NOT carry the immediate-escalation prefix — one dead run must not page (reason: ${FOURSQUARE_PARKED_REASON})`);
  // Positive control: the same row WITH a quota: prefix must escalate, or the
  // assertion above would pass for any string at all, including a broken one.
  ok(classifyHealth([{ ...oneDeadRun, last_note: 'quota: breaker_open' }]).incidents.length === 1,
    'positive control: a quota:-prefixed note on the SAME row DOES escalate, so the assertion above is a real property of the reason string');
}
// The fetcher refuses BEFORE any network call, for every caller — not only the
// cron. Proven by executing it against a fetch stub that would record a call.
{
  const savedFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...a) => { calls++; return { ok: true, status: 200, json: async () => ({ results: [] }) }; };
  // A KEY IS REQUIRED FOR THIS TEST TO MEAN ANYTHING. Without one the fetcher
  // returns null at its `no_key` line, BEFORE the network, so `calls === 0`
  // would be true whether or not the park exists. Red-prove caught exactly
  // that: deleting the park guard left this block green. Set explicitly and
  // deleted below — never read from the ambient shell (check-guard-hermeticity).
  process.env.FOURSQUARE_API_KEY = "fixture-key-not-real-parked-provider-test";
  try {
    const r = await FETCHERS.foursquare({ name: 'Anna Maria Oyster Bar', lat: 27.34, lng: -82.53 });
    ok(r === null, 'PARKED: fetchFoursquare returns null when called directly');
    ok(calls === 0, `PARKED: ...and issued ZERO network calls (got ${calls}) — parking cannot be bypassed by calling the fetcher directly`);
    // Positive control — the stub is wired and DOES count a real fetcher's call,
    // so "0 calls" above is the park working, not the stub being dead.
    await FETCHERS.wikipedia({ name: 'Siesta Beach', lat: 27.2675, lng: -82.5497 });
    ok(calls > 0, `positive control: the same stub records calls from a LIVE fetcher (got ${calls}) — the zero above is real`);
  } finally { globalThis.fetch = savedFetch; delete process.env.FOURSQUARE_API_KEY; }
}
// ── THE SWITCH WORKS IN BOTH DIRECTIONS ────────────────────────────────────
// A park is only reversible if flipping ONE thing moves BOTH layers. The first
// version of this failed that: the reason STRING was the switch, availability
// parked unconditionally without consulting it, and the fetcher gated on the
// string's truthiness — so emptying it left availability parked while the
// fetcher resumed calling the API, and deleting it threw ReferenceError. Both
// were reproduced. These assertions exist so that cannot come back.
ok(FOURSQUARE_PARKED === true, 'the switch is an explicit boolean and production ships PARKED');
{
  const KEY = { FOURSQUARE_API_KEY: 'fixture-key-not-real' };
  const netCalls = async (parked) => {
    const savedFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ results: [] }) }; };
    process.env.FOURSQUARE_API_KEY = 'fixture-key-not-real';
    try { await fetchFoursquare({ name: 'Anna Maria Oyster Bar', lat: 27.34, lng: -82.53 }, { parked }); }
    finally { globalThis.fetch = savedFetch; delete process.env.FOURSQUARE_API_KEY; }
    return calls;
  };
  // PARKED (what production runs): neither layer does anything.
  const parkedAvail = popularityAvailability('foursquare', KEY, { parked: true });
  ok(parkedAvail.ready === false && parkedAvail.reason === FOURSQUARE_PARKED_REASON,
    'SWITCH ON: the availability layer parks and names the park');
  ok((await netCalls(true)) === 0, 'SWITCH ON: the fetcher layer issues ZERO network calls');
  // ENABLED (the recovery procedure): the SAME single flag revives BOTH layers.
  const liveAvail = popularityAvailability('foursquare', KEY, { parked: false });
  ok(liveAvail.ready === true,
    `SWITCH OFF: a configured Foursquare becomes selectable again (got ${JSON.stringify(liveAvail)}) — this is the one-line recovery, proven by call`);
  ok((await netCalls(false)) === 1,
    'SWITCH OFF: the fetcher reaches its real request path — the same flag moves BOTH layers, so they can never disagree');
  // ...and un-parking must not paper over a genuinely absent key: the original
  // key-based behaviour has to survive underneath the park, or "reversible"
  // would mean "reverts to something else".
  const liveNoKey = popularityAvailability('foursquare', {}, { parked: false });
  ok(liveNoKey.ready === false && liveNoKey.reason === 'no_key' && liveNoKey.failure === false,
    `SWITCH OFF: the pre-park key check is intact underneath (got ${JSON.stringify(liveNoKey)}) — the park suspends the provider, it does not replace its logic`);
}
// DORMANT, NOT DELETED. Re-enabling must stay a one-line change, so the working
// Foursquare surfaces and the breaker wiring have to survive this park.
{
  const src = readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function fetchFoursquare"));
  const end = body.indexOf("\nexport async function fetchTripadvisor");
  const fn = end > 0 ? body.slice(0, end) : body;
  ok(/places-api\.foursquare\.com|fsqAttemptChain|fsqRequest/.test(fn),
    'DORMANT: fetchFoursquare still contains its real request path — it was parked, not gutted');
  ok(/FSQ_BREAKER/.test(src), 'DORMANT: the quota breaker wiring survives the park');
  ok(readFileSync(new URL("../app/api/fsq/search/route.js", import.meta.url), "utf8").length > 0,
    'DORMANT: /api/fsq/search (a separate, working Foursquare surface) is untouched by the popularity park');
}

// matching
ok(nameSim("Anna Maria Oyster Bar", "Anna Maria Oyster Bar Ellenton") > 0.7, "near-identical names score high");
ok(nameSim("PopStroke", "Olive Garden") < 0.2, "unrelated names score low");
const place = { name: "Siesta Beach", lat: 27.2675, lng: -82.5497 };
ok(matchConfidence(place, { name: "Siesta Beach", lat: 27.2676, lng: -82.5498 }) > 0.95, "same name + same spot ≈ 1");
ok(matchConfidence(place, { name: "Siesta Beach", lat: 27.4, lng: -82.4 }) < 0.75, "same name 10mi away loses the proximity share");
ok(matchConfidence(place, { name: "Siesta Beach", lat: null, lng: null }) <= 0.7, "no coords never scores higher than with coords");
ok(bestMatch(place, [{ name: "Turtle Beach", lat: 27.22, lng: -82.51 }]) === null, "weak best match -> null, not a bad row");
ok(CONFIDENCE_FLOOR === 0.55, "Wikipedia transport repair must not loosen the 0.55 confidence floor — throttled candidates are unobserved, not permission to tune matching");

// routing
// v8.6 — RE-POINTED, NOT RELAXED. This asserted that food NEVER routes to
// wikipedia. The intent was right — wikipedia does not cover most restaurants,
// so it must not be food's primary source and must not be allowed to look like
// coverage. The effect was not: combined with Yelp, Foursquare and TripAdvisor
// having never written a single row (measured: all 164 rows in
// wf_place_popularity are wikipedia), it made food and nightlife STRUCTURALLY
// incapable of any popularity coverage at all, which is why the trending rail
// could never fill from two of its three pools.
//
// wikipedia is now food's LAST source, never its first. It will simply miss on
// most restaurants — a miss is a null row, not a wrong one — while a landmark
// restaurant that genuinely has an article can finally be measured. The
// ordering assertion is what actually encodes the original intent, so that is
// what is asserted now.
{
  const food = sourcesFor("food");
  ok(food[0] === "yelp", "food's PRIMARY source is still yelp — wikipedia must never lead a category it barely covers");
  ok(food.indexOf("wikipedia") === food.length - 1, "…and wikipedia is food's LAST resort, not a peer of the real sources");
  ok(sourcesFor("attractions")[0] === "wikipedia", "attractions still leads with wikipedia, which genuinely covers landmarks");
}
ok(sourcesFor("beach").includes("wikipedia") && sourcesFor("attractions").includes("wikipedia"), "attractions/beaches -> wikipedia");
ok(sourcesFor("shopping").includes("foursquare"), "everything -> foursquare");
// v8.99.15 — tripadvisor retired 2026-09-06 (legacy Content API sunset
// 2026-08-31, verified live: byte-identical 403 with and without the
// v8.29.14 referer/domain headers). A retired source makes no calls, so it
// has no per-run budget left to bound — the cap's absence IS the pinned
// state now, not a regression of it.
ok(SOURCE_CAPS.tripadvisor === undefined, "tripadvisor is retired — no per-run cap for a source that makes no calls");

// v9.0 (2026-09-07) — categoriesForSource is the INVERSE of sourcesFor, and
// they must never drift apart (both live in lib/popularity.js, side by
// side). Checked for every category sourcesFor branches on, plus one
// default-arm category, against every source in FETCHERS.
{
  const CATS = ["food", "nightlife", "attractions", "beach", "shopping"]; // shopping exercises the default arm
  for (const src of Object.keys({ yelp: 1, foursquare: 1, tripadvisor: 1, wikipedia: 1 })) {
    const allowed = categoriesForSource(src);
    for (const cat of CATS) {
      const routed = sourcesFor(cat).includes(src);
      const permitted = allowed === null || allowed.includes(cat);
      ok(routed === permitted, `categoriesForSource(${src}) disagrees with sourcesFor(${cat}) — routed=${routed} permitted=${permitted}`);
    }
  }
  ok(categoriesForSource("yelp") && categoriesForSource("yelp").length === 2, "yelp is the only source restricted at all — everything else is universal (null)");
  ok(categoriesForSource("wikipedia") === null && categoriesForSource("foursquare") === null && categoriesForSource("tripadvisor") === null,
    "wikipedia/foursquare/tripadvisor are universal — present in every sourcesFor branch including the default arm");
}
// v9.0 — yelp is capped now that the stale-batch selector is per-source and
// yelp gets its OWN dedicated food/nightlife batch instead of whatever
// happened to land in the old shared one (12,290 eligible places route to
// it — an uncapped dedicated batch could reach 1,200 calls/day against the
// ~500/day free tier, the exact shape that already burned Foursquare's).
ok(SOURCE_CAPS.yelp > 0 && SOURCE_CAPS.yelp < 100, "yelp has a real per-run cap now that its batch is dedicated, not incidental");

// source contract
const lib = readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8");
ok(/besttime[\s\S]{0,200}address/i.test(lib), "besttime absence is documented (needs addresses we do not store), not silent");
ok(/ticketmaster\/predicthq — event demand/.test(lib), "event-demand sources documented as follow-ups, not faked");
ok(/typeof m\.cand\.popularity !== "number"\)\s*\{[^}]*return null/.test(lib), "foursquare popularity is used only when the API returns it (tier-gate intact through the 2026 dual-endpoint migration)");
// v8.96 — the host/header/generation rule MOVED to lib/foursquare.js so all
// three Foursquare call sites share one copy (the drift that kept /api/fsq/search
// and /api/sources/compare blind to the post-sunset 429 for four months after
// this fetcher was fixed alone in #892). The invariant is unchanged and is
// asserted in two halves: this fetcher must ROUTE THROUGH the shared rule, and
// the shared rule must reach the post-sunset host. Asserting only the string
// here would have gone green against a file that no longer makes the call.
ok(/fsqAttemptChain\(|fsqRequest\(/.test(lib) && lib.includes('from "./foursquare.js"'), "foursquare fetcher routes through the ONE shared provider rule, not a private copy");
ok(!lib.includes("api.foursquare.com/v3"), "…and no longer hardcodes the sunset v3 host");
{
  const fsq = readFileSync(new URL("../lib/foursquare.js", import.meta.url), "utf8");
  ok(fsq.includes("places-api.foursquare.com/places/search") && fsq.includes('FSQ_PLACES_API_VERSION = "2025-06-17"'), "the shared rule reaches the post-sunset Places API (legacy v3 died 2026-05-15 — the silent zero-rows root cause)");
}
ok(lib.includes("r.fsq_place_id || r.fsq_id"), "both response generations parse (fsq_place_id new, fsq_id legacy)");
// 2026-09-06 — QUOTA/BILLING BREAKER. #1118's routing fix shipped and
// production STILL measured 0 results: this exact fetcher (already immune to
// #1118's bug, since it has branched on key prefix since #892) pulsed
// http_429 on ALL ~30 calls/run for 3+ continuous days in wf_job_pulse — proof
// the CURRENT, correctly-routed Places API is itself quota/plan-exhausted, not
// merely mis-routed. See lib/foursquare.js FSQ_BREAKER for the full incident.
{
  const stripped = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(stripped.includes('from "./providerHealth.js"'), "the popularity fetcher wires the SAME shared breaker as lib/foursquare.js and app/api/events/route.js's OpenWebNinja breaker — not a private copy");
  ok(stripped.includes("FSQ_BREAKER") && stripped.includes('from "./foursquare.js"'), "…keyed by the ONE shared constant, so a typo'd literal cannot silently create a second, unrelated breaker");
  const fnStart = stripped.indexOf("export async function fetchFoursquare");
  const fnBody = stripped.slice(fnStart, stripped.indexOf("\nexport async function fetchTripadvisor"));
  const breakerCheckIdx = fnBody.indexOf("breakerOpen(FSQ_BREAKER)");
  const loopIdx = fnBody.indexOf("for (const gen of fsqAttemptChain");
  ok(breakerCheckIdx > -1 && loopIdx > -1 && breakerCheckIdx < loopIdx,
     "the breaker is checked BEFORE the fetch loop — an open breaker must cost the cron zero requests for this place, not one");
  ok(/gen === "current"[\s\S]{0,400}tripBreaker\(/.test(fnBody),
     "the trip is scoped to the CURRENT generation only — v3 is permanently gone post-sunset and its 429 proves nothing about account quota, so tripping on v3's status would arm the breaker on every legacy-key call regardless of whether the account can serve anything");
  ok(!/gen === "v3"[\s\S]{0,120}tripBreaker\(/.test(fnBody),
     "…and NEGATIVELY: v3's branch never calls tripBreaker directly");
}
ok(/export const POP_DIAG/.test(lib) && /notePop\(/.test(lib), "per-source outcome diagnostics exist — a dead source must name itself in the cron log");
const route = readFileSync(new URL("../app/api/cron/popularity/route.js", import.meta.url), "utf8");
ok(route.includes('auth !== "Bearer " + secret'), "cron is CRON_SECRET-gated");
ok(route.includes("SUPABASE_SERVICE_ROLE_KEY"), "writes go through the service role");
ok(route.includes('onConflict: "place_id,source"'), "one row per place per source (upsert)");
ok(route.includes("wf_popularity_stale_batch"), "batch = the stalest places, not a random scan");
// v9.0 — per-source batching and the attempt ledger (20260907_wf_popularity_attempt_ledger.sql)
// Execute the actual selection loop. A fixed 200-character source window
// stopped recognizing it when preflight was added; call counts prove its intent.
{
  const start = route.indexOf('  const bySourcePlaces = {}');
  const end = route.indexOf('  // flatten', start);
  ok(start >= 0 && end > start, 'real per-source selection body is present');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const select = new AsyncFunction('db','SOURCES','popularityAvailability','process','breakerOpen','FSQ_BREAKER','recordPulse','categoriesForSource','primaryTypesForSource','minReviewsForSource','BATCH','jobFailed', route.slice(start,end) + '\nreturn {bySourcePlaces,unavailable};');
  const run = async (env, held) => {
    const calls = [], pulses = [];
    const result = await select({rpc:async (fn,args)=>{calls.push({fn,args});return {data:[]};}}, Object.keys(FETCHERS), popularityAvailability, {env}, async()=>held, 'foursquare', async(job,pulse)=>pulses.push({job,...pulse}), categoriesForSource, primaryTypesForSource, minReviewsForSource, 100, ()=>{throw new Error('unexpected batch failure')});
    return {calls,pulses,result};
  };
  const configured = await run({YELP_API_KEY:'a'.repeat(128), FOURSQUARE_API_KEY:'fixture'}, null);
  // Two active sources since the 2026-09-09 Foursquare park (was three).
  // Counted, not `includes`-ed: a count cannot tell 1 from 2, and the whole
  // point of the park is that a specific source stopped selecting work.
  ok(configured.calls.length === 2 && new Set(configured.calls.map(c=>c.args.p_source)).size === 2, `each ACTIVE source gets its OWN batch (expected 2 after the Foursquare park, got ${configured.calls.length})`);
  ok(new Set(configured.calls.map(c=>c.args.p_source)).has('yelp') && new Set(configured.calls.map(c=>c.args.p_source)).has('wikipedia'), 'the two active sources are yelp and wikipedia');
  // THE PARK, ASSERTED ON THE REAL CRON BODY: a fully CONFIGURED Foursquare key
  // still selects no work and still records a non-failing pulse. This is the
  // assertion that goes red the day someone un-parks it by accident.
  ok(!configured.calls.some(c=>c.args.p_source === 'foursquare'), 'PARKED: Foursquare selects NO batch even with a configured key');
  const fsqPulse = configured.pulses.find(p=>p.job==='popularity:foursquare');
  ok(fsqPulse && fsqPulse.attempted === 0 && fsqPulse.failed === 0 && fsqPulse.note === FOURSQUARE_PARKED_REASON, `PARKED: the cron records an idle, non-failing pulse naming the park (got ${JSON.stringify(fsqPulse)})`);
  ok(configured.calls.every(c=>c.fn === 'wf_popularity_stale_batch'), 'each selected batch calls the real stale-batch RPC');
  const unavailable = await run({YELP_API_KEY:'a'.repeat(127), FOURSQUARE_API_KEY:'fixture'}, {kind:'quota'});
  ok(unavailable.calls.length === 1 && unavailable.calls[0].args.p_source === 'wikipedia', 'malformed, retired and quota-held sources select no place work');
  ok(unavailable.pulses.length === 3 && unavailable.pulses.every(p=>p.attempted === 0), 'unavailable sources record no invented provider attempts');
  ok(unavailable.pulses.find(p=>p.job==='popularity:foursquare').failed === 0, 'PARKED: even with the quota breaker HELD, the park answers first and stays a non-failing idle state — a parked provider never pages');
{
  // And the CRON body itself, not just the helper: injected with the switch off,
  // the real selection code must select Foursquare work again.
  const start = route.indexOf('  const bySourcePlaces = {}');
  const end = route.indexOf('  // flatten', start);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const select = new AsyncFunction('db','SOURCES','popularityAvailability','process','breakerOpen','FSQ_BREAKER','recordPulse','categoriesForSource','primaryTypesForSource','minReviewsForSource','BATCH','jobFailed', route.slice(start,end) + '\nreturn {bySourcePlaces,unavailable};');
  const calls = [];
  await select({rpc:async (fn,args)=>{calls.push(args.p_source);return {data:[]};}}, Object.keys(FETCHERS),
    (src, env) => popularityAvailability(src, env, { parked: false }),
    {env:{YELP_API_KEY:'a'.repeat(128), FOURSQUARE_API_KEY:'fixture'}}, async()=>null, 'foursquare',
    async()=>{}, categoriesForSource, primaryTypesForSource, minReviewsForSource, 100, ()=>{throw new Error('unexpected')});
  ok(calls.includes('foursquare') && calls.length === 3,
    `SWITCH OFF: the REAL cron selection body selects Foursquare work again (sources: ${calls.join(', ')}) — recovery is not just a helper returning true`);
}

  ok(unavailable.pulses.find(p=>p.job==='popularity:yelp').failed === 1, 'malformed key remains a visible preflight failure');
  ok(unavailable.pulses.find(p=>p.job==='popularity:tripadvisor').failed === 0, 'retirement is explicit idle state');
}

ok(route.includes("p_categories: categoriesForSource(src)"), "each source's batch is category-scoped through categoriesForSource, not a hardcoded list duplicated here");
ok(route.includes('db.rpc("wf_popularity_record_attempts"'), "THE FIX: every (place, source) pair actually tried is recorded to the attempt ledger, success or failure — a failed lookup is still an attempt");
{
  const workFnStart = route.indexOf("const work = workItems.map(");
  const backoffCheckIdx = route.indexOf('src === "wikipedia" && !wikimediaPolicy.canRequest()', workFnStart);
  const capCheckIdx = route.indexOf("if (cap != null && (spent[src] || 0) >= cap) return;", workFnStart);
  const spentIdx = route.indexOf("spent[src] = (spent[src] || 0) + 1;", workFnStart);
  const pushIdx = route.indexOf("attempts.push(", workFnStart);
  ok(workFnStart > -1 && capCheckIdx > -1 && pushIdx > -1 && capCheckIdx < pushIdx,
    "a source that hit its per-run cap this run must be SKIPPED (return) BEFORE attempts.push runs — it was never asked, so it must not look 'just tried'");
  ok(backoffCheckIdx > -1 && spentIdx > -1 && pushIdx > -1 && backoffCheckIdx < spentIdx && backoffCheckIdx < pushIdx,
    "Wikipedia Retry-After must be checked BEFORE spent++ and attempts.push — a candidate held by provider backoff was not observed and must remain eligible rather than being stamped as a negative");
}
ok(route.includes("installWikimediaFetchPolicy"), "popularity cron must install the Wikimedia transport policy before provider work starts");
ok(route.includes("skipped_rate_limit_backoff"), "rate-limit-held Wikipedia candidates must be visible in cron stats, not silently disappear");
ok(route.includes('recordPulse("popularity:" + src'), "every source records its OWN jobPulse — a dead source flatlines its pulse and job-watch emails it by name (the 3-month silent Foursquare death can never recur)");
ok(/onlyNoKey \? 0 : spent\[src\]/.test(route), "a missing key pulses idle (not configured != failing) — deliberate key removal never pages");
const vj = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok((vj.crons || []).some((c) => c.path === "/api/cron/popularity" && /\*\/[12]\b/.test(c.schedule)), "cron runs at least every 2 hours (accelerated 2026-08-08 for the post-sunset coverage rebuild)");

// v6.57: Wikimedia calls must carry the descriptive User-Agent (their API
// policy — datacenter IPs without it are rejected; the 0/50 first harvest).
{
  const lp = readFileSync(new URL("../lib/popularity.js", import.meta.url), "utf8");
  ok(lp.includes('"user-agent": "WayfindBot/1.0'), "wikipedia fetcher lost its User-Agent — prod harvests silently zero out");
  // v8.99.15 — both wikiOpensearch call sites (full-name query, then the
  // qualifier-stripped retry) now pass a diagSrc third argument too
  // (jf(url, WIKI_UA, "wikipedia")), so the literal "WIKI_UA)" this used to
  // grep for no longer appears; WIKI_UA is still the second arg to both.
  ok((lp.match(/WIKI_UA[,)]/g) || []).length >= 2, "both wikimedia calls (search + pageviews) must carry the UA");
}

// v9.2 (2026-09-07) — Wikimedia transport backoff. Production's 12:23 run
// recorded 52 HTTP 429s out of 100 Wikipedia candidates. Those are unobserved
// candidates, not a matching-quality sample. Test the transport separately so
// nobody can "fix" this later by weakening identity or confidence rules.
{
  ok(WIKIMEDIA_MAX_CONCURRENCY === 2 && WIKIMEDIA_MAX_CONCURRENCY <= 3,
    `Wikimedia wire concurrency must stay at 2 (and never exceed Wikimedia's <=3 guidance) — got ${WIKIMEDIA_MAX_CONCURRENCY}`);
  ok(WIKIMEDIA_RETRY_FALLBACK_MS >= 5000,
    `missing Retry-After must back off at least 5 seconds per Wikimedia guidance — got ${WIKIMEDIA_RETRY_FALLBACK_MS}ms`);
  ok(WIKIMEDIA_MAXLAG === 5, `background Action API reads must use maxlag=5 — got ${WIKIMEDIA_MAXLAG}`);
  ok(retryAfterMs("3", 1000) === 3000, "numeric Retry-After is seconds and must convert to milliseconds exactly");
  ok(retryAfterMs(null, 1000) === WIKIMEDIA_RETRY_FALLBACK_MS, "missing Retry-After uses the conservative fallback, not zero");
  ok(retryAfterMs(new Date(8000).toUTCString(), 3000) === 5000, "HTTP-date Retry-After is honored relative to the current clock");

  // Executed concurrency proof: six simultaneous Wikimedia callers, fake wire
  // sleeps 5ms, maximum in-flight provider requests must still be exactly two.
  let active = 0, maxActive = 0;
  const concurrencyPolicy = createWikimediaFetchPolicy(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  await Promise.all(Array.from({ length: 6 }, () => concurrencyPolicy.fetch("https://wikimedia.org/api/rest_v1/test")));
  ok(maxActive === 2, `executed limiter must never put >2 Wikimedia requests on the wire — observed max ${maxActive}`);

  // Retry-After proof with a fake clock. The second call during the window must
  // be local-only: if baseCalls becomes 2, the policy is still hammering Wikimedia.
  let clock = 1000, baseCalls = 0;
  const backoffPolicy = createWikimediaFetchPolicy(async () => {
    baseCalls++;
    return new Response("rate limited", { status: 429, headers: { "retry-after": "7" } });
  }, { now: () => clock });
  const first429 = await backoffPolicy.fetch("https://wikimedia.org/api/rest_v1/test");
  ok(first429.status === 429 && baseCalls === 1 && !backoffPolicy.canRequest() && backoffPolicy.remainingBackoffMs() === 7000,
    "real 429 must arm the exact Retry-After window after one provider call");
  const held429 = await backoffPolicy.fetch("https://wikimedia.org/api/rest_v1/test");
  ok(baseCalls === 1 && held429.status === 429 && held429.headers.get("x-wayfind-wikimedia-backoff") === "1",
    "a request arriving during active backoff must be refused locally — zero additional Wikimedia traffic");
  clock += 7000;
  ok(backoffPolicy.canRequest(), "provider window reopens after the exact Retry-After duration");

  // maxlag is HTTP-200 JSON at the Action API. It must become a transport
  // failure and arm Retry-After, otherwise downstream code sees an object and
  // can misclassify a stressed backend as no_match/no_views.
  let seenActionUrl = "";
  const maxlagPolicy = createWikimediaFetchPolicy(async (input) => {
    seenActionUrl = String(input);
    return new Response(JSON.stringify({ error: { code: "maxlag" } }), {
      status: 200,
      headers: { "content-type": "application/json", "retry-after": "3" },
    });
  }, { now: () => 1000 });
  const maxlagResponse = await maxlagPolicy.fetch("https://en.wikipedia.org/w/api.php?action=query&format=json");
  ok(seenActionUrl.includes("maxlag=5"), `Action API transport must inject maxlag=5 — got ${seenActionUrl}`);
  ok(maxlagResponse.status === 503 && !maxlagPolicy.canRequest(), "maxlag JSON must become a backoff-visible 503 and close the provider window");

  // Non-Wikimedia traffic is a strict pass-through. This is what makes it safe
  // to install the policy around the whole popularity cron without changing Yelp/FSQ.
  let passthroughCalls = 0;
  const passthrough = createWikimediaFetchPolicy(async () => { passthroughCalls++; return new Response("ok", { status: 200 }); });
  await passthrough.fetch("https://example.com/not-wikimedia");
  ok(passthroughCalls === 1 && passthrough.canRequest(), "non-Wikimedia fetches pass through once and never arm the limiter");
}

console.log(`test-popularity: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
