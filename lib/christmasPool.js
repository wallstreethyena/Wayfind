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
  // ── depth added 2026-10-08 (rails v2): each id SELECTed from wf_inventory,
  // OPERATIONAL, with a photo, name + coordinates checked in Florida.
  // beaches
  "ChIJFy96TuUPw4gRr3IUjLXDXfM": "beaches", // Bean Point Beach, Anna Maria
  "ChIJ1-Da3XpZw4gRyPAkVf4SSAo": "beaches", // Caspersen Beach, Venice
  "ChIJ1w15x0pYw4gRB3285it0Zcs": "beaches", // Manasota Key Beach
  "ChIJkcj8VHsz24gR0jr8KMzrAQE": "beaches", // Blind Pass Beach, Sanibel
  "ChIJsdM7g-8724gRtipnFCWzj6w": "beaches", // Bowditch Point Park, Fort Myers Beach
  "ChIJN5jQTl_9wogRv2AMrQmlQiw": "beaches", // Upham Beach Park, St. Pete Beach
  "ChIJo2MLQ1P3wogRVqgalPkZ5oY": "beaches", // North Clearwater Beach
  "ChIJ5bd5tDP3wogRkEnbA4NKOeM": "beaches", // Sand Key Beach
  "ChIJ--RbNpK02YgRuBwrQraWUZQ": "beaches", // Lummus Park, South Beach
  "ChIJndCi02ut2YgRgQiu2Kn9irk": "beaches", // Haulover Park
  "ChIJdXCZ0Sar2YgRKGhR0_LPvqo": "beaches", // Hollywood Beach Broadwalk
  "ChIJvdiEJyfi2IgR6_uH8RDc-54": "beaches", // South Beach Park, Boca Raton
  "ChIJyUNodGgd3ogRZStEhTD8fAs": "beaches", // Lori Wilson Park, Cocoa Beach
  "ChIJ9Ttuat8r54gR6gVjGIFFdp8": "beaches", // New Smyrna Beach
  "ChIJmQjpHhfa5ogRJL7JlN8q7Lc": "beaches", // Daytona Beach
  "ChIJ5eBzip5EkYgR3VtmSwco7tY": "beaches", // Henderson Beach State Park, Destin
  "ChIJO82XwLSHk4gREot8bwSy8Q8": "beaches", // St. Andrews State Park, Panama City Beach
  "ChIJ86kIPeDFkIgRdsrbssu0Jwk": "beaches", // Pensacola Beach Boardwalk
  // manatees
  "ChIJny8VYW-I7IgRDri7905NC2o": "manatees", // Edward Ball Wakulla Springs State Park
  "ChIJoST93cyn4IgRNqOfK8n1UKs": "manatees", // Manatee Sanctuary Park, Cape Canaveral
  "ChIJ5RBa1A604IgR0u0SUVMbBQE": "manatees", // Merritt Island NWR Visitor Center
  "ChIJr7ec9tEXw4gRwicCx3wfH2w": "manatees", // The Bishop Museum (Parker Manatee Rehabilitation Habitat)
  "ChIJBQ5SjLHGwogRL4X19g4J5tI": "manatees", // ZooTampa (David A. Straz Jr. Manatee Critical Care Center)
  // nights-out venue anchors
  "ChIJmToCpQ4J3YgRof6hhxcoTIM": "nights-out", // Bok Tower Gardens
  "ChIJCRCYGrx654gR3G9qoVbWlpY": "nights-out", // Harry P. Leu Gardens
  "ChIJu_e4BnTI2YgREAOg3GxMK8g": "nights-out", // Fairchild Tropical Botanic Garden
  "ChIJE5jqT1222YgR4STdDoStYPg": "nights-out", // Vizcaya Museum & Gardens
  "ChIJV5IKfmXhwogRV3X8VCd713A": "nights-out", // Sunken Gardens, St. Petersburg
  "ChIJa-cq-ENf3ogRtZaeT-CKgx0": "nights-out", // McKee Botanical Garden, Vero Beach
  "ChIJu3hNU-N654gR0x0I9_3iNvc": "nights-out", // Lake Eola Park, Orlando
  "ChIJlRUlG4nEwogRJOgu0Hf2n54": "nights-out", // Curtis Hixon Waterfront Park, Tampa
  "ChIJX-E766nhwogR8u_Re6nJTyk": "nights-out", // St. Pete Pier
  "ChIJVVUNg8JB24gRo5VjblNO_c8": "nights-out", // Edison & Ford Winter Estates
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
  "ChIJFy96TuUPw4gRr3IUjLXDXfM": "The quiet northern tip of Anna Maria Island, where the Gulf meets Tampa Bay.",
  "ChIJ1-Da3XpZw4gRyPAkVf4SSAo": "A natural Venice beach known for searching the sand for fossilized shark teeth.",
  "ChIJ1w15x0pYw4gRB3285it0Zcs": "A long, uncrowded Gulf beach on Manasota Key near Englewood.",
  "ChIJkcj8VHsz24gR0jr8KMzrAQE": "The pass between Sanibel and Captiva, a favorite stop for shells and sunsets.",
  "ChIJsdM7g-8724gRtipnFCWzj6w": "A park at the north tip of Fort Myers Beach with bay and Gulf views.",
  "ChIJN5jQTl_9wogRv2AMrQmlQiw": "A wide public beach on St. Pete Beach with a calm stretch of Gulf sand.",
  "ChIJo2MLQ1P3wogRVqgalPkZ5oY": "The quieter north end of Clearwater Beach, away from the busy pier area.",
  "ChIJ5bd5tDP3wogRkEnbA4NKOeM": "A county park beach just south of Clearwater Beach with a long, open shoreline.",
  "ChIJ--RbNpK02YgRuBwrQraWUZQ": "The classic South Beach stretch along Ocean Drive in Miami Beach.",
  "ChIJndCi02ut2YgRgQiu2Kn9irk": "A big Miami Dade beach park with an inlet, picnic areas and a long shoreline.",
  "ChIJdXCZ0Sar2YgRKGhR0_LPvqo": "A beachfront promenade in Hollywood made for an easy winter walk by the ocean.",
  "ChIJvdiEJyfi2IgR6_uH8RDc-54": "A Boca Raton oceanfront park with a boardwalk over the dunes.",
  "ChIJyUNodGgd3ogRZStEhTD8fAs": "A Cocoa Beach oceanfront park with a boardwalk through coastal hammock to the sand.",
  "ChIJ9Ttuat8r54gR6gVjGIFFdp8": "A laid back Atlantic beach town south of Daytona with a long, flat shoreline.",
  "ChIJmQjpHhfa5ogRJL7JlN8q7Lc": "Daytona's famously wide, hard packed beach along the Atlantic.",
  "ChIJ5eBzip5EkYgR3VtmSwco7tY": "A Destin state park with white sand dunes and emerald Gulf water.",
  "ChIJO82XwLSHk4gREot8bwSy8Q8": "A Panama City Beach state park with Gulf beaches, a jetty and nature trails.",
  "ChIJ86kIPeDFkIgRdsrbssu0Jwk": "The boardwalk at Pensacola Beach, with sugar white sand right next to it.",
  "ChIJny8VYW-I7IgRDri7905NC2o": "A huge spring south of Tallahassee where manatees are often seen in the cooler months; the river boat tour is the easiest way to look.",
  "ChIJoST93cyn4IgRNqOfK8n1UKs": "A small Cape Canaveral park on the Banana River where manatees are often spotted from the shore.",
  "ChIJ5RBa1A604IgR0u0SUVMbBQE": "The refuge's visitor center; the Haulover Canal manatee observation deck is inside the refuge.",
  "ChIJr7ec9tEXw4gRwicCx3wfH2w": "A Bradenton museum with the Parker Manatee Rehabilitation Habitat, where rescued manatees recover.",
  "ChIJBQ5SjLHGwogRL4X19g4J5tI": "Tampa's zoo runs a manatee critical care center, and you can watch recovering manatees there.",
  "ChIJmToCpQ4J3YgRof6hhxcoTIM": "Lake Wales gardens around a singing tower; check the garden's calendar for its holiday season events.",
  "ChIJCRCYGrx654gR3G9qoVbWlpY": "Orlando's botanical garden; check the garden's calendar for its holiday evenings.",
  "ChIJu_e4BnTI2YgREAOg3GxMK8g": "Miami's big tropical botanic garden; check its calendar for holiday season nights.",
  "ChIJE5jqT1222YgR4STdDoStYPg": "A bayfront Miami villa and gardens; check the museum's calendar for holiday programs.",
  "ChIJV5IKfmXhwogRV3X8VCd713A": "A century old St. Petersburg garden; check its calendar for holiday evenings.",
  "ChIJa-cq-ENf3ogRtZaeT-CKgx0": "A historic Vero Beach garden; check its calendar for holiday season events.",
  "ChIJu3hNU-N654gR0x0I9_3iNvc": "Downtown Orlando's lake park, an easy evening walk around the water and the lit fountain.",
  "ChIJlRUlG4nEwogRJOgu0Hf2n54": "Downtown Tampa's riverfront park on the Riverwalk; check the city calendar for holiday events.",
  "ChIJX-E766nhwogR8u_Re6nJTyk": "St. Petersburg's waterfront pier, an easy evening walk with views back to the downtown skyline.",
  "ChIJVVUNg8JB24gRo5VjblNO_c8": "Thomas Edison's and Henry Ford's winter homes in Fort Myers; check the estates' calendar for holiday nights.",
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
import { COVERED_CITIES } from "./landingCities.js";

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

// ── Venue identity for events whose row lacks a place_id or coordinates ─────
// event_id -> the venue's wf_inventory place_id, the way Fall does with
// FALL_EVENT_VENUE_PLACE_IDS. Each id was matched on exact venue name AND city
// AND coordinates against wf_inventory (2026-10-08). Ambiguous venues are left
// OUT on purpose (Tampa Riverwalk has three same name rows, John's Pass has
// three, a route like "Boca Ciega Bay" is water, not a venue).
export const CHRISTMAS_EVENT_VENUE_PLACE_IDS = Object.freeze({
  "seaworld-orlando-christmas-2026": "ChIJfyPWjCh-54gR1SvWozmef5k", // SeaWorld Orlando
  "universal-orlando-holidays-2026": "ChIJvRBCrN9-54gRGZuuaCLGrQE", // Universal Orlando Resort
  "legoland-fl-holidays-2026": "ChIJ38rlfogN3YgRGic46M9dbLw", // LEGOLAND Florida Resort, Winter Haven
  "christmas-at-gaylord-palms-2026": "ChIJl0CYCGZ_3YgRL05pG5wZSsE", // Gaylord Palms, Kissimmee
  "christmas-town-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag", // Busch Gardens Tampa Bay
  "zootampa-christmas-wild-2026": "ChIJBQ5SjLHGwogRL4X19g4J5tI", // ZooTampa at Lowry Park
  "selby-lights-in-bloom-2026": "ChIJPTvxtmpAw4gReToYD5mTNwE", // Marie Selby Botanical Gardens, Sarasota
  "naples-night-lights-2026": "ChIJlcQil-Pj2ogRZXbB55ldZcQ", // Naples Botanical Garden
  "pinecrest-nights-of-lights-2026": "ChIJuyCMUy3G2YgRyrGn93iiGoM", // Pinecrest Gardens
  "edison-and-ford-holiday-nights-2026": "ChIJVVUNg8JB24gRo5VjblNO_c8", // Edison & Ford Winter Estates, Fort Myers
  "enchant-stpete-2026": "ChIJkXdv95vhwogR3e84WZCqrJ4", // Tropicana Field, St. Petersburg
  "light-up-the-holidays-2026": "ChIJ0XiHxYJx54gRpLzDNEGdyV0", // Cranes Roost Park, Altamonte Springs
  "lights-4-hope-drive-thru-light-show-2026": "ChIJ9929-6Eo2YgRmS4cjSjIrvI", // Okeeheelee Park, West Palm Beach
  "holiday-lights-in-largo-central-park-2026": "ChIJE7CJBHv6wogRgU_CnoymVIY", // Largo Central Park
  "jacksonville-light-boat-parade-2026": "ChIJCRW-9SK35YgRwOMNBWLdzRI", // Southbank Riverwalk (named viewing venue, as in the guide)
  // rails v2 (2026-10-08), SELECT verified:
  "tampa-riverwalk-boat-parade-2026": "ChIJxYFS48fFwogRHog4kPPOB5c", // Tampa Riverwalk, the downtown row (27.9476,-82.4616, metro tampa); the other two same name rows are skipped
  "treasure-island-holiday-lighted-boat-parade-2026": "ChIJQZMMfVP8wogRDILOvqAQOeA", // John's Pass, the organizer's named end point
  "kissimmee-festival-of-lights-parade-2026": "ChIJY9d2-LiF3YgRa9P7VNGFA68", // Kissimmee Lakefront Park, 201 Lakeview Dr (the event's own address)
  "clearwater-holiday-lighted-boat-parade-2026": "ChIJnW4wY-TxwogRQku5XIBxGao", // The BayCare Sound at Coachman Park, on the organizer's route
  "boca-ciega-yacht-club-lighted-christmas-boat-parade-2026": "ChIJe2BjEpziwogRZ4IPOMe7ZT8", // Bert and Walter Williams Pier, Gulfport, on the organizer's route
});

export const CHRISTMAS_VENUE_PLACE_IDS = Object.freeze([...new Set(Object.values(CHRISTMAS_EVENT_VENUE_PLACE_IDS))]);

// PURE. Fill a missing place_id from the map and missing lat/lng from the
// venue's inventory row. Never overwrites a value the event already has and
// never invents a coordinate: no inventory row, no coordinates.
export function enrichChristmasEvent(event, inventoryById = new Map()) {
  if (!event) return event;
  const id = event.event_id || event.id;
  const place_id = event.place_id || CHRISTMAS_EVENT_VENUE_PLACE_IDS[id] || null;
  const row = place_id ? (inventoryById.get(place_id) || null) : null;
  const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  let lat = has(event.lat) ? event.lat : (row && has(row.lat) ? row.lat : event.lat);
  let lng = has(event.lng) ? event.lng : (row && has(row.lng) ? row.lng : event.lng);
  let approxLocation = false;
  // Last rung: the city's vetted centre (lib/landingCities.js COVERED_CITIES),
  // only on an exact Florida city name match, and marked approximate so the
  // card never claims an exact distance. Never invented, never another city.
  if (!(has(lat) && has(lng))) {
    const city = christmasCityCentre(event.city, event.state);
    if (city) { lat = city.lat; lng = city.lng; approxLocation = true; }
  }
  return { ...event, place_id, lat, lng, ...(approxLocation ? { approxLocation: true } : {}) };
}

export function christmasCityCentre(cityName, state = "FL") {
  const want = String(cityName || "").trim().toLowerCase();
  if (!want || (state && String(state).toUpperCase() !== "FL")) return null;
  const hit = Object.values(COVERED_CITIES).find((c) => c && c.state === "FL" && String(c.name).toLowerCase() === want);
  return hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng) ? { lat: hit.lat, lng: hit.lng } : null;
}
