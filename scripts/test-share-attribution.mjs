// Share attribution v2 contract (lib/shareAttribution.js, docs/SHARE_ATTRIBUTION.md).
//
// Locks the two things that went wrong in v1 and the contract that replaced it:
//   1. FALSE COUNTING. share_open fired on every ?place=/?rail= load, including
//      the app's own internal navigation (8,557 of ~9,000 place landings in
//      the 30 days before cutover had www.gowayfind.com as referrer). A plain
//      deep-link load, a refresh, or a re-render must produce ZERO v2 events.
//   2. NO LINKAGE. Nothing tied a recipient to a share. v2 carries one random
//      token from share_opened → attempted → completed → shared_link_visited →
//      shared_recipient_converted, with dedupe, self-visit and consent rules.
// Everything is EXECUTED against a fake window (and jsdom for the chooser),
// not grepped.
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  SHARE_TOKEN_PARAM, SHARE_V2_EVENTS, CONVERSION_EVENTS, ATTRIBUTION_WINDOW_MS,
  mintShareToken, isValidShareToken, withShareToken, beginShareFlow, joinOrBeginShareFlow,
  captureSharedLinkVisit, installSharedConversionHook, noteShareAttempted, noteShareCompleted,
  attributionAllowed, __resetShareAttributionForTests,
} from "../lib/shareAttribution.js";
import { captureOrQueue, INTERNAL_BROWSER_KEY } from "../lib/browserAnalytics.js";
import { preserveRedirectParams } from "../lib/preserveRedirectParams.js";

let failures = 0;
const fail = (m) => { console.error("test-share-attribution: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function fakeWin(href, { ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", gpc = false, optedOut = false, noStorage = false } = {}) {
  const events = [];
  const win = {
    location: new URL(href),
    navigator: { userAgent: ua, webdriver: false, globalPrivacyControl: gpc },
    crypto: webcrypto,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    posthog: { capture: (e, p) => events.push([e, p]), has_opted_out_capturing: () => optedOut },
    history: { state: null, replaceState(state, _t, url) { win.location = new URL(url, win.location.origin); } },
    events,
  };
  if (noStorage) Object.defineProperty(win, "localStorage", { get() { throw new Error("SecurityError"); } });
  else win.localStorage = memStore();
  return win;
}
const v2 = (win) => win.events.filter(([e]) => Object.values(SHARE_V2_EVENTS).includes(e));
const named = (win, n) => win.events.filter(([e]) => e === n);

// ── token ────────────────────────────────────────────────────────────────
{
  const w = fakeWin("https://www.gowayfind.com/");
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const t = mintShareToken(w); ok(isValidShareToken(t), "minted token is 22 base64url chars"); seen.add(t); }
  ok(seen.size === 500, "500 tokens are all distinct (128 random bits each)");
  ok(mintShareToken({ ...w, crypto: undefined }) === null, "no crypto API → no token (never a Math.random fallback)");
  ok(!isValidShareToken("abc") && !isValidShareToken("a".repeat(23)) && !isValidShareToken("<script>aaaaaaaaaaaaaaa"), "malformed tokens are rejected");
}

// ── URL tokenization preserves everything else ──────────────────────────
{
  const t = mintShareToken(fakeWin("https://www.gowayfind.com/"));
  const src = "https://www.gowayfind.com/p/ChIJabc?t=Lake%20Eola&loc=Orlando&utm_source=ig&fbclid=XYZ&gclid=G1#top";
  const out = new URL(withShareToken(src, t));
  ok(out.searchParams.get(SHARE_TOKEN_PARAM) === t, "token is added as wf_st");
  for (const [k, v] of [["t", "Lake Eola"], ["loc", "Orlando"], ["utm_source", "ig"], ["fbclid", "XYZ"], ["gclid", "G1"]]) ok(out.searchParams.get(k) === v, `withShareToken preserves ${k}`);
  ok(out.pathname === "/p/ChIJabc" && out.hash === "#top", "path and hash preserved");
  const t2 = mintShareToken(fakeWin("https://www.gowayfind.com/"));
  ok(new URL(withShareToken(out.toString(), t2)).searchParams.getAll(SHARE_TOKEN_PARAM).join() === t2, "a re-share replaces, never stacks, the token");
  ok(withShareToken("https://www.gowayfind.com/group-plans/abc?x=1", t) === "https://www.gowayfind.com/group-plans/abc?x=1", "private group plan links never carry a token");
  ok(withShareToken(src, "bad") === src, "invalid token leaves the URL untouched");
  // /s/<code> redirect carries the token to its destination.
  const dest = preserveRedirectParams("/?place=abc", "?wf_st=" + t + "&utm_source=ig", "/s/xyz");
  ok(new URLSearchParams(dest.split("?")[1]).get("wf_st") === t, "/s/ redirect carries wf_st to the destination");
}

// ── ORIGINAL FALSE COUNT: plain deep links make zero v2 events ───────────
{
  __resetShareAttributionForTests();
  const w = fakeWin("https://www.gowayfind.com/?place=ChIJabc&utm_source=ig");
  installSharedConversionHook(w);
  ok(captureSharedLinkVisit(w) === "none", "plain ?place= load is not a shared-link visit");
  const w2 = fakeWin("https://www.gowayfind.com/?rail=brunch");
  ok(captureSharedLinkVisit(w2) === "none", "plain ?rail= load is not a shared-link visit");
  for (let i = 0; i < 5; i++) captureSharedLinkVisit(w); // refresh / re-render
  ok(v2(w).length === 0 && v2(w2).length === 0, "deep links, refreshes and re-renders manufacture no v2 events");
  ok(w.location.search === "?place=ChIJabc&utm_source=ig", "a plain deep link's URL is not touched");
  // A conversion without a share touch is not a shared conversion.
  captureOrQueue(w, "save", {});
  ok(named(w, SHARE_V2_EVENTS.converted).length === 0, "a save with no shared-link visit is not attributed");
}

// ── full journey: sender → recipient → conversion ────────────────────────
{
  __resetShareAttributionForTests();
  const sender = fakeWin("https://www.gowayfind.com/p/ChIJabc");
  const flow = beginShareFlow(sender, { surface: "intent_sheet", kind: "place" });
  ok(isValidShareToken(flow.token), "sender flow has a token");
  const joined = joinOrBeginShareFlow(sender, { surface: "chooser" });
  ok(joined === flow, "the chooser joins the intent sheet's flow (one share, one token)");
  noteShareAttempted(sender, flow, "copy");
  noteShareCompleted(sender, flow, "copy", "clipboard_write");
  noteShareCompleted(sender, flow, "copy", "clipboard_write");
  const s = v2(sender);
  ok(s.map(([e]) => e).join() === "share_opened,share_attempted,share_completed", "sender emits opened, attempted, completed exactly once each: " + s.map(([e]) => e).join());
  ok(s.every(([, p]) => p.share_token === flow.token && p.share_schema === 2), "every sender event carries the same token and share_schema 2");
  ok(named(sender, "share_completed")[0][1].completion_type === "clipboard_write", "completion type recorded");
  ok(joinOrBeginShareFlow(sender, { surface: "chooser" }) !== flow, "a later direct shareOut starts a NEW flow (no stale token reuse)");
  const sheet2 = beginShareFlow(sender, { surface: "intent_sheet", kind: "place" });
  ok(joinOrBeginShareFlow(sender, { surface: "chooser", url: "https://www.gowayfind.com/group-plans/abc" }) !== sheet2, "a group plan share never joins an open place-share flow");

  const link = withShareToken("https://www.gowayfind.com/p/ChIJabc?t=Lake&utm_source=ig", flow.token);
  // Self-visit: the sender opens their own link.
  const selfWin = fakeWin(link); selfWin.localStorage = sender.localStorage;
  ok(captureSharedLinkVisit(selfWin) === "self" && v2(selfWin).length === 0, "sender opening own link is excluded");

  const rec = fakeWin(link);
  installSharedConversionHook(rec);
  ok(captureSharedLinkVisit(rec) === "visited", "recipient visit counted");
  ok(!rec.location.search.includes("wf_st") && rec.location.search.includes("utm_source=ig") && rec.location.search.includes("t=Lake"), "token stripped from the address bar, other params kept: " + rec.location.search);
  const visits = named(rec, SHARE_V2_EVENTS.visited);
  ok(visits.length === 1 && visits[0][1].share_token === flow.token && visits[0][1].landing_path === "place", "one visit, linked to the sender's token");
  // Refresh, back/forward and re-renders: token already gone; re-arriving with it is a duplicate.
  captureSharedLinkVisit(rec);
  const again = fakeWin(link); again.localStorage = rec.localStorage; again.posthog = rec.posthog;
  ok(captureSharedLinkVisit(again) === "duplicate", "same browser reopening the same link is deduplicated");
  ok(named(rec, SHARE_V2_EVENTS.visited).length === 1, "still exactly one visit");
  // Conversions through the real capture path.
  captureOrQueue(rec, "detail_open", {});
  captureOrQueue(rec, "save", {});
  captureOrQueue(rec, "save", {});
  captureOrQueue(rec, "commerce_cta_clicked", {});
  captureOrQueue(rec, "commerce_cta_clicked", {});
  const conv = named(rec, SHARE_V2_EVENTS.converted);
  ok(conv.length === 2, "one conversion per token per conversion type (got " + conv.length + ")");
  ok(conv.every(([, p]) => p.share_token === flow.token && p.attribution === "last_touch"), "conversions carry the token, last touch");
  ok(CONVERSION_EVENTS.includes("save") && CONVERSION_EVENTS.includes("commerce_cta_clicked"), "conversion list is documented");
}

// ── attribution window ───────────────────────────────────────────────────
{
  __resetShareAttributionForTests();
  const t = mintShareToken(fakeWin("https://www.gowayfind.com/"));
  const rec = fakeWin("https://www.gowayfind.com/l/brunch?wf_st=" + t);
  installSharedConversionHook(rec);
  const visitAt = Date.now() - ATTRIBUTION_WINDOW_MS - 60000;
  captureSharedLinkVisit(rec, { now: visitAt });
  captureOrQueue(rec, "save", {});
  ok(named(rec, SHARE_V2_EVENTS.converted).length === 0, "a conversion after the 7-day window is not attributed");
}

// ── malformed, declined, unavailable storage, bots, QA owner ─────────────
{
  __resetShareAttributionForTests();
  const bad = fakeWin("https://www.gowayfind.com/?place=x&wf_st=../../etc");
  ok(captureSharedLinkVisit(bad) === "invalid" && v2(bad).length === 0, "malformed token: no event");
  ok(bad.location.search === "?place=x", "malformed token still removed from the URL");
  const t = mintShareToken(fakeWin("https://www.gowayfind.com/"));
  for (const [label, opts] of [["opted out", { optedOut: true }], ["Global Privacy Control", { gpc: true }], ["bot", { ua: "Googlebot/2.1" }]]) {
    const w = fakeWin("https://www.gowayfind.com/p/x?wf_st=" + t, opts);
    ok(captureSharedLinkVisit(w) === "declined" && v2(w).length === 0, label + ": no visit event");
    ok(!w.location.search.includes("wf_st"), label + ": token still stripped");
    ok(beginShareFlow(w, {}).token === null, label + ": sender mints no token");
  }
  const owner = fakeWin("https://www.gowayfind.com/p/x?wf_st=" + t);
  owner.localStorage.setItem(INTERNAL_BROWSER_KEY, "1");
  ok(attributionAllowed(owner) === false && captureSharedLinkVisit(owner) === "declined", "owner/QA internal-marked browser is declined");
  const nostore = fakeWin("https://www.gowayfind.com/p/x?wf_st=" + t, { noStorage: true });
  ok(captureSharedLinkVisit(nostore) === "visited", "blocked storage: visit still counted once (in-memory)");
  ok(captureSharedLinkVisit(nostore) === "none", "blocked storage: second call sees no token");
  const redirect = fakeWin("https://www.gowayfind.com/s/abc?wf_st=" + t);
  ok(captureSharedLinkVisit(redirect) === "redirect_page" && redirect.location.search.includes("wf_st"), "/s/ redirect page leaves the token for its destination");
}

// ── chooser: copy success/failure, native cancel, composers ──────────────
{
  __resetShareAttributionForTests();
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://www.gowayfind.com/p/x" });
  const g = globalThis;
  const w = dom.window;
  const events = [];
  w.posthog = { capture: (e, p) => events.push([e, p]), has_opted_out_capturing: () => false };
  Object.defineProperty(w, "crypto", { value: webcrypto });
  Object.defineProperty(w.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone) Mobile/15E148", configurable: true });
  for (const k of ["window", "document", "navigator", "localStorage", "sessionStorage", "HTMLElement"]) {
    try { Object.defineProperty(g, k, { value: w[k], configurable: true, writable: true }); } catch (e) {}
  }
  const { shareOut } = await import("../lib/shareOut.js");
  const sharedUrls = [];
  // Clipboard FAILURE first: attempted, not completed.
  w.document.execCommand = () => false;
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
  ok(shareOut({ title: "Lake Eola", url: "https://www.gowayfind.com/p/x?t=Lake" }, () => {}) === "chooser", "chooser opens");
  const btn = (label) => [...w.document.querySelectorAll("#wf-share-out-chooser button, #wf-share-out-chooser a")].find((b) => b.textContent === label);
  const sms = btn("Text message");
  ok(sms && /wf_st%3D[A-Za-z0-9_-]{22}/.test(sms.getAttribute("href")), "the SMS body carries the tokenized link");
  btn("Copy link").click();
  await new Promise((r) => setTimeout(r, 20));
  ok(events.filter(([e]) => e === "share_attempted").length === 1 && events.filter(([e]) => e === "share_completed").length === 0, "clipboard failure: attempted, NOT completed");
  // Clipboard success.
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: (u) => { sharedUrls.push(u); return Promise.resolve(); } }, configurable: true });
  btn("Copy link").click();
  await new Promise((r) => setTimeout(r, 20));
  const comp = events.filter(([e]) => e === "share_completed");
  ok(comp.length === 1 && comp[0][1].method === "copy" && comp[0][1].completion_type === "clipboard_write", "clipboard success: completed once as clipboard_write");
  ok(sharedUrls[0] && new URL(sharedUrls[0]).searchParams.get("wf_st") === comp[0][1].share_token, "the copied URL's token equals the event token");
  // Native cancelled: attempted, not completed.
  events.length = 0;
  Object.defineProperty(w.navigator, "share", { value: () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })), configurable: true });
  shareOut({ title: "Lake Eola", url: "https://www.gowayfind.com/p/x" }, () => {});
  btn("More share options").click();
  await new Promise((r) => setTimeout(r, 20));
  ok(events.some(([e, p]) => e === "share_attempted" && p.method === "native") && !events.some(([e]) => e === "share_completed"), "cancelled native share: attempted, NOT completed");
  // Native resolved.
  events.length = 0;
  Object.defineProperty(w.navigator, "share", { value: () => Promise.resolve(), configurable: true });
  shareOut({ title: "Lake Eola", url: "https://www.gowayfind.com/p/x" }, () => {});
  btn("More share options").click();
  await new Promise((r) => setTimeout(r, 20));
  ok(events.some(([e, p]) => e === "share_completed" && p.completion_type === "native_resolved"), "resolved native share: completed as native_resolved");
  // Text-only share (no URL) still works, with no token.
  events.length = 0;
  ok(shareOut({ title: "Reply", text: "hi" }, () => {}, { textOnly: true }) === "chooser", "text-only share still opens");
  // Analytics blocked entirely: sharing still works.
  delete w.posthog; w.__WF_ANALYTICS_SUPPRESSED = "internal";
  ok(shareOut({ title: "Lake", url: "https://www.gowayfind.com/p/x" }, () => {}) === "chooser", "with analytics suppressed, sharing still opens");
  ok(!/wf_st/.test(btn("Text message").getAttribute("href")), "with analytics suppressed, no token is minted");
}

// ── static: v2 events have exactly one emitter module ────────────────────
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const f of ["app/home.js", "app/components/sheets/Detail.js", "app/components/ShareButton.js"]) {
    const src = strip(readFileSync(f, "utf8"));
    for (const ev of Object.values(SHARE_V2_EVENTS)) ok(!src.includes('"' + ev + '"'), `${f} must not emit ${ev} directly (lib/shareAttribution.js owns it)`);
  }
  const pp = strip(readFileSync("app/components/PostHogProvider.js", "utf8"));
  ok(/captureSharedLinkVisit\(window\)/.test(pp) && pp.indexOf("captureSharedLinkVisit(window)") < pp.indexOf("captureLanding("), "PostHogProvider records the visit before landing capture reads the URL");
  const ba = strip(readFileSync("lib/browserAnalytics.js", "utf8"));
  ok(/__WF_SHARE_CONVERSION_HOOK/.test(ba), "captureOrQueue runs the conversion hook");
}

if (failures) { console.error(`test-share-attribution: ${failures} failure(s)`); process.exit(1); }
console.log("test-share-attribution: OK — no events from plain deep links/refreshes; one token links opened→attempted→completed→visited→converted; dedupe, self-visit, window, consent, malformed, blocked storage, clipboard failure and native cancel all hold");
