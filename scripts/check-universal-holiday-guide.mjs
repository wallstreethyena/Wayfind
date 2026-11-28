import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {flushSync} from 'react-dom';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './lib/jsxLoad.mjs';
import {JSDOM} from 'jsdom';
import {UNIVERSAL_HOLIDAY_FOOD_2026} from '../lib/universalHolidayFood2026.js';
import {UNIVERSAL_HOLIDAY_MAP_MEDIA} from '../lib/universalHolidayMapMedia.js';
import {UNIVERSAL_HOLIDAY_CREATOR_POSTS} from '../lib/universalHolidayCreatorPosts.js';
import {isEmbeddable} from '../lib/videoEmbed.js';
const rel='app/guides/universal-orlando-christmas-2026/';
const {default:Page}=await loadComponent(path.resolve(rel+'page.js'), process.cwd());
const {UNIVERSAL_STOPS}=await loadComponent(path.resolve(rel+'UniversalHolidayMap.js'), process.cwd());
const {UNIVERSAL_VIEW_MAPS,parkMapImage}=await import('../lib/parkMaps2026.js');
const addedStops = UNIVERSAL_HOLIDAY_FOOD_2026
  .filter((pick) => !pick.mapGroup && Number.isFinite(pick.x) && Number.isFinite(pick.y))
  .map((pick, index) => ({ ...pick, target: pick.id, n: UNIVERSAL_STOPS.length + index + 1 }));
const stops = [...UNIVERSAL_STOPS, ...addedStops];
const posts = Object.values(UNIVERSAL_HOLIDAY_CREATOR_POSTS).flat();
const markup=renderToStaticMarkup(React.createElement(Page));
const dom=new JSDOM(markup);const doc=dom.window.document;
function verifyGuide(doc) {
const ids=[...doc.querySelectorAll('[id]')].map(e=>e.id);
assert.equal(new Set(ids).size,ids.length,'guide must have no duplicate IDs');
for(const a of doc.querySelectorAll('a[href^="#"]'))assert.ok(doc.getElementById(a.hash.slice(1)),a.getAttribute('href'));
assert.equal(doc.querySelectorAll('h1').length,1);
assert.equal(UNIVERSAL_STOPS.length,17);
assert.ok(addedStops.length >= 5, 'new verified venue pins join the 17 existing stops');
// Owner-supplied illustrated park maps (lib/parkMaps2026.js): one park per view,
// Islands first. Every stop targets real guide content, sits inside its map,
// and every view's illustration exists on disk.
for(const stop of stops){assert.ok(doc.getElementById(stop.target),stop.target);assert.ok(stop.x>2&&stop.x<98&&stop.y>4&&stop.y<99,'pin inside its map: '+stop.target);assert.ok(UNIVERSAL_VIEW_MAPS[stop.park],'stop park has a map view: '+stop.target);}
for(const key of Object.values(UNIVERSAL_VIEW_MAPS))assert.ok(fs.existsSync('public'+parkMapImage(key).src),key);
for(const stop of UNIVERSAL_STOPS.filter(s=>s.park==='islands')){assert.ok(doc.querySelector(`[data-universal-map] [data-map-pin="${stop.target}"]`),'default Islands view pin: '+stop.target);assert.ok(doc.querySelector(`[data-universal-map] a[href="#${stop.target}"]`),'default Islands view card opens its entry: '+stop.target);}
// Owner 2026-11-20: the map sits on the shared guide map card with the zoom inside the map.
assert.ok(doc.querySelector('[data-universal-map] [data-map-kind="illustrated"] [data-map-zoom-inside]'),'zoom control sits inside the shared map card');
assert.equal(doc.querySelectorAll('[data-guide-map-canvas]').length,1);
assert.equal(doc.querySelector('[data-guide-map-canvas]').getAttribute('src'),'/guides/park-maps-2026/islands-of-adventure.webp');
for(const im of doc.querySelectorAll('img[src^="/"]'))assert.ok(fs.existsSync('public'+im.getAttribute('src')),im.getAttribute('src'));
assert.ok(doc.querySelectorAll('[data-universal-photo]').length >= 19, 'retain existing article photos');
assert.ok(doc.querySelector('[data-universal-photo="holiday-food-selection"] img'));
assert.ok(doc.querySelector('[data-universal-photo="holiday-sweets-drinks"] img'));
assert.equal(doc.querySelectorAll('[data-food-photo]').length,0,'creator screenshots must not publish');
for (const pick of UNIVERSAL_HOLIDAY_FOOD_2026) {
  const entry = doc.getElementById(pick.id);
  assert.equal(entry?.dataset.universalFoodPick, pick.park, 'food pick belongs to its park: ' + pick.name);
  assert.ok(entry.querySelector(`a[href="${pick.sourceHref}"]`), 'food pick cites its official source: ' + pick.name);
  assert.ok(doc.querySelector(`[data-universal-food-table] tr[data-park="${pick.park}"] a[href="#${pick.id}"]`), 'shortlist links to its details: ' + pick.name);
  if (pick.mapGroup) assert.ok(doc.getElementById(pick.mapGroup), 'grouped pick has a map entry: ' + pick.name);
}
assert.equal(doc.querySelectorAll('[data-universal-itinerary]').length, 4, 'one itinerary per park and CityWalk');
for (const route of doc.querySelectorAll('[data-universal-itinerary]')) {
  assert.equal(route.querySelectorAll('ol a[href^="#"]').length, 4, route.id + ' has four linked stops');
}
assert.ok(posts.length >= 2, 'multiple real creator reels are available');
assert.equal(doc.querySelectorAll('[data-creator-post]').length, posts.length);
assert.equal(doc.querySelectorAll('[data-creator-post] iframe, a[href*="instagram.com/"]').length, 0, 'Instagram stays inside Wayfind and loads on tap');
for (const post of posts) {
  assert.ok(isEmbeddable('instagram', post.url), 'only checked inline reels render');
  assert.ok(doc.querySelector(`[data-creator-post="${post.url}"] img[src^="/"]`), 'reel has a local cover: ' + post.label);
}
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

console.log('check-universal-holiday-guide: OK — original and new stops, food sources, four linked itineraries, checked creator covers, and guide schema.');

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
for (const park of Object.keys(UNIVERSAL_VIEW_MAPS)) {
  showView(park);
  assert.equal(document.querySelector('[data-guide-map-canvas]').getAttribute('src'), parkMapImage(UNIVERSAL_VIEW_MAPS[park]).src, 'view shows its park map');
  const visible = stops.filter((stop) => stop.park === park);
  assert.equal(document.querySelectorAll('[data-map-pin]').length, visible.length, 'map shows every stop in ' + park);
  for (const stop of visible) {
    const pin = document.querySelector(`[data-map-pin="${stop.target}"]`);
    flushSync(() => { pin.click(); });
    assert.equal(pin.dataset.selected, 'true', 'tapped pin is selected: ' + stop.target);
    assert.equal(pin.querySelector('span').textContent, String(stop.n), 'pin keeps the guide number ' + stop.n);
    const card = document.querySelector(`[data-universal-map] [data-guide-spot-id="${stop.target}"]`);
    assert.ok(card?.querySelector(`a[href="#${stop.target}"]`), 'the matching card opens ' + stop.target);
    const image = card.querySelector('img');
    assert.ok(image?.src && fs.existsSync('public' + image.getAttribute('src')), 'map card has a local photo: ' + stop.target);
    assert.ok(card.querySelector('[aria-label^="Photo credit:"]'), 'map card credits its photo: ' + stop.target);
    if ((stop.photo || UNIVERSAL_HOLIDAY_MAP_MEDIA[stop.target]?.photo)?.preserveFraming) {
      assert.equal(image.style.objectFit, 'contain', 'editorial photo retains its full frame: ' + stop.target);
    }
  }
}
// Owner 2026-11-20: the card rail sits BELOW the map, never beside it, and a
// link to an entry opens that entry's park on the map.
assert.equal(document.querySelector('[data-universal-map] section').dataset.stack, 'true', 'illustrated map card stacks the rail below the map');
const gmeCss = fs.readFileSync('app/components/GuideMapExplorer.module.css', 'utf8');
assert.ok(/\.explorer\[data-stack="true"\] \.mapRailStage \{\s*grid-template-columns: minmax\(0, 1fr\);/.test(gmeCss), 'stacked card uses one column at every width');
showView('islands');
window.history.replaceState(null, '', '#le-gobelet-noir');
flushSync(() => { window.dispatchEvent(new window.HashChangeEvent('hashchange')); });
assert.equal(document.querySelector('[data-guide-map-canvas]').getAttribute('src'), parkMapImage(UNIVERSAL_VIEW_MAPS.epic).src, 'a link to an Epic entry opens the Epic map');
window.history.replaceState(null, '', '#');
const buttons = [...document.querySelectorAll('.foodFilters button')];
flushSync(() => { buttons.find(button => button.textContent === 'Studios').click(); });
assert.equal(document.getElementById('le-gobelet-noir').hidden, true);
window.history.replaceState(null, '', '#le-gobelet-noir');
flushSync(() => { window.dispatchEvent(new window.HashChangeEvent('hashchange')); });
assert.equal(document.getElementById('le-gobelet-noir').hidden, false, 'jumping to a filtered food entry reveals it');
flushSync(() => { buttons.find(button => button.textContent === 'CityWalk').click(); });
const cityWalkRows = [...document.querySelectorAll('[data-universal-food-table] tbody tr:not([hidden])')];
assert.equal(cityWalkRows.length, UNIVERSAL_HOLIDAY_FOOD_2026.filter((pick) => pick.park === 'citywalk').length);
assert.ok(cityWalkRows.every((row) => row.dataset.park === 'citywalk'), 'CityWalk filters to its own food');
const cover = document.querySelector('[data-creator-post] button');
flushSync(() => { cover.click(); });
assert.ok(document.querySelector('[data-creator-post] iframe[src^="https://www.instagram.com/"]'), 'the tapped cover opens its official player in Wayfind');
flushSync(() => { root.unmount(); });
interactive.window.close();
globalThis.window = original.window; globalThis.document = original.document;
globalThis.requestAnimationFrame = original.requestAnimationFrame; globalThis.cancelAnimationFrame = original.cancelAnimationFrame; globalThis.CustomEvent = original.CustomEvent;
console.log('check-universal-holiday-guide: interaction OK — every pin selects its credited photo card and entry, food filters work, and tapping a cover mounts the player.');
