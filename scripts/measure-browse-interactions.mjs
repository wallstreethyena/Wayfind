// Manual computational benchmark: no browser INP, layout, paint, or network.
// Run: node scripts/measure-browse-interactions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { dedupePlaces, betterPlace } from '../lib/placeDedupe.js';
import { comparatorFor, sortPlacesBy, nearestBranch } from '../lib/sortModes.js';
import * as Ranking from '../lib/ranking.js';
import { nowContext } from '../lib/nowContext.js';
import { cardComplete } from '../lib/score.js';
import { placeScore, UNRATED_LAST } from '../lib/rankPlaces.js';
import { consolidateDestinations } from '../lib/venueContainment.js';
import { TRENDING_BONUS } from '../lib/wayfindScore.js';

const repo = new URL('../', import.meta.url);
const beforeRef = '9cb7e5017188ff917494744108c59e10ca680ef9';
const beforeHome = execFileSync('git', ['show', `${beforeRef}:app/home.js`], { cwd: repo, encoding: 'utf8' });
const afterHome = readFileSync(new URL('../app/home.js', import.meta.url), 'utf8');
const clock = Date.parse('2026-11-06T18:30:00Z');
const updates = ['initial', 'detail-opening', 'detail-ready', 'hours', 'reviews', 'search-typing', 'save-feedback', 'detail-closed', 'radius-change'];
const extract = (home, memoized) => {
  const begin = home.indexOf(memoized ? '  const [trendTick, setTrendTick] =' : '  const _viewCtx =');
  const end = home.indexOf('  // 2026-10-06 (richer cards)', begin);
  const consolidationBegin = home.indexOf('  const consolidatedView =', end);
  const consolidationEnd = home.indexOf('  // Explore now opens', consolidationBegin);
  assert.ok(begin > 0 && end > begin && consolidationBegin > end && consolidationEnd > consolidationBegin, 'production source boundaries exist');
  return { browse: home.slice(begin, end), consolidation: home.slice(consolidationBegin, consolidationEnd) };
};
const sources = { before: extract(beforeHome, false), after: extract(afterHome, true) };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function makeDerive(variant, stats) {
  const measure = (kind, fn) => {
    stats[kind].count++;
    const start = performance.now();
    try { return fn(); } finally { stats[kind].ms += performance.now() - start; }
  };
  const dependencies = {
    useState,
    useMemo: (fn, deps) => useMemo(() => measure(fn.toString().includes('consolidateDestinations') ? 'consolidation' : 'derivation', fn), deps),
    Date: { now: () => clock },
    condCtxFromNow: Ranking.condCtxFromNow,
    nowContext: (opts) => nowContext({ ...opts, now: new Date(clock) }),
    mealGate: (rows, sub) => sub === 'all' ? rows : rows.filter(p => p.meal === sub),
    dedupePlaces, betterPlace, comparatorFor, sortPlacesBy, nearestBranch, Ranking,
    placeScore, UNRATED_LAST, faveTier: () => 0, featuredBoost: () => 0,
    creatorEvidenceTerm: () => 0, TRENDING_BONUS, cardComplete, consolidateDestinations, measure,
  };
  const { browse, consolidation } = sources[variant];
  // Timing surrounds the extracted production calculations, without changing
  // their filtering, scoring, comparison, or consolidation expressions.
  const body = variant === 'after' ? `${browse}\n${consolidation}` : `
    const view = measure('derivation', () => { ${browse}\nreturn view; });
    const consolidatedView = measure('consolidation', () => {
      ${consolidation}\nreturn consolidatedView;
    });`;
  return new Function(...Object.keys(dependencies), `return function derive(props) {
    const { places, cat, sub, sliderMi, dealsOnly, offers, searchMode, sortBy, weather } = props;
    ${body}
    return { view, consolidatedView };
  };`)(...Object.values(dependencies));
}

const dom = new JSDOM('<div id="root"></div>');
const previous = Object.fromEntries(['window', 'document', 'fetch'].map(key => [key, globalThis[key]]));
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.fetch = () => { throw new Error('Network is prohibited in this benchmark'); };
const root = createRoot(document.getElementById('root'));
function run(variant, sortBy) {
  const stats = { derivation: { count: 0, ms: 0 }, consolidation: { count: 0, ms: 0 } };
  const derive = makeDerive(variant, stats);
  let result;
  function Probe(props) { result = derive(props); return React.createElement('span', null, props.uiState); }
  // Fresh rows per run prevent real scoring helpers' in-place metadata caches
  // from leaking between variants. Every row passes the real cardComplete gate.
  const places = Array.from({ length: 400 }, (_, i) => ({
    id: `browse-measure-${i}`, name: `Independent Venue ${i}`, distMi: i / 10,
    lat: 27 + i / 10000, lng: -82, rating: 4.2 + (i % 6) / 10,
    reviews: 100 + i, wfScore: 70 + i % 25,
    photo: '/brand/wayfind.png', types: ['museum'], meal: i % 2 ? 'lunch' : 'dinner',
  }));
  assert.ok(places.every(cardComplete), 'all 400 rows are healthy');
  const props = { places, cat: 'attractions', sub: 'all', sliderMi: 60, dealsOnly: false, offers: {}, searchMode: false, sortBy, weather: null };
  const snapshots = [];
  const stepMs = [];
  for (const [i, uiState] of updates.entries()) {
    const start = performance.now();
    flushSync(() => root.render(React.createElement(Probe, { ...props, uiState, sliderMi: i === updates.length - 1 ? 12 : 60 })));
    stepMs.push(performance.now() - start);
    assert.equal(result.view.length, i === updates.length - 1 ? 121 : 400, 'real radius change filters inventory');
    snapshots.push({ view: result.view.map(p => p.id), consolidated: result.consolidatedView.map(p => p.id) });
  }
  const expected = variant === 'before' ? 9 : 2;
  assert.equal(stats.derivation.count, expected, `${variant}: exact derivation count`);
  assert.equal(stats.consolidation.count, expected, `${variant}: exact consolidation count`);
  // Cleanup is deliberately excluded from the timed interaction sequence.
  flushSync(() => root.render(null));
  return { stats, snapshots, stepMs, flushSyncMs: stepMs.reduce((a, b) => a + b, 0), calculationMs: stats.derivation.ms + stats.consolidation.ms };
}
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return { min: sorted[0], median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, p90: sorted[Math.ceil(n * .9) - 1], max: sorted[n - 1] };
}
try {
  const modes = {};
  for (const sortBy of ['rated', 'best']) {
    const trials = [];
    for (let pair = -10; pair < 30; pair++) {
      const order = pair % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
      const runs = {};
      for (const variant of order) runs[variant] = run(variant, sortBy);
      assert.deepEqual(runs.before.snapshots, runs.after.snapshots, 'identical ordered view and consolidated IDs at every step');
      if (pair >= 0) trials.push({ pair, order, ...Object.fromEntries(Object.entries(runs).map(([variant, r]) => [variant, { flushSyncMs: r.flushSyncMs, calculationMs: r.calculationMs, derivationMs: r.stats.derivation.ms, consolidationMs: r.stats.consolidation.ms, counts: { derivation: r.stats.derivation.count, consolidation: r.stats.consolidation.count }, stepMs: r.stepMs }])) });
    }
    modes[sortBy] = {
      summaryMs: Object.fromEntries(['before', 'after'].map(variant => [variant, Object.fromEntries(['flushSyncMs', 'calculationMs', 'derivationMs', 'consolidationMs'].map(key => [key, summary(trials.map(t => t[variant][key]))]))])),
      pairedReductionMs: Object.fromEntries(['flushSyncMs', 'calculationMs'].map(key => [key, summary(trials.map(t => t.before[key] - t.after[key]))])),
      trials,
    };
  }
  console.log(JSON.stringify({
    method: 'Mounted React/JSDOM; actual extracted browse derivation and destination consolidation; 400 healthy synthetic museum rows; initial + 7 unrelated UI updates + radius 60→12 miles; performance.now around flushSync and calculation callbacks; fresh rows and mounted component per variant; alternating paired order; 10 warmup pairs then 30 measured pairs per mode; identical ordered IDs asserted at all 9 steps; nearest-rank p90',
    limitations: 'Controlled computational work only. Minimal span renders, no real cards, browser interaction scheduling, layout, paint, device throttling, or field INP. Shared current production helpers are used for both source variants. Neutral favorite/featured/creator contributions and unused food meal gate are fixture stubs. Frozen clock and no asynchronous popularity effect. Timing includes instrumentation overhead; JIT/GC and host load cause variation. No network.',
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, react: React.version },
    source: { beforeRef, currentHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), beforeExtractSha256: sha256(JSON.stringify(sources.before)), afterExtractSha256: sha256(JSON.stringify(sources.after)), afterHomeSha256: sha256(afterHome) },
    steps: updates, modes,
  }, null, 2));
} finally {
  flushSync(() => root.unmount());
  dom.window.close();
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
