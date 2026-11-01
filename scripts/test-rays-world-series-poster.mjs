import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { loadComponent } from './lib/jsxLoad.mjs';
import { RAILS } from '../lib/rails.js';
import { RAYS_POSTER, raysCampaignLive, raysSeriesComplete } from '../lib/raysWorldSeriesPoster.js';

assert.equal(raysCampaignLive('2026-10-22'), true);
assert.equal(raysCampaignLive('2026-10-28'), true, 'Game 5 day stays visible');
assert.equal(raysCampaignLive('2026-10-29'), false, 'series ended Oct 28: campaign closed');
assert.equal(raysCampaignLive('2026-11-03'), false, 'no Rays poster after the series');
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
    assert.equal(novIds[0], 'christmas', `${year} Nov 1: Christmas first`);
  }
  // Render the final UI composition, including a paid sponsor and live poster.
  // This catches a synthetic tile prepending itself ahead of orderFor's leader.
  const sponsor = { id: 'fixture-sponsor', title: 'Neighborhood Partner', sponsor: true, href: '/events' };
  const sports = { id: 'live-sports', title: 'Florida Hockey', livePosterType: 'sports', livePosterSrc: '/hockey.jpg', href: '/events' };
  let seasonalRenders = 0;
  for (const year of [2026, 2027, 2028]) {
    for (const md of ['11-01', '11-15', '12-31', '01-01', '01-02', '10-31']) {
      const day = `${year}-${md}`;
      globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [`${day}T16:00:00Z`])); }
        static now() { return new NativeDate(`${day}T16:00:00Z`).getTime(); }
      };
      for (const initialDaypart of ['morning', 'lunch', 'afternoon', 'night']) {
        for (const promotions of [{}, { sponsor }, { livePosters: [sports] }, { sponsor, livePosters: [sports] }]) {
          const html = renderToStaticMarkup(createElement(DaypartRail, {
            initialDaypart, rails: RAILS, places: {}, thin: [], ...promotions,
          }));
          const ids = [...JSDOM.fragment(html).querySelectorAll('.wf8-track > .wf8-tile')].map(t => t.dataset.id);
          const expected = md === '01-01' || md.startsWith('11-') || md.startsWith('12-');
          assert.equal(ids[0] === 'christmas', expected, `${day} ${initialDaypart}: Christmas first exactly in its annual priority window, including synthetic promotions`);
          assert.equal(new Set(ids).size, ids.length, `${day} ${initialDaypart}: every tile appears once`);
          assert.equal(ids.includes(sponsor.id), !!promotions.sponsor, 'sponsor remains visible when supplied');
          assert.equal(ids.includes(sports.id), !!promotions.livePosters, 'live event remains visible when supplied');
          if (md === '11-01' || md === '11-15') {
            assert.equal(ids.includes('augtober'), true, 'Fall remains visible before Thanksgiving');
            assert.equal(ids.includes('halloween'), false, 'Halloween stays hidden in November');
          }
          if (md === '01-02') assert.equal(ids.includes('christmas'), false, 'Christmas stays hidden after Jan 1');
          if (!expected && promotions.sponsor) assert.equal(ids[0], sponsor.id, 'sponsor keeps existing priority outside Christmas window');
          if (promotions.livePosters && expected) assert.ok(ids.indexOf(sports.id) > 0 && ids.indexOf(sports.id) <= 3, 'live poster keeps its insertion slot after filtering hidden seasonal tiles');
          if (expected && promotions.sponsor) assert.equal(ids[1], sponsor.id, 'sponsor keeps its relative priority immediately behind Christmas');
          seasonalRenders++;
        }
      }
    }
  }
  // Red-prove both failure shapes using only the loader's temporary compiled
  // modules. The tracked source remains untouched while other checks run.
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-01T16:00:00Z'])); }
    static now() { return new NativeDate('2026-11-01T16:00:00Z').getTime(); }
  };
  for (const mutation of ['late-start', 'sponsor-preempts', 'rays-overlap']) {
    let mutations = 0;
    const { default: BrokenRail } = await loadComponent(path.resolve('app/components/DaypartRail.js'), process.cwd(), {
      onGraph(graph) {
        const source = mutation === 'late-start' ? 'lib/dayparts.js' : mutation === 'rays-overlap' ? 'lib/raysWorldSeriesPoster.js' : 'app/components/DaypartRail.js';
        const emitted = graph.get(path.resolve(source));
        assert.ok(emitted, `mutation finds actual compiled ${source}`);
        const text = readFileSync(emitted, 'utf8');
        const broken = mutation === 'late-start'
          ? text.replace("md >= '11-01'", "md >= '11-27'")
          : mutation === 'rays-overlap' ? text.replace('"2026-10-29"', '"2026-11-02"')
          : text.replace('if (christmasLeads(siteDay))', 'if (false)');
        if (broken !== text) mutations++;
        writeFileSync(emitted, broken);
      },
    });
    assert.equal(mutations, 1, `${mutation}: exactly one real compiled module mutated`);
    const html = renderToStaticMarkup(createElement(BrokenRail, {
      initialDaypart: 'morning', rails: RAILS, places: {}, thin: [], sponsor, livePosters: [sports],
    }));
    const ids = [...JSDOM.fragment(html).querySelectorAll('.wf8-track > .wf8-tile')].map(t => t.dataset.id);
    if (mutation === 'rays-overlap') {
      assert.deepEqual(ids.slice(0, 4), ['christmas', RAYS_POSTER.id, sponsor.id, sports.id], 'Christmas leads even if a Rays campaign overlaps November; Rays, sponsor and live insertion retain relative order');
    } else assert.notEqual(ids[0], 'christmas', `${mutation}: the real-render first-poster assertion detects this regression`);
  }
  assert.equal(seasonalRenders, 288, 'all year, date, band and synthetic-promotion combinations rendered');
} finally { globalThis.Date = NativeDate; }
console.log('Rays campaign: status positive/negative controls, date boundaries, real 4-band render, duplicate suppression, first-load artwork, guide link, 288 seasonal promotion renders, 2 detected mutations and forced Rays overlap passed');
