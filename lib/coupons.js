// v5.33 — Wayfind Coupons. Owner-curated, source-verified deals.
//
// These render in the bottom Coupons tab and are merged with live rows from the
// Supabase `offers` table. Never add an offer without checking the business's
// official source. Expired dated offers disappear automatically.
//
// Shape:
//   id       — stable unique id ("cpn-" + slug)
//   business — the place offering the deal
//   title    — the deal shown on the card
//   details  — eligibility and fine print
//   code     — checkout code, when one exists
//   url      — official redemption/source page
//   expires  — "YYYY-MM-DD"; omit only for ongoing offers with no stated end
//   area     — where the offer applies
export const COUPONS = [
  {
    id: "cpn-wendys-500-bonus-points-jul-2026",
    business: "Wendy's",
    title: "500 bonus Rewards points",
    details: "Make three purchases of $10 or more by July 19. Wendy's app and account required. Participating U.S. locations; delivery orders excluded.",
    code: null,
    url: "https://www.wendys.com/",
    expires: "2026-07-19",
    area: "Participating U.S. locations",
  },
  {
    id: "cpn-taco-bell-locos-taco-jul-2026",
    business: "Taco Bell",
    title: "Unlock a taco after your first L.O.C.O.S. play",
    details: "Taco Bell Rewards membership and the Taco Bell app are required. Offer availability and promotion terms apply.",
    code: null,
    url: "https://www.tacobell.com/newsroom/taco-bell-launches-locos",
    expires: "2026-07-13",
    area: "Participating locations",
  },
  {
    id: "cpn-olive-garden-six-dollar-take-home",
    business: "Olive Garden",
    title: "$6 Take Home entrée",
    details: "Purchase an entrée and add an eligible chilled Take Home entrée. Participating locations only; selection, substitution, and quantity limits apply. Prices may vary.",
    code: null,
    url: "https://www.olivegarden.com/specials/take-home-offer",
    area: "Participating U.S. and Canadian locations",
  },
  {
    id: "cpn-culvers-journey-to-delicious-2026",
    business: "Culver's",
    title: "Journey to Delicious rewards",
    details: "Delicious Rewards membership and eligible challenge purchases required. Complete three challenges for a fountain drink or six for a scoop of frozen custard.",
    code: null,
    url: "https://www.culvers.com/journey-to-delicious",
    expires: "2026-08-02",
    area: "Eligible participating locations",
  },
  {
    id: "cpn-publix-club-five-off-twenty-2026",
    business: "Publix",
    title: "$5 off your next purchase of $20 or more",
    details: "For new Club Publix members. Account-linked redemption; signup terms and restrictions apply.",
    code: null,
    url: "https://www.publix.com/savings/select-store",
    expires: "2026-12-31",
    area: "Participating Publix stores",
  },
];
