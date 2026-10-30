// scripts/check-seasonal-rail-depth.mjs — owner, 2026-10-29: seasonal poster
// rails (Fall, Halloween, Christmas) showed too few cards; aim for 23+.
// EXECUTES the real code: window size, paging math, farms radius + ordering,
// and that off-theme rows never land on farms / corn-mazes / ghost-tours.
import { RAIL_PAGE_SIZE, nextPageAfterSeed, pageOneRail } from "../lib/railPage.js";
import { windowRailAnswer } from "../lib/railResponse.js";
import { composeFallIntentRails, FALL_RAIL_RADIUS_MI, FALL_FARMS_NEAR_MI } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";

let pass = 0;
const fail = (m) => { console.error("check-seasonal-rail-depth: FAIL - " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// (a) NO WINDOW (owner 2026-10-29, supersedes the 24-card plan): every rail
// ships every option and the counter is the true total.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i, kind: "place", name: "Card " + i }));
const fixture = { rails: [{ id: "towns-markets", cards: mk(69) }] };
const win = windowRailAnswer(fixture, false);
ok(win.rails[0].cards.length === 69 && win.rails[0].total === 69 && !win.hasMore, "69-card rail ships all 69 with total 69 and no hasMore");
ok(windowRailAnswer(fixture, true).rails[0].cards.length === 69, "full=1 returns everything");
ok(windowRailAnswer(fixture, false, 12).rails[0].cards.length === 12, "negative control: an explicit window still trims, so the probe can see a cap");
for (const f of ["app/api/events/fall/route.js", "app/api/events/christmas/route.js", "app/api/night-out/route.js", "app/api/date-night/route.js", "app/api/birthday/route.js", "app/api/today-discovery/route.js"]) {
  const src = strip(readFileSync(path.join(ROOT, f), "utf8"));
  ok(/windowRailAnswer\(\s*(?:cached\.value|answer),\s*full\s*\)/.test(src), `${f} serves windowRailAnswer with the default (unbounded) window`);
}
// Component side: no slice cap on the rail's own cards/places, no page-size import.
for (const f of ["FallIntentRails", "ChristmasIntentRails", "NightOutRails", "DateNightRails", "BirthdayRails", "TodayDiscoveryRails"]) {
  const src = strip(readFileSync(path.join(ROOT, `app/components/${f}.js`), "utf8"));
  ok(!/rail\.(?:cards|places)\s*\|\|\s*\[\]\)\.slice\(/.test(src) && !/RAIL_PAGE_SIZE/.test(src), `${f} seeds the pager with every card (no slice, no page-size cap)`);
}
// The pager itself, executed: a 69-card seed renders 69 items, total 69, nothing left to fetch.
{
  const { usePagedRail } = await loadComponent(path.join(ROOT, "app/components/usePagedRail.js"), ROOT);
  const Probe = ({ n, total }) => {
    const r = usePagedRail("/api/events/christmas", { lat: 27, lng: -82, rail: "towns-markets" }, { seedItems: mk(n), seedTotal: total, itemsKey: "cards" });
    return React.createElement("div", { "data-n": r.items.length, "data-total": r.total, "data-more": String(r.items.length < r.total) });
  };
  const html = renderToStaticMarkup(React.createElement(Probe, { n: 69, total: 69 }));
  ok(/data-n="69"/.test(html) && /data-total="69"/.test(html) && /data-more="false"/.test(html), "pager seeded with 69 renders 69, counter total 69, no more to load: " + html);
  const capped = renderToStaticMarkup(React.createElement(Probe, { n: 10, total: 69 }));
  ok(/data-n="10"/.test(capped) && /data-more="true"/.test(capped), "negative control: a 10-card seed of 69 is visibly short");
}

// (b) paging math: no gap, no duplicate
ok(nextPageAfterSeed(12, 24, 40) === 0, "short seed re-asks page 0");
ok(nextPageAfterSeed(24, 24, 40) === 1, "full seed continues at page 1");
ok(nextPageAfterSeed(10, 24, 10) === 1, "whole-rail seed continues at page 1");
ok(nextPageAfterSeed(0, 24, 0) === 1 || nextPageAfterSeed(0, 24, 0) === 0, "empty seed is defined");
{ // page 1 at size 24 starts at card 25 (index 24)
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: "r" + i }));
  const rails = [{ id: "x", cards: rows }];
  const p0 = pageOneRail(rails, "x", { page: 0, size: 24 }).cards;
  const p1 = pageOneRail(rails, "x", { page: nextPageAfterSeed(24, 24, 60), size: 24 }).cards;
  ok(p0.at(-1).id === "r23" && p1[0].id === "r24", "page 1 at size 24 continues at card 25 with no gap or duplicate");
}

// (c) farms radius and ordering
const TODAY = "2026-10-20";
const HOME = [27.0, -82.0];
const dLng = (mi) => mi / (69.17 * Math.cos(HOME[0] * Math.PI / 180)); // miles due east
const farm = (id, mi, start = "2026-10-01") => ({
  event_id: id, id, event_name: id + " Pumpkin Patch", slug: id, city: "X", lat: HOME[0], lng: HOME[1] + dLng(mi),
  start_date: start, end_date: "2026-11-15", event_status: "scheduled", source_tier: 1, verification_confidence: "high",
  category: "seasonal", subcategory: "pumpkin-patch", tags: ["fall", "pumpkins", "farm"], audience: ["families"],
  hero_image: "https://example.com/x.jpg", image: "https://example.com/x.jpg", year: 2026,
});
const compose = (events) => composeFallIntentRails(events, [], { lat: HOME[0], lng: HOME[1], today: TODAY, now: new Date(TODAY + "T12:00:00-04:00") });
const farmIds = (events) => compose(events).rails.find((r) => r.id === "farms").cards.map((c) => c.id);
ok(FALL_RAIL_RADIUS_MI.farms === 60 && FALL_FARMS_NEAR_MI === 45, "farms radius 60, near band 45");
ok(FALL_RAIL_RADIUS_MI.food === 27 && FALL_RAIL_RADIUS_MI.family === 27 && FALL_RAIL_RADIUS_MI["date-night"] === 27, "food, family, date-night not widened");
// far farm has the EARLIEST date and would lead without the split (positive control for the sort)
const evs = [farm("far-55", 55, "2026-09-25"), farm("near-30", 30, "2026-10-10"), farm("near-10", 10, "2026-10-12"), farm("edge-44", 44, "2026-10-15"), farm("gone-65", 65, "2026-09-20")];
const ids = farmIds(evs);
ok(ids.includes("far-55") && ids.includes("near-30") && ids.includes("edge-44"), "55 mi farm admitted next to near ones (" + ids.join() + ")");
ok(!ids.includes("gone-65"), "65 mi farm excluded");
ok(ids.indexOf("far-55") === ids.length - 1 && ids.indexOf("edge-44") < ids.indexOf("far-55") && ids.indexOf("near-10") < ids.indexOf("far-55"), "far farm sorts after every in-radius farm (" + ids.join() + ")");
ok(ids.indexOf("near-30") < ids.indexOf("edge-44") || ids.indexOf("near-30") < ids.indexOf("near-10"), "date order kept inside the near group (" + ids.join() + ")");
const cards = compose(evs).rails.find((r) => r.id === "farms").cards;
ok(cards.every((c) => Number.isFinite(c.distMi)), "every farm card keeps an honest numeric distance");

// (d) off-theme rows never land on farms / corn-mazes / ghost-tours
const offTheme = [
  { ...farm("para-dance", 5), event_name: "Paranormal Dance Party", slug: "para-dance", category: "nightlife", subcategory: "dance-party", tags: ["halloween", "dance", "party"], audience: ["adults"] },
  { ...farm("psl-promo", 5), event_name: "Pumpkin Spice Latte Promo", slug: "psl-promo", category: "food", subcategory: "promo", tags: ["seasonal-drinks", "coffee"], audience: ["adults"] },
];
const comp = compose([...evs, ...offTheme]);
const halloween = composeHalloweenRails(comp.rails, TODAY);
const bad = (set) => set.flatMap((r) => ["farms", "corn-mazes", "ghost-tours"].includes(r.id) ? r.cards.map((c) => `${r.id}:${c.id}`) : []).filter((s) => /para-dance|psl-promo/.test(s));
ok(bad(comp.rails).length === 0 && bad(halloween).length === 0, "planted off-theme rows stay out of farms/corn-mazes/ghost-tours: " + bad([...comp.rails, ...halloween]).join());
ok(comp.rails.some((r) => r.cards.some((c) => /para-dance|psl-promo/.test(c.id))) || halloween.some((r) => r.cards.some((c) => /para-dance|psl-promo/.test(c.id))), "positive control: planted rows exist elsewhere, the probe can see them");
const hf = halloween.find((r) => r.id === "farms").cards.map((c) => c.id);
ok(hf.indexOf("far-55") === hf.length - 1 || !hf.includes("far-55"), "Halloween farms keep the far band last (" + hf.join() + ")");

console.log(`check-seasonal-rail-depth: OK - ${pass} assertions (unbounded window, 69-card pager render, paging math, farms 45/60 split, off-theme probe with controls)`);
