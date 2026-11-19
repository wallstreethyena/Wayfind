// Real Chrome launcher for the booking agent. No extra flags that hide automation.
// playwright-core is the only runtime dependency of this folder. It is not installed
// into the Next.js app and this file is not imported by any route.

import { AGENT_UA } from "../../lib/bookingAgent/constants.js";

export async function launchHonestChromium(opts = {}) {
  const { chromium } = await import("playwright-core");
  const headless = opts.headless ?? true;
  const launchOpts = {
    headless,
    args: ["--no-sandbox"],
  };
  if (opts.executablePath) {
    launchOpts.executablePath = opts.executablePath;
  } else {
    launchOpts.channel = opts.channel || "chrome";
  }
  const browser = await chromium.launch(launchOpts);
  const userAgent = opts.userAgent || AGENT_UA;
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  let httpStatus = 0;
  page.on("response", (res) => {
    if (res.request().resourceType() === "document") httpStatus = res.status();
  });
  return {
    userAgent,
    async open(url, { timeoutMs = 15000 } = {}) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      // Allow OpenTable's client hydration (availability slots or details form) to render.
      await Promise.race([
        page.waitForSelector("[data-test='slot-button'], #firstName, [data-synthetic='first-name'], [data-synthetic='slot-button']", { timeout: Math.min(timeoutMs, 10000) }).catch(() => {}),
        page.waitForTimeout(3500),
      ]);
      // Dismiss OneTrust cookie banner if it is covering controls.
      try {
        const accept = page.locator("#onetrust-accept-btn-handler");
        if (await accept.isVisible({ timeout: 500 })) await accept.click({ timeout: 1500 });
      } catch { /* banner absent */ }
      return {
        async snapshot() {
          return { html: await page.content(), httpStatus, url: page.url(), title: await page.title() };
        },
        async clickSlot(selector, targetLabel) {
          const base = page.locator(selector);
          const count = await base.count();
          if (count === 0) return false;
          if (targetLabel) {
            const exact = base.filter({ hasText: targetLabel }).first();
            if (await exact.count()) {
              await exact.click({ timeout: timeoutMs });
              return true;
            }
            return false;
          }
          await base.first().click({ timeout: timeoutMs });
          return true;
        },
        async clickOptional(selector, waitMs = 2500) {
          try {
            const loc = page.locator(selector).first();
            await loc.waitFor({ state: "visible", timeout: waitMs });
            await loc.click({ timeout: Math.min(timeoutMs, 5000) });
            return true;
          } catch {
            return false;
          }
        },
        async waitForSettled(waitSelector = null, waitMs = 6000) {
          if (waitSelector) {
            await page.waitForSelector(waitSelector, { timeout: waitMs }).catch(() => {});
          } else {
            await page.waitForLoadState("networkidle", { timeout: Math.min(waitMs, 4000) }).catch(() => {});
            await page.waitForTimeout(1500);
          }
        },
        fill(selector, value) { return page.locator(selector).first().fill(value, { timeout: timeoutMs }); },
        click(selector) { return page.locator(selector).first().click({ timeout: timeoutMs }); },
        url() { return page.url(); },
      };
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
