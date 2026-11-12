#!/usr/bin/env node
// test-home-feed-rerender: a state change on the home page must not re-render the feed's cards.
//
// WHY (2026-11-11). Phone measurements on production (4x CPU throttle, Long Animation Frames):
// scrolling "/" blocked the main thread for 19.7 s, in frames of 3.5 s, 3.4 s and 2.4 s. Every big
// frame was ONE React commit that re-rendered ~3,100 components, about 500 of them the Christmas rail
// cards, because (1) app/home.js polled the PostHog itinerary flags once a second for 20 s and handed
// React a FRESH object every time, so the whole page re-rendered once a second even when no flag
// changed, and (2) ChristmasRailSection built every card inline with fresh closures, so any parent
// render rebuilt all of them. Fixed by lib/itineraryFlags.nextItineraryFlags (returns the previous
// object when nothing changed) and by ChristmasRailCard (a memo whose props are primitives plus the
// stable `card` row; the parent's callbacks travel through a ref read at CALL time).
//
// WHAT THIS PROVES (executed, not grepped):
//   1. nextItineraryFlags keeps identity for an equal read and hands back the new object for a real
//      change (positive and negative control).
//   2. app/home.js routes the poll through it (syntactic role, comment-stripped; the probe is proven
//      against a known positive first).
//   3. The REAL ChristmasIntentRails is mounted with react-dom/client in jsdom. Re-rendering its parent
//      with brand new callbacks and an unchanged liked map renders ZERO ChristmasRailCard fibers
//      (counted through the React devtools commit hook), a real change to one card's liked state
//      re-renders exactly that card, and a tap after the re-render runs the NEWEST handler, never a
//      stale one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { nextItineraryFlags, EMPTY_ITINERARY_FLAGS, readItineraryFlags } from "../lib/itineraryFlags.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

/* 1. the flag helper, executed ------------------------------------------------------------------*/
{
  const a = readItineraryFlags({ isFeatureEnabled: (k) => k === "itinerary_v2" || k === "itinerary_sync" });
  const same = readItineraryFlags({ isFeatureEnabled: (k) => k === "itinerary_v2" || k === "itinerary_sync" });
  ok(a !== same, "CONTROL: readItineraryFlags returns a FRESH object on every call, which is the bug's trigger");
  ok(nextItineraryFlags(a, same) === a, "equal flags: the previous object is returned, so React bails out of the render");
  const changed = readItineraryFlags({ isFeatureEnabled: (k) => k === "itinerary_v2" });
  ok(nextItineraryFlags(a, changed) === changed, "a real flag change hands back the NEW object (the feature must still turn on and off)");
  const empty = readItineraryFlags(null);
  ok(nextItineraryFlags(EMPTY_ITINERARY_FLAGS, empty) === EMPTY_ITINERARY_FLAGS, "no PostHog at all: the frozen empty object stays put");
  ok(nextItineraryFlags(null, a) === a, "no previous value: the new one is used");
}

/* 2. the call site in app/home.js ---------------------------------------------------------------*/
{
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  const PROBE = /setItineraryFlags\(\s*\(prev\)\s*=>\s*nextItineraryFlags\(prev,\s*next\)\s*\)/g;
  ok(PROBE.test("setItineraryFlags((prev) => nextItineraryFlags(prev, next))"), "CONTROL: the call-site probe finds a known positive");
  ok((home.match(/setItineraryFlags\(\s*\(prev\)\s*=>\s*nextItineraryFlags\(prev,\s*next\)\s*\)/g) || []).length === 1, "app/home.js sets the flags through nextItineraryFlags exactly once");
  const calls = (home.match(/\bsetItineraryFlags\(/g) || []).length;
  ok(calls === 1, "setItineraryFlags has no other call site that could hand React a fresh object (found " + calls + ")");
  ok(!/setItineraryFlags\(\s*readItineraryFlags\(/.test(home), "the bare setItineraryFlags(readItineraryFlags(...)) form is gone");
}

/* 3. the real rail, mounted -----------------------------------------------------------------------*/
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://www.gowayfind.com/", pretendToBeVisual: true });
for (const field of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "Event", "CustomEvent", "getComputedStyle", "MouseEvent", "PointerEvent"]) {
  if (field === "PointerEvent" && !dom.window.PointerEvent) continue;
  Object.defineProperty(globalThis, field, { value: field === "window" ? dom.window : dom.window[field], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
process.env.NODE_ENV = "test";

// Count fibers rendered per commit through the devtools hook (set BEFORE react-dom loads).
const seen = new WeakMap();
let commitId = 0;
const renderedByName = [];
globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, isDisabled: false,
  onCommitFiberRoot(_id, root) {
    const cid = ++commitId; const counts = {};
    const walk = (f) => {
      while (f) {
        const isComp = f.tag === 0 || f.tag === 11 || f.tag === 15;
        const wasCurrent = seen.get(f) === cid - 1;
        seen.set(f, cid);
        if (isComp && !wasCurrent && (f.flags & 1) && f.alternate) {
          const n = (f.type && (f.type.displayName || f.type.name)) || "?";
          counts[n] = (counts[n] || 0) + 1;
        }
        if (f.child) walk(f.child);
        f = f.sibling;
      }
    };
    walk(root.current);
    renderedByName.push(counts);
  },
};

const { loadComponent } = await import("./lib/jsxLoad.mjs");
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const act = React.act;
const e = React.createElement;

const RAIL_IDS = ["lights", "towns", "theme", "boats", "parades", "movies", "shopping", "parties", "treats"];
const ev = (rid, i) => ({ id: `${rid}-ev-${i}`, kind: "event", name: `${rid} event ${i}`, title: `${rid} event ${i}`, city: "Tampa", start_date: "2099-12-20", end_date: "2099-12-22", url: "https://example.com/e" + i, image: null });
const pl = (rid, i) => ({ id: `${rid}-pl-${i}`, kind: "place", name: `${rid} place ${i}`, image: null, wfScore: 88, reviews: 120, take: "A reason to go." });
const payload = { rails: RAIL_IDS.map((id) => ({ id, title: "Rail " + id, deck: "Deck " + id, guide: null, total: 6, cards: [ev(id, 1), ev(id, 2), ev(id, 3), pl(id, 1), pl(id, 2), pl(id, 3)] })), tours: [] };

globalThis.fetch = (url) => {
  const body = String(url).startsWith("/api/events/christmas") ? payload : {};
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });
};

const mod = await loadComponent(path.join(ROOT, "app/components/ChristmasIntentRails.js"), ROOT);
const Rails = mod.default;
ok(typeof Rails === "function", "CONTROL: the real ChristmasIntentRails loaded (everything below is vacuous without it)");

const container = document.getElementById("root");
const root = createRoot(container);
const center = { lat: 27.95, lng: -82.46 };
const calls = [];
const handlersA = { onOpenPlace: (p) => calls.push("A:" + p.id), onTrack: () => {}, isSaved: () => false, onSave: () => {}, onLike: () => {}, onDislike: () => {}, onShare: () => {} };
const mount = (handlers, likedMap) => e(Rails, { active: true, center, city: "Tampa", ...handlers, liked: likedMap, disliked: {}, isLiked: undefined, isDisliked: undefined });
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 15)); }); };

const likedEmpty = {};
await act(async () => { root.render(mount(handlersA, likedEmpty)); });
await settle();

const cardNodes = () => [...container.querySelectorAll("article.wf-place-card")];
const total = cardNodes().length;
ok(total >= RAIL_IDS.length * 6, "the rails rendered their cards (" + total + " article.wf-place-card, expected at least " + RAIL_IDS.length * 6 + ")");
const sample = cardNodes()[0];

// (a) parent re-renders with brand NEW closures and the same liked map: no card may re-render.
const handlersB = { onOpenPlace: (p) => calls.push("B:" + p.id), onTrack: () => {}, isSaved: () => false, onSave: () => {}, onLike: () => {}, onDislike: () => {}, onShare: () => {} };
const before = renderedByName.length;
await act(async () => { root.render(mount(handlersB, likedEmpty)); });
const commitCounts = renderedByName.slice(before);
const rerenderedCards = commitCounts.reduce((s, c) => s + (c.ChristmasRailCard || 0), 0);
const rerenderedSections = commitCounts.reduce((s, c) => s + (c.ChristmasRailSection || 0), 0);
ok(rerenderedSections >= RAIL_IDS.length, "CONTROL: the sections DID re-render for the new props (" + rerenderedSections + "), so the counter sees renders and a zero below is a real zero");
ok(rerenderedCards === 0, "a parent render with new callbacks re-rendered " + rerenderedCards + " ChristmasRailCard fibers; it must be 0");
ok(cardNodes()[0] === sample, "the card DOM nodes are the same objects (nothing was remounted)");

// (b) a tap after the re-render must run the NEWEST handler.
const placeCard = cardNodes().find((n) => /place \d/.test(n.getAttribute("aria-label") || ""));
ok(!!placeCard, "found a place card to tap");
calls.length = 0;
await act(async () => { placeCard.querySelector(".wf-place-card-layout").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
ok(calls.length === 1 && calls[0].startsWith("B:"), "the tap ran the newest onOpenPlace, not the stale one (calls: " + JSON.stringify(calls) + ")");

// (c) a REAL change to one card's liked state must still reach that card, and only that card.
const target = payload.rails[0].cards.find((c) => c.kind === "place");
const likedOne = { [target.id]: true };
const before2 = renderedByName.length;
await act(async () => { root.render(mount(handlersB, likedOne)); });
const changed = renderedByName.slice(before2).reduce((s, c) => s + (c.ChristmasRailCard || 0), 0);
ok(changed === 1, "liking one place re-rendered " + changed + " ChristmasRailCard fibers; it must be exactly 1 (a memo that freezes a real change is worse than none)");
const likeBtn = container.querySelector('[data-rail="christmas-intent-lights"] article.wf-place-card[aria-label="Open ' + target.name + '"] .wf-place-card-like');
ok(!!likeBtn && /true/.test(likeBtn.getAttribute("aria-pressed") || ""), "the liked card shows the pressed heart (aria-pressed=" + (likeBtn && likeBtn.getAttribute("aria-pressed")) + ")");

// (d) the memo is real and uses the default shallow compare (a custom comparator could hide a change).
const Card = mod.ChristmasRailCard;
ok(!!Card && Card.$$typeof === Symbol.for("react.memo"), "ChristmasRailCard is exported and is a React.memo");
ok(Card.compare == null, "ChristmasRailCard uses React's default shallow comparison, not a custom one");

await act(async () => { root.unmount(); });
console.log("test-home-feed-rerender: OK, " + checks + " assertions (flag identity helper executed, home.js call site, real ChristmasIntentRails mounted in jsdom: " + total + " cards, 0 re-renders on a parent render, 1 on a real change, newest handler on tap)");
