#!/usr/bin/env node
// scripts/test-guide-map-pin-reveal.mjs — tapping a guide map pin must bring
// its place card ON SCREEN, not just move the card rail sideways.
//
// 2026-11-27: on /guides/disney-world-holiday-food-guide-2026 the owner tapped
// pin 18 on the EPCOT map. The rail under the map moved to card 18 ("18 of
// 19") but the card sat below the fold, behind the Santa dock, so he had to
// scroll down by hand. GuideMapExplorer now also scrolls the page so the rail
// lands in the band the sticky bars leave visible, highlights the card, and
// moves focus to it. This guard EXECUTES the scroll math and the sticky-bar
// probe, then checks the shared explorer (the one component every map+cards
// guide uses) still wires them to pin taps and only to pin taps.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const fail = [];
let pass = 0;
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const { revealScrollTop, REVEAL_GAP_PX } = await import("../lib/mapRailFollow.js");
const { measureStickyInsets, MAX_BAR_SHARE } = await import("../lib/stickyInsets.js");

// ── revealScrollTop ─────────────────────────────────────────────────────────
{
  const G = REVEAL_GAP_PX;
  // The owner's case: an 844px phone, 72px Santa dock, rail top at 760 (below
  // the map), 520px tall. It must scroll so the rail's bottom clears the dock.
  const vh = 844, dock = 72;
  const t = revealScrollTop({ top: 760, bottom: 1280, scrollY: 2000, viewportHeight: vh, topInset: 0, bottomInset: dock });
  ok(t === 2000 + (1280 - (vh - dock - G)), "a rail below the fold is lifted until its bottom clears the Santa dock (got " + t + ")");
  ok(revealScrollTop({ top: 100, bottom: 600, scrollY: 50, viewportHeight: vh, topInset: 0, bottomInset: dock }) === null,
    "a rail already fully visible does not move the page");
  // Taller than the band: align its top under the header so the counter and
  // card top show, never its bottom.
  const tall = revealScrollTop({ top: 900, bottom: 1900, scrollY: 0, viewportHeight: vh, topInset: 64, bottomInset: dock });
  ok(tall === 900 - (64 + G), "a rail taller than the visible band aligns its top just under the sticky header (got " + tall + ")");
  // Tucked under the header (scrolled past): bring its top back down.
  const under = revealScrollTop({ top: 20, bottom: 400, scrollY: 3000, viewportHeight: vh, topInset: 64, bottomInset: 0 });
  ok(under === 3000 + 20 - (64 + G), "a rail hidden under the sticky header scrolls back so its top clears the header (got " + under + ")");
  ok(revealScrollTop({ top: 10, bottom: 40, scrollY: 0, viewportHeight: vh, topInset: 0, bottomInset: 0 }) === 0,
    "the target never goes negative");
  ok(revealScrollTop({ top: NaN, bottom: 10, scrollY: 0, viewportHeight: vh }) === null, "unmeasurable input leaves the page alone");
  ok(revealScrollTop({ top: 900, bottom: 1000, scrollY: 0, viewportHeight: 100, topInset: 60, bottomInset: 60 }) === null,
    "bars that cover the whole viewport leave the page alone rather than scrolling to nonsense");
}

// ── measureStickyInsets, against a fake DOM ─────────────────────────────────
{
  const el = (box, position, parent = null) => ({ box, position, parentElement: parent, getBoundingClientRect: () => box });
  const body = el({ top: 0, bottom: 5000, height: 5000 }, "static");
  const html = el({ top: 0, bottom: 5000, height: 5000 }, "static");
  body.parentElement = html;
  const vh = 844;
  const header = el({ top: 0, bottom: 64, height: 64 }, "sticky", body);
  const headerText = el({ top: 10, bottom: 50, height: 40 }, "static", header);
  const dock = el({ top: vh - 72, bottom: vh, height: 72 }, "fixed", body);
  const dockButton = el({ top: vh - 60, bottom: vh - 10, height: 50 }, "static", dock);
  const modal = el({ top: 0, bottom: vh, height: vh }, "fixed", body);
  const content = el({ top: -400, bottom: 2000, height: 2400 }, "static", body);
  const fakeWin = (hitsAt) => ({
    innerWidth: 390, innerHeight: vh,
    document: { body, documentElement: html, elementsFromPoint: (x, y) => hitsAt(y) },
    getComputedStyle: (node) => ({ position: node.position }),
  });
  const full = measureStickyInsets(fakeWin((y) => (y < 100 ? [headerText, content] : [dockButton, content])));
  ok(full.top === 64 && full.bottom === 72, "measures a 64px sticky header and a 72px fixed bottom dock (got " + JSON.stringify(full) + ")");
  const none = measureStickyInsets(fakeWin(() => [content]));
  ok(none.top === 0 && none.bottom === 0, "no bars means no insets");
  const withModal = measureStickyInsets(fakeWin((y) => (y < 100 ? [modal, headerText] : [modal, dockButton])));
  ok(withModal.top === 64 && withModal.bottom === 72, "a full-screen fixed layer (over " + MAX_BAR_SHARE * 100 + "% of the viewport) is not counted as a bar");
  const server = measureStickyInsets(null);
  ok(server.top === 0 && server.bottom === 0, "on the server (no window) insets are zero, never a throw");
}

// ── wiring in the shared explorer ───────────────────────────────────────────
const explorerSrc = strip(readFileSync(new URL("../app/components/GuideMapExplorer.js", import.meta.url), "utf8"));
{
  ok(/import\s*\{[^}]*\brevealScrollTop\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/mapRailFollow\.js["']/.test(explorerSrc),
    "GuideMapExplorer.js no longer imports revealScrollTop from lib/mapRailFollow.js");
  ok(/import\s*\{\s*measureStickyInsets\s*\}\s*from\s*["']\.\.\/\.\.\/lib\/stickyInsets\.js["']/.test(explorerSrc),
    "GuideMapExplorer.js no longer imports measureStickyInsets (the reveal would land the card under the Santa dock)");
  ok(/const selectFromPin\s*=\s*\(id\)\s*=>\s*selectFromMap\(id,\s*\{\s*reveal:\s*true\s*\}\)/.test(explorerSrc),
    "selectFromPin must call selectFromMap(id, { reveal: true })");
  ok(/renderMap\(\{[^}]*onSelect:\s*selectFromPin\s*\}\)/.test(explorerSrc),
    "illustrated park maps (renderMap) must get selectFromPin as onSelect, or a pin tap will not bring the card on screen");
  ok(/<CreatorAppleMap\b[^>]*onSelect=\{selectFromPin\}/.test(explorerSrc),
    "the Apple map must get selectFromPin as onSelect, or a pin tap will not bring the card on screen on phones");
  ok(/onOpen=\{spot\.href \? undefined : \(\) => selectFromMap\(spot\.id\)\}/.test(explorerSrc),
    "a tap on a CARD must keep calling selectFromMap without reveal (tapping a visible card must not scroll the page or steal focus)");
  ok(/if \(reveal\) \{\s*highlightPicked\(node\);\s*revealRail\(node, smooth\);\s*\}/.test(explorerSrc),
    "selectFromMap must highlight and reveal the card when reveal is set");
  ok(/revealScrollTop\(\{[^}]*topInset:\s*insets\.top[^}]*bottomInset:\s*insets\.bottom[^}]*\}\)/.test(explorerSrc),
    "revealRail must pass the measured sticky insets to revealScrollTop");
  ok(/window\.scrollTo\(\{\s*top:\s*target,\s*behavior:\s*smooth \? "smooth" : "auto"\s*\}\)/.test(explorerSrc),
    "the page scroll must honour reduced motion (smooth only when allowed)");
  ok(/rail\.scrollTo\(\{\s*left:\s*target,\s*behavior:\s*smooth \? "smooth" : "auto"\s*\}\)/.test(explorerSrc),
    "the rail scroll must honour reduced motion too");
  ok(/prefers-reduced-motion: reduce/.test(explorerSrc), "GuideMapExplorer.js must read prefers-reduced-motion");
  ok(/node\.focus\(\{\s*preventScroll:\s*true\s*\}\)/.test(explorerSrc),
    "focus must move to the revealed card (keyboard and screen readers) without a second scroll");
  ok(/node\.dataset\.mapPicked = "true"/.test(explorerSrc) && /delete node\.dataset\.mapPicked/.test(explorerSrc),
    "the picked card must be marked and the mark must clear itself");
  const css = readFileSync(new URL("../app/components/GuideMapExplorer.module.css", import.meta.url), "utf8");
  ok(/\.houseRail \[data-map-picked="true"\]\s*\{[^}]*outline:/.test(css), "the picked card needs a visible highlight ring");
  ok(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.houseRail \[data-map-picked="true"\]\s*\{\s*animation: none;/.test(css),
    "the highlight pulse must stop under reduced motion");
}

// ── every map+cards guide goes through the shared explorer ───────────────────
{
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); } else if (/\.(js|jsx|tsx?)$/.test(name)) files.push(p); } };
  walk(new URL("../app", import.meta.url).pathname);
  let maps = 0;
  for (const file of files) {
    if (/components\/(IllustratedParkMap|GuideMapExplorer|CreatorAppleMap)\.js$/.test(file)) continue;
    const src = strip(readFileSync(file, "utf8"));
    if (!/<IllustratedParkMap[\s/>]/.test(src)) continue;
    maps++;
    ok(/<GuideMapExplorer[\s/>]/.test(src) && /renderMap=\{\(\{[^}]*\bonSelect\b[^}]*\}\)\s*=>\s*<IllustratedParkMap[\s\S]*?onSelect=\{onSelect\}/.test(src),
      file + " renders an illustrated map outside GuideMapExplorer's renderMap (or does not pass its onSelect), so its pins would not bring their card on screen");
  }
  ok(maps >= 3, "expected at least the Disney, Universal and Pinto's illustrated maps, found " + maps + " (the probe is broken)");
}

if (fail.length) {
  console.log("test-guide-map-pin-reveal: FAIL");
  for (const f of fail) console.log("  - " + f);
  process.exit(1);
}
console.log("test-guide-map-pin-reveal: OK — " + pass + " assertions (scroll math, sticky-bar probe, explorer wiring, every illustrated guide map)");
