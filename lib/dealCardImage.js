// lib/dealCardImage.js — which image a deal card paints.
//
// Lives here rather than inside the client component so a guard can import it
// and check every branch against the real filesystem. A component carrying JSX
// and "use client" cannot be imported by a node script, and image resolution
// that cannot be tested is exactly where a broken box hides.
//
// Local paths only. A remote image can 404, change, or leak a referrer, and a
// card is a money surface.
export const CATEGORY_IMAGE = {
  dining: "/cards/date-night-dining-hero.jpg",
  // v8.24 (owner: "I never want to see this image ever again") — the AI neon-concert composite (night-out.jpg) is BANNED and deleted; real concert-crowd photo instead.
  drinks: "/cards/tonight-alfonso-scarpa-unsplash.jpg",
  games: "/cards/family-fun.jpg",
  certificates: "/cards/food-choices-adobestock-301125732.jpeg",
};

export const FALLBACK_IMAGE = "/cards/food-choices-adobestock-301125732.jpeg";

/** A registry row's own image, else one by category, else the food fallback. */
export function cardImage(deal) {
  if (deal && deal.image) return deal.image;
  return CATEGORY_IMAGE[deal && deal.category] || FALLBACK_IMAGE;
}
