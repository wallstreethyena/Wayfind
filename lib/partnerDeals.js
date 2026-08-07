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
  deal({
    offerId: "tampa-deal-florida-aquarium",
    provider: "tiqets",
    business: "The Florida Aquarium",
    area: "Tampa",
    title: "Reduced-price aquarium admission",
    details: "Tiqets currently lists entry below the regular displayed price. Check the live price before clipping; the aquarium sits beside Channelside, Sparkman Wharf and the Riverwalk.",
    intents: ["familyfun", "cozyindoor", "outdoors"],
  }),
  deal({
    offerId: "tampa-deal-adventure-island",
    provider: "tiqets",
    expires: "2026-08-22",
    verifiedOn: "2026-08-05",
    business: "Adventure Island Tampa Bay",
    area: "Tampa",
    title: "Waterpark tickets and current bundles",
    details: "Compare the live single-park and multi-park options before buying—some combinations include dining or another Tampa attraction.",
    intents: ["familyfun", "outdoors"],
  }),
  deal({
    offerId: "orlando-deal-klook-pass",
    provider: "klook",
    business: "Klook Pass Orlando",
    area: "Orlando",
    title: "Bundle two, three or four Orlando attractions",
    details: "Useful when your shortlist already includes several paid attractions. Compare the included choices first; the pass is a value only when it matches the plan you already want.",
    intents: ["familyfun", "outdoors"],
  }),
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

