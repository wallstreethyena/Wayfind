// Chromium with one honest user agent. No extra flags that hide automation.
// playwright-core is the only runtime dependency of this folder. It is not installed
// into the Next.js app and this file is not imported by any route.

import { AGENT_UA } from "../../lib/bookingAgent/constants.js";

export async function launchHonestChromium(opts = {}) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
  });
  const context = await browser.newContext({ userAgent: AGENT_UA });
  const page = await context.newPage();
  let httpStatus = 0;
  page.on("response", (res) => {
    if (res.request().resourceType() === "document") httpStatus = res.status();
  });
  return {
    userAgent: AGENT_UA,
    async open(url, { timeoutMs = 15000 } = {}) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      return {
        async snapshot() {
          return { html: await page.content(), httpStatus, url: page.url(), title: await page.title() };
        },
        fill(selector, value) { return page.fill(selector, value, { timeout: timeoutMs }); },
        click(selector) { return page.click(selector, { timeout: timeoutMs }); },
        url() { return page.url(); },
      };
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
