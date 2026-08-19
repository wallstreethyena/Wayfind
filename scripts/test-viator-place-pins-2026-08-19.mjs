#!/usr/bin/env node
// test-viator-place-pins-2026-08-19 — founder-verified Viator exact products
// land on EXISTING place cards (or, last resort, matching guide picks).
//
// WHY THIS EXISTS. The 2026-08-19 pin batch adds 30 hand-opened Viator
// product URLs. A green that only greps for "viator.com" would pass if the
// URLs sat in a comment, if a place card still sold Tiqets under the same
// name, or if a DROP / Crystal River / Winter Park SKU leaked in. Every
// assertion below CALLS the resolver or reads an exact destination string.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { resolveOffer } from "../lib/commerceProviders.js";
import { commerceHref } from "../lib/commerce.js";
import { viatorProductGoUrl } from "../lib/affiliates.js";
import { GUIDES } from "../lib/guides.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Founder-verified KEEP URLs, opened on Viator 2026-08-19. Exact strings.
const PINS = Object.freeze({
  "cocoa-beach-clear-kayak-bio": "https://www.viator.com/tours/Cocoa-Beach/Clear-Kayak-Bioluminescence-Tour/d25319-65756P6",
  "cocoa-beach-bio-kayak": "https://www.viator.com/tours/Cocoa-Beach/Dinoflagellate-Bioluminescence-Kayak-Tour/d25319-65756P5",
  "cocoa-beach-dolphin-boat": "https://www.viator.com/tours/Cocoa-Beach/Cocoa-Beach-Dolphin-Tours-on-the-Banana-River/d25319-353227P1",
  "weeki-wachee-clear-kayak": "https://www.viator.com/tours/Florida/Clear-Kayak-Tours-in-Weeki-Wachee/d276-288108P1",
  "weeki-wachee-manatee-kayak": "https://www.viator.com/tours/Florida/Weeki-Wachee-Clear-Kayak-Ecotours-Manatee-Season-November-15th-March-31st/d276-288108P4",
  "wild-florida-drive-thru-safari": "https://www.viator.com/tours/Orlando/Drive-Thru-Safari/d663-5467P2",
  "wild-florida-airboat-park": "https://www.viator.com/tours/Orlando/Florida-Everglades-Airboat-Tour-and-Alligator-Encounter-with-Optional-Lunch/d663-5467OHEP",
  "ybor-food-culture-walk": "https://www.viator.com/tours/Tampa/Historic-Ybor-City-Food-and-Culture-Walking-Tour/d666-5642110P1",
  "ybor-historic-walking-tour": "https://www.viator.com/tours/Tampa/Ybor-City-Historic-Walking-Tours/d666-5624P1",
  "tampa-downtown-tiki-boat": "https://www.viator.com/tours/Tampa/Tiki-Boat-Tampa-River-Cruise/d666-242020P4",
  "orlando-sealife-icon": "https://www.viator.com/tours/Orlando/SEA-LIFE-Orlando-Aquarium/d663-47668SEALIFE",
  "orlando-wonderworks": "https://www.viator.com/tours/Orlando/WonderWorks-Orlando/d663-3021WW",
  "orlando-crayola": "https://www.viator.com/tours/Orlando/Crayola-Experience-Orlando/d663-6932P2",
  "orlando-eye-icon": "https://www.viator.com/tours/Orlando/Orlando-Eye-Admission/d663-47668ORLEYE",
  "orlando-madame-tussauds": "https://www.viator.com/tours/Orlando/Madame-Tussauds-Orlando/d663-47668MADAME",
  "boggy-creek-one-hour-airboat": "https://www.viator.com/tours/Orlando/Boggy-Creek-Airboat-Adventures-One-Hour-Airboat-Tour-near-Orlando-Florida/d663-5039P5",
  "boggy-creek-sunset-airboat": "https://www.viator.com/tours/Orlando/Sunset-Airboat-Ride-by-Boggy-Creek-Airboat-Adventures-near-Orlando/d663-5039P2",
  "sarasota-mangrove-kayak": "https://www.viator.com/tours/Sarasota/Mangrove-Tunnel-Kayak-Tour/d25738-108117P1",
  "sarasota-mangrove-kayak-guided": "https://www.viator.com/tours/Sarasota/Sarasota-Mangrove-Tunnel-Guided-Kayak-Adventure/d25738-68831P1",
  "siesta-key-private-dolphin-charter": "https://www.viator.com/tours/Sarasota/2-Hour-Private-Charter-Dolphin-Tour-or-Sunset/d25738-5630429P4",
  "miami-biscayne-bay-boat": "https://www.viator.com/tours/Miami/Sightseeing-Cruise-of-Biscayne-Bay/d662-8836P1",
  "little-havana-food-walk": "https://www.viator.com/tours/Miami/Little-Havana-Food-and-Walking-Tour-in-Miami/d662-5304HAVANA",
  "key-west-reef-snorkel": "https://www.viator.com/tours/Key-West/Key-West-Snorkeling/d661-2642P8",
  "key-west-sunset-sail": "https://www.viator.com/tours/Key-West/Sunset-Cruise-Sail-Key-West/d661-103151P2",
  "ftl-guided-snorkel": "https://www.viator.com/tours/Fort-Lauderdale/Guided-Snorkel-Tour/d660-415671P1",
  "ftl-family-boat-swim": "https://www.viator.com/tours/Fort-Lauderdale/Family-Friendly-Boat-Cruise-and-Swim/d660-125185P4",
  "pcb-shell-island-snorkel": "https://www.viator.com/tours/Panama-City-Beach/Shell-Island-Snorkel-Dolphin-Catamaran-Cruise-in-Panama-City-Beach/d22828-64698P2",
  "naples-keewaydin-shelling": "https://www.viator.com/tours/Naples/Beach-Island-Shelling-Cruise-to-Keewaydin-Island/d22381-172638P3",
  "stpete-shell-key-dolphins": "https://www.viator.com/tours/St-Petersburg/Dolphin-Cruise-to-Shell-Key/d5403-30627P2",
  "clearwater-little-toot-dolphin": "https://www.viator.com/tours/Clearwater/Dolphin-Adventure-Tour/d22457-179637P1",
});
ok(Object.keys(PINS).length === 30, `the founder batch is 30 exact URLs (got ${Object.keys(PINS).length})`);

// ── 1. Every KEEP URL is an exact registry destination ──────────────────
for (const [id, url] of Object.entries(PINS)) {
  const row = PARTNER_OFFER_REGISTRY[id];
  ok(row && row.provider === "viator", `${id} is a viator registry row`);
  ok(row && row.destination === url, `${id} destination is the exact founder URL (got ${row && row.destination})`);
  ok(row && row.verifiedOn === "2026-08-19", `${id} is dated the verification day`);
}

// ── 2. Place-card hooks, asserted ON THE CALL ───────────────────────────
const PLACE_HOOKS = [
  ["Bioluminescence Tours - Cocoa Beach", "cocoa-beach-clear-kayak-bio"],
  ["Weeki Wachee Springs State Park", "weeki-wachee-clear-kayak"],
  ["Wild Florida Adventure Park", "wild-florida-drive-thru-safari"],
  ["Ybor City", "ybor-food-culture-walk"],
  ["Ybor City Museum State Park", "ybor-historic-walking-tour"],
  ["Ted Sperling Nature Park", "sarasota-mangrove-kayak"],
  ["Ted Sperling Park", "sarasota-mangrove-kayak"],
  ["Ted Sperling Park Nature Trail", "sarasota-mangrove-kayak"],
  ["Little Havana", "little-havana-food-walk"],
  ["Key West Historic Seaport", "key-west-reef-snorkel"],
  ["Shell Island Panama City Beach", "pcb-shell-island-snorkel"],
  ["Keewaydin Island", "naples-keewaydin-shelling"],
  ["Shell Key Preserve", "stpete-shell-key-dolphins"],
];
ok(PLACE_HOOKS.length >= 11, `place-card hooks are non-empty (got ${PLACE_HOOKS.length})`);
for (const [name, offerId] of PLACE_HOOKS) {
  const hit = placePartnerPick({ name });
  ok(hit && hit.provider === "viator" && hit.offerId === offerId,
    `"${name}" resolves to ${offerId} (got ${hit && hit.provider}:${hit && hit.offerId})`);
  const href = commerceHref({ provider: "viator", offerId, surface: "iconic_place_card", contentId: name });
  ok(typeof href === "string" && href.startsWith("/api/commerce/go?"),
    `"${name}" CTA is /api/commerce/go, not a bare partner host (got ${href})`);
  ok(!/viator\.com/i.test(href || ""), `"${name}" href never carries viator.com`);
  const q = new URLSearchParams(String(href).split("?")[1] || "");
  ok(q.get("provider") === "viator" && q.get("offer") === offerId,
    `"${name}" commerce href names this offer`);
}

// ── 3. Registry-backed resolve works WITHOUT Supabase ───────────────────
{
  const sample = "cocoa-beach-clear-kayak-bio";
  const resolved = await resolveOffer("viator", sample, { env: () => null });
  ok(!resolved.error && String(resolved.dest || "").includes("d25319-65756P6"),
    `registry viator resolve does not need wf_experiences (got ${resolved.error || resolved.dest})`);
  ok(/^https:\/\/www\.viator\.com\/tours\//.test(resolved.dest || ""),
    `resolved dest stays on viator.com/tours`);
  const tableMiss = await resolveOffer("viator", "412732P1", { env: () => null });
  ok(tableMiss.error === "no-supabase-env" && !tableMiss.dest,
    "a wf_experiences product_code still fails closed without catalogue credentials");
}

// ── 4. Shipped Tiqets hooks are not silently displaced ──────────────────
const TIQETS_KEEP = [
  "SEA LIFE Orlando Aquarium",
  "WonderWorks Orlando",
  "Crayola Experience Orlando",
  "The Orlando Eye",
  "Madame Tussauds Orlando",
  "Boggy Creek Airboat Adventures",
  "Wild Florida",
  "Wild Florida Airboats",
  "ICON Park",
  "Gatorland",
];
for (const name of TIQETS_KEEP) {
  const hit = placePartnerPick({ name });
  ok(hit && hit.provider === "tiqets",
    `"${name}" keeps its shipped Tiqets hook (got ${hit && hit.provider}:${hit && hit.offerId})`);
}

// ── 5. Beaches / drum-circle / wrong-intent cards stay editorial-only ───
for (const name of ["Siesta Beach", "Fort Lauderdale Beach", "Lido Beach", "Pier 60", "Tampa Riverwalk", "Mallory Square"]) {
  ok(placePartnerPick({ name }) === null, `"${name}" stays editorial-only — no paid-tour pin`);
}

// ── 6. DROP / locked / invented SKUs are absent ─────────────────────────
const scanned = [
  "lib/partnerOfferRegistry.js",
  "lib/placePartnerPicks.js",
  "lib/guides.js",
  "lib/guidesSummer2026.js",
].map((rel) => readFileSync(REPO + "/" + rel, "utf8")).join("\n");
ok(/d25319-65756P6/.test(scanned), "positive control: a KEEP SKU is findable in the same scan");
for (const drop of ["d50024-236862P2", "d25738-136885P3", "d50045-292464P3", "d662-100786P3"]) {
  ok(!scanned.includes(drop), `DROP SKU ${drop} is not pinned`);
}
ok(!/Crystal River.*viatorUrl|viatorUrl.*Crystal River/i.test(scanned),
  "Crystal River copy does not grow a viatorUrl in this batch's files");
ok(!((GUIDES["swim-with-manatees-crystal-river"] || {}).picks || []).some((p) => p && p.viatorUrl),
  "Crystal River manatee guide stays search-handoff (no product pin)");
ok(!((GUIDES["winter-park-scenic-boat-tour"] || {}).picks || []).some((p) => p && p.viatorUrl),
  "Winter Park scenic boat stays unpinned");
ok(!/paddleboard/i.test(Object.values(PINS).join("\n")),
  "none of the 30 KEEP URLs is a paddleboard product");

// ── 7. Client place-pick file still has no raw partner URL ──────────────
{
  const src = readFileSync(REPO + "/lib/placePartnerPicks.js", "utf8");
  ok(!/https:\/\//.test(src), "placePartnerPicks.js stays client-safe (no https://)");
  const card = readFileSync(REPO + "/app/components/IconicPlaceCard.js", "utf8");
  ok(/🎟️ Tickets · \{partner\.merchant\} ↗/.test(card)
    && /Wayfind may earn a commission; rankings never change\./.test(card)
    && /rel="sponsored noopener"/.test(card),
    "IconicPlaceCard still uses the existing disclosure + sponsored rel");
}

// ── 8. Gatorland d663-3458ENTRY still wraps; is not one of the 30 ───────
{
  const gator = ((GUIDES["gatorland-vs-wild-florida"] || {}).picks || [])[0];
  ok(gator && gator.viatorUrl === "https://www.viator.com/tours/Orlando/Gatorland-General-Admission-Ticket/d663-3458ENTRY",
    "Gatorland landing product stays d663-3458ENTRY");
  const go = viatorProductGoUrl(gator.viatorUrl, "Orlando", "guide", "guide");
  ok(typeof go === "string" && go.startsWith("/api/viator/go?"),
    "Gatorland wraps through /api/viator/go");
  ok(!Object.values(PINS).includes(gator.viatorUrl),
    "Gatorland is not counted as one of the 30 new pins");
}

// ── 9. Last-resort guide leftovers that could not land on a place card ──
function guideHasProduct(slug, productUrl) {
  return ((GUIDES[slug] || {}).picks || []).some((p) => p && p.viatorUrl === productUrl);
}
ok(guideHasProduct("bioluminescence-kayak-tour-space-coast", PINS["cocoa-beach-bio-kayak"]),
  "SKU 2 (second Cocoa Beach bio kayak) is a leftover on the bioluminescence guide");
ok(guideHasProduct("gatorland-vs-wild-florida", PINS["wild-florida-airboat-park"]),
  "SKU 7 (Wild Florida airboat) is a leftover on the Wild Florida guide pick");
ok(guideHasProduct("tampa-riverwalk-guide", PINS["tampa-downtown-tiki-boat"]),
  "SKU 10 (Tampa tiki boat) is a leftover on the Riverwalk guide");
ok(guideHasProduct("orlando-in-the-rain", PINS["orlando-sealife-icon"]),
  "SKU 11 (SEA LIFE) is a leftover on the rain guide — place card keeps Tiqets");
ok(guideHasProduct("orlando-in-the-rain", PINS["orlando-wonderworks"]),
  "SKU 12 (WonderWorks) is a leftover on the rain guide");
ok(guideHasProduct("orlando-in-the-rain", PINS["orlando-crayola"]),
  "SKU 13 (Crayola) is a leftover on the rain guide");
ok(guideHasProduct("things-to-do-orlando-not-theme-parks", PINS["orlando-eye-icon"]),
  "SKU 14 (Orlando Eye) is a leftover on the non-parks guide");
ok(guideHasProduct("orlando-in-the-rain", PINS["orlando-madame-tussauds"]),
  "SKU 15 (Madame Tussauds) is a leftover on the rain guide");
ok(guideHasProduct("things-to-do-orlando-not-theme-parks", PINS["boggy-creek-one-hour-airboat"]),
  "SKU 16 (Boggy Creek 1-hour) is a leftover on the non-parks guide");
ok(guideHasProduct("things-to-do-sarasota", PINS["sarasota-mangrove-kayak-guided"]),
  "SKU 19 (second mangrove SKU) is a leftover on the Sarasota guide");
ok(guideHasProduct("things-to-do-fort-lauderdale-summer-2026", PINS["ftl-guided-snorkel"]),
  "SKU 25 (FTL snorkel) is a leftover on the FTL summer guide");
ok(guideHasProduct("things-to-do-fort-lauderdale-summer-2026", PINS["ftl-family-boat-swim"]),
  "SKU 26 (FTL family boat) is a leftover on the FTL water-taxi pick");

if (fail.length) {
  console.error("test-viator-place-pins-2026-08-19: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `test-viator-place-pins-2026-08-19: OK — ${pass} assertions; ` +
  `30 exact registry URLs; ${PLACE_HOOKS.length} place-card hook calls; ` +
  `Tiqets hooks preserved; DROPs/Crystal River/Winter Park absent`
);
