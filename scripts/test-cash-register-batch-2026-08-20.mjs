#!/usr/bin/env node
// scripts/test-cash-register-batch-2026-08-20.mjs
//
// Locks cash-register factory batch 1. Every new Book hop is placePick →
// commerceHref → /api/commerce/go. Never a raw viator.com URL, never
// searchResults, never a reminted click_id, never a rank change.
// ASSERT ON THE CALL, not a substring.

import { readFileSync } from "node:fs";
import { commerceHref } from "../lib/commerce.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { PLACE_PARTNER_PICKS, RETIRED_VIATOR_PINS, pinServeability, placePartnerPick } from "../lib/placePartnerPicks.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { SUMMER_UNIVERSE } from "../lib/summerUniverse.js";
import { BIRTHDAY_UNIVERSE } from "../lib/birthdayUniverse.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const HOLD_SKU = "236862P2";
const SHELL_SKU = "173028P1";
const EGMONT_SKU = "237533P5";
const FORT_SKU = "324135P3";

const BATCH = [
  { name: "Fort De Soto Park", sku: FORT_SKU, destId: "5403", rankKey: "fort_desoto", rank: 26, universe: "summer" },
  { name: "Tarpon Springs Sponge Docks", sku: "350236P1", destId: "22457", rankKey: "tarpon_sponge_docks", rank: 51, universe: "summer" },
  { name: "Lido Beach", sku: "20572P1", destId: "25738", rankKey: "lido_beach", rank: 60, universe: "summer" },
  { name: "Turtle Beach", sku: "87414P4", destId: "25738" },
  { name: "Siesta Beach", sku: "136885P1", destId: "25738", rankKey: "siesta_drum_circle", rank: 34, universe: "summer" },
  { name: "Myakka River State Park", sku: "136885P3", destId: "25738", rankKey: "myakka_morning", rank: 35, universe: "summer" },
  { name: "Anna Maria Island Dolphin Tours", sku: "203023P2", destId: "25738", rankKey: "ami_dolphin_sunset", rank: 32, universe: "summer" },
  { name: "Coquina Beach", sku: "454941P3", destId: "25738", rankKey: "ami_coquina", rank: 61, universe: "summer" },
  { name: "Pier 60", sku: "298601P1", destId: "22457", rankKey: "pier_60", rank: 65, universe: "summer" },
  { name: "Caladesi Island State Park", sku: "308814P5", destId: "22457", rankKey: "caladesi_island", rank: 29, universe: "summer" },
  { name: "Honeymoon Island State Park", sku: "11779P1", destId: "22457", rankKey: "honeymoon_island", rank: 30, universe: "summer" },
  { name: "Weeki Wachee Springs State Park", sku: "288108P1", destId: "276", rankKey: "weeki_wachee", rank: 5, universe: "summer" },
  { name: "Rainbow Springs State Park", sku: "343215P2", destId: "663", rankKey: "rainbow_springs", rank: 7, universe: "summer" },
  { name: "Silver Springs State Park Glass Bottom Boat Tours", sku: "290298P1", destId: "663", rankKey: "silver_springs_boats", rank: 11, universe: "summer" },
  { name: "Bioluminescence Tours - Cocoa Beach", sku: "65756P5", destId: "25319", rankKey: "bio_kayak_cocoa", rank: 1, universe: "summer" },
  { name: "Everglades City Airboat Tours", sku: "431125P10", destId: "22381", rankKey: "everglades_airboat", rank: 54, universe: "summer" },
  { name: "John Pennekamp Coral Reef State Park", sku: "101001P1", destId: "23475", rankKey: "pennekamp_snorkel", rank: 52, universe: "summer" },
  { name: "Dry Tortugas National Park", sku: "17325KEYYAN", destId: "661", rankKey: "dry_tortugas", rank: 53, universe: "summer" },
  { name: "Three Sisters Springs", sku: "184792P17", destId: "22318", rankKey: "three_sisters", rank: 8, universe: "summer" },
  { name: "Wild Florida Adventure Park", sku: "5467P2", destId: "663", rankKey: "wild_florida_airboat", rank: 40, universe: "summer" },
  { name: "St. Pete Pier", sku: "350214P1", destId: "5403", rankKey: "stpete_pier", rank: 21, universe: "birthday" },
  { name: "Robbie's of Islamorada", sku: "17984P2", destId: "23474", rankKey: "robbies_islamorada", rank: 79, universe: "summer" },
  { name: "Ted Sperling Park Nature Trail", sku: "68831P1", destId: "25738" },
  { name: "BK Adventure", sku: "26315P9", destId: "25319", rankKey: "bk_adventure_bio", rank: 4, universe: "summer" },
  { name: "Wekiwa Springs State Park", sku: "105290P10", destId: "663", rankKey: "wekiwa_springs", rank: 12, universe: "summer" },
];

ok(BATCH.length >= 17, `batch table is populated (got ${BATCH.length}) — an empty table makes every assertion below vacuous`);

// ── 2026-09-10: HALF THIS BATCH DIED IN THE CATALOGUE ────────────────────
// The 2026-09-09 affiliate audit read wf_experiences and found no row for 16 of
// the 35 pinned Viator codes; 11 of them are in the table above. Until today
// this file asserted that each one STILL returned a pin and STILL built a Book
// hop — which was true, and was the bug: the button rendered, the click hit
// resolveOffer, the catalogue had nothing, and the customer landed back on the
// Wayfind homepage. Production had already logged exactly that for 288108P1.
//
// So the batch splits. A live row keeps every original assertion unchanged. A
// retired row gets the CONTAINMENT assertions in their place — no pin, no href,
// a recorded reason, and a redirect that fails closed on an empty catalogue.
// Nothing is deleted; the question each row is asked now matches what is true
// about it. The split is derived from RETIRED_VIATOR_PINS so retiring another
// pin moves that row across automatically.
const RETIRED = new Set(RETIRED_VIATOR_PINS.map((r) => String(r.offerId).toUpperCase()));
for (const row of BATCH) row.retired = RETIRED.has(String(row.sku).toUpperCase());
const LIVE_BATCH = BATCH.filter((r) => !r.retired);
const DEAD_BATCH = BATCH.filter((r) => r.retired);
// Vacuity floors, both directions. If retirement ever swallows the whole batch
// the live assertions below stop running and this file would pass by proving
// nothing — which is the exact failure mode scripts/lib/guardEnv.mjs exists for.
ok(LIVE_BATCH.length >= 10,
  `at least 10 batch pins are still live and still fully asserted (got ${LIVE_BATCH.length}) — a shrinking number here means the pinned catalogue is eroding, not that the guard got easier`);
ok(DEAD_BATCH.length >= 1,
  `the retired-pin branch is exercised (got ${DEAD_BATCH.length}) — with none, the containment assertions never run`);

ok(placePartnerPick({ name: "Shell Key Preserve" })?.offerId === SHELL_SKU,
  "Shell Key keeps 173028P1 — this batch did not steal the founder pin");
ok(placePartnerPick({ name: "Egmont Key State Park" })?.offerId === EGMONT_SKU,
  "Egmont Key keeps 237533P5 — Fort De Soto no longer shares the ferry");
ok(placePartnerPick({ name: "Fort De Soto Park" })?.offerId === FORT_SKU,
  "Fort De Soto is the owner-verified e-bike SKU, one offer, not the Egmont ferry");
ok(placePartnerPick({ name: "Fort De Soto Park" })?.offerId !== SHELL_SKU,
  "Fort De Soto does not inherit the Shell Key kayak SKU");
ok(placePartnerPick({ name: "Fort De Soto Park" })?.offerId !== EGMONT_SKU,
  "Fort De Soto does not inherit the Egmont ferry — one register per name");

// Both jet-ski/kayak products are retired (absent from wf_experiences). The
// property these two lines defend is that neither island ever wears the other's
// SKU, or a loose geo SKU. Null satisfies that strictly harder than a code does,
// and the reason check keeps "contained" from being confused with "deleted".
ok(placePartnerPick({ name: "Honeymoon Island State Park" }) === null,
  "Honeymoon Island paints no Book CTA — 11779P1 is retired, and it certainly never inherits Caladesi's kayak");
ok(pinServeability({ provider: "viator", offerId: "11779P1" }).reason === "retired-absent-from-catalogue",
  "…11779P1 is refused for the recorded catalogue reason");
ok(placePartnerPick({ name: "Caladesi Island State Park" }) === null,
  "Caladesi paints no Book CTA — 308814P5 is retired, and it never picks up the loose pontoon SKU or Honeymoon's jet-ski");
ok(pinServeability({ provider: "viator", offerId: "308814P5" }).reason === "retired-absent-from-catalogue",
  "…308814P5 is refused for the recorded catalogue reason");
ok(placePartnerPick({ name: "Caladesi Island" }) === null,
  "bare 'Caladesi Island' does not inherit the state-park kayak");
ok(placePartnerPick({ name: "Wekiwa Springs" }) === null,
  "bare 'Wekiwa Springs' does not inherit the state-park paddle");
ok(placePartnerPick({ name: "Wild Florida" })?.offerId !== "5467P2",
  "bare 'Wild Florida' stays on the existing Tiqets row — the safari SKU is exact-name only");
ok(placePartnerPick({ name: "Clearwater Beach" }) === null,
  "Clearwater Beach is not an exact Atlas/summer/curated card — the sunset SKU is on Pier 60 only");
ok(placePartnerPick({ name: "Lido Key Beach" }) === null,
  "Lido Key Beach does not inherit the Lido Beach kayak — exact name only");
ok(placePartnerPick({ name: "Mote Marine Laboratory" }) === null,
  "Mote Marine stays empty — owner forbade the night-kayak SKU as the wrong product");
ok(placePartnerPick({ name: "Pier 60" })?.offerId !== "342720P1"
  && placePartnerPick({ name: "Honeymoon Island State Park" })?.offerId !== "342720P1"
  && placePartnerPick({ name: "Honeymoon Island State Park" })?.offerId !== "338425P3",
  "loose Honeymoon geo SKUs are not pinned");
ok(!BATCH.some((r) => r.sku === HOLD_SKU || r.sku === "189704P3" || r.sku === "269962P2"),
  "batch table excludes the scallop HOLD-SKU, the Mote night kayak, and the loose Caladesi pontoon");

for (const row of BATCH) {
  const pick = placePartnerPick({ name: row.name });
  if (row.retired) {
    // CONTAINMENT. A dead product must reach the customer as no button at all.
    ok(pick === null, `${row.name}: no pin — ${row.sku} is absent from the catalogue and must not paint a Book button`);
    ok(pinServeability({ provider: "viator", offerId: row.sku }).reason === "retired-absent-from-catalogue",
      `${row.name}: ${row.sku} is refused for the recorded catalogue reason, not by silent deletion`);
    ok(placePartnerPick({ name: row.name.toLowerCase() }) === null,
      `${row.name}: containment is case-insensitive, exactly as the match is`);
    ok(!PLACE_PARTNER_PICKS.some((r) => String(r.offerId).toUpperCase() === String(row.sku).toUpperCase()),
      `${row.name}: ${row.sku} is not still pinned under some other alias`);
    continue;
  }
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

ok(PROVIDERS.viator.table === "wf_experiences" && PROVIDERS.viator.idColumn === "product_code",
  "viator stays table-backed (wf_experiences.product_code)");
ok(typeof PROVIDERS.viator.resolve !== "function",
  "viator has no registry resolve that would need a pasted product URL");

// A retired code's real production behaviour: the catalogue answers with no
// rows. Asserted here rather than skipped, because "the button is gone" and
// "the redirect fails closed" are two different protections and a future
// re-pin must trip at least one of them.
for (const row of DEAD_BATCH) {
  const gone = await resolveOffer("viator", row.sku, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "guard-key" }),
    fetch: async () => ({ ok: true, json: async () => [] }),
  });
  ok(gone.error === "offer-not-found" && !gone.dest,
    `${row.name}: an empty catalogue makes ${row.sku} fail closed (got ${gone.error || "a dest"}) — never a partner URL, never a guess`);
}

for (const row of LIVE_BATCH) {
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

const hold = await resolveOffer("viator", HOLD_SKU, {
  env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
  fetch: async () => { throw new Error("HOLD SKU must not hit the catalogue"); },
});
ok(hold.error === "denied-sku" && !hold.dest,
  `the scallop HOLD-SKU ${HOLD_SKU} is denied in resolveOffer`);

for (const row of BATCH) {
  if (!row.rankKey) continue;
  const pool = row.universe === "birthday" ? BIRTHDAY_UNIVERSE : SUMMER_UNIVERSE;
  const entry = pool.find((e) => e.key === row.rankKey);
  ok(!!entry, `${row.rankKey} remains an existing ${row.universe} entry — we did not invent a place`);
  ok(entry && entry.rank === row.rank,
    `${row.rankKey} rank is still ${row.rank} (got ${entry && entry.rank}) — the pin did not buy a better rank`);
  ok(entry && entry.venue && entry.venue.name === row.name,
    `${row.rankKey} venue name is still "${row.name}"`);
}

const shell = SUMMER_UNIVERSE.find((e) => e.key === "shell_key");
ok(shell && shell.rank === 28, `Shell Key summer rank is still 28 (got ${shell && shell.rank})`);
const egmont = SUMMER_UNIVERSE.find((e) => e.key === "egmont_key");
ok(egmont && egmont.rank === 27, `Egmont summer rank is still 27 (got ${egmont && egmont.rank})`);

function stripComments(src) {
  return String(src || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const placeSrc = stripComments(readFileSync(new URL("../lib/placePartnerPicks.js", import.meta.url), "utf8"));
ok(!/https:\/\/www\.viator\.com/i.test(placeSrc),
  "lib/placePartnerPicks.js has no raw viator.com URL — cards store the opaque offer id");
// Positive control, re-pointed 2026-09-10: 105290P10 and 308814P5 are retired,
// so they now appear only inside RETIRED_VIATOR_PINS and would have made this
// control pass while proving nothing about placePick declarations.
ok(/placePick\("173028P1"/.test(placeSrc) && /placePick\("412732P1"/.test(placeSrc) && /placePick\("454941P4"/.test(placeSrc),
  "positive control: live product codes are declared as placePick(...) offer ids");
// The matching negative control: no retired code may be a placePick(...) pin
// again. It may still appear in the retired ledger — that is the record, not a CTA.
for (const r of RETIRED_VIATOR_PINS) {
  ok(!new RegExp(`placePick\\(\\s*"${r.offerId}"`).test(placeSrc),
    `${r.offerId} is not re-declared as a placePick(...) pin — it is catalogue-absent`);
}
ok(!PLACE_PARTNER_PICKS.some((r) => String(r.offerId).toUpperCase() === HOLD_SKU),
  "the scallop HOLD-SKU is not a placePick offer id");
ok(!new RegExp(`placePick\\(\\s*"${HOLD_SKU}"`).test(placeSrc),
  "the scallop HOLD-SKU is not declared as a placePick(...) pin");

const cardSrc = stripComments(readFileSync(new URL("../app/components/IconicPlaceCard.js", import.meta.url), "utf8"));
ok(/commerceHref\(\{\s*provider:\s*partner\.provider/.test(cardSrc),
  "IconicPlaceCard builds the ticket href through commerceHref");
ok(!/https:\/\/www\.viator\.com/i.test(cardSrc),
  "IconicPlaceCard has no raw viator.com href");

ok(placePartnerPick({ name: "A Venue That Does Not Exist" }) === null,
  "an unlisted name is still null — the batch did not loosen exact-name matching");

if (fail.length) {
  console.error("test-cash-register-batch-2026-08-20: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`test-cash-register-batch-2026-08-20: OK — ${pass} assertions (${BATCH.length} picks CALLED through placePartnerPick + commerceHref + resolveOffer; no raw viator.com; no searchResults; no ${HOLD_SKU}; ranks unchanged)`);
