// Serve-time eligibility only. Keep the evidence engine out of client-facing
// fallPool imports, and always read the present registry instead of a copy.
import { FALL_PLACE_IDS, FALL_OFFERING_SOURCES } from "./fallPool.js";
import { verifiedInSeasonWindow, offeringActive } from "./fallEvidence.js";

// Runtime counterpart of check-fall-registry-integrity. Evergreen themes also
// need a current-season re-check under the current registry contract.
export function fallPlaceEvidenceCurrent(placeId, today) {
  const entry = FALL_OFFERING_SOURCES[placeId];
  return !!FALL_PLACE_IDS[placeId] && !!entry
    && /^https:\/\//.test(String(entry.source || ""))
    && String(entry.offering || "").trim().length >= 15
    && verifiedInSeasonWindow(entry.verified, today)
    && offeringActive({ starts: entry.starts || entry.from, ends: entry.until || entry.ends, today });
}
