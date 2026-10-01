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
// explore-bridge-v1 (#1602, 2026-10-01): its TREATMENT used to render null on
// the server and insert the whole block at hydration, above the rail and pick
// 1. The repair server-renders it behind a pre-paint CSS gate
// (lib/exploreBridgeGate.js). The bridge arms below are measured with the
// client JS held back (HYDRATE_DELAY_MS) so the reader is already parked on
// pick 1 when hydration lands; that is the slow-phone case where the insertion
// shoved the page. Control and genuinely automated browsers must see nothing
// and nothing may move.
//
// Needs a deployment that can read the owned cache: run with
//   E2E_BASE_URL=https://<deployment> npx playwright test tests/e2e/guide-rail-layout.spec.js
// A local build without Supabase env has no seed and will (correctly) fail the
// rail-size assertion; E2E_NO_RAIL_SEED=1 skips only that one assertion so the
// bridge cases can be checked against a local `next start` build.
// E2E_FETCH_VIA_NODE=1 routes every request through Node's fetch for sandboxes
// whose TLS-intercepting proxy Chromium does not trust (verification is still
// on — Node checks the proxy CA). E2E_COOKIE passes a deployment-protection
// cookie for previews.
//
// WRITES: none. tests/e2e/lib/containment.js aborts every non-GET request,
// every analytics host and every partner redirect, and each test asserts
// nothing leaked. The "human" arms override navigator.webdriver inside this
// contained browser ONLY so the experiments render their arms (both exclude
// automation by design); nothing they do can be recorded. The automation case
// keeps webdriver=true and checks the exclusion itself.
const { test, expect } = require("@playwright/test");
const { containAnalytics, assertContained } = require("./lib/containment");

const GUIDES = {
  orlando: "/guides/things-to-do-orlando-not-theme-parks",
  sarasota: "/guides/things-to-do-sarasota",
};
// Persistent experiment ids whose arms are known (lib/experiment.variantForId,
// lib/guideInlineBook.inlineBookVariant):
//   qa-4 → explore-bridge control,   guide-inline-book control
//   qa-0 → explore-bridge control,   guide-inline-book treatment
//   qa-1 → explore-bridge treatment, guide-inline-book control
//   qa-3 → explore-bridge treatment, guide-inline-book treatment
const ARMS = { inlineControl: "qa-4", inlineTreatment: "qa-0" };
const BRIDGE_ARMS = { bridgeTreatment: "qa-1", bothTreatment: "qa-3", bridgeControl: "qa-4" };
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
const RAIL_APIS = /\/api\/(experiences|viator\/tours|viator\/curated)\b/;
const CHUNKS = /\/_next\/static\/chunks\//;
const SLOW_MS = 6000;
const HYDRATE_DELAY_MS = 3000;
const NO_RAIL_SEED = !!process.env.E2E_NO_RAIL_SEED;
// FONT SWAP (2026-10-01): Fraunces used to be preload:false and landed after
// first paint, reflowing the guide ("Right now" / pick 1 moved up to 107px on
// an Android-class fallback). It is now preloaded on every --wf-display route
// and has a metric-matched Android fallback (app/fontsDisplay.js,
// app/fontFallbacks.css), locked by tests/e2e/font-fallback-swap.spec.js.
// E2E_FONT_DELAY_MS still forces a late swap here, for diagnosis: a red whose
// `shifts[].src` is a Fraunces block is the font, not the rail or the bridge.
const FONT_DELAY_MS = Number(process.env.E2E_FONT_DELAY_MS || 0);

async function prepare(context, { expId, mode, automated = false, hydrateDelay = 0 }) {
  await context.addInitScript(([id, automated]) => {
    if (!automated) { try { Object.defineProperty(navigator, "webdriver", { get: () => false }); } catch (e) {} }
    try { localStorage.setItem("wf_exp_id", id); } catch (e) {}
    window.__shifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ v: e.value, t: Math.round(e.startTime),
          // Which elements moved — for diagnosing a red, not asserted on.
          src: (e.sources || []).map((x) => { const n = x.node; return n && n.nodeType === 1 ? (n.tagName + (n.id ? "#" + n.id : "") + (n.className && typeof n.className === "string" ? "." + n.className.split(" ")[0] : "")).slice(0, 60) : "#text"; }) });
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) {}
  }, [expId, automated]);
  if (process.env.E2E_COOKIE) {
    const base = new URL(process.env.E2E_BASE_URL || "http://localhost:3100");
    const [name, ...rest] = process.env.E2E_COOKIE.split("=");
    await context.addCookies([{ name, value: rest.join("="), domain: base.hostname, path: "/", secure: base.protocol === "https:" }]);
  }
  const viaNode = !!process.env.E2E_FETCH_VIA_NODE;
  return containAnalytics(context, {
    passThrough: async (route) => {
      const req = route.request();
      const url = req.url();
      if (RAIL_APIS.test(url)) {
        if (mode === "fail") return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' });
        if (mode === "empty") return route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
        if (mode === "slow") await new Promise((ok) => setTimeout(ok, SLOW_MS));
      }
      if (hydrateDelay && CHUNKS.test(url)) await new Promise((ok) => setTimeout(ok, hydrateDelay));
      if (FONT_DELAY_MS && /\.woff2?(\?|$)/.test(url)) await new Promise((ok) => setTimeout(ok, FONT_DELAY_MS));
      if (!viaNode) return route.continue();
      let res;
      for (let i = 0; i < 4 && !res; i++) {
        // Node's fetch does not see the browser's cookie jar; carry the
        // deployment-protection cookie explicitly (previews only).
        // Same-host only: never hand the protection cookie to a third party.
        const sameHost = (() => { try { return new URL(url).host === new URL(process.env.E2E_BASE_URL || "http://x").host; } catch (e) { return false; } })();
        const headers = Object.assign({}, req.headers(), process.env.E2E_COOKIE && sameHost ? { cookie: process.env.E2E_COOKIE } : {});
        try { res = await fetch(url, { method: req.method(), headers, redirect: "manual" }); }
        catch (e) { await new Promise((ok) => setTimeout(ok, 500 * (i + 1))); }
      }
      if (!res) return route.abort();
      const body = Buffer.from(await res.arrayBuffer());
      const headers = {};
      res.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
      return route.fulfill({ status: res.status, headers, body });
    },
  });
}

async function measure(page, path, { anchor = false, wait = SLOW_MS + 4000 } = {}) {
  await page.goto(path + (anchor ? "#pick-1" : ""), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pick-1 h2");
  if (!anchor) await page.evaluate(() => document.querySelector("#pick-1").scrollIntoView());
  const start = await page.evaluate(() => {
    const a = document.querySelector("aside[data-intent-partner-rail]");
    const b = document.querySelector("aside[data-explore-bridge]");
    return {
      railAtStart: a ? Math.round(a.getBoundingClientRect().height) : 0,
      bridgeAtStart: b ? Math.round(b.getBoundingClientRect().height) : 0,
      before: Math.round(document.querySelector("#pick-1 h2").getBoundingClientRect().top),
      hydratedAtStart: !!(b && b.hasAttribute("data-ready")),
      inertAtStart: !!(b && b.hasAttribute("inert")),
    };
  });
  await page.waitForTimeout(wait);
  // Final numbers must be POST-hydration, or a slow network would let the
  // bridge cases "pass" without ever resolving. If the bridge was served, wait
  // until the client resolved it: released (treatment) or dropped (control /
  // automation). A page that never hydrates fails here, loudly.
  if (await page.$("aside[data-explore-bridge]")) {
    await page.waitForFunction(() => {
      const b = document.querySelector("aside[data-explore-bridge]");
      return !b || b.hasAttribute("data-ready");
    }, null, { timeout: 30000 });
  }
  return page.evaluate((start) => {
    const a = document.querySelector("aside[data-intent-partner-rail]");
    const b = document.querySelector("aside[data-explore-bridge]");
    return {
      ...start,
      after: Math.round(document.querySelector("#pick-1 h2").getBoundingClientRect().top),
      railAtEnd: a ? Math.round(a.getBoundingClientRect().height) : 0,
      bridgeAtEnd: b ? Math.round(b.getBoundingClientRect().height) : 0,
      bridgeReady: !!(b && b.hasAttribute("data-ready")),
      inertAtEnd: !!(b && b.hasAttribute("inert")),
      arm: document.documentElement.getAttribute("data-wf-bridge"),
      cls: Number(window.__shifts.reduce((s, e) => s + e.v, 0).toFixed(3)),
      shifts: window.__shifts.filter((e) => e.v >= 0.005).map((e) => ({ v: Number(e.v.toFixed(3)), t: e.t, src: e.src })),
      innerWidth,
    };
  }, start);
}

function expectStill(r) {
  expect(Math.abs(r.after - r.before), "pick 1 heading moved while the reader was on it").toBeLessThanOrEqual(2);
  // Chromium's scroll anchoring can hold the heading still while the page
  // still shifts (Safari, most of this audience, has no such rescue), so the
  // recorded layout shift is asserted too. 0.05 is half of the 0.1 "good" CLS
  // line; the rail bug scored 0.251 and the bridge bug up to 0.66.
  expect(r.cls, "layout shift while the page resolved").toBeLessThan(0.05);
}

for (const [guide, path] of Object.entries(GUIDES)) {
  for (const [arm, expId] of Object.entries(ARMS)) {
    for (const mode of ["slow", "fail", "empty"]) {
      test(`${guide} · ${arm} · rail ${mode}: pick 1 does not move`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
        const log = await prepare(context, { expId, mode });
        const page = await context.newPage();
        const r = await measure(page, path);
        console.log(`[rail-layout] ${guide} ${arm} ${mode} ${JSON.stringify(r)}`);
        expect(r.innerWidth).toBe(390);
        if (!NO_RAIL_SEED) expect(r.railAtStart, "the rail is painted at its final size before any client fetch returns").toBeGreaterThan(150);
        expectStill(r);
        assertContained(log, expect);
        await context.close();
      });
    }
  }
  test(`${guide} · desktop + #pick-1 anchor · rail slow: pick 1 does not move`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const log = await prepare(context, { expId: ARMS.inlineControl, mode: "slow" });
    const page = await context.newPage();
    const r = await measure(page, path, { anchor: true });
    console.log(`[rail-layout] ${guide} desktop-anchor slow ${JSON.stringify(r)}`);
    if (!NO_RAIL_SEED) expect(r.railAtStart).toBeGreaterThan(150);
    expectStill(r);
    assertContained(log, expect);
    await context.close();
  });

  // ── explore-bridge-v1 (#1602) ────────────────────────────────────────────
  for (const [arm, expId] of Object.entries(BRIDGE_ARMS)) {
    for (const mode of ["slow", "fail", "empty"]) {
      test(`${guide} · ${arm} · slow hydration + rail ${mode}: the bridge never shoves pick 1`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
        const log = await prepare(context, { expId, mode, hydrateDelay: HYDRATE_DELAY_MS });
        const page = await context.newPage();
        const r = await measure(page, path);
        console.log(`[bridge-layout] ${guide} ${arm} ${mode} ${JSON.stringify(r)}`);
        expect(r.innerWidth).toBe(390);
        expect(r.hydratedAtStart, "the reader was parked BEFORE hydration (else this proves nothing)").toBe(false);
        if (arm === "bridgeControl") {
          expect(r.arm).toBe("control");
          expect(r.bridgeAtStart, "control never shows the bridge").toBe(0);
          expect(r.bridgeAtEnd).toBe(0);
        } else {
          expect(r.arm).toBe("treatment");
          expect(r.bridgeAtStart, "treatment: the bridge is painted at its final size BEFORE hydration").toBeGreaterThan(150);
          expect(Math.abs(r.bridgeAtEnd - r.bridgeAtStart), "the bridge did not resize at hydration").toBeLessThanOrEqual(2);
          expect(r.bridgeReady, "the client resolved the arm and released taps").toBe(true);
          // Asserted against the REAL build (React 19 in the App Router): the
          // server markup is inert until exposure, so no tap/Tab/Enter can
          // reach a link before it exists; the client releases it.
          expect(r.inertAtStart, "treatment: inert before hydration (exposure not yet recorded)").toBe(true);
          expect(r.inertAtEnd, "treatment: released after the client resolved the arm").toBe(false);
        }
        expectStill(r);
        assertContained(log, expect);
        await context.close();
      });
    }
  }
  test(`${guide} · automated browser: no bridge, no exposure, nothing moves`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const log = await prepare(context, { expId: BRIDGE_ARMS.bridgeTreatment, mode: "slow", automated: true, hydrateDelay: HYDRATE_DELAY_MS });
    const page = await context.newPage();
    const r = await measure(page, path);
    console.log(`[bridge-layout] ${guide} automated ${JSON.stringify(r)}`);
    expect(r.arm, "automation is never assigned").toBe(null);
    expect(r.bridgeAtStart).toBe(0);
    expect(r.bridgeAtEnd).toBe(0);
    expectStill(r);
    assertContained(log, expect);
    await context.close();
  });
  test(`${guide} · desktop + #pick-1 anchor · bridge treatment, slow hydration`, async ({ browser }) => {
    // Headless Chromium's default UA says "HeadlessChrome", which the
    // experiment rightly treats as automation; this contained case is a person.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: DESKTOP_UA });
    const log = await prepare(context, { expId: BRIDGE_ARMS.bothTreatment, mode: "slow", hydrateDelay: HYDRATE_DELAY_MS });
    const page = await context.newPage();
    const r = await measure(page, path, { anchor: true });
    console.log(`[bridge-layout] ${guide} desktop-anchor ${JSON.stringify(r)}`);
    expect(r.arm).toBe("treatment");
    expect(r.bridgeAtStart).toBeGreaterThan(100);
    expectStill(r);
    assertContained(log, expect);
    await context.close();
  });
}
