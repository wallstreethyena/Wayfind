// lib/menuReserveSlots.js — Lane F, 2026-09-16.
//
// WHY THIS EXISTS. UnifiedBrowseCommerceRail ranks every card by Wayfind
// Score (`score`), and every MENU_PARTNER_OFFERS row (lib/menuPartnerOffers.js,
// hand-verified Tiqets/Klook/GoCity/TicketNetwork/CityPASS/WeGoTrip inventory
// with no wf_inventory placeId) has no score yet: quality10 is null, so score
// falls to the "never invent a number" -1 sentinel. A pure score sort puts
// every one of those rows dead last, and BOOKABLE_NEAR_LIMIT (50) then cuts
// them entirely on any busy chip that already has 50+ scored Viator
// experiences or UT deals — attractions:all, themeparks, family:all in
// Orlando measured well past that. The new inventory becomes invisible, not
// merely low-ranked.
//
// THE FIX IS A RESERVATION, NOT A RANK. This module does not touch, weight or
// invent a score for anything — it runs strictly AFTER the caller's own
// score sort, and it only decides WHERE (not WHETHER) a fixed, small number
// of menu rows land in the visible window. That is a deliberate, load-bearing
// choice:
//
//   RESERVATION IS BY SOURCE, NEVER BY PROVIDER OR PAYOUT. The rows eligible
//   for a reserved slot are identified purely by `row.source === "menu"` —
//   i.e. "this is verified registry inventory routed through
//   lib/menuPartnerOffers.js that the scorer has no Wayfind Score for yet",
//   never by which partner it is or what it pays. A GoCity row and a Tiqets
//   row compete for a reserved slot on the SAME terms (distance), and a
//   scored Viator/UT row is never displaced in favor of a higher-commission
//   partner — that would be exactly the "ranked by commission" rule this
//   lane was told never to introduce.
//
// ORDERING AMONG RESERVED ROWS IS DISTANCE, THE ONE FACT AVAILABLE FOR AN
// UNSCORED ROW. `distMi` is computed server-side in menuPartnerOffersFor()
// from the caller's own lat/lng — it is not a proxy for quality, it is simply
// the nearest verified inventory shown first among equals.
export function interleaveReserved(sorted, reserveCount, cadence) {
  const list = Array.isArray(sorted) ? sorted : [];
  if (!Number.isFinite(reserveCount) || reserveCount <= 0 || !Number.isFinite(cadence) || cadence <= 0) return list;

  const isMenu = (row) => !!row && row.source === "menu";
  const menuRows = list.filter(isMenu);
  if (!menuRows.length) return list;

  const scoredRows = list.filter((row) => !isMenu(row));
  const dist = (row) => (Number.isFinite(row?.distMi) ? row.distMi : Infinity);
  const reserved = menuRows.slice().sort((a, b) => dist(a) - dist(b)).slice(0, reserveCount);

  // The first `head` slots are the top scored cards, untouched — reservation
  // starts only once that head has been served, never displacing a top result.
  const head = Math.min(reserveCount, scoredRows.length);
  const out = [];
  let si = 0;
  let ri = 0;
  for (; si < head; si++) out.push(scoredRows[si]);

  let slot = 0;
  while (si < scoredRows.length || ri < reserved.length) {
    if (ri < reserved.length && slot % cadence === 0) {
      out.push(reserved[ri++]);
    } else if (si < scoredRows.length) {
      out.push(scoredRows[si++]);
    } else {
      out.push(reserved[ri++]);
    }
    slot++;
  }
  return out;
}
