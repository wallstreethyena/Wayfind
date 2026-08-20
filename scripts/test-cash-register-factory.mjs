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
import { placePartnerPick } from "../lib/placePartnerPicks.js";

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
for (const name of [
  "Fort De Soto Park",
  "Pier 60",
  "Turtle Beach",
  "Weeki Wachee Springs State Park",
  "Silver Springs State Park Glass Bottom Boat Tours",
]) {
  ok(inv.hooked.some((r) => r.name === name),
    `${name} is hooked — an existing card, not an invented one`);
  ok(!inv.unmatched.some((r) => r.name === name),
    `${name} is not leftover after the owner-verified pin`);
}
ok(!inv.hooked.some((r) => r.name === "Clearwater Beach"),
  "Clearwater Beach is not hooked — no exact Atlas/summer/curated card, do not invent one");

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
