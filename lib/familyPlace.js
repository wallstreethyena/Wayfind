// lib/familyPlace.js — THE family-day identity, for the Family Day, Decided
// rail. Extracted from lib/railSelect.js in v8.19 so the rail's dedicated
// pool (lib/railsData.js buildIdentityPool) and the rail's pick read the SAME
// rule — the one-identity discipline lib/breakfast.js and lib/quickService.js
// already follow.
//
// DISTANCE: kids in tow. Nobody drives two hours to a playground; a zoo or an
// aquarium is worth ~half an hour. Every family card the rail served before
// this pool existed sat within 17 miles of the reader, so 25 keeps all of
// them and adds a real margin, without promising a day-trip.
export const FAMILY_NEAR_MI = 25;

// Zoos, aquariums and theme parks are unambiguous. Museums, gardens and
// playgrounds join them; a bare "park" does not — it matches marinas, dog
// parks and RV parks, and a rail promising nobody melts down at 3pm cannot
// be built on a token that loose. (Moved verbatim from lib/railSelect.js —
// the list is the owner's axis, not this module's invention.)
export const FAMILY_TYPES = ["zoo", "aquarium", "amusement_park", "water_park", "theme_park",
  "playground", "children_camp", "childrens_camp", "museum", "botanical_garden",
  "wildlife_park", "wildlife_refuge", "amusement_center", "bowling_alley", "ice_cream_shop"];
const FAMILY_SET = new Set(FAMILY_TYPES);

// v8.19 — THE PRIMARY-IDENTITY VETO, learned by executing the plain rule
// against live inventory near Parrish before the widened pool shipped (the
// same drill that caught Publix-as-breakfast in v8.18): three Culver's, a
// Sonic, two Detwiler's Farm Markets, a beach café and a chocolate shop all
// qualified as "family day" — each carries `museum`, `ice_cream_shop` or
// `playground` somewhere in its SECONDARY Google types. A burger chain that
// also scoops ice cream is still a restaurant; a farm market with a play
// corner is still a grocery store. What the place IS — the primary type —
// decides. Deliberately NOT vetoed: parks (a city park whose types prove a
// playground is a genuine family stop) and null-primary rows (the Ringling,
// the Bishop Museum and Sarasota Jungle Gardens all carry no primary type in
// inventory, and refusing them would throw out the exact anchors the rail is
// for).
const VETO_PRIMARY_RX = /(_restaurant$|^restaurant$|^cafe$|^coffee_shop$|^bar$|^pub$|^grocery_store$|^supermarket$|^convenience_store$|^dessert_shop$|^candy_store$|^gas_station$|^rv_park$|^campground$|^mobile_home_park$|_hotel$|^hotel$|^motel$)/;

const typeList = (p) => (Array.isArray(p && p.types) ? p.types : []).map((t) => String(t).toLowerCase());

/** PURE. The plain identity: the row's Google types prove a family stop.
 *  Byte-for-byte the rule the rail's pick has always run (hasAny over
 *  FAMILY_TYPES) — used over pre-targeted candidates (anchor pools). */
export function isFamilyPlace(p) {
  if (!p) return false;
  return typeList(p).some((t) => FAMILY_SET.has(t));
}

/** PURE. The strong form, for candidates nobody pre-targeted (raw inventory
 *  widening): the plain identity AND a primary type that does not name a
 *  restaurant, shop or lodging. `ice_cream_shop` as PRIMARY stays admitted —
 *  it is in FAMILY_TYPES on purpose. */
export function isStrongFamilyPlace(p) {
  if (!isFamilyPlace(p)) return false;
  const pt = String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();
  if (pt && pt !== "ice_cream_shop" && VETO_PRIMARY_RX.test(pt)) return false;
  return true;
}
