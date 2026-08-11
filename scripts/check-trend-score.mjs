#!/usr/bin/env node
// scripts/check-trend-score.mjs — the Trend Momentum Score model lock.
//
// ASSERTS ON THE CALL, not the string, wherever the thing can be executed
// (CLAUDE.md: "where the thing can be executed, execute it and assert the
// RESULT"). What this guard exists to stop:
//   1. A SECOND COPY of the weights. One configurable model was the brief's
//      hardest requirement; drift between code defaults and the DB seed is the
//      two-sources-of-truth bug this repo keeps deleting.
//   2. THE SCORE BOUNDARY BREAKING. A topic score must never feed the displayed
//      place score — asserted on the import graph of the score-law files.
//   3. PROVIDER NAMES IN PUBLIC LANGUAGE. Labels are Wayfind-owned words.
//   4. A SCORE FROM NOTHING. No factors -> null, never a confident number.
import { readFileSync } from "node:fs";
import {
  DEFAULT_WEIGHTS, MOMENTUM_THRESHOLDS, PUBLIC_LABELS, TREND_SCORE_MODEL_VERSION,
  assertTrendWeights, trendMomentumScore, trendFactors, scoreTrendTopic, normalizeGrowthPct, freshnessFactor,
} from "../lib/trendScore.js";

let pass = 0;
const fail = (m) => { console.error("check-trend-score: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── 1. one model, weights sum to 1, DB seed agrees byte-for-value ──────────
ok(assertTrendWeights() === true, "default weights validate");
ok(Math.abs(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9, "weights sum to exactly 1");
const mig = read("supabase/migrations/20260811_wf_trend_score_config.sql");
const seed = mig.match(/'(\{"growth":[^']+\})'::jsonb/);
ok(!!seed, "the migration seeds a weights row");
const seeded = JSON.parse(seed[1]);
for (const [k, v] of Object.entries(DEFAULT_WEIGHTS)) ok(seeded[k] === v, `DB seed and code default agree on ${k} (${seeded[k]} vs ${v})`);
ok(Object.keys(seeded).length === Object.keys(DEFAULT_WEIGHTS).length, "no extra factor hides in the DB seed");
ok(/one_active/.test(mig) && /where active/.test(mig), "exactly one active config row is enforced by a partial unique index");
ok(/enable row level security/.test(mig) && /revoke all on public\.wf_trend_score_config from anon/.test(mig), "config table is service-role only");
// The scattered-copy sweep: no OTHER source file may declare these weights.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const offenders = [];
const sweep = (dir) => { for (const e of readdirSync(dir)) { const p = join(dir, e); const st = statSync(p);
  if (st.isDirectory()) { if (!/node_modules|\.next|\.git/.test(p)) sweep(p); continue; }
  if (!/\.(js|mjs)$/.test(e) || p.endsWith("lib/trendScore.js") || /check-trend-score\.mjs$/.test(p)) continue;
  const src = readFileSync(p, "utf8");
  if (/localIntent[^\n]{0,30}0\.16/.test(src) && /bookability[^\n]{0,30}0\.12/.test(src)) offenders.push(p);
}};
sweep(new URL("../lib", import.meta.url).pathname); sweep(new URL("../app", import.meta.url).pathname);
ok(offenders.length === 0, "no second copy of the model weights outside lib/trendScore.js: " + offenders.join(", "));

// ── 2. the score boundary, on the import graph ─────────────────────────────
for (const f of ["lib/wayfindScore.js", "lib/rankPlaces.js", "lib/lawfulOrder.js", "lib/creatorBoost.js"]) {
  ok(!/trendScore/.test(read(f)), `${f} never imports the topic model — a topic score must not touch a displayed place score`);
}

// ── 3. public labels are Wayfind language ──────────────────────────────────
const BANNED = /google|tiktok|exploding topics|semrush|instagram|trends api|powered by/i;
for (const [k, label] of Object.entries(PUBLIC_LABELS)) ok(!BANNED.test(label), `label "${k}" contains no provider name`);
ok(new Set(Object.values(PUBLIC_LABELS)).size === 4, "four distinct public labels");
// …and every label survives the DISCLOSURE ban list too — topic-honest words,
// checked against the same regexes the trend surfaces are swept with.
const { BANNED_TREND_PHRASES } = await import("../lib/trendDisclosure.js");
for (const label of Object.values(PUBLIC_LABELS)) for (const re of BANNED_TREND_PHRASES) ok(!re.test(label), 'label "' + label + '" passes the trend-disclosure ban ' + re);
const seedLabels = JSON.parse(mig.match(/'(\{"exploding":"[^']+\})'::jsonb/)[1] /* quote after the colon: the thresholds row also starts {"exploding": */);
for (const [k, v] of Object.entries(PUBLIC_LABELS)) ok(seedLabels[k] === v, 'DB seed label ' + k + ' agrees with the module');

// ── 4. the model behaves — BY CALL ─────────────────────────────────────────
ok(trendMomentumScore({}) === null, "no factors -> null, never a fabricated score");
const full = trendMomentumScore({ growth: 1, demand: 1, velocity: 1, localIntent: 1, bookability: 1, quality: 1, freshness: 1, confidence: 1 });
ok(full.score === 100 && full.momentum === "exploding" && full.publicLabel === PUBLIC_LABELS.exploding, "all-perfect factors -> 100/exploding");
const low = trendMomentumScore({ growth: 0.1, demand: 0.1, velocity: 0.1, localIntent: 0.1, bookability: 0.1, quality: 0.1, freshness: 0.1, confidence: 0.1 });
ok(low.score === 10 && low.momentum === "watch", "uniformly weak factors -> watch");
// Redistribution: one perfect factor alone scores 100 on ITS OWN scale but
// coverage says how little of the model spoke — the serving layer gates on it.
const lone = trendMomentumScore({ growth: 1 });
ok(lone.score === 100 && Math.abs(lone.coverage - DEFAULT_WEIGHTS.growth) < 1e-9, "absence redistributes weight and is visible as low coverage");
// Present-but-poor is NOT absence: adding a zero factor lowers the score.
const withZero = trendMomentumScore({ growth: 1, bookability: 0 });
ok(withZero.score < 100, "a present-but-zero factor lowers the score rather than vanishing");
// Thresholds map exactly at the boundaries.
const at = (s) => trendMomentumScore({ growth: s / 100 }).momentum;
ok(at(85) === "exploding" && at(84) === "rising" && at(75) === "rising" && at(74) === "building" && at(65) === "building" && at(64) === "watch",
  "momentum boundaries sit exactly at 85/75/65");
// Growth curve: order-preserving with diminishing returns; junk in -> null.
ok(normalizeGrowthPct(650) > normalizeGrowthPct(100) && normalizeGrowthPct(-5) === 0 && normalizeGrowthPct("x") === null, "growth normalisation is monotone and honest about junk");
// Freshness decays, never punishes inside cadence.
const D = 24 * 3600 * 1000;
ok(freshnessFactor(0, 6 * D, 7 * D) === 1 && freshnessFactor(0, 14 * D, 7 * D) < 1, "freshness holds within cadence and decays after");
// End-to-end row scoring carries the model version.
const scored = scoreTrendTopic({ growth_longterm: 650, volume_percentile: 0.9, stability: 0.8, volatility: 0.2, observed_at: new Date().toISOString() });
ok(scored && scored.modelVersion === TREND_SCORE_MODEL_VERSION, "scoreTrendTopic stamps the model version");

console.log(`check-trend-score: OK — ${pass} assertions (one configurable model, DB seed parity, score boundary held, Wayfind-only labels, honest absence handling)`);
