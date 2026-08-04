// scripts/test-book-it-venues.mjs — the exact venue→offer path for Book-it.
//
// Audit finding F4: bookItTarget() returned null for EVERY attraction and EVERY
// tour, so the Book-it layer was dark on exactly the inventory it exists for.
// lib/venueOffers.js supplies hand-verified exact products for named venues.
//
// This guard holds the two properties that keep that map from becoming the very
// bug this session spent its time removing:
//
//   1. Every offer id RESOLVES. A typo'd id would render a Book-it button that
//      dead-ends at /api/commerce/go with offer-not-found — a live money link to
//      nowhere, which is worse than no button.
//   2. GEO IS MANDATORY. wf_place_products matched products to places on a bare
//      name substring with no geographic constraint and sent Orlando visitors to
//      a Manhattan tour of Central Park. Every row here names its market, and a
//      name hit in the wrong city MUST return null.
import { VENUE_OFFERS, venueOfferFor } from "../lib/venueOffers.js";
import { PARTNER_OFFER_REGISTRY, partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { PROVIDERS } from "../lib/commerceProviders.js";
import { TP_PROGRAMS, isTpProgramLive } from "../lib/travelpayouts.js";
import { bookItTarget } from "../lib/monetize.js";

let pass = 0;
const fail = (m) => { console.error("test-book-it-venues: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

ok(VENUE_OFFERS.length >= 10, `the venue map is populated (got ${VENUE_OFFERS.length}) — an empty map would make every assertion below vacuous`);

// ── 1. every id resolves, and to the provider it claims ───────────────────
for (const row of VENUE_OFFERS) {
  ok(!!PARTNER_OFFER_REGISTRY[row.offerId],
     `venue offer "${row.offerId}" exists in lib/partnerOfferRegistry.js — a typo'd id renders a Book-it button that dead-ends at offer-not-found`);
  ok(!!partnerOfferById(row.offerId, row.provider),
     `venue offer "${row.offerId}" belongs to the provider it claims (${row.provider})`);
  ok(!!PROVIDERS[row.provider],
     `provider "${row.provider}" is wired into the commerce redirect, so the offer can actually be served`);
  ok(!!TP_PROGRAMS[row.provider],
     `provider "${row.provider}" is a known Travelpayouts program`);
  ok(Array.isArray(row.market) && row.market.length > 0,
     `venue "${row.offerId}" declares a market — geo is mandatory, never optional`);
  ok(Array.isArray(row.names) && row.names.length > 0, `venue "${row.offerId}" declares at least one name`);
}

// ── 2. no venue is claimed twice ──────────────────────────────────────────
// Two rows matching the same name+market would make the winner depend on array
// order, which is exactly the kind of silent decision this file exists to avoid.
const seen = new Map();
for (const row of VENUE_OFFERS) {
  for (const n of row.names) {
    for (const m of row.market) {
      const key = `${n.toLowerCase()}|${m.toLowerCase()}`;
      ok(!seen.has(key), `"${n}" in "${m}" is claimed by both ${seen.get(key)} and ${row.offerId} — one venue, one offer`);
      seen.set(key, row.offerId);
    }
  }
}

// ── 3. THE MATCH WORKS, and the geo gate holds ────────────────────────────
const live = Object.keys(TP_PROGRAMS).filter(isTpProgramLive);
const HIT = [
  ["The Florida Aquarium", "Tampa", "tampa-deal-florida-aquarium"],
  ["Henry B. Plant Museum", "Tampa", "tampa-hidden-plant-museum"],
  ["Empire State Building", "New York", "nyc-hook-empire-state"],
  ["SEA LIFE Orlando Aquarium", "Orlando", "orlando-tonight-sealife"],
];
for (const [name, city, offerId] of HIT) {
  const v = venueOfferFor(name, city);
  ok(v && v.offerId === offerId, `"${name}" in ${city} resolves to ${offerId} (got ${v ? v.offerId : "null"})`);
  const t = bookItTarget({ name, types: ["museum", "tourist_attraction"] }, { available: live, city });
  ok(t && t.kind === "offer" && t.offerId === offerId,
     `bookItTarget returns the exact offer for "${name}" — this is the case that returned NULL for every attraction before F4`);
  ok(t && !t.url, `the target carries NO destination url for "${name}" — offer ids only, so nothing leaks to the browser`);
  ok(t && t.label && t.label.sub, `the target carries its FTC disclosure label for "${name}"`);
}

// THE GEO GATE. Same venue name, wrong city → nothing.
const WRONG = [
  ["The Florida Aquarium", "New York"],
  ["Empire State Building", "Orlando"],
  ["Henry B. Plant Museum", "Sarasota"],
  ["Bronx Zoo", "Tampa"],
];
for (const [name, city] of WRONG) {
  ok(venueOfferFor(name, city) === null,
     `"${name}" in ${city} resolves to NOTHING — a name hit in the wrong market must never inherit another city's ticket`);
  const t = bookItTarget({ name, types: ["museum"] }, { available: live, city });
  ok(!t || t.kind !== "offer", `bookItTarget refuses the exact-offer path for "${name}" in ${city}`);
}

// ── 4. negative controls ──────────────────────────────────────────────────
ok(venueOfferFor("", "Tampa") === null, "no name → no offer");
ok(venueOfferFor("The Florida Aquarium", "") === null, "no city → no offer (geo is required, not best-effort)");
ok(venueOfferFor("A Place That Does Not Exist", "Tampa") === null, "an unlisted venue resolves to nothing rather than a near match");
// Substring must NOT match — the allowlist is exact, unlike the wf_place_products
// join that produced the wrong-city buttons.
ok(venueOfferFor("Florida Aquarium Gift Shop", "Tampa") === null,
   "a SUPERSTRING of a listed venue does not match — the name list is exact, not a substring guess");

// ── 5. the search path still works, unchanged ─────────────────────────────
const ev = bookItTarget({ name: "Van Wezel Performing Arts Hall", types: ["performing_arts_theater"] }, { available: live, city: "Sarasota" });
ok(ev && ev.kind === "search" && ev.provider === "ticketnetwork",
   "the pre-existing destination-search path is untouched for events (ticketnetwork)");

console.log(`test-book-it-venues: OK — ${pass} assertions (${VENUE_OFFERS.length} venues, every offer id resolved against the registry, ${HIT.length} exact matches CALLED through bookItTarget, ${WRONG.length} wrong-city cases refused, search path intact)`);
