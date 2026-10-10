#!/usr/bin/env node
// scripts/check-guide-in-rail.mjs: a guide card is the THIRD card INSIDE the
// rail it belongs to, never a block between rails.
//
// OWNER RULE (2026-10-08): "I don't like how you are entering the guide in its
// own rail. Place it in the 3rd place in each of the rail system it belongs,
// not on an individual rail. The rails are the centerpiece, don't add things in
// between. Make sure this is the global rule for all of the rails."
//
// EXECUTED: lib/railGuideSlot.js (insertGuideAt, guideSlotIndex), the place
// rail selector (guideForPlaceRail) and the real RailGuideSlot component
// rendered through scripts/lib/jsxLoad.mjs. STATIC (comments stripped): every
// rails component that uses a guide collection routes it through RailGuideSlot,
// and no component renders a guide card anywhere else.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GUIDE_SLOT_INDEX, guideSlotIndex, insertGuideAt } from "../lib/railGuideSlot.js";
import { guideForPlaceRail } from "../lib/guideDiscovery.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── 1. the helper, executed ─────────────────────────────────────────────────
ok(GUIDE_SLOT_INDEX === 2, "the guide slot is index 2 (the third card)");
ok([0, 1, 2, 3, 9].map(guideSlotIndex).join() === "0,1,2,2,2", "guideSlotIndex: last when the rail has fewer than two cards, else index 2");
const base = ["a", "b", "c", "d"];
ok(insertGuideAt(base, "G").join() === "a,b,G,c,d", "POSITIVE: the guide lands third in a normal rail");
ok(base.join() === "a,b,c,d", "the input rail is never mutated");
ok(insertGuideAt(["a"], "G").join() === "a,G" && insertGuideAt([], "G").join() === "G", "a rail with fewer than two cards gets the guide last");
ok(insertGuideAt(base, null).join() === "a,b,c,d" && insertGuideAt(base, null) !== base, "NEGATIVE: no guide means the same cards, as a copy");
ok(insertGuideAt(base, "G").filter((x) => x !== "G").join() === base.join(), "the place order around the guide is unchanged (ranks are not shifted)");

// ── 2. the homepage drop (DaypartRail) selector uses the same slot ─────────
const guide = { slug: "g", image: { src: "/x.webp" }, placeIds: ["p4"] };
const rows = Array.from({ length: 10 }, (_, i) => ({ id: "p" + i }));
ok(guideForPlaceRail([guide], rows, "rail-a")?.before === 2 && guideForPlaceRail([guide], rows, "rail-b")?.before === 2, "the homepage drop inserts its guide at index 2 on every rail");
ok(guideForPlaceRail([guide], [{ id: "ad", _sponsored: true }, ...rows], "rail-a")?.before === 2, "an ad in front does not push the guide past the third card");

// ── 3. the real slot component, rendered ────────────────────────────────────
const RailGuideSlot = (await loadComponent(path.join(ROOT, "app/components/RailGuideSlot.js"), ROOT)).default;
const g = { slug: "florida-winter-beaches-2026", title: "Winter Beach Days in Florida", teaser: "Seven beaches.", image: { src: "/guides/verified/nature-florida-winter-beaches-2026.webp" }, placeIds: [] };
const cards = (n) => Array.from({ length: n }, (_, i) => React.createElement("article", { key: i, "data-card": i, className: "wf-place-card" }));
const html = renderToStaticMarkup(React.createElement("div", { className: "wf-rail" }, React.createElement(RailGuideSlot, { railId: "beaches", guide: g }, cards(5))));
const order = [...html.matchAll(/data-card="(\d)"|data-guide-rail="beaches"/g)].map((m) => m[1] ?? "G").join();
ok(order === "0,1,G,2,3,4", `the rendered track reads card, card, GUIDE, card... (got ${order})`);
ok((html.match(/wf-guide-card/g) || []).length === 1 && !/wf-place-card-rank"[^>]*>/.test(html.slice(html.indexOf("data-guide-rail"), html.indexOf('data-card="2"'))), "exactly one guide card, carrying no rank badge");
ok(/wf-exploding-primary/.test(html.slice(html.indexOf("data-guide-rail"))), "the guide wears the sibling card class, so it sizes like the rail's cards");
const none = renderToStaticMarkup(React.createElement("div", null, React.createElement(RailGuideSlot, { railId: "beaches" }, cards(3))));
ok(!/data-guide-rail/.test(none), "NEGATIVE: a rail with no matched guide renders only its own cards");

// ── 3b. edge cases, EXECUTED (owner follow up, 2026-10-08) ─────────────────
{
  const { mergePagedItems } = await import("../lib/railPage.js");
  const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
  const H = await loadComponent(path.join(ROOT, "scripts/lib/guideCollectionHarness.js"), ROOT);
  const tileOrder = (markup) => [...markup.matchAll(/data-guide-rail="[^"]*"|wf-place-card-rank"[^>]*>(\d+)</g)].map((m) => (m[1] ? m[1] : "G"));
  const rankCards = (rows) => rows.map((row, index) => React.createElement(RailCard, { key: row.id, title: row.id, rank: index + 1, photo: "/x.webp", place: { id: row.id, name: row.id } }));
  const rowsOf = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: "row-" + (from + i) }));
  const slot = (rows, gd = g) => renderToStaticMarkup(React.createElement("div", { className: "wf-rail" }, React.createElement(H.RailGuideSlot, { railId: "r", guide: gd }, rankCards(rows))));
  // (a) 0, 1, 2 cards: the guide goes last, exactly once.
  for (const n of [0, 1, 2]) {
    const order = tileOrder(slot(rowsOf(n)));
    ok(order.filter((x) => x === "G").length === 1 && order[order.length - 1] === "G" && order.length === n + 1, `(a) a rail of ${n} card(s) shows the guide last, once (got ${order.join()})`);
  }
  // (b) no guide: unchanged, ranks 1..n.
  const plain = tileOrder(slot(rowsOf(5), null));
  ok(plain.join() === "1,2,3,4,5", `(b) a rail without a guide keeps its cards and ranks 1..n (got ${plain.join()})`);
  // (c) two page load through usePagedRail's own merge: the guide stays at index 2, once; ranks continue.
  let items = mergePagedItems([], rowsOf(10), 0);
  const page0 = tileOrder(slot(items));
  items = mergePagedItems(items, [...rowsOf(1, 9), ...rowsOf(10, 10)], 1); // page 2 repeats row-9: the merge drops it
  const page1 = tileOrder(slot(items));
  ok(page0.join() === "1,2,G,3,4,5,6,7,8,9,10", `(c) page 1: guide third, ranks 1..10 around it (got ${page0.join()})`);
  ok(items.length === 20 && page1.filter((x) => x === "G").length === 1 && page1.indexOf("G") === 2, `(c) after page 2 arrives the guide is still at index 2, exactly once (got index ${page1.indexOf("G")}, ${page1.filter((x) => x === "G").length} guide(s), ${items.length} rows)`);
  ok(page1.filter((x) => x !== "G").join() === Array.from({ length: 20 }, (_, i) => i + 1).join() && page1[3] === "3", "(c) the third place card is rank 3 although it is the fourth tile; ranks run 1..20 with no gap");
  ok(items.length === 20, "(c) counters and dots read the place list (20), which never contains the guide");
  // (d) one guide, one rail per collection.
  const matchG = { slug: "match", title: "Match", image: { src: "/x.webp" }, placeIds: ["shared"], teaser: "t" };
  const three = [0, 1, 2].map((k) => ({ id: "rail-" + k, places: [{ id: "shared", name: "Shared" }, { id: "own-" + k, name: "Own " + k }] }));
  const collectionHtml = renderToStaticMarkup(React.createElement(H.GuideDiscoveryContext.Provider, { value: [matchG] },
    React.createElement(H.Collection, { rails: three, collectionId: "c" }, three.map((rail) => React.createElement("div", { key: rail.id, className: "wf-rail" },
      React.createElement(H.RailGuideSlot, { railId: rail.id }, rankCards(rail.places)))))));
  ok((collectionHtml.match(/data-guide-rail=/g) || []).length === 1, `(d) a guide that matches three rails of one collection shows in exactly one (got ${(collectionHtml.match(/data-guide-rail=/g) || []).length})`);
  const own = ["a", "b", "c", "d", "e"].map((k) => renderToStaticMarkup(React.createElement(H.RailGuideSlot, { railId: k, guide: { ...matchG, slug: "own-" + k } }, rankCards(rowsOf(4)))));
  ok(own.every((m) => (m.match(/data-guide-rail=/g) || []).length === 1) && new Set(own.map((m) => (m.match(/rail-guide|guides\/own-[a-e]/) || [""])[0])).size >= 1, "(d) Christmas: each rail carries its own guide, once");
}

// ── 4. the whole tree, statically: nothing between rails ───────────────────
const files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { const f = path.join(dir, n); if (statSync(f).isDirectory()) { if (!/node_modules|\.next/.test(f)) walk(f); } else if (/\.(m?js|jsx|tsx?)$/.test(n)) files.push(f); } };
walk(path.join(ROOT, "app"));
const rel = (f) => path.relative(ROOT, f);
const RENDERERS_ALLOWED = new Set(["app/components/RailGuideSlot.js", "app/components/DaypartRail.js", "app/components/GuideDiscoveryCard.js"]);
let collections = 0;
for (const f of files) {
  const src = strip(readFileSync(f, "utf8"));
  const r = rel(f);
  if (/<GuideDiscoveryCard[\s/>]/.test(src)) ok(RENDERERS_ALLOWED.has(r), `${r} renders a guide card outside the rail slot (only RailGuideSlot, and DaypartRail's in-track drop insert / guides library, may)`);
  ok(!/Go deeper with a local guide/.test(src), `${r} still renders a between-rails guide aside`);
  if (/<GuideRailCollection[\s>]/.test(src)) {
    collections += 1;
    ok(/<RailGuideSlot[\s>]/.test(src), `${r} uses a guide collection but never puts the guide inside a rail (RailGuideSlot)`);
  }
}
ok(collections >= 10, `every guide collection was found and checked (${collections})`);
const collectionSrc = strip(readFileSync(path.join(ROOT, "app/components/GuideRailCollection.js"), "utf8"));
ok(!/<aside|<GuideDiscoveryCard/.test(collectionSrc) && /RailGuideContext\.Provider/.test(collectionSrc), "GuideRailCollection only names the owning rail; it renders no card of its own");
ok(/insertGuideAt\(/.test(strip(readFileSync(path.join(ROOT, "app/components/RailGuideSlot.js"), "utf8"))), "RailGuideSlot inserts through the shared helper");
const daypart = strip(readFileSync(path.join(ROOT, "app/components/DaypartRail.js"), "utf8"));
ok(/guideForPlaceRail\(/.test(daypart) && /i === guideInsert\.before/.test(daypart), "the homepage drop places its guide at guideForPlaceRail's slot, inside the track");
ok(/guideSlotIndex\(/.test(strip(readFileSync(path.join(ROOT, "lib/guideDiscovery.js"), "utf8"))), "guideForPlaceRail takes its slot from the shared helper");
const christmas = strip(readFileSync(path.join(ROOT, "app/components/ChristmasIntentRails.js"), "utf8"));
ok(/<RailGuideSlot railId=\{rail\.id\} guide=\{rail\.guide \?\? null\} onTrack=\{onTrack\}>/.test(christmas), "each Christmas rail puts its OWN guide third in its own track");
// Positive control for the static detector: a between-rails aside is caught.
ok(/Go deeper with a local guide/.test(`<aside aria-label="Go deeper with a local guide">`), "POSITIVE CONTROL: the aside detector matches the old shape");

// ── 5. the guide is a real swipe stop (owner, 2026-10-09) ──────────────────
// RailGuideSlot wraps the card in display:contents, so the track's direct
// child snap rules (.wf-rail>.wf-place-card) never reach it and a phone swipe
// flew past the guide. The shipped CSS must give the guide card its own snap
// point, and every track that hosts RailGuideSlot must be a snap container.
let swipe = "browser swipe not run";
{
  const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
  const css = String(WF_PLACE_CARD_CSS);
  const snapRule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1].split(",").map((x) => x.trim()).includes(".wf-rail-guide-slot>.wf-place-card"));
  ok(!!snapRule && /scroll-snap-align:start/.test(snapRule[2]), "the shipped CSS gives the guide card (.wf-rail-guide-slot>.wf-place-card) scroll-snap-align:start");
  ok(/\.wf-rail\{[^}]*scroll-snap-type:x mandatory/.test(css), "the .wf-rail track is a mandatory snap container");
  const hosts = files.filter((f) => /<RailGuideSlot[\s>]/.test(strip(readFileSync(f, "utf8"))));
  for (const f of hosts) {
    const src = strip(readFileSync(f, "utf8"));
    const before = src.slice(0, src.search(/<RailGuideSlot[\s>]/));
    const open = before.lastIndexOf("<div className=");
    ok(open !== -1 && /^<div className=(?:"wf-rail[ "]|\{`wf-rail )/.test(before.slice(open)), `${rel(f)}: the track that hosts the guide is a .wf-rail snap container`);
  }
  ok(hosts.length >= 11, `every guide host track was checked (${hosts.length})`);
  // A real swipe at 390px, when a browser is available.
  let chromium = null;
  try { ({ chromium } = await import("playwright")); } catch {}
  const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (chromium) {
    const { existsSync } = await import("node:fs");
    const opts = existsSync(exe) ? { executablePath: exe } : {};
    let browser = null;
    try { browser = await chromium.launch(opts); } catch { browser = null; }
    if (browser) {
      const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
      const cardsHtml = renderToStaticMarkup(React.createElement("div", { className: "wf-rail wf-rail-exploding", "data-rail": "t" },
        React.createElement(RailGuideSlot, { railId: "t", guide: g }, [0, 1, 2, 3, 4].map((i) => React.createElement(RailCard, { key: i, className: "wf-exploding-primary", title: "Card " + i, rank: i + 1, photo: "", place: { id: "p" + i, name: "p" } })))));
      const page = await browser.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:0 13px}${css}</style></head><body>${cardsHtml}</body></html>`);
      const res = await page.evaluate(async () => {
        const rail = document.querySelector('[data-rail="t"]');
        const tiles = [...rail.querySelectorAll(".wf-place-card")];
        const guide = rail.querySelector(".wf-rail-guide-slot>.wf-place-card");
        const left = (el) => el.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
        const wait = () => new Promise((r) => setTimeout(r, 700));
        rail.scrollTo({ left: left(tiles[1]), behavior: "instant" }); await wait();
        // one card width of swipe from card 2 lands on the guide (index 2)
        const step = left(tiles[2]) - left(tiles[1]);
        rail.scrollBy({ left: step * 0.62, behavior: "instant" }); await wait();
        // The snap position is the card's left edge minus the rail's scroll padding
        // (main #1704 gave .wf-rail scroll-padding-inline:4px so the ring is not cut off).
        const pad = parseFloat(getComputedStyle(rail).scrollPaddingInlineStart) || 0;
        const landed = Math.abs(rail.scrollLeft - (left(guide) - pad)) <= 2;
        return { landed, idx: tiles.indexOf(guide), scroll: rail.scrollLeft, guideAt: left(guide) - pad, w: guide.getBoundingClientRect().width, sib: tiles[1].getBoundingClientRect().width, snap: getComputedStyle(guide).scrollSnapAlign };
      });
      await browser.close();
      ok(res.idx === 2, `the guide is the third tile in the real track (index ${res.idx})`);
      ok(res.snap === "start", `the guide card's computed scroll-snap-align is start (got ${res.snap})`);
      ok(Math.abs(res.w - res.sib) <= 1, `the guide card is as wide as its siblings (${res.w} vs ${res.sib})`);
      ok(res.landed, `a swipe from card 2 snaps onto the guide at 390px (scroll ${Math.round(res.scroll)}, guide at ${Math.round(res.guideAt)})`);
      swipe = `swipe at 390px landed on the guide (scroll ${Math.round(res.scroll)} = guide ${Math.round(res.guideAt)})`;
    }
  }
}

if (fail.length) { console.error("check-guide-in-rail: FAIL"); for (const m of fail) console.error("  - " + m); process.exit(1); }
console.log(`check-guide-in-rail: OK: ${pass} assertions; ${swipe}; helper and real slot executed, ${files.length} app files scanned, ${collections} guide collections route their guide into a rail track`);
