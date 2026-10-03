#!/usr/bin/env node
/**
 * verify-guide-pick-photos-prod — MANUAL release check (not part of the build,
 * not a guard: it needs the live network). Opens the real guide pages in a
 * real Chromium through that machine's NORMAL network path with NORMAL TLS
 * verification — no request interception, no certificate exceptions — and
 * checks every target in a targets file at desktop (1280px) and a real 390px
 * mobile viewport.
 *
 *   node scripts/verify-guide-pick-photos-prod.mjs [targets.json] [--out <dir>] [--base-url <url>]
 *
 * Default targets: data/guide-pick-photos/_reports/release-1575-prod-targets.json
 * (PR #1575: the 19 new photos, 2 shared photos that must remain, and 4 picks
 * whose photo was deliberately rejected). Default base: https://www.gowayfind.com.
 * Optional env: CHROMIUM_PATH (a Chromium binary); HTTPS_PROXY is honoured as
 * the machine's normal proxy.
 *
 * Per target and viewport it asserts:
 *   new       → image in that pick's section decodes with real dimensions, is the
 *               committed file, shows the credit, links the licence and the
 *               source, and "Photo details" opens
 *   shared    → an image still renders and decodes
 *   rejected  → NO image renders in that section
 *   every row → the section heading names the pick; mobile innerWidth is 390
 *               and the page has no horizontal overflow; a page that fails to
 *               load is a FAILURE, never skipped
 * Screenshots of every section land in --out for the human crop review
 * (subject visible, nothing important cut off) that no script can do.
 *
 * A pass proves the photo loads and is credited. It does NOT prove a place
 * still looks like an older photo (e.g. the 2010 Bishop Museum entrance) —
 * that is what the caption's year disclosure is for.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const targetsFile = positional[0] || "data/guide-pick-photos/_reports/release-1575-prod-targets.json";
const OUT = opt("--out", "tmp/guide-photo-prod-verify");
const BASE = opt("--base-url", "https://www.gowayfind.com").replace(/\/$/, "");
const targets = JSON.parse(fs.readFileSync(targetsFile, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const px = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
const proxy = px ? { server: `${px.protocol}//${px.host}`, ...(px.username ? { username: decodeURIComponent(px.username), password: decodeURIComponent(px.password) } : {}) } : undefined;
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), ...(proxy ? { proxy } : {}) });
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const results = [];
const bySlug = new Map();
for (const t of targets) (bySlug.get(t.slug) || bySlug.set(t.slug, []).get(t.slug)).push(t);
for (const [slug, list] of bySlug) {
  for (const vp of [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.name === "mobile" ? 2 : 1 });
    const errors = []; const imgFailures = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
    page.on("requestfailed", (r) => { if (r.resourceType() === "image") imgFailures.push(`${r.url()} ${r.failure()?.errorText || ""}`); });
    let resp = null, loadError = null;
    try { resp = await page.goto(`${BASE}/guides/${slug}`, { waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) { loadError = e.message.split("\n")[0]; }
    if (!loadError && resp && resp.status() >= 400) loadError = `HTTP ${resp.status()}`;
    if (loadError) { for (const t of list) results.push({ ...t, viewport: vp.name, loadError }); await page.close(); continue; }
    const innerWidth = await page.evaluate(() => innerWidth);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    for (const t of list) {
      const sec = page.locator(`#pick-${t.n}`);
      if (!(await sec.count())) { results.push({ ...t, viewport: vp.name, loadError: `section #pick-${t.n} not found` }); continue; }
      await sec.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const info = await sec.evaluate(async (el) => {
        const img = el.querySelector("figure img");
        const heading = (el.querySelector("h2,h3")?.textContent || "").trim();
        if (!img) return { heading, hasImg: false };
        if (!img.complete) await new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 15000); });
        let decoded = false; try { await img.decode(); decoded = true; } catch {}
        const fig = img.closest("figure");
        const d = fig?.querySelector("details"); const s = d?.querySelector("summary");
        let detailsOpened = null;
        if (d && s) { s.click(); await new Promise((r) => setTimeout(r, 150)); detailsOpened = d.open && d.innerText.length > s.innerText.length + 10; s.click(); }
        const r = img.getBoundingClientRect();
        return { heading, hasImg: true, currentSrc: img.currentSrc, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, decoded,
          renderedW: Math.round(r.width), renderedH: Math.round(r.height), objectPosition: getComputedStyle(img).objectPosition,
          figText: fig ? fig.innerText : "", detailsOpened, links: fig ? [...fig.querySelectorAll("a[href]")].map((a) => a.href) : [] };
      });
      const shot = `${OUT}/${slug}--pick-${t.n}--${vp.name}.png`;
      await sec.screenshot({ path: shot }).catch(() => {});
      results.push({ ...t, viewport: vp.name, status: resp?.status(), innerWidth, overflowX, ...info, shot, imgFailures: [...imgFailures], errors: [...errors] });
    }
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));

const fail = [];
for (const r of results) {
  const tag = `${r.slug}#${r.n} "${r.pick}" [${r.viewport}]`;
  if (r.loadError) { fail.push(`PAGE/SECTION LOAD FAILED: ${tag} ${r.loadError}`); continue; }
  if (!norm(r.heading).includes(norm(r.pick).slice(0, 24))) fail.push(`WRONG SECTION: ${tag} heading="${r.heading}"`);
  if (r.viewport === "mobile" && (r.innerWidth !== 390 || r.overflowX)) fail.push(`MOBILE LAYOUT: ${tag} innerWidth=${r.innerWidth} overflowX=${r.overflowX}`);
  if (r.kind === "rejected") { if (r.hasImg) fail.push(`REJECTED PHOTO RENDERED: ${tag} ${r.currentSrc}`); continue; }
  if (!r.hasImg) { fail.push(`NO IMAGE: ${tag}`); continue; }
  if (!(r.decoded && r.naturalWidth > 0 && r.naturalHeight > 0)) fail.push(`NOT DECODED: ${tag}`);
  if (r.kind !== "new") continue;
  const file = r.src.split("/").pop().replace(/\.webp$/, "");
  if (!decodeURIComponent(r.currentSrc).includes(file)) fail.push(`WRONG IMAGE: ${tag} ${r.currentSrc}`);
  if (!r.figText.includes(r.credit)) fail.push(`CREDIT MISSING: ${tag}`);
  if (!r.links.some((h) => /creativecommons\.org\/(licenses|publicdomain)\//.test(h))) fail.push(`LICENCE LINK MISSING: ${tag}`);
  if (!r.links.some((h) => /commons\.wikimedia\.org|flickr\.com/.test(h))) fail.push(`SOURCE LINK MISSING: ${tag}`);
  if (r.detailsOpened !== true) fail.push(`PHOTO DETAILS DID NOT OPEN: ${tag}`);
}
const summary = { base: BASE, targets: targets.length, rows: results.length, failures: fail,
  consoleErrors: [...new Set(results.flatMap((r) => r.errors || []))].slice(0, 20),
  imageRequestFailures: [...new Set(results.flatMap((r) => r.imgFailures || []))].slice(0, 20), screenshots: OUT };
console.log(JSON.stringify(summary, null, 1));
if (fail.length) {
  console.error(`verify-guide-pick-photos-prod: FAIL — ${fail.length} failure(s) across ${results.length} rows`);
  process.exit(1);
}
console.log(`verify-guide-pick-photos-prod: OK — ${results.length} rows (${targets.length} targets × desktop + 390px mobile); now eyeball the crops in ${OUT}`);
