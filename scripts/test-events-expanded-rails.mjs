// Owner 2026-11-05: all populated rails, Best/Distance only, no stale Halloween
// promotion, and real event art survives curated/provider deduplication.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { mock } from 'node:test';
import { loadComponent } from './lib/jsxLoad.mjs';
import { absorbCuratedTwins, processEvents } from '../lib/eventsPipeline.js';
import { currentCuratedFeed, replaceCachedCurated, withCuratedEventPhotos } from '../lib/curatedEventsFeed.js';
import { eventPlaceholder } from '../lib/eventPlaceholder.js';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const mod = await loadComponent(fileURLToPath(new URL('../app/components/screens/Events.js', import.meta.url)), ROOT);
const today = '2026-11-05';
const e = (id, bucket, extra = {}) => ({ id, name: id, bucket, dest: '/florida-events/' + id, date: '2026-11-07', time: '18:00', lat: 27.68, lng: -82.42, ...extra });
const rows = [e('concert', 'concerts'), e('comedy', 'comedy'), e('play', 'theater'), e('game', 'sports'), e('market', 'community'), e('business', 'business'), e('lights', 'community', { christmas: true, curated: true }), e('farm', 'community', { fallTheme: true }), e('no-link', 'concerts', { dest: '' })];
const options = { today, eventDate: 'all', eventBucket: (e) => e.bucket, dedupeEvents: (rows) => rows, distMi: (e) => e.miles ?? 1 };
const rails = mod.expandedEventRails(rows, options);
assert.deepEqual(rails.map((r) => r.key), ['christmas', 'fall', 'concerts', 'comedy', 'theater', 'sports', 'local', 'business']);
assert.equal(rails.flatMap((r) => r.items).length, 8, 'each usable event is discoverable exactly once across categories');
assert(!rails.some((r) => /halloween/i.test(r.label)), 'November headings retire Halloween');
assert.equal(mod.expandedEventRails(rows, { ...options, eventDate: '2026-11-08' }).length, 0, 'one date applies to every rail');
const winter = mod.expandedEventRails(rows, { ...options, today: '2026-12-01' });
assert(!winter.some((r) => r.key === 'fall'));
assert(winter.find((r) => r.key === 'local').items.some((r) => r.id === 'farm'), 'season labels cannot make real events disappear');
const ranked = [e('near-small', 'concerts', { popularity_score: 1, miles: 1 }), e('big', 'concerts', { popularity_score: 9, miles: 30 })];
assert.equal(mod.orderEventRail(ranked, options)[0].id, 'big', 'Best uses demand, not the soonest category default');
assert.equal(mod.orderEventRail(ranked, { ...options, sort: 'distance' })[0].id, 'near-small');
assert.equal(mod.orderEventRail(ranked, { ...options, sort: 'distance', distMi: () => Infinity }).length, 2, 'unknown distance retains inventory');
const many = Array.from({ length: 181 }, (_, i) => e('show-' + i, 'concerts'));
assert.equal(mod.expandedEventRails(many, options)[0].items.length, 181);
assert.equal(mod.pageOfEvents(many, 192).items.length, 181);
const twin = e('curated', 'concerts', { name: 'Ed Sheeran in Tampa', city: 'Tampa', venue: 'Raymond James Stadium', curated: true, image: '', visitFacts: {} });
const provider = { ...twin, id: 'tm:1', name: 'Ed Sheeran: LOOP Tour', source: 'Ticketmaster', curated: false, image: 'https://s1.ticketm.net/event.jpg', thumb: 'https://s1.ticketm.net/thumb.jpg', visitFacts: null };
const merged = absorbCuratedTwins([twin, provider]);
assert.equal(merged.length, 1);
assert.equal(merged[0].image, provider.image);
assert.equal(merged[0].thumb, provider.thumb);
assert.equal(merged[0].imageProvider, provider.source || null);
// Use the real source identity: after a cold aggregation absorbs the donor,
// the next healthy owned refresh must keep its art without retaining its facts.
const freshTwin = { ...twin, image: '', thumb: '', imageProvider: null, hook: 'New facts' };
const hit = replaceCachedCurated(merged, [freshTwin]);
assert.equal(hit[0].image, provider.image);
assert.equal(hit[0].hook, 'New facts');
assert.equal(replaceCachedCurated(merged, [{ ...freshTwin, imageBlocked: true }])[0].image, '');
assert.equal(replaceCachedCurated(merged, [{ ...freshTwin, date: '2026-11-08' }])[0].image, '');
assert.equal(merged[0].visitFacts.image_is_venue, false);
const different = { ...provider, venue: 'Another Stadium' };
assert.equal(absorbCuratedTwins([{ ...twin, image: '' }, different]).length, 2, 'different venue cannot donate photography');
const refreshed = replaceCachedCurated([e('old', 'community', { curated: true }), provider], [e('new', 'community', { curated: true })]);
assert.deepEqual(refreshed.map((e) => e.id), ['tm:1', 'new']);
assert.deepEqual(replaceCachedCurated([twin, provider], []).map((e) => e.id), ['tm:1'], 'successful empty read retires cached curated records');
const holiday = currentCuratedFeed([], { today });
assert(holiday.some((e) => e.christmas && /Christmas/i.test(e.name)), 'confirmed research reaches general Events without a database twin');
assert(!holiday.some((e) => !e.date || e.date === 'TBA'), 'undated/watchlist cannot fabricate a day');
const galleryEvent = holiday.find((e) => e.id === 'wfc:christmastown-buschgardens-2026');
assert(galleryEvent, 'Christmas Town is projected');
const placeId = galleryEvent.visitFacts.place_id;
const ownPhoto = 'https://www.gowayfind.com/place-photos/batch-2026-11/gallery/own.jpg';
const wrongPhoto = 'https://www.gowayfind.com/place-photos/batch-2026-11/gallery/halloween.jpg';
const gallery = [{ url: wrongPhoto, christmas_keys: ['another-event'], attribution_text: 'Another event' }, { url: ownPhoto, christmas_keys: ['busch-gardens-christmas-town-2026'], attribution_text: 'Venue photographer', attribution_url: 'https://example.org/credit' }];
let queriedIds;
const db = { from: () => ({ select: () => ({ in: (_column, ids) => { queriedIds = ids; return { abortSignal: async () => ({ data: [{ place_id: placeId, signals: { christmas_photo_gallery: gallery } }], error: null }) }; } }) }) };
const galleryRows = await withCuratedEventPhotos([galleryEvent], { db });
assert.deepEqual(queriedIds, [placeId]);
assert.equal(galleryRows[0].image, ownPhoto, 'exact event-tagged photo wins over generic venue/Google photo');
assert.equal(galleryRows[0].photoAttr, 'Venue photographer');
assert.equal(galleryRows[0].visitFacts.image_is_venue, false);
assert.notEqual(galleryRows[0].image, wrongPhoto, 'another event at the venue cannot donate its photo');
assert.equal((await withCuratedEventPhotos([galleryEvent], { db: null }))[0], galleryEvent, 'photo-reader outage cannot remove a verified event');
assert.equal((await withCuratedEventPhotos([galleryEvent], { db, deadlineMs: 0 }))[0], galleryEvent, 'photo enrichment yields to the event-provider deadline');
const photographed = holiday.filter((e) => e.image?.startsWith('/place-photos/'));
assert(photographed.length > 0, 'existing verified seasonal galleries reach Events');
assert(photographed.every((e) => e.photoAttr && e.photoAttrHref), 'gallery provenance survives projection');
assert.equal(eventPlaceholder('community', { name: 'Halloween haunt' }, '2026-10-31').label, 'Halloween');
assert.notEqual(eventPlaceholder('community', { name: 'Halloween haunt' }, today).label, 'Halloween');

mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-05T18:00:00Z') });
const noop = () => {};
const ctx = { ...options, events: rows, eventCat: 'concerts', eventDate: 'all', setEventDate: noop, locName: 'Parrish', center: { lat: 27.68, lng: -82.42 }, submitSearch: noop, openVenue: noop, AreaInsight: () => null, Loader: () => null, eventsTours: [], ViatorRail: () => null, formatEventDate: () => ({ mo: 'Nov', day: 7, wd: 'Sat', time: '6 PM' }), eventCategory: () => ({ short: 'Event' }), recurrenceLabel: () => '', cleanVenueName: (v) => v || '', ticketUrl: (url) => url, logEvent: noop, eventUseImage: () => true };
const html = renderToStaticMarkup(React.createElement(mod.default, { ctx }));
for (const id of ['events-worth-planning', 'events-christmas', 'events-fall', 'events-concerts', 'events-comedy', 'events-theater', 'events-sports', 'events-local', 'events-business']) assert(html.includes(`data-rail="${id}"`), `${id} is rendered despite the legacy concerts selection`);
assert(!html.includes('Fall and Halloween'));
assert(!html.includes('Try another category'));
assert(html.includes('Sort events'));
mock.timers.reset();

// Drive the actual sort menu, rather than inferring its options from source.
const dom = new JSDOM('<div id="root"></div>', { url: 'https://www.gowayfind.com/events' });
const savedGlobals = new Map(['window', 'document', 'localStorage', 'sessionStorage', 'IS_REACT_ACT_ENVIRONMENT'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const root = createRoot(document.getElementById('root'));
try {
  flushSync(() => root.render(React.createElement(mod.default, { ctx })));
  const click = (element) => flushSync(() => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  await click(document.querySelector('[aria-label="Sort events"]'));
  const choices = [...document.querySelectorAll('[role="option"]')];
  assert.deepEqual(choices.map((el) => el.textContent), ['Best', 'Distance']);
  await click(choices[1]);
  assert(document.querySelector('[aria-label="Sort events"]').textContent.includes('Distance'));
  assert(!document.querySelector('[role="listbox"]'));
  for (const key of ['concerts', 'comedy', 'theater', 'sports', 'local', 'business']) assert(document.querySelector(`[data-rail="events-${key}"]`), `Distance preserves ${key}`);
} finally {
  flushSync(() => root.unmount());
  dom.window.close();
  for (const [key, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
const src = readFileSync(new URL('../app/api/events/route.js', import.meta.url), 'utf8');
assert(src.includes('replaceCachedCurated(payload.events, current.events)'), 'cached aggregator feed cannot freeze curated inventory');
// CI normally starts guards without NODE_ENV, while Vercel's prebuild uses
// production. Exercise that exact mode too so a dev-only React API cannot
// pass CI and then block deployment again. The child runs every check above.
if (!process.argv.includes('--production-child')) {
  const production = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--production-child'], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' });
  assert.equal(production.status, 0, `production-mode event guard must pass: ${production.stdout}\n${production.stderr}`);
}
console.log('test-events-expanded-rails: OK — complete category rendering, demand/distance order, all 181 cards reachable, same-show images, confirmed holidays, cache replacement and seasonal retirement');
