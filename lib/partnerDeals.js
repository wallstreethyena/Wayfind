// Short-lived, provider-verified attraction deals for the Coupons surface.
// No percentage is claimed because live provider pricing can move during the
// audit window. The card says only what remains true: a reduced/bundled price
// was verified, where it applies, and when Wayfind will automatically hide it
// unless the revenue audit verifies it again.
import { commerceHref } from "./commerce.js";

const deal = ({ offerId, provider, business, area, title, details, intents }) => Object.freeze({
  id: `cpn-partner-${offerId}`,
  business,
  area,
  title,
  details,
  code: null,
  url: commerceHref({ provider, offerId, surface: "coupons", contentId: offerId }),
  expires: "2026-08-08",
  verifiedOn: "2026-08-01",
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
]);

