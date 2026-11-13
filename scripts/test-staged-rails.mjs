#!/usr/bin/env node
// test-staged-rails: the home feed's long rails draw in small slices, never one freeze.
//
// WHY (2026-11-13). Production profile, iPhone 13 emulation, 4x CPU: the home feed's first draw was
// ONE React commit of about 6,700 DOM elements (a 73-card Christmas rail is about 4,000 by itself),
// a 1.0 to 1.7 s main-thread frame, half of it forced style and layout. A rail is a horizontal strip, so
// only its first card or two is on screen. lib/stagedMount.js draws the first CARD_FIRST cards at once
// and the rest CARD_CHUNK at a time, one slice per task through one shared queue.
//
// WHAT THIS PROVES (executed against the real components, mounted with react-dom/client in jsdom):
//   1. The queue: a job never runs synchronously, jobs run one per task in order, cancel works, and a
//      pending touch/key (navigator.scheduling.isInputPending) holds the next slice back.
//   2. The REAL ChristmasIntentRails, fed rails of 40 cards: no single DOM batch ever adds more than
//      (STAGE_FIRST rails x CARD_FIRST) + CARD_CHUNK cards, the first batch holds only CARD_FIRST cards of
//      the first rail, and once settled every rail holds ALL 40 cards in payload order (nothing dropped,
//      nothing reordered, same count as an unstaged render).
//   3. A rail that has finished staging mounts a later page of cards at once (the paged "load more").
//   4. Server-rendered rails keep their full markup: ThemeParkRail / HomeAffiliateActivityRail stage only
//      when the home feed passes `stagedCards` (a server-rendered rail must hydrate to the same HTML).
//   5. app/home.js passes `stagedCards` to exactly the two feed rails (comment-stripped, probe proven).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://www.gowayfind.com/", pretendToBeVisual: true });
for (const field of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "Event", "CustomEvent", "getComputedStyle", "MouseEvent"]) {
  Object.defineProperty(globalThis, field, { value: field === "window" ? dom.window : dom.window[field], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = false; // real timers and the real React scheduler: batches are what the browser would see
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
process.env.NODE_ENV = "test";

const staged = await import("../lib/stagedMount.js");
const { CARD_FIRST, CARD_CHUNK, CARD_GAP_MS, INPUT_HOLD_MS, COMMIT_WAIT_MS, enqueueMount, mountCommitted, pendingMounts, shownCount, noteInput, inputHoldLeft } = staged;
// A job's owner reports its commit (the hooks do it from an effect); test jobs report at once.
const reported = (fn) => () => { fn(); mountCommitted(); };

/* 1. the queue, executed ------------------------------------------------------------------------*/
{
  ok(CARD_FIRST >= 1 && CARD_FIRST <= 12 && CARD_CHUNK >= 2 && CARD_CHUNK <= 24 && CARD_GAP_MS >= 0 && CARD_GAP_MS <= 100, "slice constants are sane (first " + CARD_FIRST + ", then " + CARD_CHUNK + " per task, " + CARD_GAP_MS + " ms apart)");
  ok(shownCount(Infinity, 40) === 40 && shownCount(6, 40) === 6 && shownCount(6, 4) === 4, "shownCount: Infinity = everything, otherwise the smaller of limit and total");
  const ran = [];
  const cancelB = enqueueMount(reported(() => ran.push("b")));
  enqueueMount(reported(() => ran.push("a")));
  const cancelC = enqueueMount(reported(() => ran.push("c")));
  ok(ran.length === 0 && pendingMounts() === 3, "CONTROL: nothing runs synchronously inside enqueueMount (" + ran.length + " ran, " + pendingMounts() + " queued)");
  cancelB(); cancelC();
  ok(pendingMounts() === 1, "cancel removes a queued job");
  await sleep(CARD_GAP_MS + 40);
  ok(ran.join("") === "a" && pendingMounts() === 0, "a cancelled job never runs; the rest do (" + ran.join("") + ")");
  // one job per task: three jobs enqueued together are separated by timers, never run back to back
  const stamps = [];
  for (let i = 0; i < 3; i++) enqueueMount(reported(() => stamps.push(process.hrtime.bigint())));
  await sleep((CARD_GAP_MS + 20) * 3 + 60);
  ok(stamps.length === 3, "three jobs ran");
  ok(stamps[1] - stamps[0] >= BigInt(Math.max(0, CARD_GAP_MS - 5)) * 1_000_000n, "CONTROL: jobs are separated by at least the gap (not one task): " + Number(stamps[1] - stamps[0]) / 1e6 + " ms");
  // a pending touch holds the slice back
  let pending = true; const ran2 = [];
  Object.defineProperty(globalThis.navigator, "scheduling", { value: { isInputPending: () => pending }, configurable: true });
  enqueueMount(reported(() => ran2.push("x")));
  await sleep(CARD_GAP_MS * 3 + 30);
  ok(ran2.length === 0, "input pending: the slice waits (" + ran2.length + " ran)");
  pending = false;
  await sleep(CARD_GAP_MS * 2 + 30);
  ok(ran2.length === 1, "input handled: the slice runs");
  delete globalThis.navigator.scheduling;
  // ONE slice in flight: the next job waits for the previous one's commit report, so two slices can
  // never be rendered into one React commit (they were: "slices of 20" landed as commits of 40).
  ok(COMMIT_WAIT_MS >= 150 && COMMIT_WAIT_MS <= 1000, "the no-report fallback is bounded (" + COMMIT_WAIT_MS + " ms)");
  const order = [];
  enqueueMount(() => order.push("first"));            // its owner has NOT reported yet
  await sleep(CARD_GAP_MS * 2 + 40);
  ok(order.join() === "first", "CONTROL: the first job started");
  // queued WHILE the first is in flight, which is what the other rails' effects do on the page
  enqueueMount(reported(() => order.push("second")));
  await sleep(CARD_GAP_MS * 3 + 60);
  ok(order.join() === "first", "a job queued during a flight does not start while that slice is uncommitted (" + order.join() + ")");
  mountCommitted();
  await sleep(CARD_GAP_MS * 3 + 80);
  ok(order.join() === "first,second", "the commit report releases the next job");
  const lone = [];
  enqueueMount(() => lone.push("silent"));             // an owner that never reports
  enqueueMount(reported(() => lone.push("next")));
  await sleep(COMMIT_WAIT_MS + CARD_GAP_MS * 3 + 250);
  ok(lone.join() === "silent,next", "an owner that never reports only delays the queue by the fallback, it cannot stall it");
}

/* 2. the real rails, mounted ----------------------------------------------------------------------*/
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const e = React.createElement;
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const mod = await loadComponent(path.join(ROOT, "app/components/ChristmasIntentRails.js"), ROOT);
const Rails = mod.default;
ok(typeof Rails === "function", "CONTROL: the real ChristmasIntentRails loaded");

const RAIL_IDS = ["lights", "towns", "theme", "boats", "parades", "movies", "shopping", "parties", "treats"];
const N = 80; // four slices of CARD_CHUNK and change: a whole rail in one batch would need four slices to coalesce
const pl = (rid, i) => ({ id: `${rid}-pl-${i}`, kind: "place", name: `${rid} place ${i}`, image: null, wfScore: 88, reviews: 120, take: "A reason to go." });
const makeRails = (n) => RAIL_IDS.map((id) => ({ id, title: "Rail " + id, deck: "Deck " + id, guide: null, total: n, cards: Array.from({ length: n }, (_, i) => pl(id, i + 1)) }));
let payload = { rails: makeRails(N), tours: [] };
globalThis.fetch = (url) => {
  const body = String(url).startsWith("/api/events/christmas") ? payload : {};
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });
};

const host = document.getElementById("root");
let lightsAtFirstBatch = -1;
const batches = []; // cards added per DOM batch, with the rail that got them
const cardsIn = (node) => (node.nodeType === 1 ? [...(node.matches("article.wf-place-card") ? [node] : []), ...node.querySelectorAll("article.wf-place-card")] : []);
const observer = new MutationObserver((records) => {
  const added = [];
  for (const r of records) for (const n of r.addedNodes) added.push(...cardsIn(n));
  if (added.length) { batches.push(added.length); if (batches.length === 1) lightsAtFirstBatch = host.querySelectorAll('[data-rail="christmas-intent-lights"] article.wf-place-card').length; }
});
observer.observe(host, { childList: true, subtree: true });
const root = createRoot(host);
const center = { lat: 27.95, lng: -82.46 };
const noop = () => {};
root.render(e(Rails, { active: true, center, city: "Tampa", onOpenPlace: noop, onTrack: noop, isSaved: () => false, onSave: noop, onLike: noop, onDislike: noop, onShare: noop, liked: {}, disliked: {} }));
await sleep(400);
const firstBatch = batches[0] || 0;
const lightsEarly = lightsAtFirstBatch;
ok(firstBatch > 0 && firstBatch <= CARD_FIRST * mod.STAGE_FIRST, "the first DOM batch holds at most STAGE_FIRST x CARD_FIRST = " + CARD_FIRST * mod.STAGE_FIRST + " cards (got " + firstBatch + ")");
ok(lightsEarly >= 1 && lightsEarly <= CARD_FIRST, "at the first DOM batch the first rail holds only its first slice (" + lightsEarly + " of " + N + ")");
// settle: every rail staged in, every slice drawn
const total = RAIL_IDS.length * N;
for (let i = 0; i < 400 && host.querySelectorAll("article.wf-place-card").length < total; i++) await sleep(50);
observer.disconnect();
const maxBatch = Math.max(...batches);
ok(host.querySelectorAll("article.wf-place-card").length === total, "after settling every rail holds ALL its cards (" + host.querySelectorAll("article.wf-place-card").length + " of " + total + ")");
// The bound is "never a whole rail in one batch", not "exactly one slice per batch": on a loaded
// machine a second queue timer can come due before React has rendered the first slice, and React
// then commits both slices together (CI saw 16 = two slices of 8). That is still a small commit.
// Reaching N would need five slices to coalesce, which the one-timer-at-a-time queue does not allow.
ok(maxBatch < N, "no single DOM batch added a whole rail (" + N + " cards): largest " + maxBatch + ", over " + batches.length + " batches");
ok(batches.length >= total / (CARD_FIRST + CARD_CHUNK), "CONTROL: the cards really arrived in many batches (" + batches.length + "), so the cap above is a real measurement");
for (const rid of RAIL_IDS) {
  const labels = [...host.querySelectorAll(`[data-rail="christmas-intent-${rid}"] article.wf-place-card`)].map((n) => n.getAttribute("aria-label"));
  const want = Array.from({ length: N }, (_, i) => `Open ${rid} place ${i + 1}`);
  ok(labels.length === N && labels.every((l, i) => l === want[i]), "rail " + rid + " holds its " + N + " cards in payload order");
}
await new Promise((r) => { root.unmount(); setTimeout(r, 20); });

/* 3. a later page after completion mounts at once -------------------------------------------------*/
{
  const { useStagedCards } = staged;
  const seen = [];
  function Probe({ total }) { const shown = useStagedCards(total, true); seen.push(shown); return e("i", { "data-shown": shown }); }
  const h = document.createElement("div"); document.body.appendChild(h);
  const r = createRoot(h);
  r.render(e(Probe, { total: 20 }));
  await sleep(CARD_GAP_MS * 6 + 400);
  ok(h.firstChild.getAttribute("data-shown") === "20", "the probe rail finished staging all 20 cards");
  r.render(e(Probe, { total: 30 }));
  await sleep(Math.max(2, Math.floor(CARD_GAP_MS / 3))); // well inside one slice gap: a slice timer could not have fired yet
  ok(h.firstChild.getAttribute("data-shown") === "30", "a later page (20 to 30 cards) mounts at once, not slice by slice");
  const h2 = document.createElement("div"); document.body.appendChild(h2);
  const r2 = createRoot(h2);
  function Short() { return e("i", { "data-shown": useStagedCards(CARD_FIRST - 1, true) }); }
  r2.render(e(Short));
  await sleep(30);
  ok(h2.firstChild.getAttribute("data-shown") === String(CARD_FIRST - 1), "a rail shorter than one slice is untouched");
  function Idle() { return e("i", { "data-shown": useStagedCards(30, false) }); }
  const h3 = document.createElement("div"); document.body.appendChild(h3);
  const r3 = createRoot(h3); r3.render(e(Idle));
  await sleep(CARD_GAP_MS * 4 + 100);
  ok(h3.firstChild.getAttribute("data-shown") === String(CARD_FIRST), "an inactive rail (still behind its skeleton) spends no slices");
  for (const x of [r, r2, r3]) x.unmount();
}

/* 4. server-rendered rails keep their full markup ---------------------------------------------------*/
{
  const { renderToStaticMarkup } = await import("react-dom/server");
  const items = Array.from({ length: 20 }, (_, i) => ({ code: "P" + i, title: "Tour " + i, image: "https://example.com/t" + i + ".jpg", city: "Tampa", reviews: 100 + i, rating: 4.6, fromPrice: 50 + i, url: "/api/commerce/go?provider=viator&offer=P" + i }));
  const AR = (await loadComponent(path.join(ROOT, "app/components/HomeAffiliateActivityRail.js"), ROOT)).default;
  const count = (html) => (html.match(/<article class="wf-place-card wf-rail-card"/g) || []).length;
  const plain = count(renderToStaticMarkup(e(AR, { items, contentId: "Tampa", onLog: noop })));
  const stagedHtml = count(renderToStaticMarkup(e(AR, { items, contentId: "Tampa", onLog: noop, stagedCards: true })));
  ok(plain === 20, "CONTROL: an un-staged HomeAffiliateActivityRail server-renders every card (" + plain + ")");
  ok(stagedHtml === CARD_FIRST, "stagedCards turns the slicing on: the first render holds " + CARD_FIRST + " of " + plain + " (got " + stagedHtml + ")");
  const TP = (await loadComponent(path.join(ROOT, "app/components/ThemeParkRail.js"), ROOT)).default;
  ok(typeof TP === "function" && /\bstagedCards\s*=\s*false\b/.test(strip(readFileSync(path.join(ROOT, "app/components/ThemeParkRail.js"), "utf8"))), "ThemeParkRail defaults to un-staged (landing pages server-render it; the seeded-markup guard test-landing-ssr-rails covers the full output)");
}

/* 5. the wiring in app/home.js ------------------------------------------------------------------------*/
{
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  const PROBE = /<ThemeParkRail\s+mode="flagship"\s+stagedCards\s/g;
  ok((("<ThemeParkRail\n mode=\"flagship\"\n stagedCards\n").match(PROBE) || []).length === 1, "CONTROL: the call-site probe finds a known positive");
  ok((home.match(/<HomeAffiliateActivityRail\s+items=\{homeAffiliateItems\}\s+stagedCards\s/g) || []).length === 1, "the home feed's activity rail is staged");
  ok((home.match(/<ThemeParkRail\s+mode="flagship"\s+stagedCards\s/g) || []).length === 1, "the home feed's flagship park rail is staged");
  ok((home.match(/\bstagedCards\b/g) || []).length === 2, "stagedCards appears exactly twice in app/home.js (the family and browse rails stay un-staged)");
  const rails = strip(readFileSync(path.join(ROOT, "app/components/ChristmasIntentRails.js"), "utf8"));
  ok(/useStagedCards\(\s*items\.length,\s*staged\s*&&\s*renderState\s*===\s*RAIL_RENDER_STATE\.CONTENT\s*\)/.test(rails), "ChristmasRailSection stages its cards only while it is drawing them");
  ok(/items\.slice\(0,\s*shown\)\.map\(/.test(rails), "ChristmasRailSection draws items.slice(0, shown)");
  ok(/loadingMore\s*&&\s*shown\s*>=\s*items\.length/.test(rails), "the 'Loading more' tile waits for the last slice");
}

// A person touching the page pauses the queue (2026-11-13: with slices still mounting, a card tap
// on production took about 4.4 s instead of about 3.0 s; the tap now gets the main thread first).
{
  ok(INPUT_HOLD_MS >= 500 && INPUT_HOLD_MS <= 3000, "the input hold is long enough for a sheet to open and short enough to resume (" + INPUT_HOLD_MS + " ms)");
  ok(inputHoldLeft() === 0, "CONTROL: with no recent input the queue is free to run");
  let ranFree = false; enqueueMount(reported(() => { ranFree = true; }));
  await sleep(CARD_GAP_MS * 3 + 60);
  ok(ranFree, "CONTROL: a job runs promptly when nobody is touching the page");
  noteInput();
  ok(inputHoldLeft() > INPUT_HOLD_MS - 200 && inputHoldLeft() <= INPUT_HOLD_MS, "after input the queue holds for INPUT_HOLD_MS");
  let ranHeld = false; enqueueMount(reported(() => { ranHeld = true; }));
  await sleep(CARD_GAP_MS * 3 + 120);
  ok(!ranHeld, "a job queued right after input does NOT run inside the hold");
  // a real DOM event on window re-arms the hold (the listener is installed by the queue itself)
  await sleep(INPUT_HOLD_MS / 2);
  window.dispatchEvent(new window.Event("pointerdown"));
  const afterEvent = inputHoldLeft();
  ok(afterEvent > INPUT_HOLD_MS - 200, "a pointerdown on the page re-arms the hold (" + Math.round(afterEvent) + " ms left)");
  await sleep(INPUT_HOLD_MS / 2 + 150);
  ok(!ranHeld, "and the job is still waiting after the ORIGINAL hold would have ended");
  await sleep(INPUT_HOLD_MS / 2 + CARD_GAP_MS * 3 + 250);
  ok(ranHeld && pendingMounts() === 0, "once the hold ends the job runs: nothing is lost, only delayed");
}

console.log("test-staged-rails: OK, " + checks + " assertions (queue executed; real ChristmasIntentRails mounted with " + RAIL_IDS.length + "x" + N + " cards: " + batches.length + " DOM batches, largest " + maxBatch + ", all " + total + " cards present in order; server-rendered rails untouched; home.js wiring)");
process.exit(0);
