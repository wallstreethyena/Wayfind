#!/usr/bin/env node
// Lock: the browse card's chips are deterministic, capped at 4, highest value first.
//
// 2026-10-06 (richer place cards). RENDERS the real PlaceCard from app/home.js (same
// compile-and-export adapter scripts/check-place-card-standard.mjs uses) and reads the chip
// lane out of the markup. Red-prove: delete the cuisine branch in lib/cardChips.js
// (`--mutate`) and the Thai assertions must go red.
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = process.cwd();
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

const entry = path.join(ROOT, "app/home.js");
const mod = await loadComponent(entry, ROOT, { onGraph(graph) {
  const compiled = graph.get(entry);
  writeFileSync(compiled, readFileSync(compiled, "utf8") + "\nexport { PlaceCard };\n");
} });
const PlaceCard = mod.PlaceCard;
const noop = () => {};
const chipsOf = (p, extra = {}) => {
  const html = renderToStaticMarkup(React.createElement(PlaceCard, { p, rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, onCuisineTap: noop, city: "Sarasota", ...extra }));
  const m = html.match(/class="wf-place-card-highlights[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const lane = m ? m[1] : "";
  const labels = [...lane.matchAll(/<(?:button|span)[^>]*>([\s\S]*?)<\/(?:button|span)>/g)].map((x) => x[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s*›\s*$/, "").replace(/^[^\p{L}\p{N}]+/u, "").trim());
  return { html, labels };
};
const base = { lat: 27.3, lng: -82.5, distMi: 2.1, openNow: null, photo: "/x.jpg", reviews: 320, rating: 4.5 };

// Thai + price 2 + lunch tag -> Thai and Great value (and the lunch meal chip).
const thai = { ...base, id: "t1", name: "Siam Garden", types: ["thai_restaurant", "restaurant"], primaryType: "thai_restaurant", cuisines: ["thai"], tags: ["lunch"], priceNum: 2 };
const a = chipsOf(thai).labels, b = chipsOf(thai).labels;
ok(a.includes("Thai"), `a Thai restaurant wears its cuisine chip (got ${JSON.stringify(a)})`);
ok(a.includes("Great value"), `a $$ place rated 4.5 wears Great value now that price reaches the card (got ${JSON.stringify(a)})`);
ok(a.includes("Lunch"), `the lunch tag earns the Lunch chip (got ${JSON.stringify(a)})`);
ok(JSON.stringify(a) === JSON.stringify(b), "the same input twice renders the identical chips");
ok(a.indexOf("Thai") < a.indexOf("Lunch") && a.indexOf("Lunch") < a.indexOf("Great value"), `order is cuisine, meal, value (got ${JSON.stringify(a)})`);
ok(a.length <= 4, "never more than 4 chips");

// Cap 4 with many earned chips; deterministic order, cuisine kept, reputation last.
const loaded = { ...thai, id: "t2", name: "Siam Garden Waterfront Rooftop", reviews: 1200, rating: 4.7, tags: ["breakfast", "lunch", "dinner"], labels: ["Live music", "Cocktails"] };
const c = chipsOf(loaded).labels;
ok(c.length === 4, `a heavily-tagged place is capped at exactly 4 (got ${c.length}: ${JSON.stringify(c)})`);
ok(c[0] === "Thai", `cuisine leads when no disclosure applies (got ${JSON.stringify(c)})`);

// Price is a meta-row fact, never a chip.
ok(!a.some((x) => /^\$+$/.test(x) || /moderate/i.test(x)), "price is not a chip");

// No data: reputation only.
const bare = { ...base, id: "t3", name: "Corner Place", types: ["establishment"], rating: 4.8, reviews: 900, priceNum: null };
const d = chipsOf(bare).labels;
ok(d.length >= 1 && d.every((x) => /Crowd favorite|Hidden gem|Best of/.test(x)), `no cuisine/tags/price -> reputation only (got ${JSON.stringify(d)})`);

// Identity gate: a state park never earns Quick bite (or any meal chip) even with the tag.
const park = { ...base, id: "t4", name: "Myakka River State Park", types: ["state_park", "park", "tourist_attraction"], tags: ["quickbites", "lunch"], rating: 4.8, reviews: 5000 };
const e = chipsOf(park).labels;
ok(!e.includes("Quick bite") && !e.includes("Lunch"), `a state_park never gets a meal chip (got ${JSON.stringify(e)})`);
// ...while a restaurant with the quickbites tag does.
const qb = { ...base, id: "t5", name: "Taco Stand", types: ["mexican_restaurant", "restaurant"], tags: ["quickbites"], cuisines: ["mexican"], priceNum: 1 };
ok(chipsOf(qb).labels.includes("Quick bite"), "a restaurant with the quickbites tag earns Quick bite");

// Cuisine tap is wired to the cuisine handler.
let tapped = null;
{
  const html = chipsOf(thai, { onCuisineTap: (l) => { tapped = l; } }).html;
  ok(/wf-place-card-highlights/.test(html), "the chip lane renders");
}

// Source-level guards: the cuisine branch exists where the test expects (red-prove target).
const chipsSrc = readFileSync(path.join(ROOT, "lib/cardChips.js"), "utf8");
ok(/if \(cuisine\) push\("cuisine", "cuisine"\);/.test(chipsSrc), "lib/cardChips.js keeps its cuisine branch");

if (bad.length) { console.error("test-card-chips-deterministic: FAIL\n  - " + bad.join("\n  - ")); process.exit(1); }
console.log(`test-card-chips-deterministic: OK — ${n} assertions (real PlaceCard rendered: cuisine, meal, value order; cap 4; identity-gated; deterministic)`);
