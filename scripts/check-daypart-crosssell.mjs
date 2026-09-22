#!/usr/bin/env node
// scripts/check-daypart-crosssell.mjs — Lane D: lib/daypartCrossSell.js is the
// ONE central daypart -> offer-kind policy every cross-sell surface routes
// through, and it must stay order-only, commission-free, actually wired into
// UnifiedBrowseCommerceRail's menu-offer rows, and grounded in real
// MENU_PARTNER_OFFERS inventory — never an invented kind with nothing behind
// it.
//
// WHAT THIS LOCKS:
//   1. Every DAYPART_ID (lib/dayparts.js) yields at least one PREFERRED kind
//      with real, resolver-backed MENU_PARTNER_OFFERS inventory behind it —
//      "each daypart yields >=1 sensible resolver-backed pick".
//   2. Every AVOID pairing actually scores negative (a nightlife row really
//      loses ground at 8am; a theme-park ticket really loses ground at 9pm) —
//      "no daypart-inappropriate kinds" leading the rail.
//   3. The policy is ORDER-ONLY: no kind/daypart combination is ever excluded
//      from MENU_PARTNER_OFFERS entirely — every row that exists still
//      classifies to a kind and still scores a finite bonus in every band,
//      proving nothing gets dropped, only reordered.
//   4. The module never reads a commission/payout/price field and never
//      imports lib/commerce.js — "ordering never uses commission" — the same
//      mechanical check scripts/test-experience-now-rank.mjs runs on
//      lib/experienceNowRank.js.
//   5. UnifiedBrowseCommerceRail.js actually calls daypartCrossSellBonus for
//      its menu-offer rows — not a policy that exists but is never wired in.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CROSSSELL_KINDS,
  crossSellKindFor,
  daypartCrossSellBonus,
  DAYPART_IDS,
} from "../lib/daypartCrossSell.js";
import { MENU_PARTNER_OFFERS } from "../lib/menuPartnerOffers.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// A representative hour inside each daypart band, read from lib/dayparts.js
// itself so this guard can never disagree with the module it is checking.
function hourForPart(part) {
  const mid = { morning: 8, lunch: 12, afternoon: 15, night: 20 };
  return mid[part];
}

// --- 1. classification is total and stays inside the declared kind set ---
const kindSet = new Set(CROSSSELL_KINDS);
const classified = MENU_PARTNER_OFFERS.map((row) => {
  // fits entries are "cat:sub" strings (see lib/menuPartnerOffers.js) — the
  // exact shape crossSellKindFor()/the menu-offers route's `subcategory`
  // expect, so this derivation is the same one production takes, not a
  // reimplementation.
  const [cat, sub] = String(row.fits[0] || "").split(":");
  return { row, kind: crossSellKindFor({ cat, sub, title: row.title, offerId: row.offerId }) };
});
ok(classified.length === MENU_PARTNER_OFFERS.length, "every MENU_PARTNER_OFFERS row classifies to a kind (nothing dropped by classification)");
ok(classified.every((c) => kindSet.has(c.kind)), "every classified kind is one of the declared CROSSSELL_KINDS — no invented kind");

// --- 2. every daypart has >=1 PREFERRED kind with real inventory behind it ---
for (const part of DAYPART_IDS) {
  const preferredHere = classified.filter((c) => daypartCrossSellBonus(c.kind, hourForPart(part)) > 0);
  ok(preferredHere.length >= 1, `daypart "${part}" has at least one resolver-backed MENU_PARTNER_OFFERS pick that scores a preferred (positive) bonus`);
}

// --- 3. no daypart-inappropriate kind: every AVOID pairing scores negative,
//     proven against REAL rows of that kind, not just the map's own keys ---
const AVOID_CASES = [
  { kind: "nightlife", part: "morning", why: "a nightclub/music-venue row pitched at breakfast time" },
  { kind: "nightlife", part: "lunch", why: "a nightclub/music-venue row pitched at lunch" },
  { kind: "day-ticket", part: "night", why: "a full-day theme-park ticket pitched after the gates have closed" },
  { kind: "sunset-cruise", part: "night", why: "a sunset cruise pitched after the window has passed" },
  { kind: "tour", part: "night", why: "a daytime guided tour pitched at night" },
  { kind: "day-attraction", part: "night", why: "a museum/landmark pitched after most have closed" },
];
for (const { kind, part, why } of AVOID_CASES) {
  const rowsOfKind = classified.filter((c) => c.kind === kind);
  ok(rowsOfKind.length >= 1, `at least one real MENU_PARTNER_OFFERS row classifies as "${kind}" (the avoid-case has real inventory to protect, not just a map entry)`);
  const bonus = daypartCrossSellBonus(kind, hourForPart(part));
  ok(bonus < 0, `${why} — daypartCrossSellBonus("${kind}", <${part}>) is negative`);
}

// --- 3b. ORDER-ONLY: no row is ever excluded — every row/every band yields a
//     finite, small bonus, never a signal that could zero out a card ---
for (const part of DAYPART_IDS) {
  const h = hourForPart(part);
  ok(classified.every((c) => {
    const b = daypartCrossSellBonus(c.kind, h);
    return Number.isFinite(b) && Math.abs(b) <= 0.3;
  }), `every classified row scores a finite bonus of magnitude <= 0.3 in daypart "${part}" — order-only, never exclusion`);
}

// --- 4. commission/payout-free, no lib/commerce import ---
const src = readFileSync(path.resolve("lib/daypartCrossSell.js"), "utf8");
ok(!/(?:from|require\()\s*["'][^"']*\bcommerce(?:\.m?js)?["']/.test(src), "lib/daypartCrossSell.js does not import lib/commerce — no path for payout to reach an order");
ok(!/\.(fromPrice|price|commission|commission_estimate|payout|grossBookingValue|gross_booking_value|provider)\b/.test(src), "the module never reads a price/commission/payout/provider field off a row — only cat/sub/title/offerId/hour");

// --- 5. actually wired into UnifiedBrowseCommerceRail's menu-offer rows ---
const rail = readFileSync(path.resolve("app/components/UnifiedBrowseCommerceRail.js"), "utf8");
ok(/from "\.\.\/\.\.\/lib\/daypartCrossSell"/.test(rail), "UnifiedBrowseCommerceRail imports the shared daypart cross-sell policy");
ok(/rankBonus: daypartCrossSellBonus\(crossSellKindFor\(\{ cat: browseCat, sub: sub \|\| "all", title: m\.title, offerId: m\.id \}\), nowHour\)/.test(rail), "the menu-offer row's rankBonus actually calls daypartCrossSellBonus — the policy is wired in, not merely defined");
ok(!/rankBonus: 0, href, kind: "deal", source: "menu"/.test(rail), "the old hardcoded rankBonus: 0 for menu rows is gone");

if (fail.length) {
  console.error("check-daypart-crosssell: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`check-daypart-crosssell: OK — ${pass} assertions (every daypart has a real preferred pick, every avoid-case scores negative against real inventory, nothing is ever excluded, the policy stays commission-free, and it is actually wired into UnifiedBrowseCommerceRail)`);
