// Gate: a reader parked at a guide's first pick is never pushed away by the
// "Bookable highlights" partner rail arriving late (2026-10-01).
//
// Production, 390x844, reader scrolled to #pick-1 right after DOMContentLoaded:
// the rail (a client component) rendered nothing until its inventory fetch
// returned, then inserted ~208px ABOVE "Right now" and pick 1 — a 0.25 layout
// shift on /guides/things-to-do-sarasota with the explore-bridge experiment
// off. ("Right now" was a victim, not the cause: it never changed height.)
// The fix server-seeds the rail from the owned inventory cache
// (lib/landingRails.ssrPartnerInventory), so it is painted at its final size.
//
// The partner inventory APIs are forced SLOW, FAILING and EMPTY; the heading of
// pick 1 must not move in any of them, in both arms of guide-inline-book-v1,
// at phone and desktop width, and when arriving by the #pick-1 anchor.
//
// The explore-bridge-v1 experiment is held in its CONTROL arm here on purpose:
// its treatment is a separate, owner-gated layout question (it inserts at
// hydration by design and lists CLS as its own guardrail), and including it
// would make this test measure two components at once.
//
// Needs a deployment that can read the owned cache: run with
//   E2E_BASE_URL=https://<deployment> npx playwright test tests/e2e/guide-rail-layout.spec.js
// A local build without Supabase env has no seed and will (correctly) fail.
// E2E_FETCH_VIA_NODE=1 routes every request through Node's fetch for sandboxes
// whose TLS-intercepting proxy Chromium does not trust (verification is still
// on — Node checks the proxy CA). Analytics and partner redirects are always
// aborted so this test never writes to PostHog or creates a partner click.
const { test, expect } = require("@playwright/test");

const GUIDES = {
  orlando: "/guides/things-to-do-orlando-not-theme-parks",
  sarasota: "/guides/things-to-do-sarasota",
};
// Persistent experiment ids whose arms are known (lib/experiment.variantForId):
//   qa-4 → explore-bridge control, guide-inline-book control
//   qa-0 → explore-bridge control, guide-inline-book treatment
const ARMS = { inlineControl: "qa-4", inlineTreatment: "qa-0" };
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const RAIL_APIS = /\/api\/(experiences|viator\/tours|viator\/curated)\b/;
const SLOW_MS = 6000;

async function prepare(context, { expId, mode }) {
  await context.addInitScript((id) => {
    try { Object.defineProperty(navigator, "webdriver", { get: () => false }); } catch (e) {}
    try { localStorage.setItem("wf_exp_id", id); } catch (e) {}
    window.__shifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ v: e.value, t: e.startTime });
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) {}
  }, expId);
  const viaNode = !!process.env.E2E_FETCH_VIA_NODE;
  await context.route(/^https?:\/\//, async (route) => {
    const req = route.request();
    const url = req.url();
    if (/posthog|\/ingest\b|sentry|vercel-insights|googletagmanager|google-analytics/.test(url)) return route.abort();
    if (/\/api\/[a-z0-9-]+\/go\b/.test(url)) return route.abort();
    if (RAIL_APIS.test(url)) {
      if (mode === "fail") return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
      if (mode === "empty") return route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
      if (mode === "slow") await new Promise((ok) => setTimeout(ok, SLOW_MS));
    }
    if (!viaNode) return route.continue();
    let res;
    for (let i = 0; i < 4 && !res; i++) {
      try { res = await fetch(url, { method: req.method(), headers: req.headers(), body: req.postDataBuffer() || undefined, redirect: "manual" }); }
      catch (e) { await new Promise((ok) => setTimeout(ok, 500 * (i + 1))); }
    }
    if (!res) return route.abort();
    const body = Buffer.from(await res.arrayBuffer());
    const headers = {};
    res.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
    return route.fulfill({ status: res.status, headers, body });
  });
}

async function measure(page, path, { anchor = false } = {}) {
  await page.goto(path + (anchor ? "#pick-1" : ""), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pick-1 h2");
  if (!anchor) await page.evaluate(() => document.querySelector("#pick-1").scrollIntoView());
  const railAtStart = await page.evaluate(() => {
    const a = document.querySelector("aside[data-intent-partner-rail]");
    return a ? Math.round(a.getBoundingClientRect().height) : 0;
  });
  const before = await page.evaluate(() => Math.round(document.querySelector("#pick-1 h2").getBoundingClientRect().top));
  await page.waitForTimeout(SLOW_MS + 4000);
  return page.evaluate(({ before, railAtStart }) => {
    const a = document.querySelector("aside[data-intent-partner-rail]");
    return {
      before, railAtStart,
      after: Math.round(document.querySelector("#pick-1 h2").getBoundingClientRect().top),
      railAtEnd: a ? Math.round(a.getBoundingClientRect().height) : 0,
      cls: Number(window.__shifts.reduce((s, e) => s + e.v, 0).toFixed(3)),
      innerWidth,
    };
  }, { before, railAtStart });
}

for (const [guide, path] of Object.entries(GUIDES)) {
  for (const [arm, expId] of Object.entries(ARMS)) {
    for (const mode of ["slow", "fail", "empty"]) {
      test(`${guide} · ${arm} · rail ${mode}: pick 1 does not move`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
        await prepare(context, { expId, mode });
        const page = await context.newPage();
        const r = await measure(page, path);
        console.log(`[rail-layout] ${guide} ${arm} ${mode} ${JSON.stringify(r)}`);
        expect(r.innerWidth).toBe(390);
        expect(r.railAtStart, "the rail is painted at its final size before any client fetch returns").toBeGreaterThan(150);
        expect(Math.abs(r.after - r.before), "pick 1 heading moved while the reader was on it").toBeLessThanOrEqual(2);
        // Chromium's scroll anchoring can hold the heading still while the page
        // still shifts (Safari, most of this audience, has no such rescue), so
        // the recorded layout shift is asserted too. 0.05 is half of the 0.1
        // "good" CLS line; the bug scored 0.251 here.
        expect(r.cls, "layout shift while the rail resolved").toBeLessThan(0.05);
        await context.close();
      });
    }
  }
  test(`${guide} · desktop + #pick-1 anchor · rail slow: pick 1 does not move`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await prepare(context, { expId: ARMS.inlineControl, mode: "slow" });
    const page = await context.newPage();
    const r = await measure(page, path, { anchor: true });
    console.log(`[rail-layout] ${guide} desktop-anchor slow ${JSON.stringify(r)}`);
    expect(r.railAtStart).toBeGreaterThan(150);
    expect(Math.abs(r.after - r.before)).toBeLessThanOrEqual(2);
    expect(r.cls).toBeLessThan(0.05);
    await context.close();
  });
}
