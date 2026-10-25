import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { loadComponent } from './lib/jsxLoad.mjs';
import { RAILS } from '../lib/rails.js';
import { RAYS_POSTER, raysCampaignLive, raysSeriesComplete } from '../lib/raysWorldSeriesPoster.js';

assert.equal(raysCampaignLive('2026-10-22'), true);
assert.equal(raysCampaignLive('2026-11-03'), true, 'delayed series stays visible');
assert.equal(raysCampaignLive('2026-10-21'), false);
assert.equal(raysCampaignLive('2027-10-22'), false, 'one campaign, no annual replay');
assert.equal(raysCampaignLive('2026-10-27', true), false, 'early clinch closes campaign');
const game = { gameType: 'W', season: '2026', teams: { home: { team: { id: 139 } } }, status: { abstractGameState: 'Final' }, seriesStatus: { isOver: true } };
const payload = (g) => ({ dates: [{ games: [g] }] });
assert.equal(raysSeriesComplete(payload(game)), true);
for (const changed of [{ gameType: 'L' }, { season: '2025' }, { teams: {} }, { status: { abstractGameState: 'Preview' } }, { seriesStatus: { isOver: false } }]) {
  assert.equal(raysSeriesComplete(payload({ ...game, ...changed })), false);
}
assert.equal(raysSeriesComplete({ dates: [] }), false);
assert.equal(raysSeriesComplete(null), false);
const metadata = await sharp(path.join('public', RAYS_POSTER.livePosterSrc)).metadata();
assert.ok(Math.abs(metadata.width / metadata.height - 9 / 16) < .001);
assert.ok(RAYS_POSTER.shareIntent.url.endsWith(RAYS_POSTER.href));

const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-22T16:00:00Z'])); }
  static now() { return new NativeDate('2026-10-22T16:00:00Z').getTime(); }
};
try {
  const { default: DaypartRail } = await loadComponent(path.resolve('app/components/DaypartRail.js'), process.cwd());
  for (const initialDaypart of ['morning', 'lunch', 'afternoon', 'night']) {
    const html = renderToStaticMarkup(createElement(DaypartRail, {
      initialDaypart, rails: RAILS, places: {}, thin: [],
      livePosters: [{ id: 'live-sports', title: 'Milwaukee Brewers at Tampa Bay Rays: World Series', livePosterType: 'sports', livePosterSrc: '/rays.jpg', href: '/events' }],
    }));
    const doc = new JSDOM(html).window.document;
    const tiles = [...doc.querySelectorAll('.wf8-track > .wf8-tile')];
    assert.equal(tiles[0]?.dataset.id, RAYS_POSTER.id, `${initialDaypart}: Rays first on initial render`);
    assert.equal(tiles[1]?.dataset.id, 'augtober', `${initialDaypart}: Fall follows Rays on Oct 22`);
    assert.equal(tiles.filter(t => t.dataset.id === 'live-sports').length, 0, 'no duplicate Rays poster');
    assert.ok(tiles[0].classList.contains('wf8-rays'));
    assert.equal(tiles[0].querySelector('a').getAttribute('href'), RAYS_POSTER.href);
    assert.equal(tiles[0].querySelector('img').getAttribute('loading'), 'eager');
  }
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-10-25T16:00:00Z'])); }
    static now() { return new NativeDate('2026-10-25T16:00:00Z').getTime(); }
  };
  for (const initialDaypart of ['morning', 'lunch', 'afternoon', 'night']) {
    const html = renderToStaticMarkup(createElement(DaypartRail, {
      initialDaypart, rails: RAILS, places: {}, thin: [],
      livePosters: [{ id: 'live-sports', title: 'Milwaukee Brewers at Tampa Bay Rays: World Series', livePosterType: 'sports', livePosterSrc: '/rays.jpg', href: '/events' }],
    }));
    const doc = new JSDOM(html).window.document;
    const tiles = [...doc.querySelectorAll('.wf8-track > .wf8-tile')];
    assert.equal(tiles[0]?.dataset.id, RAYS_POSTER.id, `${initialDaypart}: Rays first on Oct 25`);
    assert.equal(tiles[1]?.dataset.id, 'halloween', `${initialDaypart}: Halloween second from left after Rays on Oct 25`);
    assert.equal(tiles[2]?.dataset.id, 'augtober', `${initialDaypart}: Fall in Florida to the right of Halloween on Oct 25`);
  }
  for (const year of [2027, 2028]) {
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [`${year}-10-25T16:00:00Z`])); }
      static now() { return new NativeDate(`${year}-10-25T16:00:00Z`).getTime(); }
    };
    for (const initialDaypart of ['morning', 'lunch', 'afternoon', 'night']) {
      const html = renderToStaticMarkup(createElement(DaypartRail, {
        initialDaypart, rails: RAILS, places: {}, thin: [],
      }));
      const doc = new JSDOM(html).window.document;
      const ids = [...doc.querySelectorAll('.wf8-track > .wf8-tile')].map((t) => t.dataset.id);
      assert.equal(ids.includes(RAYS_POSTER.id), false, `${year} ${initialDaypart}: expired 2026 Rays promotion never revives`);
      assert.equal(ids[0], 'halloween', `${year} ${initialDaypart}: Halloween leads when Rays promotion is absent`);
      assert.equal(ids[1], 'augtober', `${year} ${initialDaypart}: Fall in Florida sits immediately right of Halloween`);
      assert.equal(new Set(ids).size, ids.length, `${year} ${initialDaypart}: no duplicate cards`);
    }
    globalThis.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [`${year}-11-01T16:00:00Z`])); }
      static now() { return new NativeDate(`${year}-11-01T16:00:00Z`).getTime(); }
    };
    const novHtml = renderToStaticMarkup(createElement(DaypartRail, {
      initialDaypart: 'morning', rails: RAILS, places: {}, thin: [],
    }));
    const novIds = [...new JSDOM(novHtml).window.document.querySelectorAll('.wf8-track > .wf8-tile')].map((t) => t.dataset.id);
    assert.equal(novIds.includes('halloween'), false, `${year} Nov 1: Halloween gone after Oct 31`);
    assert.equal(novIds[0], 'augtober', `${year} Nov 1: Fall in Florida restored to first`);
  }
} finally { globalThis.Date = NativeDate; }
console.log('Rays campaign: status positive/negative controls, date boundaries, real 4-band render, duplicate suppression, first-load artwork and guide link passed');
