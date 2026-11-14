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
const settle = async () => { for (let i = 0; i < 70; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); }); }; // long enough for the staged rail mounts (STAGE_MS apiece)

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

/* 3b. the nine Christmas rails mount one after another, not in one freeze --------------------------*/
{
  ok(mod.STAGE_FIRST >= 1 && mod.STAGE_FIRST <= 3 && mod.STAGE_MS >= 60 && mod.STAGE_MS <= 400, "stage constants are sane (first " + mod.STAGE_FIRST + " at once, then one per " + mod.STAGE_MS + " ms)");
  const host = document.createElement("div"); document.body.appendChild(host);
  const r2 = createRoot(host);
  const railsWithCards = () => [...host.querySelectorAll("[data-rail^='christmas-intent-']")].length;
  await act(async () => { r2.render(mount(handlersA, likedEmpty)); });
  await act(async () => { await new Promise((res) => setTimeout(res, 40)); });
  const early = railsWithCards();
  ok(early >= 1 && early <= mod.STAGE_FIRST + 1, "right after the data lands only the first rails hold cards (" + early + " of " + RAIL_IDS.length + "), the rest wait their turn");
  await settle();
  ok(railsWithCards() === RAIL_IDS.length, "CONTROL: after the staging window every rail holds its cards (" + railsWithCards() + " of " + RAIL_IDS.length + ")");
  await act(async () => { r2.unmount(); });
  host.remove();
}

/* 4. the home page's `center` keeps its identity when the place did not move ---------------------*/
{
  const { nextCenter } = await import("../lib/centerIdentity.js");
  const a = { lat: 27.5689, lng: -82.4393 };
  ok(nextCenter(a, { lat: 27.5689, lng: -82.4393 }) === a, "an equal-value center keeps the previous object (no effect keyed on `center` re-runs)");
  const moved = { lat: 27.9, lng: -82.4393 };
  ok(nextCenter(a, moved) === moved, "CONTROL: a real move hands back the NEW object, so the feed still refreshes");
  const renamed = { lat: 27.5689, lng: -82.4393, name: "Tampa" };
  ok(nextCenter(a, renamed) === renamed, "CONTROL: the same point with a different name is a change");
  ok(nextCenter(null, a) === a && nextCenter(a, null) === null, "first value and clearing both pass through");
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  ok(/const \[center, setCenter\] = useState\(null\);/.test(home), "home.js still declares center exactly as check-daypart-art-ready pins it");
  ok(/setCenter\(\(prev\) => nextCenter\(prev, adopted\.center\)\)/.test(home), "the IP/GPS adoption (the equal-value Parrish seed re-adopt) routes through nextCenter");
  ok(/setCenter\(\(prev\) => nextCenter\(prev, \{ lat: saved\.lat, lng: saved\.lng \}\)\)/.test(home), "the saved-location restore routes through nextCenter");
  ok(/setCenter\(\(prev\) => nextCenter\(prev, c\)\)/.test(home), "the geolocation fix routes through nextCenter");
  ok((home.match(/nextCenter\(prev,/g) || []).length === 3, "exactly three startup call sites use nextCenter (" + (home.match(/nextCenter\(prev,/g) || []).length + ")");
  ok(!/setCenter\(adopted\.center\)/.test(home), "CONTROL: the bare setCenter(adopted.center) form is gone");
  ok(/import \{ nextCenter \} from "\.\.\/lib\/centerIdentity"/.test(home), "home.js imports nextCenter");
}

/* 5. the theme park rail: a parent render with new closures re-renders no park card ---------------*/
{
  const TP = await loadComponent(path.join(ROOT, "app/components/ThemeParkRail.js"), ROOT);
  const ParkRail = TP.default;
  ok(typeof ParkRail === "function", "CONTROL: the real ThemeParkRail loaded");
  const names = ["Magic Kingdom Park", "EPCOT", "Universal Studios Florida", "SeaWorld Orlando"];
  const items = names.map((name, i) => ({ id: "park-" + i, name, lat: 28.4, lng: -81.5 + i / 100, wfScore: 90, reviews: 1000, photo: null }));
  const tpRoot = createRoot((() => { const d = document.createElement("div"); document.body.appendChild(d); return d; })());
  const tpCalls = [];
  const mk = (tag, likedMap) => e(ParkRail, { mode: "flagship", items, onOpenPlace: (p) => tpCalls.push(tag + ":" + p.id), isSaved: () => false, isOnTrip: () => false, liked: likedMap, disliked: {}, onSave: (ev, p) => tpCalls.push(tag + ":save:" + p.id), onItinerary: () => {}, onLike: () => {}, onDislike: () => {}, onShare: () => {} });
  const likedNone = {};
  await act(async () => { tpRoot.render(mk("A", likedNone)); });
  await settle();
  const parkCards = () => [...document.querySelectorAll('ol[data-rail="theme-parks-flagship"] > li[data-place-id]')];
  ok(parkCards().length === names.length, "the rail rendered every park card (" + parkCards().length + " of " + names.length + ")");
  const first = parkCards()[0];
  let n0 = renderedByName.length;
  await act(async () => { tpRoot.render(mk("B", likedNone)); });
  let counts = renderedByName.slice(n0);
  const railRenders = counts.reduce((s, c) => s + (c.ThemeParkRail || 0), 0);
  const cardRenders = counts.reduce((s, c) => s + (c.IconicPlaceCard || 0), 0);
  ok(railRenders >= 1, "CONTROL: the rail itself re-rendered for the new props (" + railRenders + "), so the counter sees renders and a zero below is real");
  ok(cardRenders === 0, "a parent render with new closures re-rendered " + cardRenders + " park cards; it must be 0");
  ok(parkCards()[0] === first, "the park card DOM nodes are the same objects");
  // a real change to one place's liked state repaints exactly that card
  n0 = renderedByName.length;
  await act(async () => { tpRoot.render(mk("C", { "park-1": true })); });
  counts = renderedByName.slice(n0);
  const changed = counts.reduce((s, c) => s + (c.IconicPlaceCard || 0), 0);
  ok(changed === 1, "liking one park re-rendered exactly that card (got " + changed + ")");
  // a tap after the re-renders runs the NEWEST handler, never a stale one
  tpCalls.length = 0;
  await act(async () => { parkCards().find((n) => n.getAttribute("data-place-id") === "park-2").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  ok(tpCalls.length === 1 && tpCalls[0] === "C:park-2", "the tap ran the newest onOpenPlace (calls: " + JSON.stringify(tpCalls) + ")");
  tpCalls.length = 0;
  const saveBtn = parkCards().find((n) => n.getAttribute("data-place-id") === "park-3").querySelector('button[aria-label^="Save "]');
  ok(!!saveBtn, "CONTROL: the park card renders a Save button to tap");
  await act(async () => { saveBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  ok(tpCalls.length === 1 && tpCalls[0] === "C:save:park-3", "the Save tap ran the newest onSave on a card that was skipped by memo (calls: " + JSON.stringify(tpCalls) + ")");
  await act(async () => { tpRoot.unmount(); });
}

/* 5b. the tour rail and the movies rail: a parent render with a new tracker re-renders no card ----*/
{
  const mkRoot = () => { const d = document.createElement("div"); document.body.appendChild(d); return createRoot(d); };
  const tours = [1, 2, 3].map((n) => ({ id: "tour-" + n, href: "/api/commerce/go?x=" + n, title: "Light tour " + n, image: null, city: "Tampa", distMi: 5 * n, price: "$" + 20 * n, chip: "Boat", when: "Nightly", label: "See availability", code: "T" + n, via: "Viator" }));
  const tRoot = mkRoot();
  const tracked = [];
  await act(async () => { tRoot.render(e(mod.ChristmasTourRail, { tours, onTrack: (n) => tracked.push("A:" + n) })); });
  const before2 = renderedByName.length;
  await act(async () => { tRoot.render(e(mod.ChristmasTourRail, { tours, onTrack: (n) => tracked.push("B:" + n) })); });
  const c2 = renderedByName.slice(before2);
  ok(c2.reduce((x, c) => x + (c.ChristmasTourRail || 0), 0) >= 1, "CONTROL: the tour rail itself re-rendered for the new tracker");
  ok(c2.reduce((x, c) => x + (c.TourRailCard || 0), 0) === 0, "a parent render with a new tracker re-rendered " + c2.reduce((x, c) => x + (c.TourRailCard || 0), 0) + " tour cards; it must be 0");
  const cta = document.querySelector("a[href*='/api/commerce/go?x=1']");
  ok(!!cta, "found the tour CTA");
  cta.addEventListener("click", (ev) => ev.preventDefault());
  tracked.length = 0;
  await act(async () => { cta.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  ok(tracked.length === 1 && tracked[0] === "B:tickets_out", "the CTA tap ran the NEWEST tracker (calls: " + JSON.stringify(tracked) + ")");
  await act(async () => { tRoot.unmount(); });

  const MoviesRail = (await loadComponent(path.join(ROOT, "app/components/SeasonalMoviesRail.js"), ROOT)).default;
  const moviePayload = { ctaLive: true, railTitle: "Movies in Theaters", deck: "d", movies: [1, 2, 3].map((n) => ({ id: "m" + n, title: "Movie " + n, status: "now_playing", rating: "PG", runtimeMin: 100, vibes: ["Cozy"], art: null, why: "w", ticket: { href: "/api/commerce/go?m=" + n, merchant: "Fandango", provider: "cj", offerId: "o" + n } })) };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url) => String(url).startsWith("/api/movies/seasonal") ? Promise.resolve({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => moviePayload, text: async () => JSON.stringify(moviePayload) }) : realFetch(url);
  const mRoot = mkRoot();
  await act(async () => { mRoot.render(e(MoviesRail, { collection: "christmas", active: true, onTrack: () => {} })); });
  await settle();
  ok(document.querySelectorAll("[data-rail='christmas-intent-movies'] > *").length >= 3, "the movies rail rendered its cards");
  const before3 = renderedByName.length;
  await act(async () => { mRoot.render(e(MoviesRail, { collection: "christmas", active: true, onTrack: () => {} })); });
  const c3 = renderedByName.slice(before3);
  ok(c3.reduce((x, c) => x + (c.SeasonalMoviesRail || 0), 0) >= 1, "CONTROL: the movies rail itself re-rendered");
  ok(c3.reduce((x, c) => x + (c.MovieRailCard || 0), 0) === 0, "a parent render re-rendered " + c3.reduce((x, c) => x + (c.MovieRailCard || 0), 0) + " movie cards; it must be 0");
  await act(async () => { mRoot.unmount(); });
  globalThis.fetch = realFetch;
}

/* 6. the quick bar's edge-fade check shares the frame's layout instead of forcing its own ----------*/
{
  const rafQueue = [];
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  const { useEdgeFade } = await loadComponent(path.join(ROOT, "app/components/EdgeFade.js"), ROOT);
  let reads = 0;
  const Row = ({ tick }) => {
    const ref = React.useRef(null);
    useEdgeFade(ref);
    return e("div", { ref, "data-tick": tick });
  };
  const efRoot = createRoot((() => { const d = document.createElement("div"); document.body.appendChild(d); return d; })());
  await act(async () => { efRoot.render(e(Row, { tick: 0 })); });
  const row = document.querySelector("[data-tick]");
  Object.defineProperty(row, "scrollWidth", { configurable: true, get() { reads += 1; return 900; } });
  Object.defineProperty(row, "clientWidth", { configurable: true, get() { return 300; } });
  rafQueue.splice(0).forEach((fn) => fn()); reads = 0;
  for (let i = 1; i <= 4; i++) await act(async () => { efRoot.render(e(Row, { tick: i })); });
  ok(reads === 0, "four renders in a row read layout " + reads + " times inside the effects; it must be 0 (forced layout)");
  ok(rafQueue.length === 1, "the four renders queued ONE frame callback (" + rafQueue.length + ")");
  rafQueue.splice(0).forEach((fn) => fn());
  ok(reads >= 1 && row.getAttribute("data-fade") === "end", "CONTROL: the frame callback does the read and writes data-fade=end (reads=" + reads + ", fade=" + row.getAttribute("data-fade") + ")");
  ok(row.classList.contains("wf-edgefade"), "the wf-edgefade class is still added");
  await act(async () => { efRoot.unmount(); });
}

console.log("test-home-feed-rerender: OK, " + checks + " assertions (flag identity, center identity, real ChristmasIntentRails and ThemeParkRail mounted in jsdom: 0 card re-renders on a parent render, exactly 1 on a real change, newest handler on tap, edge-fade reads share the frame)");
