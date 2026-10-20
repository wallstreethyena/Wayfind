#!/usr/bin/env node
// Execute the real client hook and its real recovery controller. Only React's
// dispatcher and MapKit's network transport are controlled by this guard.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { loadComponent } from './lib/jsxLoad.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = (await loadComponent(fileURLToPath(new URL('../app/components/useAppleMapRecovery.js', import.meta.url)), root)).default;
const bounds = { north: 28, south: 27, east: -82, west: -83 };
const origin = { lat: 27.5, lng: -82.5 };
const place = (id) => ({ id, name: `Independent Cafe ${id}`, city: 'Parrish', category: 'food',
  primaryType: 'cafe', types: ['cafe'], wfScore: 96, governed_score: 96, mapCoord: { ok: false }, lat: 0, lng: 0 });
const response = (p) => ({ places: [{ name: p.name, locality: p.city, coordinate: { latitude: origin.lat, longitude: origin.lng } }] });
const answer = (request, places) => {
  const target = places.find((p) => request.query.startsWith(`${p.name},`));
  assert.ok(target, `request belongs to a supplied identity: ${request.query}`);
  request.resolve(response(target));
};
const tick = () => new Promise((r) => setImmediate(r));
let count = 0;
const diagnostics = [];
const originalInfo = console.info;
console.info = (...args) => { diagnostics.push(args); };
process.on('exit', () => { console.info = originalInfo; });

function hookHost() {
  const slots = [], effects = [];
  let cursor = 0;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const dispatcher = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(make, deps) { const i = cursor++; if (!(i in slots) || !same(slots[i].deps, deps)) slots[i] = { deps, value: make() }; return slots[i].value; },
    useEffect(effect, deps) { const i = cursor++; if (!(i in slots) || !same(slots[i].deps, deps)) effects.push([i, effect, deps]); },
  };
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  return {
    render(props) {
      cursor = 0;
      const previous = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        const value = hook(props);
        assert.ok(Array.isArray(value.places), 'the real hook must return a place array in every lifecycle state');
        return value;
      } finally { internals.ReactCurrentDispatcher.current = previous; }
    },
    flush() { for (const [i, effect, deps] of effects.splice(0)) { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; } },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function fakeSDK({ ignoreAbort = false, immediate = false } = {}) {
  const requests = []; let outstanding = 0, maximum = 0;
  class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } }
  class CoordinateSpan { constructor(latitudeDelta, longitudeDelta) { Object.assign(this, { latitudeDelta, longitudeDelta }); } }
  class CoordinateRegion { constructor(center, span) { Object.assign(this, { center, span }); } }
  class Search {
    search(query, opts) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const request = { query, opts, promise, resolve, reject, cancelled: false };
      requests.push(request); maximum = Math.max(maximum, ++outstanding);
      const cancel = () => {
        request.cancelled = true;
        if (!ignoreAbort) reject(new DOMException('Aborted', 'AbortError'));
      };
      request.cancel = cancel;
      opts.signal?.addEventListener('abort', cancel, { once: true });
      promise.then(() => { outstanding--; }, () => { outstanding--; });
      if (immediate) resolve({ places: [] });
      return promise;
    }
    cancel(promise) { requests.find((r) => r.promise === promise)?.cancel(); }
  }
  return { mapkit: { Coordinate, CoordinateSpan, CoordinateRegion, Search }, requests, maximum: () => maximum };
}

function mount(sdk, extra = {}) {
  const host = hookHost();
  const props = { places: [place('one'), place('two'), place('three')], existing: [], bounds, origin, category: 'food', sub: 'cafes', mapkit: sdk.mapkit, enabled: true, ready: true, ...extra };
  const render = (over = {}) => { Object.assign(props, over); const value = host.render(props); host.flush(); return value; };
  return { host, props, render };
}
async function check(name, run) { await run(); count++; console.log(`✓ ${name}`); }

await check('accepted result rerenders without cancelling the two remaining searches', async () => {
  const sdk = fakeSDK(); const h = mount(sdk);
  try {
    h.render(); await tick(); assert.equal(sdk.requests.length, 2);
    answer(sdk.requests[0], h.props.places); await tick();
    const first = h.render({ places: h.props.places.map((p) => ({ ...p })) });
    assert.deepEqual(first.places.map((p) => p.id), ['one']);
    assert.equal(sdk.requests.length, 3, 'the third planned identity starts after the first accepted result');
    assert.ok(sdk.requests.slice(1).every((r) => !r.cancelled && !r.opts.signal.aborted));
    answer(sdk.requests[1], h.props.places); answer(sdk.requests[2], h.props.places); await tick();
    const completed = h.render();
    assert.deepEqual(completed.places.map((p) => p.id).sort(), ['one', 'three', 'two']);
    assert.equal(completed.status, 'ready'); assert.equal(completed.stats.recovered, 3);
    assert.equal(sdk.maximum(), 2);
  } finally { h.host.unmount(); }
});

await check('photo-only updates preserve accepted pins and leave the remaining batch running', async () => {
  const sdk = fakeSDK(); const mapped = { ...place('mapped'), mapCoord: { ok: true } };
  const h = mount(sdk, { existing: [mapped] });
  try {
    h.render(); await tick(); answer(sdk.requests[0], h.props.places); await tick();
    assert.equal(h.render().places.length, 1); assert.equal(sdk.requests.length, 3);
    const updated = h.props.places.map((p) => ({ ...p, photo: `/updated-photo-${p.id}.jpg` }));
    const progressive = h.render({ places: updated, existing: [{ ...mapped, photo: '/updated-mapped-photo.jpg' }] });
    assert.deepEqual(progressive.places.map((p) => p.id), ['one'], 'healing a photo cannot hide the accepted Apple coordinate');
    assert.ok(sdk.requests.slice(1).every((r) => !r.opts.signal.aborted), 'photo changes cannot abort the rest of the batch');
    answer(sdk.requests[1], h.props.places); answer(sdk.requests[2], h.props.places); await tick();
    const complete = h.render(); assert.equal(complete.places.length, 3); assert.equal(complete.stats.recovered, 3);
    const metadataOnly = h.props.places.map((p) => ({ ...p, photoRef: 'new-photo-ref', photos: [{ name: 'new-photo' }],
      editorial: 'Updated prose', _invEditorial: 'Updated card prose', editorialSummary: { text: 'Updated prose' }, score_explanation: { score: 1 } }));
    assert.equal(h.render({ places: metadataOnly }).places.length, 3, 'photo/editorial/receipt metadata cannot invalidate semantic evidence');
    await tick(); assert.equal(sdk.requests.length, 3, 'metadata updates spend no extra search attempts');
    assert.equal(h.render().status, 'ready');
  } finally { h.host.unmount(); }
});

await check('filter change aborts the old batch and prevents late accepted results', async () => {
  const sdk = fakeSDK({ ignoreAbort: true }); const h = mount(sdk);
  try {
    h.render(); await tick(); assert.equal(sdk.requests.length, 2);
    h.render({ sub: 'dinner' }); assert.ok(sdk.requests.every((r) => r.opts.signal.aborted));
    answer(sdk.requests[0], h.props.places); answer(sdk.requests[1], h.props.places); await tick();
    assert.deepEqual(h.render().places, []); assert.equal(sdk.requests.length, 2);
  } finally { h.host.unmount(); }
});

await check('viewport handoff waits for native abort settlement and starts the new scope', async () => {
  const sdk = fakeSDK(); const h = mount(sdk, { places: [place('one'), place('two')] });
  try {
    h.render(); await tick(); assert.equal(sdk.requests.length, 2);
    h.render({ bounds: { ...bounds, north: 27.9 } }); await tick();
    assert.ok(sdk.requests.slice(0, 2).every((r) => r.opts.signal.aborted));
    assert.equal(sdk.requests.length, 4, 'the new viewport gets two searches after old cancellation settles');
    assert.ok(sdk.requests.slice(2).every((r) => !r.opts.signal.aborted));
    answer(sdk.requests[2], h.props.places); answer(sdk.requests[3], h.props.places); await tick();
    assert.equal(h.render().places.length, 2); assert.equal(sdk.maximum(), 2);
  } finally { h.host.unmount(); }
});

await check('3D or renderer-failure disable aborts work and hides recovered Apple results', async () => {
  const sdk = fakeSDK({ ignoreAbort: true }); const h = mount(sdk);
  try {
    h.render(); await tick(); answer(sdk.requests[0], h.props.places); await tick();
    assert.equal(h.render().places.length, 1);
    assert.deepEqual(h.render({ enabled: false }).places, []);
    assert.ok(sdk.requests.slice(1).every((r) => r.opts.signal.aborted));
    for (let i = 1; i < sdk.requests.length; i++) answer(sdk.requests[i], h.props.places);
    await tick(); assert.deepEqual(h.render().places, []);
    const reopened = h.render({ enabled: true }); await tick();
    assert.equal(reopened.places.length, 1, 'only the previously accepted session result survives reopening');
    assert.equal(sdk.requests.length, 3, 'same-scope cancelled identities do not enter a retry loop');
  } finally { h.host.unmount(); }
});

await check('origin changes synchronously hide prior results and refuse old-origin late responses', async () => {
  const sdk = fakeSDK({ ignoreAbort: true }); const h = mount(sdk);
  try {
    h.render(); await tick(); answer(sdk.requests[0], h.props.places); await tick();
    assert.equal(h.render().places.length, 1);
    assert.deepEqual(h.render({ origin: { ...origin, lat: 27.51 }, ready: false }).places, []);
    assert.ok(sdk.requests.slice(1).every((r) => r.opts.signal.aborted));
    for (let i = 1; i < sdk.requests.length; i++) answer(sdk.requests[i], h.props.places);
    await tick(); assert.deepEqual(h.render().places, []);
  } finally { h.host.unmount(); }
});

await check('engine lifetime budget survives disabling and reenabling the same SDK', async () => {
  const sdk = fakeSDK({ immediate: true }); const h = mount(sdk, { places: Array.from({ length: 12 }, (_, i) => place(`budget${i}`)) });
  try {
    for (let scope = 0; scope < 3; scope++) {
      h.render({ enabled: true, bounds: { ...bounds, north: 28 - scope / 100 } }); await tick();
      assert.equal(h.render().stats.calls, 12);
      h.render({ enabled: false }); await tick();
    }
    assert.equal(sdk.requests.length, 36);
    h.render({ enabled: true, bounds: { ...bounds, north: 27.95 } }); await tick();
    const exhausted = h.render();
    assert.equal(sdk.requests.length, 36); assert.equal(exhausted.stats.calls, 0); assert.equal(exhausted.stats.budgetExhausted, true);
  } finally { h.host.unmount(); }
});

await check('area-not-ready and initially disabled states never start Apple requests', async () => {
  const sdk = fakeSDK(); const h = mount(sdk, { ready: false });
  try {
    assert.deepEqual(h.render().places, []); await tick(); assert.equal(sdk.requests.length, 0);
    h.render({ ready: true, enabled: false }); await tick(); assert.equal(sdk.requests.length, 0);
    h.render({ enabled: true }); await tick(); assert.equal(sdk.requests.length, 2);
  } finally { h.host.unmount(); await tick(); }
});

await check('already mapped same-name branch remains part of identity proof', async () => {
  const sdk = fakeSDK();
  const missing = place('missing-branch');
  const mapped = { ...missing, id: 'mapped-branch', mapCoord: { ok: true } };
  const h = mount(sdk, { places: [missing], existing: [mapped] });
  try {
    h.render(); await tick(); assert.equal(sdk.requests.length, 1);
    answer(sdk.requests[0], [missing]); await tick();
    const result = h.render();
    assert.deepEqual(result.places, []); assert.equal(result.stats.rejected, 1, 'a same-city match cannot choose a known branch without numbered-street proof');
  } finally { h.host.unmount(); }
});

await check('changed candidate evidence invalidates a previously accepted cached result', async () => {
  const sdk = fakeSDK(); const h = mount(sdk, { places: [place('changed')] });
  try {
    h.render(); await tick(); answer(sdk.requests[0], h.props.places); await tick();
    assert.equal(h.render().places.length, 1);
    const changed = h.props.places.map((p) => ({ ...p, status: 'CLOSED_PERMANENTLY' }));
    assert.deepEqual(h.render({ places: changed }).places, [], 'old location must not preserve superseded business evidence');
    assert.equal(sdk.requests.length, 1);
  } finally { h.host.unmount(); }
});

await check('material identity, taxonomy, score and coordinate-policy changes invalidate cached pins', async () => {
  const changes = [
    ['name', { name: 'A different Cafe' }], ['locality', { locality: 'Tampa' }], ['address', { address: '100 Main St' }],
    ['chain', { isChain: true }], ['status', { businessStatus: 'CLOSED_PERMANENTLY' }],
    ['primary type', { primaryType: 'bank' }], ['type alias', { google_types: ['bank'] }],
    ['category', { category: 'shopping' }], ['secondary category', { secondaryCategories: ['nightlife'] }],
    ['tag', { tags: ['dinner'] }], ['score', { wfScore: 90, governed_score: 90 }],
    ['rating', { rating: 4.9 }], ['reviews', { reviews: 300 }], ['creator evidence', { creator_video: true }],
    ['trend', { trending: true, trend_reason: 'Verified demand' }], ['distance', { distMi: 20 }],
    ['freshness', { mapCoord: { ok: false, until: '2026-10-01T00:00:00Z' } }],
    ['coordinate permission', { mapCoord: { ok: true, source: 'official_venue' } }],
  ];
  for (const [label, changed] of changes) {
    const sdk = fakeSDK(); const h = mount(sdk, { places: [place('material')] });
    try {
      h.render(); await tick(); answer(sdk.requests[0], h.props.places); await tick();
      assert.equal(h.render().places.length, 1, `${label}: positive accepted control`);
      assert.deepEqual(h.render({ places: h.props.places.map((p) => ({ ...p, ...changed })) }).places, [], `${label}: superseded evidence cannot keep an accepted pin`);
      await tick(); assert.equal(sdk.requests.length, 1, `${label}: invalidation cannot reset the session attempt budget`);
    } finally { h.host.unmount(); }
  }
});

await check('new score evidence aborts an in-flight result with the same fingerprint used by cache validity', async () => {
  const sdk = fakeSDK({ ignoreAbort: true }); const h = mount(sdk, { places: [place('pending-score')] });
  try {
    h.render(); await tick(); assert.equal(sdk.requests.length, 1);
    h.render({ places: h.props.places.map((p) => ({ ...p, creator_video: true })) });
    assert.equal(sdk.requests[0].opts.signal.aborted, true, 'creator score evidence must restart the effect, not just invalidate its future result');
    answer(sdk.requests[0], h.props.places); await tick();
    assert.deepEqual(h.render().places, []); assert.equal(sdk.requests.length, 1);
  } finally { h.host.unmount(); }
});

await check('new mapped branch evidence aborts an in-flight single-location assumption', async () => {
  const sdk = fakeSDK({ ignoreAbort: true }); const missing = place('pending-branch');
  const h = mount(sdk, { places: [missing] });
  try {
    h.render(); await tick(); assert.equal(sdk.requests.length, 1);
    const mapped = { ...missing, id: 'new-mapped-branch', mapCoord: { ok: true } };
    h.render({ existing: [mapped] });
    assert.equal(sdk.requests[0].opts.signal.aborted, true, 'the prior search cannot retain an outdated unique-name assumption');
    answer(sdk.requests[0], [missing]); await tick();
    assert.deepEqual(h.render().places, []); assert.equal(sdk.requests.length, 1, 'changed identity evidence cannot create a same-scope retry loop');
  } finally { h.host.unmount(); }
});

await check('completed recovery diagnostics contain only counts and flags, including service errors', async () => {
  const sdk = fakeSDK(); const h = mount(sdk, { places: [place('private-id')] });
  try {
    const start = diagnostics.length;
    h.render(); await tick(); sdk.requests[0].reject(new Error('Private query, identifier and coordinates must not be logged')); await tick();
    assert.equal(h.render().stats.errors, 1);
    const emitted = diagnostics.slice(start); assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0], '[Wayfind Apple recovery]');
    const summary = JSON.parse(emitted[0][1]); assert.equal(summary.errors, 1); assert.equal(summary.recovered, 0); assert.equal(summary.calls, 1);
    for (const [prefix, text] of diagnostics) {
      assert.equal(prefix, '[Wayfind Apple recovery]');
      const counts = JSON.parse(text);
      assert.ok(Object.values(counts).every((value) => typeof value === 'number' || typeof value === 'boolean'), 'no query, content, coordinate, identifier or raw error values');
      assert.ok(!Object.keys(counts).some((key) => /place|query|name|coordinate|lat|lng|source|message|stack/i.test(key)));
    }
  } finally { h.host.unmount(); }
});

console.log(`Apple recovery hook integration: ${count} lifecycle scenarios passed.`);
