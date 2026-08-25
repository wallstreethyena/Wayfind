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
  entries: Object.freeze([
    // EMPTY ON PURPOSE — see the header. The owner supplies the chef's seven;
    // nothing here may be guessed, inferred, or "temporarily" filled.
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
