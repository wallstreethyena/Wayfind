#!/usr/bin/env node
// Re-engagement PR 2, Lane A: the value gated push prompt, the iPhone Add to Home
// Screen helper, and POST /api/reengage/push (lib/reengagePushCrypto.js,
// lib/reengagePushClient.js, lib/reengagePushStore.js, app/components/PushPrompt.js,
// app/components/reengageBoot.js, app/api/reengage/push/route.js, middleware.js).
//
// Everything here asserts on RESULTS. The real modules are compiled and CALLED:
//   * the client against a real DOM (jsdom) with a recording fetch, a fake service
//     worker, a fake Notification and a fake PushManager; the prompt is RENDERED
//     with React and its buttons are CLICKED;
//   * the route against a stubbed fetch that records every call;
//   * the real middleware (pattern of test-reengage-server.mjs section 11).
// A source check stands in only where its message says SOURCE-LEVEL, and it is
// weaker: it reads text, it does not run it. The clock is pinned (12:00 in
// America/New_York) because quiet hours (8 PM to 9 AM) would otherwise make this
// test depend on the hour it runs.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { loadComponent } from "./lib/jsxLoad.mjs";

process.env.TZ = "America/New_York";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.setMaxListeners(60); // each loadComponent adds one exit listener

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let passed = 0;
const fail = (m) => { process.stderr.write("test-reengage-push: FAIL, " + m + "\n"); process.exit(1); }; // stderr directly: the route section captures console.*
const ok = (c, m) => { if (!c) fail(m); passed++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}; got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
const rel = (p) => path.join(ROOT, p);
const read = (p) => readFileSync(rel(p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
const settle = (ms = 15) => new Promise((r) => setTimeout(r, ms));

// ── constants and the real VAPID pair (so vapidFromEnv() is genuinely non-null) ──
const MIN = 60000;
const DAY = 86400000;
const NOW = Date.parse("2026-11-27T17:00:00Z"); // 12:00 noon in America/New_York
const NIGHT = Date.parse("2026-11-28T07:00:00Z"); // 02:00 in America/New_York, quiet hours
const PLAN_REF = "0123456789abcdef0123456789abcdef";
const ANON = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_ANON = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-endpoint-" + "x".repeat(40);
const P256DH = randomBytes(65).toString("base64url");
const AUTH = randomBytes(16).toString("base64url");
const SB = "https://fake-reengage-push.supabase.test";

const webpush = await loadComponent(rel("lib/webPush.js"), ROOT);
const vapid = webpush.generateVapidKeys();
// Every value this test depends on is SET here (and restored from this table), never read from the ambient shell:
// scripts/check-guard-hermeticity.mjs forbids a guard from deciding its verdict from process.env.
const ENV_FIXED = {
  NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY: vapid.publicKey,
  WF_VAPID_PRIVATE_KEY: vapid.privateKey,
  NEXT_PUBLIC_WF_REENGAGE: "1",
  NEXT_PUBLIC_WF_REENGAGE_PUSH: "1",
  WF_REENGAGE_ENABLED: "1",
  SUPABASE_URL: SB,
  SUPABASE_SERVICE_ROLE_KEY: "service_role_test_key",
  RESEND_API_KEY: "re_test_key",
};
for (const [k, v] of Object.entries(ENV_FIXED)) process.env[k] = v;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
const unsetEnv = (k) => { delete process.env[k]; };
const resetEnv = (k) => { process.env[k] = ENV_FIXED[k]; };

// ── the modules under test ────────────────────────────────────────────────────
const KERNEL = rel("lib/reengagePushCrypto.js");
const PUSHCLIENT = rel("lib/reengagePushClient.js");
const kc = await loadComponent(KERNEL, ROOT);
const rc = await loadComponent(rel("lib/reengageClient.js"), ROOT);
const pc = await loadComponent(PUSHCLIENT, ROOT);
const bootMod = await loadComponent(rel("app/components/reengageBoot.js"), ROOT);
const Prompt = (await loadComponent(rel("app/components/PushPrompt.js"), ROOT)).default;
const route = await loadComponent(rel("app/api/reengage/push/route.js"), ROOT);

// ── Date.now pin ──────────────────────────────────────────────────────────────
const realNow = Date.now;
async function pinned(ms, fn) {
  Date.now = () => ms;
  try { return await fn(); } finally { Date.now = realNow; }
}

// ══ A1. the sealing kernel: known answer vector, round trip, field swap, wrong key, no key ══
const VEC_ENV = { WF_VAPID_PRIVATE_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" };
const VEC_ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-endpoint";
const VEC_SEALED = "v1.AQEBAQEBAQEBAQEB.ASJAY8eXvAerkzQithaqePecbBuLaFcMZjxXe2ZXfPIeGIHWie9HCW5YcNpYklc5tw.dywLasmfITHQk2R0HB24Gw";
const VEC_HASH = "3e237dc2fad6caa7e5f23fbf0d6596584da65ae8aef4bc9b587d61a28409a613";
function kernelProblems(k) {
  const bad = [];
  const sealed = k.sealField(VEC_ENDPOINT, "endpoint", { env: VEC_ENV, iv: Buffer.alloc(12, 1) });
  if (sealed !== VEC_SEALED) bad.push("known answer vector");
  if (k.endpointHash(VEC_ENDPOINT) !== VEC_HASH) bad.push("endpoint hash");
  if (k.openField(VEC_SEALED, "endpoint", { env: VEC_ENV }) !== VEC_ENDPOINT) bad.push("round trip");
  if (k.openField(VEC_SEALED, "keys", { env: VEC_ENV }) !== null) bad.push("field swap opened");
  if (k.openField(VEC_SEALED, "endpoint", { env: { WF_VAPID_PRIVATE_KEY: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg" } }) !== null) bad.push("wrong key opened");
  if (k.sealField(VEC_ENDPOINT, "endpoint", { env: {} }) !== null) bad.push("sealed without a key");
  if (k.openField(VEC_SEALED, "endpoint", { env: {} }) !== null) bad.push("opened without a key");
  const long = k.sealField("https://fcm.googleapis.com/" + "a".repeat(1000 - 27), "endpoint", { env: VEC_ENV });
  // 3 ("v1.") + 16 (iv) + 1 + 1,334 (1,000 bytes, base64url) + 1 + 22 (tag) = 1,377. The contract text says 1,371, which does not add up; the
  // limit that matters is the column check (4,000), so this pins the real figure and the bound.
  if (!long || long.length !== 1377 || long.length >= 4000) bad.push("1,000 char endpoint seals to 1,377 chars (column limit 4,000), got " + (long && long.length));
  return bad;
}
eq(kernelProblems(kc), [], "A1: the kernel does not hold the pinned vector and behaviour");
{
  const src = read("lib/reengagePushCrypto.js");
  // the kernel is added byte for byte by both lanes of this PR pair; a drift in either copy shows here
  eq(createHash("sha256").update(src).digest("hex"), "a6bd808bbe13ef1efff68c65b55c6f11b7a5933bc65c2b87ddf431fd78ad892e", "A1: lib/reengagePushCrypto.js is not byte identical to the pinned kernel (contract section 3.1)");
  // red-prove, executed here: a changed info label must break the vector (the mutation is asserted to have applied)
  const info = 'export const PUSH_SUB_INFO = "wf-reengage-push-sub-v1";';
  ok(src.includes(info), "A1: the mutation target PUSH_SUB_INFO was not found, so the red-prove would test nothing");
  const mutated = await loadComponent(KERNEL, ROOT, { sourceOverrides: new Map([[KERNEL, src.replace(info, 'export const PUSH_SUB_INFO = "wf-reengage-push-sub-v2";')]]) });
  ok(kernelProblems(mutated).includes("known answer vector"), "A1 red-prove: a changed PUSH_SUB_INFO did not fail the vector");
  const aad = 'c.setAAD(Buffer.from("wf-reengage:" + field));';
  ok(src.includes(aad), "A1: the AAD mutation target was not found");
  const noAad = await loadComponent(KERNEL, ROOT, { sourceOverrides: new Map([[KERNEL, src.replace(aad, "")]]) });
  ok(kernelProblems(noAad).length > 0, "A1 red-prove: dropping the AAD did not fail the vector");
}
{
  // a sealed endpoint is not the plain one, and the sealed form of two different endpoints differs (random IV)
  const a = kc.sealField(ENDPOINT, "endpoint");
  const b = kc.sealField(ENDPOINT, "endpoint");
  ok(a && b && a !== b && !a.includes("fcm.googleapis.com") && kc.openField(a, "endpoint") === ENDPOINT, "A1: sealing under the live env key did not round trip with a fresh IV and hide the host");
}

// ══ browser fixtures: a real DOM with fake push plumbing and a recording fetch ═══
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";

function makeWin({
  url = "https://www.gowayfind.com/plan-my-day", ua = CHROME, gpc = false, suppressed = false, permission = "default", askResult = "granted",
  pushApis = true, standalone = false, existingSub = false, pushStatus = 200, pushThrows = false, state = null, flags = null, cookie = null,
} = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, pretendToBeVisual: true });
  const win = dom.window;
  Object.defineProperty(win.navigator, "userAgent", { configurable: true, value: ua }); // jsdom ignores a userAgent constructor option
  const log = [];
  const fetches = [];
  const rec = { log, fetches, askRendered: null, flagAtSignal: [] };
  win.__rec = rec;
  win.fetch = (u, init = {}) => {
    const entry = { u: String(u), init, body: init.body ? JSON.parse(init.body) : null };
    fetches.push(entry);
    log.push("fetch:" + entry.u);
    if (entry.u === "/api/reengage/signal") rec.flagAtSignal.push(win.localStorage.getItem("wf_reengage_flags"));
    if (entry.u === "/api/reengage/push") {
      if (pushThrows) return Promise.reject(new Error("network down"));
      return Promise.resolve(new Response(JSON.stringify({ ok: pushStatus === 200 }), { status: pushStatus }));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  const sub = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } }),
    unsubscribe: async () => { log.push("unsubscribe"); return true; },
  };
  let current = existingSub ? sub : null;
  const reg = {
    pushManager: {
      getSubscription: async () => { log.push("getSubscription"); return current; },
      subscribe: async () => { log.push("subscribe"); current = sub; return sub; },
    },
  };
  class FakeNotification {
    static permission = permission;
    static async requestPermission() {
      log.push("requestPermission");
      rec.askRendered = !!win.document.querySelector("[data-reengage-push]");
      FakeNotification.permission = askResult;
      return askResult;
    }
  }
  win.Notification = FakeNotification;
  Object.defineProperty(win.navigator, "serviceWorker", {
    configurable: true,
    value: { register: async (u, o) => { log.push("register:" + u + ":" + o.scope); return reg; }, ready: Promise.resolve(reg) },
  });
  if (pushApis) win.PushManager = function PushManager() {};
  if (gpc) Object.defineProperty(win.navigator, "globalPrivacyControl", { configurable: true, value: true });
  if (standalone) Object.defineProperty(win.navigator, "standalone", { configurable: true, value: true });
  if (suppressed) win.__WF_ANALYTICS_SUPPRESSED = true;
  if (state) win.localStorage.setItem("wf_reengage", JSON.stringify({ v: 1, ...state }));
  if (flags) win.localStorage.setItem("wf_reengage_flags", JSON.stringify(flags));
  if (cookie) win.document.cookie = cookie;
  return win;
}
const fetchesTo = (win, prefix) => win.__rec.fetches.filter((f) => f.u.startsWith(prefix));
const stateOf = (win) => rc.readState(win);
const draftState = (extra = {}) => ({ recent: [], draft: { planRef: PLAN_REF, area: "sarasota", areaName: "Sarasota", at: NOW - MIN }, visits: 2, lastVisitAt: NOW - 10 * MIN, prevVisitAt: NOW - 3 * DAY, ...extra });

async function bootWin(win, { loadClient, loadPush, loadPrompt, loadBanner } = {}) {
  let idle = null;
  win.requestIdleCallback = (cb) => { idle = cb; return 1; };
  const shown = [];
  const loads = { client: 0, push: 0, prompt: 0, banner: 0 };
  const cancel = bootMod.boot(win, (C) => shown.push(C), {
    loadClient: async () => { loads.client += 1; return loadClient ? loadClient() : rc; },
    loadPush: async () => { loads.push += 1; return loadPush ? loadPush() : pc; },
    loadPrompt: async () => { loads.prompt += 1; return loadPrompt ? loadPrompt() : { default: Prompt }; },
    loadBanner: async () => { loads.banner += 1; return loadBanner ? loadBanner() : { default: "BANNER" }; },
  });
  await idle();
  await settle();
  return { shown, loads, cancel };
}

// the dom globals React and the component read, set only while rendering
async function withDom(win, fn) {
  const keep = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  globalThis.window = win; globalThis.document = win.document; globalThis.HTMLElement = win.HTMLElement;
  try { return await fn(); } finally { globalThis.window = keep.window; globalThis.document = keep.document; globalThis.HTMLElement = keep.HTMLElement; }
}
async function mount(win, Comp) {
  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(createElement(Comp)); });
  return { host, root };
}
const buttonByText = (win, text) => [...win.document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
async function click(win, el) {
  await act(async () => { el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })); await settle(30); });
  await act(async () => { await settle(30); });
}
const storedStrings = (win) => {
  const out = [];
  for (let i = 0; i < win.localStorage.length; i++) out.push(win.localStorage.getItem(win.localStorage.key(i)));
  out.push(win.document.cookie);
  return out;
};

// ══ A2. shouldOfferPush truth table: each of the nine conditions flipped alone ═══
const FLAGS0 = { hasSavedEmail: false, hasPushOptIn: false };
const EMPTY_LEDGER = { day: null, count: 0, places: {} };
const stateAt = (extra = {}) => ({ v: 1, recent: [], city: null, draft: { planRef: PLAN_REF, area: "sarasota", areaName: "Sarasota", at: NOW - MIN }, visits: 2, lastVisitAt: NOW, prevVisitAt: null, dismissedAt: null, hubViews: 0, pushAskedAt: null, ...extra });
const ctxAt = (extra = {}) => ({ now: NOW, tz: "America/New_York", optedOut: false, reengageOn: true, pushOn: true, permission: "default", ledger: EMPTY_LEDGER, bannerShown: false, native: false, itinerarySeen: true, path: "/plan-my-day", ...extra });
function offerRows(p) {
  const f = (state, flags, ctx) => p.shouldOfferPush(state, flags, ctx);
  return [
    ["all conditions true (plan)", f(stateAt(), FLAGS0, ctxAt()), true],
    ["all conditions true (hub, second view)", f(stateAt({ draft: null, hubViews: 2 }), FLAGS0, ctxAt({ itinerarySeen: false, path: "/christmas-in-florida" })), true],
    ["1 opted out", f(stateAt(), FLAGS0, ctxAt({ optedOut: true })), false],
    ["1 opt out unknown (missing)", f(stateAt(), FLAGS0, ctxAt({ optedOut: undefined })), false],
    ["2 reengage build flag off", f(stateAt(), FLAGS0, ctxAt({ reengageOn: false })), false],
    ["2 push build flag off", f(stateAt(), FLAGS0, ctxAt({ pushOn: false })), false],
    ["3 already opted in to push", f(stateAt(), { hasSavedEmail: false, hasPushOptIn: true }, ctxAt()), false],
    ["3 saved email alone does not block", f(stateAt(), { hasSavedEmail: true, hasPushOptIn: false }, ctxAt()), true],
    ["4 plan not generated this page load", f(stateAt(), FLAGS0, ctxAt({ itinerarySeen: false })), false],
    ["4 plan draft older than 7 days", f(stateAt({ draft: { planRef: PLAN_REF, area: "", areaName: "", at: NOW - 8 * DAY } }), FLAGS0, ctxAt()), false],
    ["4 hub path, first view only", f(stateAt({ draft: null, hubViews: 1 }), FLAGS0, ctxAt({ itinerarySeen: false, path: "/guides/best-beaches" })), false],
    ["4 hub path, second view", f(stateAt({ draft: null, hubViews: 2 }), FLAGS0, ctxAt({ itinerarySeen: false, path: "/guides/best-beaches" })), true],
    ["4 not a hub path, many views", f(stateAt({ draft: null, hubViews: 9 }), FLAGS0, ctxAt({ itinerarySeen: false, path: "/best-beaches" })), false],
    ["5 notification permission denied", f(stateAt(), FLAGS0, ctxAt({ permission: "denied" })), false],
    ["5 permission already granted is fine", f(stateAt(), FLAGS0, ctxAt({ permission: "granted" })), true],
    ["6 asked 5 days ago", f(stateAt({ pushAskedAt: NOW - 5 * DAY }), FLAGS0, ctxAt()), false],
    ["6 asked 20 days ago", f(stateAt({ pushAskedAt: NOW - 20 * DAY }), FLAGS0, ctxAt()), false],
    ["6 asked 22 days ago", f(stateAt({ pushAskedAt: NOW - 22 * DAY }), FLAGS0, ctxAt()), true],
    ["7 quiet hours (02:00 local)", f(stateAt({ draft: { planRef: PLAN_REF, area: "", areaName: "", at: NIGHT - MIN } }), FLAGS0, ctxAt({ now: NIGHT })), false],
    ["7 daily alert cap spent today", f(stateAt(), FLAGS0, ctxAt({ ledger: { day: "2026-11-27", count: 1, places: {} } })), false],
    ["7 alert cap spent yesterday is fine", f(stateAt(), FLAGS0, ctxAt({ ledger: { day: "2026-11-26", count: 1, places: {} } })), true],
    ["8 return banner shown this page load", f(stateAt(), FLAGS0, ctxAt({ bannerShown: true })), false],
    ["9 native app", f(stateAt(), FLAGS0, ctxAt({ native: true })), false],
    ["bad clock", f(stateAt(), FLAGS0, ctxAt({ now: NaN })), false],
    ["null state", f(null, FLAGS0, ctxAt()), false],
  ];
}
const rowFailures = (rows) => rows.filter(([, got, want]) => got !== want).map(([label]) => label);
eq(rowFailures(offerRows(pc)), [], "A2: shouldOfferPush truth table rows failed");
ok(offerRows(pc).length === 25, "A2: the truth table lost rows");
{
  // red-prove, executed here: delete the canAlert condition and the quiet hours and daily cap rows must fail
  const src = read("lib/reengagePushClient.js");
  const cond = "if (!canAlert(c.ledger, { now: c.now, tz: c.tz }).ok) return false;";
  ok(src.includes(cond), "A2: the canAlert mutation target was not found, so the red-prove would test nothing");
  const mutated = await loadComponent(PUSHCLIENT, ROOT, { sourceOverrides: new Map([[PUSHCLIENT, src.replace(cond, "")]]) });
  const failed = rowFailures(offerRows(mutated));
  ok(failed.includes("7 quiet hours (02:00 local)") && failed.includes("7 daily alert cap spent today"), "A2 red-prove: removing the canAlert condition did not fail the quiet hours rows: " + JSON.stringify(failed));
}

// ══ A4. pushMode on fake navigators (and the platform label stored with a subscription) ══
function fakeNav({ ua, push = true, sw = true, notification = true, standalone, touchMac = false, capacitor = false, mm = false }) {
  const nav = { userAgent: ua };
  if (sw) nav.serviceWorker = {};
  if (standalone) nav.standalone = true;
  if (touchMac) { nav.platform = "MacIntel"; nav.maxTouchPoints = 5; }
  const win = { navigator: nav };
  if (push) win.PushManager = function PushManager() {};
  if (notification) win.Notification = { permission: "default" };
  if (capacitor) win.Capacitor = { isNativePlatform: () => true };
  if (mm) win.matchMedia = (q) => ({ matches: /standalone/.test(q) });
  return win;
}
function modeRows(p) {
  return [
    ["desktop Chrome", p.pushMode(fakeNav({ ua: CHROME })), "push", p.platformOf(fakeNav({ ua: CHROME })), "desktop"],
    ["Android Chrome", p.pushMode(fakeNav({ ua: ANDROID })), "push", p.platformOf(fakeNav({ ua: ANDROID })), "android"],
    ["iOS Safari tab", p.pushMode(fakeNav({ ua: IOS, push: false })), "a2hs", p.platformOf(fakeNav({ ua: IOS, push: false })), "other"],
    ["iOS installed web app", p.pushMode(fakeNav({ ua: IOS, standalone: true })), "push", p.platformOf(fakeNav({ ua: IOS, standalone: true })), "ios_pwa"],
    ["iOS Chrome (CriOS)", p.pushMode(fakeNav({ ua: IOS_CHROME, push: false })), null, null, null],
    ["Capacitor native shell", p.pushMode(fakeNav({ ua: IOS, capacitor: true })), null, null, null],
    ["iPad with a desktop UA (MacIntel plus touch)", p.pushMode(fakeNav({ ua: CHROME, touchMac: true, push: false })), "a2hs", null, null],
    ["iOS tab already display-mode standalone", p.pushMode(fakeNav({ ua: IOS, push: false, mm: true })), "a2hs", null, null],
    ["Instagram in app browser", p.pushMode(fakeNav({ ua: IOS + " Instagram 300.0", push: false })), null, null, null],
  ];
}
const modeFailures = (rows) => rows.filter(([, got, want, plat, wantPlat]) => got !== want || (wantPlat !== null && plat !== wantPlat)).map(([label]) => label);
// the row for "iOS tab already display-mode standalone" is a2hs only if matchMedia is absent, so assert the opposite where it applies
{
  const rows = modeRows(pc);
  rows.find((r) => r[0] === "iOS tab already display-mode standalone")[2] = null;
  eq(modeFailures(rows), [], "A4: pushMode / platformOf rows failed");
  eq(pc.pushMode(fakeNav({ ua: IOS, push: false, mm: false })), "a2hs", "A4: the same iOS tab without display-mode standalone is a2hs (control for the row above)");
  ok(rows.length === 9, "A4: the navigator table lost rows");
  unsetEnv("NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY");
  ok(pc.pushMode(fakeNav({ ua: IOS, push: false })) === null && pc.pushMode(fakeNav({ ua: CHROME })) === null, "A4: with no VAPID public key configured pushMode is not null (it would promise reminders this site cannot send)");
  resetEnv("NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY");
  // red-prove, executed here: iosSafariNonStandalone always false, the iOS tab row must fail
  const src = read("lib/reengagePushClient.js");
  const target = "    if (!isIos(nav)) return false;\n";
  ok(src.includes(target), "A4: the iosSafariNonStandalone mutation target was not found");
  const mutated = await loadComponent(PUSHCLIENT, ROOT, { sourceOverrides: new Map([[PUSHCLIENT, src.replace(target, "    return false;\n")]]) });
  const failed = modeFailures(modeRows(mutated));
  ok(failed.includes("iOS Safari tab"), "A4 red-prove: iosSafariNonStandalone false did not fail the iOS tab row: " + JSON.stringify(failed));
}

// ══ A3. opt out gets nothing: boot with GPC or analytics suppression ═════════════
{
  // (a) the boot's OWN gate, observed with recording fakes. Every function a later step would call is a recorder,
  // so removing the optedOut return from boot makes ensureAnonId (and the rest) run and this fails.
  for (const [label, opts] of [["GPC", { gpc: true }], ["analytics suppressed", { suppressed: true }]]) {
    const calls = [];
    const rec = (name, ret) => (...a) => { calls.push(name); return typeof ret === "function" ? ret(...a) : ret; };
    const fakeRc = {
      optedOut: rec("optedOut", true), ensureAnonId: rec("ensureAnonId", ANON), noteVisit: rec("noteVisit", {}), installReengageHook: rec("installReengageHook", true),
      readState: rec("readState", stateAt({ hubViews: 5 })), readFlags: rec("readFlags", FLAGS0), shouldShowBanner: rec("shouldShowBanner", true), noteHubView: rec("noteHubView", {}),
      HOOK_ITINERARY_CALLBACK: "__WF_REENGAGE_ITINERARY_CB",
    };
    const fakePc = { sendSignal: rec("sendSignal", true), offerFor: rec("offerFor", { kind: "hub", mode: "push", trigger: {} }), HUB_PATH_RX: /.*/, PROMPT_CTX_KEY: "k" };
    const win = makeWin({ url: "https://www.gowayfind.com/christmas-in-florida", ...opts });
    const out = await pinned(NOW, () => bootWin(win, { loadClient: () => fakeRc, loadPush: () => fakePc }));
    eq(calls, ["optedOut"], `A3 ${label}: boot ran more than the opt out check (the gate is boot's own)`);
    ok(out.loads.prompt === 0 && out.loads.banner === 0 && out.loads.push === 0 && out.shown.length === 0, `A3 ${label}: boot loaded a prompt, banner or the push client: ` + JSON.stringify(out.loads));
    ok(win.__rec.fetches.length === 0, `A3 ${label}: boot made a request`);
  }
  // (b) the whole real stack, so the claims "no fetch, no cookie, no prompt" hold end to end
  for (const [label, opts] of [["GPC", { gpc: true }], ["analytics suppressed", { suppressed: true }]]) {
    const win = makeWin({ url: "https://www.gowayfind.com/christmas-in-florida", state: { ...draftState(), hubViews: 5 }, ...opts });
    const before = storedStrings(win).join("|");
    const out = await pinned(NOW, () => bootWin(win));
    ok(fetchesTo(win, "/api/reengage").length === 0 && win.__rec.fetches.length === 0, `A3 ${label}: real boot fetched something`);
    ok(win.document.cookie === "", `A3 ${label}: real boot set a cookie: ${win.document.cookie}`);
    ok(out.loads.prompt === 0 && out.loads.banner === 0 && out.shown.length === 0, `A3 ${label}: real boot loaded a prompt or banner`);
    eq(storedStrings(win).join("|"), before, `A3 ${label}: real boot changed storage`);
    ok(rc.readState(win).hubViews === 5, `A3 ${label}: a hub view was counted`);
  }
  // (c) the shared helpers refuse on their own too (second layer)
  const gpcWin = makeWin({ gpc: true });
  ok(pc.sendSignal(gpcWin, "return_visit") === false && gpcWin.__rec.fetches.length === 0, "A3: sendSignal sent for a GPC visitor");
  ok(pc.noteAskShown(gpcWin, NOW) === false && gpcWin.localStorage.length === 0, "A3: noteAskShown wrote for a GPC visitor");
  const en = await pc.enableReengagePush(gpcWin, { trigger: { planRef: PLAN_REF } });
  ok(en.ok === false && gpcWin.__rec.log.length === 0, "A3: enableReengagePush ran for a GPC visitor: " + JSON.stringify(gpcWin.__rec.log));
  // positive control: the same boot for an ordinary visitor DOES reach the prompt loader and the signal route
  const live = makeWin({ url: "https://www.gowayfind.com/christmas-in-florida", state: { ...draftState({ draft: null }), hubViews: 5 } });
  const out = await pinned(NOW, () => bootWin(live));
  ok(live.document.cookie.includes("wf_anon_id=") && out.loads.prompt === 1 && fetchesTo(live, "/api/reengage/signal").length >= 1, "A3 positive control: an ordinary visitor was not offered the prompt: " + JSON.stringify({ loads: out.loads, cookie: live.document.cookie }));
}

// ══ A5. the iPhone helper: no network, no permission call, the ask stamp set ══════
{
  const win = makeWin({ ua: IOS, pushApis: false, url: "https://www.gowayfind.com/plan-my-day", state: draftState() });
  win[pc.PROMPT_CTX_KEY] = { kind: "itinerary", mode: "a2hs", trigger: { planRef: PLAN_REF } };
  await pinned(NOW, () => withDom(win, async () => {
    const { host, root } = await mount(win, Prompt);
    ok(host.textContent.includes("Tap Share, then Add to Home Screen"), "A5: the helper does not show 'Tap Share, then Add to Home Screen': " + host.textContent);
    ok(win.document.querySelector('[data-reengage-push="a2hs"]'), "A5: the helper region is missing");
    ok(win.__rec.fetches.length === 0 && !win.__rec.log.includes("requestPermission"), "A5: showing the helper made a request or asked for permission");
    eq(stateOf(win).pushAskedAt, NOW, "A5: showing the helper did not set pushAskedAt");
    eq(JSON.parse(win.localStorage.getItem("wf_alert_ledger")).count, 1, "A5: showing the helper did not record an alert in the shared ledger");
    ok(buttonByText(win, "Got it"), "A5: the Got it button is missing");
    await click(win, buttonByText(win, "Got it"));
    ok(win.__rec.fetches.length === 0 && !win.__rec.log.includes("requestPermission") && !win.document.querySelector("[data-reengage-push]"), "A5: Got it made a request, asked for permission or left the helper open");
    await act(async () => root.unmount());
  }));
  // through the boot: an iOS tab with a fresh plan gets the helper, and the only request is the plan signal
  const w2 = makeWin({ ua: IOS, pushApis: false, state: { ...draftState({ draft: null }), lastVisitAt: NOW - 10 * MIN } });
  const out = await pinned(NOW, async () => {
    const b = await bootWin(w2);
    w2.__WF_REENGAGE_HOOK("itinerary_generated", {});
    rc.noteDraft(PLAN_REF, "sarasota", "Sarasota", w2, NOW);
    await settle();
    return b;
  });
  ok(out.loads.prompt === 1 && out.shown.length === 1 && w2[pc.PROMPT_CTX_KEY] && w2[pc.PROMPT_CTX_KEY].mode === "a2hs", "A5: the boot did not hand the helper to onBanner for an iOS tab: " + JSON.stringify({ loads: out.loads, ctx: w2[pc.PROMPT_CTX_KEY] }));
  eq(w2.__rec.fetches.map((f) => f.u + ":" + f.body.kind), ["/api/reengage/signal:itinerary_generated"], "A5: an iOS tab made a request other than the plan signal");
}

// ══ A5b. a bottom dock (the Santa dock is z-index 930 and 65px tall at 390 wide) must not cover the buttons ══
{
  const withDock = async (dock) => {
    const win = makeWin({ ua: ANDROID, url: "https://www.gowayfind.com/christmas-in-florida", state: draftState() });
    Object.defineProperty(win, "innerHeight", { configurable: true, value: 844 });
    if (dock) {
      const el = win.document.createElement("aside");
      el.setAttribute("data-santa-dock", "");
      el.getBoundingClientRect = () => ({ top: 779, bottom: 844, height: 65, left: 0, right: 390, width: 390 });
      win.document.body.appendChild(el);
    }
    win[pc.PROMPT_CTX_KEY] = { kind: "hub", mode: "push", trigger: { path: "/christmas-in-florida" } };
    return pinned(NOW, () => withDom(win, async () => {
      const { host, root } = await mount(win, Prompt);
      const region = win.document.querySelector("[data-reengage-push]");
      const out = { lift: region && region.getAttribute("data-dock-lift"), html: host.innerHTML };
      await act(async () => root.unmount());
      return out;
    }));
  };
  const clear = await withDock(false);
  const docked = await withDock(true);
  // jsdom drops a calc() with env() from the style attribute, so the measured lift is asserted through the attribute the component sets from the same number
  ok(clear.lift === "0", "A5b: with no dock the prompt was lifted: " + clear.lift);
  ok(docked.lift === "65", "A5b: the prompt was not lifted by the 65px Santa dock: " + docked.lift);
  ok(/data-dock-lift/.test(read("app/components/PushPrompt.js")) && /bottom: `calc\(12px \+ \$\{lift\}px \+ env\(safe-area-inset-bottom, 0px\)\)`/.test(read("app/components/PushPrompt.js")), "A5b SOURCE-LEVEL: the measured lift is not what the bottom offset is built from");
}

// ══ A6. the Yes path, end to end: boot, hook, ask rendered, click, permission, subscribe, POST, flag, signal ══
{
  const win = makeWin({ state: { ...draftState({ draft: null }), lastVisitAt: NOW - 10 * MIN } });
  const out = await pinned(NOW, async () => {
    const b = await bootWin(win);
    ok(b.shown.length === 0 && fetchesTo(win, "/api/reengage").length === 0, "A6: boot asked or posted before any plan existed");
    // the app's order: track("itinerary_generated"), then noteDraft(planRef, ...) in the same tick
    win.__WF_REENGAGE_HOOK("itinerary_generated", {});
    rc.noteDraft(PLAN_REF, "sarasota", "Sarasota", win, NOW);
    await settle();
    return b;
  });
  ok(out.shown.length === 1 && out.loads.prompt === 1, "A6: the plan did not offer the prompt: " + JSON.stringify(out.loads));
  eq(fetchesTo(win, "/api/reengage/signal").map((f) => f.body), [{ kind: "itinerary_generated", planRef: PLAN_REF }], "A6: the plan signal was not posted exactly once with the plan reference");
  ok(win.__rec.fetches[0].init.keepalive === true && win.__rec.fetches[0].init.credentials === "same-origin" && win.__rec.fetches[0].init.method === "POST", "A6: the signal call is not a keepalive same-origin POST");
  await pinned(NOW, () => withDom(win, async () => {
    const { host, root } = await mount(win, out.shown[0]);
    ok(host.textContent.includes("Want a reminder about this plan?") && buttonByText(win, "Yes, remind me") && buttonByText(win, "Not now"), "A6: the soft ask is not rendered with two buttons: " + host.textContent);
    ok(!win.__rec.log.includes("requestPermission") && !win.__rec.log.includes("subscribe") && fetchesTo(win, "/api/reengage/push").length === 0, "A6: permission, subscribe or the push POST happened before the click");
    const mark = win.__rec.log.length;
    await click(win, buttonByText(win, "Yes, remind me"));
    const seq = win.__rec.log.slice(mark);
    eq(seq, ["register:/wf-push-sw.js:/", "getSubscription", "requestPermission", "subscribe", "fetch:/api/reengage/push", "fetch:/api/reengage/signal"], "A6: the Yes path order is wrong");
    ok(win.__rec.askRendered === true, "A6: requestPermission ran while the soft ask was not on screen");
    const post = fetchesTo(win, "/api/reengage/push")[0];
    eq([post.body.subscription.endpoint, post.body.tz, post.body.platform], [ENDPOINT, "America/New_York", "desktop"], "A6: the POST body is wrong");
    eq(fetchesTo(win, "/api/reengage/signal").map((f) => f.body), [{ kind: "itinerary_generated", planRef: PLAN_REF }, { kind: "itinerary_generated", planRef: PLAN_REF }], "A6: the trigger signal was not resent with the plan reference after opt in");
    eq(JSON.parse(win.__rec.flagAtSignal[1]), { hasSavedEmail: false, hasPushOptIn: true }, "A6: the flag was not already true when the signal was resent");
    ok(host.textContent.includes("Done. We will send one short note."), "A6: no confirmation after opting in: " + host.textContent);
    // A8: the browser holds two booleans, never the endpoint or a key
    const flags = JSON.parse(win.localStorage.getItem("wf_reengage_flags"));
    eq(Object.keys(flags).sort(), ["hasPushOptIn", "hasSavedEmail"], "A8: wf_reengage_flags is not exactly two keys");
    ok(Object.values(flags).every((v) => typeof v === "boolean"), "A8: a stored flag is not a boolean");
    const stored = storedStrings(win).join("\n");
    ok(!stored.includes(ENDPOINT) && !stored.includes("fcm.googleapis.com") && !stored.includes(P256DH) && !stored.includes(AUTH), "A8: a stored value or cookie holds the endpoint or a key");
    ok(storedStrings({ localStorage: { length: 1, key: () => "k", getItem: () => "x " + ENDPOINT }, document: { cookie: "" } }).join("").includes(ENDPOINT), "A8 control: the storage scan does not find a known endpoint");
    await act(async () => root.unmount());
  }));
  // "Not now": the permission dialog never opens, no subscription is taken, the ask is remembered
  const w2 = makeWin({ state: { ...draftState({ draft: null }), lastVisitAt: NOW - 10 * MIN } });
  const o2 = await pinned(NOW, async () => {
    const b = await bootWin(w2);
    w2.__WF_REENGAGE_HOOK("itinerary_generated", {});
    rc.noteDraft(PLAN_REF, "sarasota", "Sarasota", w2, NOW);
    await settle();
    return b;
  });
  await pinned(NOW, () => withDom(w2, async () => {
    const { host, root } = await mount(w2, o2.shown[0]);
    await click(w2, buttonByText(w2, "Not now"));
    const requested = w2.__rec.log.filter((x) => x === "requestPermission").length;
    ok(requested === 0, "A6: 'Not now' opened the permission dialog (" + requested + " calls)");
    ok(!w2.__rec.log.includes("subscribe") && fetchesTo(w2, "/api/reengage/push").length === 0, "A6: 'Not now' subscribed or posted");
    eq(stateOf(w2).pushAskedAt, NOW, "A6: 'Not now' did not set pushAskedAt");
    ok(!w2.document.querySelector("[data-reengage-push]"), "A6: 'Not now' left the ask on screen");
    eq(JSON.parse(w2.localStorage.getItem("wf_reengage_flags") || "{}").hasPushOptIn === true, false, "A6: 'Not now' set the opt in flag");
    await act(async () => root.unmount());
  }));
  // a second plan on the same page load does not ask twice (and the ask stamp keeps it quiet for 21 days)
  await pinned(NOW + 2 * MIN, async () => {
    w2.__WF_REENGAGE_HOOK("itinerary_generated", {});
    await settle();
  });
  ok(fetchesTo(w2, "/api/reengage/signal").length === 1, "A6: a repeat itinerary_generated for the same plan posted the signal again");
  ok(o2.loads.prompt === 1, "A6: the ask loaded twice in one page load");
}

// ══ A6b. an opted in visitor, and the push flag unset ════════════════════════════
{
  const win = makeWin({ flags: { hasSavedEmail: false, hasPushOptIn: true }, state: { ...draftState({ draft: null }), lastVisitAt: NOW - 10 * MIN } });
  const out = await pinned(NOW, async () => {
    const b = await bootWin(win);
    win.__WF_REENGAGE_HOOK("itinerary_generated", {});
    rc.noteDraft(PLAN_REF, "sarasota", "Sarasota", win, NOW);
    await settle();
    win.__WF_REENGAGE_HOOK("itinerary_generated", {});
    await settle();
    return b;
  });
  eq(fetchesTo(win, "/api/reengage").map((f) => [f.u, f.body]), [["/api/reengage/signal", { kind: "itinerary_generated", planRef: PLAN_REF }]], "A6b: an opted in visitor did not post exactly one signal carrying the planRef");
  ok(out.loads.prompt === 0 && out.shown.length === 0, "A6b: an opted in visitor was asked again");
}
{
  // the push flag unset: zero requests to /api/reengage/*, the push client is never loaded, nothing registers
  unsetEnv("NEXT_PUBLIC_WF_REENGAGE_PUSH");
  try {
    const win = makeWin({ url: "https://www.gowayfind.com/christmas-in-florida", state: { ...draftState(), hubViews: 4, prevVisitAt: NOW - 3 * DAY, lastVisitAt: NOW - 3 * DAY } });
    const out = await pinned(NOW, async () => {
      const b = await bootWin(win);
      win.__WF_REENGAGE_HOOK("itinerary_generated", {});
      await settle();
      return b;
    });
    ok(win.__rec.fetches.length === 0, "A6b: with the push flag unset a request was made: " + JSON.stringify(win.__rec.fetches.map((f) => f.u)));
    ok(out.loads.push === 0 && out.loads.prompt === 0 && win[rc.HOOK_ITINERARY_CALLBACK] === undefined && win[pc.PROMPT_CTX_KEY] === undefined, "A6b: with the push flag unset the push client loaded or a callback registered: " + JSON.stringify(out.loads));
    ok(stateOf(win).hubViews === 4, "A6b: with the push flag unset a hub view was counted");
    ok(out.loads.banner === 1, "A6b control: the return banner (PR 1 behaviour) still loads with the push flag unset");
    ok(win.document.cookie.includes("wf_anon_id="), "A6b control: the PR 1 cookie is still set with the push flag unset");
    // the helpers refuse on their own too
    const w2 = makeWin();
    ok(pc.sendSignal(w2, "return_visit") === false && w2.__rec.fetches.length === 0, "A6b: sendSignal sent with the push flag unset");
    const en = await pc.enableReengagePush(w2, { trigger: { planRef: PLAN_REF } });
    ok(en.ok === false && w2.__rec.log.length === 0, "A6b: enableReengagePush ran with the push flag unset");
  } finally { resetEnv("NEXT_PUBLIC_WF_REENGAGE_PUSH"); }
}
{
  // return_visit and hub_view timing, banner case, and the two signals from one boot
  const hub = (state) => makeWin({ url: "https://www.gowayfind.com/christmas-in-florida/orlando", state });
  const kinds = (w) => fetchesTo(w, "/api/reengage/signal").map((f) => f.body.kind);
  let w = hub({ recent: [], visits: 1, lastVisitAt: NOW - 31 * MIN, hubViews: 0 });
  await pinned(NOW, () => bootWin(w));
  eq(kinds(w), ["return_visit"], "boot: a visit 31 minutes after the last did not send return_visit exactly once (and the first hub view sent hub_view)");
  w = hub({ recent: [], visits: 1, lastVisitAt: NOW - 29 * MIN, hubViews: 0 });
  await pinned(NOW, () => bootWin(w));
  eq(kinds(w), [], "boot: a visit 29 minutes after the last sent a signal");
  w = hub({ recent: [], visits: 1, lastVisitAt: NOW - 3 * DAY, hubViews: 1 });
  await pinned(NOW, () => bootWin(w));
  eq(kinds(w), ["return_visit", "hub_view"], "boot: a returning visitor's second hub view did not send return_visit then hub_view");
  eq(fetchesTo(w, "/api/reengage/signal")[1].body, { kind: "hub_view", path: "/christmas-in-florida/orlando" }, "boot: the hub_view signal does not carry the path");
  // the banner shows AND the signals still go AND no prompt (rule 8: not on a page load that showed the banner)
  w = hub({ recent: [{ id: "p1", name: "Pier" }], visits: 3, lastVisitAt: NOW - 3 * DAY, hubViews: 5 });
  const bo = await pinned(NOW, () => bootWin(w));
  eq(kinds(w), ["return_visit", "hub_view"], "boot: a returning visitor with the banner did not still send both signals");
  ok(bo.loads.banner === 1 && bo.shown.length === 1 && bo.shown[0] === "BANNER" && bo.loads.prompt === 0, "boot: the banner page load also offered the push prompt: " + JSON.stringify(bo.loads));
  // a non-hub path is never counted
  w = makeWin({ url: "https://www.gowayfind.com/best-beaches", state: { recent: [], visits: 1, lastVisitAt: NOW - 10 * MIN, hubViews: 0 } });
  await pinned(NOW, () => bootWin(w));
  ok(stateOf(w).hubViews === 0 && w.__rec.fetches.length === 0, "boot: a non-hub page was counted as a hub view");
}

// ══ A7. an existing subscription is never removed; one this call created is ═══════
{
  const run = async (opts) => {
    const win = makeWin({ state: draftState(), ...opts });
    const r = await pinned(NOW, () => pc.enableReengagePush(win, { kind: "itinerary", trigger: { planRef: PLAN_REF } }));
    const count = (k) => win.__rec.log.filter((x) => x === k).length;
    return { r, win, unsub: count("unsubscribe"), subscribe: count("subscribe"), ask: count("requestPermission") };
  };
  let o = await run({ existingSub: true, pushStatus: 503 });
  ok(o.r.ok === false && o.unsub === 0 && o.subscribe === 0, "A7: a pre-existing subscription was unsubscribed or re-subscribed after a 503: " + JSON.stringify({ unsub: o.unsub, subscribe: o.subscribe }));
  ok(JSON.parse(o.win.localStorage.getItem("wf_reengage_flags") || "{}").hasPushOptIn !== true, "A7: the opt in flag was set although the server refused");
  o = await run({ existingSub: false, pushStatus: 503 });
  ok(o.r.ok === false && o.subscribe === 1 && o.unsub === 1, "A7: a subscription this call created was not removed after a 503: " + JSON.stringify({ unsub: o.unsub, subscribe: o.subscribe }));
  o = await run({ existingSub: false, pushThrows: true });
  ok(o.r.ok === false && o.unsub === 1, "A7: a subscription this call created was kept after a network failure");
  o = await run({ existingSub: true, permission: "granted" });
  ok(o.r.ok === true && o.ask === 0 && o.subscribe === 0 && o.unsub === 0, "A7: an already granted permission with an existing subscription asked again or re-subscribed: " + JSON.stringify(o.win.__rec.log));
  o = await run({ existingSub: false, permission: "denied" });
  ok(o.r.ok === false && o.ask === 0 && o.subscribe === 0 && fetchesTo(o.win, "/api/reengage/push").length === 0, "A7: a blocked permission still subscribed or posted");
  o = await run({ existingSub: false, permission: "default", askResult: "denied" });
  ok(o.r.ok === false && o.subscribe === 0 && fetchesTo(o.win, "/api/reengage/push").length === 0, "A7: a refused permission dialog still subscribed or posted");
  o = await run({ ua: IOS, pushApis: false });
  ok(o.r.ok === false && o.win.__rec.log.length === 0, "A7: enableReengagePush ran in an iOS tab, where only the helper may show");
}

// ══ A9, A10. the route ════════════════════════════════════════════════════════════
const sbCalls = [];
const allCalls = [];
let sbStatus = 201;
const consoleLines = [];
for (const k of ["log", "error", "warn", "info"]) { const orig = console[k]; console[k] = (...a) => { consoleLines.push(a.map(String).join(" ")); if (k === "log") orig(...a); }; }
globalThis.fetch = async (url, init = {}) => {
  const rec = { u: String(url), method: (init && init.method) || "GET", raw: init && init.body ? String(init.body) : "", headers: (init && init.headers) || {} };
  sbCalls.push(rec); allCalls.push(rec);
  return new Response("{}", { status: sbStatus });
};
const subBody = (over = {}) => ({ subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } }, tz: "America/Chicago", platform: "android", ...over });
const post = (body, { cookie = "wf_anon_id=" + ANON, headers = {}, raw = null } = {}) => route.POST(new Request("https://www.gowayfind.com/api/reengage/push", {
  method: "POST", headers: { "content-type": "application/json", "user-agent": IOS, ...(cookie ? { cookie } : {}), ...headers }, body: raw !== null ? raw : JSON.stringify(body),
}));
async function expect(label, req, status, extra) {
  sbCalls.length = 0;
  const res = await req;
  const text = await res.text();
  ok(res.status === status, `${label}: expected HTTP ${status} got ${res.status} ${text}`);
  if (extra) extra(JSON.parse(text), text);
  return { res, text };
}
{
  // positive control first: a configured, ordinary request writes exactly one row (so the no-write cases below mean something)
  const unconf = async (label, key) => {
    unsetEnv(key);
    try { await expect(label, post(subBody()), 503, (j) => eq(j, { ok: false, code: "unconfigured" }, label + ": body")); ok(sbCalls.length === 0, `${label}: made ${sbCalls.length} network calls`); }
    finally { resetEnv(key); }
  };
  await unconf("A9 unconfigured, re-engagement off", "WF_REENGAGE_ENABLED");
  await unconf("A9 unconfigured, VAPID public key missing", "NEXT_PUBLIC_WF_VAPID_PUBLIC_KEY");
  await unconf("A9 unconfigured, VAPID private key missing", "WF_VAPID_PRIVATE_KEY");
  await unconf("A9 unconfigured, Supabase service key missing", "SUPABASE_SERVICE_ROLE_KEY");
  await unconf("A9 unconfigured, Resend key missing", "RESEND_API_KEY");
  await expect("A10 control: configured request", post(subBody()), 200);
  ok(sbCalls.length === 1 && sbCalls[0].method === "POST" && sbCalls[0].u === `${SB}/rest/v1/wf_reengage_push_subs?on_conflict=endpoint_hash`, "A10: the one write is not an upsert on endpoint_hash: " + JSON.stringify(sbCalls.map((c) => c.u)));
  // no-write cases
  await expect("A9 no cookie", post(subBody(), { cookie: null }), 200, (j) => eq(j, { ok: true }, "A9 no cookie body"));
  ok(sbCalls.length === 0, "A9: a request with no cookie wrote");
  await expect("A9 malformed cookie", post(subBody(), { cookie: "wf_anon_id=not-an-id" }), 200);
  ok(sbCalls.length === 0, "A9: a request with a malformed anonymous id wrote");
  await expect("A9 GPC header", post(subBody(), { headers: { "sec-gpc": "1" } }), 200);
  ok(sbCalls.length === 0, "A9: a request with Global Privacy Control wrote");
  await expect("A9 synthetic", post(subBody(), { headers: { "x-wf-synthetic": "1" } }), 200);
  ok(sbCalls.length === 0, "A9: a synthetic request wrote");
  // refusals
  await expect("A9 endpoint host not a push service", post(subBody({ subscription: { endpoint: "https://evil.example/fcm/send/x", keys: { p256dh: P256DH, auth: AUTH } } })), 400, (j) => eq(j, { ok: false, code: "invalid" }, "A9 bad host body"));
  ok(sbCalls.length === 0, "A9: a bad endpoint host wrote");
  await expect("A9 http endpoint", post(subBody({ subscription: { endpoint: ENDPOINT.replace("https:", "http:"), keys: { p256dh: P256DH, auth: AUTH } } })), 400);
  await expect("A9 endpoint over 1000 chars", post(subBody({ subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/" + "a".repeat(1000), keys: { p256dh: P256DH, auth: AUTH } } })), 400);
  await expect("A9 short p256dh", post(subBody({ subscription: { endpoint: ENDPOINT, keys: { p256dh: "abc", auth: AUTH } } })), 400);
  await expect("A9 bad auth chars", post(subBody({ subscription: { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: "!!!!!!!!!!!!!!!!!!!!!!" } } })), 400);
  await expect("A9 not json", post(null, { raw: "not json" }), 400);
  await expect("A9 body over 4,096 bytes", post(subBody({ pad: "x".repeat(5000) })), 400);
  ok(sbCalls.length === 0, "A9: a refused request wrote");
  // store failure
  sbStatus = 500;
  await expect("A10 store failure", post(subBody()), 503, (j) => eq(j, { ok: false, code: "unavailable" }, "A10 store failure body"));
  sbStatus = 201;
}
{
  // A10: what the one write holds
  const bodyWithOtherId = subBody({ anonId: OTHER_ANON, anon_id: OTHER_ANON, platform: "ios_pwa", tz: "Europe/London" });
  const { text } = await expect("A10 success", post(bodyWithOtherId), 200, (j) => eq(j, { ok: true }, "A10 success body"));
  ok(sbCalls.length === 1, "A10: success made " + sbCalls.length + " calls, expected exactly the one write");
  const c = sbCalls[0];
  const row = JSON.parse(c.raw);
  eq(Object.keys(row).sort(), ["anon_id", "endpoint_enc", "endpoint_hash", "keys_enc", "platform", "revoked_at", "tz", "updated_at"], "A10: the row has other columns than the contract");
  eq(row.endpoint_hash, createHash("sha256").update(ENDPOINT).digest("hex"), "A10: endpoint_hash is not sha256(endpoint)");
  ok(kc.openField(row.endpoint_enc, "endpoint") === ENDPOINT, "A10: endpoint_enc does not open to the endpoint");
  ok(kc.openField(row.keys_enc, "keys") === JSON.stringify({ p256dh: P256DH, auth: AUTH }), "A10: keys_enc does not open to exactly {p256dh, auth}");
  ok(kc.openField(row.endpoint_enc, "keys") === null, "A10: a sealed endpoint opened as keys");
  eq([row.anon_id, row.platform, row.tz, row.revoked_at], [ANON, "ios_pwa", "Europe/London", null], "A10: anon_id must be the COOKIE even when the body carries another id, and platform and tz are kept");
  ok(/^\d{4}-\d\d-\d\dT/.test(row.updated_at), "A10: updated_at is not a timestamp");
  eq(c.headers.Prefer, "resolution=merge-duplicates,return=minimal", "A10: the upsert Prefer header is wrong");
  ok(!c.u.includes(ENDPOINT) && !c.u.includes("fcm.googleapis.com") && !c.u.includes(encodeURIComponent(ENDPOINT)), "A10: the URL holds the endpoint");
  ok(!c.raw.includes(ENDPOINT) && !c.raw.includes("fcm.googleapis.com") && !c.raw.includes(P256DH) && !c.raw.includes(AUTH), "A10: the stored row holds the endpoint or a key in plain text");
  ok(!text.includes(ENDPOINT) && !text.includes("fcm.googleapis.com"), "A10: the response holds the endpoint");
  ok(!consoleLines.some((l) => l.includes(ENDPOINT) || l.includes("fcm.googleapis.com") || l.includes(P256DH)), "A10: a log line holds the endpoint or a key");
  ok(consoleLines.concat(["x " + ENDPOINT]).some((l) => l.includes(ENDPOINT)), "A10 control: the log scan does not find a known endpoint");
  // sanitizing: bad platform becomes null, bad tz becomes the default
  await expect("A10 sanitize", post(subBody({ platform: "toaster", tz: "not a zone!!" })), 200);
  const r2 = JSON.parse(sbCalls[0].raw);
  eq([r2.platform, r2.tz], [null, "America/New_York"], "A10: a bad platform must become null and a bad tz America/New_York");
  ok(!allCalls.some((x) => /wf_web_push_subscriptions/.test(x.u)), "A10: the member daily picks table was touched");
  ok(allCalls.every((x) => x.u.startsWith(SB + "/rest/v1/wf_reengage_push_subs")), "A10: a call went somewhere other than wf_reengage_push_subs: " + JSON.stringify([...new Set(allCalls.map((x) => x.u))]));
}

// ══ A11. the real middleware ════════════════════════════════════════════════════
{
  const entry = rel("middleware.js");
  const mwSrc = read("middleware.js");
  const source = mwSrc.replace('import { NextResponse } from "next/server";', 'const NextResponse = { next: () => new Response(null, { status: 204 }) };');
  ok(source !== mwSrc, "A11: the middleware NextResponse import was not stubbed, so the checks below ran against nothing");
  const real = await loadComponent(entry, ROOT, { sourceOverrides: new Map([[entry, source]]) });
  ok(real.config.matcher.includes("/api/reengage/email"), "A11 positive control: an existing matcher entry was not found");
  ok(real.config.matcher.includes("/api/reengage/push") && real.config.matcher.includes("/api/reengage/signal"), "A11: /api/reengage/push or /api/reengage/signal is missing from the middleware matcher");
  const mw = (p, ip, headers = { "sec-fetch-site": "same-origin" }, method = "POST") => real.middleware({ nextUrl: new URL("https://www.gowayfind.com" + p), method, headers: new Headers({ "x-forwarded-for": ip, ...headers }) }).status;
  // positive control: the existing email route is gated the same way
  ok(mw("/api/reengage/email", "203.0.113.1", { "sec-fetch-site": "cross-site", origin: "https://external.example" }) === 403 && mw("/api/reengage/email", "203.0.113.1") === 204, "A11 positive control: /api/reengage/email is not 403 cross-site and 204 same-origin");
  for (const p of ["/api/reengage/push", "/api/reengage/signal"]) {
    ok(mw(p, "203.0.113.2", { "sec-fetch-site": "cross-site", origin: "https://external.example" }) === 403, `A11: a cross-site POST to ${p} was not refused`);
    ok(mw(p, "203.0.113.2", {}) === 403, `A11: a headerless POST to ${p} was not refused`);
    ok(mw(p, "203.0.113.2") === 204, `A11: a same-origin POST to ${p} was refused`);
  }
  const push = Array.from({ length: 7 }, () => mw("/api/reengage/push", "198.51.100.40"));
  ok(push.slice(0, 5).every((s) => s === 204) && push[5] === 429 && push[6] === 429, "A11: the per-IP limit on /api/reengage/push is not 5 a minute: " + push.join());
  const sig = Array.from({ length: 32 }, () => mw("/api/reengage/signal", "198.51.100.41"));
  ok(sig.slice(0, 30).every((s) => s === 204) && sig[30] === 429, "A11: the per-IP limit on /api/reengage/signal is not 30 a minute (31st must be 429): " + sig.join());
  // their OWN buckets: spending push does not spend signal or email, and the reverse
  ok(mw("/api/reengage/signal", "198.51.100.40") === 204, "A11: push POSTs spent the signal rate limit (shared bucket)");
  ok(mw("/api/reengage/email", "198.51.100.40") === 204, "A11: push POSTs spent the email rate limit (shared bucket)");
  ok(mw("/api/reengage/push", "198.51.100.41") === 204, "A11: signal POSTs spent the push rate limit (shared bucket)");
}

// ══ A12. SOURCE-LEVEL (weaker: it reads text) ══════════════════════════════════
{
  const importRx = /^\s*import\s/gm;
  ok([..."import a from 'x';\nconst b = 1;".matchAll(importRx)].length === 1, "A12 positive control: the import scan does not count a known static import");
  const boot = stripComments(read("app/components/reengageBoot.js"));
  ok([...boot.matchAll(importRx)].length === 0, "A12 SOURCE-LEVEL: reengageBoot.js has a static import statement (first load JS budget)");
  ok(/import\(\s*["']\.\.\/\.\.\/lib\/reengagePushClient\.js["']\s*\)/.test(boot) && /import\(\s*["']\.\/PushPrompt["']\s*\)/.test(boot), "A12 SOURCE-LEVEL: the push client and the prompt are not loaded lazily with import()");
  ok(/process\.env\.NEXT_PUBLIC_WF_REENGAGE_PUSH !== "1"\) return undefined/.test(boot), "A12 SOURCE-LEVEL: the push step is not gated on the build flag literally (the bundler needs the literal compare)");
  // nothing in the eager graph may reach the push modules
  for (const file of ["app/layout.js", "app/components/ReengageMount.js", "lib/reengageClient.js", "app/components/ReturnBanner.js", "app/components/EmailItineraryDrawer.js"]) {
    const src = stripComments(read(file));
    ok(!/reengagePushClient|PushPrompt|reengagePushCrypto|reengagePushStore|webPushClient|alertPolicy/.test(src), `A12 SOURCE-LEVEL: ${file} mentions a push module, so it could land in first load JS`);
  }
  // the server only modules are not imported by any client file
  for (const file of ["lib/reengagePushClient.js", "app/components/PushPrompt.js"]) {
    ok(!/reengagePushCrypto|reengagePushStore|node:crypto/.test(stripComments(read(file))), `A12 SOURCE-LEVEL: ${file} imports a server only module`);
  }
  ok(stripComments(read("app/components/ReengageMount.js")).includes('import("./reengageBoot")'), "A12 SOURCE-LEVEL: ReengageMount no longer loads the boot lazily (the contract says it is not edited)");
  // copy: plain words, no dashes as punctuation in what the visitor reads
  const copy = read("app/components/PushPrompt.js");
  ok(!/[–—]/.test(copy) && !/\b(?:new|only|last chance|hurry|limited)\b/i.test((copy.match(/"[^"\n]{12,}"/g) || []).join(" ")), "A12 SOURCE-LEVEL: the prompt copy has a dash or a pressure word");
}

console.log(`test-reengage-push: OK, ${passed} assertions (kernel vector, truth table and navigator table each red-proved in this run; prompt rendered and clicked in a real DOM; route and middleware executed; SOURCE-LEVEL checks labeled)`);
