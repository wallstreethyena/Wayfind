// lib/showVenue.js — A SHOW IS A NIGHT OUT.
//
// v8.83 (owner, 2026-08-28, on Tonight's Move): "why are we not offering
// comedy club, think like that — we have comedy clubs?"
//
// He is right and the inventory proves it. Measured within 25 miles of
// Bradenton against live wf_inventory:
//
//   4 comedy clubs        average rating 4.85  (McCurdy's Comedy Theatre 11.6mi)
//   23 performing arts theaters               (Van Wezel 10.9mi, Mahaffey 18.9mi)
//   8 live music venues                       (Oscura 1.2mi, Ka'Tiki 21mi)
//   1 concert hall                            (Jannus Live 19.2mi)
//
// And what Tonight's Move actually served, same reader, same minute:
//
//   19 bar · 6 sports_bar · 4 cocktail_bar · 2 lounge_bar · 2 live_music_venue
//   · 1 irish_pub · 1 pub · 1 wine_bar · 1 night_club · 1 fishing_pier
//
//   ZERO comedy clubs. ZERO theaters. ZERO concert halls. Thirty-one bars.
//
// THE CAUSE IS THE POOL, NOT THE RULE. lib/nightlifeRail.js VENUE_TYPES has
// listed `comedy_club` and `concert_hall` since it was written — the identity
// would have admitted McCurdy's happily. It was never offered one. `tonight`
// draws from the `nightlife` pool, which is ranked BAR inventory, so a comedy
// club could not appear however good it was. This is the pool-cap disease this
// codebase has now diagnosed five times — breakfast (v8.18), family (v8.19),
// events (v8.19), the 30-minute break (v8.18) and creators (v8.7) each got a
// dedicated identity pool for exactly this, and `tonight` never did.
//
// WHY THIS IS ITS OWN IDENTITY AND NOT A LINE ADDED TO isNightlifeVenue.
// That module answers "is this a nightlife venue, or a restaurant holding a
// liquor licence", and its whole design is a veto list protecting a bar rail
// from steakhouses with a DJ. A theatre is not a bar and does not want that
// machinery. Two questions, two rules — the same separation lib/mealPlace and
// lib/quickService keep.
//
// WHAT IS DELIBERATELY OUT: stadium, arena, convention_center, event_venue,
// banquet_hall. Those are buildings that hold a night out when something is
// booked in them, and Wayfind cannot see tonight's calendar (1.4% of rail rows
// carry so much as opening hours). "What's Happening Near You" is the rail
// that carries a DATE; this one carries places that run shows as their
// ordinary business, so the card is true on an ordinary evening.
//
// A movie theater is a real evening and is also on every corner — it belongs
// to a cinema surface, not to a rail whose promise is a MOVE. Left out until
// someone asks for it on purpose.
const SHOW_PRIMARY = new Set([
  "comedy_club", "live_music_venue", "concert_hall", "performing_arts_theater",
  "opera_house", "amphitheatre", "amphitheater", "dance_hall", "jazz_club",
  "cabaret", "theater_company",
]);

const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();

/**
 * Is this a room that puts on a SHOW as its ordinary business?
 *
 * Primary type only, the v8.30.1 discipline. Google hangs
 * `performing_arts_theater` and `live_music_venue` on hotels, breweries and
 * restaurants that host a band on Fridays — reading the secondary tokens here
 * would put every gastropub with a stage back on the rail, which is the leak
 * lib/nightlifeRail.js's own veto list exists to stop.
 */
export function isShowVenue(p) {
  return SHOW_PRIMARY.has(primaryOf(p));
}

export { SHOW_PRIMARY };
