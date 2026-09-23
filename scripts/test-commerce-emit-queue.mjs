#!/usr/bin/env node
// test-commerce-emit-queue — an app capture fired BEFORE PostHog is ready must
// be delivered once it initialises, and a suppressed (owner / bot) session must
// emit nothing at all.
//
// WHY (2026-09-23): PostHogProvider boots the SDK at idle (4s ceiling) and,
// since #1371, only after supabase.auth.getSession() resolves. emitCommerce,
// home.js logEvent and lib/track.js all tested `window.posthog` and silently
// returned when it was absent. The first-party events table recorded the same
// actions, which localised the loss: share_open (fired at mount on every share
// link landing) never appeared in PostHog at all; detail_open from those
// landings (~2s after load) was 35/21/24 in Supabase vs 0/0/0 in PostHog on
// 09-17..19, while giveaway_pop from the SAME sessions (~30s after load)
// arrived in both. The events were not rare; they were early.
//
// The fix is lib/browserAnalytics.js captureOrQueue: suppressed → nothing;
// ready → capture; otherwise a bounded in-memory queue that PostHogProvider
// drains on init and clears on suppression. This guard exercises the real
// modules (not their text) for the behaviour, and pins the wiring by source.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error("test-commerce-emit-queue: FAIL — " + m); process.exit(1); };
let passed = 0;
const ok = (c, m) => { if (!c) fail(m); passed++; };

class Storage {
  constructor(init = {}) { this.v = new Map(Object.entries(init)); }
  getItem(k) { return this.v.has(k) ? this.v.get(k) : null; }
  setItem(k, val) { this.v.set(k, String(val)); }
}
const HUMAN_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const mkWin = ({ ua = HUMAN_UA, webdriver = false, storage = new Storage() } = {}) => ({ navigator: { userAgent: ua, webdriver }, localStorage: storage });
const mkPh = () => { const calls = []; return { calls, capture(event, props, opts) { calls.push({ event, props, opts }); } }; };

const A = await import("../lib/browserAnalytics.js");
const { emitCommerce } = await import("../lib/commerce.js");
ok(typeof A.captureOrQueue === "function" && typeof A.drainPreReadyQueue === "function" && typeof A.clearPreReadyQueue === "function",
  "browserAnalytics exports captureOrQueue / drainPreReadyQueue / clearPreReadyQueue");
const Q = A.PRE_READY_QUEUE_KEY;
ok(typeof Q === "string" && Q.length > 0, "the queue key is a named export, not a literal each side re-types");

const CTX = { surface: "coupons", provider: "clipp", offer_id: "offer-1", rank_bucket: "1-3" };

// ── 1. emit before ready → delivered after init, with its occurrence time ──
{
  const win = mkWin();
  globalThis.window = win;
  const r = emitCommerce("commerce_impression", CTX);
  ok(r === true, `emitCommerce before PostHog is ready reports it was accepted (got ${r}) — the old code returned false and dropped it`);
  ok(Array.isArray(win[Q]) && win[Q].length === 1, `the pre-ready event is held in the queue (got ${JSON.stringify(win[Q])})`);
  const heldAt = win[Q][0][2];
  ok(heldAt instanceof Date, "the queued event carries its occurrence time");
  const ph = mkPh();
  const n = A.drainPreReadyQueue(win, ph);
  ok(n === 1 && ph.calls.length === 1, `init drains exactly the one queued event (drained ${n}, captured ${ph.calls.length})`);
  const c = ph.calls[0];
  ok(c.event === "commerce_impression", `the delivered event keeps its name (got ${c.event})`);
  ok(c.props && c.props.surface === "coupons" && c.props.offer_id === "offer-1", `the delivered payload is the whitelisted commerce payload (got ${JSON.stringify(c.props)})`);
  ok(c.opts && c.opts.timestamp === heldAt, "the delivered event is back-dated to when it happened, not when PostHog woke up");
  ok(win[Q].length === 0, "the queue is empty after draining — nothing is delivered twice");
  const again = A.drainPreReadyQueue(win, ph);
  ok(again === 0, `a second drainPreReadyQueue() re-captures nothing (returned ${again})`);
  ok(ph.calls.length === 1 && ph.calls.filter((x) => x.event === "commerce_impression" && x.opts && x.opts.timestamp === heldAt).length === 1,
    `the drained event was sent exactly once across both drains (${ph.calls.length} captures)`);
  // After init, emits go straight through.
  win.posthog = ph;
  ok(emitCommerce("commerce_impression", CTX) === true && ph.calls.length === 2 && win[Q].length === 0,
    "once PostHog is ready, emitCommerce captures directly and queues nothing");
  ok(ph.calls[1].opts === undefined, "a live capture is not given a synthetic timestamp");
}

// ── 2. suppressed sessions emit nothing and queue nothing ──
const suppressedCases = [
  ["known bot UA", mkWin({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })],
  ["webdriver automation", mkWin({ webdriver: true })],
  ["owner-marked browser", mkWin({ storage: new Storage({ [A.INTERNAL_BROWSER_KEY]: "1" }) })],
  ["provider-flagged suppression", Object.assign(mkWin(), { __WF_ANALYTICS_SUPPRESSED: "internal" })],
];
let suppressedRan = 0;
for (const [label, win] of suppressedCases) {
  globalThis.window = win;
  const ph = mkPh();
  const r1 = emitCommerce("commerce_impression", CTX);
  ok(r1 === false, `${label}: emitCommerce before ready is refused (got ${r1})`);
  ok(!win[Q] || win[Q].length === 0, `${label}: nothing is queued for a suppressed session`);
  win.posthog = ph;
  const r2 = emitCommerce("commerce_impression", CTX);
  ok(r2 === false && ph.calls.length === 0, `${label}: even with PostHog present, a suppressed session captures nothing (got ${r2}, ${ph.calls.length} calls)`);
  ok(A.captureOrQueue(win, "detail_open", { place_id: "x" }) === false && ph.calls.length === 0, `${label}: captureOrQueue (logEvent / track path) refuses too`);
  suppressedRan++;
}
ok(suppressedRan === suppressedCases.length && suppressedRan === 4, `every suppression case ran (${suppressedRan}/4)`);

// ── 3. suppression discovered AFTER queueing (owner auth resolves late) wipes the queue ──
{
  const win = mkWin();
  globalThis.window = win;
  emitCommerce("commerce_impression", CTX);
  A.captureOrQueue(win, "share_open", { kind: "place" });
  ok(win[Q].length === 2, "two events queued while auth was still pending");
  win.__WF_ANALYTICS_SUPPRESSED = "internal"; // what PostHogProvider.suppress() sets
  const ph = mkPh();
  ok(A.drainPreReadyQueue(win, ph) === 0 && ph.calls.length === 0, "a drain after suppression delivers nothing");
  ok(win[Q].length === 0, "…and the queued events are discarded, not kept for later");
  const win2 = mkWin();
  A.captureOrQueue(win2, "share_open", { kind: "place" });
  A.clearPreReadyQueue(win2);
  ok(win2[Q].length === 0, "clearPreReadyQueue empties the queue");
}

// ── 4. bounded: a page where PostHog never loads cannot grow memory ──
{
  const win = mkWin();
  globalThis.window = win;
  const MAX = A.PRE_READY_QUEUE_MAX;
  ok(Number.isInteger(MAX) && MAX > 0 && MAX <= 1000, `the queue cap is a small positive integer (got ${MAX})`);
  let accepted = 0;
  for (let i = 0; i < MAX + 50; i++) if (A.captureOrQueue(win, "card_impression", { i })) accepted++;
  ok(win[Q].length === MAX && accepted === MAX, `the queue stops at ${MAX} (held ${win[Q].length}, accepted ${accepted})`);
  ok(A.captureOrQueue(win, "card_impression", {}) === false, "an event past the cap is reported as dropped, not accepted");
}
delete globalThis.window;
ok(emitCommerce("commerce_impression", CTX) === false, "server-side (no window) emitCommerce is a no-op");

// ── 5. wiring: every sanctioned emitter uses the queue; the provider drains and clears it ──
const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// Positive controls for the absence probes below (AGENTS.md §4d): each probe
// must FIND the exact pre-fix shape it is meant to forbid, so a later "absent"
// is evidence rather than a probe that could never match.
ok(/window\.posthog/.test('if (typeof window !== "undefined" && window.posthog) { window.posthog.capture(event, payload); return true; }'),
  "positive control: the emitCommerce probe finds the pre-fix raw-SDK emit (lib/commerce.js before 2026-09-23)");
ok(/window\.posthog\.capture/.test('try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture(action, Object.assign({}, extra)); } catch (e0) {}'),
  "positive control: the logEvent/track probe finds the pre-fix raw capture (app/home.js logEvent before 2026-09-23)");
const commerce = src("lib/commerce.js");
const emitBody = (commerce.match(/export function emitCommerce\([\s\S]*?\n\}/) || [""])[0];
ok(emitBody.length > 0, "found emitCommerce's body");
ok(/captureOrQueue\(window,/.test(emitBody) && !/window\.posthog/.test(emitBody), "emitCommerce goes through captureOrQueue, never raw window.posthog");
const home = src("app/home.js");
const logBody = (home.match(/function logEvent\(action, place, extra\) \{[\s\S]*?\n {2}\}/) || [""])[0];
ok(logBody.length > 0, "found home.js logEvent");
ok(/captureOrQueue\(window, action,/.test(logBody) && !/window\.posthog\.capture/.test(logBody), "logEvent (detail_open, share_open, …) goes through captureOrQueue");
ok(/if \(skipOwnerOrBotAnalytics\(user\)\) return;/.test(logBody), "logEvent keeps its signed-in owner/bot gate ahead of any capture");
const track = src("lib/track.js");
ok(/captureOrQueue\(window, name, payload\)/.test(track) && !/window\.posthog\.capture/.test(track), "lib/track.js goes through captureOrQueue");
const provider = src("app/components/PostHogProvider.js");
const readyAt = provider.indexOf('window._phInit = "ready"');
const drainAt = provider.indexOf("drainPreReadyQueue(window, ph)");
ok(readyAt > 0 && drainAt > readyAt, "the provider drains the app queue after PostHog is initialised");
const suppressBody = (provider.match(/const suppress = \(reason\) => \{[\s\S]*?\n {4}\};/) || [""])[0];
ok(/clearPreReadyQueue\(window\)/.test(suppressBody), "provider.suppress() discards the app queue (owner/bot session emits nothing)");


// ── 6. the defect CLASS stays closed: no raw SDK capture anywhere in app/ or lib/ ──
// Any `window.posthog.capture(` — or `.capture(` on a variable assigned from
// window.posthog — silently drops an event fired before the idle boot. The
// sanctioned path is captureOrQueue. A new raw site FAILS this guard by name.
//
// RAW_CAPTURE_ALLOWLIST: file -> reason. A file may be listed only with a
// comment-grade reason proving its raw capture cannot run before boot.
// It is EMPTY today, deliberately:
//   - app/components/PostHogProvider.js never needs an entry: it captures on
//     its own module-local client (`ph` / `phClient`) only after ph.init(),
//     never through window.posthog, so the scanner does not match it.
//   - every other former raw site (home.js hero_impression / hero_tap /
//     share_path / app_error / auth_event / web_vitals, DaypartRail and
//     ExtraMilesTail impressions, VersionWatch stale_tab_reload,
//     lib/activation.js milestones, lib/experiment.js exposure) CAN fire
//     pre-boot and was moved onto captureOrQueue on 2026-09-23.
// Every entry must still match a raw site, so an allowlist cannot go stale.
const RAW_CAPTURE_ALLOWLIST = {};
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[\s;{}()])\/\/.*$/gm, "$1");
export function rawCaptureSites(code) {
  const c = stripComments(code);
  const hits = [];
  const DIRECT = /window\.posthog\s*(?:\?\.|\.)\s*capture\s*\(/g;
  let m;
  while ((m = DIRECT.exec(c))) hits.push("direct@" + m.index);
  const ALIAS = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*window\.posthog\b[^;\n]*/g;
  while ((m = ALIAS.exec(c))) {
    const id = m[1].replace(/\$/g, "\\$");
    if (new RegExp("(?:^|[^\\w$.])" + id + "\\s*(?:\\?\\.|\\.)\\s*capture\\s*\\(").test(c)) hits.push("alias:" + m[1]);
  }
  return hits;
}
// Positive + negative controls on literal fixtures: the scanner must find both
// shapes it forbids, and stay silent on the sanctioned path and on comments.
ok(rawCaptureSites('try { if (window.posthog) window.posthog.capture("x", {}); } catch (e) {}').length === 1, "scanner control: finds a direct raw capture");
ok(rawCaptureSites('try { window.posthog && window.posthog?.capture("x"); } catch (e) {}').length === 1, "scanner control: finds optional-chained raw capture");
ok(rawCaptureSites('const ph = o.posthog || (typeof window !== "undefined" ? window.posthog : null);\nif (ph) ph.capture("x", {});').some((h) => h === "alias:ph"), "scanner control: finds a capture on an alias of window.posthog");
ok(rawCaptureSites('captureOrQueue(window, "x", {}); if (window.posthog) window.posthog.identify(id);').length === 0, "scanner control: the sanctioned path and non-capture SDK calls are not flagged");
ok(rawCaptureSites('// window.posthog.capture("x") used to live here\n/* window.posthog.capture("y") */ const u = "https://x";').length === 0, "scanner control: comments are not code");

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(name)) files.push(p);
  }
};
for (const top of ["app", "lib", "components"]) { try { if (statSync(join(ROOT, top)).isDirectory()) walk(join(ROOT, top)); } catch (e) {} }
ok(files.length >= 300, `scanned a real tree, not an empty one (${files.length} source files under app/ lib/ components/)`);
const offenders = [];
let sanctioned = 0;
for (const f of files) {
  const rel = relative(ROOT, f);
  const code = readFileSync(f, "utf8");
  sanctioned += (stripComments(code).match(/captureOrQueue\(window,/g) || []).length;
  const hits = rawCaptureSites(code);
  if (RAW_CAPTURE_ALLOWLIST[rel]) { ok(hits.length > 0, `allowlist entry ${rel} no longer has a raw capture — remove it`); continue; }
  if (hits.length) offenders.push(`${rel} (${hits.join(", ")})`);
}
ok(offenders.length === 0, `raw window.posthog capture outside the allowlist drops pre-boot events — route through captureOrQueue: ${offenders.join("; ")}`);
ok(sanctioned >= 14, `the sanctioned path is actually in use (${sanctioned} captureOrQueue(window, …) call sites; expected >= 14 as of 2026-09-23)`);

console.log(`test-commerce-emit-queue: OK — ${passed} assertions (pre-ready emit delivered on init with original timestamp, 4 suppression paths emit nothing, late suppression wipes the queue, queue bounded, second drain re-sends nothing, emitters + provider wired, ${files.length} files scanned: 0 raw SDK captures, ${sanctioned} sanctioned sites)`);
