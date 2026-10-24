#!/usr/bin/env node
// scripts/test-mobile-header-fit.mjs — THE PHONE HEADER MUST NEVER CLIP A WORD.
//
// 2026-10-23, live gowayfind.com at 390px (owner screenshot): the category row
// showed "Stays" as a bare icon with Shopping out of sight, the quick bar cut
// "Events" to "Even", and Events-screen cards cut their facts line ("Check ad…").
// Every one is a LAYOUT fact that exists only after CSS resolves at a real
// width, so this renders into real Chromium at 360, 390 and 430 and measures.
//
// ROOT CAUSES
//   - .wf-navtabs / .wf-dests / .wf-catrow scroll sideways but nothing said so,
//     and the 12-13px chip spacing left the 5th/6th label (and "Events") behind
//     the edge. Fixed with tighter phone spacing + a visible edge fade
//     (.wf-edgefade, driven by app/components/EdgeFade.js).
//   - .wf-place-card-meta was white-space:nowrap + overflow:hidden, so a venue +
//     price + source line was hard-clipped. It now wraps.
//
// WHAT IT ASSERTS (bounding boxes, not substrings)
//   1. Category row: Food..Family fully visible at 360; Food..Stays at 390/430.
//   2. Quick bar: Favorites, Itinerary, Events fully visible at all three widths.
//   3. A row that still scrolls must show an ACTIVE fade (computed mask-image),
//      and scrolled to its end every label is reachable and fully visible.
//   4. Event-card facts line: every fact fully inside the card, nothing clipped
//      (scrollHeight/scrollWidth), CTA still inside the card, height unchanged.
//   5. Source: home.js wires wf-edgefade + useEdgeFade onto all three rows.
// Positive controls: the probes must find 6 category labels, >=4 quick-bar labels
// and 2 cards, or the check reads as broken rather than clean.
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { CATEGORY_TILES } from "../lib/categories.js";
import { PLACE_CARD_HEIGHT_PX } from "../lib/placeCardStandard.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const failures = [];
const ok = (c, m) => { pass++; if (!c) failures.push(m); };
// Whole-line // comments and {/* JSX */} comments only: a naive /* */ strip eats code
// when a string holds "/*" (an API glob), which silently blinds every probe below.
const stripComments = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- 5. source wiring -------------------------------------------------------
const home = stripComments(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
ok(/import\s*\{\s*useEdgeFade\s*\}\s*from\s*"\.\/components\/EdgeFade"/.test(home), "home.js imports useEdgeFade");
ok((home.match(/useEdgeFade\(/g) || []).length === 3, "home.js calls useEdgeFade for exactly the three scrolling rows");
ok(/className="wf-navtabs"\s+ref=\{navTabsRef\}/.test(home) && /useEdgeFade\(navTabsRef\)/.test(home), "category tabs row is wired to useEdgeFade");
ok(/className="wf-catrow"\s+ref=\{catRowRef\}/.test(home) && /useEdgeFade\(catRowRef\)/.test(home), "browse category row is wired to useEdgeFade");
ok(/<nav className="wf-dests"\s+ref=\{destsRef\}/.test(home) && /useEdgeFade\(destsRef\)/.test(home), "quick bar is wired to useEdgeFade");
const fadeSrc = stripComments(readFileSync(path.join(ROOT, "app/components/EdgeFade.js"), "utf8"));
ok(/classList\.add\("wf-edgefade"\)/.test(fadeSrc) && /setAttribute\("data-fade"/.test(fadeSrc), "hook adds wf-edgefade and writes data-fade");
const labels = [...home.matchAll(/WF_DESTINATIONS = \[([\s\S]*?)\];/g)][0]?.[1].match(/label: "([^"]+)"/g)?.map((m) => m.slice(8, -1)) || [];
ok(labels.length >= 4 && labels[0] === "Favorites" && labels[1] === "Itinerary" && labels[2] === "Events", "quick bar still leads Favorites, Itinerary, Events (fixture mirrors the real order)");

// ---- real CSS + real card ---------------------------------------------------
const { edgeFadeState } = await loadComponent(path.join(ROOT, "app/components/EdgeFade.js"), ROOT);
const { WF_LAYOUT_CSS, WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const compact = String(WF_LAYOUT_CSS).replace(/\s+/g, "");
ok(/\.wf-edgefade\[data-fade="end"\]\{[^}]*mask-image:linear-gradient/.test(compact), "fade-at-end rule exists");
ok(/\.wf-edgefade\[data-fade="start"\]\{[^}]*mask-image:linear-gradient/.test(compact), "fade-at-start rule exists");
ok(/\.wf-edgefade\[data-fade="both"\]\{[^}]*mask-image:linear-gradient/.test(compact), "fade-both rule exists");
const Rail = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
const card = (n, facts) => React.createElement(Rail, { key: n, title: "Sample Event Number " + n + " at the Park", eyebrow: "Community", when: { label: "TOMORROW", value: "7:00 PM", tone: "later" }, facts, href: "/events/e" + n, chips: [{ key: "venue", icon: "P", label: "Robinson Preserve" }], cta: { label: "Explore event", href: "/events/e" + n }, actionItem: { id: "e" + n, type: "event", title: "x", url: "/x" } });
const cardsHtml = renderToStaticMarkup(React.createElement("div", { className: "wf-rail", style: { display: "flex", gap: 10, overflow: "hidden" } },
  card(1, ["Robinson Preserve Nature Center", "Check admission", "via Eventbrite"]),
  card(2, ["Mallory Square Waterfront", "Check ticket price", "via Ticketmaster"])));

const icon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/></svg>';
const tabsHtml = `<div class="wf-navtabs wf-edgefade" id="tabs">${CATEGORY_TILES.map((m) => `<a class="wf-navtab" href="#">${icon}<span>${m.label}</span></a>`).join("")}</div>`;
const destNames = ["Favorites", "Itinerary", "Events", "Coupons", "Map", "Feedback"];
const destsHtml = `<div class="wf-dest-row"><nav class="wf-dests wf-edgefade" id="dests">${destNames.map((n) => `<a class="wf-dest" href="#">${icon}<span>${n}</span></a>`).join("")}</nav><button class="wf-dest wf-dest-opener">${icon}<span>Shortcuts</span></button></div>`;

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
let options = null;
if (chromium) {
  try { if (existsSync(chromium.executablePath())) options = {}; } catch {}
  if (!options && existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome")) options = { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] };
  if (!options && process.platform === "darwin") options = {};
}
let measured = false;
if (!options) {
  console.log("  RENDERED CHECK NOT RUN — Chromium is unavailable; only source assertions ran");
} else {
  const dir = mkdtempSync(path.join(ROOT, ".wf-hdr-"));
  const file = path.join(dir, "fixture.html");
  // Production text is Inter (app/fonts.js). A fixture that falls back to whatever the
  // machine has measures a different font on every box (CI has no Inter and is wider), so
  // the same three Inter weights the header uses are embedded from scripts/fixtures/fonts.
  const fontUrl = (f) => "file://" + path.join(ROOT, "scripts/fixtures/fonts", f);
  const faces = [[400, "Inter-Regular-ascii.woff"], [600, "Inter-SemiBold-ascii.woff"], [800, "Inter-ExtraBold-ascii.woff"]]
    .map(([w, f]) => `@font-face{font-family:WfFixtureInter;font-weight:${w === 800 ? "700 900" : w === 600 ? "500 699" : "100 499"};src:url("${fontUrl(f)}") format("woff")}`).join("");
  writeFileSync(file, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}*{box-sizing:border-box}body{margin:0;padding:0 14px;background:#05080f;color:#fff;font-family:WfFixtureInter,sans-serif}button,input{font-family:inherit}${WF_LAYOUT_CSS}${WF_PLACE_CARD_CSS}</style><body>${tabsHtml}${destsHtml}<div style="height:12px"></div>${cardsHtml}`);
  const browser = await chromium.launch(options);
  measured = true;
  const fnSrc = edgeFadeState.toString();
  try {
    for (const width of [360, 390, 430]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto("file://" + file);
      await page.evaluate(() => document.fonts.ready);
      const fontsOk = await page.evaluate(() => ["400", "600", "800"].every((w) => document.fonts.check(w + " 13px WfFixtureInter")) && [...document.fonts].filter((f) => f.status === "loaded").length >= 3);
      ok(fontsOk, `${width}px: the embedded Inter weights loaded (otherwise every width below is measured in a fallback font)`);
      const m = await page.evaluate((src) => {
        const edgeFadeState = new Function("return (" + src + ")")();
        const fully = (row, sel, atEnd) => {
          if (atEnd) row.scrollLeft = row.scrollWidth;
          const r = row.getBoundingClientRect();
          return [...row.querySelectorAll(sel)].map((e) => { const b = e.getBoundingClientRect(); return { t: e.textContent.trim(), fit: b.left >= r.left - 1.5 && b.right <= r.right + 1.5 }; });
        };
        const rows = {};
        for (const [key, id, sel] of [["tabs", "tabs", ".wf-navtab"], ["dests", "dests", ".wf-dest"]]) {
          const row = document.getElementById(id);
          row.scrollLeft = 0;
          row.setAttribute("data-fade", edgeFadeState(row));
          const start = fully(row, sel, false);
          const startMask = getComputedStyle(row).maskImage || getComputedStyle(row).webkitMaskImage || "none";
          const startState = row.getAttribute("data-fade");
          const end = fully(row, sel, true);
          row.setAttribute("data-fade", edgeFadeState(row));
          rows[key] = { start, startMask, startState, end, endState: row.getAttribute("data-fade"), scrolls: row.scrollWidth > row.clientWidth + 2 };
          row.scrollLeft = 0;
        }
        const cards = [...document.querySelectorAll(".wf-place-card")].map((c) => {
          const meta = c.querySelector(".wf-place-card-meta"); const cta = c.querySelector(".wf-rail-card-cta");
          const cr = c.getBoundingClientRect(); const mr = meta.getBoundingClientRect();
          return {
            h: cr.height,
            facts: [...meta.children].map((s) => { const b = s.getBoundingClientRect(); return { t: s.textContent, fit: b.left >= mr.left - 0.5 && b.right <= mr.right + 0.5 && s.scrollWidth <= s.clientWidth + 1 }; }),
            clipped: meta.scrollWidth > meta.clientWidth + 1 || meta.scrollHeight > meta.clientHeight + 1,
            ctaInside: cta ? cta.getBoundingClientRect().bottom <= cr.bottom + 0.5 : null,
          };
        });
        return { rows, cards };
      }, fnSrc);
      await ctx.close();
      const need = (list, n) => list.slice(0, n);
      const tabsNeed = width <= 360 ? 4 : 5;
      ok(m.rows.tabs.start.length === CATEGORY_TILES.length, `${width}px: probe found all ${CATEGORY_TILES.length} category labels`);
      need(m.rows.tabs.start, tabsNeed).forEach((x) => ok(x.fit, `${width}px: category "${x.t}" is cut off at the row edge (must be fully readable)`));
      ok(m.rows.dests.start.length >= 4, `${width}px: probe found the quick-bar labels`);
      need(m.rows.dests.start, 3).forEach((x) => ok(x.fit, `${width}px: quick bar "${x.t}" is cut off (Events must not read "Even")`));
      for (const key of ["tabs", "dests"]) {
        const r = m.rows[key];
        const anyCut = r.start.some((x) => !x.fit);
        if (anyCut) ok(r.scrolls && r.startState !== "none" && /gradient/.test(r.startMask), `${width}px: ${key} row hides a label but shows no active edge fade (mask "${r.startMask}", state ${r.startState})`);
        ok(r.end[r.end.length - 1].fit, `${width}px: ${key} last label "${r.end[r.end.length - 1].t}" is unreachable when scrolled to the end`);
        if (r.scrolls) ok(r.endState === "start", `${width}px: ${key} fade state at the scroll end is "${r.endState}", expected "start"`);
      }
      ok(m.cards.length === 2, `${width}px: probe found both event cards`);
      m.cards.forEach((c, i) => {
        ok(Math.abs(c.h - PLACE_CARD_HEIGHT_PX) <= 0.5, `${width}px: card ${i + 1} keeps the canonical height (${c.h})`);
        c.facts.forEach((f) => ok(f.fit, `${width}px: card ${i + 1} fact "${f.t}" is clipped by the facts line`));
        ok(!c.clipped, `${width}px: card ${i + 1} facts line hides overflow (hard clip)`);
        ok(c.ctaInside !== false, `${width}px: card ${i + 1} CTA was pushed out of the card`);
      });
    }
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
if (failures.length) {
  console.error("test-mobile-header-fit: FAIL");
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(measured
  ? `test-mobile-header-fit: OK — ${pass} assertions; category row, quick bar and event-card facts measured at 360/390/430`
  : `test-mobile-header-fit: OK (SOURCE ONLY) — ${pass} assertions; no rendered measurement was performed`);
