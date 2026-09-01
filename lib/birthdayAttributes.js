// Exact, first-party-verified Birthday venue attributes. These are deliberately
// keyed by Place ID: a chain-wide events page cannot prove that every room has
// private dining, a rooftop, or direct beach access.

const VERIFIED_AT = "2026-08-31";

const BIRTHDAY_ATTRIBUTES = new Map([
  ["ChIJy_kXMwA5w4gRrR3QiupGkCA", {
    privateDining: true,
    verifiedAt: VERIFIED_AT,
    source: "https://www.flemingssteakhouse.com/locations/fl/sarasota/private-dining",
  }],
  ["ChIJxepVxb04w4gR7b1DL9dOt8M", {
    privateDining: true,
    verifiedAt: VERIFIED_AT,
    source: "https://media.thecapitalgrille.com/en_us/images/marketing/tcg-8056-sarasota-infokit.pdf",
  }],
]);

export function birthdayAttributesFor(placeId) {
  const attributes = BIRTHDAY_ATTRIBUTES.get(String(placeId || ""));
  return attributes ? { ...attributes } : null;
}

