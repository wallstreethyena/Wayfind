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
const mapHtml = renderToStaticMarkup(React.createElement(MapScreen, { ctx }));
const eventHtml = renderToStaticMarkup(React.createElement(family.FamilyEventCard, { event: { id: 'event-layout', name: 'Science Night For The Entire Family At The Museum', href: '/florida-events/science', whenFact: 'Saturday · 10:00 AM', venue: 'Science Hall', distMi: 4.2 } }));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#07111c;color:#eee;font-family:system-ui}#map-fixture{height:844px;position:relative}.family-fixture{padding:16px}${WF_PLACE_CARD_CSS}</style></head><body><div id="map-fixture">${mapHtml}</div><div class="family-fixture"><ol class="wf-rail wf-rail-exploding">${eventHtml}</ol></div></body></html>`;
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
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.route('**/*', route => route.abort());
    await page.setContent(html);
    const result = await page.evaluate(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
      const cards = [...document.querySelectorAll('.wf-place-card')].map(card => ({ ...box(card), controls: [...card.querySelectorAll('button,a')].map(box) }));
      const floats = [...document.querySelectorAll('.wf-map-explorer>button')].map(box);
      return { actualWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, header: box(document.querySelector('.wf-mapfp')), cards, floats };
    });
    assert.equal(result.actualWidth, width, 'achieved browser width');
    assert.ok(result.documentWidth <= width, 'no document overflow');
    assert.equal(result.cards.length, 2, 'actual map IconicPlaceCard and Family RailCard are mounted');
    for (const card of result.cards) {
      assert.equal(Math.round(card.height), 268, 'all card bodies retain the shared 268px height');
      assert.ok(card.width <= 440 && card.right <= width + .5 && card.left >= 0, 'shared card widths remain bounded and fit mobile');
      for (const control of card.controls) if (control.width > 0 && control.height > 0) {
        assert.ok(control.left >= card.left - .5 && control.right <= card.right + .5 && control.top >= card.top - .5 && control.bottom <= card.bottom + .5, 'visible card controls stay contained');
      }
    }
    assert.ok(result.header.bottom < Math.min(...result.floats.map(b => b.top)), 'map controls clear the achieved category/subcategory header');
    for (let i = 0; i < result.floats.length; i++) for (let j = i + 1; j < result.floats.length; j++) {
      const a = result.floats[i], b = result.floats[j];
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, 'floating controls do not overlap');
    }
    await page.screenshot({ path: path.join(artifacts, `map-family-${width}.png`), fullPage: true });
    evidence.push({ width, ...result });
    await page.close();
  }
  writeFileSync(path.join(artifacts, 'measurements.json'), JSON.stringify({ sourceHashes: Object.fromEntries([mapPath, familyPath, homePath].map(p => [path.relative(ROOT, p), crypto.createHash('sha256').update(readFileSync(p)).digest('hex')])), fixtureOnly: true, liveMapkitVerified: false, evidence }, null, 2));
  console.log('test-map-family-layout: PASS actual 390/768/1440px widths, map preview + family event shared 268px cards, contained controls, no overflow and non-overlapping map controls; SDK/API execution not claimed');
} finally { await browser.close(); delete globalThis.__mapLayoutPlaces; }
