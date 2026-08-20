// scripts/check-partner-hook-collisions.mjs — the wrong-city guard for the
// TWO surfaces that sell an exact partner ticket, and the one collision class
// neither of them could previously catch.
//
// WHY THIS EXISTS. lib/venueOffers.js is geo-gated: a match requires BOTH the
// name and the market, so a bare brand name ("Madame Tussauds") is safe there —
// Orlando's row and New York's row cannot poach each other. lib/placePartnerPicks.js
// has NO market parameter at all; `placePartnerPick(place)` is a pure name
// lookup that builds one flat `BY_NAME` Map. So the moment two rows there share
// an alias, the LAST one silently wins for every city, and a place card starts
// selling another metro's ticket. That is finding F4 — the bug that put 16% of
// live booking buttons on the wrong city — reappearing in the one surface whose
// API cannot refuse it.
//
// It stopped being hypothetical on 2026-08-08, when the hook batch grew from 36
// to 87 venues and brought four genuinely multi-city brands with it (Madame
// Tussauds, Museum of Illusions, Museum of Ice Cream, Color Factory). Measured
// against real inventory that day: wf_inventory holds a New York place named
// literally "Museum of Sex" and a Chicago one named "Flyover" — either would
// have inherited Miami's / Chicago's ticket from a bare-brand alias.
//
// ASSERTING ON THE CALL, NOT THE STRING. A Set-of-aliases uniqueness check
// would pass on a file whose lookup was broken some other way. Every assertion
// below therefore INVOKES the real resolver and checks the returned offer id,
// which is the thing that actually ships.
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { VENUE_OFFERS, venueOfferFor } from "../lib/venueOffers.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { UT_PLACE_DEAL_IDS } from "../lib/deals.js";

// v8.19 — Viator place-hook pin: product_codes confirmed in wf_experiences
// with link_ok:true, fail_count:0 on 2026-08-19 (the rail-card monetization
// audit). A code absent here is an unverified hook.
const VIATOR_PLACE_PRODUCT_CODES = {
  "412732P1": "Clear Kayak Ecotour at Robinson Preserve",
  "454941P4": "Robinson Preserve Mangrove Tour",
  "22211P1": "TreeUmph Adventure Course",
  "237533P5": "Egmont Key Ferry (Fort De Soto)",
  "3170P97": "Fun Spot Attractions Theme Parks Admission",
  "173028P1": "Clear Kayak Tour of Shell Key Preserve and Tampa Bay Area",
  "324135P3": "Guided E-Bike Tour of Fort De Soto",
  "350236P1": "Golf Cart Tours of Tarpon Springs",
  "20572P1": "Kayak Mangrove Tunnel Manatee Tour Lido Key",
  "87414P4": "Kayak Tour through Mangrove Tunnels",
  "136885P1": "Electric Bike Siesta Key Sunset Tour",
  "136885P3": "Myakka State Park E-bike Safari",
  "203023P2": "Anna Maria Island Dolphin Sunset Boat Tour",
  "454941P3": "Manatee Discovery Tour",
  "298601P1": "Clearwater Sunset Cruise",
  "308814P5": "Kayak Adventure at Caladesi Island",
  "11779P1": "2-Hour Jet Ski Tour of Honeymoon and Caladesi Island",
  "288108P1": "Clear Kayak Tours in Weeki Wachee",
  "343215P2": "Rainbow Springs: Clear Kayak & Snorkel Eco Tour",
  "290298P1": "Silver Springs Tour",
  "65756P5": "Dinoflagellate Bioluminescence Kayak Tour",
  "431125P10": "Everglades National Park Mangrove Wilderness Tour",
  "101001P1": "Snorkeling the Beautiful Reefs of Key Largo",
  "17325KEYYAN": "Dry Tortugas National Park Day Trip by Catamaran from Key West",
  "184792P17": "Clear Kayak Three Sisters Springs & Manatee Tour Of Crystal River",
  "5467P2": "Wild Florida Drive-Thru Safari and Gator Park Admission",
  "350214P1": "4-Hour St. Pete Pier to Egmont Key Experience by Ferry",
  "17984P2": "Island Adventure at Robbie's Marina",
  "68831P1": "Sarasota Mangrove Tunnel Guided Kayak Adventure",
  "26315P9": "Bioluminescence Night Kayaking Tour of Merritt Island Wildlife Refuge",
  "105290P10": "Paddle Board or Clear Kayak and Swim Adventure at Wekiwa Springs",
  "386845P1": "Kayak Paddling Experience at The Bay Park",
  "236733P1": "2 Person Mini Power Boat Rental at Tampa Riverwalk",
  "431125P5": "St. Johns River Cruise - Blue Spring State Park",
};


let pass = 0;
const fail = (m) => { console.error("check-partner-hook-collisions: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// Same normalisation lib/placePartnerPicks.js uses, so this guard models the
// real key space rather than a convenient approximation of it.
const norm = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// Positive control: a check that reports "0 collisions" for an EMPTY list is
// broken, not clean. Both lists must be populated for anything below to mean
// anything.
ok(PLACE_PARTNER_PICKS.length >= 20, `PLACE_PARTNER_PICKS is populated (got ${PLACE_PARTNER_PICKS.length}) — an empty list makes every assertion below vacuous`);
ok(VENUE_OFFERS.length >= 20, `VENUE_OFFERS is populated (got ${VENUE_OFFERS.length})`);

// ── 1. EVERY alias resolves to ITS OWN row ────────────────────────────────
// This is the collision check in its load-bearing form. If two rows share an
// alias, the loser's own alias resolves to the winner's offer id and this
// fails — naming both sides.
const aliasOwner = new Map();
for (const row of PLACE_PARTNER_PICKS) {
  for (const alias of row.aliases) {
    const key = norm(alias);
    ok(key.length > 0, `${row.offerId} has a non-empty alias (got ${JSON.stringify(alias)})`);
    // Only a CROSS-row clash is a defect. Two aliases on the SAME row may
    // legitimately normalise together — "The Dalí Museum" and "The Dali
    // Museum" are one venue spelled two ways, and both must keep resolving.
    const prior = aliasOwner.get(key);
    ok(prior === undefined || prior === row.offerId,
       `alias "${alias}" is claimed by BOTH ${prior} and ${row.offerId} — placePartnerPick has no market gate, so the second row silently wins for every city and one of these venues sells the other's ticket`);
    aliasOwner.set(key, row.offerId);

    const got = placePartnerPick({ name: alias });
    ok(got && got.offerId === row.offerId,
       `placePartnerPick("${alias}") returns ${row.offerId} (got ${got ? got.offerId : "null"}) — the lookup must resolve each alias to the row that declared it`);
  }
}

// ── 2. NO BARE MULTI-MARKET BRAND may appear in the un-gated list ─────────
// A brand is "multi-market" when VENUE_OFFERS sells it under two different
// offer ids. Those bare names are safe in the geo-gated map and are exactly
// what must never enter the flat one.
const brandMarkets = new Map(); // normalised name -> Set(offerId)
for (const row of VENUE_OFFERS) {
  for (const n of row.names) {
    const key = norm(n);
    if (!brandMarkets.has(key)) brandMarkets.set(key, new Set());
    brandMarkets.get(key).add(row.offerId);
  }
}
const multiMarket = [...brandMarkets.entries()].filter(([, ids]) => ids.size > 1);
for (const [key, ids] of multiMarket) {
  ok(!aliasOwner.has(key),
     `"${key}" is sold in ${ids.size} markets (${[...ids].join(", ")}) but appears as a BARE alias in lib/placePartnerPicks.js, which cannot tell the cities apart — city-suffix it there and keep the bare name in lib/venueOffers.js`);
}

// ── 3. THE GEO GATE ACTUALLY SEPARATES THEM ──────────────────────────────
// For every multi-market brand, prove by CALL that each market resolves to its
// own offer, and that a market that sells neither resolves to nothing.
for (const [key, ids] of multiMarket) {
  const rows = VENUE_OFFERS.filter((r) => r.names.some((n) => norm(n) === key));
  const resolved = new Set();
  for (const row of rows) {
    for (const market of row.market) {
      const v = venueOfferFor(key, market);
      ok(v && v.offerId === row.offerId,
         `venueOfferFor("${key}", "${market}") resolves to ${row.offerId} (got ${v ? v.offerId : "null"})`);
      resolved.add(v.offerId);
    }
  }
  ok(resolved.size === ids.size,
     `each market selling "${key}" reaches its OWN offer (${resolved.size} of ${ids.size} distinct ids reachable)`);
  // A city that sells this brand nowhere must get nothing rather than the
  // nearest row in array order.
  ok(venueOfferFor(key, "Sarasota") === null || rows.some((r) => r.market.some((m) => norm(m) === "sarasota")),
     `"${key}" in a market that does not sell it resolves to NOTHING`);
}

// ── 4. EVERY hook on BOTH surfaces resolves to a real, tracked destination ─
// An id that resolves to nothing renders a live money link that dead-ends.
const HOST_OK = /^https:\/\/(www\.)?(tiqets|klook|gocity|ticketnetwork|viator)\.com\//;
for (const row of [...PLACE_PARTNER_PICKS, ...VENUE_OFFERS]) {
  // v6.98: Undercover Tourist hooks are TABLE-backed (wf_deals; the
  // deals-health cron owns liveness + CJ attribution) — the registry cannot
  // vouch for them. The hand-verified pin in lib/deals.js does: read live from
  // wf_deals 2026-08-11, all active + link_ok. The collision checks above
  // (sections 1-3) still cover these rows in full — only the registry
  // resolution is provider-specific.
  if (row.provider === "undercover_tourist") {
    ok(!!UT_PLACE_DEAL_IDS[row.offerId], `${row.offerId} UT hook is pinned to a hand-verified wf_deals row`);
    continue;
  }
  if (row.provider === "viator") {
    // v8.19 — table-backed like UT: wf_experiences product_code lookup with
    // its own link_ok pipeline. Pinned below, verified live 2026-08-19.
    ok(!!VIATOR_PLACE_PRODUCT_CODES[row.offerId], `${row.offerId} viator hook is pinned to a live-verified wf_experiences product_code`);
    continue;
  }
  const entry = partnerOfferById(row.offerId, row.provider);
  ok(!!entry, `${row.offerId} resolves through partnerOfferById for provider ${row.provider}`);
  ok(typeof entry.destination === "string" && HOST_OK.test(entry.destination),
     `${row.offerId} points at a real partner destination over https (got ${entry.destination})`);
  ok(!/\s|\{|\}|example\.com|TODO/i.test(entry.destination),
     `${row.offerId} has no placeholder or templated destination`);
}

// ── 5. Negative controls — the probe finds known positives and rejects near
// misses, so a green here is not a check that simply never fires.
ok(placePartnerPick({ name: "The Dalí Museum" })?.offerId === "tampa-date-dali-museum",
   "POSITIVE CONTROL: a known-good alias still resolves (if this fails, the checks above are testing nothing)");
ok(placePartnerPick({ name: "A Venue That Does Not Exist" }) === null,
   "an unlisted name resolves to nothing rather than a near match");
ok(placePartnerPick({ name: "Zoo Miami Gift Shop" }) === null,
   "a SUPERSTRING of a listed venue does not match — exact names, never substrings");

const registryIds = Object.keys(PARTNER_OFFER_REGISTRY).length;
console.log(`check-partner-hook-collisions: OK — ${pass} assertions (${PLACE_PARTNER_PICKS.length} un-gated place hooks with ${aliasOwner.size} aliases, all resolved BY CALL; ${VENUE_OFFERS.length} geo-gated venues; ${multiMarket.length} multi-market brands proven separated by market; ${registryIds} registry destinations checked for host + placeholders)`);

// ── TICKETNETWORK PATH LAW (added 2026-08-12) ─────────────────────────────
// TicketNetwork serves TWO paths. `/venues/<slug>-tickets` is legacy and
// STALE: on 2026-08-12 our wired Amalie Arena link returned a page titled
// "Amalie Arena Tickets 2026" whose every listing row read "Benchmark
// International Arena" — the venue had been renamed and the legacy record was
// never updated. `/e/venues/...` is the live path.
//
// Worse, this vendor FUZZY-MATCHES an unrecognised slug to its nearest venue
// and echoes the requested slug into <title> and <h1>. "The Sound at Coachman
// Park" (Clearwater FL) rendered a perfect title over Del Mar, CALIFORNIA
// listings. A link can therefore look right in every automated check and still
// sell a venue 2,500 miles away.
//
// So: no TicketNetwork destination may ship on the legacy path, and every one
// that ships must have been verified against the LISTING ROWS, not the title.
{
  const reg = (await import("node:fs")).readFileSync(new URL("../lib/partnerOfferRegistry.js", import.meta.url), "utf8");
  const legacy = [...reg.matchAll(/"([a-z0-9-]+)": offer\("ticketnetwork", "https:\/\/www\.ticketnetwork\.com\/venues\//g)].map((m) => m[1]);
  if (legacy.length) {
    console.error("check-partner-hook-collisions: FAIL — TicketNetwork offers on the STALE legacy path (use /e/venues/, and verify against the listing rows not the title): " + legacy.join(", "));
    process.exit(1);
  }
}
