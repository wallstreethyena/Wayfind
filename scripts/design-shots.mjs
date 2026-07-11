// Redesign screenshot harness (Phase 0 baseline + later-phase afters).
// Usage: node scripts/design-shots.mjs <outDir> [baseURL]
// Captures the width matrix (320/390/768/1024/1440) on the homepage and
// events view, plus 200%/400% zoom equivalents (viewport-width / zoom — CSS
// zoom reflows layout the same way, and headless Chromium has no real
// browser-zoom API). The app is dark-only by design, so there is no light
// variant to capture.
import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

const out = process.argv[2] || "design-baseline";
const base = process.argv[3] || "http://localhost:3100";
mkdirSync(out, { recursive: true });

const WIDTHS = [320, 390, 768, 1024, 1440];
// 200% zoom at 1280 ≈ 640px layout viewport; 400% ≈ 320px.
const ZOOM = [{ label: "zoom200", w: 640 }, { label: "zoom400", w: 320 }];

const browser = await chromium.launch();
async function shot(path, w, name) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  try {
    // Suppress the first-visit intro on every shot except the ones that
    // exist to capture it — we need the actual homepage underneath.
    if (!name.startsWith("intro-")) {
      await page.addInitScript(() => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} });
    }
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    // Horizontal-scroll check (Phase 5 matrix): document must not scroll sideways.
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    console.log(`${name}: ${hScroll ? "H-SCROLL!" : "ok"}`);
  } finally { await page.close(); }
}

for (const w of WIDTHS) {
  await shot("/", w, `home-${w}`);
  await shot("/?go=events", w, `events-${w}`);
}
for (const z of ZOOM) await shot("/", z.w, `home-${z.label}`);
await shot("/guides/things-to-do-sarasota", 390, "guide-390");
await shot("/guides/things-to-do-sarasota", 1440, "guide-1440");
await shot("/", 390, "intro-390");
await shot("/", 1440, "intro-1440");
await browser.close();
console.log("done ->", out);
