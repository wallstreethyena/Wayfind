// e2e-boo-tapthrough.mjs: REAL browser proof that Boo cannot intercept navigation.
// NOT part of prebuild (needs a browser and a production server). Run:
//   npx next build && npx next start -p 3099 &
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e-boo-tapthrough.mjs --secs=90
// Args: --base=http://localhost:3099 --secs=90 --pages=/,/halloween-in-florida
//       --viewports=390x844,768x1024 --shots=<dir for screenshots>
//
// For every viewport x page, for SECS seconds, every 250ms:
//   * every interactive control whose rect overlaps Boo (88px body or his bubble) is
//     probed with document.elementFromPoint at the overlap center and four inset
//     corners; the answer must never be inside .boo-c;
//   * computed pointer-events is read on .boo-c and every descendant: all "none",
//     except the hit button which is "auto" only while data-tap="1";
//   * about once a second a REAL touch tap (page.touchscreen.tap) is aimed at the
//     control nearest Boo's center inside the overlap; a capture listener on
//     pointerdown/click records the target and swallows the click so nothing navigates;
//     a tap whose target is inside .boo-c is "intercepted" (must be 0).
// Phases (fractions of SECS): moving, scrolling, chat open/close, ghost tours chip
// expanded, viewport change (rotate), idle/bubbles. A keyboard pass runs first.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Options are argv (--base=, --secs=, --pages=, --viewports=, --shots=), not env.
const arg = (k, d) => { const m = process.argv.find((x) => x.startsWith("--" + k + "=")); return m ? m.slice(k.length + 3) : d; };
const BASE = arg("base", "http://localhost:3099");
const SECS = Number(arg("secs", "90"));
const PAGES = arg("pages", "/,/halloween-in-florida").split(",");
const VPS = arg("viewports", "390x844,768x1024").split(",").map((v) => v.split("x").map(Number));
const SHOTS = arg("shots", ".");
mkdirSync(SHOTS, { recursive: true });

const INIT = () => {
  window.__taps = [];
  window.__downs = [];
  const info = (e) => {
    const t = e.target;
    return {
      inBoo: !!(t && t.closest && t.closest(".boo-c")),
      inHit: !!(t && t.closest && t.closest(".boo-c-hit")),
      inSheet: !!(t && t.closest && t.closest(".boo-s-back")),
      tag: t && t.tagName, txt: t && (t.textContent || "").trim().slice(0, 30),
      cls: t && (t.className && t.className.baseVal === undefined ? String(t.className) : ""),
      x: e.clientX, y: e.clientY, t: performance.now(),
      tapOn: (document.querySelector(".boo-c-hit") || { getAttribute() { return null; } }).getAttribute("data-tap") === "1",
    };
  };
  document.addEventListener("pointerdown", (e) => { window.__downs.push(info(e)); }, true);
  document.addEventListener("click", (e) => {
    const i = info(e);
    window.__taps.push(i);
    // nothing outside Boo or his sheet may act: no navigation, no handlers, no beacons.
    if (!i.inBoo && !i.inSheet && !window.__allow) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
};

// Runs in the page. Returns what overlaps Boo right now and the hit-test answers.
const PROBE = () => {
  const SEL = "a[href],button,input:not([type=hidden]),select,textarea,summary,label,[role=button],[role=link]";
  const body = document.querySelector(".boo-c-body");
  if (!body) return null;
  const vw = innerWidth, vh = innerHeight;
  const rects = [];
  const br = body.getBoundingClientRect();
  rects.push({ k: "body", r: br });
  const bub = document.querySelector(".boo-c-bubble");
  if (bub) rects.push({ k: "bubble", r: bub.getBoundingClientRect() });
  const c0 = { x: br.left + br.width / 2, y: br.top + br.height / 2 };
  const hit = document.querySelector(".boo-c-hit");
  const out = { tapOn: !!hit && hit.getAttribute("data-tap") === "1", pos: { x: br.left, y: br.top }, ov: [], bad: [], other: 0, bigSkipped: 0, peBad: [], bub: bub ? { v: bub.dataset.v, h: bub.dataset.h, t: bub.textContent.slice(0, 20) } : null, open: !!document.querySelector("[role=dialog]") };
  // pointer-events audit
  for (const el of document.querySelectorAll(".boo-c, .boo-c *")) {
    const pe = getComputedStyle(el).pointerEvents;
    const isHit = el === hit;
    const want = isHit ? (out.tapOn ? "auto" : "none") : "none";
    if (pe !== want) out.peBad.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ":" + pe);
  }
  window.__ctl = [];
  const seen = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest(".boo-c,.boo-s-back")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (r.width * r.height > vw * vh * 0.85) { out.bigSkipped++; continue; }
    for (const b of rects) {
      const x0 = Math.max(r.left, b.r.left, 0), x1 = Math.min(r.right, b.r.right, vw);
      const y0 = Math.max(r.top, b.r.top, 0), y1 = Math.min(r.bottom, b.r.bottom, vh);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;
      const pts = [[(x0 + x1) / 2, (y0 + y1) / 2], [x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]];
      let intercepted = false, topmostOther = false;
      for (const [px, py] of pts) {
        const top = document.elementFromPoint(px, py);
        if (top && top.closest(".boo-c")) intercepted = true;
        else if (top && !(top === el || el.contains(top) || top.contains(el))) topmostOther = true;
      }
      const idx = window.__ctl.push(el) - 1;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const d = Math.hypot(cx - c0.x, cy - c0.y);
      const name = el.tagName + "." + String(el.className && el.className.baseVal === undefined ? el.className : "").split(" ")[0] + "|" + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24);
      out.ov.push({ idx, k: b.k, cx, cy, d, name, intercepted, topmostOther });
      if (intercepted) out.bad.push(name);
      if (topmostOther) out.other++;
      seen.push(el);
    }
  }
  out.ov.sort((a, b) => a.d - b.d);
  return out;
};

async function run(browser, path, vp) {
  const [W, H] = vp;
  const tag = path.replace(/\W+/g, "_") + "_" + W + "x" + H;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: W < 700, deviceScaleFactor: 2 });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const R = { tag, ticks: 0, overlapTicks: 0, overlapsSeen: 0, probes: 0, probeIntercepted: 0, otherOccluded: 0, peBad: 0, taps: 0, tapsOnControl: 0, tapsOther: 0, tapsIntercepted: 0, downsInBoo: 0, clicksInBoo: 0, backstop: 0, phase: {}, hitTappableTicks: 0, hitTappableOverControl: 0, opens: 0, closes: 0, focusReturned: 0, posTap: 0, posTapOk: 0, bubbleSeen: 0, bubbleFlips: 0, bubbleOverControl: 0, bigSkipped: 0, errs, keyboard: null, fails: [] };
  const fail = (m) => { if (R.fails.length < 12) R.fails.push(m); };

  // ---- keyboard pass (fresh page)
  {
    const k = { autoFocused: false, reached: false, tabs: 0, ring: false, enterOpens: false, focusInSheet: false, escCloses: false, focusBack: false };
    k.autoFocused = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest(".boo-c"));
    for (let i = 0; i < 300 && !k.reached; i++) {
      await page.keyboard.press("Tab");
      k.tabs++;
      k.reached = await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("boo-c-hit"));
    }
    if (k.reached) {
      k.ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(900);
      k.enterOpens = await page.evaluate(() => !!document.querySelector("[role=dialog]"));
      k.focusInSheet = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest("[role=dialog]"));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      k.escCloses = await page.evaluate(() => !document.querySelector("[role=dialog]"));
      k.focusBack = await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("boo-c-hit"));
    }
    R.keyboard = k;
    if (k.autoFocused) fail("Boo was focused without being tabbed to");
    if (!k.reached) fail("Boo button not reachable by Tab");
    if (!k.ring) fail("no visible focus ring on Boo button");
    if (!k.enterOpens) fail("Enter on Boo button did not open chat");
    if (!k.focusInSheet) fail("focus did not move into the sheet after opening");
    if (!k.escCloses) fail("Escape did not close the sheet");
    if (!k.focusBack) fail("focus did not return to Boo button on close");
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.evaluate(() => { window.__taps.length = 0; window.__downs.length = 0; });
  }

  const t0 = Date.now();
  let lastBub = null, lastTap = 0, lastChat = 0, chipDone = false, rotated = false, back = false, shot = 0, lastScroll = 0;
  const phaseOf = (f) => (f < 0.22 ? "moving" : f < 0.4 ? "scrolling" : f < 0.55 ? "chat" : f < 0.68 ? "chip" : f < 0.85 ? "viewport" : "bubbles");
  while ((Date.now() - t0) / 1000 < SECS) {
    const el = (Date.now() - t0) / 1000, f = el / SECS, ph = phaseOf(f);
    R.phase[ph] = (R.phase[ph] || 0) + 1;
    R.ticks++;
    // phase drivers
    if (ph === "scrolling" && Date.now() - lastScroll > 110) {
      lastScroll = Date.now();
      await page.evaluate((e) => window.scrollTo(0, 320 + Math.sin(e * 1.3) * 300 + (e % 7) * 25), el);
    }
    if (ph === "chip" && !chipDone) {
      chipDone = true;
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const b = [...document.querySelectorAll("button")].find((x) => /Ghost tours/i.test(x.textContent || "") && !x.closest(".boo-c"));
        if (b) { window.__allow = true; b.click(); window.__allow = false; if (b.scrollIntoView) b.scrollIntoView({ block: "center" }); }
      });
      await page.waitForTimeout(400);
    }
    if (ph === "viewport" && !rotated) { rotated = true; await page.setViewportSize({ width: H > W ? Math.min(H, 1024) : W, height: H > W ? W : H }); await page.waitForTimeout(500); }
    if (f >= 0.78 && ph === "viewport" && !back) { back = true; await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(500); }
    if (ph === "viewport" && f < 0.78 && !back) { /* rotated, keep going */ }
    if (ph === "bubbles" && !back) { back = true; await page.setViewportSize({ width: W, height: H }); }

    // chat open/close cycles with real taps on the hit
    if (ph === "chat" && Date.now() - lastChat > 2600) {
      lastChat = Date.now();
      let pos = null;
      for (let i = 0; i < 80 && !pos; i++) {
        const rd = () => page.evaluate(() => { const h = document.querySelector(".boo-c-hit"); if (!h || h.getAttribute("data-tap") !== "1") return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        // only tap a hit that holds still for 60ms (a finger aims at what it sees; a moving target is a different test)
        const a = await rd(); await page.waitForTimeout(60); const b2 = await rd();
        pos = a && b2 && Math.hypot(a.x - b2.x, a.y - b2.y) < 1 && (await rd()) ? b2 : null;
        if (!pos) await page.waitForTimeout(100);
      }
      if (pos) {
        // confirm at the tap point the hit is what the browser would hit, then tap it for real
        const top = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest(".boo-c-hit")); }, pos);
        R.posTap++;
        await page.touchscreen.tap(pos.x, pos.y);
        await page.waitForTimeout(1100);
        const opened = await page.evaluate(() => !!document.querySelector("[role=dialog]"));
        if (opened) {
          R.posTapOk++; R.opens++;
          if (shot < 1) { shot++; await page.screenshot({ path: SHOTS + "/tap-" + tag + "-chat.png" }); }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(500);
          const closed = await page.evaluate(() => !document.querySelector("[role=dialog]"));
          if (closed) R.closes++;
          const fb = await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("boo-c-hit"));
          if (fb) R.focusReturned++; else fail("focus not on Boo hit after close (cycle)");
        } else if (top) fail("tap on tappable hit did not open the chat");
      }
    }

    // probe
    let p = null;
    // Scroll/resize events are delivered at the start of the next frame, so a probe in the SAME
    // task as a programmatic scrollTo would see layout the browser has not announced yet. A real
    // finger is never faster than a frame, so wait one rAF (events first) before probing.
    try { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); p = await page.evaluate(PROBE); } catch { /* navigation or resize race */ }
    if (p) {
      if (p.open) { await page.waitForTimeout(250); continue; }
      if (p.ov.length) { R.overlapTicks++; R.overlapsSeen += p.ov.length; }
      R.probes += p.ov.length;
      R.probeIntercepted += p.bad.length;
      R.otherOccluded += p.other;
      R.bigSkipped = Math.max(R.bigSkipped, p.bigSkipped);
      if (p.peBad.length) { R.peBad++; fail("pointer-events audit: " + p.peBad.slice(0, 3).join(",")); }
      if (p.bad.length) fail("elementFromPoint returned Boo over " + p.bad.slice(0, 3).join(",") + " at " + ph);
      if (p.tapOn) { R.hitTappableTicks++; if (p.ov.some((o) => o.k === "body")) R.hitTappableOverControl++; }
      if (p.bub) {
        R.bubbleSeen++;
        const key = p.bub.t;
        if (lastBub && lastBub.t === key && (lastBub.v !== p.bub.v || lastBub.h !== p.bub.h)) R.bubbleFlips++;
        lastBub = p.bub;
        if (p.ov.some((o) => o.k === "bubble")) R.bubbleOverControl++;
      } else lastBub = null;
      // a real tap about once a second on the control nearest his center
      if (p.ov.length && Date.now() - lastTap > 950) {
        lastTap = Date.now();
        const o = p.ov[0];
        if (o.cx >= 0 && o.cy >= 0 && o.cx < page.viewportSize().width && o.cy < page.viewportSize().height) {
          const before = await page.evaluate(() => ({ d: window.__downs.length, c: window.__taps.length }));
          await page.touchscreen.tap(o.cx, o.cy);
          await page.waitForTimeout(60);
          const after = await page.evaluate(() => ({ downs: window.__downs.slice(), taps: window.__taps.slice(), bs: window.__booBackstop || 0 }));
          R.taps++;
          const d = after.downs.slice(before.d), c = after.taps.slice(before.c);
          const dIn = d.some((x) => x.inBoo), cIn = c.some((x) => x.inBoo);
          if (dIn) R.downsInBoo++;
          if (cIn) R.clicksInBoo++;
          if (dIn || cIn) { R.tapsIntercepted++; fail("REAL TAP intercepted by Boo at " + o.name + " (" + ph + ")"); if (shot < 4) { shot++; await page.screenshot({ path: SHOTS + "/tap-" + tag + "-INTERCEPT.png" }); } }
          else if (c.length && c.some((x) => !x.inBoo)) R.tapsOnControl++;
          else R.tapsOther++;
          R.backstop = after.bs;
          if (shot < 2 && ph === "moving") { shot++; await page.screenshot({ path: SHOTS + "/tap-" + tag + "-overlap.png" }); }
        }
      }
    }
    const spent = Date.now() - t0 - Math.floor(el * 1000);
    await page.waitForTimeout(250);
  }
  R.backstop = await page.evaluate(() => window.__booBackstop || 0).catch(() => R.backstop);
  if (R.backstop) fail("backstop (tap handed over from hit) fired " + R.backstop + " times");
  if (R.hitTappableOverControl) fail("hit was tappable while his body overlapped a control: " + R.hitTappableOverControl + " ticks (informational: body is 88px, hit is 44px)");
  await ctx.close();
  return R;
}

const browser = await chromium.launch();
const results = await Promise.all(PAGES.flatMap((p) => VPS.map((vp) => run(browser, p, vp))));
await browser.close();
const sum = (k) => results.reduce((a, r) => a + r[k], 0);
for (const r of results) console.log(JSON.stringify(r));
console.log("TOTAL ticks=" + sum("ticks") + " overlapTicks=" + sum("overlapTicks") + " overlapsSeen=" + sum("overlapsSeen") + " hitTests=" + sum("probes") + " hitTestInterceptedByBoo=" + sum("probeIntercepted") +
  " taps=" + sum("taps") + " tapsOnControl=" + sum("tapsOnControl") + " tapsOther=" + sum("tapsOther") + " tapsInterceptedByBoo=" + sum("tapsIntercepted") + " backstop=" + sum("backstop") + " pointerEventsAuditFails=" + sum("peBad") +
  " chatOpens=" + sum("opens") + " focusReturned=" + sum("focusReturned") + " bubbleFlips=" + sum("bubbleFlips"));
const bad = results.filter((r) => r.fails.length && r.fails.some((f) => !/informational/.test(f)));
if (bad.length || sum("tapsIntercepted") || sum("probeIntercepted")) { console.error("FAIL"); process.exit(1); }
console.log("e2e-boo-tapthrough: OK");
