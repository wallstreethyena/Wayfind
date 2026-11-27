#!/usr/bin/env node
// scripts/audit-live-images.mjs — WHAT DOES A VISITOR ACTUALLY SEE?
//
// Owner report 2026-11-27: "Images are missing all over ... we cannot have a
// broken site." photo-monitor.mjs measures the /api/photo placeholder rate and
// guide-visual-monitor.mjs reads guide JSON; neither opens a real page. This
// opens real pages in a real browser at phone and desktop size and counts,
// per page, what a person would see:
//
//   broken      <img> that finished loading with naturalWidth 0 (the browser's
//               broken-image icon or an empty box), plus image responses >= 400
//               and failed image requests
//   fallback    [data-photo-fallback="unavailable"] tiles (honest "no photo"
//               art: not broken, but the sourcing backlog the owner sees)
//   ok          <img> that decoded with real pixels
//
// It never calls a paid provider itself: it only loads public pages the way a
// visitor does. Run it against production (default) or a preview:
//
//   AUDIT_BASE_URL=https://www.gowayfind.com node scripts/audit-live-images.mjs
//
// Output: a JSON report (AUDIT_OUT, default live-image-audit.json) and a
// markdown summary on stdout (and in $GITHUB_STEP_SUMMARY when set).
// Exit code 0 means the instrument ran; findings never fail the run unless
// AUDIT_FAIL_ON_BROKEN=1.
import { chromium } from "@playwright/test";
import { writeFileSync, appendFileSync } from "node:fs";

const BASE = (process.env.AUDIT_BASE_URL || "https://www.gowayfind.com").replace(/\/$/, "");
const OUT = process.env.AUDIT_OUT || "live-image-audit.json";
const MAX_PAGES = Number(process.env.AUDIT_MAX_PAGES || 70);
const PER_PATTERN = Number(process.env.AUDIT_PER_PATTERN || 5);
const UA = "WayfindBot/1.0 (https://gowayfind.com) live-image-audit";

const SEEDS = [
  "/", "/christmas-in-florida", "/events", "/florida-events", "/trending", "/tonight",
  "/date-night", "/family", "/guides", "/things-to-do/sarasota", "/restaurants/sarasota",
  "/nightlife/sarasota", "/things-to-do/tampa", "/things-to-do/orlando", "/things-to-do/miami",
  "/things-to-do/st-petersburg", "/restaurants/tampa", "/restaurants/orlando", "/r/breakfast",
  "/r/locals", "/r/birthday", "/creators/cindy.selects", "/best-beaches/manatee-sarasota",
  "/new-years-in-florida", "/spring-break-in-florida", "/group-plans", "/search?q=pizza",
  "/search?q=christmas%20lights", "/coupons", "/map", "/places", "/hidden-gems", "/latest",
];

// Discovered links are bucketed by route shape so one rail of 30 place links
// does not eat the whole budget.
const PATTERNS = [
  ["place", /^\/(p|places)\/[^/?#]+/],
  ["event", /^\/events\/[^/]+\/[^/?#]+/],
  ["guide", /^\/guides\/[^/?#]+/],
  ["city", /^\/(things-to-do|restaurants|nightlife|events)\/[^/?#]+$/],
  ["rail", /^\/r\/[^/?#]+/],
  ["creator", /^\/creators\/[^/?#]+/],
  ["florida", /^\/florida\/[^/?#]+/],
  ["itinerary", /^\/itineraries\/[^/?#]+/],
];
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "desktop", width: 1366, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

function bucketOf(path) {
  for (const [name, rx] of PATTERNS) if (rx.test(path)) return name;
  return null;
}

async function scrollEverything(page) {
  // Pages scroll the window and also inner rails (horizontal scrollers).
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const h = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < h() && y < 40000; y += Math.round(window.innerHeight * 0.8)) {
      window.scrollTo(0, y);
      await sleep(220);
    }
    const rails = [...document.querySelectorAll("*")].filter((el) => {
      const s = getComputedStyle(el);
      return (s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 40;
    }).slice(0, 60);
    for (const r of rails) {
      for (let x = 0; x < r.scrollWidth && x < 12000; x += r.clientWidth) { r.scrollLeft = x; await sleep(90); }
    }
    window.scrollTo(0, 0);
  });
}

async function auditPage(context, path) {
  const page = await context.newPage();
  const badResponses = [];
  const failedRequests = [];
  page.on("response", (res) => {
    const req = res.request();
    if (req.resourceType() === "image" && res.status() >= 400) badResponses.push({ url: res.url(), status: res.status() });
  });
  page.on("requestfailed", (req) => {
    if (req.resourceType() === "image") {
      const err = req.failure()?.errorText || "failed";
      if (!/ERR_ABORTED/.test(err)) failedRequests.push({ url: req.url(), error: err });
    }
  });
  let status = 0, error = null;
  try {
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
    status = res?.status() || 0;
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await scrollEverything(page);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } catch (e) {
    error = String(e?.message || e).slice(0, 200);
  }
  let dom = { imgs: [], fallbacks: [], links: [], bgBroken: [] };
  try {
    dom = await page.evaluate(() => {
      const imgs = [...document.images].map((im) => ({
        src: im.currentSrc || im.src || "",
        alt: im.alt || "",
        complete: im.complete,
        w: im.naturalWidth,
        visible: !!(im.offsetWidth || im.offsetHeight || im.getClientRects().length),
        lazy: im.loading === "lazy",
      }));
      const fallbacks = [...document.querySelectorAll('[data-photo-fallback="unavailable"]')].map((el) => ({
        label: el.getAttribute("aria-label") || "",
        visible: !!(el.offsetWidth || el.offsetHeight),
      }));
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
      return { imgs, fallbacks, links };
    });
  } catch {}
  await page.close();
  const broken = dom.imgs.filter((i) => i.src && !i.src.startsWith("data:") && i.complete && i.w === 0 && i.visible);
  const emptySrc = dom.imgs.filter((i) => !i.src && i.visible);
  const ok = dom.imgs.filter((i) => i.complete && i.w > 0);
  return {
    path, status, error,
    images: dom.imgs.length, ok: ok.length,
    broken: broken.map((b) => ({ src: b.src.slice(0, 300), alt: b.alt.slice(0, 120) })),
    emptySrc: emptySrc.length,
    fallbacks: dom.fallbacks.filter((f) => f.visible).length,
    fallbackNames: dom.fallbacks.filter((f) => f.visible).map((f) => f.label.replace(/^Photo not available( for )?/, "")).slice(0, 40),
    badResponses: badResponses.slice(0, 40),
    failedRequests: failedRequests.slice(0, 40),
    links: dom.links,
  };
}

async function main() {
  const browser = await chromium.launch();
  const report = { base: BASE, ranAt: new Date().toISOString(), viewports: {} };
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ ...vp, userAgent: UA + " " + vp.name, viewport: { width: vp.width, height: vp.height } });
    const queue = [...SEEDS];
    const seen = new Set(queue);
    const perBucket = {};
    const pages = [];
    while (queue.length && pages.length < MAX_PAGES) {
      const path = queue.shift();
      const r = await auditPage(context, path);
      const { links, ...rest } = r;
      pages.push(rest);
      console.error(`[${vp.name}] ${path} status=${r.status} imgs=${r.images} ok=${r.ok} broken=${r.broken.length} bad=${r.badResponses.length} failed=${r.failedRequests.length} fallback=${r.fallbacks}${r.error ? " ERR " + r.error : ""}`);
      for (const href of links || []) {
        if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) continue;
        const clean = href.split("#")[0];
        const bucket = bucketOf(clean.split("?")[0]);
        if (!bucket || seen.has(clean)) continue;
        perBucket[bucket] = (perBucket[bucket] || 0) + 1;
        if (perBucket[bucket] > PER_PATTERN) continue;
        seen.add(clean);
        queue.push(clean);
      }
    }
    await context.close();
    report.viewports[vp.name] = pages;
  }
  await browser.close();
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  const lines = [`# Live image audit: ${BASE}`, `Ran ${report.ranAt}`, ""];
  for (const [vp, pages] of Object.entries(report.viewports)) {
    const sum = (k) => pages.reduce((a, p) => a + (Array.isArray(p[k]) ? p[k].length : p[k] || 0), 0);
    lines.push(`## ${vp}: ${pages.length} pages`, "",
      `- images loaded fine: ${sum("ok")} of ${sum("images")}`,
      `- broken images (visible, 0 px): ${sum("broken")}`,
      `- image responses >= 400: ${sum("badResponses")}; failed image requests: ${sum("failedRequests")}`,
      `- empty-src images: ${sum("emptySrc")}`,
      `- "no photo" fallback tiles: ${sum("fallbacks")}`, "",
      "| page | imgs | ok | broken | 4xx/5xx | failed | fallback |", "|---|---|---|---|---|---|---|");
    for (const p of pages) lines.push(`| ${p.path} | ${p.images} | ${p.ok} | ${p.broken.length} | ${p.badResponses.length} | ${p.failedRequests.length} | ${p.fallbacks} |`);
    const hosts = {};
    for (const p of pages) for (const b of [...p.broken.map((x) => x.src), ...p.badResponses.map((x) => x.url + " (" + x.status + ")"), ...p.failedRequests.map((x) => x.url + " (" + x.error + ")")]) {
      let key; try { const u = new URL(b.split(" (")[0]); key = u.host + u.pathname.split("/").slice(0, 3).join("/"); } catch { key = b.slice(0, 60); }
      hosts[key] = (hosts[key] || 0) + 1;
    }
    lines.push("", "### broken by source", "", ...Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([h, n]) => `- ${h}: ${n}`), "");
    lines.push("### sample broken", "", ...pages.flatMap((p) => [...p.broken.map((b) => `- ${p.path}: ${b.src} (${b.alt})`), ...p.badResponses.map((b) => `- ${p.path}: ${b.url} -> ${b.status}`), ...p.failedRequests.map((b) => `- ${p.path}: ${b.url} -> ${b.error}`)]).slice(0, 80), "");
  }
  const md = lines.join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  const totalBroken = Object.values(report.viewports).flat().reduce((a, p) => a + p.broken.length + p.badResponses.length, 0);
  if (process.env.AUDIT_FAIL_ON_BROKEN === "1" && totalBroken > 0) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
