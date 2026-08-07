#!/usr/bin/env node
// check-version-watch — the stale-tab fix can never become a reload loop.
//
// 2026-08-07: shipped fixes weren't reaching long-lived tabs (the owner
// screenshotted a 14:47Z inversion that the 14:30Z deploy had retired). The
// fix is a build-id beacon + reload-on-return. The DANGER of any self-reload
// mechanism is a loop (half-propagated deploy, missing env, cache lying), so
// the safety properties are what this guard pins — each one by syntactic
// position or by reading the real seam, not by substring luck.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const comp = readFileSync(path.resolve("app/components/VersionWatch.js"), "utf8");
const code = comp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(code.length > 500, `stripped comments and still have code (${code.length}) — an over-eager strip would make everything below vacuous`);

// 1. fail closed on missing build ids, BOTH sides.
ok(/if \(!mine\) return;/.test(code), "a client with no baked build id disables itself entirely");
ok(/if \(!server \|\| server === mine\) return;/.test(code), "a server answering empty (or matching) never triggers a reload");

// 2. one reload per server build, stamped BEFORE reloading.
const stampSet = code.indexOf("sessionStorage.setItem(STAMP, server)");
const reloadAt = code.indexOf("window.location.reload()");
ok(stampSet > 0 && reloadAt > 0 && stampSet < reloadAt,
  "the per-build stamp is written BEFORE reload() — stamping after would loop forever on a reload that re-runs this code");
ok((code.match(/window\.location\.reload\(\)/g) || []).length === 1, "exactly one reload call site");

// 3. no reload on first mount — a fresh tab IS current.
ok(!/check\(\s*["']mount["']\s*\)/.test(code) && /No check on first mount/.test(comp),
  "mount does not trigger a check — a tab that just loaded cannot be stale");

// 4. visibility is the primary trigger; the interval is a slow fallback.
ok(/visibilitychange/.test(code), "returning to a hidden tab triggers the check — that IS the stale moment");
ok(/CHECK_MS = 10 \* 60 \* 1000/.test(code), "the fallback interval is 10 minutes — a safety net, not a poller");

// 5. the server half exists, is dynamic, and never caches.
ok(existsSync(path.resolve("app/api/version/route.js")), "the /api/version route exists");
const route = readFileSync(path.resolve("app/api/version/route.js"), "utf8");
ok(/force-dynamic/.test(route) && /no-store/.test(route), "the route is dynamic and uncached — a cached answer would report the OLD build and mask staleness");
ok(/VERCEL_GIT_COMMIT_SHA \|\| ""/.test(route), "the route answers empty (unconfigured) when the platform env is absent — the client reads empty as watch-off");

// 6. the client id is BAKED at build (next.config env), not read at runtime.
const cfg = readFileSync(path.resolve("next.config.js"), "utf8");
ok(/NEXT_PUBLIC_WF_BUILD: process\.env\.VERCEL_GIT_COMMIT_SHA \|\| ""/.test(cfg),
  "NEXT_PUBLIC_WF_BUILD is baked in next.config.js — a runtime read would always equal the server and never detect anything");

// 7. mounted in the ROOT layout so guides + app are both covered.
const layout = readFileSync(path.resolve("app/layout.js"), "utf8");
ok(/<VersionWatch \/>/.test(layout) && /import VersionWatch from ".\/components\/VersionWatch"/.test(layout),
  "VersionWatch is rendered in the root layout — a home-only mount would leave guide tabs stale");

if (fail.length) {
  console.error("check-version-watch: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-version-watch: OK — ${pass} assertions (fail-closed both sides, stamp-before-reload, no mount check, uncached server truth, baked client id, root-layout mount)`);
