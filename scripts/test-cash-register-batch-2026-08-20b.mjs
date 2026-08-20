#!/usr/bin/env node
// scripts/test-cash-register-batch-2026-08-20b.mjs
//
// Locks cash-register factory batch 2. Three honest in-season Florida hops
// onto EXISTING cards. Live product H1/title named the place (not a nearby
// ramp, not searchResults, not another country, not another product).
//
//   The Bay Park            386845P1  dest 25738  H1: Kayak Paddling Experience at The Bay Park
//   Tampa Riverwalk         236733P1  dest 666    H1: 2 Person Mini Power Boat Rental at Tampa Riverwalk
//   Blue Spring State Park  431125P5  dest 25790  H1: St. Johns River Cruise - Blue Spring State Park
//   Little Toot Dolphin Adventure  179637P1  dest 22457  H1: Little Toot Dolphin Adventure at Clearwater Beach
//
// ASSERT ON THE CALL, not a substring. Rank is untouched. Shell Key stays
// 173028P1. Scallop HOLD-SKU 236862P2 never pins.

import { readFileSync } from "node:fs";
import { commerceHref } from "../lib/commerce.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { SUMMER_UNIVERSE } from "../lib/summerUniverse.js";
import { editorialFor } from "../lib/editorial.js";
import { pageNamesPlace } from "./place-register-factory.mjs";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const HOLD_SKU = "236862P2";
const SHELL_SKU = "173028P1";
const EGMONT_SKU = "237533P5";
const FORT_SKU = "324135P3";

const BATCH = [
  {
    name: "The Bay Park",
    sku: "386845P1",
    destId: "25738",
    h1: "Kayak Paddling Experience at The Bay Park",
  },
  {
    name: "Tampa Riverwalk",
    sku: "236733P1",
    destId: "666",
    h1: "2 Person Mini Power Boat Rental at Tampa Riverwalk",
  },
  {
    name: "Blue Spring State Park",
    sku: "431125P5",
    destId: "25790",
    h1: "St. Johns River Cruise - Blue Spring State Park",
    rankKey: "blue_spring_swim",
    rank: 10,
  },
  {
    name: "Little Toot Dolphin Adventure",
    sku: "179637P1",
    destId: "22457",
    h1: "Little Toot Dolphin Adventure at Clearwater Beach",
  },
];

ok(BATCH.length === 4, `batch 2 table is the verified hops (got ${BATCH.length}) — an empty table makes every assertion below vacuous`);

ok(placePartnerPick({ name: "Shell Key Preserve" })?.offerId === SHELL_SKU,
  "Shell Key keeps 173028P1 — this batch did not steal the founder pin");
ok(placePartnerPick({ name: "Egmont Key State Park" })?.offerId === EGMONT_SKU,
  "Egmont Key keeps 237533P5");
ok(placePartnerPick({ name: "Fort De Soto Park" })?.offerId === FORT_SKU,
  "Fort De Soto keeps the owner-verified e-bike SKU");
ok(placePartnerPick({ name: "Bayfront Park" }) === null,
  "Bayfront Park stays empty — The Bay Park kayak H1 names The Bay Park only");
ok(placePartnerPick({ name: "The Tampa Riverwalk" }) === null,
  "The Tampa Riverwalk does not inherit the Tampa Riverwalk mini-boat — exact name only");
ok(placePartnerPick({ name: "Blue Spring" }) === null,
  "bare Blue Spring does not inherit the state-park cruise");
ok(placePartnerPick({ name: "Kelly Park - Rock Springs" }) === null,
  "Kelly Park stays empty — Kings Landing kayak is not this park");
ok(placePartnerPick({ name: "Venice Beach" }) === null,
  "Venice Beach stays empty — canal kayak meets at South Venice Beach Ferry");
ok(placePartnerPick({ name: "Weedon Island Preserve" }) === null,
  "Weedon Island stays empty — St Pete mangrove kayak H1 does not name the preserve");
ok(!BATCH.some((r) => r.sku === HOLD_SKU),
  "batch 2 excludes the scallop HOLD-SKU");
ok(editorialFor("Little Toot Dolphin Adventure")?.name === "Little Toot Dolphin Adventure",
  "Little Toot is an existing editorial card — we did not invent a place");
ok(placePartnerPick({ name: "Clearwater Beach" }) === null,
  "Clearwater Beach stays empty — Little Toot is the named operator boat, not a beach pin");
ok(placePartnerPick({ name: "Anna Maria Island Dolphin Tours" })?.offerId === "203023P2",
  "AMI Dolphin Tours keeps sunset 203023P2 — no second SKU");
ok(placePartnerPick({ name: "Anna Maria Island Dolphin Tours" })?.offerId !== "203023P1",
  "203023P1 is not pinned on AMI Dolphin Tours");
ok(placePartnerPick({ name: "Oscar Scherer State Park" }) === null,
  "Oscar Scherer stays empty — 5666112P3 is not pinned");
ok(placePartnerPick({ name: "TreeUmph! Adventure Course" })?.offerId === "22211P1",
  "TreeUmph stays 22211P1 — live page still names the Bradenton course");
ok(placePartnerPick({ name: "TreeUmph Adventure Course" })?.offerId === "22211P1",
  "TreeUmph alias without bang still resolves to 22211P1");

for (const row of BATCH) {
  ok(pageNamesPlace(row.h1, row.name) === "place",
    `live H1 still names ${row.name} (got ${pageNamesPlace(row.h1, row.name)})`);
  ok(pageNamesPlace("Sunset cruise somewhere else", row.name) === false,
    `a title that does not name ${row.name} is rejected — the H1 probe can fail`);

  const pick = placePartnerPick({ name: row.name });
  ok(!!pick, `placePartnerPick({ name: "${row.name}" }) returns a pin`);
  ok(pick && pick.provider === "viator", `${row.name} is the viator provider (got ${pick && pick.provider})`);
  ok(pick && pick.offerId === row.sku, `${row.name} offerId is ${row.sku} (got ${pick && pick.offerId})`);
  ok(pick && pick.merchant === "Viator", `${row.name} disclosure merchant stays Viator`);
  ok(placePartnerPick({ name: row.name.toLowerCase() })?.offerId === row.sku,
    `${row.name} match is case-insensitive on the exact card name`);
  ok(placePartnerPick({ name: `${row.name} Extra` }) === null,
    `a superstring of "${row.name}" does not inherit the ticket`);

  const href = commerceHref({
    provider: pick && pick.provider,
    offerId: pick && pick.offerId,
    surface: "iconic_place_card",
    contentId: `guard-${row.sku}`,
  });
  ok(!!href, `${row.name}: commerceHref produced a hop`);
  ok(String(href).startsWith("/api/commerce/go?"),
    `${row.name}: Book is our redirect (got ${String(href).slice(0, 80)})`);
  {
    const q = new URLSearchParams(String(href).split("?")[1] || "");
    ok(q.get("provider") === "viator", `${row.name}: hop names provider=viator`);
    ok(q.get("offer") === row.sku, `${row.name}: hop carries offer=${row.sku}, not a reminted id`);
    ok(q.get("surface") === "iconic_place_card", `${row.name}: hop is attributed to the place-card surface`);
    ok(!q.has("click_id"), `${row.name}: static href does not mint a click_id`);
    ok(!q.has("product"), `${row.name}: hop is an offer-id lookup, not a request-supplied product URL`);
  }
  ok(!/viator\.com|searchResults/i.test(String(href)),
    `${row.name}: rendered href contains neither viator.com nor searchResults`);

  ok(!PARTNER_OFFER_REGISTRY[row.sku],
    `${row.sku} must not shadow the table lookup with a registry row`);
  ok(partnerOfferById(row.sku, "viator") === null,
    `${row.sku}: partnerOfferById refuses — dest comes from the catalogue`);
}

ok(pageNamesPlace("Kayak Paddling Experience at The Bay Park", "Bayfront Park") === false,
  "The Bay Park H1 does not name Bayfront Park — the near-miss probe can fail");
ok(pageNamesPlace("Little Toot Dolphin Adventure at Clearwater Beach", "Clearwater Beach") === "place-tokens"
  || pageNamesPlace("Little Toot Dolphin Adventure at Clearwater Beach", "Clearwater Beach") === "place",
  "positive control: the Little Toot H1 does mention Clearwater Beach as a location token");
ok(placePartnerPick({ name: "Clearwater Beach" }) === null,
  "naming Clearwater Beach in the H1 does not attach the operator SKU to a beach card");
ok(pageNamesPlace("2 Person Mini Power Boat Rental at Tampa Riverwalk", "Bayshore Boulevard") === false,
  "Riverwalk mini-boat H1 does not name Bayshore Boulevard");

ok(PROVIDERS.viator.table === "wf_experiences" && PROVIDERS.viator.idColumn === "product_code",
  "viator stays table-backed (wf_experiences.product_code)");
ok(typeof PROVIDERS.viator.resolve !== "function",
  "viator has no registry resolve that would need a pasted product URL");

for (const row of BATCH) {
  const canonical = `https://www.viator.com/tours/Wayfind-Guard/d${row.destId}-${row.sku}`;
  let lookedUp = "";
  const resolved = await resolveOffer("viator", row.sku, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "guard-key" }),
    fetch: async (u) => {
      lookedUp = String(u);
      return {
        ok: true,
        json: async () => [{ product_code: row.sku, product_url: canonical }],
      };
    },
  });
  ok(lookedUp.includes(row.sku) && lookedUp.includes("wf_experiences"),
    `resolveOffer looks up ${row.sku} on wf_experiences`);
  ok(!resolved.error && typeof resolved.dest === "string",
    `resolveOffer("viator", "${row.sku}") returns a dest (got ${resolved.error || "dest"})`);
  ok(resolved.dest && resolved.dest.includes(`${row.destId}-${row.sku}`),
    `${row.name}: resolved dest is this exact product`);
  ok(resolved.dest && !/searchResults/i.test(resolved.dest),
    `${row.name}: resolved dest is never searchResults`);
  ok(resolved.dest && !resolved.dest.includes(HOLD_SKU),
    `${row.name}: resolved dest is not the scallop HOLD-SKU`);
}

const hold = await resolveOffer("viator", HOLD_SKU, { env: () => null });
ok(hold.error === "no-supabase-env" && !hold.dest,
  `the scallop HOLD-SKU ${HOLD_SKU} is not pinned and fails closed without a catalogue`);

for (const row of BATCH) {
  if (!row.rankKey) continue;
  const entry = SUMMER_UNIVERSE.find((e) => e.key === row.rankKey);
  ok(!!entry, `${row.rankKey} remains an existing summer entry — we did not invent a place`);
  ok(entry && entry.rank === row.rank,
    `${row.rankKey} rank is still ${row.rank} (got ${entry && entry.rank}) — the pin did not buy a better rank`);
  ok(entry && entry.venue && entry.venue.name === row.name,
    `${row.rankKey} venue name is still "${row.name}"`);
}

const shell = SUMMER_UNIVERSE.find((e) => e.key === "shell_key");
ok(shell && shell.rank === 28, `Shell Key summer rank is still 28 (got ${shell && shell.rank})`);

function stripComments(src) {
  return String(src || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const placeSrc = stripComments(readFileSync(new URL("../lib/placePartnerPicks.js", import.meta.url), "utf8"));
ok(!/https:\/\/www\.viator\.com/i.test(placeSrc),
  "lib/placePartnerPicks.js has no raw viator.com URL — cards store the opaque offer id");
ok(/\b386845P1\b/.test(placeSrc) && /\b236733P1\b/.test(placeSrc) && /\b431125P5\b/.test(placeSrc) && /\b179637P1\b/.test(placeSrc),
  "positive control: batch 2 product codes are declared as placePick offer ids");
ok(/\b173028P1\b/.test(placeSrc) && /\b22211P1\b/.test(placeSrc),
  "positive control: Shell Key and TreeUmph product codes are still declared");
ok(!/\b203023P1\b/.test(placeSrc),
  "203023P1 is absent — AMI keeps the sunset SKU only");
ok(!/\b5666112P3\b/.test(placeSrc),
  "5666112P3 is absent — Oscar Scherer stays empty");
ok(!/\b292464P2\b/.test(placeSrc) && !/\b5560271P1\b/.test(placeSrc),
  "Mote night kayak and the other forbidden SKU are not place-pinned");
ok(!new RegExp(`\\b${HOLD_SKU}\\b`).test(placeSrc),
  "the scallop HOLD-SKU is absent from placePartnerPicks");

const cardSrc = stripComments(readFileSync(new URL("../app/components/IconicPlaceCard.js", import.meta.url), "utf8"));
ok(/commerceHref\(\{\s*provider:\s*partner\.provider/.test(cardSrc),
  "IconicPlaceCard builds the ticket href through commerceHref");
ok(!/https:\/\/www\.viator\.com/i.test(cardSrc),
  "IconicPlaceCard has no raw viator.com href");

ok(placePartnerPick({ name: "A Venue That Does Not Exist" }) === null,
  "an unlisted name is still null — the batch did not loosen exact-name matching");

if (fail.length) {
  console.error("test-cash-register-batch-2026-08-20b: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-cash-register-batch-2026-08-20b: OK — ${pass} assertions (${BATCH.length} picks CALLED through placePartnerPick + commerceHref + resolveOffer; live H1 names the place; no raw viator.com; no searchResults; no ${HOLD_SKU}; ranks unchanged)`);
