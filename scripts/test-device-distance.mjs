#!/usr/bin/env node
// Real coordinate math, lifecycle and component execution. No network or paid API.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as distance from '../lib/deviceDistance.js';
import { createDeviceLocationStore, DEVICE_LOCATION_MAX_AGE_MS } from '../lib/deviceLocationStore.js';
import { loadComponent } from './lib/jsxLoad.mjs';

function fakeEnvironment({ supported = true } = {}) {
  let clock = 100_000;
  let nextId = 0;
  const watches = new Map(), allWatches = new Map(), timers = new Map(), events = new Map();
  const calls = [], cleared = [];
  const permission = { state: 'granted', addEventListener: (name, fn) => events.set('permission:' + name, fn), removeEventListener: name => events.delete('permission:' + name) };
  const env = {
    now: () => clock,
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    navigator: { permissions: { query: async () => permission } },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  };
  if (supported) env.navigator.geolocation = {
    watchPosition: (success, error, options) => { const id = ++nextId; watches.set(id, { success, error }); allWatches.set(id, { success, error }); calls.push(options); return id; },
    clearWatch: id => { cleared.push(id); watches.delete(id); },
  };
  return {
    env, watches, calls, cleared, timers, events, permission,
    fix: (coords, timestamp = clock) => { for (const watch of [...watches.values()]) watch.success({ coords, timestamp }); },
    error: code => { for (const watch of [...watches.values()]) watch.error({ code }); },
    advance: ms => { clock += ms; for (const [id, t] of [...timers]) if (t.at <= clock) { timers.delete(id); t.fn(); } },
    visibility: state => { env.document.visibilityState = state; events.get('visibilitychange')?.(); },
    revoke: () => { permission.state = 'denied'; events.get('permission:change')?.(); },
    lateFix: coords => { for (const watch of allWatches.values()) watch.success({ coords, timestamp: clock }); },
  };
}

const { normalizeCoordinates, distanceMiles, formatDistanceMiles } = distance;

// Exercise the DEFAULT browser adapter, not just the injected test environment.
// Window timers reject an arbitrary object as their receiver. Arrow-only fakes
// used above cannot expose this browser brand check (Sentry WAYFIND-1A).
const locationSource = readFileSync(path.resolve('lib/deviceLocationStore.js'), 'utf8');
function exerciseBrowserTimers(source) {
  const browser = fakeEnvironment();
  browser.env.now = Date.now;
  let scheduled = 0, cancelled = 0;
  function setBrowserTimeout(callback, delay) {
    assert.equal(this, undefined, 'browser timer must be called without the adapter as receiver');
    scheduled++;
    return browser.env.setTimeout(callback, delay);
  }
  function clearBrowserTimeout(id) {
    assert.equal(this, undefined, 'browser timer cleanup must preserve its native receiver');
    cancelled++;
    return browser.env.clearTimeout(id);
  }
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    exports, require: spec => {
      assert.equal(spec, './deviceDistance.js');
      return distance;
    },
    window: { navigator: browser.env.navigator, document: browser.env.document },
    setTimeout: setBrowserTimeout, clearTimeout: clearBrowserTimeout,
  });
  const store = exports.createDeviceLocationStore();
  const unsubscribe = store.subscribe(() => {});
  const fix = () => browser.fix({ latitude: 28, longitude: -81 }, Date.now());
  assert.doesNotThrow(fix, 'a successful GPS callback must not throw Illegal invocation');
  assert.equal(store.getSnapshot()?.lat, 28);
  assert.equal(browser.timers.size, 1, 'a successful fix schedules freshness expiry');
  assert.doesNotThrow(fix, 'a second GPS callback must safely replace the timer');
  assert.equal(browser.timers.size, 1);
  assert.doesNotThrow(() => browser.visibility('hidden'));
  assert.equal(browser.watches.size, 0);
  assert.equal(browser.timers.size, 0);
  browser.visibility('visible');
  fix();
  browser.advance(DEVICE_LOCATION_MAX_AGE_MS);
  assert.equal(browser.watches.size, 1, 'expiry renews the watch');
  assert.equal(store.getSnapshot(), null);
  assert.doesNotThrow(() => browser.error(3), 'transient GPS errors schedule a safe retry');
  browser.advance(DEVICE_LOCATION_MAX_AGE_MS);
  assert.equal(browser.watches.size, 1);
  fix();
  assert.doesNotThrow(() => browser.error(1), 'denial cancels the native timer');
  assert.equal(browser.timers.size, 0);
  unsubscribe();
  assert.equal(browser.events.size, 0);
  assert.ok(scheduled >= 5 && cancelled >= 3, 'both timer APIs were exercised');
}
exerciseBrowserTimers(locationSource);
for (const [wrapper, original] of [
  ['setTimeout: (callback, delay) => setTimeout(callback, delay)', 'setTimeout'],
  ['clearTimeout: id => clearTimeout(id)', 'clearTimeout'],
]) {
  const mutated = locationSource.replace(wrapper, original);
  assert.notEqual(mutated, locationSource, 'timer receiver mutation actually applied');
  assert.throws(() => exerciseBrowserTimers(mutated), /browser timer/, 'reintroducing either timer bug must fail');
}
for (const bad of [null, undefined, {}, { lat: null, lng: 0 }, { lat: '', lng: 0 }, { lat: ' ', lng: 0 }, { lat: true, lng: 0 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: '0x10', lng: 0 }, { latitude: 0, longitude: null }]) {
  assert.equal(normalizeCoordinates(bad), null, `reject malformed coordinates: ${JSON.stringify(bad)}`);
  assert.equal(distanceMiles({ lat: 0, lng: 0 }, bad), null);
}
assert.deepEqual(normalizeCoordinates({ latitude: '0', longitude: '-0' }), { lat: 0, lng: -0 });
assert.deepEqual(normalizeCoordinates({ lat: -90, lng: 180 }), { lat: -90, lng: 180 });
assert.equal(distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
assert.ok(Math.abs(distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 69.0934) < 0.001);
assert.ok(Number.isFinite(distanceMiles({ lat: 90, lng: 0 }, { lat: -90, lng: 180 })));
assert.equal(formatDistanceMiles(0), '0.0');
for (const bad of [null, undefined, NaN, Infinity, -1, '1']) assert.equal(formatDistanceMiles(bad), null);

const f = fakeEnvironment();
const store = createDeviceLocationStore(f.env);
assert.equal(store.getServerSnapshot(), null);
assert.equal(store.getSnapshot(), null);
assert.equal(f.calls.length, 0, 'import/read never requests a position');
let changes = 0;
const offA = store.subscribe(() => changes++), offB = store.subscribe(() => changes++);
await Promise.resolve();
assert.equal(f.calls.length, 1, 'multiple consumers share one watch');
assert.deepEqual(f.calls[0], { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
const place = Object.freeze({ lat: 28.5383, lng: -81.3792, distMi: 0.1 }); // Orlando search result
const otherPlace = Object.freeze({ lat: 27.95, lng: -82.46, distMi: 1.2 });
const rows = Object.freeze([place, otherPlace]);
const beforeRows = JSON.stringify(rows);
f.fix({ latitude: 40.7128, longitude: -74.006 }); // Device is in NYC, not search center.
assert.ok(distanceMiles(store.getSnapshot(), place) > 900, 'search distMi never becomes device distance');
assert.ok(changes > 0);
const initial = store.getSnapshot();
assert.equal(store.getSnapshot(), initial, 'snapshot identity is stable between updates');
assert.equal(store.getServerSnapshot(), null, 'SSR remains empty even with an active client fix');
f.fix({ latitude: 28.5383, longitude: -81.3792 });
assert.equal(distanceMiles(store.getSnapshot(), place), 0, 'device movement updates distance without refetch');
assert.equal(JSON.stringify(rows), beforeRows, 'source distMi and recommendation order remain untouched');
f.advance(DEVICE_LOCATION_MAX_AGE_MS);
assert.equal(store.getSnapshot(), null, 'old fixes disappear at the freshness boundary');
assert.equal(f.watches.size, 1, 'stationary fixes refresh without leaking watches');
assert.equal(f.calls.length, 2, 'expiry actively reacquires a stationary device fix');
f.fix({ latitude: 28, longitude: -81 }, f.env.now() - DEVICE_LOCATION_MAX_AGE_MS);
assert.equal(store.getSnapshot(), null, 'stale browser fixes are rejected');
f.fix({ latitude: 28, longitude: -81 });
f.visibility('hidden');
assert.equal(f.watches.size, 0);
assert.equal(store.getSnapshot(), null);
f.visibility('visible');
assert.equal(f.watches.size, 1, 'visibility resumes one watch');
f.fix({ latitude: 28, longitude: -81 });
f.error(3);
assert.equal(store.getSnapshot(), null, 'timeout removes unavailable fix');
assert.equal(f.watches.size, 0, 'timed-out watch is released before retry');
const beforeRetry = f.calls.length;
f.advance(DEVICE_LOCATION_MAX_AGE_MS - 1);
assert.equal(f.calls.length, beforeRetry, 'transient errors do not create aggressive retries');
f.advance(1);
assert.equal(f.calls.length, beforeRetry + 1, 'transient error retries after bounded delay');
assert.equal(f.watches.size, 1);
f.fix({ latitude: 28, longitude: -81 });
f.error(1);
assert.equal(store.getSnapshot(), null, 'denial immediately removes existing location');
assert.equal(f.watches.size, 0, 'denial stops the watch');
f.advance(DEVICE_LOCATION_MAX_AGE_MS * 2);
assert.equal(f.watches.size, 0, 'permission denial never retries');
f.lateFix({ latitude: 0, longitude: 0 });
assert.equal(store.getSnapshot(), null, 'late callbacks cannot restore denied location');
offA();
offB();
assert.equal(f.watches.size, 0);
assert.equal(f.timers.size, 0);
assert.equal(f.events.size, 0, 'all permission/visibility listeners are released');

const shared = fakeEnvironment();
const sharedStore = createDeviceLocationStore(shared.env);
const off1 = sharedStore.subscribe(() => {}), off2 = sharedStore.subscribe(() => {});
await Promise.resolve();
off1();
assert.equal(shared.watches.size, 1, 'one consumer leaving keeps remaining consumer active');
shared.fix({ latitude: 0, longitude: 0 });
off2();
assert.equal(shared.watches.size, 0, 'last consumer leaving releases watch');
assert.equal(sharedStore.getSnapshot(), null);
const off3 = sharedStore.subscribe(() => {});
await Promise.resolve();
shared.fix({ latitude: 0, longitude: 0 });
shared.revoke();
assert.equal(sharedStore.getSnapshot(), null, 'Permissions API revocation clears fix');
assert.equal(shared.watches.size, 0);
off3();
const unsupported = fakeEnvironment({ supported: false });
const unsupportedStore = createDeviceLocationStore(unsupported.env);
const offUnsupported = unsupportedStore.subscribe(() => {});
await Promise.resolve();
assert.equal(unsupportedStore.getSnapshot(), null);
offUnsupported();

// Execute the actual component/hooks with a controlled external-store reader,
// then execute React's true SSR path separately below.
const componentPath = path.resolve('app/components/PlaceDistance.js');
const compiled = ts.transpileModule(readFileSync(componentPath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
let current = { lat: 28.5383, lng: -81.3792 };
const controlledStore = { subscribe() {}, getSnapshot: () => current, getServerSnapshot: () => null };
vm.runInNewContext(compiled, { exports, require: spec => {
  if (spec === 'react') return { useSyncExternalStore: (subscribe, getSnapshot, getServerSnapshot) => {
    assert.equal(subscribe, controlledStore.subscribe);
    assert.equal(getServerSnapshot(), null);
    return getSnapshot();
  } };
  if (spec === 'react/jsx-runtime') return jsxRuntime;
  if (spec.includes('deviceLocationStore')) return { deviceLocationStore: controlledStore };
  if (spec.includes('deviceDistance')) return distance;
  throw new Error('Unexpected dependency ' + spec);
} });
assert.equal(exports.usePlaceDistance(place), 0);
assert.equal(exports.default({ place, prefix: ' · ', className: 'distance' }).props.children.join(''), ' · 0.0 mi');
current = { lat: 40.7128, lng: -74.006 };
assert.ok(exports.usePlaceDistance(place) > 900);
current = null;
assert.equal(exports.default({ place }), null);
const ssr = await loadComponent(componentPath, process.cwd());
assert.equal(renderToStaticMarkup(React.createElement(ssr.default, { place })), '', 'real React SSR emits no guessed distance');
// Prove the process gate turns red when the historical search-distance fallback
// is reintroduced, without mutating the shared working tree.
const broken = readFileSync(path.resolve('lib/deviceDistance.js'), 'utf8').replace('const a = normalizeCoordinates(origin);', 'return destination?.distMi ?? 0;\n  const a = normalizeCoordinates(origin);');
assert.ok(broken.includes('return destination?.distMi ?? 0;'), 'mutation actually applied');
const red = spawnSync(process.execPath, ['--input-type=module'], { encoding: 'utf8', input: `import assert from 'node:assert/strict';\nimport { distanceMiles } from 'data:text/javascript;base64,${Buffer.from(broken).toString('base64')}';\nassert.ok(distanceMiles({lat:40.7128,lng:-74.006}, {lat:28.5383,lng:-81.3792,distMi:0.1}) > 900, 'device origin must override search-center distMi');` });
assert.equal(red.status, 1, 'historical bug makes child test process exit nonzero');
assert.match(red.stderr, /AssertionError/);
console.log('PASS device distance: coordinates, moving device, source immutability, freshness, permission, shared lifecycle, component and SSR');
