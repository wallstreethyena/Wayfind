#!/usr/bin/env node
// Gate: ExploreBridge (the explore-bridge-v1 treatment) is painted at its final
// size before hydration, for the treatment arm only, with the experiment's
// assignment untouched (#1602, 2026-10-01).
//
// The defect: the bridge rendered null on the server and was inserted at
// hydration, after the browser had painted the guide, shoving the partner rail
// and pick 1 down under a reader who was already there. The repair server-
// renders the markup behind a CSS gate opened by a pre-paint script
// (lib/exploreBridgeGate.js). This guard proves, by CALLING things:
//   1. the pre-paint script picks EXACTLY the arm recordExposure() returns —
//      fresh ids, sticky stored arms, automation, broken storage;
//   2. the real server render of the pages' bridge contains the gated markup,
//      the gate CSS and the script, in that order before the aside;
//   3. in real Chromium, the treatment block occupies its final space at first
//      paint, control/automation occupy none, and the client's post-hydration
//      step (release taps / drop the hidden block) moves nothing below it.
// Run with --require-browser in merge CI (Chromium is installed there).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { EXPERIMENT_KEY, recordExposure, variantForId } from "../lib/experiment.js";
import { BRIDGE_ARM_ATTR, EXPLORE_BRIDGE_GATE_CSS, exploreBridgeGateScript } from "../lib/exploreBridgeGate.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Merge CI installs Chromium before the guard suite, so the rendered half
// runs there; browser-free deploy images (Vercel prebuild) print NOT RUN.
const REQUIRE_BROWSER = process.argv.includes("--require-browser");
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const SCRIPT = exploreBridgeGateScript();
const A = "wf_exp_" + EXPERIMENT_KEY;
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

function store(init) {
  const m = new Map(Object.entries(init || {}));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
// Run the pre-paint script exactly as the browser does, in an isolated realm.
function runGate({ local, nav, uuid }) {
  const attrs = {};
  const win = { localStorage: local, crypto: uuid ? { randomUUID: () => uuid } : undefined };
  const ctx = vm.createContext({
    window: win, navigator: nav, document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
    String, Math, Date, Array, Uint32Array,
  });
  vm.runInContext(SCRIPT, ctx);
  return attrs[BRIDGE_ARM_ATTR] || null;
}
// What the client decides at mount, through the real exported function.
function runExposure({ local, nav }) {
  const prevWin = globalThis.window;
  globalThis.window = { localStorage: local, sessionStorage: store() };
  try {
    return recordExposure({ entry_page: "/guides/x", page_type: "guide" }, () => {}, { navigator: nav, sessionId: "s1", posthog: { register() {}, capture() {} } });
  } finally { globalThis.window = prevWin; }
}
const human = { webdriver: false, userAgent: PHONE_UA };

/* 1. assignment equivalence ─────────────────────────────────────────────── */
{
  let t = 0, agreed = 0;
  for (let i = 0; i < 4000; i++) {
    const id = "id-" + i + "-" + ((i * 2654435761) >>> 0).toString(16);
    const gateStore = store({ wf_exp_id: id });
    const gate = runGate({ local: gateStore, nav: human });
    const client = runExposure({ local: store({ wf_exp_id: id }), nav: human });
    assert.equal(gate, client, `pre-paint arm disagrees with recordExposure for ${id}`);
    assert.equal(gate, variantForId(id, EXPERIMENT_KEY), `pre-paint arm disagrees with variantForId for ${id}`);
    assert.equal(gateStore.getItem(A), gate, "the script writes the sticky arm exactly as getVariant() would");
    if (gate === "treatment") t++;
    agreed++;
  }
  ok(agreed === 4000, `4000 fresh ids: pre-paint arm === recordExposure() === variantForId() (${agreed} agreed)`);
  ok(t > 1800 && t < 2200, `the 50/50 split is preserved (${t}/4000 treatment)`);

  for (const sticky of ["control", "treatment"]) {
    // pick an id whose HASH says the opposite arm, so stickiness is what decides
    let id = 0; while (variantForId("s" + id, EXPERIMENT_KEY) === sticky) id++;
    const g = runGate({ local: store({ wf_exp_id: "s" + id, [A]: sticky }), nav: human });
    const c = runExposure({ local: store({ wf_exp_id: "s" + id, [A]: sticky }), nav: human });
    ok(g === sticky && c === sticky, `a stored ${sticky} arm wins over the hash in both (gate=${g}, client=${c})`);
  }

  const fresh = store();
  const g = runGate({ local: fresh, nav: human, uuid: "1f0c2a4e-0000-4000-8000-00000000abcd" });
  ok(fresh.getItem("wf_exp_id") === "1f0c2a4e-0000-4000-8000-00000000abcd", "a first visit gets a persistent id, created the way randomId() creates it");
  ok(g === runExposure({ local: fresh, nav: human }), "…and the client, reading that id later, lands in the same arm");

  for (const nav of [{ webdriver: true, userAgent: PHONE_UA }, { webdriver: false, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }, { webdriver: false, userAgent: "HeadlessChrome/120" }]) {
    const s = store({ wf_exp_id: "auto" });
    ok(runGate({ local: s, nav }) === null && runExposure({ local: store({ wf_exp_id: "auto" }), nav }) === null,
      "automation enters neither arm in either path: " + nav.userAgent.slice(0, 30));
    ok(!s.m.has(A), "…and the script writes nothing for automation");
  }
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  ok(runGate({ local: broken, nav: human }) === null, "storage that throws: no arm, no exception (control markup stays hidden)");
}

/* 2. the real server render ─────────────────────────────────────────────── */
const mod = await loadComponent(path.join(ROOT, "app/components/ExploreBridgeGate.js"), ROOT);
const Gate = mod.default;
const PICKS = [
  { id: "ChIJfixture0000001", name: "Fixture Springs", rating: 4.7, reviews: 1820, distMi: 3.2, openNow: true, photoRef: null, reason: "Clear water and a shaded boardwalk." },
  { id: "ChIJfixture0000002", name: "Fixture Museum", rating: 4.6, reviews: 950, distMi: 5.1, openNow: false, photoRef: null, reason: null },
  { id: "ChIJfixture0000003", name: "Fixture Market", rating: 4.5, reviews: 400, distMi: 1.4, openNow: true, photoRef: null, reason: "Local stalls." },
];
const CITY = { name: "Orlando", state: "FL", lat: 28.54, lng: -81.38 };
const html = renderToStaticMarkup(React.createElement(Gate, { city: CITY, picks: PICKS, entryPage: "/guides/fixture", pageType: "guide" }));
const iStyle = html.indexOf("<style>"), iScript = html.indexOf("<script>"), iAside = html.indexOf("<aside data-explore-bridge");
ok(iAside >= 0, "the bridge markup is SERVER-rendered (it used to be null until hydration — the #1602 jump)");
ok(iStyle >= 0 && iScript > iStyle && iAside > iScript, "gate CSS, then the pre-paint script, then the aside — so the arm is set before the parser reaches the block");
ok(html.includes(EXPLORE_BRIDGE_GATE_CSS.replace(/"/g, "&quot;")) || html.includes(EXPLORE_BRIDGE_GATE_CSS), "the gate CSS is emitted verbatim");
ok(!/data-ready/.test(html.slice(iAside, iAside + 300)), "server markup is inert (no data-ready) until the client records exposure");
ok(/^<aside[^>]*\sinert(?:=(?:""|"inert"))?[\s>]/.test(html.slice(iAside, iAside + 400)), "server markup carries `inert`: no tap, Tab or Enter reaches a link before exposure is recorded");
for (const p of PICKS) ok(html.includes(p.name), "the server render carries pick: " + p.name);
ok(html.includes("What are you looking for in Orlando?"), "the treatment's content is unchanged");
for (const page of ["app/guides/[slug]/page.js", "app/culture/[metro]/page.js"]) {
  const src = readFileSync(path.join(ROOT, page), "utf8");
  const imp = src.match(/import\s+ExploreBridge\s+from\s+"([^"]+)"/);
  ok(imp && /components\/ExploreBridgeGate$/.test(imp[1]), `${page} mounts the bridge THROUGH the gate (a raw import re-opens #1602)`);
  ok((src.match(/<ExploreBridge[\s/>]/g) || []).length === 1, `${page} renders the bridge exactly once`);
}

/* 3. real Chromium: first paint already has the final layout ─────────────── */
let chromium = null;
try { ({ chromium } = await import("@playwright/test")); } catch (e) {}
// Merge CI installs Playwright's own Chromium; sandboxes may only have a
// system build at a fixed path.
const EXE = chromium ? [chromium.executablePath(), "/opt/pw-browsers/chromium"].find((p) => p && existsSync(p)) : null;
if (!EXE) {
  assert.ok(!REQUIRE_BROWSER, "Chromium is required for merge verification (--require-browser)");
  console.log(`test-explore-bridge-gate: OK — ${pass} assertions (BROWSER CHECK NOT RUN: Chromium unavailable; merge CI runs it with --require-browser)`);
  process.exit(0);
}
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font:16px system-ui"><p id="intro" style="height:300px;margin:0">intro</p>${html}<h2 id="pick1" style="margin:0">pick 1</h2><div style="height:3000px"></div>
<script>window.__first=Math.round(document.getElementById('pick1').getBoundingClientRect().top+scrollY);</script></body></html>`;
const browser = await chromium.launch({ headless: true, executablePath: EXE });
const measured = {};
try {
  for (const [label, seed, ua, webdriver] of [
    ["treatment", "treatment", PHONE_UA, false],
    ["control", "control", PHONE_UA, false],
    ["automation", "treatment", "Mozilla/5.0 HeadlessChrome/120", true],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
    // This page is a local fixture on a fake origin; nothing here can reach any
    // analytics endpoint. webdriver is set per case so the automation case is
    // genuinely automated and the human cases genuinely are not.
    await ctx.addInitScript(([s, a, wd]) => {
      Object.defineProperty(navigator, "webdriver", { get: () => wd });
      localStorage.setItem("wf_exp_id", "fixture"); localStorage.setItem(a, s);
    }, [seed, A, webdriver]);
    await ctx.route("http://bridge.test/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: PAGE }));
    await ctx.route(/^(?!http:\/\/bridge\.test\/)/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto("http://bridge.test/", { waitUntil: "domcontentloaded" });
    const r = await page.evaluate((label) => {
      const aside = document.querySelector("aside[data-explore-bridge]");
      const first = window.__first;
      const asideH = aside ? Math.round(aside.getBoundingClientRect().height) : 0;
      const tapsBefore = aside ? getComputedStyle(aside).pointerEvents : "none";
      // Keyboard: can a link inside the block take focus before exposure?
      const link = aside && aside.querySelector("a");
      if (link) link.focus();
      const focusBefore = !!link && document.activeElement === link;
      // What ExploreBridge does after its layout effect resolves the arm:
      if (label === "treatment") { aside.setAttribute("data-ready", ""); aside.removeAttribute("inert"); } else aside.remove();
      if (label === "treatment" && link) link.focus();
      const focusAfter = label === "treatment" && !!link && document.activeElement === link;
      const after = Math.round(document.getElementById("pick1").getBoundingClientRect().top + scrollY);
      const tapsAfter = label === "treatment" ? getComputedStyle(aside).pointerEvents : "n/a";
      return { arm: document.documentElement.getAttribute("data-wf-bridge"), first, after, asideH, tapsBefore, tapsAfter, focusBefore, focusAfter, innerWidth };
    }, label);
    measured[label] = r;
    await ctx.close();
  }
} finally { await browser.close(); }
const { treatment: T, control: C, automation: X } = measured;
ok(T.innerWidth === 390 && C.innerWidth === 390, "measured at a real 390px viewport");
ok(T.arm === "treatment" && C.arm === "control" && X.arm === null, `the pre-paint script ran in the browser (treatment=${T.arm}, control=${C.arm}, automation=${X.arm})`);
ok(T.asideH > 150, `treatment: the bridge occupies its space at FIRST PAINT (${T.asideH}px)`);
ok(T.first === T.after, `treatment: pick 1 does not move when the client resolves (${T.first} → ${T.after})`);
ok(T.tapsBefore === "none" && T.tapsAfter === "auto", "treatment: no taps before exposure is recorded, normal taps after");
ok(T.focusBefore === false && T.focusAfter === true, `treatment: keyboard cannot reach a bridge link before exposure (focus=${T.focusBefore}), and can after (focus=${T.focusAfter})`);
ok(C.asideH === 0 && C.first === C.after && C.first === X.first, `control: nothing visible and nothing moves (${C.first} → ${C.after})`);
ok(X.asideH === 0 && X.first === X.after, "automation: nothing visible and nothing moves");
console.log(`test-explore-bridge-gate: OK — ${pass} assertions (4000-id CALL equivalence vs recordExposure; real server render; Chromium 390px: treatment ${T.asideH}px painted at first paint, pick 1 ${T.first}→${T.after}; control ${C.first}→${C.after})`);
