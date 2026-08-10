#!/usr/bin/env node
// scripts/test-trend-order.mjs — ranking integrity, public language, and the
// candidate lifecycle. The three places where this feature could damage trust.

import { trendOrderBoost, applyTrendOrdering, MAX_BOOST, MIN_CONFIDENCE } from "../lib/trendOrder.js";
import { CADENCES } from "../lib/trendRights.js";
import { trendLabel, trendDisclosure, forecastDisclosure, listTrendSummary, BANNED_TREND_PHRASES, LABEL_FORMS } from "../lib/trendDisclosure.js";
import { STATES, FAILURE_STATES, canTransition, cardReadyGate, reconcileCandidate, isFailureState } from "../lib/trendCandidates.js";
import { scrubTrendProps, ALLOWED_PROPS, FORBIDDEN_PROPS, TREND_EVENTS, SUCCESS_METRICS } from "../lib/trendTelemetry.js";

let pass = 0;
const fail = (m) => { console.error("test-trend-order: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const weekly = CADENCES.weekly, now = Date.now(), DAY = 86400000;
const full = {
  normalizedTrendStrength: 1, semanticConfidence: 1,
  observedAtMs: now, nowMs: now, cadenceCfg: weekly,
};

// ── The bound ──────────────────────────────────────────────────────────────
const max = trendOrderBoost(full);
ok(max.boost === MAX_BOOST, `every factor at 1 yields exactly MAX_BOOST (${MAX_BOOST}), got ${max.boost}`);
ok(MAX_BOOST <= 6, "the trend term is no larger than TRENDING_BONUS (6), the score-feeding signal it must stay smaller than");
ok(MAX_BOOST < 15, "…and well under CURATED_BONUS (15)");
// Nothing can exceed the bound, whatever is thrown at it.
for (const s of [0.1, 0.5, 0.99, 1]) {
  for (const c of [0.6, 0.8, 1]) {
    for (const age of [0, 1, 3, 7]) {
      const b = trendOrderBoost({ ...full, normalizedTrendStrength: s, semanticConfidence: c, observedAtMs: now - age * DAY });
      ok(b.boost >= 0 && b.boost <= MAX_BOOST, `boost stays within [0, ${MAX_BOOST}] (s=${s} c=${c} age=${age}d) — got ${b.boost}`);
    }
  }
}
// Out-of-range inputs are REFUSED, not clamped: a strength of 3 is an upstream
// bug, and clamping it silently would hide a strength function that had broken.
// ("1" is deliberately absent: a numeric string coerces cleanly and IS in range,
// so refusing it would be the guard inventing a rule the code does not need.)
for (const bad of [1.5, -0.1, NaN, null, undefined, Infinity, "abc", {}]) {
  const b = trendOrderBoost({ ...full, normalizedTrendStrength: bad });
  ok(b.boost === 0, `an out-of-range strength (${String(bad)}) yields ZERO, not a clamped value`);
  ok(/not in 0\.\.1|zero/.test(b.reason), "…and says why");
}

// ── Multiplicative: any zero factor zeroes the term ────────────────────────
ok(trendOrderBoost({ ...full, normalizedTrendStrength: 0 }).boost === 0, "zero strength ⇒ zero boost");
ok(trendOrderBoost({ ...full, semanticConfidence: 0 }).boost === 0, "zero confidence ⇒ zero boost");
ok(trendOrderBoost({ ...full, observedAtMs: now - 9 * DAY }).boost === 0, "a stale snapshot ⇒ zero boost");
// Two weak factors must not SUM into a real boost.
const weak = trendOrderBoost({ ...full, normalizedTrendStrength: 0.1, semanticConfidence: 0.61, observedAtMs: now - 7 * DAY });
ok(weak.boost < 0.1, `two weak factors multiply to near-nothing (${weak.boost.toFixed(4)}), they never add`);

// ── Product gates ──────────────────────────────────────────────────────────
ok(trendOrderBoost({ ...full, shadow: true }).boost > 0, "shadow evaluation computes the same bounded term");
ok(trendOrderBoost({ ...full, shadow: true }).shadow === true, "…and is flagged shadow");
ok(trendOrderBoost({ ...full, semanticConfidence: MIN_CONFIDENCE - 0.01 }).boost === 0, "confidence below the floor ⇒ zero");
ok(trendOrderBoost({ ...full, semanticConfidence: MIN_CONFIDENCE }).boost > 0, "confidence exactly at the floor is permitted");
ok(trendOrderBoost({ ...full, manualState: "deny" }).boost === 0, "an owner denial outranks every computed factor");

// ── The derivation is auditable ────────────────────────────────────────────
const mid = trendOrderBoost({ ...full, normalizedTrendStrength: 0.5, semanticConfidence: 0.8, observedAtMs: now - 2 * DAY });
ok(mid.factors.strength === 0.5 && mid.factors.confidence === 0.8, "the boost reports its own factors");
ok(Math.abs(mid.boost - MAX_BOOST * 0.5 * 0.8 * mid.factors.freshness) < 1e-9, "the reported factors reproduce the reported boost exactly");
ok(/×/.test(mid.reason), "the reason shows the arithmetic, so a movement can be explained afterwards");

// ── NO AFFILIATE / PAID TERM CAN ENTER ─────────────────────────────────────
// Proven by CALLING with commercial fields present and asserting nothing moves.
const bribed = trendOrderBoost({ ...full, commission: 500, payout: 1000, affiliate: true, partnerPriority: 99, paidPlacement: true, cpc: 12 });
ok(bribed.boost === max.boost, "commission/payout/affiliate/paid-placement fields cannot change the boost — they are not read");
ok(Object.keys(mid.factors).length === 3, "the term has exactly three factors: strength, confidence, freshness");

// ── Order-only: the displayed score is neither input nor output ────────────
const rows = [
  { place_id: "a", name: "Strong", wfScore: 92, trendy: false },
  { place_id: "b", name: "Rising", wfScore: 88, trendy: true },
  { place_id: "c", name: "Weak", wfScore: 55, trendy: true },
];
const snapshot = JSON.parse(JSON.stringify(rows));
const boostFor = (r) => (r.trendy ? trendOrderBoost(full) : { boost: 0, reason: "no match" });
const res = applyTrendOrdering(rows, (r) => r.wfScore, boostFor);
ok(JSON.stringify(rows) === JSON.stringify(snapshot), "applyTrendOrdering does NOT mutate the caller's rows");
ok(rows.every((r, i) => r.wfScore === snapshot[i].wfScore), "…and no displayed score changed");
ok(res.report.every((r) => Number.isFinite(r.baselineRank) && Number.isFinite(r.adjustedRank)), "the report carries baseline AND adjusted rank for every row");
ok(res.report.every((r) => r.movement === r.baselineRank - r.adjustedRank), "movement is baseline − adjusted, consistently");

// A WEAK PLACE CANNOT OUTRANK A CLEARLY STRONGER ONE. 92 vs 55 is a 37-point
// gap; the term is 4. This is the property MAX_BOOST exists to guarantee.
const strongFirst = res.report.find((r) => r.name === "Strong").adjustedRank;
ok(strongFirst < res.report.find((r) => r.name === "Weak").adjustedRank,
  "a maximally-boosted weak place (55) still ranks below a strong unboosted one (92)");
ok(res.report.find((r) => r.name === "Rising").adjustedRank === 2, "a near-tie is where the term actually acts");

// With no matches at all, the order is exactly the baseline.
const none = applyTrendOrdering(rows, (r) => r.wfScore, () => ({ boost: 0, reason: "no match" }));
ok(none.report.every((r) => r.movement === 0), "with no trend match, the baseline order is unchanged");
// …and a stale snapshot restores the baseline too.
const staleRes = applyTrendOrdering(rows, (r) => r.wfScore, (r) => (r.trendy ? trendOrderBoost({ ...full, observedAtMs: now - 30 * DAY }) : { boost: 0 }));
ok(staleRes.report.every((r) => r.movement === 0), "a stale snapshot restores the exact baseline order");

// ── Public language ────────────────────────────────────────────────────────
const activeMatch = { active: true, stale: false, topic: "Korean coffee", placeCount: 1 };
ok(trendLabel(activeMatch) === "Rising topic · Korean coffee", "the approved label form renders");
ok(trendLabel(activeMatch, { form: "matches" }) === "Matches rising interest · Korean coffee", "the second approved form renders");
ok(trendLabel({ ...activeMatch, stale: true }) === null, "a STALE snapshot removes the label");
ok(trendLabel({ ...activeMatch, active: false }) === null, "an inactive match renders no label");

// The banned claims — each must be unrenderable, and the ban list must work.
const BANNED_SAMPLES = [
  "This place is trending", "Trending near you", "People in your city are searching for this",
  "Everyone is talking about this", "This venue is up 190%", "More locals are looking for this",
];
for (const s of BANNED_SAMPLES) {
  ok(BANNED_TREND_PHRASES.some((re) => re.test(s)), `the ban list catches "${s}"`);
}
// The approved forms must NOT trip the ban list (a guard that fires on correct
// output is worse than no guard).
for (const f of Object.values(LABEL_FORMS)) {
  ok(!BANNED_TREND_PHRASES.some((re) => re.test(f("Korean coffee"))), "an approved label form does not trip the ban list");
}
// A hostile topic name cannot smuggle a banned claim through the label.
ok(trendLabel({ ...activeMatch, topic: "trending near you" }) === null,
  "a topic string that would produce a banned claim renders NO label");

// ── Metric disclosure is all-or-nothing ────────────────────────────────────
const detail = { topic: "Korean coffee", growth: 1.9, window: "12 months", volume: 12100, scope: "United States", observedAt: "2026-08-04", conceptKey: "korean_coffee" };
const disc = trendDisclosure(detail);
ok(disc && /190%/.test(disc.text), "the disclosure states the growth");
ok(/12 months/.test(disc.text), "…the exact timeframe");
ok(/12,100/.test(disc.text), "…the monthly volume");
ok(/not a measurement of local demand/.test(disc.text), "…and that it is not a measurement of local demand");
ok(/not a measurement of this place/.test(disc.text), "…nor of this place — the sentence that keeps it honest");
// A growth percentage without its timeframe or volume is not a disclosure.
for (const missing of ["window", "volume", "growth", "topic", "scope", "observedAt"]) {
  const partial = { ...detail }; delete partial[missing];
  ok(trendDisclosure(partial) === null,
    `a disclosure missing "${missing}" renders NOTHING — there is no partial path that could leak a bare percentage`);
}
// Forecast is a SEPARATE function with SEPARATE wording.
const fc = forecastDisclosure({ topic: "Korean coffee", forecastGrowth: 2.4 });
ok(fc && fc.isForecast === true && /Forecast \(not observed\)/.test(fc.text), "a forecast is labelled a forecast");
ok(!/increased/.test(fc.text), "a forecast never uses the observed-growth wording");
ok(!disc.text.includes("Forecast"), "an observed disclosure never mentions a forecast");

// A topic with no eligible local match must not appear in the list summary.
ok(listTrendSummary([{ ...activeMatch, placeCount: 0 }]) === null,
  "a topic with zero matched places is NOT shown — being in the CSV is not being 'near you'");
ok(/Korean coffee/.test(listTrendSummary([activeMatch])), "a topic WITH a match is shown");

// ── Candidate lifecycle ────────────────────────────────────────────────────
ok(STATES[0] === "discovered" && STATES[STATES.length - 1] === "published", "the lifecycle runs discovered → published");
ok(canTransition("discovered", "identity_resolved").ok, "one step forward is legal");
ok(!canTransition("discovered", "published").ok, "a candidate may NOT jump straight to published");
ok(/would go unverified/.test(canTransition("discovered", "card_ready").reason), "…and the refusal names the states that would be skipped");
ok(!canTransition("editorial_verified", "discovered").ok, "a state may not go backwards silently");
ok(canTransition("geo_verified", "wrong_geo").ok, "any state may fail sideways");
ok(canTransition("wrong_geo", "discovered").ok, "recovery re-enters at the start");
ok(!canTransition("wrong_geo", "card_ready").ok, "recovery may NOT re-enter mid-pipeline");
ok(Object.keys(FAILURE_STATES).every((k) => isFailureState(k) && FAILURE_STATES[k].length > 10), "every failure state carries an explanation");

// ── Card-ready gate ────────────────────────────────────────────────────────
const readyCandidate = {
  place_id: "ChIJ_SYNTH_ok", lat: 27.9, lng: -82.4, metro: "tampa", expected_metro: "tampa",
  category: "food", allowed_categories: ["food"], status: "OPERATIONAL",
  refreshed_at: new Date(now - 2 * DAY).toISOString(),
  editorial: { verified: true }, trend_match_active: true, needs_review: false,
  cta_kind: "directions", allowed_cta_kinds: ["directions", "website"],
};
ok(cardReadyGate(readyCandidate, { nowMs: now }).ready, "a fully-verified candidate is card-ready");
const mustFail = [
  ["place_id", null, "no Place ID"], ["lat", null, "no coordinates"], ["metro", null, "no metro"],
  ["category", null, "no category"], ["status", "CLOSED_PERMANENTLY", "a closed business"],
  ["trend_match_active", false, "an expired trend match"], ["needs_review", true, "an unreviewed classification"],
  ["cta_kind", null, "no CTA"], ["cta_kind", "book_tickets", "a CTA that does not match the place type"],
  ["excluded", true, "an excluded row"],
];
for (const [field, val, why] of mustFail) {
  const g = cardReadyGate({ ...readyCandidate, [field]: val }, { nowMs: now });
  ok(!g.ready, `card-ready must refuse: ${why}`);
  ok(g.failures.length > 0, `…and name the failure (${why})`);
}
// UNVERIFIED editorial never publishes — the atlas-build lesson.
ok(!cardReadyGate({ ...readyCandidate, editorial: { verified: false, issues: ["FAILED VERIFICATION"] } }, { nowMs: now }).ready,
  "an editorial row carrying issues NEVER publishes");
ok(!cardReadyGate({ ...readyCandidate, editorial: null }, { nowMs: now }).ready, "no editorial at all never publishes");
ok(!cardReadyGate({ ...readyCandidate, refreshed_at: new Date(now - 40 * DAY).toISOString() }, { nowMs: now }).ready,
  "Google content past 30 days is not card-ready (Places ToS)");
ok(!cardReadyGate({ ...readyCandidate, metro: "orlando" }, { nowMs: now }).ready, "a metro mismatch is not card-ready");
// The gate reports EVERY failure, not just the first.
const many = cardReadyGate({ place_id: null, status: "CLOSED_PERMANENTLY" }, { nowMs: now });
ok(many.failures.length >= 4, `the gate reports every failing condition at once, got ${many.failures.length}`);
// Per-surface requirements.
ok(!cardReadyGate(readyCandidate, { nowMs: now, require: { photo: true } }).ready, "a surface needing imagery refuses a candidate with no photo reference");
ok(!cardReadyGate(readyCandidate, { nowMs: now, require: { priceBand: true } }).ready, "a surface needing a price band refuses one with an unknown price");

// ── Reconciliation ─────────────────────────────────────────────────────────
const existing = new Map([["locked1", { place_id: "locked1", locked: true }], ["plain1", { place_id: "plain1", locked: false }]]);
ok(reconcileCandidate({ place_id: "new1" }, existing).action === "insert", "an unknown Place ID inserts");
ok(reconcileCandidate({ place_id: "locked1" }, existing).action === "skip", "a LOCKED owner-corrected row is never overwritten");
ok(reconcileCandidate({ place_id: "plain1" }, existing).action === "update_provenance_only",
  "rediscovering a place we already own records provenance and changes no classification");

// ── Telemetry privacy ──────────────────────────────────────────────────────
const { props, dropped } = scrubTrendProps({ metro: "tampa", topic_id: "syn-1", lat: 27.9, lng: -82.4, user_id: "u1", boost: 0.5 });
ok(props.metro === "tampa" && props.topic_id === "syn-1" && props.boost === 0.5, "allowed properties survive");
ok(props.lat === undefined && props.lng === undefined, "PRECISE COORDINATES are dropped from every trend event");
ok(props.user_id === undefined, "user identifiers are dropped");
ok(dropped.includes("lat") && dropped.includes("lng"), "…and the drop is surfaced, not silent");
for (const f of FORBIDDEN_PROPS) ok(!ALLOWED_PROPS.includes(f), `"${f}" is not on the allowlist`);
ok(ALLOWED_PROPS.includes("metro"), "coarse metro IS allowed — it answers the question without a location trace");
ok(!ALLOWED_PROPS.some((p) => /lat|lng|coord|address/i.test(p)), "no allowed property is finer-grained than metro");
ok(!ALLOWED_PROPS.includes("topic_name"), "the topic STRING is not an allowed analytics property; topic_id carries the same value without unnecessary payload data");
ok(Object.keys(TREND_EVENTS).length >= 25, "the event vocabulary covers the pipeline end to end");
ok(new Set(Object.values(TREND_EVENTS)).size === Object.keys(TREND_EVENTS).length, "no two events share a name");
// Badge impressions are a denominator, never a success metric.
ok(SUCCESS_METRICS.every((m) => m.denominator), "every success metric names its denominator");
ok(!SUCCESS_METRICS.some((m) => m.metric === "badge_impressions"), "raw badge impressions are NOT a success metric");

console.log(`test-trend-order: OK — ${pass} assertions (bounded order-only term, no paid input, honest language, verified lifecycle)`);
