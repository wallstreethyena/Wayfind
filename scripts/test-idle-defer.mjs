#!/usr/bin/env node
/**
 * test-idle-defer — the decorative hero fetches stay OFF the critical path,
 * and onIdle keeps the contract that makes deferring safe.
 *
 * Measured live 2026-07-28: the homepage fired 17 metered third-party searches
 * on load (11 Google Places + 6 Foursquare). Two of them existed only to pick a
 * DECORATIVE hero photo for a card that already renders owned art, and each
 * chained into a vision-model /api/image-score. That is 4 requests and real
 * per-load cost spent on something the user cannot see yet.
 *
 * The regression this locks: someone "simplifies" the onIdle wrapper away and
 * silently puts those searches back on the critical path. Nothing would look
 * broken — the page would just get slower and more expensive again.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const home = readFileSync(path.resolve("app/home.js"), "utf8");
const idle = readFileSync(path.resolve("lib/idleTask.js"), "utf8");

/* ---- home.js: the two decorative hero fetches are GONE ---- */
//
// v8 (2026-08-15). This block used to assert that the date-night and hidden-gem
// hero photo fetches were wrapped in onIdle(). They are not deferred any more —
// they were DELETED, along with the promo hero deck they decorated. Deferring a
// request the page does not need is a mitigation; removing it is the fix, and
// the measurement this file opens with is what says so: 4 requests and a
// vision-model call per load, for a photo behind a card that no longer exists.
//
// The rail that replaced the deck uses owned artwork from /public/cards-v8, so
// there is no live hero-photo path left on this page at all
// (scripts/test-hero-people-free.mjs asserts the same thing from the other
// direction). onIdle has no caller in home.js now, and its import went with
// them.
//
// THE onIdle CONTRACT BELOW IS UNTOUCHED and still enforced. Its tests must
// outlive its last caller, or the next decorative fetch arrives ungated —
// which is exactly the regression this file was written to stop.

ok(!/setDateHeroImg|setGemHeroImg/.test(home),
  "the decorative hero photo state is back in app/home.js — read this file's header before re-adding a hero fetch");
ok(!/encodeURIComponent\("romantic dinner intimate"\)/.test(home),
  "the date-night hero's decorative Places search is back on the homepage");
ok(!/encodeURIComponent\("hidden gem restaurant local favorite tucked away"\)/.test(home),
  "the hidden-gem hero's decorative Places search is back on the homepage");
ok(!/fetch\("\/api\/image-score/.test(home),
  "the vision-model call those searches chained into is back on the homepage's load path");
// If a decorative fetch ever does land here again it must be idle-gated, so the
// import and the call must appear together — never one without the other.
ok(/onIdle\(/.test(home) === /import\s*\{\s*onIdle\s*\}\s*from\s*["']\.\.\/lib\/idleTask["']/.test(home),
  "app/home.js calls onIdle() without importing it, or imports it without a caller");

/* ---- lib/idleTask.js: the contract that makes deferral safe ---- */

ok(/typeof\s+window\s*===\s*["']undefined["']/.test(idle),
  "onIdle must handle SSR (no window) rather than throwing during render");
ok(/requestIdleCallback/.test(idle) && /setTimeout/.test(idle),
  "onIdle needs a setTimeout fallback — requestIdleCallback is absent on older Safari/iOS");
ok(/timeout/.test(idle),
  "onIdle must pass a timeout, or a page that never idles would defer the hero forever");
ok(/cancelIdleCallback/.test(idle),
  "onIdle must expose real cancellation via cancelIdleCallback");

/* ---- behavioural: the returned canceller actually prevents the callback ---- */

const mod = await import(path.resolve("lib/idleTask.js"));

// Node has no `window`, so a bare call exercises the SSR branch: run now, and
// hand back a no-op canceller. Assert that explicitly rather than mistaking it
// for a cancellation bug.
let ssrRan = 0;
const ssrCancel = mod.onIdle(() => { ssrRan++; });
ok(ssrRan === 1, "with no window (SSR), onIdle must run synchronously rather than dropping the work");
ok(typeof ssrCancel === "function", "onIdle must always return a callable canceller, even on the SSR path");

// Now exercise the real browser path by standing up the two APIs it uses.
const timers = new Map();
let nextId = 1;
globalThis.window = {
  requestIdleCallback: (fn) => { const id = nextId++; timers.set(id, setTimeout(fn, 5)); return id; },
  cancelIdleCallback: (id) => { clearTimeout(timers.get(id)); timers.delete(id); },
};
try {
  let ran = 0;
  const cancel = mod.onIdle(() => { ran++; });
  cancel();
  await new Promise((r) => setTimeout(r, 40));
  ok(ran === 0, "in a browser, cancelling before the callback fires must prevent it from running");

  let ran2 = 0;
  mod.onIdle(() => { ran2++; });
  await new Promise((r) => setTimeout(r, 40));
  ok(ran2 === 1, "an uncancelled onIdle callback must actually run");

  // A page with no requestIdleCallback (older Safari/iOS) must still run the
  // work — silently skipping would mean those users never get the hero.
  globalThis.window = {};
  let ran3 = 0;
  mod.onIdle(() => { ran3++; });
  await new Promise((r) => setTimeout(r, 40));
  ok(ran3 === 1, "without requestIdleCallback, the setTimeout fallback must still run the work");
} finally {
  delete globalThis.window;
}

if (fail.length) {
  console.error("test-idle-defer: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-idle-defer: OK — ${pass} assertions (decorative hero fetches deferred, cancellable, SSR-safe)`);
