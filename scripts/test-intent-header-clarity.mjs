#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { INTENT_PAGES, intentHeader } from "../lib/intentPages.js";
import { buildCollectionHeader, experienceHeader } from "../lib/collectionHeader.js";
import { nowContext } from "../lib/nowContext.js";
import { areaSeasonalContext } from "../lib/areaSeasonalContext.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (value, message) => { n++; if (!value) fails.push(message); };
const count = (text, word) => (String(text).match(new RegExp(word, "gi")) || []).length;
const ctx = nowContext({ hour: 20, weather: null });
const local = areaSeasonalContext("Orlando", "summer");

// The city is assembled once, by the header helper, never by the component.
const best = intentHeader(INTENT_PAGES["best-of"], ctx, "Orlando", 0, local.area_known_for);
const passed = intentHeader(INTENT_PAGES.nearby, ctx, "Orlando", 1, local.area_known_for);
const gems = intentHeader(INTENT_PAGES["hidden-gems"], ctx, "Orlando", 0, local.area_known_for);
ok(best.title === "The highest-scoring places in Orlando", "best-of title is complete and exact");
ok(passed.title === "You have driven past most of these", "nearby title does not acquire a stray city suffix");
ok(gems.title === "Hidden gems in Orlando", "hidden-gems title includes the city exactly once");
for (const h of [best, passed, gems]) ok(count(h.title, "Orlando") <= 1, `city appears at most once in '${h.title}'`);
ok(!/in Orlando Orlando/i.test(best.title), "never renders 'in Orlando Orlando'");
ok(!/most of these Orlando/i.test(passed.title), "never renders 'most of these Orlando'");
ok(gems.deck.includes("theme parks") && gems.deck.includes("quietly excellent"), "the deck explains the sheet and adds vetted Orlando culture");
ok((gems.deck.match(/[.!?]/g) || []).length === 1, "the primary deck stays one sentence");

const duplicate = buildCollectionHeader({ eyebrow: "Hidden gems in Orlando", title: "Hidden gems in Orlando", deck: "One sentence.", city: "Orlando" });
ok(duplicate.eyebrow === "", "an eyebrow that merely repeats the headline is suppressed");

// Eight main category sheets all receive a complete, compact, city-aware
// header. This exercises the same helper screens/Experience.js calls.
const categories = ["outdoors", "hiddengems", "bucketlist", "familyfun", "friends", "datenight", "nightout", "eatnow"];
for (const key of categories) {
  const exp = { title: key === "hiddengems" ? "Hidden Gems" : key.replace(/([a-z])([A-Z])/g, "$1 $2"), label: key };
  const h = experienceHeader(key, exp, "Orlando", local.area_known_for);
  ok(h.title && h.deck && count(h.title, "Orlando") === 1, `${key} has one complete Orlando-aware title and deck`);
  ok(h.eyebrow !== h.title, `${key} does not repeat identical eyebrow/headline copy`);
}

const Blocks = await loadComponent(path.join(ROOT, "app/components/ExperienceBlocks.js"), ROOT);
const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const alwaysOpen = { periods: [{ open: { day: 0, hour: 0 }, close: { day: 0, hour: 0 } }] };
const places = [
  { id: "inside", name: "The Gallery", rating: 4.8, reviews: 650, distMi: 2.4, types: ["museum"], oh: alwaysOpen, utcOffset: 0 },
  { id: "near", name: "Night Owl", rating: 4.7, reviews: 720, distMi: 4.1, types: ["bar"], oh: alwaysOpen, utcOffset: 0 },
];
const wet = { outdoorOK: false, weather: { known: true, isWet: true } };
const rows = Blocks.rightNowRows([{ id: "inside", why: "4.8 stars" }], places, [places[1], places[0]], wet, Date.UTC(2026, 6, 26, 18));
ok(rows.length === 1, "a genuinely current pick renders");
ok(rows[0].why === "Good indoor option during storms", "weather reason is current and specific");
ok(!/rating|review|score|star|★/i.test(rows[0].why), "Right now never uses generic ranking evidence as its reason");
ok(Blocks.rightNowRows([{ id: "inside" }, { id: "near" }], places, places, null, Date.UTC(2026, 6, 26, 18)).length === 0, "a Right now list identical to the durable ranking is suppressed");
ok(Blocks.rightNowRows([{ id: "inside" }], [{ ...places[0], distMi: 18 }], [places[1]], wet, Date.UTC(2026, 6, 26, 18)).length === 0, "a far result is not called nearby");

const card = renderToStaticMarkup(createElement(Card, {
  place: { ...places[0], photoRef: "places/abc/photos/def", priceLevel: 2 },
  rank: 1, href: "/p/inside", editorial: "A museum locals use when the afternoon sky opens up.", intentLabel: "Hidden gems",
}));
for (const needle of ["Rank 1", "The Gallery", "WAYFIND", "650 reviews", "Moderate", "Best activities pick", "Hidden gems", "View place", "Share"]) {
  ok(card.includes(needle), `iconic card renders '${needle}'`);
}
ok(card.includes("clamp(104px,29vw,150px)") && card.includes("minmax(0,1fr)"), "iconic card uses a fluid, shrink-safe 390px grid");

const intentSource = readFileSync(path.join(ROOT, "app/components/IntentPageClient.js"), "utf8");
ok(!intentSource.includes("titleBottom={loc.city}"), "the client never appends city unconditionally");
ok(intentSource.includes("data-collection-filter"), "the ranking keeps a visible functional filter");
ok(intentSource.includes("<IconicPlaceCard"), "intent rankings use the iconic card instead of thin rows");
ok(intentSource.indexOf("areaCtx.headline_context") > intentSource.indexOf("<details"), "metro prose lives only in collapsed About city content below the list");

if (fails.length) {
  console.error(`test-intent-header-clarity: FAIL — ${fails.length}/${n}`);
  for (const failure of fails) console.error("  · " + failure);
  process.exit(1);
}
console.log(`test-intent-header-clarity: OK — ${n} assertions (3 regression titles, 8 category headers, current reasons, redundant suppression, iconic cards, filter, 390px contract)`);
