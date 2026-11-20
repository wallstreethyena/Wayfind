// Playwright against a local static server. OpenTable, Resy and Tock are never contacted.
// Every document request for a non-local host is fulfilled from the synthetic fixture.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createMemoryStore } from "../lib/bookingAgent/memoryStore.js";
import { runNext } from "../lib/bookingAgent/run.js";
import { AGENT_UA } from "../lib/bookingAgent/constants.js";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-booking-agent-browser: FAIL - " + msg); } };

const FIX = "tests/fixtures/booking-agent/opentable/";
const file = (name) => readFileSync(FIX + name, "utf8");
const PROFILE = { first_name: "Ada", last_name: "Lovelace", mobile_phone: "+19415550198", preferred_email: "ada.lovelace@example.com", consent_at: "2026-11-01T00:00:00Z" };
const ON = { BOOKING_AGENT_ENABLED: "1", BOOKING_AGENT_SITE_OPENTABLE: "1" };
const USER = "11111111-1111-4111-8111-111111111111";
const PLACE = "ChIJsyntheticgrill01";
const NOW = Date.parse("2026-11-17T15:00:00Z");
const BLOCKED = new Set(["www.opentable.com", "opentable.com", "resy.com", "www.resy.com", "exploretock.com", "www.exploretock.com"]);

const server = createServer((req, res) => {
  const name = String(req.url || "/").replace(/^\//, "").split("?")[0];
  if (!/^[a-z0-9.-]+\.html$/.test(name)) { res.writeHead(404); res.end(); return; }
  try {
    const body = file(name);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const local = await fetch(`http://127.0.0.1:${port}/guest-form.html`);
const localText = await local.text();
ok(local.status === 200 && localText.includes("SYNTHETIC") && localText.includes("data-synthetic=\"first-name\""), "the local server serves the synthetic guest form");

const chrome = ["/opt/google/chrome/chrome", "/usr/bin/google-chrome"].find((p) => existsSync(p));
let bundled = "";
try { bundled = chromium.executablePath(); } catch { bundled = ""; }
const executablePath = (bundled && existsSync(bundled)) ? bundled : chrome;
if (!executablePath) {
  server.close();
  if (failed) { console.error(`test-booking-agent-browser: ${failed} of ${count} assertions failed`); process.exit(1); }
  console.log(`test-booking-agent-browser: OK - ${count} assertions (local server). BROWSER NOT RUN: Chromium unavailable.`);
  process.exit(0);
} else {
  const browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
  try {
    for (const [fixture, expectStatus] of [["guest-form-submits.html", "confirmed"], ["recaptcha.html", "handback:challenge"]]) {
      const continued = [];
      const context = await browser.newContext({ userAgent: AGENT_UA });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        if (BLOCKED.has(u.hostname)) {
          const body = await (await fetch(`http://127.0.0.1:${port}/${fixture}`)).text();
          await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
          return;
        }
        continued.push(u.hostname);
        await route.abort();
      });
      const session = {
        userAgent: AGENT_UA,
        async open(url) {
          ok(new URL(url).hostname === "www.opentable.com", "the worker asks for the OpenTable handoff URL");
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
          return {
            async snapshot() { return { html: await page.content(), httpStatus: 200, url: page.url(), title: await page.title() }; },
            fill(sel, value) { return page.fill(sel, value, { timeout: 5000 }); },
            click(sel) { return page.click(sel, { timeout: 5000 }); },
            url() { return page.url(); },
          };
        },
        async close() { try { await context.close(); } catch { /* already closed by the runner */ } },
      };
      const store = createMemoryStore({ status: "on" });
      await store.insertRun({
        user_id: USER, place_id: PLACE, site: "opentable", external_id: "100001",
        date: "2026-11-20", time: "19:00", party: 4, idempotency_key: randomUUID(),
        status: "queued", consent_version: "agent-consent-v1", consent_at: "2026-11-17T15:00:00.000Z",
        selector_map_version: "opentable.v1", sms_consent: false,
      });
      const logs = [];
      const out = await runNext({
        store, env: ON, now: () => NOW, launch: async () => session,
        loadProfile: async () => PROFILE, placeName: async () => "Synthetic Grill",
        log: (line) => logs.push(line), stepTimeoutMs: 8000, runTimeoutMs: 20000,
      });
      ok(out.status === expectStatus, fixture + " via Playwright ended " + out.status);
      ok(continued.length === 0, fixture + " continued no request off the fixture: " + continued.join(","));
      ok(!logs.join("\n").includes("ada.lovelace") && !logs.join("\n").includes("?"), fixture + " logs stay redacted");
    }
  } finally {
    await browser.close();
  }
}

server.close();
if (failed) { console.error(`test-booking-agent-browser: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-booking-agent-browser: OK - ${count} assertions (local server, Playwright, no live booking site)`);
