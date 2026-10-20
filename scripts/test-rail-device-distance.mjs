#!/usr/bin/env node
// Render the actual shared rail card with controlled device fixes. Search/ranking
// distances remain on input rows and must never become its visible miles label.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './lib/jsxLoad.mjs';

const root = process.cwd();
const entry = path.join(root, 'app/components/RailCard.js');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const props = { title: 'Rail fixture', place: { id: 'rail-distance-fixture', name: 'Rail fixture', lat: 0, lng: 1, distMi: 2.4 }, facts: ['240 reviews', '$$'] };
const { default: ServerRailCard } = await loadComponent(entry, root);
assert(!/\d+(?:\.\d+)? mi\b/.test(render(ServerRailCard, props)), 'SSR must not show search-center distance without a device fix');

const { default: RailCard } = await loadComponent(entry, root, { onGraph(graph) {
  const hookPath = graph.get(path.join(root, 'app/components/PlaceDistance.js'));
  assert(hookPath, 'the real rail card imports the shared device-distance hook');
  const source = readFileSync(hookPath, 'utf8');
  const changed = source.replace(/return useSyncExternalStore\([^;]+;/, 'return globalThis.__railDeviceFix;');
  assert.notEqual(changed, source, 'controlled device origin must replace the hook snapshot');
  writeFileSync(hookPath, changed);
} });

try {
  globalThis.__railDeviceFix = { lat: 0, lng: 0 };
  const nearby = render(RailCard, props);
  assert(nearby.includes('69.1 mi'), 'known device fix supplies distance even when result distance is 2.4');
  assert(!nearby.includes('2.4 mi'), 'search-center distance is never displayed');
  assert(nearby.includes('240 reviews') && nearby.includes('$$'), 'other facts remain visible');
  assert.equal(props.place.distMi, 2.4, 'display calculation preserves result/ranking distance');
  const railProps = [props, { ...props, title: 'Second fixture', place: { ...props.place, id: 'second-fixture', lng: 2, distMi: 1.2 } }];
  const renderRail = () => renderToStaticMarkup(React.createElement('div', null, railProps.map((item, index) => React.createElement(RailCard, { ...item, key: item.place.id, rank: index + 1 }))));
  const beforeMove = renderRail();
  globalThis.__railDeviceFix = { lat: 0, lng: 0.5 };
  const afterMove = renderRail();
  for (const html of [beforeMove, afterMove]) {
    assert(html.indexOf('Rail fixture') < html.indexOf('Second fixture'), 'device movement preserves rail card ordering');
  }
  assert.deepEqual(railProps.map(item => item.place.distMi), [2.4, 1.2], 'device movement preserves all ranking distances');
  assert(render(RailCard, props).includes('34.5 mi'), 'device movement changes visible distance');
  for (const device of [null, { lat: null, lng: 0 }, { lat: 91, lng: 0 }]) {
    globalThis.__railDeviceFix = device;
    assert(!/\d+(?:\.\d+)? mi\b/.test(render(RailCard, props)), 'unknown or invalid device coordinates omit miles');
  }
  globalThis.__railDeviceFix = { lat: 0, lng: 0 };
  assert(!/\d+(?:\.\d+)? mi\b/.test(render(RailCard, { ...props, place: { ...props.place, lat: undefined } })), 'missing destination coordinates never fall back to result distance');
  assert(render(RailCard, { title: 'Event fixture', facts: ['Tampa', '2.4 mi'] }).includes('2.4 mi'), 'non-place event facts keep their existing semantics');
  assert(render(RailCard, { ...props, facts: ['A 3 mi nature loop'] }).includes('A 3 mi nature loop'), 'editorial distance prose is preserved');
} finally {
  delete globalThis.__railDeviceFix;
}
// Home's private PlaceCard and the memoized IconicPlaceCard are separate
// renderers, so exercise both actual components rather than assuming rail parity.
const noop = () => {};
const fixture = { id: 'device-distance-fixture', name: 'Device Distance Fixture', rating: 4.6, reviews: 480, wfScore: 8.5, lat: 0, lng: 1, distMi: 2.4, photo: '/fixture.jpg', types: ['restaurant'], priceNum: 2 };
const iconicEntry = path.join(root, 'app/components/IconicPlaceCard.js');
const homeEntry = path.join(root, 'app/home.js');
function controlSnapshot(graph) {
  const hookPath = graph.get(path.join(root, 'app/components/PlaceDistance.js'));
  assert(hookPath, 'the real card imports the shared device-distance hook');
  const source = readFileSync(hookPath, 'utf8');
  const changed = source.replace(/return useSyncExternalStore\([^;]+;/, 'return globalThis.__railDeviceFix;');
  assert.notEqual(changed, source, 'controlled device origin must replace the hook snapshot');
  writeFileSync(hookPath, changed);
}
const { default: IconicPlaceCard } = await loadComponent(iconicEntry, root, { onGraph: controlSnapshot });
const { TestPlaceCard: HomePlaceCard } = await loadComponent(homeEntry, root, { onGraph(graph) {
  controlSnapshot(graph);
  const compiledEntry = graph.get(homeEntry);
  assert(compiledEntry, 'home component entry was compiled');
  writeFileSync(compiledEntry, readFileSync(compiledEntry, 'utf8') + '\nexport { PlaceCard as TestPlaceCard };\n');
} });

try {
  for (const [name, Component, cardProps] of [
    ['IconicPlaceCard', IconicPlaceCard, { place: fixture, rank: 1, onSave: noop, onLike: noop, onDislike: noop, onShare: noop }],
    ['Home PlaceCard', HomePlaceCard, { p: fixture, rank: 1, city: 'Tampa', onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop }],
  ]) {
    globalThis.__railDeviceFix = { lat: 0, lng: 0 };
    const known = render(Component, cardProps);
    assert(known.includes('Device Distance Fixture'), `${name}: fixture really renders`);
    assert(known.includes('69.1 mi'), `${name}: device-origin miles are visible`);
    assert(!known.includes('2.4 mi'), `${name}: searched-city distance is absent`);
    globalThis.__railDeviceFix = null;
    const unknown = render(Component, cardProps);
    assert(unknown.includes('Device Distance Fixture'), `${name}: unknown location retains the place card`);
    assert(!/\d+(?:\.\d+)? mi\b/.test(unknown), `${name}: unknown device fix omits miles`);
    globalThis.__railDeviceFix = { lat: 0, lng: 1 };
    assert(render(Component, cardProps).includes('0.0 mi'), `${name}: a known zero remains visible`);
    assert.equal(fixture.distMi, 2.4, `${name}: rendering preserves search/ranking distance`);
  }
} finally {
  delete globalThis.__railDeviceFix;
}
console.log('rail, iconic and home device distance: render assertions passed');
