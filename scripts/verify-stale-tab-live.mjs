// scripts/verify-stale-tab-live.mjs — NOT a guard. A measurement.
//
// Drives the real site in headless Chromium and asks the only question that
// matters: when the server is running a newer build than this tab, does the
// tab pick it up BY ITSELF, and does it refuse to do so while the user is in
// the middle of something?
//
// /api/version is stubbed with a fake sha so the tab always looks stale.
// A different fake sha per case, because a tab stamps one reload per build.
//
//   node scripts/verify-stale-tab-live.mjs                 # production
//   WF_URL=https://... node scripts/verify-stale-tab-live.mjs
//
// Not in scripts/guards.txt on purpose: it needs the network and a live
// deploy, and a guard that depends on either fails for the wrong reasons.
// It is named verify-* rather than check-*/test-* so check-guard-manifest
// does not expect it there. Playwright is not a dependency of this repo —
// install it with `npm i --no-save playwright && npx playwright install
// chromium` when you want to run this.
//
// MEASURED AGAINST PRODUCTION BEFORE THE FIX (2026-08-27, sha 5d563290):
//   1 ok    a backgrounded tab comes back to a newer build
//   2 FAIL  a back/forward navigation off the cache never noticed  <- the bug
//   3 FAIL  reloaded out from under an active user, and no pill    <- the cost
//   4 ok    a matching build never reloads
// The same four cases are what the fix has to turn green without turning 4 red.
import { chromium } from "playwright";

const URL_ = process.env.WF_URL || "https://www.gowayfind.com/";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// Find a Chromium this machine actually has. playwright's own executablePath
// points at the build its version pins, which is often not the one on disk,
// and a "measurement" that cannot start is worse than no measurement.
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
function findChromium() {
  try { const p = chromium.executablePath(); if (existsSync(p)) return p; } catch (e) {}
  const root = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(root)) return undefined;
  const cands = [];
  for (const d of readdirSync(root)) {
    for (const rel of ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
                       "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
                       "chrome-headless-shell-mac-arm64/chrome-headless-shell"]) {
      const f = path.join(root, d, rel);
      if (existsSync(f)) cands.push(f);
    }
  }
  return cands.sort().pop();
}
const exe = findChromium();
console.log(`Chromium: ${exe || "(playwright default)"}`);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let fails = 0;
const say = (ok, label, extra = "") => { console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

const phone = { userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
async function ctx(fakeSha) {
  const c = await browser.newContext(phone);
  if (fakeSha) await c.route("**/api/version*", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ build: fakeSha }) }));
  return c;
}
// COUNT DOCUMENTS, NOT NAVIGATIONS. Wayfind pushes and replaces history
// constantly (SCREEN_PATH), and every one of those fires "framenavigated" on
// the main frame — a first draft of this file counted them and reported four
// "reloads" for one page view. "load" fires once per real document.
function watch(page) {
  const s = { loads: 0 };
  page.on("load", () => { s.loads++; });
  return s;
}

console.log(`\nTarget: ${URL_}\n`);

console.log("1. a backgrounded tab comes back to a newer build");
{
  const c = await ctx("aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa");
  const p = await c.newPage(); const s = watch(p);
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  const before = s.loads;
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await p.waitForTimeout(4000);
  say(s.loads > before, "the tab reloaded itself on returning to visibility", `${before} -> ${s.loads} documents`);
  await c.close();
}

console.log("2. THE 2026-08-27 PATH — a back/forward navigation off the cache");
{
  const c = await ctx("bbbbbbbb22222222bbbbbbbb22222222bbbbbbbb");
  const p = await c.newPage(); const s = watch(p);
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  await p.goto(new URL("/events", URL_).href, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const before = s.loads;
  await p.goBack({ waitUntil: "domcontentloaded" });
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { type: n.type, transferSize: n.transferSize } : null; });
  await p.waitForTimeout(6000);
  console.log(`     navigation entry after goBack: ${JSON.stringify(nav)}`);
  say(s.loads > before + 1, "the restored document noticed it was stale and reloaded", `${before} -> ${s.loads} documents (the back itself is +1)`);
  await c.close();
}

console.log("3. it refuses to reload out from under someone mid-session");
{
  const c = await ctx("cccccccc33333333cccccccc33333333cccccccc");
  const p = await c.newPage(); const s = watch(p);
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  const before = s.loads;
  await p.evaluate(() => {
    document.dispatchEvent(new Event("pointerdown"));      // "I just touched the page"
    document.dispatchEvent(new Event("visibilitychange")); // "...and a new build landed"
  });
  await p.waitForTimeout(5000);
  say(s.loads === before, "no reload while the user is active", `${before} -> ${s.loads} documents`);
  const pill = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /tap to reload/i.test(x.textContent || ""));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
  });
  say(!!pill, "the update pill is offered instead", pill ? JSON.stringify(pill) : "no pill in the DOM");
  if (pill) say(pill.top >= 0 && pill.bottom <= 844, "the pill sits inside the viewport, clear of the tab bar", `top ${pill.top}, bottom ${pill.bottom} of 844`);
  await c.close();
}

console.log("4. a matching build must never reload (the loop test)");
{
  const c = await ctx(null); // no stub: the server answers its own real sha
  const p = await c.newPage(); const s = watch(p);
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  const before = s.loads;
  for (let i = 0; i < 3; i++) { await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(1500); }
  say(s.loads === before, "three visibility returns against a matching build: zero reloads", `${before} -> ${s.loads} documents`);
  await c.close();
}

await browser.close();
console.log(fails ? `\nverify-stale-tab-live: ${fails} FAILED\n` : "\nverify-stale-tab-live: all green\n");
process.exit(fails ? 1 : 0);
