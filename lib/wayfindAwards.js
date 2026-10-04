// lib/wayfindAwards.js — Wayfind's EARNED awards, one registry, keyed by place.
//
// Owner (2026-10-03): "add the badge to the place card for the breakfast
// places that won the 2026 breakfast award". The weekly "best of" ranking
// series (Best Breakfast Florida 2026 first, cafés next) names a #1 per city by
// Wayfind Score. A winner wears that credential on EVERY place card, on every
// surface, so this is the only file that says who won.
//
// WHY THIS IS NOT topPickAward. lib/topPickAward.js names a rail's live rank
// ("TOP FOOD PICK" + 1), which moves with location and time. This is a dated,
// published result: the place won it once, on a stated date, and keeps it. It
// therefore takes the award slot ahead of the rank chip (one credential per
// card, never two), and its label names the year so it can never read as a
// live merchandising claim. It is never for sale: entries come from the
// published ranking only.
//
// RULES FOR ADDING A WINNER
//   - Key by the exact Google place_id of the WINNING LOCATION. A chain wins at
//     one address, so its other locations must NOT wear the badge.
//   - `cities` are the cities the place won, in the order published.
//   - `area` overrides the label's city when the place is not physically in the
//     city it won (La Croisette is in St. Pete Beach and won the Anna Maria
//     Island search), so the card never puts a place in the wrong town; `near`
//     makes the long form read "#1 near Anna Maria Island", never "in".
//   - Labels stay short: the band ellipsizes inside a 390px card.

export const AWARDS = [
  {
    id: "best-breakfast-2026",
    title: "Best Breakfast 2026",
    published: "2026-10-01",
    winners: [
      { placeId: "ChIJRUCXlqO32YgR2cVEptp7ZW8", name: "Bistro Café", cities: ["Miami"] },
      { placeId: "ChIJC4qBgvHHwogRpobL5gaayiQ", name: "Keke's Breakfast Cafe", cities: ["Tampa"] },
      { placeId: "ChIJU0z2P92B3YgR6OqHPOnhuX4", name: "Eggs Up Grill", cities: ["Orlando"] },
      {
        placeId: "ChIJvdrqPr85w4gRA6C9TTnUdnY",
        name: "Keke's Breakfast Cafe",
        cities: ["Sarasota", "Bradenton", "Lakewood Ranch", "Siesta Key", "Parrish"],
      },
      { placeId: "ChIJFfdjBlz9wogR6wSfGKbqL0k", name: "La Croisette", cities: ["Anna Maria Island"], area: "AMI area", near: true },
      { placeId: "ChIJ_azYMG5Dw4gRi_ACS_yl7Tw", name: "Max's Table", cities: ["Venice"] },
    ],
  },
];

const BY_ID = new Map();
for (const award of AWARDS) {
  for (const w of award.winners) {
    if (BY_ID.has(w.placeId)) throw new Error("wayfindAwards: duplicate winner " + w.placeId);
    BY_ID.set(w.placeId, { award, winner: w });
  }
}

const idOf = (p) => {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  return String(p.place_id || p.placeId || p.id || "").trim();
};

/**
 * The award a place card should wear, or null.
 * @param {string|object} placeOrId  a place row ({ id | place_id | placeId }) or an id
 * @returns {{ id: string, label: string, icon: string, tone: "wayfind-award", rank: 1,
 *   curator: false, wayfindAward: true, cities: string[], title: string, detail: string, ariaLabel: string } | null}
 */
export function wayfindAwardFor(placeOrId) {
  const hit = BY_ID.get(idOf(placeOrId));
  if (!hit) return null;
  const { award, winner } = hit;
  const cities = winner.cities.slice();
  const where = winner.area || (cities.length === 1 ? cities[0] : cities.length + " cities");
  return {
    id: award.id,
    title: award.title,
    label: award.title + " · " + where,
    icon: "1",
    tone: "wayfind-award",
    rank: 1,
    curator: false,
    wayfindAward: true,
    cities,
    detail: (winner.near ? "#1 near " : "#1 in ") + cities.join(", "),
    ariaLabel: "Wayfind " + award.title + " winner, number one " + (winner.near ? "near " : "in ") + cities.join(", "),
  };
}

/** Every place_id holding an award (tests, sitemap, share surfaces). */
export function awardedPlaceIds() {
  return [...BY_ID.keys()];
}
