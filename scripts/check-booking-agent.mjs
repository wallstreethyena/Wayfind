// Fails the build if the booking agent evades a site, hides its browser, or enters the client bundle.
// The banned list is the check. The worker and package manifests are what it scans.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BANNED = [
  "puppeteer-extra",
  "playwright-extra",
  "undetected-",
  "2captcha",
  "anticaptcha",
  "capsolver",
  "navigator.webdriver",
  "AutomationControlled",
  "fingerprint",
  "residential",
  "playwright-extra-plugin-stealth",
  // Cookie banners get the most private choice. "Accept all" is never clicked for a guest.
  "onetrust-accept-btn-handler",
];

export function findBanned(text) {
  const found = [];
  for (const word of BANNED) if (String(text).includes(word)) found.push(word);
  return found;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|json|md)$/.test(name)) out.push(p);
  }
  return out;
}

function fail(msg) {
  console.error("check-booking-agent: FAIL — " + msg);
  process.exitCode = 1;
}

function main() {
  const targets = [
    ...walk(join(ROOT, "services/booking-agent")),
    ...walk(join(ROOT, "lib/bookingAgent")),
    join(ROOT, "package.json"),
  ];
  let scanned = 0;
  for (const file of targets) {
    if (!existsSync(file)) continue;
    scanned++;
    const hit = findBanned(readFileSync(file, "utf8"));
    if (hit.length) fail(`${file.slice(ROOT.length + 1)} contains ${hit.join(", ")}`);
  }

  const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const rootDeps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
  if (rootDeps["playwright-core"] || rootDeps.puppeteer || rootDeps["puppeteer-extra"]) fail("playwright-core and puppeteer stay out of the root package.json");
  const svc = JSON.parse(readFileSync(join(ROOT, "services/booking-agent/package.json"), "utf8"));
  const svcKeys = Object.keys(svc.dependencies || {}).sort();
  if (svcKeys.join(",") !== "playwright-core") fail("services/booking-agent dependencies must be exactly playwright-core, got " + svcKeys.join(","));
  if (svc.devDependencies || svc.scripts) fail("the worker package has no scripts and no extra dev dependencies");

  const uaFile = readFileSync(join(ROOT, "lib/bookingAgent/constants.js"), "utf8");
  if (!uaFile.includes('export const AGENT_UA = "WayfindBookingAgent/0.1 (+https://www.gowayfind.com/booking-agent)"')) fail("the user agent string is not exact");

  // Honest in the cloud too (owner decision 2026-11-25, the agent runs on Vercel with Browserbase):
  // both Browserbase launchers ask for no proxy and set the Wayfind user agent on the page, and
  // runNext refuses any browser, in any mode, that reports a different user agent.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const cdpSrc = strip(readFileSync(join(ROOT, "lib/bookingAgent/cdpSession.js"), "utf8"));
  const svcSrc = strip(readFileSync(join(ROOT, "services/booking-agent/browser.js"), "utf8"));
  const runSrc = strip(readFileSync(join(ROOT, "lib/bookingAgent/run.js"), "utf8"));
  const sessionCalls = (src) => (src.match(/createBrowserbaseSession\(\{[^}]*\}/g) || []);
  for (const [name, src] of [["lib/bookingAgent/cdpSession.js", cdpSrc], ["services/booking-agent/browser.js", svcSrc]]) {
    const calls = sessionCalls(src);
    if (calls.length !== 1 || !/proxies:\s*false/.test(calls[0])) fail(`${name} must create exactly one Browserbase session with proxies: false, found ${JSON.stringify(calls)}`);
    if (!/["']Network\.setUserAgentOverride["']/.test(src)) fail(`${name} must set the Wayfind user agent on the cloud page`);
  }
  if (!/const uaOk = session\.userAgent === AGENT_UA;/.test(runSrc)) fail("lib/bookingAgent/run.js must require the exact Wayfind user agent in every browser mode");
  if (sessionCalls("createBrowserbaseSession({ apiKey, proxies: true })").length !== 1 || /proxies:\s*false/.test("createBrowserbaseSession({ apiKey, proxies: true })")) fail("the Browserbase session probe did not parse a known sample");

  const map = readFileSync(join(ROOT, "lib/bookingAgent/selectors/opentable.v1.json"), "utf8");
  if (!map.includes("PLACEHOLDER") && !map.includes("CAPTURED")) fail("the selector map must be marked PLACEHOLDER or CAPTURED");
  const readme = readFileSync(join(ROOT, "lib/bookingAgent/selectors/README.md"), "utf8");
  if (!/human (must|has to) replace/i.test(readme)) fail("the selector README must say a human replaces the placeholders");

  if (existsSync(join(ROOT, "services/booking-agent/vercel.json")) || existsSync(join(ROOT, "services/booking-agent/Dockerfile"))) fail("the worker has no deploy config");

  function walkApp(dir, out = []) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "api") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkApp(p, out);
      else if (/\.(js|mjs|jsx)$/.test(name)) out.push(p);
    }
    return out;
  }
  for (const file of walkApp(join(ROOT, "app"))) {
    const src = readFileSync(file, "utf8");
    if (/services\/booking-agent|playwright-core|bookingAgent\/run\.js|bookingAgent\/worker/.test(src)) fail(file.slice(ROOT.length + 1) + " imports the worker");
  }
  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  const layout = readFileSync(join(ROOT, "app/layout.js"), "utf8");
  const sitemap = readFileSync(join(ROOT, "app/sitemap.js"), "utf8");
  if (home.includes("/booking-agent") || layout.includes("/booking-agent") || sitemap.includes("booking-agent")) fail("the booking agent page is linked from nav, layout, or the sitemap");

  const page = readFileSync(join(ROOT, "app/booking-agent/page.js"), "utf8");
  if (!page.includes("index: false")) fail("the public page must be noindex");
  if (/[\u2013\u2014]/.test(page + readFileSync(join(ROOT, "lib/bookingAgent/copy.js"), "utf8"))) fail("user-facing booking agent copy contains an em or en dash");

  if (!findBanned("puppeteer-extra stealth").includes("puppeteer-extra")) fail("the banned-word probe did not fire on a known bad sample");

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`check-booking-agent: OK — ${scanned} worker and manifest files, banned-package probe fired`);
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-booking-agent.mjs");
if (isMain) main();
