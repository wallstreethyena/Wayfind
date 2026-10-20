// A shared place opens immediately. Late photo success, a miss, and errors
// must preserve its initial header/body geometry, while real photos remain usable.
// All place/photo responses are local fixtures; no analytics or writes escape.
const { test, expect } = require("@playwright/test");
const { containAnalytics, assertContained } = require("./lib/containment");

// Optional system Chromium for constrained runners; normal CI uses Playwright.
if (process.env.E2E_CHROMIUM_PATH) test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH, args: ["--no-sandbox", "--disable-gpu"] } });

const ID = "ChIJ_37IauQ_w4gRz03lc0QInIE";
const NAME = "Detail layout fixture";
const AUTHOR_URI = "https://maps.google.com/maps/contrib/fixture";
const MAPS_URI = "https://maps.google.com/?q=fixture";
const BASE_HOST = new URL(process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`).host;
const PHOTO = "/__detail_layout_photo.svg";
const PHOTO2 = "/__detail_layout_photo2.svg";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#285d74"/><circle cx="400" cy="220" r="100" fill="#e7b45c"/></svg>';
const place = (existing) => ({
  id: ID, displayName: { text: NAME }, formattedAddress: "100 Fixture Avenue, Sarasota, FL",
  location: { latitude: 27.3364, longitude: -82.5307 }, types: ["tourist_attraction"],
  rating: 4.7, userRatingCount: 300, googleMapsUri: "https://maps.google.com/?q=fixture",
  photos: existing ? [{ _directUri: PHOTO }] : [],
});

async function setup(context, { existing = false, outcome = "success", svg = SVG, multiple = false } = {}) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = { identities: 0, photos: 0, settled: 0 };
  await context.addInitScript(() => {
    window.__detailShifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__detailShifts.push({
        value: e.value, time: e.startTime,
        sources: (e.sources || []).map((s) => ({ tag: s.node?.tagName, before: s.previousRect.toJSON(), after: s.currentRect.toJSON() })),
      });
    }).observe({ type: "layout-shift", buffered: true });
  });
  const log = await containAnalytics(context, {
    // Read-only place identity/enrichment POSTs are fulfilled below, never sent.
    allowPost: [/\/api\/places\/details(?:\?|$)/],
    passThrough: async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/places/details") {
        const request = route.request().postDataJSON();
        if (request.kind === "place") seen.identities++;
        return route.fulfill({ status: 200, json: { place: { ...place(existing), ...(multiple ? { photos: [{ _directUri: PHOTO }, { _directUri: PHOTO2 }] } : {}) }, source: "fixture" } });
      }
      if (url.pathname === "/api/photo" && url.searchParams.get("fmt") === "json") {
        seen.photos++;
        await gate;
        seen.settled++;
        if (outcome === "error") return route.fulfill({ status: 503, json: { error: "fixture unavailable" } });
        if (outcome === "miss") return route.fulfill({ status: 200, headers: { "x-wayfind-photo-result": "no-photo" }, json: { src: null, source: "none" } });
        return route.fulfill({ status: 200, json: { src: PHOTO, source: "google", credit: { name: "Fixture photographer", uri: AUTHOR_URI, mapsUri: MAPS_URI } } });
      }
      if (url.pathname === PHOTO || url.pathname === PHOTO2) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg });
      // No external inventory or enrichment is needed to exercise Detail.
      if (url.pathname.startsWith("/api/") || url.host !== BASE_HOST) return route.fulfill({ status: 503, json: { error: "outside fixture" } });
      if (process.env.E2E_FETCH_VIA_NODE) {
        const req = route.request();
        if (!["GET", "HEAD"].includes(req.method()) || url.host !== BASE_HOST) throw new Error("Only same-host read requests can be forwarded");
        const response = await fetch(req.url(), { method: req.method(), headers: await req.allHeaders(), redirect: "manual", signal: AbortSignal.timeout(20000) });
        const headers = {};
        response.headers.forEach((value, name) => { if (!/^(content-length|content-encoding|transfer-encoding)$/i.test(name)) headers[name] = value; });
        return route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
      }
      return route.continue();
    },
  });
  return { seen, release, log };
}

async function geometry(page) {
  return page.evaluate((name) => {
    const hero = document.querySelector("[data-detail-hero]");
    const body = document.querySelector("[data-detail-body]");
    const title = hero && [...hero.querySelectorAll("div")].find((n) => n.textContent === name && ![...n.children].some((c) => c.textContent === name));
    if (!hero || !body || !title) throw new Error("Detail fixture did not render its hero, title and body");
    const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { hero: rect(hero), title: rect(title), body: rect(body) };
  }, NAME);
}

function stable(before, after) {
  for (const key of ["hero", "title", "body"]) for (const axis of ["x", "y", "width", "height"]) {
    expect(Math.abs(after[key][axis] - before[key][axis]), `${key}.${axis} moved when the photo answer settled`).toBeLessThanOrEqual(1);
  }
}

async function markPhotoRelease(page) {
  await page.evaluate(() => { window.__detailPhotoReleased = performance.now(); });
}

async function assertPostReleaseCLS(page) {
  // Allow the rendering observer to deliver its last animation-frame batch.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const cls = await page.evaluate(() => {
    const entries = window.__detailShifts.filter((e) => e.time >= window.__detailPhotoReleased);
    let maximum = 0, value = 0, start = 0, previous = 0;
    for (const e of entries) {
      if (!value || e.time - previous >= 1000 || e.time - start >= 5000) { start = e.time; value = 0; }
      value += e.value; previous = e.time; maximum = Math.max(maximum, value);
    }
    return maximum;
  });
  expect(cls, "CLS after the delayed photo answer").toBeLessThanOrEqual(0.01);
}

async function assertCredit(page) {
  const credit = page.locator("[data-detail-body] [data-photo-credit]");
  await expect(credit).toBeVisible();
  await expect(credit.getByRole("link", { name: "Fixture photographer" })).toHaveAttribute("href", AUTHOR_URI);
  await expect(credit.getByRole("link", { name: "Google Maps", exact: true })).toHaveAttribute("href", MAPS_URI);
  const position = await credit.evaluate((n) => {
    const hero = document.querySelector("[data-detail-hero]");
    return { position: getComputedStyle(n).position, top: n.getBoundingClientRect().top, heroBottom: hero.getBoundingClientRect().bottom };
  });
  expect(position.position).toBe("static");
  expect(position.top, "plain credit flows below the hero and headline").toBeGreaterThanOrEqual(position.heroBottom);
}

async function assertFullPhoto(page, image) {
  const result = await image.evaluate((img) => {
    const r = img.getBoundingClientRect(), style = getComputedStyle(img);
    const hero = document.querySelector('[data-detail-hero]');
    const title = [...hero.querySelectorAll('div')].find(n => n.textContent === 'Detail layout fixture' && ![...n.children].some(c => c.textContent === 'Detail layout fixture'));
    const t = title.getBoundingClientRect();
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    return { fit: style.objectFit, loaded: img.complete && img.naturalWidth > 0,
      width: r.width, height: r.height, paintedWidth: img.naturalWidth * scale, paintedHeight: img.naturalHeight * scale,
      titleOverlaps: r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top,
      overflow: hero.scrollWidth > hero.clientWidth };
  });
  expect(result.loaded).toBe(true);
  expect(result.fit, 'actual image preserves the entire source, not just wrapper style').toBe('contain');
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
  expect(result.paintedWidth).toBeLessThanOrEqual(result.width + .01);
  expect(result.paintedHeight).toBeLessThanOrEqual(result.height + .01);
  expect(result.titleOverlaps, 'title must not obscure faces or other photo content').toBe(false);
  expect(result.overflow, 'detail hero must fit the achieved viewport').toBe(false);
}

for (const outcome of ["success", "miss", "error"]) {
  test(`compact shared-place header stays stable after delayed photo ${outcome}`, async ({ page, context }, testInfo) => {
    const fixture = await setup(context, { outcome });
    try {
      await page.goto(`/p/${ID}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-detail-hero]")).toBeVisible();
      await expect.poll(() => fixture.seen.photos).toBeGreaterThan(0);
      await page.evaluate(() => document.fonts.ready);
      const before = await geometry(page);
      expect(before.hero.height, "photoless arrival remains compact").toBeLessThan(250);
      // Keep the request pending beyond the recent-input exclusion window.
      await page.waitForTimeout(650);
      stable(before, await geometry(page));
      await markPhotoRelease(page);
      fixture.release();
      await expect.poll(() => fixture.seen.settled).toBeGreaterThan(0);
      const image = page.locator(`[data-detail-hero] img[src="${PHOTO}"]`);
      if (outcome === "success") {
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((n) => n.complete && n.naturalWidth > 0 && Number(getComputedStyle(n).opacity) > 0)).toBe(true);
      } else {
        await page.waitForTimeout(350);
        await expect(image).toHaveCount(0);
      }
      const after = await geometry(page);
      await testInfo.attach("detail-layout", { body: JSON.stringify({ before, after, shifts: await page.evaluate(() => window.__detailShifts) }, null, 2), contentType: "application/json" });
      stable(before, after);
      await assertPostReleaseCLS(page);
      if (outcome === "success") {
        await assertCredit(page);
        await assertFullPhoto(page, image);
        await image.click();
        const viewer = page.getByRole("dialog", { name: `Photos of ${NAME}` });
        await expect(viewer).toBeVisible();
        await expect(viewer.locator("img")).toHaveAttribute("src", PHOTO);
      }
      expect(fixture.seen.identities).toBeGreaterThan(0);
      // Details POSTs are fulfilled locally; assertContained excludes only those.
      assertContained({ ...fixture.log, passed: fixture.log.passed.filter((r) => !/\/api\/places\/details(?:\?|$)/.test(r.url)) }, expect);
    } finally { fixture.release(); }
  });
}

test("an existing real photo retains the full gallery while live credit arrives", async ({ page, context }) => {
  const fixture = await setup(context, { existing: true });
  try {
    await page.goto(`/p/${ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-detail-hero]")).toBeVisible();
    await expect.poll(() => fixture.seen.photos).toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    const image = page.locator(`[data-detail-hero] img[src="${PHOTO}"]`).first();
    await expect(image).toBeVisible();
    const before = await geometry(page);
    expect(before.hero.height).toBeGreaterThanOrEqual(250);
    await markPhotoRelease(page);
    fixture.release();
    await expect.poll(() => fixture.seen.settled).toBeGreaterThan(0);
    await page.waitForTimeout(350);
    stable(before, await geometry(page));
    await assertPostReleaseCLS(page);
    await assertCredit(page);
    await assertFullPhoto(page, image);
    await image.click();
    await expect(page.getByRole("dialog", { name: `Photos of ${NAME}` })).toBeVisible();
    assertContained({ ...fixture.log, passed: fixture.log.passed.filter((r) => !/\/api\/places\/details(?:\?|$)/.test(r.url)) }, expect);
  } finally { fixture.release(); }
});

// Edge markers and circle make cropping/stretching visible in the evidence.
for (const width of [320, 390, 768, 1440]) {
  for (const [shape, w, h] of [['portrait', 400, 1000], ['landscape', 1000, 600], ['square', 600, 600], ['panorama', 1600, 300]]) {
    test(`full ${shape} detail photo at ${width}px`, async ({ page, context }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#285d74"/><rect x="5" y="5" width="${w-10}" height="${h-10}" fill="none" stroke="#f5cf70" stroke-width="10"/><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/4}" fill="#e7b45c"/><text x="15" y="35" fill="white" font-size="26">TOP</text><text x="15" y="${h-15}" fill="white" font-size="26">BOTTOM</text></svg>`;
      const fixture = await setup(context, { existing: true, svg });
      try {
        await page.goto(`/p/${ID}`, { waitUntil: 'domcontentloaded' });
        const image = page.locator(`[data-detail-hero] img[src="${PHOTO}"]`).first();
        await expect.poll(() => image.evaluate(n => ({ complete: n.complete, width: n.naturalWidth, opacity: Number(getComputedStyle(n).opacity) })), { timeout: 20000 }).toMatchObject({ complete: true, width: expect.any(Number), opacity: 1 });
        expect(await page.evaluate(() => innerWidth)).toBe(width);
        await assertFullPhoto(page, image);
        await testInfo.attach('full-photo', { body: await page.screenshot({ path: testInfo.outputPath('photo-fit.png') }), contentType: 'image/png' });
        fixture.release();
        await image.click();
        await expect(page.getByRole('dialog', { name: `Photos of ${NAME}` })).toBeVisible();
      } finally { fixture.release(); }
    });
  }
}

for (const width of [320, 1440]) {
  test(`late portrait stays whole and stable at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await setup(context, { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1000"><rect width="400" height="1000" fill="#285d74"/><rect x="5" y="5" width="390" height="990" stroke="#f5cf70" stroke-width="10" fill="none"/><circle cx="200" cy="150" r="100" fill="#e7b45c"/></svg>' });
    try {
      await page.goto(`/p/${ID}`, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => fixture.seen.photos).toBeGreaterThan(0);
      await page.evaluate(() => document.fonts.ready);
      const before = await geometry(page);
      await page.waitForTimeout(650);
      await markPhotoRelease(page);
      fixture.release();
      const image = page.locator(`[data-detail-hero] img[src="${PHOTO}"]`);
      await expect.poll(() => image.evaluate(n => ({ complete: n.complete, width: n.naturalWidth, opacity: Number(getComputedStyle(n).opacity) })), { timeout: 20000 }).toMatchObject({ complete: true, width: expect.any(Number), opacity: 1 });
      await assertFullPhoto(page, image);
      stable(before, await geometry(page));
      await assertPostReleaseCLS(page);
      await testInfo.attach('late-portrait', { body: await page.screenshot({ path: testInfo.outputPath('photo-fit.png') }), contentType: 'image/png' });
      await image.click();
      await expect(page.getByRole('dialog', { name: `Photos of ${NAME}` })).toBeVisible();
    } finally { fixture.release(); }
  });
}

test('gallery controls stay clear of photos and select the correct image', async ({ page, context }) => {
  const fixture = await setup(context, { existing: true, multiple: true });
  try {
    await page.goto(`/p/${ID}`, { waitUntil: 'domcontentloaded' });
    const next = page.getByRole('button', { name: 'Next photo', exact: true });
    await expect(next).toBeVisible();
    const first = page.locator(`[data-detail-hero] img[src="${PHOTO}"]`).first();
    await expect.poll(() => first.evaluate(n => n.complete && n.naturalWidth > 0)).toBe(true);
    const mediaTop = (await first.boundingBox()).y;
    for (const control of [next, page.getByRole('button', { name: 'Back', exact: true })]) {
      const box = await control.boundingBox();
      expect(box.y + box.height, 'controls must stay above photo content').toBeLessThanOrEqual(mediaTop + 1);
    }
    await next.click();
    await expect(page.getByRole('button', { name: 'Previous photo', exact: true })).toBeVisible();
    const second = page.locator(`[data-detail-hero] img[src="${PHOTO2}"]`).first();
    await expect.poll(() => second.evaluate(n => n.complete && n.naturalWidth > 0)).toBe(true);
    await assertFullPhoto(page, second);
    await second.click();
    await expect(page.getByRole('dialog', { name: `Photos of ${NAME}` }).locator('img')).toHaveAttribute('src', PHOTO2);
  } finally { fixture.release(); }
});
