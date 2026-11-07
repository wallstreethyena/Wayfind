// Exercise the real homepage browse derivation through mounted React updates.
// Detail/search UI state must not rescan unchanged inventory. Changing a real
// ranking input must still recompute, with the same sort and distance rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act, useEffect, useMemo, useState } from 'react';
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
import { computeTrendSignal, nearbyEventScore } from '../lib/trendSignal.js';
import { creatorCountFor } from '../lib/creatorSignals.js';
import { TRENDING_BONUS } from '../lib/wayfindScore.js';

const home = readFileSync(new URL('../app/home.js', import.meta.url), 'utf8');
const begin = home.indexOf('  const [trendTick, setTrendTick] =');
const end = home.indexOf('  // 2026-10-06 (richer cards)', begin);
assert.ok(begin > 0 && end > begin, 'actual homepage browse boundary exists');
const consolidationBegin = home.indexOf('  const consolidatedView =', end);
const consolidationEnd = home.indexOf('  // Explore now opens', consolidationBegin);
assert.ok(consolidationBegin > end && consolidationEnd > consolidationBegin, 'actual consolidation boundary exists');
const trendBegin = home.indexOf('  const _trendIdsKey =', consolidationEnd);
const trendEnd = home.indexOf('  // v6.57: one batched read', trendBegin);
assert.ok(trendBegin > consolidationEnd && trendEnd > trendBegin, 'actual async trend effect boundary exists');
// Run the production decorator body, replacing only its remote popularity read
// with a deferred fixture. This exercises its real in-place mutation and the
// homepage's real completion effect without making network requests.
const trendSource = readFileSync(new URL('../lib/trendSignal.js', import.meta.url), 'utf8');
const decoratorBegin = trendSource.indexOf('export async function attachTrendSignals(');
assert.ok(decoratorBegin > 0, 'production trend decorator exists');
const creatorsBegin = trendSource.indexOf('function creatorsBehind(');
const creatorsEnd = trendSource.indexOf('\n}\n', creatorsBegin) + 3;
assert.ok(creatorsBegin > 0 && creatorsEnd > creatorsBegin, 'production creator identity helper exists');
let finishPopularity;
const attachTrendSignals = new Function('fetchPopularityByIds', 'computeTrendSignal', 'nearbyEventScore', 'creatorCountFor',
  `${trendSource.slice(creatorsBegin, creatorsEnd)}\n${trendSource.slice(decoratorBegin).replace('export ', '')}\nreturn attachTrendSignals;`
)(() => new Promise(resolve => { finishPopularity = resolve; }), computeTrendSignal, nearbyEventScore, creatorCountFor);
let scans = 0, consolidations = 0, clock = Date.parse('2026-11-06T18:30:00Z');
const dependencies = {
  useState, useEffect, attachTrendSignals,
  useMemo: process.argv.includes('--no-cache') ? (fn) => fn() : useMemo,
  Date: { now: () => clock },
  condCtxFromNow: Ranking.condCtxFromNow,
  nowContext: (opts) => nowContext({ ...opts, now: new Date(clock) }),
  mealGate: (rows, sub) => sub === 'all' ? rows : rows.filter(p => p.meal === sub),
  dedupePlaces: (...args) => { scans++; return dedupePlaces(...args); },
  betterPlace, comparatorFor, sortPlacesBy, nearestBranch, Ranking,
  placeScore, UNRATED_LAST, faveTier: () => 0, featuredBoost: () => 0,
  creatorEvidenceTerm: () => 0, TRENDING_BONUS, cardComplete,
  consolidateDestinations: (rows) => { consolidations++; return consolidateDestinations(rows); },
};
const browseSource = process.argv.includes('--no-trend-invalidation')
  ? home.slice(begin, end).replace('browseMinute, trendTick]', 'browseMinute]')
  : home.slice(begin, end);
const makeDerive = (withTrendEffect) => new Function(...Object.keys(dependencies), `return function derive(props) {
  const {places, cat, sub, sliderMi, dealsOnly, offers, searchMode, sortBy, weather, events = [], foryouEvents = []} = props;
  ${browseSource}
  ${home.slice(consolidationBegin, consolidationEnd)}
  ${withTrendEffect ? home.slice(trendBegin, trendEnd) : ''}
  return { view, consolidatedView };
}`)(...Object.values(dependencies));
const derive = makeDerive(false);
const deriveWithTrend = makeDerive(true);
const dom = new JSDOM('<div id="root"></div>');
const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const root = createRoot(document.getElementById('root'));
let result;
function Probe(props) { result = derive(props); return React.createElement('span', null, props.uiState || 'browse'); }
function TrendProbe(props) { result = deriveWithTrend(props); return React.createElement('span', null, props.uiState || 'browse'); }
const places = Array.from({ length: 400 }, (_, i) => ({
  id: `browse-reuse-${i}`, name: `Independent Venue ${i}`, distMi: i / 10,
  lat: 27 + i / 10000, lng: -82, rating: 4.7, reviews: 100, wfScore: 90,
  photo: '/brand/wayfind.png', types: ['museum'], meal: i % 2 ? 'lunch' : 'dinner',
}));
let props = { places, cat: 'attractions', sub: 'all', sliderMi: 60, dealsOnly: false, offers: {}, searchMode: false, sortBy: 'near', weather: null };
const render = (updates = {}) => { props = { ...props, ...updates }; flushSync(() => root.render(React.createElement(Probe, props))); };
try {
  render();
  assert.equal(result.view.length, 400, 'large healthy inventory remains visible');
  const first = result;
  for (const uiState of ['detail-opening', 'detail-ready', 'hours', 'reviews', 'search-typing', 'save-feedback', 'detail-closed']) render({ uiState });
  assert.equal(scans, 1, 'seven unrelated interactions do not repeat deduplication/ranking');
  assert.equal(consolidations, 1, 'unrelated interactions do not repeat destination consolidation');
  assert.equal(result.view, first.view, 'unchanged browse output is reused by reference');
  assert.equal(result.consolidatedView, first.consolidatedView, 'unchanged consolidated output is reused');
  const invalidates = (updates) => { const before = scans; render(updates); assert.equal(scans, before + 1, 'changed ranking input invalidates the result'); };
  invalidates({ sliderMi: 1 });
  assert.ok(result.view.every(p => p.distMi <= 1), 'distance changes actually filter inventory');
  invalidates({ sortBy: 'rated' });
  invalidates({ places: [...places].reverse() });
  invalidates({ offers: { 'browse-reuse-0': { id: 'offer' } } });
  invalidates({ dealsOnly: true });
  assert.deepEqual(result.view.map(p => p.id), ['browse-reuse-0'], 'deals mode preserves exact eligible inventory');
  invalidates({ searchMode: true });
  invalidates({ cat: 'food' });
  invalidates({ sub: 'dinner' });
  invalidates({ weather: { temp: 90, condition: 'rain' } });
  clock += 60000;
  invalidates({ uiState: 'clock-advanced' });
  invalidates({ dealsOnly: false, sliderMi: 60, sub: 'all', sortBy: 'near' });
  assert.equal(result.view.length, 400, 'clearing real filters restores full inventory');
  assert.ok(result.view.every((p, i, rows) => i === 0 || rows[i - 1].distMi <= p.distMi), 'closest-first output remains monotonic');
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const sortBy of ['rated', 'best']) {
    // Fresh rows: spreading an already-ranked fixture would copy its governed
    // score but drop the comparator's non-enumerable input fingerprint.
    const trendPlaces = ['alpha', 'beta'].map((id, index) => ({
      id: `${sortBy}-${id}`, name: `${id} Independent Museum`, wfScore: 90 - index,
      rating: 4.7, reviews: 100, lat: 27 + index / 10000, lng: -82, distMi: 1,
      photo: '/brand/wayfind.png', types: ['museum'],
    }));
    const trendProps = { ...props, places: trendPlaces, sortBy, weather: null };
    finishPopularity = undefined;
    await act(async () => root.render(React.createElement(TrendProbe, { ...trendProps, key: sortBy })));
    const initial = result;
    const before = { scans, consolidations, clock };
    const [alpha, beta] = trendPlaces.map(p => p.id);
    assert.deepEqual(initial.view.map(p => p.id), [alpha, beta], `${sortBy}: higher score starts first`);
    assert.equal(typeof finishPopularity, 'function', 'the mounted production effect requested popularity');
    await act(async () => { finishPopularity({ [beta]: 0.95 }); });
    assert.equal(trendPlaces[1].trending, true, 'the production decorator mutated the existing place');
    assert.equal(clock, before.clock, 'trend completion did not advance the minute');
    assert.equal(scans, before.scans + 1, `${sortBy}: async trend completion invalidates ranking`);
    assert.equal(consolidations, before.consolidations + 1, `${sortBy}: consolidation follows the new ranking`);
    assert.deepEqual(result.view.map(p => p.id), [beta, alpha], `${sortBy}: the newly higher trend score moves first`);
    assert.deepEqual(result.consolidatedView.map(p => p.id), [beta, alpha], `${sortBy}: final cards keep the new order`);
    assert.equal(result.view[0].trending, true, `${sortBy}: copied ranked rows include the new flag`);
    assert.equal(result.view[0].trend_reason, 'Popular with locals', `${sortBy}: the score bump has its real disclosure`);
    const refreshed = result;
    await act(async () => root.render(React.createElement(TrendProbe, { ...trendProps, key: sortBy, uiState: 'detail-open' })));
    assert.equal(result.view, refreshed.view, `${sortBy}: unrelated interactions still reuse the refreshed result`);
  }
  // A response for an abandoned inventory must retain the production effect's
  // cancellation guard: it must not invalidate or reorder the current list.
  const stalePlaces = [{ id: 'stale-trend-row', name: 'Old Museum', wfScore: 89, rating: 4.7, reviews: 100, types: ['museum'] }];
  await act(async () => root.render(React.createElement(TrendProbe, { ...props, key: 'cancel', places: stalePlaces })));
  const finishStale = finishPopularity;
  const currentPlaces = [{ ...stalePlaces[0], id: 'current-trend-row', name: 'Current Museum' }];
  await act(async () => root.render(React.createElement(TrendProbe, { ...props, key: 'cancel', places: currentPlaces })));
  const finishCurrent = finishPopularity;
  const current = result;
  const currentScans = scans;
  await act(async () => { finishStale({ 'stale-trend-row': 0.95 }); });
  assert.equal(scans, currentScans, 'an abandoned trend response does not invalidate the new inventory');
  assert.equal(result.view, current.view, 'an abandoned trend response leaves the current result untouched');
  await act(async () => { finishCurrent({ 'current-trend-row': 0.95 }); });
  assert.equal(result.view[0].id, 'current-trend-row', 'the current trend response keeps the current inventory');
  assert.equal(scans, currentScans + 1, 'the current trend response still invalidates normally');
  console.log('test-browse-interaction-reuse: PASS — 400 places; 7 unrelated updates cause 0 extra scans; ranking inputs and real async trend mutations invalidate; rated/best order and disclosure update');
} finally {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  flushSync(() => root.unmount());
  dom.window.close();
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
