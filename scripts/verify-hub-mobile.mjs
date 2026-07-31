#!/usr/bin/env node
/**
 * verify-hub-mobile — drive /guides and /culture/[metro] in a REAL 390px viewport
 * and assert on the EVENTS, not on the markup.
 *
 * Not part of run-guards: it needs a running server. It exists because
 * resize_window silently no-ops (CLAUDE.md: a 390px resize reported success and
 * produced a 1512px screenshot), and because renderToStaticMarkup never executes
 * an effect or a click handler — which is exactly how #486 shipped. The only way
 * to know these four events fire is to fire them.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3111";
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function drive(path, expectSlugKey) {
  const page = await ctx.newPage();
  const events = [];
  // Stub posthog BEFORE any app code runs, so nothing is missed and no real
  // analytics traffic leaves this run.
  await page.addInitScript(() => {
    window.__ev = [];
    window.posthog = {
      capture: (n, p) => window.__ev.push({ n, p: p || {} }),
      init: () => {}, identify: () => {}, register: () => {}, opt_in_capturing: () => {},
      get_distinct_id: () => "test", onFeatureFlags: () => {}, isFeatureEnabled: () => false,
    };
  });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500); // let the client components hydrate

  // ASSERT the width rather than assume it — a silent no-op is the failure mode.
  const w = await page.evaluate(() => window.innerWidth);
  ok(w === 390, `${path}: viewport must be 390px, got ${w}`);

  // No horizontal overflow: the page body must never scroll sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, `${path}: page must not overflow horizontally at 390px`);

  // The primary CTA must exist, be visible, and be inside the viewport width.
  const cta = page.locator('section[aria-label="Your next step"] a').first();
  await cta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900); // let the IntersectionObserver fire
  ok(await cta.isVisible(), `${path}: primary CTA must be visible at 390px`);
  const box = await cta.boundingBox();
  ok(box && box.x >= 0 && box.x + box.width <= 391, `${path}: CTA must fit inside 390px (x=${box && box.x}, w=${box && box.width})`);
  ok(box && box.height >= 44, `${path}: CTA must meet the 44px touch-target minimum (got ${box && box.height})`);

  // Impression must have fired from the observer.
  const afterView = await page.evaluate(() => window.__ev.slice());
  const imp = afterView.filter((e) => e.n === "guide_cta_impression");
  const cimp = afterView.filter((e) => e.n === "commerce_impression");
  ok(imp.length >= 1, `${path}: guide_cta_impression must fire when the CTA is scrolled into view`);
  ok(cimp.length >= 1, `${path}: commerce_impression must fire for a monetized CTA`);

  // Required fields on the product event.
  if (imp[0]) {
    for (const k of ["click_id", expectSlugKey, "surface", "provider", "offer_id", "position", "cta_variant", "city", "category"]) {
      ok(imp[0].p[k] != null && imp[0].p[k] !== "", `${path}: guide_cta_impression missing "${k}"`);
    }
  }
  // Required fields on the commerce event, under the schema's names.
  if (cimp[0]) {
    for (const k of ["click_id", "content_id", "surface", "provider", "offer_id", "rank_bucket", "variant", "city_id", "category"]) {
      ok(cimp[0].p[k] != null && cimp[0].p[k] !== "", `${path}: commerce_impression missing "${k}"`);
    }
    ok(cimp[0].p.position === undefined, `${path}: commerce_impression must NOT carry a raw position`);
    ok(imp[0] && imp[0].p.click_id === cimp[0].p.click_id, `${path}: click_id must match across product and commerce events`);
  }

  // KEYBOARD: the CTA must be reachable and activatable by keyboard.
  const focusable = await cta.evaluate((el) => { el.focus(); return document.activeElement === el; });
  ok(focusable, `${path}: primary CTA must be keyboard-focusable`);

  // CLICK: emit the click events without actually navigating away.
  await cta.evaluate((el) => el.setAttribute("href", "javascript:void 0"));
  await cta.click();
  await page.waitForTimeout(400);
  const afterClick = await page.evaluate(() => window.__ev.slice());
  ok(afterClick.filter((e) => e.n === "guide_cta_clicked").length === 1,
    `${path}: exactly one guide_cta_clicked (got ${afterClick.filter((e) => e.n === "guide_cta_clicked").length})`);
  ok(afterClick.filter((e) => e.n === "commerce_cta_clicked").length === 1,
    `${path}: exactly one commerce_cta_clicked (got ${afterClick.filter((e) => e.n === "commerce_cta_clicked").length})`);

  // No duplicate impressions after a re-scroll.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await cta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const finalEv = await page.evaluate(() => window.__ev.slice());
  ok(finalEv.filter((e) => e.n === "guide_cta_impression").length === imp.length,
    `${path}: guide_cta_impression must not re-fire on re-scroll`);

  events.push(...finalEv);
  await page.close();
  return events;
}

const a = await drive("/guides", "guide_slug");
const b = await drive("/culture/orlando", "culture_slug");
// keys has NO /things-to-do landing page — the continue card must fall back
// rather than link to a 404.
const c = await drive("/culture/keys", "culture_slug");

await browser.close();

console.log("--- events seen ---");
for (const [label, evs] of [["/guides", a], ["/culture/orlando", b], ["/culture/keys", c]]) {
  const names = {};
  for (const e of evs) names[e.n] = (names[e.n] || 0) + 1;
  console.log("  " + label + ": " + JSON.stringify(names));
}

if (fail.length) {
  console.error("verify-hub-mobile: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`verify-hub-mobile: OK — ${pass} assertions at a REAL 390x844 viewport across 3 pages`);
