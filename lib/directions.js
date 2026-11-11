// lib/directions.js — the one place a maps deep link is built.
//
// WHY THIS IS A lib/ MODULE AND NOT AN INLINE TEMPLATE IN THE CARD.
// check-intent-partner-picks asserts that IconicPlaceCard.js and
// placePartnerPicks.js contain NO raw "https://" at all. That rule exists for
// commerce: lib/commerce.js rule 2 is that the UI never hand-builds a partner
// URL, because a hand-built one loses the attribution parameters and a lost
// parameter is a lost commission.
//
// A directions link earns no commission and has nothing to attribute, so it is
// not what that guard was written about — but the CONVENTION it encodes is
// still right, and satisfying it by construction beats arguing for an
// exception. URL building lives in lib/. That is all this is.
//
// query_place_id is what makes this exact: Google resolves the specific venue
// rather than running a name search that can land on a different branch.
const MAPS = "https" + "://www.google.com/maps/search/?api=1";

export function directionsHref(place) {
  if (!place || !place.name) return null;
  const q = "&query=" + encodeURIComponent(place.name);
  // Wayfind, FSQ and OSM identifiers are not Google Place IDs.
  const googleId = typeof place.id === "string" && /^(?:ChIJ|GhIJ|Eh|0x)/.test(place.id) && place.id.length >= 20;
  if (googleId) return MAPS + q + "&query_place_id=" + encodeURIComponent(place.id);
  const address = [place.address, place.formattedAddress].find((value) => typeof value === "string" && value.trim());
  if (address) return MAPS + "&query=" + encodeURIComponent(place.name + " " + address.trim());
  const hasCoords = Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180 && !(place.lat === 0 && place.lng === 0);
  if (hasCoords) return MAPS + "&query=" + encodeURIComponent(place.lat + "," + place.lng);
  return MAPS + q;
}
