#!/usr/bin/env node
// scripts/test-cash-register-factory.mjs
//
// Locks the cash-register factory: inventory existing cards, never invent a
// place, never treat Shell Key as unmatched, and reject dishonest product
// URLs WITHOUT a network call. ASSERT ON THE CALL.

import {
  inventoryAttachable,
  leftoverMarkdown,
  pageNamesPlace,
  parseProductUrl,
  verifyViatorProduct,
} from "./place-register-factory.mjs";
import { RETIRED_VIATOR_PINS, placePartnerPick } from "../lib/placePartnerPicks.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const inv = inventoryAttachable();
ok(inv.pickRows >= 139, `factory sees the existing pick table (got ${inv.pickRows} rows)`);
ok(inv.hooked.length >= 20, `factory found hooked attachable names (got ${inv.hooked.length})`);
ok(inv.unmatched.length > 0, `leftover inventory is non-empty (got ${inv.unmatched.length}) — an empty leftover would make the absence checks below vacuous`);

const shellHooked = inv.hooked.find((r) => r.name === "Shell Key Preserve");
ok(!!shellHooked, "Shell Key Preserve is in the hooked set — the factory can see an existing pin");
ok(shellHooked && shellHooked.offerId === "173028P1",
  `Shell Key stays 173028P1 in inventory (got ${shellHooked && shellHooked.offerId})`);
ok(!inv.unmatched.some((r) => r.name === "Shell Key Preserve"),
  "Shell Key Preserve is not listed as unmatched — the factory does not ask for a duplicate pin");
// ── 2026-09-10: A RETIRED PIN GOES BACK ON THE WORKLIST ──────────────────
// This block used to assert that nine named cards were hooked and therefore NOT
// leftover. Five of those nine were pinned to products the 2026-09-09 audit
// proved absent from wf_experiences, so "hooked" meant "carries a Book button
// that 302s the customer home" — the opposite of what this assertion was for.
//
// The factory's own contract makes the correction obvious: hooked means "has a
// pin", unmatched means "needs one". A retired product SHOULD move to
// unmatched, because that is the replacement worklist. So the retired names are
// asserted into the leftover table rather than out of it, which is a stronger
// claim than the original: it proves the containment fed the repair queue
// instead of quietly dropping the place.
const RETIRED_NAMES = new Set(RETIRED_VIATOR_PINS.flatMap((r) => r.names));
const STILL_HOOKED = [
  "Fort De Soto Park",
  "Pier 60",
  "Turtle Beach",
  "Silver Springs State Park Glass Bottom Boat Tours",
];
const NOW_LEFTOVER = [
  "Weeki Wachee Springs State Park",
  "The Bay Park",
  "Tampa Riverwalk",
  "Blue Spring State Park",
  "Keys Huka Dive",
];
for (const name of STILL_HOOKED) {
  ok(!RETIRED_NAMES.has(name),
    `${name} is not on the retired ledger — this list and RETIRED_VIATOR_PINS must not both claim it`);
  ok(inv.hooked.some((r) => r.name === name),
    `${name} is hooked — an existing card, not an invented one`);
  ok(!inv.unmatched.some((r) => r.name === name),
    `${name} is not leftover after the owner-verified pin`);
}
for (const name of NOW_LEFTOVER) {
  ok(RETIRED_NAMES.has(name),
    `${name} is on the retired ledger — this list is derived from a real retirement, not hand-maintained drift`);
  ok(!inv.hooked.some((r) => r.name === name),
    `${name} is NOT hooked — its product left the catalogue, so it must not read as monetized`);
  ok(inv.unmatched.some((r) => r.name === name),
    `${name} is back in leftover — a retired pin becomes replacement work, not a silently dropped card`);
}
ok(STILL_HOOKED.length >= 4,
  `the hooked branch still covers real cards (got ${STILL_HOOKED.length}) — at zero this block would prove nothing`);
ok(!inv.hooked.some((r) => r.name === "Clearwater Beach"),
  "Clearwater Beach is not hooked — no exact Atlas/summer/curated card, do not invent one");
ok(!inv.hooked.some((r) => r.name === "TreeUmph! Adventure Course"),
  "TreeUmph is not hooked — dead SKU 22211P1 was unpinned");
ok(inv.unmatched.some((r) => r.name === "TreeUmph! Adventure Course"),
  "TreeUmph remains in leftover until a live product names it");

ok(placePartnerPick({ name: "Shell Key Preserve" })?.offerId === "173028P1",
  "positive control: placePartnerPick still returns the founder Shell Key pin");

const parsed = parseProductUrl("https://www.viator.com/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1");
ok(parsed && parsed.productCode === "173028P1" && parsed.destId === "5403",
  `parseProductUrl extracts destId + product code (got ${JSON.stringify(parsed)})`);
ok(parseProductUrl("https://www.viator.com/searchResults/tid.asp") === null,
  "parseProductUrl refuses a searchResults path that is not a product");
ok(parseProductUrl("https://www.viator.com/Tampa/d666") === null,
  "parseProductUrl refuses a destination listing page");

ok(pageNamesPlace("Clear Kayak Tour of Shell Key Preserve and Tampa Bay Area", "Shell Key Preserve") === "place",
  "pageNamesPlace hits when the live title contains the exact place name");
ok(pageNamesPlace("Kayak Adventure at Caladesi Island", "Caladesi Island State Park") === "place-tokens",
  "pageNamesPlace accepts a title that names the island tokens of the park card");
ok(pageNamesPlace("Sunset cruise somewhere else", "Shell Key Preserve") === false,
  "pageNamesPlace is false when the page names neither the place nor enough tokens");

const searchReject = await verifyViatorProduct(
  "https://www.viator.com/searchResults/foo/d5403-173028P1",
  "Shell Key Preserve",
);
ok(searchReject.ok === false && searchReject.reason === "start-url-is-searchResults",
  `verifyViatorProduct rejects searchResults without fetching (got ${searchReject.reason})`);

const holdReject = await verifyViatorProduct(
  "https://www.viator.com/tours/Homosassa/Scallop/d50024-236862P2",
  "Homosassa Springs Marina",
);
ok(holdReject.ok === false && holdReject.reason === "scallop-HOLD-SKU",
  `verifyViatorProduct rejects the scallop HOLD-SKU without fetching (got ${holdReject.reason})`);

const notProduct = await verifyViatorProduct("https://www.viator.com/Tampa/d666", "Tampa");
ok(notProduct.ok === false && notProduct.reason === "url-is-not-a-product-path",
  `verifyViatorProduct rejects a non-product path without fetching (got ${notProduct.reason})`);

const leftover = leftoverMarkdown(inv);
ok(leftover.includes("Shell Key Preserve") === false,
  "leftover markdown does not list Shell Key — a leftover that still asked for this pin would duplicate #858");
// These four asked the leftover table to be EMPTY of names whose pins have
// since been retired. Inverted for the same reason as the block above: the
// leftover markdown is the human worklist the factory prints, and a place whose
// product died is precisely what belongs on it. Re-pointed rather than deleted,
// so the file still asserts that the worklist and the pin table agree — only
// now it agrees with the truth.
for (const name of NOW_LEFTOVER) {
  ok(new RegExp(`\\| ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\|`).test(leftover),
    `leftover markdown asks for a replacement product for ${name} — a retired pin must surface as work, not vanish`);
}
ok(NOW_LEFTOVER.every((n) => !/Shell Key/.test(n)),
  "positive control: the leftover expectations above are about retired cards only, never the live founder pin");
ok(/\| Kelly Park - Rock Springs \|/.test(leftover),
  "positive control: leftover still records Kelly Park as unmatched (Kings Landing kayak refused)");
ok(/\| TreeUmph! Adventure Course \|/.test(leftover),
  "leftover records TreeUmph as unmatched — empty-slot, not a similar-SKU replacement");
ok(/22211P1/.test(leftover) && /unavailable/.test(leftover),
  "leftover notable skip names the dead SKU so nobody re-pins it from the similar-experiences rail");
ok(leftover.includes("# Place-register leftover"),
  "positive control: leftover markdown has its heading, so the Shell Key absence above is not an empty string");
ok(leftover.includes("## Notable skips this batch"),
  "leftover records notable skips at the top, not only a raw name dump");

if (fail.length) {
  console.error("test-cash-register-factory: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-cash-register-factory: OK — ${pass} assertions (inventory CALLED; Shell Key hooked not leftover; parseProductUrl / pageNamesPlace / verifyViatorProduct reject searchResults + 236862P2 without network)`);
