// lib/placeWhere.js — WHERE IT IS, AND HOW TO GET THERE. One definition.
//
// v8.88 (owner, 2026-08-29, on the Möbius Sarasota event page): "I wanna make
// sure that the Möbius event has the address and the little button that allows
// you to click on it and get directions for it. I'm not sure why you wouldn't
// put that in there. Like, how are people gonna be able to find it? Make sure
// that you address it on the website so that all the pages that have
// recommendations like this also has the addresses."
//
// He is right, and the shape of the miss is the one this codebase keeps
// finding: THE DATA WAS ALREADY THERE. wf_events carries an `address` column,
// it is inside EVENT_COLUMNS, it is SELECTed on every read, and the Möbius row
// holds "2211 Whitfield Park Loop, Ste 101, Sarasota, FL 34243". The event page
// printed `{venue}, {city}, {state}` — "Möbius Sarasota, Sarasota, FL" — and
// dropped the street. A reader on a paid partner's own landing page could not
// find the building.
//
// WHY THIS IS A MODULE AND NOT TWO LINES ON A PAGE. There were already two
// spellings of "where" on the site and they disagreed:
//
//   /florida-events/[slug]  venue + city, no map link at all
//   /events/[city]/[slug]   a Maps SEARCH on the string `venue + " " + city`,
//                           ignoring the address and the coordinates the row
//                           carries
//
// A third copy on the next page is how the date-night claim ended up being
// three different rules (v8.82). So both call the same two functions, and the
// next surface that states a Where gets them for free.
//
// MEASURED against live wf_events (89 displayable rows, 2026-08-29):
//   36 carry a street address · 74 carry coordinates · 7 carry neither.
// The ladder below is built for that distribution rather than for the happy
// path: most rows can be navigated to precisely, a third can also be READ, and
// seven cannot honestly offer a button at all — so they do not get one.

/** Google's place id, under either of the two spellings the app uses. */
const pid = (x) => (x && (x.place_id || x.placeId)) || null;
const str = (v) => (v == null ? "" : String(v).trim());

/**
 * The human line: the street address when we hold one, otherwise the most
 * specific true statement we can make about where this is.
 *
 * NEVER invents precision. A row with only a city returns the city — the
 * caller decides whether that is worth printing, and the page prints the venue
 * name separately, so this is the SECOND line, not the whole answer.
 *
 * @returns {string} may be "" — an empty string means we do not know
 */
export function addressLine(x) {
  if (!x) return "";
  const address = str(x.address);
  if (address) return address;
  const city = str(x.city);
  const state = str(x.state);
  const cityState = [city, state].filter(Boolean).join(", ");
  return cityState;
}

/**
 * A link that opens turn-by-turn DIRECTIONS, not a map search.
 *
 * The owner asked for "the little button that allows you to click on it and get
 * directions", and those are two different Google endpoints: /maps/search drops
 * a pin the reader then has to tap Directions on, /maps/dir starts the
 * navigation. This is the second one.
 *
 * THE LADDER, most exact first, and the ordering is deliberate:
 *
 *   1. a Google PLACE ID -> `destination_place_id`, with readable text beside
 *      it. Exact AND named: Maps shows "Möbius Sarasota", not a coordinate
 *      pair, and does not geocode at all.
 *   2. a street ADDRESS -> geocodes to the building and reads correctly on the
 *      destination card.
 *   3. COORDINATES. Precise, but Maps titles the destination with the numbers,
 *      which reads like a bug to anyone who did not write it — so it sits
 *      BELOW the address rather than above it, even though it is more precise.
 *   4. VENUE + city + state. What the aggregator page has always used; kept as
 *      the floor because a named venue in a named city geocodes reliably.
 *   5. null.
 *
 * Rung 5 is the point of the whole function. A city with no venue, no address
 * and no coordinates cannot produce directions to anything — it produces a pin
 * in the middle of Sarasota. Returning null there means the caller renders NO
 * BUTTON, which is this codebase's standing rule about dead affordances (see
 * IconicPlaceCard's `actionsReadOnly`, and the ?action=like anchors of v8.28):
 * a control that looks live and cannot deliver is worse than its absence.
 *
 * @returns {string|null} an absolute maps.google URL, or null when we cannot
 *                        honestly send someone anywhere
 */
export function directionsUrl(x) {
  if (!x) return null;
  const address = str(x.address);
  const venue = str(x.venue || x.name);
  const city = str(x.city);
  const state = str(x.state);
  const lat = Number(x.lat), lng = Number(x.lng);
  // Number(null) === 0, and 0,0 is a real coordinate in the Gulf of Guinea.
  // The same coercion emptied every now-rail for unlocated readers in v8.82,
  // so the check is for a usable VALUE, not for truthiness.
  //
  // …and EXACTLY (0, 0) is refused on top of that. It is a real coordinate —
  // Null Island, in the Gulf of Guinea — which is precisely why it is the
  // value a broken import lands on, and Wayfind has never had a listing within
  // four thousand miles of it. A row holding 0,0 is a data bug; sending a
  // reader to the Atlantic would be ours.
  const hasCoords = x.lat != null && x.lng != null && x.lat !== "" && x.lng !== ""
    && Number.isFinite(lat) && Number.isFinite(lng)
    && !(lat === 0 && lng === 0);

  const named = [venue, city, state].filter(Boolean).join(", ");
  const placeId = pid(x);

  let destination = null;
  if (placeId) destination = address || named || (hasCoords ? `${lat},${lng}` : "");
  else if (address) destination = address;
  else if (hasCoords) destination = `${lat},${lng}`;
  else if (venue && city) destination = named;

  if (!destination) return null;

  const q = new URLSearchParams({ api: "1", destination });
  if (placeId) q.set("destination_place_id", placeId);
  return "https://www.google.com/maps/dir/?" + q.toString();
}

/**
 * Can this row send someone to a door? The predicate behind the button, so a
 * page never has to re-derive "do we know enough" from the fields.
 */
export function canNavigate(x) {
  return directionsUrl(x) != null;
}
