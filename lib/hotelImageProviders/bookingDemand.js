// lib/hotelImageProviders/bookingDemand.js — Booking.com Demand API property
// photo adapter, built to lib/hotelImage.js's provider shape (2026-09-22).
//
// WHY THIS FILE EXISTS BUT NOTHING IMPORTS IT YET. Verified today: Booking's
// Demand API (POST /accommodations/details with extras: ["photos"]) does
// return real per-property photos, and Booking's developer permitted-use
// terms allow storing and hotlinking the returned photo URL in an <img> tag.
// But that permission is conditional: it applies ONLY to an approved
// Managed Affiliate Partner operating under a signed contract, it forbids
// downloading or re-hosting the image bytes (hotlink only), forbids
// altering the photo, and forbids caching price or availability alongside
// it. Wayfind is not an approved Managed Affiliate Partner today, so this
// adapter is NOT added to HOTEL_IMAGE_PROVIDERS in lib/hotelImage.js — see
// that file's header for the exact switch-on procedure once a contract
// exists.
//
// SHAPE AND SCOPE. This module does no fetching, no auth, no API-key
// handling, and makes no network call of any kind — the resolver ladder in
// lib/hotelImage.js runs synchronously inside card mappers and is not
// allowed to touch the network. The (future, contracted) server-side job
// that actually calls the Demand API lives elsewhere and pushes its results
// in here with setBookingDemandPhotos(); everything below only reads that
// already-fetched, in-memory map. A key never reaches this file, so a key
// can never leak from this file into a log or a URL.
//
// House rule: never log a place id or a photo ref/URL. Nothing here logs at
// all — a rejected identity or an empty map simply yields [].

let photosByPlaceId = new Map();

/**
 * Load an already-fetched placeId -> photos map (or plain object of the
 * same shape). Intended to be called once per fetch cycle by the future,
 * contracted server-side job that talks to the Demand API — never with a
 * live fetch from inside a request handler, and never with the API key or
 * response headers attached.
 * @param {Map<string, Array<{url:string,width:number,height?:number,attribution?:string}>>|Object} map
 */
export function setBookingDemandPhotos(map) {
  photosByPlaceId = map instanceof Map ? map : new Map(Object.entries(map || {}));
}

/** Test/ops escape hatch: drop back to the empty, no-op state. */
export function resetBookingDemandPhotos() {
  photosByPlaceId = new Map();
}

export const bookingDemandProvider = {
  id: "booking-demand",

  // The Booking for Developers page documenting permitted use of
  // accommodation content returned by the Demand API — storing and
  // hotlinking a photo URL is allowed there; downloading, re-hosting or
  // altering the image, and caching price/availability, is not. Verified
  // 2026-09-22.
  termsRef: "https://developers.booking.com/demand/docs/policies/using-content",

  // WHY FALSE. Booking's permitted-use terms gate independent display of
  // accommodation photos on being an APPROVED MANAGED AFFILIATE PARTNER
  // under a SIGNED CONTRACT — a status Wayfind does not hold today.
  // WHO MAY FLIP IT: only the Wayfind account/business owner, and only
  // after that contract is signed.
  // WHAT EVIDENCE TO RECORD: replace this comment, in the same commit that
  // flips the flag, with the signed contract's own reference (a dated
  // document id or URL to the executed agreement) — not a sales email, not
  // a support ticket, not this adapter's own termsRef alone. termsRef
  // documents what the public terms say; this evidence is proof Wayfind
  // has actually accepted them as a Managed Affiliate Partner.
  termsAllowIndependentUse: false,

  // WHY FALSE, ALWAYS. Booking's permitted-use terms forbid downloading or
  // re-hosting the image bytes under any circumstance — hotlinking the URL
  // is the only allowed use. Signing the partner contract changes
  // termsAllowIndependentUse above; it never changes this. A Booking photo
  // may never be copied into Wayfind's vault, contract or no contract.
  vaultAllowed: false,

  /**
   * Synchronous, in-memory only. Returns the photos already loaded for the
   * exact requested place id, or [] when there is no identity, no loaded
   * entry for it, or the map has never been populated. Makes no network
   * call and reads no API key.
   * @param {{placeId:string}} identity
   * @returns {Array<{url:string,width:number,height:number,placeId:string,attribution:string}>}
   */
  images(identity) {
    const placeId = identity && String(identity.placeId || "").trim();
    if (!placeId) return [];
    const list = photosByPlaceId.get(placeId);
    if (!Array.isArray(list)) return [];
    // Attribution is passed through, never fabricated here: if the loaded
    // record has none, this returns an image lib/hotelImage.js's own
    // validProviderImage will correctly refuse for lacking attribution,
    // rather than this adapter inventing text to get past that check.
    return list
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        url: String(p.url || ""),
        width: Number(p.width) || 0,
        height: Number(p.height) || 0,
        placeId,
        attribution: String(p.attribution || ""),
      }));
  },
};

export default bookingDemandProvider;
