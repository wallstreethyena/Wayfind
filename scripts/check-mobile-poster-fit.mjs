import fs from "node:fs";

const css = fs.readFileSync(new URL("../app/components/railMenuCss.js", import.meta.url), "utf8").replace(/\n\s*/g, "");
let pass = 0;
const ok = (value, message) => {
  if (!value) throw new Error(`FAIL: ${message}`);
  pass += 1;
  console.log(`  ✓ ${message}`);
};

ok(/@media\(max-width:900px\)\{\.wf8-track\{padding:10px var\(--wf8-pad\) 16px\}/.test(css),
  "mobile poster rail removes the desktop-sized vertical gutters");
ok(/--wf8-tw:min\(76vw,340px\)/.test(css),
  "mobile keeps a compatible width fallback");
ok(/@supports\(height:100svh\)\{\@media\(max-width:900px\)\{\.wf8\{--wf8-tw:min\(76vw,340px,calc\(68svh \* var\(--wf8-ratio\)\)\)/.test(css),
  "modern mobile browsers cap 9:16 posters against the stable visible viewport");
ok(/\.wf8-tile\{[^}]*width:var\(--wf8-tw\)[^}]*height:calc\(var\(--wf8-tw\) \/ var\(--wf8-ratio\)\)/.test(css),
  "the viewport cap preserves the poster aspect ratio instead of cropping art");

const phoneWidth = 390;
const safariSmallViewport = 660;
const ratio = 9 / 16;
const tileWidth = Math.min(phoneWidth * 0.76, 340, safariSmallViewport * 0.68 * ratio);
const tileHeight = tileWidth / ratio;
ok(tileHeight + 10 + 16 <= safariSmallViewport * 0.72,
  "a representative iPhone Safari poster and its rail gutters fit within 72 percent of the visible viewport");
ok(tileWidth < phoneWidth && tileWidth > phoneWidth * 0.6,
  "the fitted poster remains readable and leaves a clear next-card cue");

console.log(`check-mobile-poster-fit: OK, ${pass} assertions`);
