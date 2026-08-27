// scripts/verify-stale-tab-live.mjs — NOT a guard. A measurement.
//
// Drives the real site in headless Chromium and asks the only question that
// matters: when the server is running a newer build than this tab, does the
// tab pick it up BY ITSELF, and does it refuse to do so while the user is in
// the middle of something?
//
// /api/version is stubbed with a fake sha so the tab always looks stale.
// A different fake sha per case, because a tab stamps one reload per build.
//
//   node scripts/verify-stale-tab-live.mjs                 # production
//   WF_URL=https://... node scripts/verify-stale-tab-live.mjs
//
// Not in scripts/guards.txt on purpose: it needs the network and a live
// deploy, and a guard that depends on either fails for the wrong reasons.
// It is named verify-* rather than check-*/test-* so check-guard-manifest
// does not expect it there. Playwright is not a dependency of this repo —
// install it with `npm i --no-save playwright && npx playwright install
// chromium` when you want to run this.
//
// MEASURED AGAINST PRODUCTION BEFORE THE FIX (2026-08-27, sha 5d563290):
//   1 ok    a backgrounded tab comes back to a newer build
//   2 FAIL  a back/forward navigation off the cache never noticed  <- the bug
//   3 FAIL  reloaded out from under an active user, and no pill    <- the cost
//   4 ok    a matching build never reloads
//
// AND AFTER (sha 0099fbc3), all green. The line that matters is case 2:
//       +5840ms  /        back_forward     <- the document iOS hands back
//       +6062ms  /events  reload           <- the tab replaced itself, 222ms later
// Nobody swiped down. That is the entire point of the change.
import { chromium } from "playwright";

// check-env-discipline §5(a) forbids `process.env.X || "<literal>"`, because a
// hardcoded default makes "configured" indistinguishable from "not configured"
// in the output. That reasoning is right and it applies here too, so the
// default target is a named constant AND the run prints which one it used and
// where it came from. You can always tell from the output what was measured.
const PRODUCTION = "https://www.gowayfind.com/";
const URL_ = process.env.WF_URL || PRODUCTION;
const URL_SOURCE = process.env.WF_URL ? "WF_URL" : "default";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// Find a Chromium this machine actually has. playwright's own executablePath
// points at the build its version pins, which is often not the one on disk,
// and a "measurement" that cannot start is worse than no measurement.
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
function findChromium() {
  try { const p = chromium.executablePath(); if (existsSync(p)) return p; } catch (e) {}
  const root = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(root)) return undefined;
  const cands = [];
  for (const d of readdirSync(root)) {
    for (const rel of ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
                       "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
                       "chrome-headless-shell-mac-arm64/chrome-headless-shell"]) {
      const f = path.join(root, d, rel);
      if (existsSync(f)) cands.push(f);
    }
  }
  return cands.sort().pop();
}
const exe = findChromium();
console.log(`Chromium: ${exe || "(playwright default)"}`);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let fails = 0;
const say = (ok, label, extra = "") => { console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

const phone = { userAgent: UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
async function ctx(fakeSha) {
  const c = await browser.newContext(phone);
  await c.addInitScript(LEDGER);
  if (fakeSha) await c.route("**/api/version*", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ build: fakeSha }) }));
  return c;
}
// COUNTING DOCUMENTS IS THE WHOLE PROBLEM, and two obvious instruments both
// lie here:
//   • "framenavigated" fires for every pushState, and Wayfind rewrites the URL
//     constantly (SCREEN_PATH). A first draft reported four reloads per view.
//   • Playwright's "load" does not fire for a document that is replaced before
//     it finishes loading — which is exactly what a fast auto-reload does. The
//     second draft therefore reported the fix as broken while it was working:
//     the tab reloaded 155ms after the back/forward restore and the counter
//     never saw it.
// So each document writes its OWN line, from an init script that runs before
// any app code, into sessionStorage — which survives the reloads we are
// trying to count. The ledger is the measurement.
const LEDGER = () => {
  try {
    const n = performance.getEntriesByType("navigation")[0];
    const log = JSON.parse(sessionStorage.getItem("wf_probe") || "[]");
    log.push({ url: location.pathname, type: n ? n.type : "none", t: Date.now() });
    sessionStorage.setItem("wf_probe", JSON.stringify(log));
  } catch (e) {}
};
const ledger = (page) => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem("wf_probe") || "[]"); } catch (e) { return []; } });
const show = (log) => { const t0 = log.length ? log[0].t : 0; for (const d of log) console.log(`       +${String(d.t - t0).padStart(5)}ms  ${String(d.url).padEnd(8)} ${d.type}`); };
const reloads = (log) => log.filter((d) => d.type === "reload").length;

console.log(`\nTarget: ${URL_}  (${URL_SOURCE})\n`);

console.log("1. a backgrounded tab comes back to a newer build");
{
  const c = await ctx("aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa");
  const p = await c.newPage();
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  const before = reloads(await ledger(p));
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await p.waitForTimeout(5000);
  const log = await ledger(p); show(log);
  say(reloads(log) > before, "the tab reloaded itself on returning to visibility", `${before} -> ${reloads(log)} reload-type documents`);
  await c.close();
}

console.log("2. THE 2026-08-27 PATH — a back/forward navigation off the cache");
{
  const c = await ctx("bbbbbbbb22222222bbbbbbbb22222222bbbbbbbb");
  const p = await c.newPage();
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  await p.goto(new URL("/events", URL_).href, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const before = reloads(await ledger(p));
  await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(9000);
  const log = await ledger(p); show(log);
  const bf = log.findIndex((d) => d.type === "back_forward");
  say(bf > -1, "the back navigation really did restore a back/forward document — the iOS shape");
  const after = log.slice(bf + 1);
  say(bf > -1 && after.some((d) => d.type === "reload"),
    "the restored document noticed it was stale and reloaded itself",
    bf > -1 && after.length ? `next document after the restore: ${after[0].type} (+${after[0].t - log[bf].t}ms)` : "nothing followed it");
  say(reloads(log) > before, "…and that reload is a new document, not a URL rewrite");
  await c.close();
}

console.log("3. it refuses to reload out from under someone mid-session");
{
  const c = await ctx("cccccccc33333333cccccccc33333333cccccccc");
  const p = await c.newPage();
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  const before = reloads(await ledger(p));
  await p.evaluate(() => {
    document.dispatchEvent(new Event("pointerdown"));      // "I just touched the page"
    document.dispatchEvent(new Event("visibilitychange")); // "...and a new build landed"
  });
  await p.waitForTimeout(6000);
  const log3 = await ledger(p); show(log3);
  say(reloads(log3) === before, "no reload while the user is active", `${before} -> ${reloads(log3)} reload-type documents`);
  const pill = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /tap to reload/i.test(x.textContent || ""));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
  });
  say(!!pill, "the update pill is offered instead", pill ? JSON.stringify(pill) : "no pill in the DOM");
  if (pill) say(pill.top >= 0 && pill.bottom <= 844, "the pill sits inside the viewport, clear of the tab bar", `top ${pill.top}, bottom ${pill.bottom} of 844`);
  await c.close();
}

console.log("4. a matching build must never reload (the loop test)");
{
  const c = await ctx(null); // no stub: the server answers its own real sha
  const p = await c.newPage();
  await p.goto(URL_, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) { await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(1500); }
  const log4 = await ledger(p); show(log4);
  say(reloads(log4) === 0, "three visibility returns against a matching build: zero reloads", `${log4.length} document(s), ${reloads(log4)} of them reloads`);
  await c.close();
}

await browser.close();
console.log(fails ? `\nverify-stale-tab-live: ${fails} FAILED\n` : "\nverify-stale-tab-live: all green\n");
process.exit(fails ? 1 : 0);
