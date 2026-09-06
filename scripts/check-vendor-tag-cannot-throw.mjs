#!/usr/bin/env node
// check-vendor-tag-cannot-throw — a monetization tag may not throw into the
// page, and a vendor's crash may not file as ours.
//
// THE ALERT (owner, 2026-09-03, forwarding Sentry): TWO issues, "TypeError:
// Cannot read properties of null (reading 'parentNode')" on /events, both
// stamped 18:21:43 UTC. The same second is the signature of ONE
// first-interaction moment, not two user journeys — which is exactly when both
// of our interaction-gated tags load.
//
// TWO THINGS WERE WRONG, and this guard pins both.
//
// 1. OUR LOADERS COULD THROW. Both inline tags used the ancient
//        var f = document.getElementsByTagName('script')[0];
//        f.parentNode.insertBefore(s, f);
//    idiom. It assumes a script element exists AND that it is attached. It is
//    also the only `.parentNode` dereference in Wayfind's own client source, so
//    for as long as it stood, a parentNode TypeError could not be attributed
//    without opening the stack. They now append to document.head (falling back
//    to documentElement, which cannot be null in a parsed document) inside a
//    try/catch. A tag that earns commission must never be able to take the page
//    down with it.
//
// 2. THE THROW WE SAW IS STAY22'S, AND IT IS NOT FIXABLE FROM HERE.
//    scripts.stay22.com/letmeallez.js bundles Mozilla's Readability and runs it
//    over the live page. Readability walks the DOM holding node references
//    across iterations and dereferences node.parentNode unguarded in several
//    places. On a route that is still streaming — /events re-renders as each
//    provider answers — a held node gets unmounted mid-walk and parentNode is
//    null. Two unguarded sites reached in one pass is two issues in one second.
//    So the vendor origins join DENY_URLS, by URL and never by message: the
//    identical TypeError from OUR code must still page us.
//
// The loaders are EXECUTED here, not read: the source is lifted out of
// app/layout.js and run in a VM against a DOM with no <script> element at all —
// the shape that breaks the old idiom.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DENY_URLS, IGNORE_ERRORS } from "../lib/sentryShared.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const LAYOUT = readFileSync(join(ROOT, "app/layout.js"), "utf8");

// ── 1. the idiom is gone from our own client source ───────────────────────
// POSITIVE CONTROLS for the two absence probes below. An absence assertion is
// only evidence if the probe can still FIND the thing it is looking for — a
// regex that has rotted into one matching nothing reports "clean" forever. Each
// is run against the exact idiom from the 2026-09-03 Sentry incident and
// asserted to MATCH before it is asserted to be absent from the real file.
ok(/\.parentNode/.test("var f=document.getElementsByTagName('script')[0];f.parentNode.insertBefore(s,f);"),
  "POSITIVE CONTROL: the .parentNode probe matches the original crashing idiom, so its absence below is a real finding");
ok(/getElementsByTagName\('script'\)\[0\]/.test("var f=document.getElementsByTagName('script')[0];"),
  "POSITIVE CONTROL: the getElementsByTagName('script')[0] probe matches that same idiom");
ok(!/\.parentNode/.test(LAYOUT),
  "app/layout.js dereferences .parentNode nowhere — that was the only one we owned, and it is what made a parentNode TypeError ambiguous");
ok(!/getElementsByTagName\('script'\)\[0\]/.test(LAYOUT),
  "…and the getElementsByTagName('script')[0] idiom it came from is gone too");

// Pull the two inline loaders straight out of the file. If this stops finding
// them the guard fails rather than passing on nothing.
const inline = [...LAYOUT.matchAll(/__html:\s*`([^`]*)`/g)].map((m) => m[1]);
const loaders = inline.filter((src) => /document\.createElement\('script'\)/.test(src));
ok(loaders.length === 2, `positive control: both inline tag loaders were found in app/layout.js (got ${loaders.length})`);
for (const src of loaders) {
  const who = /stay22/.test(src) ? "stay22" : /tp-em/.test(src) ? "travelpayouts" : "unknown";
  ok(who !== "unknown", "each inline loader is one of the two known tags");
  ok(/\(document\.head\|\|document\.documentElement\)\.appendChild\(s\)/.test(src),
    `${who}: appends to document.head (documentElement fallback) — neither can be null in a parsed document`);
  ok(/try\{/.test(src) && /\}catch\(e\)\{\}/.test(src), `${who}: the whole load path is wrapped — a tag cannot throw into the page`);
  ok(/s\.onerror=function\(\)\{\}/.test(src), `${who}: a blocked or failed vendor fetch is a no-op, not an unhandled error`);
  ok(/once:true/.test(src), `${who}: still gated on the FIRST interaction — this guard must not quietly undo the TBT fix`);
}

// ── 2. EXECUTED, against the DOM shape that broke the old idiom ───────────
function runLoader(src, { scripts = 0, headThrows = false, noHead = false } = {}) {
  const appended = [];
  const listeners = [];
  const el = () => ({ async: 0, src: "", onerror: null, setAttribute() {} });
  const head = {
    appendChild(node) { if (headThrows) throw new Error("appendChild refused"); appended.push(node); return node; },
  };
  const document = {
    createElement: () => el(),
    getElementsByTagName: (t) => (t === "script" ? Array.from({ length: scripts }, () => ({ parentNode: null })) : []),
    head: noHead ? null : head,
    documentElement: head,
  };
  const window = {
    addEventListener: (ev, fn) => listeners.push([ev, fn]),
    removeEventListener: () => {},
  };
  const ctx = vm.createContext({ document, window, Stay22: undefined });
  let threw = null;
  try { vm.runInContext(src, ctx, { timeout: 2000 }); } catch (e) { threw = e; }
  // fire the interaction the tag waits for
  let fireThrew = null;
  try { for (const [, fn] of listeners) fn(); } catch (e) { fireThrew = e; }
  return { threw, fireThrew, appended, listeners };
}

for (const src of loaders) {
  const who = /stay22/.test(src) ? "stay22" : "travelpayouts";
  // The exact shape the old idiom died on: a document with no <script> at all.
  const bare = runLoader(src, { scripts: 0 });
  ok(!bare.threw && !bare.fireThrew,
    `${who} EXECUTED: with NO <script> element in the document, the loader does not throw (${bare.fireThrew || bare.threw || "clean"})`);
  ok(bare.appended.length === 1, `${who} EXECUTED: …and it still injected exactly one tag (got ${bare.appended.length})`);
  ok(/^https:\/\//.test(String(bare.appended[0] && bare.appended[0].src)),
    `${who} EXECUTED: over https — ${String(bare.appended[0] && bare.appended[0].src).slice(0, 48)}`);
  ok(bare.appended[0] && bare.appended[0].async === 1, `${who} EXECUTED: async, so it never blocks parsing`);
  ok(bare.listeners.length >= 3, `${who} EXECUTED: the interaction gate registered (${bare.listeners.length} listeners)`);
  // And the hostile shapes: a head that refuses, and no head at all.
  for (const [label, opts] of [["a head that refuses appendChild", { headThrows: true }], ["no document.head", { noHead: true }]]) {
    const r = runLoader(src, opts);
    ok(!r.threw && !r.fireThrew, `${who} EXECUTED: ${label} — still no throw into the page (${r.fireThrew || r.threw || "clean"})`);
  }
  // Fire twice: the once-guard must hold, or an interaction storm injects N tags.
  const twice = runLoader(src, { scripts: 3 });
  try { for (const [, fn] of twice.listeners) fn(); } catch (e) {}
  ok(twice.appended.length === 1, `${who} EXECUTED: a second interaction injects nothing more (got ${twice.appended.length})`);
}

// ── 3. the vendor frames are denied, and ours are not ─────────────────────
const denied = (url) => DENY_URLS.some((rx) => rx.test(url));
ok(denied("https://scripts.stay22.com/letmeallez.js"), "Stay22's bundle is denied — its Readability walk is not our crash");
ok(denied("https://tp-em.com/NTUwMTYw.js?t=550160"), "the Travelpayouts loader is denied");
ok(denied("https://tp-em.com/chunk.Dx4H12ab.js"), "…and the chunks it pulls in behind itself");
ok(denied("https://vercel.live/_next-live/feedback/913.abc.js"), "regression: the Vercel Toolbar stays denied");
// THE CONTROL THAT MAKES THIS SAFE: our own code still pages us.
for (const mine of [
  "https://www.gowayfind.com/_next/static/chunks/main-app-1a2b.js",
  "https://www.gowayfind.com/events",
  "app:///_next/static/chunks/app/layout-9f9f.js",
]) {
  ok(!denied(mine), `CONTROL: ${mine.slice(0, 56)} is NOT denied — the same TypeError from Wayfind's own code must still page`);
}
ok(!IGNORE_ERRORS.some((m) => /parentNode/i.test(String(m))),
  "nothing was silenced BY MESSAGE — a parentNode TypeError is denied by whose file it came from, never by what it said");

if (fails.length) {
  console.error("check-vendor-tag-cannot-throw: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-vendor-tag-cannot-throw: OK — ${pass} assertions; both tags EXECUTED against a script-less, head-hostile DOM without throwing, and vendor frames are denied by URL while ours still page`);
