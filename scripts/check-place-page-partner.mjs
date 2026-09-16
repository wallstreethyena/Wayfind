#!/usr/bin/env node
// scripts/check-place-page-partner.mjs — LANE C.
//
// Two invariants, both asserted BY CALL, not by grepping the source:
//
//   1. placePagePartner() (lib/placeData.js) is the durable /places/[id]
//      page's ONLY path to a bookable partner. Before this existed,
//      lib/placePage.js called placePartnerPick() alone, so a VENUE_OFFERS
//      row (lib/venueOffers.js, geo-gated) had no way onto the place page
//      even when the Detail sheet could already reach the same offer through
//      bookItTarget(). This guard proves the fallback rung actually resolves
//      (a real NYC address), refuses the wrong city (Boise), and refuses a
//      beach/natural_feature identity even where the fallback would
//      otherwise have matched.
//
//   2. resolveDetailCta()'s rung 3 (lib/detailCta.js travelpayoutsHrefFor) can
//      surface a VENUE_OFFERS exact match. bookItTarget()'s exact-product
//      rung returns { kind: "offer", url: null } by design — the client must
//      never see a raw destination — but tpDeepLink() requires a
//      destinationUrl and returns null the instant one is missing. So this
//      rung could NEVER paint a venue offer before the fix, for every place
//      that has no PLACE_PARTNER_PICKS row. Proven here with a place that
//      deliberately carries none.
// lib/placeData.js (and its transitive deps: lib/site.js, lib/socialMeta.js,
// lib/placeIndex.js, ...) is written for the Next.js bundler — extensionless
// relative specifiers, e.g. "./site" — which plain node's ESM resolver
// refuses. Static top-level imports resolve before any statement in this
// file runs, so registering the hook only works if the imports that need it
// are DYNAMIC, after registration — the same pattern
// test-foursquare.mjs / test-photo-repair-deadline.mjs use to exercise real
// app modules without re-implementing them.
import { register } from "node:module";
register("./lib/placeDataNodeHook.mjs", import.meta.url);

const { placePagePartner } = await import("../lib/placeData.js");
const { resolveDetailCta } = await import("../lib/detailCta.js");
const { placePartnerPick } = await import("../lib/placePartnerPicks.js");
const { venueOfferFor } = await import("../lib/venueOffers.js");

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const NYC_911 = { name: "9/11 Memorial & Museum", address: "180 Greenwich St, New York, NY", id: "test-nyc-911", types: ["museum", "tourist_attraction"] };

// ── 1. placePagePartner ───────────────────────────────────────────────────

// POSITIVE CONTROL, checked first: the exact registry rung still resolves,
// so a null result below actually means something (AGENTS.md §4d).
ok(placePartnerPick({ name: "The Dalí Museum" })?.offerId === "tampa-date-dali-museum",
  "POSITIVE CONTROL: placePartnerPick still resolves a known exact hook");

{
  const got = placePagePartner(NYC_911);
  ok(got && got.provider === "tiqets" && got.offerId === "nyc-budget-911-memorial",
    `placePagePartner resolves the 9/11 Memorial's NYC venue offer (got ${JSON.stringify(got)})`);
  ok(!!got && !!got.merchant, "the resolved partner carries a display merchant name for the Book link's label");
}

{
  const boise = { ...NYC_911, address: "121 Main St, Boise, ID" };
  ok(placePagePartner(boise) === null,
    "the same venue name with a Boise, ID address resolves to nothing — geo is mandatory, never optional (F4)");
  // Prove the underlying resolver agrees, so a null above is the geo gate and
  // not some unrelated bug swallowing every result.
  ok(venueOfferFor(NYC_911.name, "Boise") === null, "…and venueOfferFor itself refuses the wrong city for this exact name");
}

{
  // A beach/natural_feature identity must never reach the venueOfferFor
  // fallback rung, even when the name+city WOULD otherwise resolve. Reusing
  // the 9/11 Memorial fixture (no PLACE_PARTNER_PICKS row — proven above —
  // so this exercises the FALLBACK rung, not the exact-registry rung, which
  // legitimately outranks the beach gate the same way resolveDetailCta's
  // exact-partner step does for a founder-verified beach-adjacent tour).
  const beachShape = { ...NYC_911, category: "beach" };
  ok(venueOfferFor(beachShape.name, "New York")?.offerId === "nyc-budget-911-memorial",
    "PRECONDITION: this name+city pair resolves through venueOfferFor when NOT beach-shaped — otherwise the null below would prove nothing");
  ok(placePagePartner(beachShape) === null,
    "a beach-identity shape refuses the venueOfferFor fallback even though the same name+city would otherwise resolve");
}

ok(placePagePartner(null) === null, "no place → no partner");
ok(placePagePartner({}) === null, "a place with no name → no partner");
ok(placePagePartner({ name: "A Place Nobody Registered", address: "1 Nowhere Rd, Springfield, IL" }) === null,
  "an unregistered place resolves to nothing rather than a near match");

// ── 2. resolveDetailCta rung 3 (the venue-offer null-url bug) ─────────────

{
  // No PLACE_PARTNER_PICKS row exists for this exact name+id combination
  // (only the geo-gated VENUE_OFFERS row does), so resolveDetailCta's step 1
  // (exactPartner) must fall through to the attraction ladder and reach rung
  // 3 for this assertion to mean anything.
  ok(placePartnerPick({ name: NYC_911.name, id: NYC_911.id }) === null,
    "PRECONDITION: no exact-name registry row shadows this place, so the assertion below actually exercises rung 3");

  const cta = resolveDetailCta({ detail: NYC_911, kind: "attraction", viaTours: {}, locName: "New York, NY", offers: {}, openState: true });
  ok(cta.monetized === true, `resolveDetailCta rung 3 is monetized for the 9/11 Memorial (got ${JSON.stringify(cta)})`);
  ok(typeof cta.href === "string" && cta.href.startsWith("/api/commerce/go?provider=tiqets&offer=nyc-budget-911-memorial"),
    `the resolved href starts with the tracked commerce redirect for the exact offer (got ${cta.href})`);
  ok(cta.provider === "tiqets" && cta.offerId === "nyc-budget-911-memorial",
    "the CTA carries the real provider + offerId, not a generic 'booking' placeholder");
  ok(cta.type === "tickets", "the CTA type is tickets, matching the ladder's attraction/tour rung");
}

{
  // Wrong-city negative control on the same detailCta path: Boise never
  // reaches an offer through rung 3 either.
  const boiseDetail = { ...NYC_911, id: "test-boise-911" };
  const cta = resolveDetailCta({ detail: boiseDetail, kind: "attraction", viaTours: {}, locName: "Boise, ID", offers: {}, openState: true });
  ok(cta.monetized === false && cta.type === "directions",
    `a place in a market that sells nothing falls to the honest Directions CTA (got ${JSON.stringify(cta)})`);
}

if (fail.length) {
  console.error("check-place-page-partner: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`check-place-page-partner: OK — ${pass} assertions (placePagePartner + resolveDetailCta CALLED; NYC venue offer resolves on the place page and rung 3; Boise and beach shapes refused)`);
