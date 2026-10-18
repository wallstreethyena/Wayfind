// Real homepage + shared cards. All API and third-party traffic is contained;
// fixtures prove UI/paging behavior, not the coverage of production inventory.
const { test, expect } = require('@playwright/test');
const { containAnalytics, assertContained } = require('./lib/containment');
const HALLOWEEN = [
  ['decorated-bars', 'Decorated Bars & Themed Dining'], ['themed-food', 'Halloween Treats & Themed Drinks'],
  ['haunts', 'Haunted Houses & Fright Nights'], ['farms', 'Pumpkin Patches & Fall Farms'],
  ['corn-mazes', 'Corn Mazes'], ['family', 'Halloween With the Kids'],
  ['festivals', 'Halloween Festivals & Parties'], ['ghost-tours', 'Ghost Tours & Haunted History'],
  ['last-minute', 'Last Minute Halloween Plans'],
];
const FALL = ['food', 'farms', 'theme-parks', 'haunts', 'family', 'oktoberfest', 'date-night', 'festivals', 'photos', 'day-trips'].map(id => [id, `Fall fixture ${id}`]);
const countFor = id => ['haunts', 'decorated-bars'].includes(id) ? 25 : 1;
function cards(id, count) {
  if (['decorated-bars', 'themed-food'].includes(id)) return Array.from({ length: count }, (_, i) => ({
    id: `fixture-${id}-${i}`, kind: 'place', name: `Halloween ${id} venue ${i + 1}`,
    city: 'Tampa', lat: 27.95, lng: -82.46, category: id === 'decorated-bars' ? 'bar' : 'restaurant',
    wfScore: 91, rating: 4.7, reviews: 125, distMi: 5,
    take: id === 'decorated-bars' ? 'A transformed Halloween room with themed drinks for this fixture.' : 'A Halloween themed dessert menu for this fixture.',
    seasonalStart: '2026-10-13', seasonalThrough: '2026-10-31', seasonalWhen: '2026-10-13 – 2026-10-31; select dates', select_nights: true,
    halloweenRail: id, tags: ['halloween'],
    sourceUrl: 'http://localhost:3000/fixture/official-seasonal-menu',
    hospitalityEvidence: { sourceUrl: 'http://localhost:3000/fixture/official-seasonal-menu', checkedAt: '2026-10-13', experience: id === 'decorated-bars' ? 'decorated_bar' : 'themed_food_drink' },
  }));
  return Array.from({ length: count }, (_, i) => ({
    id: `fixture-${id}-${i}`, kind: 'event', name: `Halloween ${id} outing ${i + 1}`,
    city: 'Tampa', venue: 'Fixture venue', lat: 27.95, lng: -82.46,
    start_date: '2026-10-13', end_date: '2026-10-31', event_status: 'scheduled',
    officialOnly: true, url: 'https://example.com/event', hook: 'A seasonal outing for this browser fixture.',
    schedule: { label: 'Select October dates', title: 'Fixture schedule only' },
  }));
}
for (const width of [390, 768, 1440]) {
  test(`Halloween poster opens nine rails and pages events and hospitality places at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-13T16:00:00-04:00'));
    await page.addInitScript(() => {
      localStorage.setItem('wf_center', JSON.stringify({ lat: 27.95, lng: -82.46, loc: 'Tampa, FL', manual: true, ts: Date.now() }));
      window.__halloweenDocument = 'same-document';
    });
    const requests = [], network = [], errors = [];
    page.on('pageerror', err => errors.push(err.message));
    const containment = await containAnalytics(context, { passThrough: async route => {
      const req = route.request(), url = new URL(req.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
      if (url.pathname === '/fixture/official-seasonal-menu') return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Official fixture menu</title><p>Contained source fixture.</p>' });
      if (url.pathname.startsWith('/api/')) {
        let body = {};
        if (url.pathname === '/api/events/fall') {
          requests.push(Object.fromEntries(url.searchParams));
          const halloween = url.searchParams.get('collection') === 'halloween';
          const defs = halloween ? HALLOWEEN : FALL;
          const rail = url.searchParams.get('rail');
          if (rail) {
            const all = cards(rail, countFor(rail)), pageNumber = Number(url.searchParams.get('page'));
            body = { id: rail, cards: all.slice(pageNumber * 10, pageNumber * 10 + 10), total: all.length, page: pageNumber, hasMore: (pageNumber + 1) * 10 < all.length };
          } else body = { today: '2026-10-13', phase: 'halloween', rails: defs.map(([id, title]) => ({ id, title, deck: 'Seasonal fixture outings.', cards: cards(id, Math.min(12, countFor(id))), total: countFor(id) })) };
        } else if (url.pathname === '/api/events') body = { events: [], sources: [], counts: {}, health: [] };
        else if (url.pathname === '/api/rails') body = { rails: [], places: {}, today: '2026-10-13' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      network.push(req.url());
      return route.continue();
    }});
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    const poster = page.locator('[data-id="halloween"]');
    await expect(poster).toHaveCount(1);
    await poster.scrollIntoViewIfNeeded();
    const artwork = poster.locator('img');
    await expect.poll(() => artwork.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(poster).toHaveClass(/is-art-ready/);
    await expect(artwork).toHaveCSS('opacity', '1');
    await poster.screenshot({ path: testInfo.outputPath(`poster-${width}.png`) });
    const urlBefore = page.url();
    await poster.locator('button.wf8-tlink').click();
    for (const [, title] of HALLOWEEN) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('[data-rail^="halloween-intent-"]')).toHaveCount(9);
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.__halloweenDocument)).toBe('same-document');
    const haunts = page.locator('[data-rail="halloween-intent-haunts"]');
    const items = haunts.locator('article.wf-place-card');
    await expect(items).toHaveCount(10);
    await items.nth(7).scrollIntoViewIfNeeded();
    await expect(items).toHaveCount(20);
    await items.nth(17).scrollIntoViewIfNeeded();
    await expect(items).toHaveCount(25);
    const titles = await items.locator('.wf-place-card-name').allTextContents();
    expect(new Set(titles).size).toBe(25);
    expect(requests.filter(r => r.rail === 'haunts').map(r => [r.collection, r.page])).toEqual([['halloween', '1'], ['halloween', '2']]);
    const decorated = page.locator('[data-rail="halloween-intent-decorated-bars"]');
    const placeItems = decorated.locator('article.wf-place-card');
    await expect(placeItems).toHaveCount(10);
    await placeItems.nth(7).scrollIntoViewIfNeeded();
    await expect(placeItems).toHaveCount(20);
    await placeItems.nth(17).scrollIntoViewIfNeeded();
    await expect(placeItems).toHaveCount(25);
    expect(new Set(await placeItems.locator('.wf-place-card-name').allTextContents()).size).toBe(25);
    expect(requests.filter(r => r.rail === 'decorated-bars').map(r => [r.collection, r.page])).toEqual([['halloween', '1'], ['halloween', '2']]);
    const themedFood = page.locator('[data-rail="halloween-intent-themed-food"] article.wf-place-card').first();
    const geometries = [];
    for (const card of [items.first(), placeItems.first(), themedFood]) {
      await card.scrollIntoViewIfNeeded();
      const geometry = await card.evaluate(card => {
        const rect = card.getBoundingClientRect();
        const controls = [...card.querySelectorAll('button,a')].map(el => { const r = el.getBoundingClientRect(); return { label: el.textContent, className: el.className, left: r.left - rect.left, right: r.right - rect.left, top: r.top - rect.top, bottom: r.bottom - rect.top }; });
        return { width: rect.width, height: rect.height, controls };
      });
      console.log(JSON.stringify({ achievedViewport: width, card: geometry }));
      await card.screenshot({ path: testInfo.outputPath(`card-${geometries.length}-${width}.png`) });
      expect(geometry.height).toBeCloseTo(268, 2);
      expect(geometry.width).toBeLessThanOrEqual(440);
      for (const r of geometry.controls) { expect(r.left).toBeGreaterThanOrEqual(-1); expect(r.right).toBeLessThanOrEqual(geometry.width + 1); expect(r.top).toBeGreaterThanOrEqual(-1); expect(r.bottom).toBeLessThanOrEqual(geometry.height + 1); }
      geometries.push(geometry);
    }
    for (const card of [placeItems.first(), themedFood]) {
      await expect(card.getByText('Select Oct 13–31', { exact: false })).toBeVisible();
      await expect(card.getByRole('button', { name: /Source/ })).toBeVisible();
      await expect(card.locator('.wf-place-card-score')).toContainText('9.1');
    }
    const sourcePopup = page.waitForEvent('popup');
    await placeItems.first().getByRole('button', { name: /Source/ }).click();
    const sourcePage = await sourcePopup;
    await sourcePage.waitForLoadState('domcontentloaded');
    expect(new URL(sourcePage.url()).pathname).toBe('/fixture/official-seasonal-menu');
    await expect(sourcePage.getByText('Contained source fixture.')).toBeVisible();
    await sourcePage.close();
    await placeItems.first().scrollIntoViewIfNeeded();
    await decorated.screenshot({ path: testInfo.outputPath(`hospitality-${width}.png`) });
    await page.screenshot({ path: testInfo.outputPath(`rails-${width}.png`) });
    await page.getByRole('button', { name: '✕ Close', exact: true }).click();
    await expect(page.locator('[data-rail^="halloween-intent-"]')).toHaveCount(0);
    await poster.locator('button.wf8-tlink').click();
    await expect(page.locator('[data-rail^="halloween-intent-"]')).toHaveCount(9);
    await page.locator('[data-id="augtober"] button.wf8-tlink').click();
    await expect(page.locator('[data-rail^="fall-intent-"]')).toHaveCount(10);
    await expect(page.locator('[data-rail^="halloween-intent-"]')).toHaveCount(0);
    expect(requests.some(r => !r.collection && !r.rail)).toBe(true);
    expect(errors).toEqual([]);
    expect(network.every(url => /https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url))).toBe(true);
    assertContained(containment, expect);
    console.log(JSON.stringify({ width: await page.evaluate(() => innerWidth), cards: geometries, eventPaging: 25, placePaging: 25, rails: 9 }));
  });
}
