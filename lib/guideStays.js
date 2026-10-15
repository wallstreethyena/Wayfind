// Guide stay rails. A guide listed here renders the SAME verified-hotel rail the
// event pages use (lib/eventStays.js selection, EventStayCards, /api/hotels/go),
// anchored on the guide's own coordinates. Opt-in per slug; delete a line to
// roll a guide back. Only hotels in lib/hotelBookingVerification.js are offered,
// so every card in the rail carries a verified Check rates link and a guide
// outside the verified market renders nothing.
import { isHotelBookingVerified } from "./hotelBookingVerification.js";

export const GUIDE_STAYS = Object.freeze({
  "things-to-do-sarasota": Object.freeze({ lat: 27.3364, lng: -82.5307, label: "Sarasota" }),
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
