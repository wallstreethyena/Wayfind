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

// ── 5. THE TILE + DROP (v8.66, owner 2026-08-26: "i asked for it to be
//       placed on [the daypart poster strip] with its own rail card … pop
//       down like we have for the amazon rail card"). The v8.64 mid-feed
//       ChefPicksRail is GONE from home.js by the same directive — the chef
//       surface is now a daypart tile whose tap opens the standard pop-down
//       drop of house place cards, in HIS order. ─────────────────────────────
{
  const home = readFileSync(path.join(REPO, "app/home.js"), "utf8");
  ok(home.indexOf("function ChefPicksRail(") === -1 && home.indexOf("<ChefPicksRail") === -1,
    "the mid-feed ChefPicksRail is fully removed from home.js (owner: the strip tile replaces it)");
  const rails = readFileSync(path.join(REPO, "lib/rails.js"), "utf8");
  const chefRow = (rails.match(/\{ id: "chef",[\s\S]*?\},/) || [""])[0];
  ok(/art: "chef"/.test(chefRow), "the chef rail entry exists and wears the owner's poster art");
  ok(!/href:/.test(chefRow), "the chef tile carries NO href — it is a button, a tap never navigates");
  const day = readFileSync(path.join(REPO, "lib/dayparts.js"), "utf8");
  ok((day.match(/order: \[[^\]]*'chef'[^\]]*\]/g) || []).length === 4, "the chef tile rides all four daypart bands");
  const rail = readFileSync(path.join(REPO, "app/components/DaypartRail.js"), "utf8");
  ok(/chefPickPlaces\(RON_DUPRAT_TOP7\)\.map\(/.test(rail) && !/chefPlaces\s*\.\s*sort/.test(rail),
    "the drop renders chefPickPlaces verbatim — no sort touches Ron's order");
  // v8.69 — the expression became a ternary when the paid rail card landed, and
  // this FOLLOWED it rather than being deleted. The invariant is unchanged and
  // is now asserted in two halves, because the refactor introduced a way to
  // break it that did not exist before:
  //   1. the chef drop still serves HIS list rather than a ranked pool;
  //   2. …and no paid card can be prepended to it. A sponsored unit at position
  //      one of a named chef's personal Top 7 reads as Wayfind having sold his
  //      endorsement — the false-endorsement shape creatorRights.js bans in
  //      wording, arriving through placement instead.
  ok(/selected === "chef" \? chefPlaces/.test(rail), "the chef drop serves HIS list, not the ranked pools");
  const { RAILS_NOT_FOR_SALE, sponsoredRailNear } = await import("../lib/sponsoredPlaces.js");
  ok(RAILS_NOT_FOR_SALE.includes("chef"), "the chef rail is registered as NOT FOR SALE");
  ok(sponsoredRailNear("chef", 27.4214874, -82.5367616, "2026-08-28") === null,
    "…and the gate refuses to serve a paid card there even from inside a live placement's own radius");
  ok(/selRail\.id !== "chef"/.test(rail), 'the drop header never claims "near <city>" for a list that spans states by design');
  const art = readFileSync(path.join(REPO, "public/cards-v8/chef-760.jpg"));
  ok(art.length > 10000, "the owner's chef poster tile ships (cards-v8/chef-760.jpg)");
}

console.log(`check-chef-picks: OK — ${pass} assertions${n === 0 ? " (list not yet supplied — card correctly dark)" : ""}`);
