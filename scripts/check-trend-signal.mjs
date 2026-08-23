// scripts/check-trend-signal.mjs — locks lib/trendSignal.js, the ONE unified
// trend signal every ranking sheet reads (owner directive 2026-08-07).
//
// What this guard protects, by EXECUTING the module (assert on the call, not
// the string — CLAUDE.md):
//   1. bounds: trendScore is always 0..1, trending is a boolean
//   2. disclosure precondition: trending === true ⇒ trendReason is non-null
//      (the +0.6 score bump is only legal when a reason can be rendered)
//   3. fail-soft: missing/garbage sources are ABSENT — no throw, no bump,
//      indistinguishable from "not trending"
//   4. integrity: NO monetized/affiliate field is an input. A paid signal in
//      the trend blend is the one thing that breaks "no paid placement."
//   5. the shared head-diversity rule mixes categories without ever
//      contradicting the governed score (ties-only promotion)
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  computeTrendSignal, nearbyEventScore, attachTrendSignals,
  TREND_THRESHOLD, TREND_SOURCE_WEIGHTS, TREND_REASONS, EVENT_NEARBY_MI,
} from "../lib/trendSignal.js";
import { diversifyHeadScoreStable } from "../lib/diversify.js";

let pass = 0;
const fail = (m) => { console.error("check-trend-signal: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// ── 1. bounds + threshold ───────────────────────────────────────────────────
ok(TREND_THRESHOLD > 0 && TREND_THRESHOLD < 1, "threshold is a real 0..1 bar");
for (const probe of [
  {}, { popularity: 0 }, { popularity: 1 }, { popularity: 0.5, nearbyEvent: 0.9 },
  { popularity: 2 }, { popularity: -3 }, { popularity: NaN }, { popularity: "hot" },
  { busyNow: 0.99, topicMomentum: 0.2 }, null, undefined, 42, "junk",
]) {
  const s = computeTrendSignal(probe);
  ok(typeof s.trendScore === "number" && s.trendScore >= 0 && s.trendScore <= 1,
    "trendScore stays 0..1 for probe " + JSON.stringify(probe));
  ok(typeof s.trending === "boolean" && Array.isArray(s.sources), "shape holds for every probe");
  // ── 2. disclosure precondition ──
  ok(!s.trending || (typeof s.trendReason === "string" && s.trendReason.length > 0),
    "trending implies a non-null human-readable trendReason");
}
ok(computeTrendSignal({ popularity: 0.95 }).trending === true, "a 0.95 foot-traffic percent-rank trends");
ok(computeTrendSignal({ popularity: 0.2 }).trending === false, "a quiet venue does not trend");
ok(computeTrendSignal({ popularity: 0.95 }).trendReason === TREND_REASONS.popularity, "the reason names the winning source");

// ── 3. fail-soft: absence is absence, never a penalty ───────────────────────
{
  const none = computeTrendSignal({});
  ok(none.trendScore === 0 && none.trending === false && none.trendReason === null && none.sources.length === 0,
    "no sources → inert result, indistinguishable from a quiet venue");
  // a HIGH single source must not be dragged down by missing ones (renormalized,
  // not zero-filled): popularity 0.9 alone must still trend.
  ok(computeTrendSignal({ popularity: 0.9 }).trending === true,
    "a missing source is ABSENT (weights renormalize) — not a hidden zero that suppresses a real signal");
}

// ── 4. no monetized input, proven BY CALL and by source ─────────────────────
{
  const clean = computeTrendSignal({ popularity: 0.7 });
  const bribed = computeTrendSignal({
    popularity: 0.7,
    affiliate: 1, commission: 1, booking_url: "https://partner.example", cpc: 99, sponsored: true, viator: 1,
  });
  ok(clean.trendScore === bribed.trendScore && clean.trending === bribed.trending,
    "monetized keys are ignored by construction — paying cannot move the trend signal");
  const src = readFileSync(path.resolve("lib/trendSignal.js"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  ok(!/affiliat|commission|sponsor|viator|booking_url|ticketUrl|AFFIL/i.test(code),
    "trendSignal.js source contains no affiliate/monetized identifier outside comments");
  ok(!/from ["']\.\/affiliates/.test(src), "trendSignal.js never imports lib/affiliates");
}

// ── event proximity: demand fields only, geo-gated ──────────────────────────
{
  const place = { lat: 27.4, lng: -82.6 };
  const big = { lat: 27.401, lng: -82.601, local_rank: 85 };
  const farAway = { lat: 28.9, lng: -81.0, local_rank: 99 };
  const noDemand = { lat: 27.4, lng: -82.6, url: "https://tix.example" };
  ok(nearbyEventScore(place, [big]) === 0.85, "local_rank 85 within " + EVENT_NEARBY_MI + "mi → 0.85");
  ok(nearbyEventScore(place, [farAway]) === null, "a distant event contributes nothing");
  ok(nearbyEventScore(place, [noDemand]) === null, "an event with no demand data contributes nothing (a URL is not demand)");
  ok(nearbyEventScore(place, "garbage") === null && nearbyEventScore(null, [big]) === null, "garbage fails soft");
  const att = nearbyEventScore(place, [{ lat: 27.4, lng: -82.6, phq_attendance: 100000 }]);
  ok(att === 1, "100k predicted attendance saturates the scale");
}

// ── attachTrendSignals: decorates in place, skips monetized rows, fails soft ─
{
  const rows = [
    { id: "a", lat: 27.4, lng: -82.6, rating: 4.7, reviews: 900 },
    { id: "tour", kind: "experience", booking_url: "x", rating: 4.8, reviews: 100 },
    null,
  ];
  const out = await attachTrendSignals(rows, { events: [{ lat: 27.4, lng: -82.6, local_rank: 90 }] });
  ok(out === rows, "returns the same array (mutating decorator)");
  ok(rows[0].trending === true && typeof rows[0].trend_reason === "string",
    "a place beside a local_rank-90 event trends, with a reason (0.9 ≥ threshold)");
  ok(!rows[1].trending && rows[1].trend_score == null,
    "experience/tour rows are NEVER decorated — the bump does not touch monetized inventory");
  const untouched = [{ id: "b", rating: 4, reviews: 10 }];
  await attachTrendSignals(untouched, { events: undefined });
  ok(untouched[0].trending == null || untouched[0].trending === false, "no signal → no trending flag");
  await attachTrendSignals(undefined, {}); // must not throw
  pass += 1;
}

// ── 5. the shared diversity rule (lib/diversify.js) ─────────────────────────
{
  // Five rows, four share a category, ALL displayed-equal — the head must mix.
  const five = [
    { id: 1, primary_type: "taco", governed_score: 92 },
    { id: 2, primary_type: "taco", governed_score: 92 },
    { id: 3, primary_type: "taco", governed_score: 92 },
    { id: 4, primary_type: "taco", governed_score: 92 },
    { id: 5, primary_type: "pizza", governed_score: 92 },
  ];
  const mixed = diversifyHeadScoreStable(five.slice());
  const headTypes = new Set(mixed.slice(0, 3).map((r) => r.primary_type));
  ok(headTypes.size >= 2, "a same-category monoculture head gets mixed when scores tie");
  ok(mixed.length === 5, "diversity never drops a row");
  // The law: variety may NEVER promote past a strictly higher governed score.
  const graded = [
    { id: 1, primary_type: "taco", governed_score: 95 },
    { id: 2, primary_type: "taco", governed_score: 94 },
    { id: 3, primary_type: "taco", governed_score: 93 },
    { id: 4, primary_type: "pizza", governed_score: 80 },
  ];
  const lawful = diversifyHeadScoreStable(graded.slice());
  for (let i = 1; i < lawful.length; i++) {
    ok((lawful[i - 1].governed_score ?? -Infinity) >= (lawful[i].governed_score ?? -Infinity),
      "diversity stays monotonic in the governed score — an 80 pizza cannot jump a 93 taco");
  }
  // Unknown categories are never displaced.
  const unk = diversifyHeadScoreStable([
    { id: 1, governed_score: 90 }, { id: 2, governed_score: 90 }, { id: 3, governed_score: 90 },
  ]);
  ok(unk.map((r) => r.id).join("") === "123", "rows with no category keep their order");
}

// ── the weights themselves stay honest ──────────────────────────────────────
// v8.42 — `corroboration` was added here DELIBERATELY, which is the point of
// this assertion existing. It qualifies as real demand data on the same terms
// as the other four: it is a count of distinct creators who went to a place and
// posted it publicly under their own names, none of them paid, none of it
// bought. The moment any creator in lib/creatorVideos.js becomes a paid
// placement, this key comes back out of the list below AND out of
// TREND_SOURCE_WEIGHTS, and app/how-wayfind-ranks/page.js has to change with it.
ok(Object.keys(TREND_SOURCE_WEIGHTS).every((k) => ["popularity", "busynow", "nearby_event", "topic", "corroboration"].includes(k)),
  "the only sources are the five real-demand ones — adding a source means updating this guard deliberately");
ok(Object.values(TREND_SOURCE_WEIGHTS).every((w) => w > 0 && w <= 1), "weights are sane");
ok(Object.keys(TREND_REASONS).sort().join() === Object.keys(TREND_SOURCE_WEIGHTS).sort().join(),
  "every source has a human-readable reason — no source can trend undisclosed");

console.log(`check-trend-signal: OK — ${pass} assertions (0..1 bounds, trending⇒reason, fail-soft absence, no monetized input, ties-only diversity)`);
