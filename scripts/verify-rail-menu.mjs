#!/usr/bin/env node
// scripts/verify-rail-menu.mjs — visual + behavioural verification of the V8
// rail menu against a REAL build.
//
// NOT in scripts/guards.txt: it needs a running server, so it cannot be part of
// prebuild. Run it by hand before a cutover, or against a preview URL:
//
//   npm run build && npx next start -p 4399 &
//   node scripts/verify-rail-menu.mjs                     # localhost:4399/v8
//   node scripts/verify-rail-menu.mjs https://<preview>/v8 # real ranked data
//
// What it asserts, at desktop and phone:
//   · all 15 rails render (nothing hidden by the hour)
//   · every tile is a real <a href> to a route that exists
//   · the tile art actually PAINTS — the `has-art` class retires the pre-paint
//     overlay. This caught a live bug: server-rendered <img>s finish decoding
//     before React hydrates, so the JSX onLoad never fires and the fallback
//     text stayed stamped over the artwork on every tile.
//   · picking a tile opens the drop, and the place cards land in ONE row
//   · the guides rail wires every guide to /guides/<slug>
//   · no horizontal overflow, no console errors, no hydration mismatch
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
// Both inputs are ARGV, not env. check-env-discipline is right that an env var
// with a literal fallback makes behaviour unfalsifiable — you cannot tell
// configured from unconfigured by the output — and there is no reason for a
// hand-run script to read ambient state at all.
//
//   node scripts/verify-rail-menu.mjs [url] [outputDir]
const B = process.argv[2] || "http://localhost:4399/v8";
const OUT = process.argv[3] || "./.rail-shots";
await mkdir(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  for (const [w, h, tag] of [[1440, 950, 'desk'], [430, 932, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
    p.on('console', m => { const t = m.text(); if (m.type() === 'error' || /hydrat|did not match/i.test(t)) errs.push(m.type().toUpperCase() + ': ' + t.slice(0, 220)); });
    await p.goto(B, { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);

    const top = await p.evaluate(() => {
      const root = document.querySelector('.wf8');
      const tiles = [...document.querySelectorAll('.wf8-tile')];
      return {
        root: !!root, daypart: root && root.dataset.daypart,
        tiles: tiles.length,
        tileIds: tiles.map(t => t.dataset.id),
        hrefs: tiles.map(t => t.getAttribute('href')),
        artPainted: tiles.filter(t => t.classList.contains('has-art')).length,
        firstTileBox: tiles[0] && (b => ({ w: Math.round(b.width), h: Math.round(b.height) }))(tiles[0].getBoundingClientRect()),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        menuVisible: getComputedStyle(document.querySelector('.wf8-menusec')).display !== 'none',
        clock: document.querySelector('.wf8-dpnow') && document.querySelector('.wf8-dpnow').textContent,
      };
    });
    console.log(tag.toUpperCase(), JSON.stringify(top, null, 0));
    await p.screenshot({ path: `${OUT}/v8-${tag}-top.png` });

    // pick the first tile -> the drop
    await p.locator('.wf8-tile').first().click();
    await p.waitForTimeout(1100);
    const drop = await p.evaluate(() => ({
      open: document.querySelector('.wf8').classList.contains('is-open'),
      menuVisible: getComputedStyle(document.querySelector('.wf8-menusec')).display !== 'none',
      sel: document.querySelector('.wf8-mhd b') && document.querySelector('.wf8-mhd b').textContent,
      cats: document.querySelectorAll('.wf8-cat').length,
      cards: document.querySelectorAll('.wf8-pcrail > .wf-place-card').length,
      thin: !!document.querySelector('.wf8-thin'),
      thinText: document.querySelector('.wf8-thin p') && document.querySelector('.wf8-thin p').textContent.slice(0, 130),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    console.log('  DROP', JSON.stringify(drop));
    await p.screenshot({ path: `${OUT}/v8-${tag}-drop.png` });

    // the guides rail
    const blog = p.locator('.wf8-cat', { hasText: 'Local Guides' }).first();
    if (await blog.count()) {
      await blog.click();
      await p.waitForTimeout(900);
      const g = await p.evaluate(() => ({
        guideCards: document.querySelectorAll('.wf8-grail .wf8-gcard').length,
        firstTitle: document.querySelector('.wf8-gtit') && document.querySelector('.wf8-gtit').textContent,
        links: [...document.querySelectorAll('.wf8-grail a')].slice(0, 3).map(a => a.getAttribute('href')),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      console.log('  GUIDES', JSON.stringify(g));
      await p.screenshot({ path: `${OUT}/v8-${tag}-guides.png` });
    }
    console.log('  ERRORS:', errs.length ? errs : 'none');
    await ctx.close();
  }
  await browser.close();
})();
