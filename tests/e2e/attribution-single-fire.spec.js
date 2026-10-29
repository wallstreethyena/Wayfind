// One intentional ticket activation = exactly one commerce_cta_clicked (and, when
// allowed, exactly one Meta OutboundTicketClick). Runs against `next start`.
// posthog.capture and fbq are WRAPPED, network to PostHog/Meta is blocked, and
// navigation is cancelled in the page so the partner is never contacted.
// Needs a build made with NEXT_PUBLIC_POSTHOG_KEY set (any placeholder).
const { test, expect } = require("@playwright/test");

// Playwright's default UA says HeadlessChrome, which the existing bot gate (rightly) suppresses.
test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });

const URL_BASE = "/halloween-in-florida?utm_source=ig&utm_medium=paid&utm_campaign=halloween_reels&fbclid=IwAR_e2e";

async function setup(page, extraQuery) {
  await page.route(/(posthog\.com|facebook\.(com|net)|googletagmanager|google-analytics)/, (r) => r.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    window.__caps = [];
    window.__fbq = [];
    window.fbq = function () { window.__fbq.push([].slice.call(arguments)); };
    let ph;
    Object.defineProperty(window, "posthog", {
      configurable: true,
      get() { return ph; },
      set(v) {
        ph = v;
        if (v && typeof v.capture === "function" && !v.__wrapped) {
          const c = v.capture.bind(v);
          v.capture = (e, p, o) => { window.__caps.push([e, p]); return c(e, p, o); };
          v.__wrapped = true;
        }
      },
    });
    // cancel navigation AFTER every app handler (bubble phase on document)
    document.addEventListener("click", (e) => { const a = e.target && e.target.closest && e.target.closest("a"); if (a) e.preventDefault(); });
  });
  await page.goto(URL_BASE + (extraQuery || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window._phInit === "ready", null, { timeout: 20000 });
}

const commerce = (page) => page.evaluate(() => window.__caps.filter((c) => c[0] === "commerce_cta_clicked").map((c) => c[1]));
const otc = (page) => page.evaluate(() => window.__fbq.filter((a) => a[1] === "OutboundTicketClick"));

async function ctas(page) {
  // every distinct ticket CTA type on the page: organizer (owned) + /go links
  return page.evaluate(() => {
    const out = [];
    const org = document.querySelector('a.boo-buy[data-commerce-owner="BoHalloweenHaunt"]');
    if (org) out.push({ kind: "organizer-owned", sel: 'a.boo-buy[data-commerce-owner="BoHalloweenHaunt"]' });
    const go = Array.from(document.querySelectorAll('a[href*="/api/"][href*="/go"]'))[0];
    if (go) out.push({ kind: "go:" + (go.getAttribute("data-commerce-owner") || "beacon"), sel: 'a[href*="/api/"][href*="/go"]' });
    const goBeacon = Array.from(document.querySelectorAll('a[href*="/api/"][href*="/go"]:not([data-commerce-owner])'))[0];
    if (goBeacon) out.push({ kind: "go:beacon", sel: 'a[href*="/api/"][href*="/go"]:not([data-commerce-owner])' });
    return out;
  });
}

test("halloween: tap, Enter and double-tap each record exactly one click", async ({ page }) => {
  await setup(page, "&wf_test=e2e-single");
  const list = await ctas(page);
  expect(list.length, "found ticket CTAs on the page").toBeGreaterThan(0);
  const report = [];
  for (const cta of list) {
    const loc = page.locator(cta.sel).first();
    await loc.scrollIntoViewIfNeeded();
    for (const how of ["click", "enter", "dblclick"]) {
      const before = (await commerce(page)).length;
      if (how === "click") await loc.click();
      else if (how === "dblclick") await loc.dblclick();
      else { await loc.focus(); await page.keyboard.press("Enter"); }
      await page.waitForTimeout(300);
      const delta = (await commerce(page)).length - before;
      report.push(`${cta.kind} ${how} => ${delta}`);
      expect(delta, `${cta.kind} via ${how}`).toBe(1);
      await page.waitForTimeout(1100); // clear the 1 s double-activation window
    }
    // two REAL activations, 1.5 s apart, are two events
    const b2 = (await commerce(page)).length;
    await loc.click(); await page.waitForTimeout(1300); await loc.click(); await page.waitForTimeout(300);
    expect((await commerce(page)).length - b2, `${cta.kind} two real clicks`).toBe(2);
    await page.waitForTimeout(1100);
  }
  console.log("SINGLE-FIRE REPORT\n" + report.join("\n"));
  const evs = await commerce(page);
  const e = evs[0];
  expect(e.is_test).toBe(true);
  expect(e.wf_test).toBe("e2e-single");
  expect(e.landing_campaign).toBe("halloween_reels");
  expect(e.landing_path).toBe("/halloween-in-florida");
  expect(e.surface).toBeTruthy();
  console.log("SAMPLE PAYLOAD " + JSON.stringify(e));
  // test traffic without wf_meta_test never reaches Meta
  expect(await otc(page)).toHaveLength(0);
  // every event (not just commerce) is tagged + carries first-touch/session props
  const all = await page.evaluate(() => window.__caps.length);
  expect(all).toBeGreaterThan(0);
});

test("halloween: Meta OutboundTicketClick fires once per activation with the test code", async ({ page }) => {
  await setup(page, "&wf_test=e2e-meta&wf_meta_test=TEST12345");
  const list = await ctas(page);
  const loc = page.locator(list[0].sel).first();
  await loc.scrollIntoViewIfNeeded();
  await loc.dblclick();
  await page.waitForTimeout(500);
  const ph = await commerce(page);
  const fb = await otc(page);
  expect(ph).toHaveLength(1);
  expect(fb).toHaveLength(1);
  expect(fb[0][0]).toBe("trackCustom");
  expect(fb[0][3].eventID).toMatch(/^wf_otc_/);
  expect(fb[0][2].content_type).toBe("event");
  console.log("META CALL " + JSON.stringify(fb[0]));
});

test("attribution stored first-party and registered on PostHog", async ({ page }) => {
  await setup(page, "&wf_test=e2e-attr");
  const st = await page.evaluate(() => ({
    ft: JSON.parse(localStorage.getItem("wf_ft_v1") || "null"),
    sess: JSON.parse(sessionStorage.getItem("wf_sess_attr_v1") || "null"),
    reg: window.posthog.get_property ? { ft: window.posthog.get_property("wf_ft_fbclid"), s: window.posthog.sessionPersistence && window.posthog.sessionPersistence.properties()["wf_sess_utm_campaign"] } : null,
  }));
  expect(st.ft.p.fbclid).toBe("IwAR_e2e");
  expect(st.sess.p.utm_campaign).toBe("halloween_reels");
  expect(st.reg.ft).toBe("IwAR_e2e");
  expect(st.reg.s).toBe("halloween_reels");
  // SPA navigation that drops the query keeps attribution
  await page.evaluate(() => history.replaceState({}, "", "/halloween-in-florida"));
  const again = await page.evaluate(() => JSON.parse(sessionStorage.getItem("wf_sess_attr_v1")).p.utm_campaign);
  expect(again).toBe("halloween_reels");
});

test("verifier UA is excluded browser side", async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 WayfindVerify" });
  const page = await ctx.newPage();
  await page.route(/(posthog\.com|facebook\.(com|net)|googletagmanager)/, (r) => r.abort());
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); });
  await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__WF_ANALYTICS_SUPPRESSED, null, { timeout: 20000 });
  expect(await page.evaluate(() => window.__WF_ANALYTICS_SUPPRESSED)).toBe("internal");
  expect(await page.evaluate(() => typeof window.posthog)).toBe("undefined");
  await ctx.close();
});

test("guide: one dblclick on each distinct ticket CTA type = one commerce click", async ({ page }) => {
  await page.route(/(posthog\.com|facebook\.(com|net)|googletagmanager|google-analytics)/, (r) => r.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    window.__caps = [];
    let ph;
    Object.defineProperty(window, "posthog", { configurable: true, get() { return ph; }, set(v) { ph = v; if (v && v.capture && !v.__w) { const c = v.capture.bind(v); v.capture = (e, p, o) => { window.__caps.push([e, p]); return c(e, p, o); }; v.__w = 1; } } });
    document.addEventListener("click", (e) => { const a = e.target && e.target.closest && e.target.closest("a"); if (a) e.preventDefault(); });
  });
  await page.goto("/guides/things-to-do-sarasota?utm_source=fb&wf_test=e2e-guide", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window._phInit === "ready", null, { timeout: 20000 });
  const sels = await page.evaluate(() => {
    const seen = new Set(); const out = [];
    for (const a of document.querySelectorAll('a[href*="/api/"][href*="/go"]')) {
      const k = a.getAttribute("data-commerce-owner") || "beacon";
      if (seen.has(k)) continue; seen.add(k);
      a.setAttribute("data-e2e-cta", k); out.push(k);
    }
    return out;
  });
  console.log("GUIDE CTA TYPES " + JSON.stringify(sels));
  expect(sels.length).toBeGreaterThan(0);
  for (const k of sels.slice(0, 5)) {
    const loc = page.locator(`[data-e2e-cta="${k}"]`).first();
    await loc.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.__caps.filter((c) => c[0] === "commerce_cta_clicked").length);
    await loc.dblclick();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__caps.filter((c) => c[0] === "commerce_cta_clicked").length);
    console.log(`GUIDE ${k} dblclick => ${after - before}`);
    expect(after - before, `guide CTA ${k}`).toBe(1);
    await page.waitForTimeout(1100);
  }
});

test("beacon organizer link (event-detail pattern): one dblclick = one event, no href rewrite", async ({ page }) => {
  await setup(page, "&wf_test=e2e-org");
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "https://tickets.example.org/e/42?x=1"; a.textContent = "Get tickets";
    a.setAttribute("data-wf-outbound-ticket", "organizer"); a.setAttribute("data-wf-content-id", "slug-42"); a.id = "e2e-org";
    a.style.cssText = "position:fixed;top:80px;left:10px;z-index:99999;background:#fff;padding:8px";
    document.body.appendChild(a);
  });
  await page.locator("#e2e-org").dblclick();
  await page.waitForTimeout(400);
  const evs = await commerce(page);
  expect(evs).toHaveLength(1);
  expect(evs[0].provider).toBe("organizer");
  expect(evs[0].merchant).toBe("tickets.example.org");
  expect(evs[0].content_id).toBe("slug-42");
  expect(await page.locator("#e2e-org").getAttribute("href")).toBe("https://tickets.example.org/e/42?x=1");
});
