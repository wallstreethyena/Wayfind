#!/usr/bin/env node
// scripts/test-chunk-recovery.mjs — a failed JavaScript chunk must never leave a
// blank page, and the recovery must never loop.
//
// 2026-09-30: production served Next's bare "Application error" white page when
// one /_next/static chunk answered 502 (see lib/chunkRecovery.js). CALL-based:
// the ACTUAL inline-script string the layout renders is executed in a sandbox
// with fake DOM events, sessionStorage and a controllable clock; the real
// RecoveryScreen / app/error.js / app/global-error.js are rendered through
// scripts/lib/jsxLoad.mjs. Structural checks are limited to what cannot run
// here (the useEffect body, the root layout's placement, the import-free rule
// that keeps the boundaries off the "/" bundle budget) and are comment-stripped.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { CHUNK_MESSAGE_RX_SOURCES, RELOAD_STAMP_KEY, RELOAD_WINDOW_MS, chunkRecoveryScript, isChunkLoadError } from "../lib/chunkRecovery.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const stripComments = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. what counts as a chunk failure (the plain-JS oracle) ────────────────
const chunkErr = (message, name = "Error") => Object.assign(new Error(message), { name });
const POSITIVES = [
  chunkErr("Loading chunk 4968 failed.\n(error: https://www.gowayfind.com/_next/static/chunks/4968-2dcc614085e487b1.js)", "ChunkLoadError"), // the production message
  chunkErr("Loading chunk app-pages-internals failed."),
  chunkErr("Loading CSS chunk 311 failed. (/_next/static/css/abc.css)"),
  chunkErr("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js", "TypeError"),
  chunkErr("error loading dynamically imported module", "TypeError"),
  chunkErr("Importing a module script failed.", "TypeError"),
  Object.assign(new Error("anything"), { name: "ChunkLoadError" }),
];
const NEGATIVES = [null, undefined, "", new TypeError("Cannot read properties of undefined (reading 'map')"), new Error("Failed to fetch"), new Error("Loading places failed"), { message: 42 }];
POSITIVES.forEach((e, i) => ok(isChunkLoadError(e), `1: chunk failure #${i} (${e.name}: ${e.message.slice(0, 40)}) must be recognised`));
NEGATIVES.forEach((e, i) => ok(!isChunkLoadError(e), `1: non-chunk error #${i} must NOT be treated as a chunk failure (a real bug would auto-reload)`));
ok(CHUNK_MESSAGE_RX_SOURCES.length === 5, `1: five engine message shapes are covered, got ${CHUNK_MESSAGE_RX_SOURCES.length}`);

// ── 2. the inline script, EXECUTED ─────────────────────────────────────────
function run({ getThrows = false, setThrows = false, now = 1_790_000_000_000 } = {}) {
  const store = new Map();
  const clock = { now };
  const listeners = {};
  const w = {
    reloads: 0,
    location: { reload() { w.reloads++; } },
    sessionStorage: {
      getItem(k) { if (getThrows) throw new Error("denied"); return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { if (setThrows) throw new Error("quota"); store.set(k, String(v)); },
    },
    addEventListener(type, fn, capture) { (listeners[type] = listeners[type] || []).push({ fn, capture }); },
  };
  const FakeDate = { now: () => clock.now };
  const appended = [];
  const byId = new Map();
  const el = (tag) => ({ tagName: tag.toUpperCase(), style: {}, children: [], attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); }, set id(v) { this._id = v; byId.set(v, this); }, get id() { return this._id; } });
  const document = {
    body: { appendChild(c) { appended.push(c); } },
    createElement: el,
    getElementById: (id) => byId.get(id) || null,
    addEventListener() {},
  };
  vm.runInContext(chunkRecoveryScript(), vm.createContext({ window: w, document, Date: FakeDate, Number, String, RegExp, isFinite }));
  const fire = (type, ev) => { for (const l of listeners[type] || []) l.fn(ev); };
  return { w, store, clock, listeners, fire, appended };
}
const SCRIPT = (src) => ({ target: { tagName: "SCRIPT", src } });
const OWN_CHUNK = "https://www.gowayfind.com/_next/static/chunks/4968-2dcc614085e487b1.js";
{
  const { w, listeners, fire, store, clock } = run();
  ok((listeners.error || []).length === 1 && listeners.error[0].capture === true,
    "2: listens for resource errors in the CAPTURE phase (a failed <script src> does not bubble to window)");
  ok((listeners.unhandledrejection || []).length === 1, "2: listens for unhandled rejections");
  ok(typeof w.__wfChunkRecover === "function", "2: exposes window.__wfChunkRecover for the React boundaries");
  fire("error", SCRIPT(OWN_CHUNK));
  ok(w.reloads === 1, `2: a failed /_next/static chunk reloads once (reloads=${w.reloads})`);
  ok(store.get(RELOAD_STAMP_KEY) === String(clock.now), "2: the stamp is written BEFORE the reload");
  clock.now += 2000;
  fire("error", SCRIPT(OWN_CHUNK));
  ok(w.reloads === 1, "2: a second failure 2s later does NOT reload (the loop guard)");
  clock.now += RELOAD_WINDOW_MS - 2000 - 1;
  ok(w.__wfChunkRecover(POSITIVES[0]) === true && w.reloads === 1, "2: still inside the window: recognised, but no reload");
  clock.now += 1;
  fire("error", SCRIPT(OWN_CHUNK));
  ok(w.reloads === 2, "2: a full window later a fresh failure may reload again");
}
{
  const { w, fire } = run();
  fire("error", SCRIPT("https://maps.googleapis.com/maps/api/js"));
  fire("error", SCRIPT("https://us-assets.i.posthog.com/static/array.js"));
  fire("error", { target: { tagName: "IMG", src: "https://www.gowayfind.com/_next/static/media/x.png" } });
  fire("error", { target: w, message: "Script error." });
  ok(w.reloads === 0, "2: third-party scripts, images and ordinary window errors never reload");
  fire("error", { target: { tagName: "LINK", href: "https://www.gowayfind.com/_next/static/css/app.css" } });
  ok(w.reloads === 1, "2: a failed first-party stylesheet reloads once");
}
{
  const { w, fire } = run();
  fire("unhandledrejection", { reason: new TypeError("Cannot read properties of null") });
  ok(w.reloads === 0, "2: an unrelated rejection does not reload");
  fire("unhandledrejection", { reason: Object.assign(new Error("x"), { name: "ChunkLoadError" }) });
  ok(w.reloads === 1, "2: an unhandled ChunkLoadError reloads once");
}
// The script and the plain-JS oracle must agree on every case.
[...POSITIVES, ...NEGATIVES].forEach((e, i) => {
  const { w } = run();
  const got = w.__wfChunkRecover(e);
  ok(got === isChunkLoadError(e), `2: inline script and lib isChunkLoadError agree on case #${i} (script=${got})`);
  ok(w.reloads === (got ? 1 : 0), `2: __wfChunkRecover reloads exactly when it recognises a chunk failure (case #${i})`);
});
{
  const noRead = run({ getThrows: true });
  noRead.fire("error", SCRIPT(OWN_CHUNK));
  ok(noRead.w.reloads === 0, "2: sessionStorage unreadable ⇒ never auto-reload (cannot prove it is not a loop)");
  const noWrite = run({ setThrows: true });
  noWrite.fire("error", SCRIPT(OWN_CHUNK));
  ok(noWrite.w.reloads === 0, "2: stamp cannot be written ⇒ no reload (could loop)");
  const future = run();
  future.store.set(RELOAD_STAMP_KEY, String(future.clock.now + 60_000));
  future.fire("error", SCRIPT(OWN_CHUNK));
  ok(future.w.reloads === 1, "2: a stamp from the future (clock moved back) resets instead of blocking forever");
}

// The dead-page fallback: once the one reload is spent, a repeat failure
// BEFORE React is alive paints the bar instead of reloading again.
{
  const { w, fire, appended, clock } = run();
  fire("error", SCRIPT(OWN_CHUNK));
  ok(w.reloads === 1 && appended.length === 0, "2: first failure reloads, no bar yet");
  clock.now += 1000;
  fire("error", SCRIPT(OWN_CHUNK));
  const bar = appended[0];
  ok(w.reloads === 1 && appended.length === 1 && bar && bar.id === "wf-chunk-bar" && bar.attrs.role === "alert",
    "2: a repeat failure inside the window shows ONE #wf-chunk-bar (role=alert) instead of reloading again");
  const btn = bar && bar.children.find((c) => c.tagName === "BUTTON");
  ok(btn && /min-height:44px/.test(btn.style.cssText) && btn.textContent === "Reload", "2: the bar carries a 44px Reload button");
  if (btn && typeof btn.onclick === "function") btn.onclick();
  ok(w.reloads === 2, "2: tapping the bar's Reload reloads (a user action, not a loop)");
  fire("error", SCRIPT(OWN_CHUNK));
  ok(appended.length === 1, "2: the bar is never stacked");
}
{
  const { w, appended, clock } = run();
  w.__wfChunkRecover(POSITIVES[0]);
  clock.now += 1000;
  ok(w.__wfChunkRecover(POSITIVES[0]) === true && w.reloads === 1 && appended.length === 0,
    "2: a failure a React boundary caught never paints the bar (the boundary's own screen is showing)");
}
{
  const { w, fire, appended } = run({ getThrows: true });
  fire("error", SCRIPT(OWN_CHUNK));
  ok(w.reloads === 0 && appended.length === 1, "2: no sessionStorage ⇒ no automatic reload, but the reader still gets the bar");
}
{
  const { w, fire, appended } = run();
  fire("error", SCRIPT("https://maps.googleapis.com/maps/api/js"));
  ok(w.reloads === 0 && appended.length === 0, "2: a third-party failure shows nothing (positive control above proves the bar can appear)");
}

// ── 3. the recovery screen and both boundaries, RENDERED ───────────────────
const screenMod = await loadComponent(fileURLToPath(new URL("../app/components/RecoveryScreen.js", import.meta.url)), REPO);
const html = renderToStaticMarkup(createElement(screenMod.default, { error: POSITIVES[0], reset() {}, boundary: "route" }));
ok(/role="alert"/.test(html), "3: the screen is announced (role=alert)");
ok(/That took a wrong turn/.test(html) && /Reload Wayfind/.test(html), "3: the home screen's own words and its Reload Wayfind button");
ok(/Try again/.test(html), "3: first paint offers Try again (reset) — the chunk-only copy swaps in after the effect asks the inline script");
ok(/href="\/"/.test(html), "3: there is always a way home");
ok(!/Application error/.test(html), "3: never Next's bare 'Application error' text");
const heights = [...html.matchAll(/<(button|a)[^>]*style="[^"]*min-height:(\d+)px/g)].map((m) => Number(m[2]));
ok(heights.length === 3 && heights.every((h) => h >= 44), `3: all three controls are >=44px tap targets (got ${JSON.stringify(heights)})`);

const routeMod = await loadComponent(fileURLToPath(new URL("../app/error.js", import.meta.url)), REPO);
const routeHtml = renderToStaticMarkup(createElement(routeMod.default, { error: new Error("boom"), reset() {} }));
const globalMod = await loadComponent(fileURLToPath(new URL("../app/global-error.js", import.meta.url)), REPO);
const globalHtml = renderToStaticMarkup(createElement(globalMod.default, { error: POSITIVES[0], reset() {} }));
// One probe for "renders its own document", proven on the boundary that must
// (positive control) before it is trusted on the one that must not.
const OWN_DOCUMENT = /^<html[^>]*>[\s\S]*<body/;
ok(OWN_DOCUMENT.test(globalHtml) && /Reload Wayfind/.test(globalHtml),
  "3: app/global-error.js supplies its own <html>/<body> (it replaces the root layout) and renders the screen");
ok(/That took a wrong turn/.test(routeHtml), "3: app/error.js renders the recovery screen");
ok(!OWN_DOCUMENT.test(routeHtml), "3: app/error.js renders INSIDE the root layout — no second <html>/<body>");

// ── 4. what cannot execute here, checked structurally ──────────────────────
{
  const screen = stripComments(readFileSync(new URL("../app/components/RecoveryScreen.js", import.meta.url), "utf8"));
  const effect = /useEffect\(\(\) => \{([\s\S]*?)\}, \[/.exec(screen);
  ok(effect && /window\.reportError\(error\)/.test(effect[1]),
    "4: the boundary effect reports every caught error via reportError() (Sentry's global handler + the early shim capture it) — none is swallowed");
  ok(effect && /window\.__wfChunkRecover\(error\)/.test(effect[1]),
    "4: the boundary effect applies the ONE chunk rule through window.__wfChunkRecover (reload once, never a loop)");
  // Bundle ratchet (scripts/check-bundle.mjs, 498KB, 0.3KB headroom on
  // 2026-09-30): importing lib/chunkRecovery or lazy SDK loaders into a root
  // boundary measured +0.4KB and failed it. Every import in these three files
  // is paid on "/"; only react and the screen itself are allowed.
  // lib/browserAnalytics is the one exception: it is already in the root bundle
  // (app/components/VersionWatch.js), measured +0KB, and captureOrQueue is the
  // repo's required path for PostHog events (test-commerce-emit-queue).
  const files = { "app/components/RecoveryScreen.js": /^(react|\.\.\/\.\.\/lib\/browserAnalytics)$/, "app/error.js": /^\.\/components\/RecoveryScreen$/, "app/global-error.js": /^\.\/components\/RecoveryScreen$/ };
  for (const [file, allowed] of Object.entries(files)) {
    const code = stripComments(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
    const specs = [...code.matchAll(/\bimport\s*(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] || m[2]);
    ok(specs.length >= 1, `4: import scan found ${file}'s own imports (positive control)`);
    const bad = specs.filter((s) => !allowed.test(s));
    ok(bad.length === 0, `4: ${file} stays import-free beyond ${allowed} (found ${JSON.stringify(bad)}) — anything else is paid on "/" against the bundle ratchet`);
  }
  // The inline layer is the FIRST element of the layout's <head>. Measured
  // 2026-09-30: from <body> it registered too late — a chunk that answered 502
  // fast failed before the listener existed and the page stayed dead. (The
  // root layout imports server-only modules this harness cannot load.)
  const layout = stripComments(readFileSync(new URL("../app/layout.js", import.meta.url), "utf8"));
  ok(/import\s*\{\s*chunkRecoveryScript\s*\}\s*from\s*"\.\.\/lib\/chunkRecovery"/.test(layout), "4: layout imports chunkRecoveryScript from lib/chunkRecovery");
  ok((layout.match(/chunkRecoveryScript\(\)/g) || []).length === 1, "4: the inline layer is rendered exactly once");
  const headBlock = (/<head>([\s\S]*?)<\/head>/.exec(layout) || [])[1] || "";
  ok(headBlock.length > 0, "4: the layout renders an explicit <head> (positive control for the placement probe)");
  ok(/^\s*<script dangerouslySetInnerHTML=\{\{ __html: chunkRecoveryScript\(\) \}\} \/>/.test(headBlock),
    "4: the recovery script is the FIRST element in <head>, listening before a fast-failing chunk can fire");
  ok(!/<body\b[^>]*>[\s\S]*chunkRecoveryScript\(\)/.test(layout), "4: it is not (also) rendered in <body>, where it registers too late");
}

if (fail.length) {
  console.error(`test-chunk-recovery: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-chunk-recovery: OK — ${pass} assertions; inline script executed against ${POSITIVES.length + NEGATIVES.length} oracle cases + resource/rejection/timing scenarios; 3 boundary renders; 3 boundary files held import-free`);
