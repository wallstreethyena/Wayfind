#!/usr/bin/env node
// HAND-RUN end-to-end check: does the paid card actually reach the home feed
// for a reader in Gastonia, and stay away from everyone else?
//
// Run `npx next start -p 3111` first, then: node scripts/verify-sponsored-live.mjs
import { existsSync } from "node:fs";

// Hand-run against a local `next start`. Not configurable by env on purpose —
// check-env-discipline §5(a) forbids a `process.env.X || "<literal>"` fallback,
// because it makes "configured" and "not configured" produce the same output.
const BASE = "http://127.0.0.1:3111";
const { chromium } = await import("playwright");
const launchOpts = (() => {
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  return {};
})();

const CASES = [
  ["gastonia", 35.2621, -81.1873, "Gastonia, NC", true],
  ["charlotte", 35.2271, -80.8431, "Charlotte, NC", false],
  ["sarasota", 27.3364, -82.5307, "Sarasota, FL", false],
];

const browser = await chromium.launch(launchOpts);
let bad = 0;
for (const [name, lat, lng, loc, expected] of CASES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
    permissions: [],
    geolocation: { latitude: lat, longitude: lng },
  });
  await ctx.addInitScript(([la, ln, lc]) => {
    try {
      localStorage.setItem("wf_center", JSON.stringify({ lat: la, lng: ln, loc: lc, manual: true, ts: Date.now() }));
      localStorage.setItem("wf_intro_seen", "1");
    } catch (e) {}
  }, [lat, lng, loc]);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  // The card is behind a dynamic import fired by the location effect.
  await page.waitForTimeout(6000);
  const found = await page.locator('section[aria-label*="Sponsored"]').count();
  const okCase = expected ? found > 0 : found === 0;
  if (!okCase) bad++;
  console.log(`${okCase ? "OK  " : "FAIL"} ${name.padEnd(10)} expected ${expected ? "card" : "no card"}, found ${found}`);
  if (expected && found) {
    await page.locator('section[aria-label*="Sponsored"]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/live-${name}.png` });
    const a = page.locator('section[aria-label*="Sponsored"] a').first();
    console.log("    href:", await a.getAttribute("href"));
    console.log("    rel :", await a.getAttribute("rel"));
  } else if (expected) {
    await page.screenshot({ path: `/tmp/live-${name}-MISS.png`, fullPage: false });
  }
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
