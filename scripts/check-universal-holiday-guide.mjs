import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {flushSync} from 'react-dom';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './lib/jsxLoad.mjs';
import {JSDOM} from 'jsdom';
const rel='app/guides/universal-orlando-christmas-2026/';
const {default:Page}=await loadComponent(path.resolve(rel+'page.js'), process.cwd());
const {UNIVERSAL_STOPS}=await loadComponent(path.resolve(rel+'UniversalHolidayMap.js'), process.cwd());
const {UNIVERSAL_VIEW_MAPS,parkMapImage}=await import('../lib/parkMaps2026.js');
const markup=renderToStaticMarkup(React.createElement(Page));
const dom=new JSDOM(markup);const doc=dom.window.document;
function verifyGuide(doc) {
const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);
assert.equal(new Set(ids).size,ids.length,'guide must have no duplicate IDs');
for(const a of doc.querySelectorAll('a[href^="#"]'))assert.ok(doc.getElementById(a.hash.slice(1)),a.getAttribute('href'));
assert.equal(doc.querySelectorAll('h1').length,1);
assert.equal(UNIVERSAL_STOPS.length,17);
// Owner-supplied illustrated park maps (lib/parkMaps2026.js): one park per view,
// Islands first. Every stop targets real guide content, sits inside its map,
// and every view's illustration exists on disk.
for(const stop of UNIVERSAL_STOPS){assert.ok(doc.getElementById(stop.target),stop.target);assert.ok(stop.x>2&&stop.x<98&&stop.y>4&&stop.y<99,'pin inside its map: '+stop.target);assert.ok(UNIVERSAL_VIEW_MAPS[stop.park],'stop park has a map view: '+stop.target);}
for(const key of Object.values(UNIVERSAL_VIEW_MAPS))assert.ok(fs.existsSync('public'+parkMapImage(key).src),key);
for(const stop of UNIVERSAL_STOPS.filter(s=>s.park==='islands')){assert.ok(doc.querySelector(`[data-universal-map] [data-map-pin="${stop.target}"]`),'default Islands view pin: '+stop.target);assert.ok(doc.querySelector(`[data-universal-map] a[href="#${stop.target}"]`),'default Islands view card opens its entry: '+stop.target);}
// Owner 2026-11-20: the map sits on the shared guide map card with the zoom inside the map.
assert.ok(doc.querySelector('[data-universal-map] [data-map-kind="illustrated"] [data-map-zoom-inside]'),'zoom control sits inside the shared map card');
assert.equal(doc.querySelectorAll('[data-guide-map-canvas]').length,1);
assert.equal(doc.querySelector('[data-guide-map-canvas]').getAttribute('src'),'/guides/park-maps-2026/islands-of-adventure.webp');
for(const im of doc.querySelectorAll('img[src^="/"]'))assert.ok(fs.existsSync('public'+im.getAttribute('src')),im.getAttribute('src'));
assert.equal(doc.querySelectorAll('[data-universal-photo]').length,19); // 18 location images incl hero + 2 food photos; hero is outside this wrapper.
assert.ok(doc.querySelector('[data-universal-photo="holiday-food-selection"] img'));
assert.ok(doc.querySelector('[data-universal-photo="holiday-sweets-drinks"] img'));
assert.equal(doc.querySelectorAll('[data-food-photo]').length,0,'creator screenshots must not publish');
// The page renders through GuideStandardShell, which emits the standard
// Article + BreadcrumbList pair (one script each).
const schemas=[...doc.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent));
const article=schemas.find(s=>s['@type']==='Article');
assert.ok(article,'Article schema');
assert.ok(schemas.some(s=>s['@type']==='BreadcrumbList'),'BreadcrumbList schema');
assert.equal(article.mainEntityOfPage,'https://www.gowayfind.com/guides/universal-orlando-christmas-2026');
assert.equal(article.image.url,'https://www.gowayfind.com/guides/universal-orlando-christmas-2026/nintendo-night.webp');
assert.ok(doc.querySelector('nav[aria-label="Breadcrumb"]'),'standard Back to Wayfind breadcrumb');
assert.ok(doc.querySelector('.wf-guide-outline nav.wf-guide-contents'),'standard In this guide contents');
assert.ok(doc.querySelectorAll('section.wf-guide-pick .wf-guide-number').length>=10,'numbered standard sections');
}
verifyGuide(doc);
const broken = new JSDOM(markup);
broken.window.document.querySelector('[data-guide-map-canvas]').remove();
assert.throws(() => verifyGuide(broken.window.document), 'removing the approved map must fail the real verifier');
broken.window.close();

console.log('check-universal-holiday-guide: OK — 17 pins resolve to real guide entries, all anchors and local media exist, 18 park photos retained, 2 official food photographs, no screenshot reuse, one H1, Article and Breadcrumb schema.');

dom.window.close();
const interactive = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://www.gowayfind.com/guides/universal-orlando-christmas-2026', pretendToBeVisual: true });
const original = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, CustomEvent: globalThis.CustomEvent };
globalThis.window = interactive.window; globalThis.document = interactive.window.document;
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.CustomEvent = interactive.window.CustomEvent;
interactive.window.matchMedia = () => ({ matches: false });
interactive.window.HTMLElement.prototype.scrollTo = function(options) { this.scrollLeft = options.left || 0; this.scrollTop = options.top || 0; };
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
flushSync(() => { root.render(React.createElement(Page)); });
const VIEW_TITLE = { islands: 'Islands', studios: 'Studios', epic: 'Epic', citywalk: 'CityWalk' };
const chips = () => [...document.querySelectorAll('[data-universal-map] [aria-label="Filter this guide"] button')];
const showView = (park) => flushSync(() => { chips().find(button => button.querySelector('span')?.textContent === VIEW_TITLE[park]).click(); });
for (const stop of UNIVERSAL_STOPS) {
  showView(stop.park);
  assert.equal(document.querySelector('[data-guide-map-canvas]').getAttribute('src'), parkMapImage(UNIVERSAL_VIEW_MAPS[stop.park]).src, 'view shows its park map');
  flushSync(() => { document.querySelector(`[data-map-pin="${stop.target}"]`).click(); });
  assert.equal(document.querySelector(`[data-map-pin="${stop.target}"]`).dataset.selected, 'true', 'tapped pin is selected: ' + stop.target);
  assert.equal(document.querySelector(`[data-map-pin="${stop.target}"] span`).textContent, String(stop.n), 'pin keeps the guide number ' + stop.n);
  assert.ok(document.querySelector(`[data-universal-map] a[href="#${stop.target}"]`), 'the matching card opens ' + stop.target);
}
const buttons = [...document.querySelectorAll('.foodFilters button')];
flushSync(() => { buttons.find(button => button.textContent === 'Studios').click(); });
assert.equal(document.getElementById('le-gobelet-noir').hidden, true);
window.history.replaceState(null, '', '#le-gobelet-noir');
flushSync(() => { window.dispatchEvent(new window.HashChangeEvent('hashchange')); });
assert.equal(document.getElementById('le-gobelet-noir').hidden, false, 'jumping to a filtered food entry reveals it');
showView('epic');
assert.equal(document.querySelectorAll('[data-map-pin]').length, 6, 'Epic map shows its six mapped stops');
flushSync(() => { root.unmount(); });
interactive.window.close();
globalThis.window = original.window; globalThis.document = original.document;
globalThis.requestAnimationFrame = original.requestAnimationFrame; globalThis.cancelAnimationFrame = original.cancelAnimationFrame; globalThis.CustomEvent = original.CustomEvent;
console.log('check-universal-holiday-guide: interaction OK — all 17 pins select their stop with the guide numbers and every card opens its entry, filtered rows reveal, park views change; missing-map negative control fails as required.');
