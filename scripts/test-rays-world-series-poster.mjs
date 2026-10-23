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
    assert.equal(tiles[1]?.dataset.id, 'augtober', `${initialDaypart}: Fall follows Rays`);
    assert.equal(tiles.filter(t => t.dataset.id === 'live-sports').length, 0, 'no duplicate Rays poster');
    assert.ok(tiles[0].classList.contains('wf8-rays'));
    assert.equal(tiles[0].querySelector('a').getAttribute('href'), RAYS_POSTER.href);
    assert.equal(tiles[0].querySelector('img').getAttribute('loading'), 'eager');
  }
} finally { globalThis.Date = NativeDate; }
console.log('Rays campaign: status positive/negative controls, date boundaries, real 4-band render, duplicate suppression, first-load artwork and guide link passed');
