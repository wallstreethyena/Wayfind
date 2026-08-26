#!/usr/bin/env node
// scripts/check-chef-picks.mjs — a chef's list is testimony; it renders
// verbatim or not at all.
//
// "Chef Ron Duprat's Top 7" publishes a real, named person's personal picks.
// The two failure modes this guard makes impossible:
//   • a restaurant appearing under his name that he did not pick (a fabricated
//     endorsement — worse than any bad card), and
//   • his order being "improved" by score, distance, sponsorship or affiliate
//     value (the owner's directive locks his ranking exactly as given).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RON_DUPRAT_TOP7, chefPicksReady, chefPickPlaces, chefHookCard } from "../lib/chefPicks.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0;
const fail = (m) => { console.error("check-chef-picks: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const C = RON_DUPRAT_TOP7;
const n = C.entries.length;

// ── 1. ALL-OR-NOTHING ────────────────────────────────────────────────────────
ok(n === 0 || n === 7, `entries is complete (7) or empty (0) — a partial chef list is a misquote (got ${n})`);
ok(chefPicksReady(C) === (n === 7), "chefPicksReady mirrors the all-or-nothing rule");
if (n === 0) {
  ok(chefHookCard(C) === null, "with no list, the hook card is null — the strip must never advertise a list that cannot open");
  ok(chefPickPlaces(C).length === 0, "…and the sheet gets no places");
}

// ── 2. WHEN LIVE: verbatim, complete, real ───────────────────────────────────
if (n === 7) {
  const ranks = C.entries.map((e) => e.rank);
  ok(JSON.stringify(ranks) === JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
    "ranks are 1..7 in array order — the array IS his order, no sort can hide behind the rank field");
  for (const e of C.entries) {
    ok(e.name && e.city && e.state, `entry #${e.rank} carries name, city, state`);
    ok(typeof e.placeId === "string" && e.placeId.length >= 10, `entry #${e.rank} carries a resolved placeId — a card without one cannot open a detail sheet`);
    ok(e.whyWorthTheTrip, `entry #${e.rank} says why it is worth the trip (Wayfind's words, from the chef's reasoning)`);
  }
  const placed = chefPickPlaces(C);
  ok(placed.length === 7 && placed.every((p, i) => p._chefRank === i + 1),
    "chefPickPlaces preserves the chef's order verbatim");
  const card = chefHookCard(C);
  ok(!!card && card.action && card.action.type === "chefpicks", "hook card routes to the chefpicks action");
}

// ── 3. LOCKED COPY ───────────────────────────────────────────────────────────
ok(C.title === "Chef Ron Duprat's Top 7", "rail title is the locked owner copy");
ok(C.sub === "7 restaurants a Top Chef says are worth the trip.", "subhead is the locked owner copy");
ok(C.cta === "See Ron's Picks →", "CTA is the locked owner copy");
ok(C.eyebrow === "Curated by a Top Chef", "eyebrow is the locked owner copy");

// ── 4. THE WIRING HOLDS ──────────────────────────────────────────────────────
{
  const home = readFileSync(path.join(REPO, "app/home.js"), "utf8");
  ok(/chefHookCard\(RON_DUPRAT_TOP7\)/.test(home), "home builds the chef card from the registry");
  ok(/out\.splice\(Math\.min\(1, out\.length\), 0, _chef\)/.test(home),
    "the card is pinned at position 1 — inside the first three, owner directive");
  ok(!/type === "chefpicks"[\s\S]{0,900}presetSort: "curated"/.test(home),
    "owner directive 2026-08-25: the sheet ranks by Wayfind Score — the chef's rank rides as _chefRank, it does not force the sort");
  ok(/type === "chefpicks"[\s\S]{0,900}presetMi: 5000/.test(home),
    "distance never filters his list — it spans states by design");
  const hero = path.join(REPO, "public/cards/chef-ron-duprat-top7.jpg");
  ok(readFileSync(hero).length > 10000, "the hero art ships with the card");
}

// ── 5. THE RAIL (v8.64, owner 2026-08-26: "in the rail card... same style...
//       keep Ron's order exactly as given") ────────────────────────────────
{
  const home = readFileSync(path.join(REPO, "app/home.js"), "utf8");
  const at = home.indexOf("function ChefPicksRail(");
  ok(at > -1, "ChefPicksRail is declared");
  const body = home.slice(at, at + 3600);
  // Same tile chrome as the commerce rails — the constants that ARE the style.
  ok(/flex: "0 0 200px"/.test(body), "rail tile is the shared 200px card");
  ok(/height: 86/.test(body), "rail tile has the shared 86px image band");
  ok(/scrollSnapType: "x proximity"/.test(body), "rail scrolls with the shared snap");
  // HIS order: the rail maps chefPickPlaces() output directly — the function
  // section 2 already proves preserves entry order — with no sort in between.
  ok(/const places = chefPickPlaces\(c\);/.test(body) && !/places\s*\.\s*sort|\.sort\(/.test(body),
    "the rail renders chefPickPlaces verbatim — no sort touches Ron's order");
  ok(/Ron's #\{p\._chefRank\}/.test(body), "each tile wears Ron's own rank");
  // Picks, not paid placements: nothing commercial may enter this rail.
  ok(!/commerceHref|viator|sponsored|href=/.test(body.replace(/\/\* [\s\S]*?\*\//g, "")),
    "no affiliate/commerce href inside the chef rail — testimony is never monetized inline");
  ok(/onError=\{\(e\) => \{ if \(e\.currentTarget\.src\.indexOf\(c\.heroImage\)/.test(body),
    "a dead place photo falls back to the campaign art — a pick never hides");
  // Mounted on the Food browse.
  ok(/browseCat === "food" && <ChefPicksRail onOpen=\{openDetail\} \/>/.test(home),
    "the rail mounts on the Food browse and opens OUR place detail");
}

console.log(`check-chef-picks: OK — ${pass} assertions${n === 0 ? " (list not yet supplied — card correctly dark)" : ""}`);
