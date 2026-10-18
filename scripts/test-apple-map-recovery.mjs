#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createAppleMapRecovery, createAppleMapSearch, planAppleMapRecovery, matchAppleRecovery } from '../lib/appleMapRecovery.js';
import { governedScoreOf } from '../lib/lawfulOrder.js';
import { railDistanceMi } from '../lib/railCoverage.js';

const bounds = { north: 28, south: 27, east: -82, west: -83 };
const origin = { lat: 27.5, lng: -82.5 };
const place = (id = 'one', extra = {}) => ({ id, name: `Independent Cafe ${id}`, city: 'Parrish', category: 'food',
  primaryType: 'cafe', types: ['cafe'], wfScore: 96, governed_score: 96, distMi: 0,
  lat: 1, lng: 1, mapCoord: { ok: false, reason: 'no-permitted-coordinate' }, ...extra });
const result = (p, extra = {}) => ({ name: p.name, locality: 'Parrish', coordinate: { latitude: 27.5, longitude: -82.5 }, ...extra });
const options = (places, extra = {}) => ({ places, bounds, origin, category: 'food', ...extra });
let assertions = 0;
async function check(name, fn) { await fn(); assertions++; console.log(`✓ ${name}`); }
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise((r) => setTimeout(r, 0));

await check('planner uses only existing disallowed identities, score/category gates and highest twelve', () => {
  const rows = Array.from({ length: 16 }, (_, i) => place(`p${i}`, { governed_score: 92 + i / 10 }));
  rows.push(place('low', { governed_score: 91 }), place('fresh', { mapCoord: { ok: true } }),
    place('unknown', { mapCoord: null }), place('wrong-category', { category: 'shopping' }),
    place('closed', { status: 'CLOSED_PERMANENTLY' }));
  const before = JSON.stringify(rows);
  const plan = planAppleMapRecovery(options(rows));
  assert.equal(plan.length, 12);
  assert.equal(plan[0].place.id, 'p15');
  assert.equal(plan.at(-1).place.id, 'p4');
  assert.equal(JSON.stringify(rows), before, 'planner must not mutate source records');
  assert.ok(plan.every((c) => c.place !== rows.find((p) => p.id === c.place.id)));
  assert.deepEqual(planAppleMapRecovery(options(rows, { bounds: null })), []);
});

await check('expired cache verdicts qualify; live and unknown verdicts never do', () => {
  const rows = [place('expired', { mapCoord: { ok: true, until: '2020-01-01' } }), place('fresh', { mapCoord: { ok: true, until: '2099-01-01' } })];
  assert.deepEqual(planAppleMapRecovery(options(rows)).map((c) => c.place.id), ['expired']);
});

await check('shared subcategory rules still exclude cafe identities from dinner', () => {
  const rows = [place('cafe')];
  assert.equal(planAppleMapRecovery(options(rows, { sub: 'cafes' })).length, 1);
  assert.equal(planAppleMapRecovery(options(rows, { sub: 'dinner' })).length, 0);
});

await check('inventory list type evidence works without a stored category field', () => {
  const cafe = place('list-cafe'); delete cafe.category;
  const bar = place('list-bar', { primaryType: 'bar', types: ['bar'] }); delete bar.category;
  assert.equal(planAppleMapRecovery(options([cafe], { sub: 'cafes' })).length, 1);
  assert.equal(planAppleMapRecovery(options([bar], { category: 'nightlife' })).length, 1);
  assert.equal(planAppleMapRecovery(options([cafe], { category: 'nightlife' })).length, 0);
  assert.equal(cafe.category, undefined, 'taxonomy resolution must not mutate list records');
});

await check('exact normalized name, strict returned bounds and known city', () => {
  const p = place('exact', { name: "Ryan’s Coffee House" });
  const c = planAppleMapRecovery(options([p]))[0];
  assert.ok(matchAppleRecovery(c, { places: [result(p, { name: "Ryan's Coffee House" })] }, bounds));
  for (const bad of [result(p, { name: "Ryan's Coffee House Annex" }), result(p, { locality: 'Orlando' }),
    result(p, { coordinate: { latitude: 28.01, longitude: -82.5 } }), result(p, { coordinate: { latitude: 27.5, longitude: -81.99 } }),
    result(p, { coordinate: { latitude: '27.5', longitude: -82.5 } })]) {
    assert.equal(matchAppleRecovery(c, { places: [bad] }, bounds), null);
  }
});

await check('ambiguous branches refuse absent street proof and accept unique exact numbered street', () => {
  const p = place('branch');
  const responses = [result(p, { formattedAddress: '100 Main St, Parrish FL' }),
    result(p, { formattedAddress: '200 Main St, Parrish FL', coordinate: { latitude: 27.6, longitude: -82.5 } })];
  assert.equal(matchAppleRecovery({ place: p }, { places: responses }, bounds), null);
  const target = { ...p, address: '100 Main Street, Parrish FL' };
  assert.equal(matchAppleRecovery({ place: target }, { places: responses }, bounds)?.lat, 27.5);
  assert.equal(matchAppleRecovery({ place: target, chain: true }, { places: [result(p)] }, bounds), null);
  const knownChain = planAppleMapRecovery(options([place('chain', { isChain: true })]))[0];
  assert.equal(matchAppleRecovery(knownChain, { places: [result(knownChain.place)] }, bounds), null);
});

await check('duplicate contextual identities do not imply a chain; separate same-name ids do', () => {
  const p = place('duplicate');
  assert.equal(planAppleMapRecovery(options([p, { ...p }]))[0].chain, false);
  assert.ok(planAppleMapRecovery(options([p, { ...p, id: 'other' }])).every((c) => c.chain));
  const mappedBranch = { ...p, id: 'mapped-branch', mapCoord: { ok: true } };
  const candidate = planAppleMapRecovery(options([p], { identityContext: [mappedBranch, p] }))[0];
  assert.equal(candidate.chain, true, 'already mapped identities still prove ambiguous name multiplicity');
  assert.equal(matchAppleRecovery(candidate, { places: [result(p)] }, bounds), null);
});

await check('matching needs positive locality or exact numbered street, never absence of contradiction alone', () => {
  const p = place('no-city', { city: '' });
  assert.equal(matchAppleRecovery({ place: p }, { places: [result(p, { locality: '' })] }, bounds), null);
  assert.equal(matchAppleRecovery({ place: p }, { places: [result(p)] }, bounds), null);
  assert.equal(matchAppleRecovery({ place: place() }, { places: [result(place(), { locality: '' })] }, bounds), null);
  const streetPlace = { ...p, address: '100 Main St' };
  assert.ok(matchAppleRecovery({ place: streetPlace }, { places: [result(p, { locality: '', formattedAddress: '100 Main Street, FL' })] }, bounds));
  const actualLocality = { ...p, locality: 'Citrus Park' };
  assert.equal(matchAppleRecovery({ place: actualLocality }, { places: [result(p, { locality: 'Tampa' })] }, bounds), null);
  assert.ok(matchAppleRecovery({ place: actualLocality }, { places: [result(p, { locality: 'Citrus Park' })] }, bounds));
});

await check('transient clone uses returned coordinates, real-origin distance and official score recomputation', async () => {
  const p = place('distance', { lat: NaN, lng: NaN, distMi: 500, distance_mi: 500, governed_score: 94, coordObservedAt: '2020-01-01', coordAttribution: 'old' });
  const saved = { ...p };
  let sent;
  const controller = createAppleMapRecovery({ search: async (query, opts) => { sent = { query, opts }; return { places: [result(p)] }; } });
  const published = [];
  const stats = await controller.recover(options([p], { onPlace: (next) => published.push(next) }));
  assert.equal(stats.recovered, 1);
  const next = published[0];
  assert.notEqual(next, p);
  assert.deepEqual({ lat: next.lat, lng: next.lng }, origin);
  assert.equal(next.distMi, railDistanceMi(origin.lat, origin.lng, next.lat, next.lng));
  const expected = { ...p, distMi: next.distMi, distance_mi: next.distMi }; delete expected.governed_score;
  assert.equal(next.governed_score, governedScoreOf(expected, 'Parrish'));
  assert.equal(next.coordSource, 'apple_live');
  assert.deepEqual(next.mapCoord, { ok: true, source: 'apple_live' });
  assert.ok(!('coordObservedAt' in next) && !('coordAttribution' in next));
  assert.deepEqual(p, saved);
  assert.deepEqual(sent.opts.bounds, bounds);
  assert.ok(!sent.query.includes('NaN') && !sent.query.includes('500'));
});

await check('recomputed score below 9.2 never publishes', async () => {
  const p = place('far', { wfScore: 92, governed_score: 92 });
  const controller = createAppleMapRecovery({ search: async () => ({ places: [result(p, { coordinate: { latitude: 27.99, longitude: -82.01 } })] }) });
  const stats = await controller.recover(options([p]));
  assert.equal(stats.recovered, 0); assert.equal(stats.rejected, 1);
});

await check('per-scope attempts prevent retries for successes, misses and failures', async () => {
  const rows = [place('success'), place('miss'), place('error')]; let calls = 0;
  const controller = createAppleMapRecovery({ search: async (query) => {
    calls++; if (query.includes('error')) throw new Error('service down');
    return { places: query.includes('miss') ? [] : [result(rows[0])] };
  } });
  const first = await controller.recover(options(rows));
  assert.equal(first.calls, 3); assert.equal(first.recovered, 1); assert.equal(first.rejected, 1); assert.equal(first.errors, 1);
  const again = await controller.recover(options(rows));
  assert.equal(again.planned, 0); assert.equal(calls, 3);
  assert.equal((await controller.recover(options(rows, { scope: 'new area' }))).calls, 3);
});

await check('two services maximum, twelve per run and thirty-six lifetime across distinct scopes', async () => {
  let concurrent = 0, maximum = 0;
  const controller = createAppleMapRecovery({ maxCalls: 1000, search: async () => {
    maximum = Math.max(maximum, ++concurrent); await tick(); concurrent--; return { places: [] };
  } });
  const rows = Array.from({ length: 30 }, (_, i) => place(`budget${i}`));
  for (let i = 0; i < 3; i++) {
    const batch = await controller.recover(options(rows, { scope: `scope${i}` }));
    assert.equal(batch.calls, 12); assert.equal(batch.eligible, 30); assert.equal(batch.planned, 12);
    assert.equal(batch.batchLimited, true); assert.equal(batch.remainingCandidates, 18);
  }
  const exhausted = await controller.recover(options(rows, { scope: 'scope4' }));
  assert.equal(exhausted.calls, 0); assert.equal(exhausted.budgetExhausted, true);
  assert.equal(controller.snapshot().calls, 36); assert.equal(maximum, 2);
});

await check('timeout finishes promptly and late responses cannot publish or exceed transport concurrency', async () => {
  const waiters = [deferred(), deferred()]; let calls = 0, published = 0;
  const controller = createAppleMapRecovery({ timeoutMs: 10, search: () => waiters[calls++].promise });
  const rows = [place('slow1'), place('slow2'), place('slow3')];
  const stats = await controller.recover(options(rows, { onPlace: () => published++ }));
  assert.equal(stats.timedOut, 2); assert.equal(calls, 2);
  const next = await controller.recover(options(rows, { scope: 'changed' }));
  assert.equal(next.calls, 0); assert.equal(next.capacityLimited, true);
  waiters[0].resolve({ places: [result(rows[0])] }); waiters[1].resolve({ places: [result(rows[1])] }); await tick();
  assert.equal(published, 0); assert.equal(controller.snapshot().inFlight, 0);
});

await check('aborted and superseded scopes cannot publish late responses', async () => {
  const late = deferred(); let published = 0;
  const controller = createAppleMapRecovery({ search: () => late.promise });
  const abort = new AbortController();
  const pending = controller.recover(options([place('cancel')], { signal: abort.signal, onPlace: () => published++ }));
  await tick(); abort.abort();
  assert.equal((await pending).aborted, true);
  late.resolve({ places: [result(place('cancel'))] }); await tick(); assert.equal(published, 0);
  const slow = deferred();
  const superseded = createAppleMapRecovery({ search: () => slow.promise });
  const previous = superseded.recover(options([place('old')], { onPlace: () => published++ })); await tick();
  await superseded.recover(options([])); assert.equal((await previous).aborted, true);
  slow.resolve({ places: [result(place('old'))] }); await tick(); assert.equal(published, 0);
});

await check('destroy and pre-aborted signal make no further calls', async () => {
  let calls = 0;
  const controller = createAppleMapRecovery({ search: async () => { calls++; return { places: [] }; } });
  const signal = new AbortController(); signal.abort();
  assert.equal((await controller.recover(options([place()], { signal: signal.signal }))).aborted, true);
  controller.destroy(); assert.equal((await controller.recover(options([place()]))).aborted, true);
  assert.equal(calls, 0);
});

await check('MapKit v6 adapter supplies an explicit search region and cancels the promise request', async () => {
  let service, request; const late = deferred();
  class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } }
  class CoordinateSpan { constructor(latitudeDelta, longitudeDelta) { Object.assign(this, { latitudeDelta, longitudeDelta }); } }
  class CoordinateRegion { constructor(center, span) { Object.assign(this, { center, span }); } }
  class Search {
    constructor(opts) { this.opts = opts; service = this; }
    search(query, opts) { this.query = query; this.searchOpts = opts; request = late.promise; return request; }
    cancel(value) { this.cancelled = value; }
  }
  const search = createAppleMapSearch({ Coordinate, CoordinateSpan, CoordinateRegion, Search });
  const abort = new AbortController(); const pending = search('Cafe, Parrish', { bounds, signal: abort.signal });
  assert.equal(service.opts.region.center.latitude, 27.5); assert.equal(service.opts.region.center.longitude, -82.5);
  assert.equal(service.searchOpts.region.span.latitudeDelta, 1); assert.equal(service.searchOpts.region.span.longitudeDelta, 1);
  assert.equal(service.searchOpts.signal, abort.signal, 'v6 receives the native cancellation signal');
  abort.abort(); assert.equal(service.cancelled, request); late.resolve({ places: [] }); await pending;
});

console.log(`Apple missing-pin recovery: ${assertions} behavioral scenarios passed.`);
