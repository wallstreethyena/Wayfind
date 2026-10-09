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
ok((html.match(/wf-guide-card/g) || []).length === 1 && !/wf-place-card-rank">/.test(html.slice(html.indexOf("data-guide-rail"), html.indexOf('data-card="2"'))), "exactly one guide card, carrying no rank badge");
ok(/wf-exploding-primary/.test(html.slice(html.indexOf("data-guide-rail"))), "the guide wears the sibling card class, so it sizes like the rail's cards");
const none = renderToStaticMarkup(React.createElement("div", null, React.createElement(RailGuideSlot, { railId: "beaches" }, cards(3))));
ok(!/data-guide-rail/.test(none), "NEGATIVE: a rail with no matched guide renders only its own cards");

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
ok(/<RailGuideSlot railId=\{rail\.id\} guide=\{rail\.guide/.test(christmas), "each Christmas rail puts its OWN guide third in its own track");
// Positive control for the static detector: a between-rails aside is caught.
ok(/Go deeper with a local guide/.test(`<aside aria-label="Go deeper with a local guide">`), "POSITIVE CONTROL: the aside detector matches the old shape");

if (fail.length) { console.error("check-guide-in-rail: FAIL"); for (const m of fail) console.error("  - " + m); process.exit(1); }
console.log(`check-guide-in-rail: OK: ${pass} assertions; helper and real slot executed, ${files.length} app files scanned, ${collections} guide collections route their guide into a rail track`);
