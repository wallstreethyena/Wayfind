// Guide stay rails. A guide listed here renders the SAME verified-hotel rail the
// event pages use (lib/eventStays.js selection, EventStayCards, /api/hotels/go),
// anchored on the guide's own coordinates. Opt-in per slug; delete a line to
// roll a guide back. Only hotels in lib/hotelBookingVerification.js are offered,
// so every card in the rail carries a verified Check rates link and a guide
// outside the verified market renders nothing.
import { isHotelBookingVerified } from "./hotelBookingVerification.js";

export const GUIDE_STAYS = Object.freeze({
  "things-to-do-sarasota": Object.freeze({ lat: 27.3364, lng: -82.5307, label: "Sarasota" }),
  "things-to-do-in-sarasota-florida": Object.freeze({ lat: 27.3364, lng: -82.5307, label: "Sarasota" }),
  "siesta-key-vs-lido-key": Object.freeze({ lat: 27.267, lng: -82.553, label: "Sarasota" }),
  "siesta-key-drum-circle": Object.freeze({ lat: 27.2658, lng: -82.5501, label: "Siesta Key" }),
  "pinecraft-sarasota-amish-village": Object.freeze({ lat: 27.3189, lng: -82.4959, label: "Sarasota" }),
  "st-armands-circle-restaurants": Object.freeze({ lat: 27.3188, lng: -82.5769, label: "Sarasota" }),
  "sarasota-restaurants": Object.freeze({ lat: 27.3364, lng: -82.5307, label: "Sarasota" }),
  "sarasota-half-price-dining": Object.freeze({ lat: 27.3364, lng: -82.5307, label: "Sarasota" }),
  "gulf-coast-brunch-and-date-night": Object.freeze({ lat: 27.3364, lng: -82.5307, label: "Sarasota" }),
  "things-to-do-in-bradenton-florida": Object.freeze({ lat: 27.4989, lng: -82.5748, label: "Bradenton" }),
  "anna-maria-island-day-trip": Object.freeze({ lat: 27.4989, lng: -82.7042, label: "Anna Maria Island" }),
  "robinson-preserve-bradenton": Object.freeze({ lat: 27.5131, lng: -82.6681, label: "Bradenton" }),
  "de-soto-national-memorial-bradenton": Object.freeze({ lat: 27.5236, lng: -82.6442, label: "Bradenton" }),
  "things-to-do-in-longboat-key-florida": Object.freeze({ lat: 27.395, lng: -82.642, label: "Longboat Key" }),
  "things-to-do-in-venice-florida": Object.freeze({ lat: 27.0998, lng: -82.4543, label: "Venice" }),
  "things-to-do-in-lakewood-ranch-florida": Object.freeze({ lat: 27.3948, lng: -82.437, label: "Lakewood Ranch" }),
  "things-to-do-in-ellenton-florida": Object.freeze({ lat: 27.5228, lng: -82.5276, label: "Ellenton" }),
});

export function guideStaysConfig(slug) {
  return Object.hasOwn(GUIDE_STAYS, slug) ? GUIDE_STAYS[slug] : null;
}

// Candidate filter handed to eventStays({ accept }).
export const acceptVerifiedHotel = (row) => isHotelBookingVerified({ id: String(row?.googlePlaceId || row?.id || "") });

// The rail's data, or null when nothing should render: no config for the slug,
// inventory unavailable, or zero qualifying hotels. `readStays(lat, lng)` is
// eventStays({ accept: acceptVerifiedHotel }) in production.
export async function guideStaysPlaces(slug, readStays) {
  const cfg = guideStaysConfig(slug);
  if (!cfg) return null;
  const { places, unavailable } = await readStays(cfg.lat, cfg.lng);
  if (unavailable || !places || !places.length) return null;
  return { cfg, places };
}
