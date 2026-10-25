// Real sheet geometry without a page-wide box-sizing reset. visualViewport
// events model keyboard movement; this is not native Safari keyboard emulation.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { launchChromium, resolvePlaywright } from "./lib/synthetic/chromium.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
function compile(file) {
  const id = path.relative(root, file);
  if (modules.has(id)) return id;
  modules.set(id, "");
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText.replace(/require\("([^\"]+)"\)/g, (call, specifier) => {
    // Native-only dynamic imports fail if invoked, rather than being stubbed.
    if (!specifier.startsWith(".")) return call;
    let dep = path.resolve(path.dirname(file), specifier);
    if (!existsSync(dep)) dep += ".js";
    return `require(${JSON.stringify(compile(dep))})`;
  });
  modules.set(id, code);
  return id;
}
const entry = compile(path.join(root, "app/components/shareIntentSheet.js"));
const bundle = `window.process={env:{NODE_ENV:"test",NEXT_PUBLIC_SITE_URL:"https://www.gowayfind.com"}};
const modules={${[...modules].map(([id, code]) => `${JSON.stringify(id)}:(module,exports,require)=>{${code}\n}`).join(",")}};
const cache={};function require(id){if(!cache[id]){const m=cache[id]={exports:{}};modules[id](m,m.exports,require)}return cache[id].exports}
window.askShareIntent=require(${JSON.stringify(entry)}).askShareIntent;`;
const executablePath = process.argv.find(arg => arg.startsWith("--browser="))?.slice(10);
const browser = executablePath
  ? await (await resolvePlaywright()).launch({ executablePath, args: ["--no-sandbox"] })
  : await launchChromium({ args: ["--no-sandbox"] });
if (!browser) {
  // The existing GitHub guards workflow installs Chromium before this suite.
  if (process.argv.includes("--require-browser") || process.env.GITHUB_ACTIONS === "true") {
    throw new Error("Share-sheet geometry requires Chromium");
  }
  console.log("test-share-intent-fit: NOT VERIFIED — Chromium unavailable; required rendered CI check must run");
  process.exit(0);
}
let assertions = 0;
const ok = (condition, message) => { assertions++; assert.ok(condition, message); };
try {
  for (const width of [320, 390, 430, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body:
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif;background:#080c12}button,input{font-family:inherit}</style><button id="opener">Share place</button>' }));
    await page.goto("https://fixture.wayfind.test/");
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const vv = new EventTarget();
      Object.assign(vv, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0 });
      const listeners = { resize: new Set(), scroll: new Set() };
      const add = vv.addEventListener.bind(vv), remove = vv.removeEventListener.bind(vv);
      vv.addEventListener = (type, fn) => { listeners[type]?.add(fn); add(type, fn); };
      vv.removeEventListener = (type, fn) => { listeners[type]?.delete(fn); remove(type, fn); };
      window.viewportListeners = listeners;
      Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
      window.plainShares = 0;
      window.openInvite = () => {
        document.getElementById("opener").focus();
        window.askShareIntent({ name: "St. Petersburg Halloween Bar Crawl", city: "St. Petersburg",
          onPlain: () => { window.plainShares++; }, onInvite: () => true });
      };
      window.openInvite();
    });
    ok(await page.evaluate(() => innerWidth) === width, `${width}: achieved viewport width`);
    await page.getByRole("button", { name: "Just share it", exact: true }).click();
    ok(await page.evaluate(() => window.plainShares === 1 && !document.getElementById("wf-share-intent")), `${width}: plain sharing closes sheet`);
    await page.evaluate(() => window.openInvite());
    await page.getByRole("button", { name: /I’m asking someone out/ }).click();
    await page.getByRole("textbox").fill("Alexandria");
    for (const [stage, height, offsetTop, event] of [
      ["keyboard closed", 844, 0, "resize"], ["keyboard open", 380, 40, "resize"],
      ["Safari viewport panned", 380, 200, "scroll"], ["short visible window", 200, 20, "resize"],
      ["keyboard dismissed", 844, 0, "resize"],
    ]) {
      await page.evaluate(({ height, offsetTop, event }) => {
        Object.assign(window.visualViewport, { height, offsetTop });
        window.visualViewport.dispatchEvent(new Event(event));
      }, { height, offsetTop, event });
      const m = await page.evaluate(() => {
        const card = document.getElementById("wf-share-intent").lastElementChild;
        const input = card.querySelector("input"), cr = card.getBoundingClientRect(), ir = input.getBoundingClientRect();
        const vv = window.visualViewport;
        return { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right,
          inputLeft: ir.left, inputRight: ir.right, inputWidth: ir.width,
          overflow: card.scrollWidth - card.clientWidth, buttons: card.querySelectorAll("button").length,
          font: parseFloat(getComputedStyle(input).fontSize),
          vvTop: vv.offsetTop, vvBottom: vv.offsetTop + vv.height, vvWidth: vv.width };
      });
      ok(m.buttons === 2 && m.inputWidth > 100, `${width}/${stage}: real invite controls rendered`);
      ok(m.left >= -1 && m.right <= m.vvWidth + 1, `${width}/${stage}: panel fits horizontally`);
      ok(m.inputLeft >= m.left + 17 && m.inputRight <= m.right - 17 && m.overflow <= 1,
        `${width}/${stage}: name field stays within both panel gutters (${JSON.stringify(m)})`);
      ok(m.top >= m.vvTop - 1 && m.bottom <= m.vvBottom + 1, `${width}/${stage}: panel fits visible height (${m.top}..${m.bottom})`);
      ok(m.font >= 16, `${width}/${stage}: input avoids iOS focus zoom`);
      await page.getByRole("button", { name: /Skip —/ }).scrollIntoViewIfNeeded();
      ok(await page.getByRole("button", { name: /Skip —/ }).evaluate(el => {
        const r = el.getBoundingClientRect(), vv = window.visualViewport;
        return r.top >= vv.offsetTop - 1 && r.bottom <= vv.offsetTop + vv.height + 1;
      }), `${width}/${stage}: final action is reachable`);
    }
    await page.keyboard.press("Escape");
    ok(await page.evaluate(() => !document.getElementById("wf-share-intent") && document.activeElement.id === "opener"), `${width}: closing restores focus`);
    ok(await page.evaluate(() => Object.values(window.viewportListeners).every(set => set.size === 0)), `${width}: viewport listeners cleaned up`);
    ok(errors.length === 0, `${width}: no browser errors: ${errors.join(", ")}`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(`test-share-intent-fit: OK — ${assertions} assertions at 320/390/430/768/1440px; keyboard resize, pan, short height, dismissal and cleanup`);
