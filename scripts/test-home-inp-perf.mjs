#!/usr/bin/env node
/**
 * test-home-inp-perf — locks the trace-verified homepage INP & main-thread fixes:
 *   1. Offscreen CSS containment & touch backdrop-filter removal without shifting
 *      Christmas sections or hiding offscreen horizontal rail cards.
 *   2. Tracked horizontal scroll snapshots (lib/restoreBrowsePosition.js) so
 *      reading positions avoids forced synchronous layout across untouched rails,
 *      plus top-of-page fast-path and single-pass restore map.
 *   3. Deferred IntersectionObserver geometry, rAF-coalesced scroll/resize
 *      handlers, and 2-card uniform pitch measurement in RailCard.js.
 *   4. HomeAffiliateActivityRail memoization with ref-forwarded onLog and
 *      ThemeParkRail / suggestedView memoization in app/home.js.
 *   5. Shared two-pass creator index (lib/creatorMatch.js) partitioning pinned vs
 *      unpinned entries cleanly across full and lean resolvers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. CSS Containment & Touch Compositor Rules ─────────────────────────────── */
{
  const css = read("app/components/css.js");
  const layoutBlock = css.slice(css.indexOf("export const WF_LAYOUT_CSS"), css.indexOf("export const WF_SEARCH_CSS"));
  const cardBlock = css.slice(css.indexOf("export const WF_PLACE_CARD_CSS"));
  const menuCss = read("app/components/railMenuCss.js");

  ok(layoutBlock.includes(".wf-col-main>section{content-visibility:auto;contain-intrinsic-size:auto 356px}"),
    "WF_LAYOUT_CSS enables content-visibility:auto on offscreen .wf-col-main>section blocks");
  ok(layoutBlock.includes(".wf-col-main .wf-place-card-list>.wf-place-card:not(.is-trending){contain:layout paint style;content-visibility:auto;contain-intrinsic-size:auto ${PLACE_CARD_HEIGHT_PX}px}"),
    "WF_LAYOUT_CSS skips layout on offscreen fixed-height 268px stacked list place cards");
  ok(cardBlock.includes("@media(hover:none),(pointer:coarse){.wf-place-card-rank{backdrop-filter:none;-webkit-backdrop-filter:none}}"),
    "WF_PLACE_CARD_CSS drops GPU backdrop-filter blur on touch/coarse devices");
  ok(cardBlock.includes(".wf-rail>.wf-place-card:not(.is-trending),.wf-rail-guide-slot>.wf-place-card:not(.is-trending){contain:layout paint style}"),
    "WF_PLACE_CARD_CSS uses layout/paint containment on horizontal rail cards without content-visibility:auto");
  ok(!/\.wf8-menusec\s+\.wf8-in\s*>\s*section\{[^}]*content-visibility:\s*auto/.test(menuCss),
    "railMenuCss.js must not put content-visibility:auto on .wf8-menusec sections (avoids 500px scroll target shift on 9 stacked Christmas rails)");
  ok(layoutBlock.includes(".wf-hol-cv{contain:layout paint;content-visibility:auto;contain-intrinsic-size:auto 160px}"),
    "WF_LAYOUT_CSS defines .wf-hol-cv containment for promo cards");
  const home = read("app/home.js");
  ok((home.match(/className="wf-hol-cv"/g) || []).length === 2,
    "app/home.js applies wf-hol-cv to both World Cup and Holiday promo cards");
}

/* ── 2. Horizontal Scroll Tracking & Position Fast-Path (Executed) ───────────── */
{
  const src = read("lib/restoreBrowsePosition.js");
  const ctx = vm.createContext({
    Map, WeakMap, Set, Array, Number, Math,
    requestAnimationFrame: (fn) => { ctx._q.push(fn); return ctx._q.length; },
    cancelAnimationFrame: () => {},
    setTimeout: () => 1, clearTimeout: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    _q: [],
  });
  vm.runInContext(src.replace(/export /g, ""), ctx);

  let scrollLeftReads = 0;
  let railQueries = 0;
  let anchorQueries = 0;
  const listeners = new Map();
  const makeRail = (key, initial = 0) => {
    let left = initial;
    return {
      getAttribute: (a) => (a === "data-rail" ? key : null),
      get scrollLeft() { scrollLeftReads += 1; return left; },
      set scrollLeft(v) { left = v; },
      _raw: () => left,
    };
  };
  const rails = Array.from({ length: 15 }, (_, i) => makeRail("rail-" + i));
  const root = {
    children: [],
    ownerDocument: { addEventListener() {}, removeEventListener() {} },
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0, bottom: 800 }),
    querySelectorAll(q) {
      if (q.includes("data-rail") && q.includes("data-wf-scroll-key") && !q.includes("data-wf-position-key")) {
        railQueries += 1;
        return rails;
      }
      anchorQueries += 1;
      return [{ getAttribute: (a) => (a === "data-rail" ? "rail-2" : null), getBoundingClientRect: () => ({ top: 120, bottom: 400, height: 280 }) }];
    },
    addEventListener(ev, fn) { listeners.set(ev, fn); },
    removeEventListener(ev, fn) { if (listeners.get(ev) === fn) listeners.delete(ev); },
  };

  // Red-before proof: without trackHorizontalScrolls, horizontalPositions forces 15 scrollLeft reads.
  const untracked = ctx.horizontalPositions(root);
  ok(untracked.length === 15 && scrollLeftReads === 15,
    "RED-CONTROL: untracked horizontalPositions reads scrollLeft across all 15 rails (got " + scrollLeftReads + ")");

  // Green-after: with trackHorizontalScrolls active, untouched snapshot costs 0 scrollLeft reads.
  scrollLeftReads = 0;
  const untrack = ctx.trackHorizontalScrolls(root);
  ok(typeof listeners.get("scroll") === "function", "trackHorizontalScrolls registers capture scroll listener on root");
  const initialEmpty = ctx.horizontalPositions(root);
  ok(initialEmpty.length === 0 && scrollLeftReads === 0,
    "tracked root snapshot reads 0 scrollLeft properties before any rail is scrolled (got " + scrollLeftReads + ")");

  // Simulate user scrolling only rail-4 to 240px, then back to 0.
  rails[4].scrollLeft = 240;
  scrollLeftReads = 0;
  listeners.get("scroll")({ target: rails[4] });
  ok(scrollLeftReads === 1, "scroll event reads scrollLeft only for the scrolled rail (got " + scrollLeftReads + ")");
  scrollLeftReads = 0;
  const afterSwipe = ctx.horizontalPositions(root);
  ok(afterSwipe.length === 1 && afterSwipe[0].key === "rail-4" && afterSwipe[0].left === 240 && scrollLeftReads === 0,
    "snapshot returns exact swiped rail position with 0 DOM scrollLeft reads");
  rails[4].scrollLeft = 0;
  listeners.get("scroll")({ target: rails[4] });
  const afterUndo = ctx.horizontalPositions(root);
  ok(afterUndo.length === 1 && afterUndo[0].left === 0,
    "scrolling rail back to 0 keeps 0 recorded so Back still undoes prior swipe");

  // Top-of-page fast-path skips anchor getBoundingClientRect scan.
  root.scrollTop = 0;
  anchorQueries = 0;
  const topSnap = ctx.browsePosition(root);
  ok(topSnap.anchor === null && anchorQueries === 0,
    "browsePosition at scrollTop<=2 skips DOM anchor queries (got " + anchorQueries + ")");
  root.scrollTop = 900;
  const midSnap = ctx.browsePosition(root);
  ok(midSnap.anchor?.key === "rail-2" && anchorQueries === 1,
    "browsePosition when scrolled still computes visible anchor cleanly");

  // Restore apply() queries rails once for N horizontal restores and syncs tracked map.
  railQueries = 0;
  const dispose = ctx.restoreBrowsePosition(root, { top: 0, horizontal: [{ key: "rail-1", left: 100 }, { key: "rail-2", left: 200 }, { key: "rail-3", left: 300 }] });
  while (ctx._q.length) ctx._q.shift()();
  ok(railQueries === 1, "restoreBrowsePosition apply() queries rail elements once per frame for multiple restored rails (got " + railQueries + ")");
  ok(rails[1]._raw() === 100 && rails[2]._raw() === 200 && rails[3]._raw() === 300,
    "restoreBrowsePosition sets scrollLeft on each restored rail");
  scrollLeftReads = 0;
  const afterRestore = ctx.horizontalPositions(root);
  ok(afterRestore.some((x) => x.key === "rail-2" && x.left === 200) && scrollLeftReads === 0,
    "restoreBrowsePosition keeps tracked scroll map synchronized with 0 DOM reads");
  dispose();
  untrack();
  ok(!listeners.has("scroll"), "cleanup removes capture scroll listener");
}

/* ── 3. Deferred IO Geometry, 2-Card Pitch & Coalesced rAF in JSDOM ──────────── */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://www.gowayfind.com/", pretendToBeVisual: true });
for (const field of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "Event", "CustomEvent", "getComputedStyle", "MouseEvent", "PointerEvent"]) {
  if (field === "PointerEvent" && !dom.window.PointerEvent) continue;
  Object.defineProperty(globalThis, field, { value: field === "window" ? dom.window : dom.window[field], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.NODE_ENV = "test";

const ioInstances = [];
globalThis.IntersectionObserver = class {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = []; ioInstances.push(this); }
  observe(t) { this.targets.push(t); }
  disconnect() { this.disconnected = true; }
};
const roInstances = [];
globalThis.ResizeObserver = class {
  constructor(cb) { this.cb = cb; roInstances.push(this); }
  observe() {}
  disconnect() {}
};
const rafQueue = [];
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => {};

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

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const act = React.act;
const e = React.createElement;
const { loadComponent } = await import("./lib/jsxLoad.mjs");

{
  const { RailNav, RailDots } = await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const railEl = document.createElement("div");
  railEl.setAttribute("data-rail", "perf-test-rail");
  Object.defineProperty(railEl, "clientWidth", { value: 366, configurable: true });
  Object.defineProperty(railEl, "scrollWidth", { value: 40 * 358 - 12, configurable: true });
  let scrollLeft = 0;
  Object.defineProperty(railEl, "scrollLeft", { get: () => scrollLeft, set: (v) => { scrollLeft = v; }, configurable: true });

  let rectReads = 0;
  for (let i = 0; i < 40; i++) {
    const card = document.createElement("article");
    card.className = "wf-place-card wf-rail-card";
    card.getBoundingClientRect = () => { rectReads += 1; return { left: i * 358, width: 346 }; };
    railEl.appendChild(card);
  }
  host.appendChild(railEl);
  const navBox = document.createElement("div");
  host.appendChild(navBox);
  const r = createRoot(navBox);
  ioInstances.length = 0;
  rafQueue.length = 0;

  await act(async () => {
    r.render(e(React.Fragment, null,
      e(RailNav, { railId: "perf-test-rail", count: 40, total: 40, loaded: 40, unit: "places" }),
      e(RailDots, { railId: "perf-test-rail", count: 40 }),
    ));
  });

  ok(ioInstances.length >= 2, "RailNav and RailDots both install IntersectionObservers");
  ok(rectReads === 0, "before entering viewport, offscreen RailNav performs 0 getBoundingClientRect reads (got " + rectReads + ")");
  ok(navBox.textContent.includes("1 of 40"), "initial paint still shows accurate 1 of 40 before intersection");

  // Trigger intersection for both observers, verify 2-card pitch avoids scanning 40 cards.
  await act(async () => {
    for (const io of ioInstances) io.cb([{ isIntersecting: true }]);
    while (rafQueue.length) rafQueue.shift()();
  });
  ok(rectReads > 0 && rectReads <= 4,
    "40-card uniform rail measures <=2 cards (<=4 rect reads, got " + rectReads + ") instead of all 40");

  // Coalesce burst of 5 scroll events into 1 rAF per observer (2 total across RailNav+RailDots vs 10) with 0 new rect reads.
  rectReads = 0;
  scrollLeft = 358 * 4;
  for (let i = 0; i < 5; i++) railEl.dispatchEvent(new dom.window.Event("scroll"));
  ok(rafQueue.length === 2, "burst of 5 horizontal scroll events coalesces to 1 rAF per observer (got " + rafQueue.length + ")");
  await act(async () => { while (rafQueue.length) rafQueue.shift()(); });
  ok(rectReads === 0, "cached scroll handler re-computes rail position with 0 getBoundingClientRect reads (got " + rectReads + ")");
  ok(navBox.textContent.includes("5 of 40"), "cached pitch accurately updates counter to 5 of 40 on scroll (got " + navBox.textContent + ")");

  // Heterogeneous children fallback measures individually rather than assuming uniform pitch.
  const heteroCard = document.createElement("div");
  heteroCard.className = "custom-banner";
  heteroCard.getBoundingClientRect = () => { rectReads += 1; return { left: 40 * 358, width: 200 }; };
  railEl.appendChild(heteroCard);
  rectReads = 0;
  railEl.dispatchEvent(new dom.window.Event("scroll"));
  await act(async () => { while (rafQueue.length) rafQueue.shift()(); });
  ok(rectReads >= 41, "adding a staged/heterogeneous child re-measures full child offsets cleanly (got " + rectReads + ")");

  await act(async () => { r.unmount(); });
  host.remove();
}

/* ── 4. HomeAffiliateActivityRail Memo & ThemeParkRail Memoization ───────────── */
{
  const mod = await loadComponent(path.join(ROOT, "app/components/HomeAffiliateActivityRail.js"), ROOT);
  const Rail = mod.default;
  const Card = mod.AffiliateCard;
  ok(Card && Card.$$typeof === Symbol.for("react.memo"), "AffiliateCard inside HomeAffiliateActivityRail is React.memo");

  const items = [
    { code: "A1", title: "Sunset Kayaking", image: "https://example.com/1.jpg", city: "Tampa", reviews: 80, rating: 4.9, fromPrice: 65, url: "/api/commerce/go?provider=viator&offer=A1" },
    { code: "A2", title: "Ybor Food Tour", image: "https://example.com/2.jpg", city: "Tampa", reviews: 95, rating: 4.8, fromPrice: 75, url: "/api/commerce/go?provider=viator&offer=A2" },
  ];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  const logCalls = [];
  await act(async () => { r.render(e(Rail, { items, contentId: "Tampa", stagedCards: false, onLog: (a, _p, x) => logCalls.push("A:" + a + ":" + x.code) })); });

  const b0 = renderedByName.length;
  await act(async () => { r.render(e(Rail, { items, contentId: "Tampa", stagedCards: false, onLog: (a, _p, x) => logCalls.push("B:" + a + ":" + x.code) })); });
  const railCount = renderedByName.slice(b0).reduce((s, row) => s + (row.HomeAffiliateActivityRail || 0), 0);
  const cardCount = renderedByName.slice(b0).reduce((s, row) => s + (row.AffiliateCard || 0) + (row.RailCard || 0), 0);
  ok(railCount >= 1 && cardCount === 0, "re-rendering parent with fresh onLog updates rail ref with 0 AffiliateCard/RailCard re-renders (got rail=" + railCount + ", cards=" + cardCount + ")");

  const link = host.querySelector("a[data-offer]");
  ok(!!link, "CONTROL: affiliate CTA link mounted");
  link.addEventListener("click", (ev) => ev.preventDefault());
  await act(async () => { link.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  ok(logCalls.length === 1 && logCalls[0].startsWith("B:"), "memoized affiliate card calls newest onLogRef callback after skip (calls: " + JSON.stringify(logCalls) + ")");

  const nextItems = [...items, { code: "A3", title: "Manatee Swim", image: "https://example.com/3.jpg", city: "Crystal River", reviews: 110, rating: 4.9, fromPrice: 89, url: "/api/commerce/go?provider=viator&offer=A3" }];
  await act(async () => { r.render(e(Rail, { items: nextItems, contentId: "Tampa", stagedCards: false, onLog: () => {} })); });
  ok(host.querySelectorAll("article.wf-place-card").length === 3, "updating items still re-renders the new cards immediately");

  await act(async () => { r.unmount(); });
  host.remove();

  const tpSrc = strip(read("app/components/ThemeParkRail.js"));
  ok(/const\s+rows\s*=\s*useMemo\(/.test(tpSrc), "ThemeParkRail memoizes rows filter/order calculation with useMemo");
}

/* ── 5. Shared Two-Pass Creator Index Equivalence & Bypass Partition ─────────── */
{
  const { createCreatorPlaceIndex, resolveCreatorEntry } = await import("../lib/creatorMatch.js");
  const { creatorVideosFor: fullFor } = await import("../lib/creatorVideos.js");
  const { creatorVideosFor: leanFor } = await import("../lib/creatorSignals.js");

  const idx = createCreatorPlaceIndex([
    { placeId: "ChIJPinned1234567890", match: { name: "Ryan", city: "Parrish" }, videos: [{ url: "https://v/1" }] },
    { placeId: null, match: { name: "Clearwater Sunset", city: "Clearwater" }, videos: [{ url: "https://v/2" }] },
  ]);
  ok(idx.byName.length === 2 && idx.byNameNoPid.length === 1,
    "createCreatorPlaceIndex partitions entries without placeId into byNameNoPid so Google-id fallback skips pinned entries");
  ok(resolveCreatorEntry(idx, { id: "ChIJOther9999999999", name: "Ryan Music", city: "Parrish" }, "Parrish") === null,
    "resolveCreatorEntry rejects different Google id on pinned entry");
  ok(resolveCreatorEntry(idx, { id: "ChIJOther9999999999", name: "Clearwater Sunset Cruise", city: "Clearwater" }, "Clearwater")?.match?.name === "Clearwater Sunset",
    "resolveCreatorEntry matches unpinned name+city entry even for candidate with Google id");
  ok(resolveCreatorEntry(idx, { id: "fsq:abc", name: "Clearwater Sunset Cruise", city: "Miami" }, "Miami") === null,
    "resolveCreatorEntry enforces city gate");

  const probePinned = { id: "ChIJo_IdHf0lw4gRHDbQNKBRE84", name: "Ryan's Coffee House", city: "Parrish" };
  const probeOther = { id: "ChIJzzzzzzzzzzzzzzzzzzzzzzz", name: "Ryan's Music House", city: "Parrish" };
  ok(fullFor(probePinned, "Parrish").length > 0 && leanFor(probePinned, "Parrish").length === fullFor(probePinned, "Parrish").length,
    "pinned Google id resolves identically across full and lean creator resolvers");
  ok(fullFor(probeOther, "Parrish").length === 0 && leanFor(probeOther, "Parrish").length === 0,
    "mismatched Google id resolves empty across full and lean creator resolvers");
}

/* ── 6. app/home.js Position Listener Decoupling & Suggested Memo ───────────── */
{
  const home = strip(read("app/home.js"));
  ok(/useEffect\(\(\)\s*=>\s*\(scrollRef\.current\s*\?\s*trackHorizontalScrolls\(scrollRef\.current\)\s*:\s*undefined\),\s*\[\]\);/.test(home),
    "app/home.js wires trackHorizontalScrolls(scrollRef.current) once on mount");
  ok(/const\s+posStateRef\s*=\s*useRef\(null\);/.test(home) && /\},\s*\[screen,\s*cat,\s*browseCat,\s*sub,\s*vibe,\s*searchMode,\s*restoreVersion\]\);/.test(home),
    "app/home.js position writer effect depends only on navigation/restore keys via posStateRef");
  ok(/t\.closest\("\.wf-navtabs,\.wf-dests"\)\s*\|\|\s*!t\.closest\("a\[href\],\.wf-place-card-open,\.wf-holiday-open"\)/.test(home),
    "app/home.js capture click listener skips non-navigation UI clicks cleanly");
  ok(/const\s+suggestedView\s*=\s*useMemo\(/.test(home),
    "app/home.js memoizes suggestedView affinity computation across unrelated renders");
}

if (fail.length) {
  console.error(`test-home-inp-perf: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-home-inp-perf: OK — ${pass} assertions passed`);
