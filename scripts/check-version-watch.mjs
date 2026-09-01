#!/usr/bin/env node
// check-version-watch — the stale-tab fix can never become a reload loop.
//
// 2026-08-07: shipped fixes weren't reaching long-lived tabs (the owner
// screenshotted a 14:47Z inversion that the 14:30Z deploy had retired). The
// fix is a build-id beacon + reload-on-return. The DANGER of any self-reload
// mechanism is a loop (half-propagated deploy, missing env, cache lying), so
// the safety properties are what this guard pins — each one by syntactic
// position or by reading the real seam, not by substring luck.
//
// 2026-08-27, and read this part carefully before editing assertion 3. The
// same class of failure happened again — a fall place card fixed, deployed
// and live for hours while the owner's phone still showed the bug — and THIS
// GUARD WAS HOLDING THE DOOR SHUT. It asserted "mount does not trigger a
// check — a tab that just loaded cannot be stale," which is false for any
// document served from a cache, and iOS Safari serves back/forward
// navigations from cache without revalidating. Wayfind inlines the place-card
// CSS into the document, so a cached document is cached CSS. The guard was
// pinning the premise that caused the bug, which is the most expensive kind
// of guard there is. Assertion 3 now pins the fix instead.
//
// The reload SAFETY properties (section 8) matter as much as the detection
// ones: this mechanism reloads real users' pages, sometimes while they are
// mid-session, and a reload that eats a half-typed search or a half-watched
// creator video costs more than the bug it delivers.
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
ok(/if \(!server\) return;/.test(code), "a server answering empty never triggers a reload — an unconfigured server disables the watch");
ok(/server === mine/.test(code) && /setPill\(false\)/.test(code), "a matching server build disarms the watch and withdraws the pill");

// 2. one reload per server build, stamped BEFORE reloading.
const stampSet = code.indexOf("sessionStorage.setItem(STAMP");
const reloadAt = code.indexOf("window.location.reload()");
ok(stampSet > 0 && reloadAt > 0 && stampSet < reloadAt,
  "the per-build stamp is written BEFORE reload() — stamping after would loop forever on a reload that re-runs this code");
ok((code.match(/window\.location\.reload\(\)/g) || []).length === 1, "exactly one reload call site — every reload goes through the stamp and the blocker gate");
ok(/sessionStorage\.getItem\(STAMP\)/.test(code), "the stamp is READ before reloading, or the loop guard is decorative");

// 3. THE BOOT CHECK. This assertion used to say the opposite (see the header):
//    it required the comment "No check on first mount" and forbade a boot
//    check, on the false premise that a tab that just loaded must be current.
//    A tab that just loaded FROM CACHE is exactly the stale case, and it is
//    the one that reached the owner's phone. What is pinned now is that the
//    boot check always exists. Navigation timing is not a reliable cache
//    oracle in iOS private/PWA/service-worker contexts, so the tiny no-store
//    version read runs once per mount and a matching build is a no-op.
ok(/check\("boot"\)/.test(code),
  "every mount checks the current server build — stale poster bundles cannot wait ten minutes");
ok(!/getEntriesByType\("navigation"\)/.test(code) && !/documentMayBeStale\(/.test(code),
  "boot detection does not depend on navigation timing, which misses iOS/PWA cache paths");
const lib = readFileSync(path.resolve("lib/staleTab.js"), "utf8");
ok(/export function documentMayBeStale/.test(lib) && /export function reloadBlockers/.test(lib),
  "lib/staleTab.js still exports both decisions — scripts/test-stale-tab.mjs is what actually asserts them");
ok(/back_forward/.test(lib) && /transferSize/.test(lib),
  "the cached-document test still covers BOTH doors: a back/forward navigation and a zero-byte transfer");

// 4. visibility is the primary trigger; the interval is a slow fallback.
ok(/visibilitychange/.test(code), "returning to a hidden tab triggers the check — that IS the stale moment");
ok(/CHECK_MS = 10 \* 60 \* 1000/.test(code), "the fallback interval is 10 minutes — a safety net, not a poller");
ok(/addEventListener\("pageshow"/.test(code) && /\.persisted/.test(code),
  "pageshow/persisted is watched — Safari restores from bfcache without a reliable visibilitychange");
ok(/addEventListener\("online"/.test(code),
  "coming back online triggers a check — a device that reconnects still runs the build it had while offline");
ok(!/addEventListener\("scroll"/.test(code) && !/"scroll"/.test(code),
  "no scroll listener: it fires at frame rate, touchstart precedes every touch scroll, and v8.79 was a scroll-tick regression");

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

// 8. NEVER RELOAD INTO A LIVE SESSION. The reload is unprompted, so the room
//    has to be empty first: no open sheet, no focused field, no playing media,
//    and no touch in the last IDLE_MS. Otherwise it arms and waits.
ok(/reloadBlockers\(/.test(code), "every reload passes the blocker gate — otherwise it lands mid-scroll, mid-search and mid-video");
ok(/role="dialog"/.test(code), "an open sheet blocks the reload — a place sheet or the auth sheet is somebody mid-decision");
ok(/document\.activeElement/.test(code), "a focused field blocks the reload — it would eat a half-typed search");
ok(/paused/.test(code), "a playing creator video blocks the reload");
ok(/navigator\.onLine/.test(code), "offline blocks the reload — there it delivers the error page, not the fix");
ok(/wf_pos/.test(comp),
  "the note about sessionStorage(\"wf_pos\") survives: an unprompted reload is only defensible because app/home.js already restores screen/cat/browseCat/sub/vibe and the scroll offset. Anyone who deletes that note is one step from adding a second, conflicting resume path");

if (fail.length) {
  console.error("check-version-watch: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-version-watch: OK — ${pass} assertions (fail-closed both sides, stamp-before-reload, cached-document boot check, five triggers, blocker-gated single reload, uncached server truth, baked client id, root-layout mount)`);
