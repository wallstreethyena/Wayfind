// lib/chefPicks.js — chef-curated place collections (v8.50, Ron Duprat Top 7).
//
// A CHEF LIST IS TESTIMONY, NOT INVENTORY. The whole value of "Chef Ron
// Duprat's Top 7" is that a real, named Top Chef alum picked these seven
// himself — which imposes two laws stronger than any rail's usual rules:
//
//   1. VERBATIM OR NOTHING. The list renders exactly as the chef gave it —
//      his order, all seven — or it does not render at all. There is no
//      partial state, no reordering by Wayfind Score, distance, sponsorship
//      or affiliate value (chefPickPlaces() preserves entry order; the sheet
//      opens with presetSort "curated"). If the user is far away, distance is
//      CONTEXT on the card, never a sort key.
//   2. NOTHING IS INVENTED. `entries` ships EMPTY until the owner supplies
//      the chef's actual list; the hook card and sheet are gated on
//      chefPicksReady() (exactly 7 entries), so no surface can ever show a
//      restaurant under the chef's name that he did not pick. This is the
//      same law as generateHooks() ("every hook references an actual place —
//      nothing is invented") applied to a real person's name, where the cost
//      of inventing is not a bad card but a fabricated endorsement.
//
// TO GO LIVE: fill `entries` with the chef's seven, in his order:
//   { rank: 1..7 (contiguous, his order), name, city, state,
//     placeId: Google place_id (resolve it — the card system needs it),
//     lat, lng, rating, reviews,          // Google values at curation time
//     whyWorthTheTrip: "…",               // Wayfind's words, from his reasoning
//     signatureDish: "…" }                // the dish/experience he named
// scripts/check-chef-picks.mjs enforces all of the above at build time.
//
// Client-safe, zero deps.

export const RON_DUPRAT_TOP7 = Object.freeze({
  key: "ron-duprat-top7",
  chef: Object.freeze({ name: "Ron Duprat", credential: "Top Chef alum" }),
  // Locked copy (owner, 2026-08-25). The guard asserts these strings verbatim.
  eyebrow: "Curated by a Top Chef",
  title: "Chef Ron Duprat's Top 7",
  sub: "7 restaurants a Top Chef says are worth the trip.",
  cta: "See Ron's Picks →",
  heroImage: "/cards/chef-ron-duprat-top7.jpg",
  accent: "#F97316",
  // The chef's seven, verbatim (owner-supplied 2026-08-25; editorial lines
  // replaced with the owner's clean Wayfind-ready copy, 2026-08-26; array order = his
  // list order, recorded in rank). place_id/rating/reviews/coords resolved
  // against Google Places on 2026-08-25. Display order is by Wayfind Score
  // (owner directive) — rank is his testimony, not the sort key.
  entries: Object.freeze([
    { rank: 1, name: "Cafe La Trova", city: "Miami", state: "FL",
      placeId: "ChIJZzgtHTW32YgR-k9p8IqD5m0", lat: 25.76608, lng: -80.21048, rating: 4.5, reviews: 3977,
      whyWorthTheTrip: "Miami soul, Cuban flavor and world-class cocktails — come hungry and stay for the Little Havana energy.",
      signatureDish: "A cantinero-thrown daiquiri with the live band going" },
    { rank: 2, name: "Red Rooster Harlem", city: "New York", state: "NY",
      placeId: "ChIJFcYLJw32wokRnP5A9xO9JqM", lat: 40.80814, lng: -73.94488, rating: 4.4, reviews: 7837,
      whyWorthTheTrip: "Harlem on a plate: soulful food, live music and a dining room that feels woven into the neighborhood.",
      signatureDish: null },
    { rank: 3, name: "Le Bernardin", city: "New York", state: "NY",
      placeId: "ChIJV7QQ6kdZwokRax4615zpSGU", lat: 40.76142, lng: -73.98176, rating: 4.6, reviews: 4635,
      whyWorthTheTrip: "One of NYC's great seafood temples — pristine fish, exacting technique and a true special-occasion meal.",
      signatureDish: null },
    { rank: 4, name: "Sea Salt", city: "Naples", state: "FL",
      placeId: "ChIJp-Z3mQzh2ogRLZyfV3MShoc", lat: 26.13240, lng: -81.80225, rating: 4.3, reviews: 1140,
      whyWorthTheTrip: "Naples seafood with Venetian polish — fresh catches, elegant cooking and a downtown setting built for dinner.",
      signatureDish: null },
    { rank: 5, name: "Chef Creole Seasoned Restaurant", city: "Miami", state: "FL",
      placeId: "ChIJPeQtHkOx2YgR4SI1-m0ugng", lat: 25.82491, lng: -80.20026, rating: 4.4, reviews: 4094,
      whyWorthTheTrip: "Bold Haitian-Caribbean flavor without the fuss — spiced seafood, big portions and unmistakable Miami character.",
      signatureDish: null },
    { rank: 6, name: "Steak 954", city: "Fort Lauderdale", state: "FL",
      placeId: "ChIJGUenndMB2YgR3IXwJ2YfGIA", lat: 26.12853, lng: -80.10376, rating: 4.4, reviews: 2133,
      whyWorthTheTrip: "Ocean views, serious Wagyu and that jellyfish tank — Fort Lauderdale steakhouse dining turned into an event.",
      signatureDish: "The Wagyu, next to the jellyfish aquarium" },
    { rank: 7, name: "Roots Southern Table", city: "Farmers Branch", state: "TX",
      placeId: "ChIJaRaBhbcnTIYRWorlkgfpBGM", lat: 32.92332, lng: -96.89544, rating: 4.7, reviews: 1305,
      whyWorthTheTrip: "Southern comfort with chef-level precision — duck-fat fried chicken, gumbo and food that feels like home.",
      signatureDish: "Duck-fat fried chicken" },
  ]),
});

/** Live only when the chef's complete list is present. No partial renders. */
export function chefPicksReady(c) {
  return !!c && Array.isArray(c.entries) && c.entries.length === 7;
}

/**
 * The entries as place-shaped objects for the hook-detail sheet, VERBATIM
 * ORDER. `_chefRank` rides along so the sheet can label "Ron's #3" honestly.
 */
export function chefPickPlaces(c) {
  if (!chefPicksReady(c)) return [];
  return c.entries.map((e) => ({
    id: e.placeId,
    name: e.name,
    area: e.city + (e.state ? ", " + e.state : ""),
    lat: e.lat, lng: e.lng,
    rating: e.rating, reviews: e.reviews,
    hook: e.whyWorthTheTrip || null,
    mustSee: e.signatureDish || null,
    _chefRank: e.rank,
    _chef: c.chef.name,
  }));
}

/**
 * The hook card for the home strip (HooksBanner shape). Null until ready —
 * the strip must never advertise a list that cannot open.
 */
export function chefHookCard(c) {
  if (!chefPicksReady(c)) return null;
  return {
    id: "chef-" + c.key,
    accent: c.accent,
    emoji: "👨‍🍳",
    label: c.eyebrow,
    highlightWord: "Top Chef",
    hook: c.title,
    detail: c.sub,
    cta: c.cta,
    heroImage: c.heroImage,
    action: { type: "chefpicks", key: c.key },
  };
}
