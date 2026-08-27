#!/usr/bin/env node
/**
 * scripts/check-rail-drop-images.mjs — the rail drop's photos must be EAGER.
 *
 * THE BUG (measured on production 2026-08-27, www.gowayfind.com, the homepage
 * rail's "Tonight's Move" drop, in Chrome, at both 390px and 1400px):
 *
 *     eight place cards, every one of them `inView: true`
 *     rail scrolled 2294px horizontally, plus a vertical nudge
 *     thirteen seconds elapsed
 *     -> ZERO images loaded. complete:false, currentSrc:"", naturalWidth:0
 *
 *     removeAttribute("loading") on ONE of them
 *     -> the SAME url painted in 7ms, naturalWidth 1200
 *
 *     HEAD on that url returned 200 image/jpeg the entire time
 *
 * So it is not the network, not the path, not the spend gate and not a slow
 * image. Chrome's lazy-loading intersection heuristic simply does not resolve
 * for images mounted into a horizontal scroller that a tap has just expanded.
 * In .wf8-pcrail, `loading="lazy"` does not mean "later" — it means NEVER, and
 * a lazy image there is a permanently blank grey box on the surface the owner
 * looks at most.
 *
 * This is the SECOND time: #979 found and fixed exactly this on the fall EVENT
 * tiles inside the same component, and the place cards sitting beside them were
 * left behind. Same bug, different component, three weeks apart. That is what
 * this guard is for — not the fix, which is one attribute, but the fact that
 * nothing was watching the other half of the same container.
 *
 * WHY IT IS NOT A PERF REGRESSION, asserted rather than asserted-in-prose:
 * the default on both card components stays `lazy` (they also render far below
 * the fold on landing pages, where lazy works and matters), the drop is the
 * only caller that opts out, and the drop renders nothing until a tap — so LCP
 * is long settled before any of these fetches start.
 *
 * ASSERTED BY RENDERING, not by grep. A regex over DaypartRail would pass while
 * the prop was silently dropped on the way into the card, which is precisely
 * how the identifier-appears-but-plays-no-role false green happens (CLAUDE.md).
 * Both components are compiled and rendered, both ways, and the emitted
 * attribute is read out of the real markup.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PLACE = {
  id: "ChIJtest0000000000000", name: "Control Place", rating: 4.6, reviews: 480,
  types: ["restaurant"], lat: 27.34, lng: -82.53, photo: "/events/mobius-night-market-hero.jpg",
};

/* ── 1. IconicPlaceCard: lazy by DEFAULT, eager ON REQUEST ─────────────────*/
{
  const mod = await loadComponent(join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
  const Card = mod.default || mod;
  const lazy = renderToStaticMarkup(React.createElement(Card, { place: PLACE }));
  const eager = renderToStaticMarkup(React.createElement(Card, { place: PLACE, eagerMedia: true, mediaPriority: "high" }));

  // CONTROL FIRST. If the render produced no <img> at all, every assertion
  // below is vacuously true and this file would prove nothing.
  ok(/<img[^>]+wf-place-card|<img/.test(lazy) && /<img/.test(eager),
    "CONTROL: both renders actually emitted an <img> — without this the attribute checks are vacuous");
  ok(/loading="lazy"/.test(lazy),
    "IconicPlaceCard is LAZY by default — it still renders below the fold on landing pages, where lazy works and matters");
  ok(/loading="eager"/.test(eager) && !/loading="lazy"/.test(eager),
    "…and EAGER when the caller opts out, in the rendered markup");
  ok(/fetchpriority="high"/i.test(eager), "…carrying the caller's fetch priority");
  ok(!/fetchpriority/i.test(lazy), "…and emitting no priority when none was asked for");
  ok(/decoding="async"/.test(eager) && /decoding="async"/.test(lazy),
    "decoding stays async either way — an eager image must not block the main thread while it decodes");
}

/* ── 2. RailCard: the other card in the SAME container ─────────────────────
   #979 fixed the fall event tiles and left the place cards beside them lazy.
   Fixing one component and not its neighbour is how this bug came back, so
   both are asserted here rather than in two files that can drift apart. */
{
  const mod = await loadComponent(join(ROOT, "app/components/RailCard.js"), ROOT);
  const Card = mod.default || mod;
  const base = { photo: "/events/mobius-night-market-hero.jpg", title: "Control", href: "/x" };
  const lazy = renderToStaticMarkup(React.createElement(Card, base));
  const eager = renderToStaticMarkup(React.createElement(Card, { ...base, eagerMedia: true, mediaPriority: "low" }));
  ok(/<img/.test(lazy) && /<img/.test(eager), "CONTROL: RailCard emitted an <img> both ways");
  ok(/loading="lazy"/.test(lazy), "RailCard is lazy by default");
  ok(/loading="eager"/.test(eager) && !/loading="lazy"/.test(eager), "…and eager on request");
  ok(/fetchpriority="low"/i.test(eager), "…with the caller's priority");
}

/* ── 3. THE DROP ACTUALLY OPTS OUT ─────────────────────────────────────────
   The prop existing proves nothing if the one caller that needs it does not
   pass it. This is the half that was missing for three weeks. */
{
  const rail = strip(readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8"));
  // DELIMIT ON THE THING THAT CANNOT MOVE. This read `dropList.map(` and went
  // red in v8.77 when the drop began mounting in chunks
  // (`dropList.slice(0, mounted).map(`) — a guard failing because correct code
  // moved. CLAUDE.md's rule is to FOLLOW the code, never to delete the
  // assertion, so it now anchors on `dropList` plus whatever call follows,
  // which survives a slice, a filter or a memo wrapper.
  const start = rail.search(/dropList(?:\.[a-zA-Z]+\([^)]*\))*\.map\(/);
  const end = rail.indexOf("</ul>", start);
  const block = start > -1 && end > start ? rail.slice(start, end) : "";
  ok(block.length > 400, `PROBE: the drop's card map was delimited (${block.length} chars) — a -1 here would scan the whole file and prove nothing`);
  ok(/<IconicPlaceCard/.test(block), "PROBE: the delimited block really is the drop's card map");
  ok(/\beagerMedia\b/.test(block),
    "the rail drop opts every card out of lazy — in .wf8-pcrail lazy never fires, so a lazy image there is a PERMANENTLY blank one (measured: 8 in-view cards, 2294px of scroll, 0 loaded)");
  ok(/mediaPriority=\{i < \d+ \? "high" : "low"\}/.test(block),
    "…and the cards past the first screen yield priority to the ones the reader is looking at");
}

/* ── 4. NO OTHER CALLER WAS SILENTLY CHANGED ───────────────────────────────
   A guard that fires on correct code gets switched off. Prove the opt-out is
   narrow: the drop is the only place that passes it. */
{
  const files = ["app/home.js", "app/components/ThingsToDoList.js", "app/components/RailCard.js"];
  for (const f of files) {
    const src = strip(readFileSync(join(ROOT, f), "utf8"));
    const passes = (src.match(/eagerMedia(?!\s*=\s*false)/g) || []).length;
    const declares = /eagerMedia = false/.test(src);
    ok(declares || passes === 0,
      `${f}: does not opt out of lazy — the escape hatch is for the rail drop only, not a site-wide "load everything"`);
  }
}

/* ── 5. RED PROOFS ─────────────────────────────────────────────────────────*/
const RED = [
  ["a hardcoded lazy attribute is detectable", () => {
    const fake = '<img src="/a.jpg" loading="lazy" decoding="async"/>';
    return /loading="lazy"/.test(fake) && !/loading="eager"/.test(fake);
  }],
  ["a drop that stops passing the prop is detectable", () => {
    const withOut = '<IconicPlaceCard place={p} rank={r} surface="place_card" />';
    return !/\beagerMedia\b/.test(withOut);
  }],
  ["a vacuous render is detectable", () => {
    // The control that stops assertions 1 and 2 passing on an empty string.
    return !/<img/.test("<div></div>");
  }],
];
for (const [label, fn] of RED) ok(fn() === true, "RED PROOF failed to fail: " + label);

if (fails) {
  console.error(`check-rail-drop-images: FAIL — ${fails} of ${pass + fails} assertions`);
  process.exit(1);
}
console.log(`check-rail-drop-images: OK — ${pass} assertions (both card components rendered both ways; the drop opts out, nothing else does)`);
