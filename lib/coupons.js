// v5.07 — Wayfind Coupons. Owner-curated local deals: Gabe loads coupons here
// (through Claude) and they appear on the Coupons tab immediately on the next
// release. The tab ALSO merges rows from the Supabase `offers` table, so
// deals can be added from the dashboard without a deploy. Editorial rules,
// same as everything else on Wayfind: REAL offers only — never invent a code,
// a discount, or an expiration. An expired coupon disappears on its own.
//
// Shape:
//   id       — stable unique id ("cpn-" + slug). Saved coupons key off this.
//   business — the place offering the deal (shown big on the card)
//   title    — the deal itself ("10% off any two entrées")
//   details  — fine print worth knowing (optional)
//   code     — the code to show/copy at checkout (optional — some deals are
//              "mention Wayfind" or link-only)
//   url      — where to redeem/claim online (optional; opens in a NEW tab —
//              affiliate links welcome, tracking params included)
//   expires  — "YYYY-MM-DD" (optional; the card auto-hides after this date)
//   area     — town label so users know where it applies (optional)
//
// v6.17 additions (deals lifecycle, July 2026):
//   intents  — mood/experience keys (EXPERIENCES ids in app/home.js, e.g.
//              "outdoors", "familyfun") this deal surfaces under. Powers the
//              deals strip on those list pages. Optional.
//   match    — place-name variants Google may return, so the 🏷️ pill can
//              attach to the matching place card. Optional.
// Every deal here also lives in the project registry
// (claude/wayfind-deals-registry.md) with a scheduled deletion reminder —
// the code auto-hides on expiry; the robots clean up the data.
export const COUPONS = [
  { id: "cpn-discover-sarasota-local-20", business: "Discover Sarasota Tours", area: "Sarasota",
    title: "20% off any city tour", details: "Trolley, tiki-boat and walking tours. Locals' summer special — apply the code at checkout.",
    code: "LOCAL", url: "https://www.visitsarasota.com/deals/summer-special", expires: "2026-07-31",
    intents: ["outdoors", "familyfun"], match: ["Discover Sarasota Tours"] },

  { id: "cpn-zootampa-heroes-summer", business: "ZooTampa at Lowry Park", area: "Tampa",
    title: "Free summer admission for military & community heroes", details: "Active-duty U.S. military +3 dependents, plus Hillsborough County teachers and government employees. Valid ID required. Through Labor Day.",
    code: null, url: "https://zootampa.org/zootampa-honors-local-community-heroes-and-u-s-military-members-with-complimentary-summer-admission/", expires: "2026-09-07",
    intents: ["familyfun", "outdoors"], match: ["ZooTampa at Lowry Park", "ZooTampa"] },

  { id: "cpn-ringling-free-mondays", business: "The Ringling", area: "Sarasota",
    title: "Free admission every Monday", details: "Museum of Art, Bayfront Gardens and the Glass Pavilion are free on Mondays. Circus Museum and Ca' d'Zan are regular price. Register on arrival.",
    code: null, url: "https://www.ringling.org/tickets-admission/", expires: null,
    intents: ["familyfun", "cozyindoor", "outdoors"], match: ["The Ringling", "The John and Mable Ringling Museum of Art", "Ringling Museum of Art"] },

  { id: "cpn-ringling-bluestar-military", business: "The Ringling", area: "Sarasota",
    title: "Active-duty military free all summer", details: "Blue Star Museums: free admission with active military ID, through Labor Day.",
    code: null, url: "https://www.ringling.org/tickets-admission/", expires: "2026-09-07",
    intents: ["familyfun", "cozyindoor"], match: ["The Ringling", "The John and Mable Ringling Museum of Art", "Ringling Museum of Art"] },

  { id: "cpn-mote-military-free", business: "Mote Marine Laboratory & Aquarium", area: "Sarasota",
    title: "Active-duty military: free admission", details: "For the service member with a current active-duty U.S. military ID. Purchase in person on site.",
    code: null, url: "https://mote.org/aquarium/sea-visitor-information/pricing-faq/", expires: null,
    intents: ["familyfun", "cozyindoor"], match: ["Mote Marine Laboratory & Aquarium", "Mote Marine Laboratory", "Mote SEA", "Mote Marine Aquarium"] },

  { id: "cpn-marauders-thirsty-thursday", business: "Bradenton Marauders", area: "Bradenton",
    title: "Thirsty Thursday at LECOM Park", details: "Beer, soda and hot-dog specials at every Thursday home game, all season.",
    code: null, url: "https://www.milb.com/bradenton/tickets/promotions", expires: "2026-09-05",
    intents: ["nightout", "familyfun"], match: ["LECOM Park", "Bradenton Marauders"] },

  { id: "cpn-agave-bandido-taco-tuesday", business: "Agave Bandido", area: "Lakewood Ranch",
    title: "Taco Tuesday specials", details: "Weekly Taco Tuesday at the modern Mexican spot on Main Street.",
    code: null, url: "https://www.visitsarasota.com/special-offers-deals", expires: "2026-09-29",
    intents: ["eatnow"], match: ["Agave Bandido"] },

  { id: "cpn-sarasota-art-museum-second-sundays", business: "Sarasota Art Museum", area: "Sarasota",
    title: "Free Second Sundays", details: "Free admission on the second Sunday of every month.",
    code: null, url: "https://www.visitsarasota.com/special-offers-deals", expires: "2028-04-09",
    intents: ["cozyindoor", "familyfun", "hiddengems"], match: ["Sarasota Art Museum", "Sarasota Art Museum of Ringling College"] },

  // ── Affiliate deals (v6.17.1) — real Viator "Special Offer" discounts; the
  // links carry Wayfind's partner tracking (pid P00308545), so bookings pay a
  // commission at no cost to the user (disclosure already in the tab footer).
  // Viator promo end dates aren't published: expires is set to the next-but-one
  // Monday so the weekly deals audit re-verifies the discount and extends or
  // drops it. cta overrides the button label ("Claim deal" → "Book now").
  { id: "cpn-viator-manatee-walk-bradenton", business: "Manatee Watching Walking Tour", area: "Bradenton",
    title: "Manatee watching with guaranteed sighting — $16 (reg. $19)", details: "30-minute guided walk, 5.0★ (35 reviews). Free cancellation. Viator special offer — price at checkout.",
    code: null, url: "https://www.viator.com/tours/Sarasota/Guided-Manatee-Watching-With-Guaranteed-Manatee-Sighting/d25738-5560271P1?pid=P00308545&mcid=42383&medium=link", expires: "2026-07-27",
    cta: "Book now", intents: ["familyfun", "outdoors"], match: [] },

  { id: "cpn-viator-hydrocats-craigcat", business: "HydroCats", area: "Sarasota",
    title: "2-hour CraigCat sightseeing tour — $131 (reg. $146)", details: "Drive your own mini catamaran on Sarasota Bay, 5.0★ (366 reviews). Free cancellation. Viator special offer — price at checkout.",
    code: null, url: "https://www.viator.com/tours/Sarasota/2-Hr-CraigCat-Sightseeing-Tour/d25738-470176P1?pid=P00308545&mcid=42383&medium=link", expires: "2026-07-27",
    cta: "Book now", intents: ["outdoors", "datenight"], match: ["HydroCats"] },
];

// ── Helpers (v6.17) ─────────────────────────────────────────────────────────
// One live-rule everywhere: no expiry, or expiry today-or-later, local date.
// Same rule CouponsScreen applies; kept here so list pages and place cards
// can't drift from the tab.

export function couponIsLive(c, todayIso) {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  return !!(c && c.id && c.title && (!c.expires || String(c.expires).slice(0, 10) >= today));
}

export const liveCoupons = (todayIso) => COUPONS.filter((c) => couponIsLive(c, todayIso));

/** Live coupons tagged for a mood/experience key — soonest-ending first. */
export function couponsForIntent(intentId, todayIso) {
  if (!intentId) return [];
  return liveCoupons(todayIso)
    .filter((c) => Array.isArray(c.intents) && c.intents.includes(intentId))
    .sort((a, b) => String(a.expires || "9999").localeCompare(String(b.expires || "9999")));
}

const _cpnNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const _CPN_BY_NAME = (() => {
  const m = new Map();
  for (const c of COUPONS) {
    for (const n of [c.business, ...(Array.isArray(c.match) ? c.match : [])]) {
      const k = _cpnNorm(n);
      if (k && !m.has(k)) m.set(k, c);
    }
  }
  return m;
})();

/** The live coupon attached to a place name (exact normalized match), or null. */
export function couponForPlaceName(name, todayIso) {
  const c = _CPN_BY_NAME.get(_cpnNorm(name));
  return c && couponIsLive(c, todayIso) ? c : null;
}

/** "Ends Jul 31" / "Ends Apr 9, 2028" / null for open-ended offers. */
export function couponEndsLabel(c) {
  if (!c || !c.expires) return null;
  const [y, mo, d] = String(c.expires).slice(0, 10).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisYear = new Date().getFullYear();
  return "Ends " + M[mo - 1] + " " + d + (y !== thisYear ? ", " + y : "");
}

// ── Supabase `offers` row → coupon/offer shape (v6.17 schema fix) ───────────
// offers.sql defines coupon_code / affiliate_url / direct_url / offer_title /
// offer_description / expiration_date / city, but both consumers in home.js
// read code / url / title / description / expires — so dashboard-entered rows
// could never render. Normalize ONCE here; both loaders share it.
export function normalizeOfferRow(o) {
  if (!o) return null;
  const title = o.offer_title || o.title || o.deal || null;
  if (!title) return null;
  return {
    id: "offer:" + (o.id || o.google_place_id || title),
    google_place_id: o.google_place_id || null,
    normalized_business_name: o.normalized_business_name || _cpnNorm(o.business_name || o.name),
    business: o.business_name || o.name || "",
    title: String(title),
    description: o.offer_description || o.description || "",
    details: o.offer_description || o.description || "",
    offer_type: o.offer_type || null,
    source: o.source || null,
    code: o.coupon_code || o.code || null,
    url: o.affiliate_url || o.direct_url || o.url || null,
    cta: o.cta || null,
    expires: o.expiration_date || o.expires_at || o.expires || null,
    area: o.city || o.area || null,
  };
}
