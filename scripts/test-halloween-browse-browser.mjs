#!/usr/bin/env node
// Render the actual Halloween page, location store, card photos, sort control,
// commerce beacon and Boo companion in Chromium. Only analytics transports,
// the navigation pathname and unrelated icon kit are replaced. All requests
// stay on an ephemeral loopback fixture; no production account/API is used.
// Owner's October 30 split-card/rail design is deliberately tested in pixels.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { halloweenBrowse } from '../lib/halloweenBrowse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('@playwright/test')); }
const OUT = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
if (OUT) mkdirSync(OUT, { recursive: true });
const modules = new Map();
const stubs = {
  'lib/browserAnalytics.js': 'exports.captureOrQueue=(w,name,data)=>{w.__events.push({name,data});return true;};exports.analyticsSuppressionReason=()=>null;',
  'lib/analytics.js': 'exports.PARTNER_CLICK_EVENT="partner_click";exports.forwardToGoogle=(name,data,options)=>window.__google.push({name,data,options});',
  'app/components/kit.js': 'exports.NavIcon=({size=17})=>React.createElement("svg",{width:size,height:size,viewBox:"0 0 24 24","aria-hidden":true},React.createElement("circle",{cx:12,cy:12,r:8,stroke:"currentColor",fill:"none"}));',
};
function emit(rel) {
  if (modules.has(rel)) return;
  modules.set(rel, '');
  if (stubs[rel]) { modules.set(rel, stubs[rel]); return; }
  const source = readFileSync(path.join(ROOT, rel), 'utf8').replace(/from\s+(["'])(\.[^"']+)\1/g, (_all, _quote, spec) => {
    let dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!/\.jsx?$/.test(dep)) dep += '.js';
    emit(dep);
    return 'from ' + JSON.stringify(dep);
  });
  modules.set(rel, ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText);
}
emit('app/components/BoHalloweenHaunt.js');
emit('app/components/BooCompanion.js');
const photo = (n) => ({ src: '/events/' + (n ? 'community-kids.jpg' : 'theater-stage.jpg'), alt: 'Local test photograph ' + n, width: 800, height: 600, credit: 'Local fixture photograph (test only)' });
const photos = [photo(0), photo(1)];
const haunt = (id, extra = {}) => ({ id, eventId: 'event-' + id, name: 'Fixture ' + id + ' Halloween night', filters: ['local'], lat: 27.9506, lng: -82.4572, wfScore: 80, photos, timing: 'October 30 · 7 PM', place: 'Tampa, FL', scareLevel: 'Scary', price: { kind: 'from', amount: 27 }, priceLabel: 'From $27', bookable: true, eventHref: '/florida-events/' + id, cta: { kind: 'organizer', href: 'https://tickets.example.test/' + id + '?date=2026-10-30', label: 'Get tickets', via: 'Official organizer' }, ...extra });
const tour = (id, extra = {}) => ({ id, name: 'Fixture ' + id + ' walking tour', kind: 'walking_tour', lat: 27.95, lng: -82.455, photos, place: 'Tampa, FL', duration: '90 minutes', rating: 4.8, reviews: 140, ratingLabel: '4.8 · 140 traveler reviews', fromPrice: 25.75, priceLabel: 'From $25.75', priceUnit: 'per person', cta: { kind: 'affiliate', href: '/api/commerce/go?provider=viator&offer=' + id + '&content=hw-tour-' + id + '&surface=halloween_haunts', label: 'Check tickets', via: 'Via Viator' }, ...extra });
const model = {
  chrome: { title: 'Halloween in Florida', videoLabel: 'Boo, your Halloween guide', ask: 'Ask Boo' },
  haunts: [
    ...Array.from({ length: 8 }, (_, i) => haunt('scare-' + i, { lat: 27.9506 + i * 0.015, wfScore: 80 + i, price: { kind: 'from', amount: 35 - i }, priceLabel: 'From $' + (35 - i) })),
    haunt('family-tampa', { filters: ['family'], name: 'Fixture family pumpkin walk' }),
    haunt('party-tampa', { browseCategory: 'parties', filters: [], name: 'Fixture Halloween costume party' }),
    haunt('family-orlando', { filters: ['family'], lat: 28.5384, lng: -81.3789, place: 'Orlando, FL' }),
    haunt('far-jacksonville', { lat: 30.3322, lng: -81.6557 }),
    haunt('unknown-location', { lat: null, lng: null }),
    haunt('approx-location', { coordApprox: true }),
    haunt('string-location', { lat: '27.95' }),
  ],
  tours: [tour('ghost-tampa'), tour('private-tampa', { fromPrice: 99, priceUnit: 'per group', rating: 4.9 }), tour('adult-pub', { kind: 'pub_crawl', adultOnly: true })],
  eventTours: [],
};
// Deploy images may lack Chromium. Merge CI installs it before this suite;
// explicit local release acceptance passes --require-browser and fails if absent.
if (!existsSync(chromium.executablePath())) {
  const eligible = halloweenBrowse(model, { lat: 27.9506, lng: -82.4572 });
  if (eligible.cards.length !== 13) throw Error('Pure fixture eligibility failed');
  if (process.argv.includes('--require-browser')) throw Error('Chromium is required for Halloween browser verification');
  console.log('Pure fixture eligibility passed. BROWSER CHECK NOT RUN: Chromium unavailable; merge CI installs it.');
  process.exit(0);
}
const code = [...modules].map(([id, js]) => JSON.stringify(id) + ':function(module,exports,require){\n' + js + '\n}').join(',\n');
const entry = `const process={env:{NODE_ENV:'test',WF_SUPPRESS_ANALYTICS:'1'}};
const modules={${code}},cache={};function require(id){if(id==='react')return React;if(id==='next/navigation')return {usePathname:()=>'/halloween-in-florida'};if(cache[id])return cache[id].exports;if(!modules[id])throw Error('unbundled '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
const Page=require('app/components/BoHalloweenHaunt.js').default,Boo=require('app/components/BooCompanion.js').default;
window.__store=require('lib/deviceLocationStore.js').deviceLocationStore;
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(Page,{model:${JSON.stringify(model)}}),React.createElement(Boo)));
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a){window.__links.push(a.getAttribute('href'));e.preventDefault();}});
${process.argv.includes('--fault=overflow') ? "document.documentElement.style.minWidth='1800px';" : ''}`;
const reactScripts = ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js'].map((name) => readFileSync(path.join(ROOT, 'node_modules', name), 'utf8')).join('\n');
const faces = [[400, 'Inter-Regular-ascii.woff'], [600, 'Inter-SemiBold-ascii.woff'], [800, 'Inter-ExtraBold-ascii.woff']].map(([w, f]) => `@font-face{font-family:WfFixtureInter;font-weight:${w === 800 ? '700 900' : w === 600 ? '500 699' : '100 499'};src:url('/fonts/${f}') format('woff')}`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#0d1117;color:#f8f5ee;--wf-sans:WfFixtureInter;font-family:var(--wf-sans),sans-serif}button,input,select{font-family:inherit}</style></head><body><div id="root"></div><script>${reactScripts.replace(/<\/script/gi, '<\\/script')}</script><script>${entry.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/' || pathname === '/halloween-in-florida') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
  if (pathname.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ reply: 'Fixture reply. Choose a nearby Halloween plan.' })); return; }
  const asset = pathname.startsWith('/fonts/') ? path.join(ROOT, 'scripts/fixtures', pathname) : path.join(ROOT, 'public', pathname);
  if (asset.startsWith(ROOT + path.sep) && existsSync(asset)) {
    const type = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.svg': 'image/svg+xml' }[path.extname(asset)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); res.end(readFileSync(asset)); return;
  }
  res.writeHead(404); res.end('Fixture asset missing');
});
let browser, lastPage, assertions = 0;
const checks = [], external = [];
function ok(condition, message) { assertions++; if (!condition) throw Error(message); checks.push(message); }
const shots = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); };
async function init(page, { permission = 'prompt', savedArea = '', savedCenter = true } = {}) {
  await page.addInitScript(({ permission, savedArea, savedCenter }) => {
    const NativeDate = Date, start = performance.now(), base = NativeDate.parse('2026-10-30T16:00:00Z');
    window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [base + performance.now() - start])); } static now() { return base + performance.now() - start; } };
    window.__events = []; window.__google = []; window.__links = []; window.__geoCalls = 0; window.__geoMode = permission; window.__cleared = [];
    const permissionObject = { get state() { return window.__geoMode; }, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => permissionObject } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition(success, fail) { window.__geoCalls++; setTimeout(() => window.__geoMode === 'denied' ? fail({ code: 1 }) : success({ coords: { latitude: 27.9506, longitude: -82.4572 }, timestamp: Date.now() }), 0); return window.__geoCalls; }, getCurrentPosition() { window.__geoCalls++; throw Error('unexpected direct geolocation'); }, clearWatch(id) { window.__cleared.push(id); } } });
    localStorage.clear();
    if (savedArea) localStorage.setItem('wf_halloween_area_v1', savedArea);
    if (savedCenter) localStorage.setItem('wf_center', JSON.stringify({ lat: 27.9506, lng: -82.4572, city: 'Tampa', source: 'gps', timestamp: Date.now() }));
  }, { permission, savedArea, savedCenter });
}
async function swipe(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const session = await page.context().newCDPSession(page);
  const y = box.y + Math.min(120, box.height / 2), x = box.x + Math.min(box.width - 20, 260), end = box.x + 25;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (end - x) * i / 8, y }] }); await page.waitForTimeout(18); }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let launch = { headless: true };
  if (!existsSync(chromium.executablePath()) && existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) launch = { ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] };
  browser = await chromium.launch(launch); // Missing browser is a failure, never a source-only pass.
  async function open(width, options) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: 'reduce', timezoneId: 'America/New_York' });
    const page = await context.newPage(); lastPage = page;
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await context.route('**/*', (route) => { if (new URL(route.request().url()).origin === base) return route.continue(); external.push(route.request().url()); return route.abort(); });
    await init(page, options); await page.goto(base); await page.getByRole('heading', { name: 'Halloween in Florida', exact: true }).waitFor(); await page.evaluate(() => document.fonts.ready);
    return { context, page, errors };
  }
  // Denied and unknown location are genuine empty-location states, even when a
  // stale search/map centre happens to claim it once came from GPS.
  for (const permission of ['prompt', 'denied']) {
    const { context, page, errors } = await open(390, { permission });
    await page.waitForTimeout(1200); // Exercises the passive store-mirror tick.
    ok(await page.evaluate(() => window.__geoCalls) === 0, permission + ': mount never prompts for geolocation');
    ok(await page.locator('.boo-card').count() === 0, permission + ': saved map centre does not masquerade as live device location');
    ok(await page.getByRole('heading', { name: 'Where are you looking?' }).isVisible(), permission + ': explicit location choice is visible');
    if (permission === 'denied') {
      await page.getByRole('button', { name: 'Use my location', exact: true }).click();
      await page.getByText('Location access is blocked. Choose an area or allow location access in your browser.', { exact: true }).waitFor();
      ok(await page.evaluate(() => window.__geoCalls) <= 1, 'denied: explicit request fails once without a prompt loop');
      await page.getByRole('button', { name: 'Choose area', exact: true }).click();
      await page.getByLabel('Choose a Florida area').selectOption('orlando');
      await page.locator('[data-browse-id="family-orlando"]').waitFor();
      ok(await page.locator('.boo-card').count() === 1, 'denied: explicit Orlando area excludes stale Tampa device/search coordinates');
      ok((await page.locator('.boo-distance').innerText()).includes('from area center'), 'denied: distance truthfully labels area centre');
    }
    ok(errors.length === 0, permission + ': no browser errors'); await context.close();
  }
  for (const width of [320, 390, 768, 1440]) {
    const { context, page, errors } = await open(width, { savedArea: 'tampa' });
    await page.locator('[data-browse-id="scare-7"]').waitFor();
    ok(await page.evaluate(() => innerWidth) === width, width + ': achieved viewport');
    ok(await page.evaluate(() => ['400', '600', '800'].every((w) => document.fonts.check(w + ' 13px WfFixtureInter')) && [...document.fonts].filter((font) => font.status === 'loaded').length >= 3), width + ': all embedded Inter weights actually loaded');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': page has no horizontal overflow');
    ok(await page.evaluate(() => window.__geoCalls) === 0, width + ': restoring explicit area does not request GPS');
    ok(await page.locator('[data-halloween-rail]').count() === 4, width + ': four distinct category rails rendered');
    ok(await page.locator('.boo-card').count() === 13, width + ': expected nearby cards only (no far, unknown or approximate locations)');
    const expected = halloweenBrowse(model, { lat: 27.9506, lng: -82.4572 });
    ok(expected.cards.length === 13 && expected.coverage.unknown === 3, width + ': real browse contract admits the exact fixture set');
    const measured = await page.locator('.boo-card').evaluateAll((cards) => cards.map((card) => {
      const box = card.getBoundingClientRect(), photo = card.querySelector('.boo-photo').getBoundingClientRect(), body = card.querySelector('.boo-body').getBoundingClientRect(), cta = card.querySelector('.boo-buy').getBoundingClientRect();
      return { id: card.dataset.browseId, split: photo.width > 0 && body.width > 0 && photo.right <= body.left + 1 && Math.abs(photo.top - body.top) < 2, contained: cta.left >= box.left && cta.right <= box.right && cta.bottom <= box.bottom + 1, textFits: card.querySelector('.boo-body').scrollWidth <= body.width + 1 };
    }));
    ok(measured.map((row) => row.id).sort().join('|') === expected.cards.map((row) => row.id).sort().join('|'), width + ': rendered card identities match real browse return values');
    ok(measured.length === 13 && measured.every((x) => x.split), width + ': every haunt and tour uses photo-left/text-right split geometry');
    ok(measured.every((x) => x.contained && x.textFits), width + ': every card contains its CTA and text without clipping');
    ok(await page.locator('.boo-c').count() === 1 && await page.locator('.boo-c').evaluate((el) => getComputedStyle(el).display) === 'none', width + ': floating Boo is absent from hit-testing and visual overlap');
    ok(await page.locator('.boo-pick-card').count() === 0, width + ': no duplicate recommendation cards');
    const rail = page.locator('[data-halloween-rail="scares"]'), track = rail.locator('[data-halloween-rail-track]');
    ok(await track.evaluate((el) => el.scrollWidth > el.clientWidth + 10), width + ': category rail genuinely scrolls horizontally');
    await rail.getByRole('button', { name: 'Next Haunted houses and scare parks', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-halloween-rail="scares"] .boo-rail').scrollLeft > 30);
    ok(await track.evaluate((el) => el.scrollLeft) > 30, width + ': Next arrow reveals later cards');
    await rail.getByRole('button', { name: 'Previous Haunted houses and scare parks', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-halloween-rail="scares"] .boo-rail').scrollLeft < 5);
    await track.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-halloween-rail="scares"] .boo-rail').scrollLeft > 30);
    ok(await track.evaluate((el) => el.scrollLeft) > 30, width + ': keyboard arrow scrolls category rail');
    await track.evaluate((el) => { el.scrollLeft = 0; });
    if (width <= 390) { await swipe(page, track); await page.waitForFunction(() => document.querySelector('[data-halloween-rail="scares"] .boo-rail').scrollLeft > 30); ok(await track.evaluate((el) => el.scrollLeft) > 30, width + ': native touch swipe scrolls category rail'); }
    const filter = page.locator('[data-collection-filter]'), trigger = filter.locator(':scope > button').first();
    await trigger.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog', { name: 'Filter and sort this list' }).waitFor();
    ok(await page.getByRole('button', { name: 'Top rated', exact: true }).last().getAttribute('aria-pressed') === 'true', width + ': menu exposes current rating selection');
    const menuBox = await page.getByRole('dialog', { name: 'Filter and sort this list' }).boundingBox();
    ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1, width + ': open sort dialog fits horizontally inside viewport');
    await shots(page, 'sort-' + width);
    await page.keyboard.press('Escape');
    ok(await page.getByRole('dialog', { name: 'Filter and sort this list' }).count() === 0 && await trigger.evaluate((el) => document.activeElement === el), width + ': Escape closes sort dialog and restores focus');
    await trigger.press('Enter');
    // Reach a real sort option entirely with the keyboard; no direct handler call.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.activeElement.textContent.trim()) === 'Closest first', width + ': keyboard reaches Closest first');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-halloween-rail="scares"] .boo-card').dataset.browseId === 'scare-0');
    ok(await trigger.innerText().then((s) => s.includes('Closest first')), width + ': closest-first selection changes real card order');
    await trigger.press('Enter'); await filter.getByRole('button', { name: 'Price: low to high', exact: true }).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-halloween-rail="scares"] .boo-card').dataset.browseId === 'scare-7');
    ok((await rail.locator('.boo-group-label').first().innerText()).includes('Per person'), width + ': price ordering displays comparable admission basis');
    ok(await page.evaluate(() => localStorage.getItem('wf_halloween_sort')) === 'price', width + ': sort choice persists');
    const first = rail.locator('.boo-card').first(), strip = first.locator('.boo-strip');
    await track.evaluate((el) => { el.scrollLeft = 0; }); await strip.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.__events.filter((e) => e.name === 'commerce_cta_clicked').length);
    await strip.evaluate((el) => { el.scrollLeft = el.clientWidth; });
    await first.locator('.boo-dots i:nth-child(2).is-on').waitFor();
    ok(await first.locator('.boo-strip img').count() === 2 && await first.locator('.boo-strip img').last().evaluate((im) => im.complete && im.naturalWidth > 0), width + ': gallery displays second real local photograph');
    ok(await page.evaluate(() => window.__events.filter((e) => e.name === 'commerce_cta_clicked').length) === before, width + ': gallery scroll emits no commerce click');
    const buy = first.locator('.boo-buy'), original = await buy.getAttribute('href');
    await buy.click();
    ok(await buy.getAttribute('href') === original && (await page.evaluate(() => window.__links.at(-1))) === original, width + ': organizer CTA retains exact destination');
    ok(await page.evaluate(() => window.__events.filter((e) => e.name === 'commerce_cta_clicked').length) === before + 1, width + ': organizer CTA emits exactly one commerce event');
    const partner = page.locator('[data-browse-id="ghost-tampa"] .boo-buy'), partnerBefore = await partner.getAttribute('href');
    await partner.click();
    const partnerAfter = await partner.getAttribute('href'), a = new URL(partnerBefore, base), b = new URL(partnerAfter, base);
    ok(a.pathname === b.pathname && [...a.searchParams].every(([k, v]) => b.searchParams.get(k) === v) && !!b.searchParams.get('click_id'), width + ': affiliate CTA preserves exact offer/destination and adds attribution');
    ok(await page.evaluate(() => window.__events.filter((e) => e.name === 'commerce_cta_clicked').length) === before + 2 && await page.evaluate(() => window.__google.length) === 1, width + ': affiliate CTA emits one commerce event and one isolated Ads signal');
    const sourceTour = model.tours.find((row) => row.id === 'ghost-tampa');
    const partnerEvent = await page.evaluate(() => window.__events.filter((event) => event.name === 'commerce_cta_clicked').at(-1).data);
    ok(partnerEvent.offer_id === sourceTour.id && partnerEvent.content_id === 'hw-tour-' + sourceTour.id, width + ': affiliate commerce event retains exact source offer and content identity');
    ok(a.searchParams.get('offer') === sourceTour.id && a.searchParams.get('content') === 'hw-tour-' + sourceTour.id && partnerEvent.offer_id === a.searchParams.get('offer') && partnerEvent.content_id === a.searchParams.get('content'), width + ': affiliate event identity matches original commerce URL contract');
    ok((await page.locator('[data-browse-id="ghost-tampa"] .boo-amt').innerText()) === '$25.75', width + ': tour price keeps cents');
    await page.getByRole('button', { name: 'Family', exact: true }).click();
    ok(await page.locator('.boo-card').count() === 1 && await page.locator('[data-browse-id="family-tampa"]').count() === 1, width + ': family selection excludes adult nightlife and unclassified tours');
    await page.getByRole('button', { name: 'All categories', exact: true }).click();
    await shots(page, 'browse-' + width);
    await page.getByRole('button', { name: 'Ask Boo', exact: true }).click(); await page.getByRole('dialog', { name: 'Chat with Boo', exact: true }).waitFor();
    ok(await page.getByRole('dialog', { name: 'Chat with Boo', exact: true }).isVisible(), width + ': explicit Ask Boo still opens actual companion chat');
    await page.getByRole('button', { name: 'Close chat', exact: true }).click();
    ok(await page.getByRole('dialog', { name: 'Chat with Boo', exact: true }).count() === 0, width + ': chat closes without trapping browsing');
    await page.getByRole('button', { name: 'Use my location', exact: true }).click();
    await page.getByRole('heading', { name: 'Halloween near your current location', exact: true }).waitFor();
    ok(await page.evaluate(() => window.__geoCalls) === 1 && (await page.locator('.boo-distance').first().innerText()).includes('mi away'), width + ': one explicit request uses fresh device coordinates and correct distance label');
    ok(await page.getByRole('button', { name: 'Choose area', exact: true }).count() === 0, width + ': live GPS priority does not expose an ineffective area control');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ': interaction sequence keeps page within viewport');
    ok(errors.length === 0, width + ': no browser runtime errors'); await context.close();
  }
  ok(external.length === 0, 'no requests attempted external services');
  if (OUT) writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ assertions, checks, bundledSources: [...modules.keys()], external }, null, 2));
  console.log(`test-halloween-browse-browser: OK — ${assertions} assertions; actual component at 320/390/768/1440; local mocked services only`);
} catch (error) {
  console.error('test-halloween-browse-browser: FAIL — ' + error.stack);
  if (lastPage && !lastPage.isClosed()) { await shots(lastPage, 'failure'); console.error((await lastPage.locator('body').innerText()).slice(-2400)); }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.listening ? server.close(resolve) : resolve());
}
