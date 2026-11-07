// Exercise the real homepage browse derivation through mounted React updates.
// Detail/search UI state must not rescan unchanged inventory. Changing a real
// ranking input must still recompute, with the same sort and distance rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { useMemo } from 'react';
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

const home = readFileSync(new URL('../app/home.js', import.meta.url), 'utf8');
const begin = home.indexOf('  const browseMinute =');
const end = home.indexOf('  // 2026-10-06 (richer cards)', begin);
assert.ok(begin > 0 && end > begin, 'actual homepage browse boundary exists');
const consolidationBegin = home.indexOf('  const consolidatedView =', end);
const consolidationEnd = home.indexOf('  // Explore now opens', consolidationBegin);
assert.ok(consolidationBegin > end && consolidationEnd > consolidationBegin, 'actual consolidation boundary exists');
let scans = 0, consolidations = 0, clock = Date.parse('2026-11-06T18:30:00Z');
const dependencies = {
  useMemo: process.argv.includes('--no-cache') ? (fn) => fn() : useMemo,
  Date: { now: () => clock },
  condCtxFromNow: Ranking.condCtxFromNow,
  nowContext: (opts) => nowContext({ ...opts, now: new Date(clock) }),
  mealGate: (rows, sub) => sub === 'all' ? rows : rows.filter(p => p.meal === sub),
  dedupePlaces: (...args) => { scans++; return dedupePlaces(...args); },
  betterPlace, comparatorFor, sortPlacesBy, nearestBranch, Ranking,
  placeScore, UNRATED_LAST, faveTier: () => 0, featuredBoost: () => 0,
  creatorEvidenceTerm: () => 0, TRENDING_BONUS: 1, cardComplete,
  consolidateDestinations: (rows) => { consolidations++; return consolidateDestinations(rows); },
};
const derive = new Function(...Object.keys(dependencies), `return function derive(props) {
  const {places, cat, sub, sliderMi, dealsOnly, offers, searchMode, sortBy, weather} = props;
  ${home.slice(begin, end)}
  ${home.slice(consolidationBegin, consolidationEnd)}
  return { view, consolidatedView };
}`)(...Object.values(dependencies));
const dom = new JSDOM('<div id="root"></div>');
const previous = Object.fromEntries(['window', 'document'].map(key => [key, globalThis[key]]));
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const root = createRoot(document.getElementById('root'));
let result;
function Probe(props) { result = derive(props); return React.createElement('span', null, props.uiState || 'browse'); }
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
  console.log('test-browse-interaction-reuse: PASS — 400 places; 7 unrelated updates cause 0 extra scans; all real ranking inputs invalidate');
} finally {
  flushSync(() => root.unmount());
  dom.window.close();
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
