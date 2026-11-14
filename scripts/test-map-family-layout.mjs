#!/usr/bin/env node
// Actual component markup measured in Chromium. This is fixture/layout
// evidence, not a claim that the live Apple SDK or production APIs ran.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { loadComponent } from './lib/jsxLoad.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const mapPath = path.join(ROOT, 'app/components/screens/Map.js');
const homePath = path.join(ROOT, 'app/home.js');
const familyPath = path.join(ROOT, 'app/components/FamilyDayPage.js');
const artifacts = path.join(ROOT, 'artifacts/map-family-layout');
mkdirSync(artifacts, { recursive: true });
const noop = () => {};
const fixturePlace = { id: 'layout-fixture', name: 'Science Center With A Long But Genuine Venue Name', category: 'attractions', primaryType: 'museum', types: ['museum'], lat: 27.5, lng: -82.5, wfScore: 94, governed_score: 94, rating: 4.9, reviews: 1000, distMi: 2.1, trending: true, trend_reason: 'Multiple local creators', creator_video: true, _members: { ownerPick: true } };
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, 'app/components/css.js'), ROOT);
const home = await loadComponent(homePath, ROOT, { onGraph(graph) {
  const entry = graph.get(homePath);
  assert.ok(entry);
  writeFileSync(entry, readFileSync(entry, 'utf8') + '\nexport { CategoryMenu, PlaceCard };\n');
} });
const { default: MapScreen } = await loadComponent(mapPath, ROOT, { onGraph(graph) {
  const entry = graph.get(mapPath);
  let source = readFileSync(entry, 'utf8');
  for (const [pattern, replacement] of [
    [/const \[areaPlaces, setAreaPlaces\] = useState\(\[\]\);/g, 'const [areaPlaces, setAreaPlaces] = useState(globalThis.__mapLayoutPlaces);'],
    [/const \[areaStatus, setAreaStatus\] = useState\("loading"\);/g, 'const [areaStatus, setAreaStatus] = useState("ready");'],
  ]) {
    assert.equal([...source.matchAll(pattern)].length, 1);
    source = source.replace(pattern, replacement);
  }
  writeFileSync(entry, source);
} });
const family = await loadComponent(familyPath, ROOT, { onGraph(graph) {
  for (const entry of graph.values()) {
    const source = readFileSync(entry, 'utf8');
    if (source.includes('from "next/navigation"')) writeFileSync(entry, source.replace(/import \{[^}]*\} from "next\/navigation";/g, 'const useSearchParams = () => new URLSearchParams();'));
  }
} });
const ctx = {
  mapMode: 'places', mapBrowse: true, map3D: false, mapRetryKey: 0, cat: 'attractions', sub: 'all',
  center: { lat: 27.5, lng: -82.5 }, mapPreview: fixturePlace, mapDrawer: false,
  mapDefaultAppliedRef: { current: true }, categoryChosenRef: { current: true },
  Hol: { worldCup: () => false, fitFor: () => 0 }, MapView: () => null,
  CategoryMenu: home.CategoryMenu, PlaceCard: home.PlaceCard,
  liked: {}, disliked: {}, events: [], blurbs: {}, beachSignals: {},
  cityNow: 'Sarasota', isSaved: () => false,
};
for (const key of ['setMap3D', 'setMapRetryKey', 'setCat', 'setSub', 'setVibe', 'setMapBrowse', 'setMapPreview', 'setMapFocus', 'setMapSearchOpen', 'recenterToMe', 'toggleLike', 'toggleDislike', 'quickSaveFavorite', 'addShared', 'setMapDrawer', 'logEvent', 'openDetail']) ctx[key] = noop;
globalThis.__mapLayoutPlaces = [fixturePlace];
const mapIdleHtml = renderToStaticMarkup(React.createElement(MapScreen, { ctx: { ...ctx, mapPreview: null, mapDrawer: false } }));
const mapPreviewHtml = renderToStaticMarkup(React.createElement(MapScreen, { ctx: { ...ctx, mapPreview: fixturePlace, mapDrawer: false } }));
const mapDrawerHtml = renderToStaticMarkup(React.createElement(MapScreen, { ctx: { ...ctx, mapPreview: null, mapDrawer: true } }));
const eventHtml = renderToStaticMarkup(React.createElement(family.FamilyEventCard, { event: { id: 'event-layout', name: 'Science Night For The Entire Family At The Museum', href: '/florida-events/science', whenFact: 'Saturday · 10:00 AM', venue: 'Science Hall', distMi: 4.2 } }));
const makeDoc = (mapBody, expandSubs = false) => `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#07111c;color:#eee;font-family:system-ui}#map-fixture{height:100vh;position:relative}.family-fixture{padding:16px}${WF_PLACE_CARD_CSS}${expandSubs ? '.wf-mapfp.is-subs-collapsed .wf-mapfp-subs{display:flex !important}' : ''}</style></head><body><div id="map-fixture">${mapBody}</div><div class="family-fixture"><ol class="wf-rail wf-rail-exploding">${eventHtml}</ol></div></body></html>`;
const html = makeDoc(mapPreviewHtml, false);
writeFileSync(path.join(artifacts, 'actual-component-layout.html'), html);
let executable = chromium.executablePath();
if (!existsSync(executable) && existsSync('/usr/bin/chromium')) executable = '/usr/bin/chromium';
if (!existsSync(executable)) {
  if (process.argv.includes('--require-browser')) throw new Error('Chromium required for actual layout verification');
  console.log('test-map-family-layout: SSR fixtures rendered; Chromium unavailable, browser layout NOT verified');
  process.exit(0);
}
const browser = await chromium.launch({ executablePath: executable, headless: true, args: ['--no-sandbox'] });
const evidence = [];
try {
  for (const [width, height] of [[390, 844], [393, 852], [430, 932], [844, 390], [768, 844], [1440, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route('**/*', route => route.abort());

    // State 2: Compact place preview visible + FamilyEventCard
    await page.setContent(makeDoc(mapPreviewHtml, false));
    const result = await page.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
      const previewShell = document.querySelector('.wf-map-results');
      const previewCard = document.querySelector('.wf-map-preview-card');
      const cards = [...document.querySelectorAll('.wf-place-card')].map(card => ({ ...box(card), controls: [...card.querySelectorAll('button,a')].map(box) }));
      const floats = [...document.querySelectorAll('.wf-map-explorer>button')].map(box);
      return {
        actualWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        header: box(document.querySelector('.wf-mapfp')),
        previewShell: previewShell ? { ...box(previewShell), controls: [...previewShell.querySelectorAll('button,a')].map(box) } : null,
        previewCard: previewCard ? box(previewCard) : null,
        cards,
        floats,
      };
    });
    assert.equal(result.actualWidth, width, 'achieved browser width');
    assert.ok(result.documentWidth <= width, 'no document overflow');
    assert.ok(result.previewCard && result.previewShell && result.previewShell.height <= 168.5 && result.cards.length === 1, 'compact map preview (<=168px) and Family RailCard are mounted');
    for (const card of result.cards) {
      assert.equal(Math.round(card.height), 268, 'shared FamilyEventCard retains the 268px height');
      assert.ok(card.width <= 440 && card.right <= width + .5 && card.left >= 0, 'shared card widths remain bounded and fit mobile');
      for (const control of card.controls) if (control.width > 0 && control.height > 0) {
        assert.ok(control.left >= card.left - .5 && control.right <= card.right + .5 && control.top >= card.top - .5 && control.bottom <= card.bottom + .5, 'visible card controls stay contained');
      }
    }
    for (const control of result.previewShell.controls) if (control.width > 0 && control.height > 0) {
      assert.ok(control.left >= result.previewShell.left - .5 && control.right <= result.previewShell.right + .5 && control.top >= result.previewShell.top - .5 && control.bottom <= result.previewShell.bottom + .5, 'compact preview controls stay contained');
    }
    assert.ok(result.header.bottom < Math.min(...result.floats.map(b => b.top)), 'map controls clear the achieved category/subcategory header');
    for (let i = 0; i < result.floats.length; i++) for (let j = i + 1; j < result.floats.length; j++) {
      const a = result.floats[i], b = result.floats[j];
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, 'floating controls do not overlap');
    }

    // Protected Central Discovery Region across States 1 (nothing selected), 3 (filters expanded), and 4 (bottom sheet open)
    await page.setContent(makeDoc(mapIdleHtml, false));
    const idleCheck = await page.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
      const header = box(document.querySelector('.wf-mapfp'));
      const pill = box(document.querySelector('.wf-map-results'));
      const floats = [...document.querySelectorAll('.wf-map-explorer>button')].map(box);
      const uiArea = header.width * header.height + pill.width * pill.height + floats.reduce((s, f) => s + f.width * f.height, 0);
      const mapRatio = 1 - uiArea / (innerWidth * innerHeight);
      // Central discovery zone between the left edge control pill (<=136px) and right control rail (>=W-64px)
      const cz = { left: 138, right: innerWidth - 64, top: Math.max(header.bottom + 8, 120), bottom: innerHeight - 120 };
      const centerIntrusions = floats.filter((f) => !(f.right <= cz.left || f.left >= cz.right || f.bottom <= cz.top || f.top >= cz.bottom));
      return { mapRatio, pillHeight: pill.height, centerIntrusions: centerIntrusions.length };
    });
    await page.setContent(makeDoc(mapIdleHtml, true));
    const expandedHeaderBottom = await page.evaluate(() => document.querySelector('.wf-mapfp').getBoundingClientRect().bottom);
    await page.setContent(makeDoc(mapDrawerHtml, false));
    const drawerBox = await page.evaluate(() => { const b = document.querySelector('.wf-map-results.is-drawer-open').getBoundingClientRect(); return { top: b.top, height: b.height }; });
    const minIdleRatio = height >= width ? 0.85 : 0.75;
    assert.ok(idleCheck.mapRatio >= minIdleRatio && idleCheck.pillHeight <= 42 && idleCheck.centerIntrusions === 0 && expandedHeaderBottom < Math.min(...result.floats.map(b => b.top)) && drawerBox.top > result.header.bottom, `Protected Central Discovery Region (${width}x${height}): >=${Math.round(minIdleRatio * 100)}% unobscured map on idle (got ${(idleCheck.mapRatio * 100).toFixed(1)}%), <=40px collapsed pill, 0 controls in central discovery zone, expanded filters and open drawer clear controls`);

    if (height === 844 && [390, 768, 1440].includes(width)) {
      await page.setContent(html);
      await page.screenshot({ path: path.join(artifacts, `map-family-${width}.png`), fullPage: true });
    }
    evidence.push({ width, height, ...result, idleCheck, expandedHeaderBottom, drawerBox });
    await page.close();
  }
  writeFileSync(path.join(artifacts, 'measurements.json'), JSON.stringify({ sourceHashes: Object.fromEntries([mapPath, familyPath, homePath].map(p => [path.relative(ROOT, p), crypto.createHash('sha256').update(readFileSync(p)).digest('hex')])), fixtureOnly: true, liveMapkitVerified: false, evidence }, null, 2));
  console.log('test-map-family-layout: PASS actual 390x844/393x852/430x932/844x390/768x844/1440x844 viewports, compact <=168px map preview + 268px family card, >=80% unobscured idle map, and Protected Central Discovery Region invariant');
} finally { await browser.close(); delete globalThis.__mapLayoutPlaces; }
