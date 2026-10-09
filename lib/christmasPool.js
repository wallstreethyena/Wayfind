// lib/christmasPool.js: what counts as Christmas in Florida on Wayfind.
//
// Two owned sources, zero paid calls:
//   1. wf_events rows plus the verified registry (lib/christmasDiscoveries2026.js),
//      each carrying its rail, classified by lib/christmasIntentRails.js.
//   2. The PLACES below, all already in wf_inventory with a photo.
//
// Christmas v3 (2026-10-09): the place pool is the confirmed 2026 pop up bars
// only. The beach and manatee places left with their rails, and the garden
// "venue anchors" (a place card standing in for an undated event, with a
// "check the calendar" take) are gone: every lights, towns and shows card is
// now a dated, verified event.
import { CHRISTMAS_POPUP_BARS_2026, CHRISTMAS_POPUP_DATE_LINE, CHRISTMAS_CITY_POINTS } from "./christmasDiscoveries2026.js";

// place_id -> rail id.
export const CHRISTMAS_PLACE_RAIL = Object.freeze(Object.fromEntries(
  Object.keys(CHRISTMAS_POPUP_BARS_2026).map((id) => [id, "popup-bars"]),
));

// place_id -> the card line. The truth and nothing more: the season is
// confirmed on the brand's own 2026 list, the opening date is not out.
export const CHRISTMAS_PLACE_TAKES = Object.freeze(Object.fromEntries(
  // With the season chip (CHRISTMAS_POPUP_SEASON_CHIP) the card reads the whole
  // line; the brand is already in the title ("Miracle at ...").
  Object.keys(CHRISTMAS_POPUP_BARS_2026).map((id) => [id, CHRISTMAS_POPUP_DATE_LINE]),
));

// place_id -> the card title (the pop up's own name, not just the bar's).
export const CHRISTMAS_PLACE_TITLES = Object.freeze(Object.fromEntries(
  Object.entries(CHRISTMAS_POPUP_BARS_2026).map(([id, bar]) => [id, bar.title]),
));

export const CHRISTMAS_PLACE_IDS = Object.freeze(Object.keys(CHRISTMAS_PLACE_RAIL));

// Known duplicate pins (wf_inventory status EXCLUDED) that must never be pooled.
// Coquina Beach has three; the canonical row is ChIJ5eLMVXE9w4gR15l0tMZGkMY.
export const CHRISTMAS_KNOWN_DUPLICATE_IDS = Object.freeze([
  "ChIJV7hk7dQTw4gRNDR1PONlwis",
  "ChIJ4azy4NsTw4gRggI1e2ak_Rs",
  "ChIJPbX5AxsTw4gROkfgzEmV-5M",
]);

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
  if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return { lat: hit.lat, lng: hit.lng };
  // Second table: the Census internal point of the place (lib/christmasDiscoveries2026.js).
  const key = Object.keys(CHRISTMAS_CITY_POINTS).find((name) => name.toLowerCase() === want);
  return key ? { lat: CHRISTMAS_CITY_POINTS[key][0], lng: CHRISTMAS_CITY_POINTS[key][1] } : null;
}
