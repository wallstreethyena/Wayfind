#!/usr/bin/env node
// scripts/test-wayfind-awards.mjs — the Best Breakfast 2026 winners wear their
// earned award on every place card, and NOTHING else does.
//
// Owner (2026-10-03): "add the badge to the place card for the breakfast places
// that won the 2026 breakfast award and make sure there is an editorial for the
// winners". This RENDERS the shared house cards (IconicPlaceCard, RailCard) via
// jsxLoad and CALLS lib/wayfindAwards.js; it does not grep for strings.
//
// Locks:
//   1. every registered winner resolves to an award, and a non-winner (including
//      ANOTHER LOCATION of a winning chain) resolves to null
//   2. IconicPlaceCard + RailCard render the award band for a winner, ahead of
//      the live rank chip, and render the normal TOP … PICK chip for a non-winner
//   3. every winner holds an Atlas editorial card (data/atlas/editorial-cards.json)
//   4. home.js PlaceCard + Detail sheet both route through wayfindAwardFor
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AWARDS, wayfindAwardFor, awardedPlaceIds } from "../lib/wayfindAwards.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-wayfind-awards: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── 1. The registry, CALLED ────────────────────────────────────────────────
const ids = awardedPlaceIds();
ok(ids.length === 6, "Best Breakfast 2026 has 6 winning locations (got " + ids.length + ")");
ok(new Set(ids).size === ids.length, "no place wins twice");
for (const award of AWARDS) {
  for (const w of award.winners) {
    ok(/^ChIJ[\w-]{10,}$/.test(w.placeId), w.name + " is keyed by a real Google place_id");
    for (const shape of [w.placeId, { id: w.placeId }, { place_id: w.placeId }, { placeId: w.placeId }]) {
      const a = wayfindAwardFor(shape);
      ok(a && a.wayfindAward && a.tone === "wayfind-award", w.name + " resolves from " + JSON.stringify(shape).slice(0, 40));
    }
    const a = wayfindAwardFor(w.placeId);
    ok(a.label.startsWith(award.title + " · "), w.name + " label names the dated award: " + a.label);
    ok(a.label.length <= 34, w.name + " label fits the 390px band (" + a.label.length + " chars)");
    ok(!/[–—]/.test(a.label + a.detail), w.name + " copy carries no dashes");
    ok(!/\bbest\b.+\bpick\b/i.test(a.label), "an earned award never reads as the banned BEST … PICK chip");
  }
}
// Negative controls: the La Croisette area answer must never say "in AMI".
ok(wayfindAwardFor("ChIJFfdjBlz9wogR6wSfGKbqL0k").detail === "#1 near Anna Maria Island",
  "La Croisette (St. Pete Beach) is #1 NEAR Anna Maria Island, never placed in it");
// Another Keke's location (University Pkwy) and another Bistro Café (downtown) did NOT win.
ok(wayfindAwardFor("ChIJfeY1tNk4w4gRNX1FjX6p6xo") === null, "a non-winning Keke's location wears no award");
ok(wayfindAwardFor({ id: "ChIJISrRpNC32YgRBTY3l4DVuCk" }) === null, "the downtown Bistro Café (not the winner) wears no award");
ok(wayfindAwardFor(null) === null && wayfindAwardFor({}) === null && wayfindAwardFor("") === null, "empty input is null");

// ── 2. RENDER the house cards ───────────────────────────────────────────────
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
const WIN = { id: "ChIJFfdjBlz9wogR6wSfGKbqL0k", name: "La Croisette", rating: 4.8, reviews: 6598, types: ["breakfast_restaurant", "restaurant"], primaryType: "breakfast_restaurant", governed_score: 96 };
const LOSE = { id: "ChIJfeY1tNk4w4gRNX1FjX6p6xo", name: "Keke's Breakfast Cafe", rating: 4.5, reviews: 1793, types: ["breakfast_restaurant", "restaurant"], primaryType: "breakfast_restaurant", governed_score: 90 };

const iw = renderToStaticMarkup(React.createElement(Iconic, { place: WIN, rank: 2 }));
ok(iw.includes("wf-place-card-award is-wayfind-award"), "IconicPlaceCard renders the award band for a winner");
ok(iw.includes("Best Breakfast 2026 · AMI area"), "IconicPlaceCard shows the award label");
ok(!/Top \w+ pick/i.test(iw), "the earned award takes the one credential slot (no second TOP … PICK chip)");
const il = renderToStaticMarkup(React.createElement(Iconic, { place: LOSE, rank: 1 }));
ok(!il.includes("is-wayfind-award") && /Top \w+ pick/i.test(il), "a non-winner keeps the normal TOP … PICK chip (positive control)");

const rw = renderToStaticMarkup(React.createElement(RailCard, {
  place: WIN, title: WIN.name, rank: 3, score: 9.6,
  award: { icon: "3", label: "Top breakfast pick", tone: 3 },
}));
ok(rw.includes("wf-place-card-award is-wayfind-award") && rw.includes("Best Breakfast 2026"),
  "RailCard resolves the award from the place row and overrides the caller's rank band");
ok(!rw.includes("Top breakfast pick"), "RailCard shows one credential, not two");
const rl = renderToStaticMarkup(React.createElement(RailCard, {
  place: LOSE, title: LOSE.name, rank: 3, score: 9.0,
  award: { icon: "3", label: "Top breakfast pick", tone: 3 },
}));
ok(rl.includes("Top breakfast pick") && !rl.includes("is-wayfind-award"), "RailCard keeps the caller's band for a non-winner");

// ── 3. Every winner has an editorial card ───────────────────────────────────
const cards = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
const byId = new Map(cards.map((c) => [c.placeId, c]));
for (const id of ids) {
  const c = byId.get(id);
  ok(c, "winner " + id + " (" + (wayfindAwardFor(id).label) + ") has an Atlas editorial card");
  for (const k of ["whyGo", "knownFor", "insiderMove", "vibeCheck", "bestFor"]) {
    ok(typeof c[k] === "string" && c[k].trim().length > 20, c.name + " editorial has " + k);
  }
  ok(Array.isArray(c.sourceUrls) && c.sourceUrls.length >= 2, c.name + " editorial cites its sources");
}

// ── 4. Other renderers route through the helper ─────────────────────────────
{
  const home = strip(readFileSync(path.join(ROOT, "app/home.js"), "utf8"));
  const start = home.indexOf("function PlaceCard(");
  ok(start >= 0, "positive control: home PlaceCard exists");
  const body = home.slice(start, start + 12000);
  ok(/const\s+cardAward\s*=\s*wayfindAwardFor\(p\)\s*\|\|/.test(body), "home PlaceCard composes its award from wayfindAwardFor(p) first");
  ok(/is-wayfind-award/.test(body), "home PlaceCard styles the earned award band");
  const detail = strip(readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8"));
  ok(/wayfindAwardFor\(detail\)/.test(detail), "Detail sheet shows the award in its verdict row");
  const css = readFileSync(path.join(ROOT, "app/components/css.js"), "utf8");
  ok(/\.wf-place-card-award\.is-wayfind-award\{/.test(css), "house CSS styles .is-wayfind-award");
}

console.log(`test-wayfind-awards: OK — ${pass} assertions (${ids.length} winners, rendered IconicPlaceCard + RailCard, ${cards.length} editorial cards scanned)`);
