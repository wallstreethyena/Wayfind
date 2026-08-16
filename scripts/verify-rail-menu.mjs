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
//   · the tile art actually PAINTS — every tile has an <img> and every <img>
//     decoded, read off the image's OWN state.
//
//     RE-POINTED 2026-08-16. This counted a `has-art` class, and reported 0 on
//     a page whose artwork renders perfectly. `has-art` and the .wf8-ov overlay
//     it hid were BOTH deleted in b52f5de (v8.1, owner: "dont write nothign on
//     top of the card just use the card information") — the tile artwork
//     already carries its own headline. Nothing applies the class, nothing in
//     railMenuCss.js keys off it, and the effect this comment used to describe
//     went with the overlay. So the check was truthfully reporting the absence
//     of a thing that no longer exists: it ran, and answered a question nobody
//     was asking (CLAUDE.md §4c).
//
//     naturalWidth is strictly stronger than the class ever was — a 404 art URL
//     leaves naturalWidth 0, which the marker class could never have caught,
//     and it survives any future overlay decision.
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
        tileImgs: document.querySelectorAll('.wf8-tile img.wf8-tim').length,
        // ONLY WHAT IS ON SCREEN. The rail carries loading="lazy" on every tile
        // past the eager head (DaypartRail.js), so an off-screen tile has
        // naturalWidth 0 because the browser was correctly told not to fetch it
        // yet — asserting over all 15 fires on correct code, which CLAUDE.md
        // rates worse than no guard. Measured: 4/15 decoded at 1440 and 2/15 at
        // 430, exactly the tiles in view.
        artOnScreen: [...document.querySelectorAll('.wf8-tile img.wf8-tim')]
          .filter((i) => { const b = i.getBoundingClientRect(); return b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight; }).length,
        artPainted: [...document.querySelectorAll('.wf8-tile img.wf8-tim')]
          .filter((i) => { const b = i.getBoundingClientRect(); return b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight; })
          .filter((i) => i.complete && i.naturalWidth > 0).length,
        firstTileBox: tiles[0] && (b => ({ w: Math.round(b.width), h: Math.round(b.height) }))(tiles[0].getBoundingClientRect()),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        menuVisible: getComputedStyle(document.querySelector('.wf8-menusec')).display !== 'none',
        clock: document.querySelector('.wf8-dpnow') && document.querySelector('.wf8-dpnow').textContent,
      };
    });
    // A tile that renders NO <img> would otherwise pass by having zero broken
    // images, so the count of images is asserted against the count of tiles.
    if (top.tileImgs !== top.tiles) console.log('  ART FAIL: ' + top.tiles + ' tiles but ' + top.tileImgs + ' <img> — a tile is rendering no artwork at all');
    else if (top.artOnScreen < 1) console.log('  ART FAIL: no tile image is in the viewport — the probe measured nothing and the line below proves nothing');
    else if (top.artPainted !== top.artOnScreen) console.log('  ART FAIL: ' + (top.artOnScreen - top.artPainted) + '/' + top.artOnScreen + ' ON-SCREEN tile images did not decode (naturalWidth 0 — a broken art URL)');
    else console.log('  art ok: ' + top.artPainted + '/' + top.artOnScreen + ' on-screen tiles decoded (' + (top.tiles - top.artOnScreen) + ' off-screen, lazy by design)');
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
