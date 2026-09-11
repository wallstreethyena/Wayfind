import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as mapData from '../lib/mapAreaData.js';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../app/components/screens/Map.js', import.meta.url), 'utf8');
const result = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true });
assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const module = { exports: {} };
const stub = name => {
  if (name === 'react') return React;
  if (name.endsWith('mapAreaData')) return mapData;
  if (name === '../kit') return { C: { border: '#aaa', text: '#fff', accent: '#ffb47c' } };
  if (name === '../AppleExplorerMap') return { default: props => React.createElement('div', { 'data-apple-map': true, 'data-place-count': props.places.length }) };
  if (name === '../IconicPlaceCard') return { default: () => null };
  if (name === '../useMissingPlacePhotos') return { default: () => () => null };
  if (name.endsWith('todaysBest')) return { tbPhotoUrl: () => null };
  if (name.endsWith('placePhoto')) return { hasPlacePhotoRef: () => false };
  throw new Error(`Unmocked screen dependency: ${name}`);
};
vm.runInNewContext(result.outputText, { module, exports: module.exports, require: stub, React, process: { env: {} }, console, setTimeout, clearTimeout, URLSearchParams, AbortController });
const html = renderToStaticMarkup(React.createElement(module.exports.default, { ctx: {
  mapMode: 'places', mapRetryKey: 0, center: { lat: 28.5, lng: -81.5 },
  Hol: { worldCup: () => false }, setMapPreview() {}, setMapDrawer() {},
} }));
assert.match(html, /data-apple-map="true"/);
assert.match(html, /data-place-count="0"/);
assert.match(html, /Finding every 9\.2\+ place in this area/);
assert.match(html, /Wayfind 9\.2\+/);
assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1, 'only All places starts selected');
for (const category of mapData.MAP_CATEGORIES) assert.ok(html.includes(category.label), `filter ${category.label} rendered`);
assert.match(html, /min-height:44px/);
assert.match(html, /@media \(min-width: 760px\)/);
assert.doesNotMatch(html, /Switch to 3D|ranked by fit|MapLibre/);
assert.match(html, /Search for a location/);
assert.match(html, /Near me/);
console.log('MapScreen SSR: real component compiles and renders eight filters, All selected, Apple renderer, loading state, search/location controls and responsive CSS. Browser layout not asserted.');
