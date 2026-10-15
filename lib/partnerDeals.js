// Short-lived, provider-verified attraction deals for the Coupons surface.
// No percentage is claimed because live provider pricing can move during the
// audit window. The card says only what remains true: a reduced/bundled price
// was verified, where it applies, and when Wayfind will automatically hide it
// unless the revenue audit verifies it again.
import { commerceHref } from "./commerce.js";

// expires/verifiedOn are PER-DEAL since 2026-08-07: the Aug 8 window split -
// Adventure Island re-verified with real strikethrough cuts on 2026-08-05
// (renewed to Aug 22), while the FL Aquarium standalone discount vanished at
// the source and Klook Pass is unverifiable unattended - both lapse Aug 8 by
// keeping the old date. Registry: claude/wayfind-deals-registry.md.
const deal = ({ offerId, provider, business, area, title, details, intents, expires = "2026-08-08", verifiedOn = "2026-08-01" }) => Object.freeze({
  id: `cpn-partner-${offerId}`,
  business,
  area,
  title,
  details,
  code: null,
  url: commerceHref({ provider, offerId, surface: "coupons", contentId: offerId }),
  expires,
  verifiedOn,
  cta: "Check live price",
  badge: "Provider deal",
  intents,
  match: [],
  // Intentionally no image: a mismatched/cropped stock photograph weakens the
  // utility of a clip-and-save card. Exact place imagery belongs to place cards.
  commerce: Object.freeze({ provider, offerId }),
});

export const PARTNER_DEAL_COUPONS = Object.freeze([
  // PURGED 2026-10-15: cpn-partner-tampa-deal-florida-aquarium. Lapsed 2026-08-08
  // (the Tiqets standalone discount vanished at source: flat price, no cut) and
  // nobody renewed it; the dead row kept reappearing as overdue noise in the
  // partner-path renewal queue. Same convention as the 2026-08-07 purges (#648).
  // The Tiqets product itself stays bookable via partnerOfferRegistry's
  // tampa-deal-florida-aquarium; only the dated Coupons-tab card is gone.
  deal({
    offerId: "tampa-deal-adventure-island",
    provider: "tiqets",
    // 2026-08-26 audit: bundle cuts re-verified DIRECT at the Tiqets page the
    // same day (FL Aquarium combo $81.48->$77.41, ZooTampa $91.48->$86.91,
    // plus five more 5%-off combos) — the third+ consecutive check to find the
    // promo live. The card had been auto-hidden since Aug 23 on the lapsed
    // date below: a real, earning deal converting zero. Next-but-one-Monday
    // expiry per the deals registry's standing instruction.
    // 2026-10-13 re-verify: official calendar (adventureisland.com/park-info/
    // water-park-hours/, October 2026 grid read in a real browser) shows "Park
    // Hours 10:30 am - 5:00 pm" Fri-Sun through Oct 25 and "Park Closed" every
    // day after; the seasonal park shows no November dates. Tiqets product
    // p1016749 is live (checkout options, 5%-off bundles still listed). Expiry
    // is the LAST operating day, never beyond what the operator posts - the card
    // auto-hides on the 26th. Extend only if the official calendar adds dates.
    expires: "2026-10-25",
    verifiedOn: "2026-10-13",
    business: "Adventure Island Tampa Bay",
    area: "Tampa",
    title: "Waterpark tickets and current bundles",
    details: "Compare the live single-park and multi-park options before buying—some combinations include dining or another Tampa attraction.",
    intents: ["familyfun", "outdoors"],
  }),
  // PURGED 2026-10-15: cpn-partner-orlando-deal-klook-pass. Lapsed 2026-08-08
  // (Klook Pass price is unverifiable unattended); dead row removed from the
  // renewal queue per #648. The evergreen registry offer orlando-deal-klook-pass
  // in partnerOfferRegistry.js is untouched.
  // NOT ADDED 2026-08-01: NYC Coupons-tab cards (Vessel, One World Observatory).
  // lib/dealSheet.js dealScope() resolves `area` against orderInFeatured.js
  // METROS, which is the Order-In/Uber-Eats feature's own Florida-only metro
  // list (Sarasota/St Pete/Tampa/Orlando) with GUARANTEED restaurant rosters —
  // not a general "every Wayfind market" list. "New York" does not resolve
  // there, so it fell to `{kind:"unplaced"}` and tripped
  // check-coupon-geo.mjs's "no registry deal is ever unplaced" invariant.
  // Labeling it "everywhere"/nationwide instead would be false: it's a single
  // NYC attraction, not usable from Florida. Real fix needs an owner call
  // (does the Coupons tab's local/national split grow a real NYC metro, with
  // its own nearestMetro() radius, or does NYC intentionally stay
  // nationwide-only on this surface) rather than a guessed area string here.
  // The 4 place-card hooks above are unaffected — placePartnerPicks.js matches
  // by exact place name only and has no metro/area concept.
]);

