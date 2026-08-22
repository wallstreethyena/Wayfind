// lib/outing.js — IS THIS SOMETHING TO GO AND DO?
//
// THE DEFECT, measured 2026-08-22 against live inventory. "Places You'd Never
// Find" near Parrish served, in order: Elite Medical Spa of Parrish, Ryan's
// Coffee House, Bakers Ranch Wedding Venue, MassageLuXe Parrish, Blue Door Spa
// Ellenton. Near Lakewood Ranch nine of the `things-to-do` pool's top fifteen
// were spas, med spas, gyms, yoga studios and a chiropractor. Sarasota's top
// twenty-six carried seven spas.
//
// The pool is not wrong to CONTAIN them. lib/placeFilter.js's `attractions`
// gate deliberately admits /\bspa\b|wellness/ because /things-to-do has a Spa
// SUBCATEGORY — a browsable tab, which is a perfectly good place for a day spa
// and exactly where someone looking for one goes. Nothing about that gate needs
// to change, and changing it would delete a real section of the site.
//
// What was missing is the rail-side question. A homepage discovery rail is
// answering "what should I go and DO near me", and a med spa, a gym, a
// chiropractor and a wedding venue are not answers to it — they are services
// you book, appointments you keep, or venues you hire. The Wayfind Score cannot
// tell the difference: a med spa with a 4.9 from 300 clients scores exactly like
// a museum with a 4.9 from 300 visitors, because the score measures how well a
// place is regarded, never what kind of thing it is.
//
// Same root cause as every rail identity shipped this month (see
// scripts/check-rail-identity.mjs): asking how GOOD when the question is WHAT.
//
// THE SHAPE, matching lib/quickService.js and lib/breakfast.js:
//   1. VETO on the PRIMARY type, absolute. The primary type is the CLAIM
//      (v8.30.1); a museum that also lists `spa` is a museum, and a med spa that
//      also lists `tourist_attraction` is a med spa.
//   2. VETO on whole-word NAME evidence, for the businesses Google types
//      generously ("Med Spa", "IV & Wellness", "Chiropractic").
//   3. Everything else is ADMITTED. This is deliberately a veto and not an
//      allowlist: the pool has already passed the attractions gate, and a
//      positive list would silently delete the one genuinely odd local
//      attraction that makes a town worth visiting — which is the opposite of
//      what a discovery product is for.
//
// DELIBERATE CALLS, so nobody "fixes" them:
//   · `campground` and `rv_park` are LODGING, not an outing. You sleep there.
//   · `marina` stays IN: people go to a marina to get on the water, and the
//     charters and paddle tours that make it a real outing are typed there.
//   · `farm` stays IN: u-pick farms, hydroponic tours and Gamble Creek Farms are
//     genuine local outings and are the whole point of a rural market.
//   · `golf_course` stays IN. `gym`, `yoga_studio` and `fitness_center` do not:
//      a round of golf is an afternoon out, a workout is an errand.
//   · a spa INSIDE a hotel or resort is refused here for the same reason — the
//     rail is not the place someone books a treatment.

const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();

// Personal care, medical, fitness, lodging, and venues you HIRE rather than
// visit. Every entry below was drawn from a row measured on a live rail.
export const NOT_AN_OUTING_PRIMARY = new Set([
  // personal care
  "spa", "massage_spa", "massage", "sauna", "beauty_salon", "hair_salon",
  "hair_care", "nail_salon", "barber_shop", "tanning_studio", "skin_care_clinic",
  "makeup_artist", "tattoo_parlor",
  // medical
  "medical_clinic", "medical_center", "medical_lab", "doctor", "dentist",
  "dental_clinic", "chiropractor", "physiotherapist", "hospital", "pharmacy",
  "drugstore", "wellness_center", "health",
  // fitness — an errand, not an afternoon
  "gym", "fitness_center", "yoga_studio", "pilates_studio", "martial_arts_school",
  "personal_trainer", "dance_school",
  // lodging: you sleep there
  "hotel", "motel", "resort_hotel", "lodging", "extended_stay_hotel",
  "bed_and_breakfast", "guest_house", "hostel", "campground", "rv_park",
  "apartment_complex", "apartment_building",
  // venues you hire, and businesses generally
  "wedding_venue", "banquet_hall", "funeral_home", "cemetery",
  "real_estate_agency", "insurance_agency", "storage", "self_storage_facility",
  "corporate_office", "consultant", "school", "preschool", "primary_school",
  "secondary_school", "child_care_agency", "church", "place_of_worship",
]);

// Whole-word, per the taxonomy's boundary law (parking must not match park).
// These are the businesses Google types as tourist_attraction or point_of_interest
// and whose name is the only honest evidence of what they actually sell.
export const NOT_AN_OUTING_NAME_RX =
  /\b(med ?spa|medical spa|day spa|head spa|wellness|chiropract(?:ic|or)|dermatolog|orthodont|dental|dentistry|urgent care|iv (?:bar|lounge|therapy|drip)|botox|laser hair|waxing|lash(?:es)? (?:bar|studio|lounge)|nail (?:bar|salon|spa)|barbershop|barber shop|hair (?:salon|studio)|cryotherapy|physical therapy|weight loss|fitness|crossfit|pilates|orangetheory|f45|gym\b|self storage|storage units|wedding venue|banquet|funeral|realty|real estate)\b/i;

// A hotel/resort spa is refused even when it is typed as an attraction: the
// name says whose amenity it is, and the rail is not where a treatment is booked.
const RESORT_AMENITY_RX = /\b(spa|salon)\b.{0,24}\b(at|inside)\b.{0,32}\b(resort|hotel|inn|club)\b/i;

/**
 * Is this a place a reader would GO to, as an outing?
 * Pure, total, and never throws on a malformed row.
 */
export function isOuting(p) {
  if (!p) return false;
  const primary = primaryOf(p);
  if (NOT_AN_OUTING_PRIMARY.has(primary)) return false;
  const name = String(p.name || "");
  if (NOT_AN_OUTING_NAME_RX.test(name)) return false;
  if (RESORT_AMENITY_RX.test(name)) return false;
  return true;
}
