/**
 * Cirque Italia — official-page pack only. No Places. No invented awards.
 *
 * Official: https://cirqueitalia.com/
 * Aquatic Spectacular, custom 35,000-gallon water stage under a traveling tent,
 * rain curtains and fountain jets. Founded 2012, Manuel Rebecchi.
 * HQ 2903 Ninth St W, Bradenton FL 34205; legal 306 Whitfield Ave, Sarasota FL 34243.
 * Box 941-704-8572.
 *
 * No current Sarasota/Bradenton tent on official pages or /Tickets
 * (Metropolis MN/WI, Atlantis PA/NJ/NH, Nautilus AB, Paranormal other states).
 * Last official Gulf-coast tent: Gold Unit Palmetto FL Jan 3–6 2025 at Riviera Dunes
 * — past, not current. Do not send people to HQ.
 *
 * Live sitemap has 758 /places/ChIJ… and zero cirque/italia/circus hits.
 * Repo atlas / owner batches / editorial-cards have no Cirque Italia ChIJ.
 * Until a public-tent Place ID is listed below, why stays EMPTY.
 */

const CIRQUE_ITALIA_NAME_RE = /\bcirque\s+italia\b/i;
const NOT_CIRQUE_ITALIA_RE = /cirque\s+du\s+soleil|st\.?\s*armand|circus\s+museum|john\s+and\s+mable/i;

/** Public-performance pins only. Empty until a tent ChIJ is identified. */
export const CIRQUE_ITALIA_PUBLIC_TENT_PLACE_IDS = Object.freeze([]);

export const CIRQUE_ITALIA_TENT_WHY =
  "Custom 35,000-gallon water stage under a traveling tent — acts play over the pool with rain curtains and fountain jets.";

export function isCirqueItaliaPlace(place) {
  if (!place) return false;
  const blob = [place.name, place.title, place.displayName]
    .filter(Boolean)
    .join(" ");
  if (!blob || NOT_CIRQUE_ITALIA_RE.test(blob)) return false;
  return CIRQUE_ITALIA_NAME_RE.test(blob);
}

export function isCirqueItaliaPublicTent(place) {
  const id = place && typeof place.id === "string" ? place.id.trim() : "";
  return Boolean(id) && CIRQUE_ITALIA_PUBLIC_TENT_PLACE_IDS.includes(id);
}

/** HQ / legal / unknown inventory pin — never inherit tent copy. */
export function cirqueItaliaBlocksEditorial(place) {
  return isCirqueItaliaPlace(place) && !isCirqueItaliaPublicTent(place);
}

export function cirqueItaliaWhyBody(place, insightBody) {
  if (!isCirqueItaliaPlace(place)) {
    return typeof insightBody === "string" ? insightBody : "";
  }
  if (isCirqueItaliaPublicTent(place)) return CIRQUE_ITALIA_TENT_WHY;
  return "";
}
