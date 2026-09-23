// Hotel booking fail-closed gate.
//
// 2026-09-23, owner, pre-launch: "A hotel card may never send a user to a
// different hotel. Fewer booking buttons is acceptable. Incorrect booking
// buttons are not."
//
// WHY THIS EXISTS. /api/hotels/go hands Stay22 a name plus coordinates and
// Stay22 decides which property that is. We audited all 394 served hotels by
// reading the property Stay22 actually resolves to (it is returned in the 302
// Location's `ss` parameter, so this is observable without a browser). The
// result: only 40 resolved to the property on the card. 79 resolved to a
// DIFFERENT named business — including a Dollar Tree, a RaceTrac, an Irish pub
// and a tavern — and three separate cards all resolved to one wrong resort.
// 250 resolved to nothing but a geocoded address, which renders as a generic
// area list the card's hotel is absent from.
//
// THE RULE. A booking link is built only for a card with a stored verification
// record whose verdict is allowed. Everything else fails closed: no record, a
// wrong property, a generic list, an ambiguous name, a stale card name, or a
// card with no address. Absence of evidence is failure, never a pass — that is
// what makes this fail-CLOSED rather than a blocklist.
//
// HOW A RECORD EARNS `allowed` (scripts/check-hotel-booking-verified.mjs pins
// every clause; lib/hotelBookingVerification.json is the generated evidence):
//   1. Stay22 resolved to a named property, not a geocoded address.
//   2. That property is the card's property, established one of two ways:
//      google-identity — it equals the Google canonical name for the card's
//        VERIFIED place id (the 200m + lodging-type + street-number rule), so
//        two independent resolvers agree on the same property; or
//      name-identity  — it equals the card's own name outright.
//   3. The card's displayed name does not mislead: it is the property name or
//      a subset of it. "Even Hotel" may point at "EVEN Hotel Sarasota-Lakewood
//      Ranch"; a card still labelled "Holiday Inn River Front Hotel Bradenton"
//      may NOT point at "Courtyard Bradenton Sarasota/Riverfront" even though
//      it is the same building, because the user would not recognise it.
//   4. The card's name is unique across served inventory. Two cards named
//      "Hampton Inn & Suites" at different addresses are ambiguous, so both
//      fail — we cannot prove which one a user would be sent to.
//   5. The card carries a verified place id, so the evidence is keyed to a
//      stable property identity and not to a display string.
//
// Comparison ignores chain-operator words ("by Hilton", "by Marriott") because
// they name the operator, not the property. It ignores nothing else. Widening
// it past that is how a wrong hotel gets a button.
//
// THIS IS THE INTERIM. The destination is a Booking property id per hotel and
// an exact deep link, at which point Stay22's guessing leaves the path
// entirely and this gate is replaced rather than relaxed. Until then, DO NOT
// rename a card to make Stay22 resolve — that manufactures a pass without
// changing where the user lands. Regenerate the evidence instead.

import RECORDS from "./hotelBookingVerification.json" with { type: "json" };

const BY_KEY = new Map();
for (const r of Array.isArray(RECORDS) ? RECORDS : []) {
  if (r && typeof r.key === "string" && r.key) BY_KEY.set(r.key, r);
}

/** Every stored record, for guards and audits. Never mutate. */
export function hotelBookingRecords() {
  return Array.isArray(RECORDS) ? RECORDS : [];
}

/**
 * The card id a verification record is stored under. Owned-hotel cards carry
 * this as `place.id`; anything else has no record and therefore no button.
 */
export function hotelBookingKey(place) {
  const id = place && typeof place.id === "string" ? place.id.trim() : "";
  return id || "";
}

/** The stored record for a place, or null when we have never verified it. */
export function hotelBookingVerification(place) {
  const key = hotelBookingKey(place);
  if (!key) return null;
  return BY_KEY.get(key) || null;
}

/**
 * The gate. True ONLY for a card whose stored record says allowed.
 * No record, a falsy verdict, a missing place id: all false.
 */
export function isHotelBookingVerified(place) {
  const rec = hotelBookingVerification(place);
  return Boolean(rec && rec.allowed === true && rec.placeId);
}
