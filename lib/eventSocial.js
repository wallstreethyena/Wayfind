// Server-only associations between reviewed public creator posts and existing
// curated events. Keep this out of the eager home bundle: event pages need the
// native link and credit, while ranking only needs the compact place signals.
const ASSOCIATIONS = Object.freeze({
  "screamageddon-2026": [
    ["funtampa", "https://www.instagram.com/reel/Dc2WqU-xuCD/"],
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
    ["cheatdayorlando", "https://www.instagram.com/reel/Dc2vk3eBHGQ/"],
    ["cheatdayorlando", "https://www.instagram.com/reel/Dc2e78nNoMm/"],
    ["paigepbryant", "https://www.instagram.com/reel/Dc2dtxHNbtt/"],
  ],
  "florida-coffee-festival-2026": [
    ["flacoffeefestival", "https://www.instagram.com/p/Dc_KiM5xqhv/"],
  ],
  "tampa-bay-rodeo-2026-09-04": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
  "hyde-park-fresh-market-2026-09-06": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
  "howl-o-scream-tampa-2026": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
  "gallaghers-pumpkins-2026": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
  "sunshine-market-midtown-2026-09-26": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
  "westshore-marina-sunday-market-2026-09-27": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
  "hunsader-pumpkin-2026": [
    ["hunsaderfarms", "https://www.instagram.com/reel/Dc2B4ASphDx/"],
  ],
  "hhn-orlando-2026": [
    ["horrornightsorl", "https://www.instagram.com/reel/DcycQAlkXid/"],
  ],
  "the-berry-farm-harvest-festival-2026": [
    ["fashion.eat.travel", "https://www.instagram.com/reel/Dc3WlMLx2iv/"],
  ],
  "bedners-fall-festival-2026": [
    ["fashion.eat.travel", "https://www.instagram.com/reel/Dc3WlMLx2iv/"],
  ],
  "beware-the-night-brevard-zoo-2026": [
    ["brevardbanana", "https://www.instagram.com/reel/DdDGRHSOX3B/"],
  ],
  "pintos-fall-at-the-farm-2026": [
    ["pintosfarm", "https://www.instagram.com/reel/DdAH96yx1xa/"],
    ["fashion.eat.travel", "https://www.instagram.com/reel/Dc3WlMLx2iv/"],
  ],
  "pride-and-passion-tampa-2026": [
    ["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"],
  ],
});

export function eventSocialPosts(eventId) {
  const key = String(eventId || "").replace(/^wfc:/, "");
  return (ASSOCIATIONS[key] || []).map(([creator, url]) => ({
    platform: "instagram",
    creator,
    url,
  }));
}

export const __EVENT_SOCIAL_FOR_GUARDS__ = ASSOCIATIONS;
