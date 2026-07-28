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

/* ---- home.js: the two decorative hero fetches are idle-gated ---- */

ok(/import\s*\{\s*onIdle\s*\}\s*from\s*["']\.\.\/lib\/idleTask["']/.test(home),
  "home.js must import onIdle from lib/idleTask");

// Anchor on each fetch, then look BACKWARD a bounded distance for the gate.
// Bounded on purpose: an unbounded search would find some other onIdle far up
// the file and false-PASS, which is the failure direction that matters here.
// Anchor on the encodeURIComponent(...) call, NOT the bare phrase: "romantic
// dinner intimate" also appears at ~line 922 as a datenight keyword config, and
// anchoring on the phrase matches that unrelated site instead of the fetch.
const DECORATIVE = [
  { name: "date-night hero", needle: 'encodeURIComponent("romantic dinner intimate")', setter: "setDateHeroImg" },
  { name: "hidden-gem hero", needle: 'encodeURIComponent("hidden gem restaurant local favorite tucked away")', setter: "setGemHeroImg" },
];

for (const d of DECORATIVE) {
  const first = home.indexOf(d.needle);
  ok(first !== -1 && home.indexOf(d.needle, first + 1) === -1,
    `${d.name}: anchor must be unique in home.js, or this guard can check the wrong call site`);
}

for (const d of DECORATIVE) {
  const at = home.indexOf(d.needle);
  ok(at !== -1, `${d.name}: fetch site must still exist (did the query text change?)`);
  if (at === -1) continue;

  const before = home.slice(Math.max(0, at - 700), at);
  ok(/const\s+cancelIdle\s*=\s*onIdle\(/.test(before),
    `${d.name}: its fetch must be wrapped in onIdle() — it is decorative and must not sit on the critical path`);

  // The effect must still cancel the queued work on unmount, or a deferred
  // fetch outlives the component and setStates an unmounted tree.
  const after = home.slice(at, at + 1400);
  ok(/cancelIdle\(\)/.test(after),
    `${d.name}: effect cleanup must call cancelIdle() so queued work is abortable`);
  ok(after.includes(d.setter),
    `${d.name}: must still set its hero (${d.setter}) — deferring changes when, not whether`);
}

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
