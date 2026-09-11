// Hotel booking links always enter Wayfind through /api/hotels/go. The route
// builds both outbound URLs from fixed hosts, so request data can describe a
// hotel but can never choose a redirect destination.

export const HOTEL_REDIRECT_FALLBACK = "/?go=hotels";

const BOOKING_SEARCH = "https://www.booking.com/searchresults.html";
const STAY22_ALLEZ_BOOKING = "https://www.stay22.com/allez/booking";
const STAY22_AID = "wayfindllc";

const LIMITS = Object.freeze({
  name: 250,
  address: 500,
});

function boundedText(value, max) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : null;
}

export function normalizedHotelLocation({ name, address, lat, lng } = {}) {
  const safeName = boundedText(name, LIMITS.name);
  const safeAddress = boundedText(address, LIMITS.address);
  if (!safeName || !safeAddress) return null;

  const hasLat = lat !== undefined && lat !== null && String(lat).trim() !== "";
  const hasLng = lng !== undefined && lng !== null && String(lng).trim() !== "";
  if (hasLat !== hasLng) return null;

  let safeLat = null;
  let safeLng = null;
  if (hasLat) {
    safeLat = Number(lat);
    safeLng = Number(lng);
    if (!Number.isFinite(safeLat) || safeLat < -90 || safeLat > 90 ||
        !Number.isFinite(safeLng) || safeLng < -180 || safeLng > 180) return null;
  }

  return { name: safeName, address: safeAddress, lat: safeLat, lng: safeLng };
}

export function bookingHotelSearchUrl(location) {
  const hotel = normalizedHotelLocation(location);
  if (!hotel) return null;
  const url = new URL(BOOKING_SEARCH);
  url.searchParams.set("ss", `${hotel.name}, ${hotel.address}`);
  return url.toString();
}

export function stay22HotelRedirectUrl(location, clickId) {
  const bookingUrl = bookingHotelSearchUrl(location);
  const campaign = String(clickId || "").trim();
  if (!bookingUrl || !/^[A-Za-z0-9_-]{8,64}$/.test(campaign)) return null;

  const url = new URL(STAY22_ALLEZ_BOOKING);
  url.searchParams.set("aid", STAY22_AID);
  url.searchParams.set("link", bookingUrl);
  url.searchParams.set("campaign", campaign);
  return url.toString();
}
