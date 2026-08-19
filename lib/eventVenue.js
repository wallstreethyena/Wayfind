// lib/eventVenue.js — THE ticketed-venue identity, for the Events Near You
// rail. The axis (owner, 2026-08-15, in lib/railSelect.js): "a room that
// sells a ticket for a DATED thing … a bar is open every night; that is the
// opposite of the axis." night_club, casino, movie_theater and
// cultural_center were already cut from the type list for exactly that
// reason — and then the rail leaked anyway, because a PUB can carry
// `event_venue` or `banquet_hall` in its SECONDARY Google types. Measured
// live near Parrish 2026-08-19: the rail served 4 cards and three of them
// were bars (McCabe's Irish Pub, Woody's Tiki Bar, Ed's Tavern) while 54
// real ticketed rooms — the Straz Center, Van Wezel, Jannus Live, the
// Sarasota Opera House, LECOM Park — sat in inventory unreached by the
// anchor top-N. Same pool-cap disease as breakfast (v8.18), plus a leak the
// cap was hiding.
//
// DISTANCE: a show is worth a drive a lunch counter is not. 40 miles is the
// evening-drive ceiling — it keeps CoolToday Park (38.8mi, spring training)
// and stays inside "you can be home before midnight".
export const EVENTS_NEAR_MI = 40;

// Moved verbatim from lib/railSelect.js — the owner's axis list, not this
// module's invention.
export const TICKETED_TYPES = ["performing_arts_theater", "concert_hall", "amphitheatre", "amphitheater",
  "stadium", "arena", "event_venue", "opera_house", "auditorium", "comedy_club",
  "banquet_hall", "convention_center", "philharmonic_hall"];
const TICKETED_SET = new Set(TICKETED_TYPES);

// Whole-word name evidence for the venues whose inventory row carries no
// primary type — Van Wezel Performing Arts Hall and the Sarasota Opera House
// are both primary-null in wf_inventory and both name their room.
// Plurals matter: "AMC Regency Theatres" must reach the veto (and be vetoed
// on its movie_theater primary), not slip past the evidence floor unseen —
// the red-prove for the veto caught exactly that gap.
const NAME_TICKETED = /\b(theat(er|re)s?|amphitheat(er|re)s?|playhouse(s)?|opera|arena(s)?|stadium(s)?|concert|philharmonic|symphony|ballet|comedy club|convention center|performing arts)\b/i;

// A room whose PRIMARY identity is food, drink, lodging or retail is never
// the answer to "events near you", whatever its banquet room's types claim.
// movie_theater and casino join the veto because the AXIS cut them (a
// cinema shows the same film nightly; see the railSelect list note) and the
// name path would otherwise re-admit any "…Theatres" multiplex.
const VETO_PRIMARY_RX = /(_restaurant$|^restaurant$|^cafe$|^coffee_shop$|^bar$|^pub$|^bar_and_grill$|^night_club$|^movie_theater$|^casino$|^grocery_store$|^supermarket$|^convenience_store$|_hotel$|^hotel$|^motel$|^resort_hotel$|^rv_park$|^campground$)/;

// For primary-null rows: types that name a DIFFERENT identity than the
// ticketed room. The Ringling carries `event_venue` in its types and is a
// museum; a tiki bar carries `banquet_hall` and is a bar. If the row cannot
// say what it primarily is, it must at least not visibly be something else.
const COUNTER_TYPES = new Set(["museum", "art_museum", "art_gallery", "history_museum",
  "restaurant", "bar", "pub", "irish_pub", "bar_and_grill", "night_club", "cafe",
  "grocery_store", "supermarket", "park", "city_park", "state_park", "rv_park",
  "hotel", "resort_hotel", "amusement_center", "bowling_alley"]);

const typeList = (p) => (Array.isArray(p && p.types) ? p.types : []).map((t) => String(t).toLowerCase());

/** PURE. The plain identity the rail's pick historically ran: any ticketed
 *  type anywhere in the row's Google types. Kept exported for the summer
 *  registry path and for tests — but the RAIL now runs the strong form
 *  everywhere, because this is the predicate that let three bars wear
 *  "Events Near You". */
export function isTicketedVenue(p) {
  if (!p) return false;
  return typeList(p).some((t) => TICKETED_SET.has(t));
}

/** PURE. The strong form — what the place IS:
 *   1. veto, absolute: a food/drink/lodging/retail PRIMARY is refused;
 *   2. a ticketed PRIMARY type admits;
 *   3. whole-word name evidence admits (the primary-null opera house);
 *   4. a primary-null row admits only when its types carry a ticketed type
 *      AND no counter-identity type (museum, bar, park…);
 *   5. no evidence, no stage. */
export function isStrongTicketedVenue(p) {
  if (!p) return false;
  const types = typeList(p);
  if (!types.some((t) => TICKETED_SET.has(t)) && !NAME_TICKETED.test(String(p.name || ""))) return false;
  const pt = String((p.primaryType || p.primary_type) || "").toLowerCase();
  if (pt && VETO_PRIMARY_RX.test(pt)) return false;
  if (pt && TICKETED_SET.has(pt)) return true;
  if (NAME_TICKETED.test(String(p.name || ""))) return true;
  if (!pt) return types.some((t) => TICKETED_SET.has(t)) && !types.some((t) => COUNTER_TYPES.has(t));
  return false;
}
