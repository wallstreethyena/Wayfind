// lib/christmasPool.js: what counts as Christmas in Florida on Wayfind.
//
// Owner-approved 2026-10-08. Two owned sources, zero paid calls:
//   1. wf_events rows, classified by lib/christmasIntentRails.js.
//   2. The curated PLACES below, all already in wf_inventory with a photo.
//      Each id was checked to be a real Florida place (the Venice in
//      California is deliberately not here).
//
// Takes are one honest line on why go. No prices, no dashes, and no promise
// of a sighting: manatees gather in warm water refuges roughly mid November
// through March (FWC and Florida State Parks), and nobody can guarantee one.

export const CHRISTMAS_RAIL_IDS = Object.freeze(["beaches", "theme-parks", "nights-out", "manatees", "boat-parades"]);

// place_id -> rail id. Theme parks and boat parades are events only.
export const CHRISTMAS_PLACE_RAIL = Object.freeze({
  // beaches
  "ChIJh8tXh-FBw4gR9kFzfZN_g60": "beaches", // Siesta Beach
  "ChIJQR0CdIhqw4gR-BqidycQm8o": "beaches", // Lido Key Beach
  "ChIJV7hk7dQTw4gRNDR1PONlwis": "beaches", // Coquina Beach
  "ChIJg7BBe7URw4gRIQTacN1Cla8": "beaches", // Manatee Public Beach
  "ChIJgwiM83gFw4gRZQbHiDUoSIE": "beaches", // Fort De Soto Beach
  "ChIJ2wMEgdUCw4gRWcUhdrwmyVg": "beaches", // Pass-a-Grille Beach
  "ChIJOxaHOSX9wogRT6_58s6LWOY": "beaches", // Treasure Island Beach
  "ChIJp6kyPa1Dw4gR5BhsSYE8pdo": "beaches", // Turtle Beach
  "ChIJPfHzt4Nbw4gReInyfaTUn2Y": "beaches", // Nokomis Beach
  "ChIJ_4R4dXj0wogRhGK2MtUmBjI": "beaches", // Honeymoon Island State Park
  "ChIJEU6v8Zgz24gRNkuw0EtKDt8": "beaches", // Bowman's Beach
  "ChIJu0jFtWc924gRf_9YuPnSc2w": "beaches", // Lovers Key State Park
  "ChIJlb2_qywf24gRFYBsNGXcHW0": "beaches", // Delnor-Wiggins Pass State Park
  "ChIJxVcTIQ7i0IgRgYa6c5TNrgk": "beaches", // Bahia Honda State Park
  "ChIJYxGtrzGx0YgRO0FndRyfyLs": "beaches", // Smathers Beach
  "ChIJT6PHOUbK2YgRamANgVMeFqk": "beaches", // Bill Baggs Cape Florida State Park
  "ChIJARLTeoy12YgRWrhf9BwKLXU": "beaches", // Crandon Park
  // manatees
  "ChIJjZq3rbFB6IgRb6e1zyAKbg4": "manatees", // Three Sisters Springs
  "ChIJyYEUav8P54gRatuv_zQzm20": "manatees", // Blue Spring State Park
  "ChIJpUJtM-_ZwogROGyfAWFNelo": "manatees", // Manatee Viewing Center (Apollo Beach)
  "ChIJTTHiI8w_6IgR89hvVjSS-vc": "manatees", // Ellie Schiller Homosassa Springs Wildlife State Park
  "ChIJf9MKQU3U2IgR0Rp4MD467xw": "manatees", // Manatee Lagoon
  "ChIJa1kHd4Vp24gRj7H2MiIoSwo": "manatees", // Manatee Park (Fort Myers)
  "ChIJyefyOo4f6YgR98DvEw2xLgA": "manatees", // Fanning Springs State Park
  // nights-out venue anchors (a place card shows only when no dated event card for the same venue is present)
  "ChIJPTvxtmpAw4gReToYD5mTNwE": "nights-out", // Selby Gardens
  "ChIJlcQil-Pj2ogRZXbB55ldZcQ": "nights-out", // Naples Botanical Garden
  "ChIJuyCMUy3G2YgRyrGn93iiGoM": "nights-out", // Pinecrest Gardens
  "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8": "nights-out", // St. Armands Circle
  "ChIJ-0qgNoF_3YgRg3Lh7xHDooU": "nights-out", // Disney Springs
});

// place_id -> one line on why go.
export const CHRISTMAS_PLACE_TAKES = Object.freeze({
  "ChIJh8tXh-FBw4gR9kFzfZN_g60": "Soft white quartz sand and calm Gulf water make it an easy winter beach walk.",
  "ChIJQR0CdIhqw4gR-BqidycQm8o": "A wide public Gulf beach a short drive from the shops and restaurants of St. Armands Circle.",
  "ChIJV7hk7dQTw4gRNDR1PONlwis": "Shady Australian pines, picnic tables and a long Gulf shoreline at the south end of Anna Maria Island.",
  "ChIJg7BBe7URw4gRIQTacN1Cla8": "Anna Maria Island's Holmes Beach public beach, with Gulf sunsets and easy walking along the sand.",
  "ChIJgwiM83gFw4gRZQbHiDUoSIE": "Several miles of Gulf shoreline inside a county park, with plenty of room to spread out.",
  "ChIJ2wMEgdUCw4gRWcUhdrwmyVg": "A historic beach town at the south end of St. Pete Beach, with sunset views at the end of the road.",
  "ChIJOxaHOSX9wogRT6_58s6LWOY": "A broad Gulf beach in Pinellas County with plenty of sand for a winter stroll.",
  "ChIJp6kyPa1Dw4gR5BhsSYE8pdo": "A quieter Siesta Key beach at the south end of the island, away from the village crowds.",
  "ChIJPfHzt4Nbw4gReInyfaTUn2Y": "A Casey Key beach near Venice with a long, easy strip of sand to walk.",
  "ChIJ_4R4dXj0wogRhGK2MtUmBjI": "State park beaches and nature trails north of Clearwater, with Gulf views and shorebirds.",
  "ChIJEU6v8Zgz24gRNkuw0EtKDt8": "Sanibel's natural, quieter beach, a favorite for shelling.",
  "ChIJu0jFtWc924gRf_9YuPnSc2w": "A barrier island state park near Fort Myers Beach with sand, kayak trails and wildlife.",
  "ChIJlb2_qywf24gRFYBsNGXcHW0": "A Naples state park with a wide Gulf beach and a pass for watching boats and birds.",
  "ChIJxVcTIQ7i0IgRgYa6c5TNrgk": "A Florida Keys state park with clear turquoise water and a view of the old Bahia Honda bridge.",
  "ChIJYxGtrzGx0YgRO0FndRyfyLs": "Key West's longest public beach, easy to pair with a walk into Old Town.",
  "ChIJT6PHOUbK2YgRamANgVMeFqk": "A Key Biscayne state park with a beach, a historic lighthouse and Miami skyline views.",
  "ChIJARLTeoy12YgRWrhf9BwKLXU": "A Key Biscayne beach park with a long, calm shoreline close to Miami.",
  "ChIJjZq3rbFB6IgRb6e1zyAKbg4": "Warm spring water draws manatees in cooler months, and boardwalks give you a look from above.",
  "ChIJyYEUav8P54gRatuv_zQzm20": "A winter manatee refuge: the spring run stays warm when the St. Johns River cools.",
  "ChIJpUJtM-_ZwogROGyfAWFNelo": "Warm water from the power station draws manatees in cold weather, and walkways overlook the canal.",
  "ChIJTTHiI8w_6IgR89hvVjSS-vc": "An underwater observatory looks into the spring, and wild manatees can use the warm water in cooler months.",
  "ChIJf9MKQU3U2IgR0Rp4MD467xw": "A viewing center beside a warm water outflow that attracts manatees in winter.",
  "ChIJa1kHd4Vp24gRj7H2MiIoSwo": "A Lee County park beside warm power plant water, with viewing platforms for manatee watching in winter.",
  "ChIJyefyOo4f6YgR98DvEw2xLgA": "A spring on the Suwannee River where manatees can move in when the river turns cold.",
  "ChIJPTvxtmpAw4gReToYD5mTNwE": "A bayfront botanical garden in downtown Sarasota that dresses up the grounds for the holidays.",
  "ChIJlcQil-Pj2ogRZXbB55ldZcQ": "A tropical botanical garden in Naples; check the garden's calendar for its holiday evenings.",
  "ChIJuyCMUy3G2YgRyrGn93iiGoM": "A Pinecrest garden in South Miami with shaded paths and a lake, with seasonal events through the year.",
  "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8": "Sarasota's circle of shops and restaurants, dressed in holiday lights and decorations in December.",
  "ChIJ-0qgNoF_3YgRg3Lh7xHDooU": "Orlando's waterfront shopping district, with holiday decorations and a lit Christmas tree.",
});

// Theme park events. event_id -> always the theme-parks rail.
export const CHRISTMAS_THEME_PARK_EVENT_IDS = Object.freeze([
  "mvmcp-2026",
  "epcot-festival-holidays-2026",
  "universal-orlando-holidays-2026",
  "christmas-town-2026",
  "seaworld-orlando-christmas-2026",
  "legoland-fl-holidays-2026",
  "christmas-at-gaylord-palms-2026",
]);

export const CHRISTMAS_MANATEE_EVENT_IDS = Object.freeze(["crystal-river-manatee-season-2026"]);

export const CHRISTMAS_PLACE_IDS = Object.freeze(Object.keys(CHRISTMAS_PLACE_RAIL));

// ── Affiliate ticket CTA (same law as Fall) ─────────────────────────────────
// Ticketed events carry the partner CTA, always through /api/commerce/go and
// never the raw affiliate URL. Undercover Tourist entries are gated on their
// wf_deals health row (only link_ok === false or active === false is dead).
import { EVENT_TICKET_DEALS, eventTicketDeal, eventTicketCta } from "./eventTicketDeals.js";

export const CHRISTMAS_TICKET_SURFACE = "christmas_intent_rail";

// wf_deals ids to bulk-read for health, UT entries only (they carry a `deal` int).
export const CHRISTMAS_TICKET_DEAL_IDS = Object.freeze(
  [...new Set(Object.values(EVENT_TICKET_DEALS).filter((entry) => entry && "deal" in entry).map((entry) => entry.deal))],
);

// byDealId: Map(deal id -> servable wf_deals row). Returns the CTA or null.
export function christmasEventTicket(eventId, byDealId = new Map()) {
  const entry = eventTicketDeal(eventId);
  if (!entry) return null;
  return eventTicketCta(eventId, {
    surface: CHRISTMAS_TICKET_SURFACE,
    liveDeal: entry.provider === "undercover_tourist" ? (byDealId.get(entry.offerId) || null) : undefined,
  });
}
