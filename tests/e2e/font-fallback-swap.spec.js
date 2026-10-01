// tests/e2e/font-fallback-swap.spec.js — the Fraunces swap does not move the page
// (2026-10-01, the "Right now" font jump).
//
// Fraunces is preload:false (app/fonts.js), so on a cold load it often lands
// after first paint and every Fraunces block re-sets in the real face. That is
// only invisible if the fallback the reader saw had Fraunces' metrics.
// next/font provides that for Times New Roman (iOS, macOS, Windows). Android
// has no Times, so app/fontFallbacks.css adds "Fraunces Fallback Noto". Before
// it, production moved "Right now" / pick 1 by 42-103px on Android-class
// fallbacks.
//
// HOW: one load per case. Every Fraunces file is HELD at the network until the
// page has painted and its layout has gone quiet; then we record the position
// of every heading/section/pick anchor, release Fraunces, wait for it to be
// applied, and record again. The movement is the swap and nothing else.
//
// ANDROID EMULATION: a Latin subset of Noto Serif (tests/e2e/fixtures/fonts,
// OFL; same names and metrics as Android's system serif) is registered with
// fontconfig before the browser starts, so local("Noto Serif") resolves
// exactly as it does on a phone. The served CSS is rewritten only where
// Android differs from this Linux box: next/font's local("Times New Roman")
// face cannot resolve, and Georgia / Times New Roman / serif are Noto Serif
// (Android's alias table). The "Fraunces Fallback Noto" face is untouched.
// Remove it from app/fonts.js and this goes red.
//
// Why not serve the fixture with url(): while Fraunces is pending, Chromium
// paints with fallbacks that are already available and does NOT start loading
// a downloadable fallback face, so a url() emulation measures the wrong font.
//
// APPLE EMULATION: next/font's local("Times New Roman") is pointed at
// local("Liberation Serif") (metric-compatible with Times; installed by
// `playwright install --with-deps`). Skipped, with a reason, where absent.
//
// Containment: tests/e2e/lib/containment.js — no write, no analytics request,
// no partner redirect leaves the browser. navigator.webdriver is overridden
// inside that contained context ONLY so the experiment arms render (as in
// guide-rail-layout.spec.js); nothing this session does can be recorded.
//
// Run against a production build (playwright.config.js starts `next start`)
// or a deployed site: E2E_BASE_URL=https://www.gowayfind.com npx playwright test tests/e2e/font-fallback-swap.spec.js
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { containAnalytics, assertContained } = require("./lib/containment");

const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const { execFileSync } = require("child_process");
const os = require("os");
const FIX = path.join(__dirname, "fixtures", "fonts");
const MAX_MOVE_PX = 2; // the approved layout threshold used by guide-rail-layout.spec.js

// Every distinct implementation that sets --wf-display (see the census in
// scripts/test-font-fallback-metrics.mjs): the guide template (two cities, both
// experiment arms), the hub, the two bespoke guide pages, culture, /go/florida.
const PAGES = [
  { path: "/guides/things-to-do-orlando-not-theme-parks", arms: ["qa-4", "qa-3"] },
  { path: "/guides/things-to-do-sarasota", arms: ["qa-4", "qa-3"] },
  { path: "/guides", arms: ["qa-4"] },
  { path: "/guides/florida-fall-festivals-2026", arms: ["qa-4"] },
  { path: "/guides/pintos-farm-miami-2026", arms: ["qa-4"] },
  { path: "/culture/orlando", arms: ["qa-4", "qa-3"] },
  { path: "/go/florida", arms: ["qa-4"] },
];
const VIEWPORTS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "1280", width: 1280, height: 900, mobile: false },
];

function rewriteCss(css, platform) {
  if (platform === "android") {
    return css
      .replace(/local\(["']?Times New Roman["']?\)/g, 'local("WF Absent Times")')
      .replace(/\bGeorgia,\s*["']?Times New Roman["']?,\s*serif\b/g, '"Noto Serif",serif');
  }
  return css.replace(/local\(["']?Times New Roman["']?\)/g, 'local("Liberation Serif")');
}

// Register the Noto Serif fixture with fontconfig (user font dir) before any
// browser launches. Idempotent. Fails loudly if fontconfig cannot see it.
function installAndroidSerif() {
  const dir = path.join(os.homedir(), ".local", "share", "fonts", "wayfind-e2e");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(FIX).filter((n) => n.endsWith(".ttf"))) fs.copyFileSync(path.join(FIX, f), path.join(dir, f));
  try { execFileSync("fc-cache", ["-f", dir], { stdio: "ignore" }); } catch (e) {}
  let match = "";
  try { match = execFileSync("fc-match", ["Noto Serif:style=Regular", "family"], { encoding: "utf8" }).trim(); } catch (e) {}
  return match;
}
test.beforeAll(() => {
  const match = installAndroidSerif();
  expect(match, "fontconfig must resolve the Noto Serif fixture (Android emulation)").toMatch(/Noto Serif/);
});

// E2E_FETCH_VIA_NODE=1: same escape hatch as guide-rail-layout.spec.js, for
// sandboxes whose TLS-intercepting proxy Chromium does not trust (Node still
// verifies the proxy CA).
function sameHost(url) {
  try { return !!process.env.E2E_BASE_URL && new URL(url).host === new URL(process.env.E2E_BASE_URL).host; } catch (e) { return false; }
}
async function upstream(route) {
  const req = route.request();
  if (!process.env.E2E_FETCH_VIA_NODE) {
    // A held request released after its context closed has nowhere to go.
    try {
      const res = await route.fetch();
      return { status: res.status(), headers: res.headers(), body: await res.body() };
    } catch (e) { return null; }
  }
  let res;
  for (let i = 0; i < 4 && !res; i++) {
    // The deployment-protection cookie goes to the deployment's own host ONLY,
    // never to a third party the page happens to request.
    const headers = Object.assign({}, req.headers(), process.env.E2E_COOKIE && sameHost(req.url()) ? { cookie: process.env.E2E_COOKIE } : {});
    try { res = await fetch(req.url(), { method: req.method(), headers, redirect: "manual" }); }
    catch (e) { await new Promise((ok) => setTimeout(ok, 500 * (i + 1))); }
  }
  if (!res) return null;
  const headers = {};
  res.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) headers[k] = v; });
  return { status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) };
}

async function setup(context, { arm, platform, delay, known = [] }) {
  await context.addInitScript((id) => {
    try { Object.defineProperty(navigator, "webdriver", { get: () => false }); } catch (e) {}
    try { localStorage.setItem("wf_exp_id", id); } catch (e) {}
  }, arm);
  const fraunces = new Set(known);
  let release;
  const released = new Promise((r) => { release = r; });
  const held = [];
  const log = await containAnalytics(context, {
    passThrough: async (route) => {
      const url = route.request().url();
      const u = new URL(url);
      if (fraunces.has(u.pathname)) { held.push(u.pathname); await released; }
      const res = await upstream(route);
      if (!res) return route.abort().catch(() => {});
      if (delay) await new Promise((ok) => setTimeout(ok, delay(res.body.length)));
      if (/\.css(\?|$)/.test(u.pathname)) {
        let css = res.body.toString("utf8");
        for (const m of css.matchAll(/@font-face\{[^}]*font-family:\s*["']?Fraunces["']?;[^}]*?url\(([^)]+)\)/g)) fraunces.add(new URL(m[1].replace(/["']/g, ""), url).pathname);
        res.body = Buffer.from(rewriteCss(css, platform));
      }
      return route.fulfill(res).catch(() => {});
    },
  });
  return { log, release: () => release(), held, fraunces };
}

// Positions of every anchor a reader tracks, keyed by document order.
async function anchors(page) {
  return page.evaluate(() => {
    const out = {};
    let i = 0;
    for (const el of document.querySelectorAll("h1,h2,h3,section,[id^='pick-'],article,aside,footer")) {
      const r = el.getBoundingClientRect();
      if (!r.height && !r.width) continue;
      out[`${i++}:${el.tagName}${el.id ? "#" + el.id : ""}`] = Math.round(r.top + window.scrollY);
    }
    return out;
  });
}

async function waitQuiet(page, ms = 1200, max = 15000) {
  const t0 = Date.now();
  let last = JSON.stringify(await anchors(page)), since = Date.now();
  while (Date.now() - t0 < max) {
    await page.waitForTimeout(200);
    const now = JSON.stringify(await anchors(page));
    if (now !== last) { last = now; since = Date.now(); } else if (Date.now() - since >= ms) return true;
  }
  return false;
}

const GUIDE_TEMPLATE = PAGES.filter((p) => /^\/guides\/things-to-do-/.test(p.path));
// Routes that render no Fraunces: they must NOT preload it (v7.29's reason).
const NON_DISPLAY_ROUTES = ["/", "/events", "/go/tampa", "/best-beaches"];

async function getText(url) {
  if (process.env.E2E_FETCH_VIA_NODE) {
    const headers = process.env.E2E_COOKIE && sameHost(url) ? { cookie: process.env.E2E_COOKIE } : {};
    const r = await fetch(url, { headers, redirect: "follow" });
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
    return { status: r.status, headers: h, body: await r.text() };
  }
  return null;
}

async function fetchTextVia(request, baseURL, u) {
  const viaNode = await getText(new URL(u, baseURL).href);
  if (viaNode) return viaNode;
  const r = await request.get(u);
  return { status: r.status(), headers: r.headers(), body: await r.text() };
}
// The Fraunces latin file(s) a page's own CSS declares, as pathnames.
async function frauncesUrlsOf(request, baseURL, html) {
  const urls = new Set();
  for (const css of new Set(html.match(/\/_next\/static\/css\/[^"'?]+\.css/g) || [])) {
    const { body } = await fetchTextVia(request, baseURL, css);
    for (const m of body.matchAll(/@font-face\{[^}]*font-family:\s*["']?Fraunces["']?;[^}]*?url\(([^)]+)\)[^}]*unicode-range:\s*u\+00\?\?/g)) urls.add(new URL(m[1].replace(/["']/g, ""), baseURL).pathname);
  }
  return [...urls];
}

// ── 1. PRELOAD SCOPE (the normal-load fix) ───────────────────────────────────
// Every --wf-display route preloads EXACTLY the Fraunces file its own CSS
// declares (one URL: no second instance, no duplicate download); every other
// route preloads no Fraunces at all.
test("preload: Fraunces is preloaded on every --wf-display route and nowhere else", async ({ request, baseURL }) => {
  const fetchText = (u) => fetchTextVia(request, baseURL, u);
  const report = [];
  const preloadsOf = (res) => {
    const out = [];
    for (const m of res.body.matchAll(/<link[^>]*rel="preload"[^>]*>/g)) if (/as="font"/.test(m[0])) out.push((m[0].match(/href="([^"]+)"/) || [])[1]);
    for (const m of String(res.headers.link || "").matchAll(/<([^>]+)>;[^,]*as="font"/g)) out.push(m[1]);
    return out.filter(Boolean).map((u) => u.replace(/^https?:\/\/[^/]+/, ""));
  };
  for (const pg of PAGES) {
    const res = await fetchText(pg.path);
    expect(res.status, `${pg.path} status`).toBe(200);
    const fr = await frauncesUrlsOf(request, baseURL, res.body);
    const pre = preloadsOf(res);
    report.push(`${pg.path}: fraunces=${JSON.stringify(fr)} preloads=${JSON.stringify(pre)}`);
    expect(fr.length, `${pg.path}: exactly one Fraunces latin file across its CSS (a second URL is a duplicate download)`).toBe(1);
    expect(pre, `${pg.path}: must preload the Fraunces file its CSS uses`).toContain(fr[0]);
  }
  for (const r of NON_DISPLAY_ROUTES) {
    const res = await fetchText(r);
    const pre = preloadsOf(res);
    const fr = await frauncesUrlsOf(request, baseURL, res.body);
    report.push(`${r}: fraunces=${JSON.stringify(fr)} preloads=${JSON.stringify(pre)}`);
    expect(fr, `${r} renders no Fraunces and must not load its CSS`).toEqual([]);
    for (const u of pre) expect(u, `${r} must not preload Fraunces`).not.toMatch(/6e8c7cb2|fraunces/i);
  }
  console.log("[font-preload]\n  " + report.join("\n  "));
});

// ── 2. LATE FRAUNCES (a slow or failed font request; the metric fix) ─────────
// Fraunces held past first paint, then released. "Right now" and pick 1 are
// what the reader is looking at on the guide template: they must not move, on
// either platform's fallback. Movement elsewhere is logged, not asserted: a
// metric-matched fallback cannot make every line wrap identically.
for (const vp of VIEWPORTS) {
  for (const platform of ["android", "apple"]) {
    for (const pg of PAGES) {
      for (const arm of pg.arms) {
        test(`late ${platform} ${vp.name} ${pg.path} ${arm}`, async ({ browser, request, baseURL }) => {
          // Fraunces is PRELOADED, so its request leaves before any CSS is
          // parsed: learn its URL from the page's CSS first, then hold it.
          const known = await frauncesUrlsOf(request, baseURL, (await fetchTextVia(request, baseURL, pg.path)).body);
          expect(known.length, "the page's CSS declares a Fraunces file").toBeGreaterThan(0);
          const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, userAgent: vp.mobile ? PHONE_UA : undefined });
          const h = await setup(context, { arm, platform, known });
          const page = await context.newPage();
          try {
            await page.goto(pg.path, { waitUntil: "domcontentloaded", timeout: 60000 });
            // NOT waitForLoadState("load"): the held Fraunces request keeps the
            // load event pending by design. Wait for the layout to go quiet.
            await waitQuiet(page);
            const state = await page.evaluate(() => {
              const fams = new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")));
              const first = [...document.querySelectorAll("h1,h2,h3,p,strong,span")].find((e) => /Fraunces/.test(getComputedStyle(e).fontFamily) && e.textContent.trim());
              if (first) first.setAttribute("data-wf-font-probe", "");
              const usesDisplay = !!first;
              return { fams: [...fams], usesDisplay };
            });
            // Positive controls: the page sets Fraunces text, Fraunces is NOT yet
            // applied, and Fraunces really was requested and held.
            expect(state.usesDisplay, "page renders --wf-display text").toBe(true);
            expect(state.fams, "Fraunces must still be held").not.toContain("Fraunces");
            expect(h.held.length, "a Fraunces file was requested and held").toBeGreaterThan(0);
            if (platform === "apple" && !state.fams.includes("Fraunces Fallback")) {
              test.skip(true, "Liberation Serif not installed: next/font's Times face cannot be emulated here");
            }
            if (platform === "android") {
              // The fallback actually painted for --wf-display text must be Noto Serif.
              const cdp = await context.newCDPSession(page);
              await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
              const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
              const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-wf-font-probe]" });
              const { fonts } = nodeId ? await cdp.send("CSS.getPlatformFontsForNode", { nodeId }) : { fonts: [] };
              expect(fonts.map((f) => f.familyName), "Android emulation paints the first --wf-display text in Noto Serif").toContain("Noto Serif");
            }
            const before = await anchors(page);
            h.release();
            await page.waitForFunction(() => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Fraunces" && f.status === "loaded"), null, { timeout: 30000 });
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const after = await anchors(page);
            const moves = Object.keys(before).filter((k) => k in after).map((k) => [k, after[k] - before[k]]).filter(([, d]) => Math.abs(d) > MAX_MOVE_PX);
            const worst = moves.reduce((m, x) => Math.max(m, Math.abs(x[1])), 0);
            console.log(`[font-late] ${platform} ${vp.name} ${pg.path} ${arm} anchors=${Object.keys(before).length} worst=${worst}px moved=${moves.length} ${JSON.stringify(moves.slice(0, 4))}`);
            expect(Object.keys(before).length, "anchors were measured").toBeGreaterThan(3);
            if (GUIDE_TEMPLATE.includes(pg)) {
              const key = (re) => Object.keys(before).find((k) => re.test(k));
              const pick1 = key(/:SECTION#pick-1$/);
              expect(pick1, "pick 1 anchor present").toBeTruthy();
              const now = await page.evaluate(() => !!document.querySelector("section.wf-guide-now"));
              const guarded = moves.filter(([k]) => k === pick1 || Object.keys(before).indexOf(k) <= Object.keys(before).indexOf(pick1));
              console.log(`[font-late] ${platform} ${vp.name} ${pg.path} ${arm} rightNow=${now} pick1+above moved=${JSON.stringify(guarded)}`);
              expect(guarded, `"Right now" / pick 1 (and everything above it) moved more than ${MAX_MOVE_PX}px when Fraunces swapped in`).toEqual([]);
            }
            assertContained(h.log, expect);
          } finally {
            h.release();
            await context.close();
          }
        });
      }
    }
  }
}

// ── 3. NORMAL COLD LOAD (modelled slow 4G; the preload fix) ──────────────────
// Every response is delayed by RTT + size/bandwidth (no font is held). With the
// preload, Fraunces is applied before first contentful paint, so its swap can
// never move painted content; if it is not, the swap must move nothing.
const RTT_MS = 150, KBPS = 1600;
for (const vp of VIEWPORTS) {
  for (const platform of ["android", "apple"]) {
    for (const pg of PAGES) {
      test(`cold ${platform} ${vp.name} ${pg.path}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, userAgent: vp.mobile ? PHONE_UA : undefined });
        await context.addInitScript(() => {
          window.__wfFcp = null; window.__wfFrauncesAt = null; window.__wfSwapMoves = null;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__wfFcp = e.startTime; }).observe({ type: "paint", buffered: true });
          const snap = () => { const o = {}; let i = 0; for (const el of document.querySelectorAll("h1,h2,h3,section,[id^='pick-'],article,aside,footer")) { const r = el.getBoundingClientRect(); if (r.height || r.width) o[i++ + ":" + el.tagName + (el.id ? "#" + el.id : "")] = Math.round(r.top + scrollY); } return o; };
          let last = null;
          const tick = () => { const f = [...document.fonts].find((x) => x.family.replace(/["']/g, "") === "Fraunces" && x.status === "loaded");
            if (f && window.__wfFrauncesAt == null) { window.__wfFrauncesAt = performance.now(); const prev = last; requestAnimationFrame(() => { const now = snap(); window.__wfSwapMoves = prev ? Object.keys(prev).filter((k) => k in now && Math.abs(now[k] - prev[k]) > 2).map((k) => [k, now[k] - prev[k]]) : []; }); }
            else if (!f && document.body) last = snap();
            if (performance.now() < 30000 && window.__wfSwapMoves == null) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        const h = await setup(context, { arm: "qa-4", platform, delay: (bytes) => RTT_MS + (bytes * 8) / KBPS });
        h.release();
        const page = await context.newPage();
        try {
          await page.goto(pg.path, { waitUntil: "load", timeout: 90000 });
          await page.waitForFunction(() => window.__wfSwapMoves != null, null, { timeout: 60000 });
          const r = await page.evaluate(() => ({ fcp: Math.round(window.__wfFcp), fraunces: Math.round(window.__wfFrauncesAt), moves: window.__wfSwapMoves }));
          console.log(`[font-cold] ${platform} ${vp.name} ${pg.path} fcp=${r.fcp} frauncesApplied=${r.fraunces} beforeFcp=${r.fraunces <= r.fcp} moves=${JSON.stringify(r.moves.slice(0, 4))}`);
          expect(r.fcp, "first contentful paint observed").toBeGreaterThan(0);
          expect(r.fraunces <= r.fcp || r.moves.length === 0, `Fraunces landed after first paint (${r.fraunces}ms > FCP ${r.fcp}ms) and moved ${JSON.stringify(r.moves.slice(0, 6))}`).toBe(true);
          assertContained(h.log, expect);
        } finally {
          await context.close();
        }
      });
    }
  }
}
