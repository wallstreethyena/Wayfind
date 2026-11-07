// Exercise the real homepage browse derivation through mounted React updates.
// Detail/search UI state must not rescan unchanged inventory. Changing a real
// ranking input must still recompute, with the same sort and distance rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React, { act, useEffect, useMemo, useRef, useState } from 'react';
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

// Vercel runs prebuild with NODE_ENV=production, where React intentionally
// disables act. Run the SAME mounted assertions in React's supported test
// environment on EVERY invocation, forwarding every mutation flag and the
// child's failure status. The caller's environment never decides the verdict.
if (!process.argv.includes('--react-test-child')) {
  const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2), '--react-test-child'],
    { env: { ...process.env, NODE_ENV: 'test' }, stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const home = readFileSync(new URL('../app/home.js', import.meta.url), 'utf8');
const begin = home.indexOf('  const [trendTick, setTrendTick] =');
const end = home.indexOf('  // 2026-10-06 (richer cards)', begin);
assert.ok(begin > 0 && end > begin, 'actual homepage browse boundary exists');
const consolidationBegin = home.indexOf('  const consolidatedView =', end);
const consolidationEnd = home.indexOf('  // Explore now opens', consolidationBegin);
assert.ok(consolidationBegin > end && consolidationEnd > consolidationBegin, 'actual consolidation boundary exists');
const trendBegin = home.indexOf('  const _trendEvents =', consolidationEnd);
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
const trendEffectSource = process.argv.includes('--ids-only-trend')
  ? home.slice(trendBegin, trendEnd).replace('[places, _trendEvents]', '[places.map(p => p.id).join(",")]')
  : home.slice(trendBegin, trendEnd);
const makeDerive = (withTrendEffect) => new Function(...Object.keys(dependencies), `return function derive(props) {
  const {places, cat, sub, sliderMi, dealsOnly, offers, searchMode, sortBy, weather, events = null, foryouEvents = null} = props;
  ${browseSource}
  ${home.slice(consolidationBegin, consolidationEnd)}
  ${withTrendEffect ? trendEffectSource : ''}
  return { view, consolidatedView };
}`)(...Object.values(dependencies));
const derive = makeDerive(false);
const deriveWithTrend = makeDerive(true);
const enrichmentBegin = home.indexOf('function sameHealedHours(');
const enrichmentEnd = home.indexOf('// v4.95:', enrichmentBegin);
assert.ok(enrichmentBegin > 0 && enrichmentEnd > enrichmentBegin, 'production hours merge helpers exist');
let enrichmentSource = home.slice(enrichmentBegin, enrichmentEnd);
if (process.argv.includes('--drop-score-fingerprint')) enrichmentSource = enrichmentSource.replace('if (fingerprint) Object.defineProperty(enriched, "__gsInputs", fingerprint);', '');
if (process.argv.includes('--allow-older-hours')) enrichmentSource = enrichmentSource.replace('|| (Number.isFinite(row.hoursAsOf) && Number.isFinite(patch.hoursAsOf) && patch.hoursAsOf < row.hoursAsOf)', '');
const { sameHealedHours, mergeBrowseEnrichment } = new Function(`${enrichmentSource}; return {sameHealedHours, mergeBrowseEnrichment};`)();
const ownerBegin = home.indexOf('  const browseEnrichmentScope =');
assert.ok(ownerBegin > 0 && ownerBegin < begin, 'production enrichment owner precedes browse memo');
const deriveOwned = new Function('useState', 'useRef', 'mergeBrowseEnrichment', 'derive', `return function owned(props) {
  const [places, setPlaces] = useState(props.places);
  const {cat, sub, vibe, center, searchMode} = props;
  ${home.slice(ownerBegin, begin)}
  return { places, setPlaces, onBrowsePlaceEnriched, result: derive({...props, places}) };
}`)(useState, useRef, mergeBrowseEnrichment, input => (input.withTrend ? deriveWithTrend : derive)(input));
const healBegin = home.indexOf('  const [, _photoBump] =');
const healEnd = home.indexOf('  const cardProduct =', healBegin);
assert.ok(healBegin > 0 && healEnd > healBegin, 'production photo-heal effect exists');
assert.equal((home.match(/onPlaceEnriched=\{onBrowsePlaceEnriched\}/g) || []).length, 3, 'all three canonical browse card renderers opt into immutable enrichment');
const photoRequests = [];
const heal = new Function('useState', 'useEffect', 'findPlace', '_wfNorm', 'sameHealedHours',
  `return function heal(p, onPlaceEnriched) { ${home.slice(healBegin, healEnd)} };`
)(useState, useEffect, (name) => new Promise(resolve => photoRequests.push({name, resolve})),
  s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''), sameHealedHours);
const dom = new JSDOM('<div id="root"></div>');
const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const root = createRoot(document.getElementById('root'));
let result;
function Probe(props) { result = derive(props); return React.createElement('span', null, props.uiState || 'browse'); }
function TrendProbe(props) { result = deriveWithTrend(props); return React.createElement('span', null, props.uiState || 'browse'); }
let owned;
function HealingCard({ p, onPlaceEnriched }) { heal(p, onPlaceEnriched); return React.createElement('span', null, p.name); }
function PhotoProbe(props) {
  owned = deriveOwned(props); result = owned.result;
  return result.view.map(p => React.createElement(HealingCard, { key: p.id, p,
    onPlaceEnriched: process.argv.includes('--no-hours-invalidation') ? undefined : owned.onBrowsePlaceEnriched }));
}
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
  const photoFixture = (mode) => ['alpha', 'beta'].map((id, index) => ({
    id: `fsq:${mode}-${id}`, name: `${id} Independent Museum`, wfScore: 90,
    rating: 4.7, reviews: 100, lat: 27 + index / 10000, lng: -82, distMi: 1,
    photo: index === 0 ? '/brand/wayfind.png' : null, types: ['museum'], openNow: false,
    hoursAsOf: Date.now(),
  }));
  const mountPhoto = async (key, rows, sortBy = 'near', center = {lat: 27, lng: -82}, extra = {}) => {
    const next = { ...props, key, places: rows, sortBy, center, ...extra };
    await act(async () => root.render(React.createElement(PhotoProbe, next)));
    return next;
  };
  const answerPhoto = (request, row, hours = {}) => request.resolve({ name: row.name,
    photo: '/verified-photo.jpg', photos: ['/verified-photo.jpg'], ...hours });
  for (const sortBy of ['near', 'best']) {
    const rows = photoFixture(sortBy);
    await mountPhoto(`hours-${sortBy}`, rows, sortBy);
    const initial = result, before = { scans, consolidations, clock };
    const request = photoRequests.at(-1);
    assert.deepEqual(initial.view.map(p => p.id), rows.map(p => p.id), `${sortBy}: hours fixture starts in stable order`);
    await act(async () => answerPhoto(request, rows[1], { oh: {periods: []}, openNow: true, hoursAsOf: Date.now() }));
    assert.equal(clock, before.clock, 'hours completion stays in the same browse minute');
    assert.equal(scans, before.scans + 1, `${sortBy}: real photo-heal hours invalidate ranking`);
    assert.equal(consolidations, before.consolidations + 1, `${sortBy}: hours update reaches destination cards`);
    assert.deepEqual(result.view.map(p => p.id), [rows[1].id, rows[0].id], `${sortBy}: the now-open tied place moves first`);
    assert.equal(owned.places[1].openNow, true, 'hours are committed to the canonical parent inventory');
    assert.notEqual(owned.places, rows, 'ranking fields update with a new parent array');
    assert.equal(rows[1].openNow, false, 'the original ranking row is not mutated');
  }
  const photoOnly = photoFixture('photo-only');
  await mountPhoto('photo-only', photoOnly);
  const beforePhoto = { scans, view: result.view };
  await act(async () => answerPhoto(photoRequests.at(-1), photoOnly[1]));
  assert.equal(scans, beforePhoto.scans, 'photo-only completion does not rescan ranking');
  assert.equal(result.view, beforePhoto.view, 'photo-only completion retains the ranked result');
  assert.equal(result.view[1].photo, '/verified-photo.jpg', 'photo-only recovery still reaches the card');
  const unchangedHours = photoFixture('unchanged-hours');
  unchangedHours[1].oh = {periods: []};
  await mountPhoto('unchanged-hours', unchangedHours);
  const beforeUnchanged = { scans, view: result.view };
  await act(async () => answerPhoto(photoRequests.at(-1), unchangedHours[1], {
    oh: {periods: []}, openNow: false, hoursAsOf: unchangedHours[1].hoursAsOf,
  }));
  assert.equal(scans, beforeUnchanged.scans, 'equivalent hours do not rescan ranking');
  assert.equal(result.view, beforeUnchanged.view, 'equivalent hours retain the ranked result');
  const concurrent = photoFixture('concurrent');
  await mountPhoto('concurrent', concurrent);
  const pendingConcurrent = photoRequests.at(-1);
  await act(async () => owned.setPlaces(cur => cur.map(p => p.id === concurrent[1].id ? {...p, distMi: 7, _members: {likes: 3}, photo: '/newer-photo.jpg'} : p)));
  await act(async () => answerPhoto(pendingConcurrent, concurrent[1], {oh: {periods: []}, openNow: true, hoursAsOf: Date.now()}));
  const merged = owned.places.find(p => p.id === concurrent[1].id);
  assert.equal(merged.distMi, 7, 'concurrent current-user distance corrections survive hours recovery');
  assert.equal(merged._members.likes, 3, 'concurrent member fields survive hours recovery');
  assert.equal(merged.photo, '/newer-photo.jpg', 'a newer image survives delayed recovery');
  assert.equal(merged.openNow, true, 'concurrent non-hours changes do not discard valid recovery');
  const staleHours = photoFixture('stale-hours');
  await mountPhoto('stale-hours', staleHours);
  const pendingHours = photoRequests.at(-1);
  await act(async () => owned.setPlaces(cur => cur.map(p => p.id === staleHours[1].id ? {...p, oh: {periods: []}, openNow: false, hoursAsOf: Date.now() + 1000} : p)));
  const beforeStale = { scans, view: result.view };
  await act(async () => answerPhoto(pendingHours, staleHours[1], {oh: {periods: []}, openNow: true, hoursAsOf: Date.now()}));
  assert.equal(scans, beforeStale.scans, 'late recovery does not overwrite a newer hours update');
  assert.equal(result.view, beforeStale.view, 'newer hours retain their current ranking');
  const olderProvider = photoFixture('older-provider');
  await mountPhoto('older-provider', olderProvider);
  const beforeOlder = { scans, view: result.view };
  await act(async () => answerPhoto(photoRequests.at(-1), olderProvider[1], {
    oh: {periods: []}, openNow: true, hoursAsOf: olderProvider[1].hoursAsOf - 3600000,
  }));
  assert.equal(scans, beforeOlder.scans, 'an older provider bundle cannot replace newer hours already held at request start');
  assert.equal(result.view, beforeOlder.view, 'older provider hours keep the existing ranking');
  const sequential = photoFixture('sequential');
  sequential[1].wfScore = 89;
  await mountPhoto('sequential', sequential, 'rated', {lat: 27, lng: -82}, {withTrend: true});
  const abandonedPopularity = finishPopularity;
  assert.ok(Object.hasOwn(sequential[1], '__gsInputs'), 'rated comparator creates its input fingerprint');
  await act(async () => answerPhoto(photoRequests.at(-1), sequential[1], {
    oh: {periods: []}, openNow: true, hoursAsOf: Date.now(),
  }));
  assert.notEqual(finishPopularity, abandonedPopularity, 'same-ID immutable hours replacement starts trend decoration for the new rows');
  const currentPopularity = finishPopularity;
  const afterHours = { scans, view: result.view };
  await act(async () => abandonedPopularity({[sequential[1].id]: 0.95}));
  assert.equal(scans, afterHours.scans, 'abandoned old-row trend completion cannot invalidate current inventory');
  assert.equal(owned.places[1].trending, undefined, 'old-row mutation does not masquerade as current decoration');
  await act(async () => currentPopularity({[sequential[1].id]: 0.95}));
  assert.deepEqual(result.view.map(p => p.id), [sequential[1].id, sequential[0].id], 'rated sort stays correct through hours clone then trend completion');
  assert.equal(Object.getOwnPropertyDescriptor(owned.places[1], '__gsInputs')?.enumerable, false, 'hours clones preserve the private comparator fingerprint');
  const authoritative = { ...sequential[0], governed_score: 97 };
  delete authoritative.__gsInputs;
  const authorityPatch = {...authoritative, oh: {periods: []}, openNow: true};
  const authorityClone = mergeBrowseEnrichment([authoritative], authoritative, authorityPatch)[0];
  assert.equal(Object.hasOwn(authorityClone, '__gsInputs'), false, 'upstream authoritative scores do not acquire a client fingerprint');
  const eventRows = photoFixture('event-change').map((p, i) => ({...p, lat: 27 + i / 10, photo: '/brand/wayfind.png'}));
  const eventProps = await mountPhoto('event-change', eventRows, 'rated', {lat: 27, lng: -82}, {withTrend: true});
  await act(async () => finishPopularity({}));
  const beforeEvent = finishPopularity;
  await act(async () => root.render(React.createElement(PhotoProbe, {...eventProps,
    events: [{lat: eventRows[1].lat, lng: -82, rank: 95}],
  })));
  assert.notEqual(finishPopularity, beforeEvent, 'new event evidence reruns trend decoration for the current rows');
  await act(async () => finishPopularity({}));
  assert.equal(result.view[0].id, eventRows[1].id, 'new nearby-event evidence changes the real rated order');
  assert.equal(result.view[0].trend_reason, 'Near a major event', 'event evidence keeps its truthful disclosure');
  const oldArea = photoFixture('old-area');
  const areaProps = await mountPhoto('area-change', oldArea);
  const pendingArea = photoRequests.at(-1);
  await act(async () => root.render(React.createElement(PhotoProbe, {...areaProps, center: {lat: 28, lng: -81}})));
  const beforeArea = { scans, view: result.view };
  await act(async () => answerPhoto(pendingArea, oldArea[1], {oh: {periods: []}, openNow: true, hoursAsOf: Date.now()}));
  assert.equal(scans, beforeArea.scans, 'old-region recovery cannot update the new search scope');
  assert.equal(result.view, beforeArea.view, 'old-region response leaves current browse results untouched');
  const canceled = photoFixture('canceled');
  await mountPhoto('canceled', canceled);
  const pendingCanceled = photoRequests.at(-1);
  await act(async () => root.render(React.createElement('span', null, 'left browse')));
  const beforeCancel = scans;
  await act(async () => answerPhoto(pendingCanceled, canceled[1], {oh: {periods: []}, openNow: true, hoursAsOf: Date.now()}));
  assert.equal(scans, beforeCancel, 'unmounted card recovery does not update browse state');
  assert.equal(canceled[1].photo, null, 'canceled recovery does not mutate the old card');
  console.log('test-browse-interaction-reuse: PASS — 400 places; unrelated updates reuse ranking; real async trend and hours changes refresh order; photo-only/equivalent/canceled responses reuse; concurrent distances and fields survive');
} finally {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  flushSync(() => root.unmount());
  dom.window.close();
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
