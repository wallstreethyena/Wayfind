// scripts/test-popularity.mjs — lock test for the Tier-2 popularity fetchers
// (lib/popularity.js + the cron). Pins: metrics are oriented higher=better
// and NEVER fabricated (missing field or weak match -> no row), routing by
// category, the TripAdvisor budget cap, service-only batch fn, cron auth.
import { readFileSync } from "fs";
import { nameSim, matchConfidence, bestMatch, sourcesFor, categoriesForSource, SOURCE_CAPS, CONFIDENCE_FLOOR } from "../lib/popularity.js";
import {
  createWikimediaFetchPolicy,
  retryAfterMs,
  WIKIMEDIA_MAX_CONCURRENCY,
  WIKIMEDIA_RETRY_FALLBACK_MS,
  WIKIMEDIA_MAXLAG,
} from "../lib/wikimediaFetchPolicy.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

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
ok(/for \(const src of SOURCES\)[\s\S]{0,200}wf_popularity_stale_batch/.test(route), "wf_popularity_stale_batch is called ONCE PER SOURCE — a single shared batch cannot correctly drive four independently-throttled sources");
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
