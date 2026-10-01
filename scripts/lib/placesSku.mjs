// scripts/lib/placesSku.mjs — Google's published Places (New) field → SKU table,
// shared by the guards that must DERIVE the billed SKU from the
// X-Goog-FieldMask a request actually carried (test-search-sku-accounting,
// test-enterprise-search-blocking). One table, so two guards cannot disagree
// about which tier a field bills at.
//
// ── Google's published field → SKU table (Places API New, data-fields page,
// read 2026-09-30). Field names are the X-Goog-FieldMask names minus "places.".
// An UNKNOWN field throws: guessing a tier is how a mask drifts into a new SKU
// unnoticed.
export const TEXT_IDS_ONLY = ["attributions", "consumerAlert", "id", "movedPlace", "movedPlaceId", "name", "nextPageToken"];
const PRO = ["accessibilityOptions", "addressComponents", "addressDescriptor", "adrFormatAddress", "businessStatus", "containingPlaces", "displayName", "entrances", "formattedAddress", "googleMapsLinks", "googleMapsTypeLabel", "googleMapsUri", "iconBackgroundColor", "iconMaskBaseUri", "location", "navigationPoints", "openingDate", "photos", "plusCode", "postalAddress", "primaryType", "primaryTypeDisplayName", "pureServiceAreaBusiness", "shortFormattedAddress", "subDestinations", "timeZone", "types", "utcOffsetMinutes", "viewport"];
const ENTERPRISE = ["currentOpeningHours", "currentSecondaryOpeningHours", "internationalPhoneNumber", "nationalPhoneNumber", "priceLevel", "priceRange", "rating", "regularOpeningHours", "regularSecondaryOpeningHours", "transitStation", "userRatingCount", "websiteUri"];
const ATMOSPHERE = ["allowsDogs", "curbsidePickup", "delivery", "dineIn", "editorialSummary", "evChargeAmenitySummary", "evChargeOptions", "fuelOptions", "generativeSummary", "goodForChildren", "goodForGroups", "goodForWatchingSports", "liveMusic", "menuForChildren", "neighborhoodSummary", "outdoorSeating", "parkingOptions", "paymentOptions", "reservable", "restroom", "reviewSummary", "reviews", "routingSummaries", "servesBeer", "servesBreakfast", "servesBrunch", "servesCocktails", "servesCoffee", "servesDessert", "servesDinner", "servesLunch", "servesVegetarianFood", "servesWine", "takeout"];
const RANK = { ids_only: 0, pro: 1, enterprise: 2, enterprise_atmosphere: 3 };
function tierOf(endpoint, field) {
  if (TEXT_IDS_ONLY.includes(field)) return endpoint === "text" ? "ids_only" : "pro"; // Nearby has no IDs-only SKU: id is Nearby Search Pro
  if (PRO.includes(field)) return "pro";
  if (ENTERPRISE.includes(field)) return "enterprise";
  if (ATMOSPHERE.includes(field)) return "enterprise_atmosphere";
  throw new Error(`unknown Places field "${field}" — add it from Google's data-fields table before trusting any SKU derived for it`);
}
export function billedSku(endpoint, mask) {
  const fields = String(mask || "").split(",").map((f) => f.trim().replace(/^places\./, "")).filter(Boolean);
  if (!fields.length) throw new Error("empty field mask");
  let top = "ids_only";
  for (const f of fields) { const t = tierOf(endpoint, f); if (RANK[t] > RANK[top]) top = t; }
  return (endpoint === "text" ? "text_" : "nearby_") + top;
}
