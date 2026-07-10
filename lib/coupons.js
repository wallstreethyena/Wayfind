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
export const COUPONS = [
  // No live coupons loaded yet — paste deals to Claude and they ship here.
  // Example of a filled row (kept commented so nothing fake ever renders):
  // { id: "cpn-example-cafe-10", business: "Example Cafe", title: "10% off breakfast", details: "Weekdays before 11am. One per table.", code: "WAYFIND10", url: null, expires: "2026-09-30", area: "Parrish" },
];
