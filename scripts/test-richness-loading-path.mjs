#!/usr/bin/env node
/**
 * Hermetic loading-path and richness verification across:
 * 1. Same-brand / different-location disambiguation (exact place_id + branch address isolation)
 * 2. Rich record, sparse record, unknown pricing, free place, and hotel with/without editorial
 * 3. Late-response / missing-enrichment preservation (mergePlacePage & toHookLine)
 * 4. WayfindTakeRail breakdown list: items.filter((_, i) => i !== active) preserves items[0] when active > 0
 * 5. Batch A (9 verified Atlas addresses + 1 retained chain restriction), Batch B (guide coordinates), Batch C (50 event-adjacent hotel hooks without unverified affiliate links)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  atlasCardFor,
  atlasLinesFor,
  indexAtlasCards,
} from "../lib/atlasCards.js";
import {
  atlasPlaceFor,
  mergePlacePage,
} from "../lib/atlasPlaceAllowlist.js";
import {
  EVENT_HOTEL_EDITORIAL,
  eventHotelEditorialById,
} from "../lib/eventHotelEditorial.js";
import { isUsableCardHook, toHookLine } from "../lib/editorialHook.js";
import { sourcedWhyById } from "../lib/rankingWhy.js";
import { isHotelBookingVerified } from "../lib/hotelBookingVerification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let assertions = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  assertions += 1;
};

const rawCards = JSON.parse(
  fs.readFileSync(path.join(root, "data/atlas/editorial-cards.json"), "utf8"),
);
const index = indexAtlasCards(rawCards);

// 1. Same-brand / different-location disambiguation
const frogPonds = rawCards.filter((c) =>
  (c.name || "").toLowerCase().includes("frog pond"),
);
ok(
  frogPonds.length >= 2,
  `Expected multiple Frog Pond branches in Atlas, found ${frogPonds.length}`,
);
const seenIds = new Set();
const seenAddresses = new Set();
for (const fp of frogPonds) {
  ok(!seenIds.has(fp.placeId), `Duplicate Frog Pond placeId ${fp.placeId}`);
  seenIds.add(fp.placeId);
  const atlas = atlasPlaceFor(fp.placeId);
  const merged = mergePlacePage(fp.placeId, {
    skel: { name: fp.name, lat: 27.77, lng: -82.64 },
    details: null,
    atlas,
  });
  ok(merged && merged.hasDetails, `Frog Pond ${fp.placeId} must be renderable`);
  ok(
    Boolean(merged.address) && merged.address === fp.address,
    `Frog Pond ${fp.placeId} address "${merged.address}" must match branch card address "${fp.address}"`,
  );
  seenAddresses.add(merged.address);
}
ok(
  seenAddresses.size === frogPonds.length,
  "Every Frog Pond branch resolves to its distinct physical street address without cross-branch contamination",
);

// 2. Rich record, sparse record, unknown pricing, free place, and hotel without editorial
// 2a. Rich record: Asolo Repertory Theatre
const asoloId = "ChIJlXJqE9k_w4gRySJ2BPEXcR0";
const asoloCard = atlasCardFor(index, asoloId);
const asolo = mergePlacePage(asoloId, {
  skel: { name: "Asolo Repertory Theatre", lat: 27.3822, lng: -82.5597 },
  details: null,
  atlas: atlasPlaceFor(asoloId),
});
ok(asolo && asolo.hasDetails, "Asolo Repertory Theatre should render from Atlas card");
ok(Boolean(asolo.description), "Asolo has merged description");
ok(Boolean(asolo.knownFor), "Asolo has knownFor");
ok(Boolean(asoloCard?.insiderMove), "Asolo card has insiderMove");
ok(Boolean(asoloCard?.watchOut), "Asolo card has watchOut");

// 2b. Free place: Mead Botanical Garden (Batch A newly enriched address)
const meadId = "ChIJ-Q5hegpw54gR1N58sp-UbH0";
const meadCard = atlasCardFor(index, meadId);
const mead = mergePlacePage(meadId, {
  skel: null,
  details: null,
  atlas: atlasPlaceFor(meadId),
});
ok(mead && mead.hasDetails, "Mead Botanical Garden should be renderable with verified address");
ok(
  mead.address === "1300 S Denning Dr, Winter Park, FL 32789",
  `Mead address mismatch: ${mead.address}`,
);
ok(
  /free/i.test(meadCard?.whyGo || "") && /free/i.test(meadCard?.hours || ""),
  "Mead Botanical Garden preserves free admission context in whyGo and hours",
);
ok(
  mead.price === null,
  "Free place without numeric tier keeps price null rather than inventing a tier",
);

// 2c. Sparse record with unknown pricing
const sparse = mergePlacePage("ChIJ_sparse_test_record_001", {
  skel: { name: "Neighborhood Pocket Park", lat: 27.95, lng: -82.45 },
  details: {
    name: "Neighborhood Pocket Park",
    address: "100 Main St, Tampa, FL 33602",
    price: null,
  },
  atlas: null,
});
ok(sparse && sparse.hasDetails, "Sparse record with name + coordinates renders cleanly");
ok(sparse.price === null, "Unknown price stays null");
ok(sparse.knownFor === null && sparse.vibeCheck === null, "Sparse record without editorial does not invent editorial");

// 2d. Missing later enrichment does not erase valid baseline info (all 9 Batch A resolved addresses)
const batchAResolved = [
  ["ChIJw5jVAVN-54gRScNxiRF16j4", "8375 International Dr, Orlando, FL 32819"],
  ["ChIJ-Q5hegpw54gR1N58sp-UbH0", "1300 S Denning Dr, Winter Park, FL 32789"],
  ["ChIJubxw-4Z_3YgRY7aYzNkTBPQ", "1580 E Buena Vista Dr, Orlando, FL 32830"],
  ["ChIJ8U3jgFh_3YgRLAEhFIVbyxo", "5770 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34746"],
  ["ChIJwZ_GK-d-54gRLBNUdr8UIDo", "6000 Universal Blvd, Orlando, FL 32819"],
  ["ChIJIyOEEvd954gR4F34yBVuWSo", "8001 S Orange Blossom Trl, Orlando, FL 32809"],
  ["ChIJfUTGO2uA3YgR8t5QlAd-jTY", "8200 Vineland Ave, Orlando, FL 32821"],
  ["ChIJXaxcZ2xw54gRNoUCptQFnF4", "510 N Orlando Ave, Winter Park, FL 32789"],
  ["ChIJfyPWjCh-54gR1SvWozmef5k", "7007 Sea World Dr, Orlando, FL 32821"],
];
for (const [id, expectedAddr] of batchAResolved) {
  const page = mergePlacePage(id, {
    skel: null,
    details: null,
    atlas: atlasPlaceFor(id),
  });
  ok(
    page && page.hasDetails && page.address === expectedAddr && page.durableEligible === true,
    `Batch A card ${id} must preserve verified address "${expectedAddr}" and durableEligible when details are null`,
  );
}

// 2e. Chain-wide Atlas card (Keke's Breakfast Cafe) remains held back when details are null
const kekesId = "ChIJu6mxR2593YgR8m4v97QK9XM";
const kekes = mergePlacePage(kekesId, {
  skel: null,
  details: null,
  atlas: atlasPlaceFor(kekesId),
});
ok(
  kekes.address === null && kekes.durableEligible === false,
  "Keke's Breakfast Cafe retains null address and durableEligible=false on chain-wide card rather than inventing a single branch address",
);

// 3. Batch C: 50 event-adjacent hotels + Myakka River State Park
const hotelIds = Object.keys(EVENT_HOTEL_EDITORIAL).filter(
  (id) => id !== "ChIJxaeEtGVMw4gRd5SI3lZDqnY",
);
ok(hotelIds.length === 50, `Expected 50 event-adjacent hotels, got ${hotelIds.length}`);
const atlasLines = atlasLinesFor(rawCards, [
  ...hotelIds,
  "ChIJxaeEtGVMw4gRd5SI3lZDqnY",
]);
for (const id of hotelIds) {
  const raw = eventHotelEditorialById(id);
  ok(isUsableCardHook(raw), `Hotel ${id} blurb must pass isUsableCardHook`);
  const hook = toHookLine(raw, 130);
  ok(hook.length >= 25 && hook.length <= 130, `Hotel ${id} hook length ${hook.length}`);
  ok(
    sourcedWhyById(id) === toHookLine(raw),
    `sourcedWhyById(${id}) must return exact-place_id hotel editorial hook`,
  );
  ok(
    atlasLines[id] === raw,
    `atlasLinesFor must include fallback for ${id}`,
  );
  // Wrong place_id must never match by name alone
  ok(
    sourcedWhyById("ChIJ_wrong_id_999", "Hilton Tampa Downtown") === "",
    "Hotel editorial must never match by name alone without exact place_id",
  );
  // None of the 50 enrichment hotels may receive unverified affiliate booking links
  ok(
    isHotelBookingVerified({ id }) === false,
    `Hotel ${id} must not receive an unverified affiliate booking button`,
  );
  // Hotel copy is keyed by property_id (not by event) and must not make unsupported commute/timing or event-specific claims
  ok(
    !/\b(minutes? from|minutes? north|short drive|quick drive|scenic drive|walking distance|steps from|within easy reach|events|outings)\b/i.test(raw),
    `Hotel ${id} editorial must remain factual property-location copy without unsupported commute or event claims: ${raw}`,
  );
}

// Hotel without editorial copy retains clean null hook without invented text
const unenrichedHotelId = "ChIJ_unenriched_hotel_000";
ok(
  sourcedWhyById(unenrichedHotelId, "Unenriched Motor Inn") === "",
  "Unenriched hotel returns empty string rather than generic boilerplate",
);

// 4. WayfindTakeRail breakdown non-duplication check in Detail.js
const detailSrc = fs.readFileSync(
  path.join(root, "app/components/sheets/Detail.js"),
  "utf8",
);
ok(
  detailSrc.includes("items.filter((_, i) => i !== active)"),
  "Detail.js WayfindTakeRail must filter out active index rather than slicing index 0 unconditionally",
);

// 5. EventVenueMap Escape key dismissal check
const mapSrc = fs.readFileSync(
  path.join(root, "app/components/EventVenueMap.js"),
  "utf8",
);
ok(
  mapSrc.includes('e.key === "Escape"') && mapSrc.includes("setSel(null)"),
  "EventVenueMap.js must support Escape key dismissal of selected callout",
);

console.log(`OK ${assertions} assertions in test-richness-loading-path.mjs`);
