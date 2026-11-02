// Server-only associations between reviewed public creator posts and existing
// curated events. Keep this out of the eager home bundle: event pages need the
// native link and credit, while ranking only needs the compact place signals.
//
// EXACT_EVENT_POSTS is intentionally narrower than "a roundup names this
// event". Event pages describe these as posts about one event and put them in a
// player, so only a dedicated event or organiser post can cross that boundary.
// The two reviewed compilation reels remain recorded in ROUNDUP_MENTIONS for
// auditability, but eventSocialPosts() never publishes them as exact media.
const EXACT_EVENT_POSTS = Object.freeze({
  // Owner submitted reels reviewed 2026-11-01 (docs/curation/owner-christmas-reels-2026-11-01.json):
  // each is a dedicated post about this one venue's holiday season.
  "roberts-christmas-wonderland-2026": [
    ["life_withkaymarie", "https://www.instagram.com/reel/DfN3Hxph0jD/"],
  ],
  "snowcat-ridge-2026": [
    ["tampabayisawesome", "https://www.instagram.com/reel/DfN6mnuRbI6/"],
  ],
  // Owner submitted 2026-11-01 (docs/curation/owner-christmas-posts-2026-11-01b.json).
  "deland-christmas-boat-parade-2026": [
    ["hollybluffmarina", "https://www.instagram.com/reel/DfM3je6ptql/"],
  ],
  "old-citrus-estate-whoville-2026": [
    ["oldcitrusestate", "https://www.instagram.com/p/DeX0R1nFKDC/"],
  ],
  // Owner screenshot and public creator grid reviewed 2026-10-22.
  "rreal-tacos-halloween-bar-tampa-2026": [
    ["life_withkaymarie", "https://www.instagram.com/reel/DesRyKbhtxf/"],
  ],
  "epcot-food-wine-2026": [
    ["disneyfoodblog", "https://www.instagram.com/p/DcZS_9jks2n/"],
  ],
  // Dedicated static event flyer, verified 2026-10-13; preserve /p/ and the
  // existing event ID. This is a public announcement, not creator footage.
  "sarasota-frightfest-2026": [
    ["sarasota_lifebynay", "https://www.instagram.com/p/DeZO5ntRRM9/"],
  ],
  "screamageddon-2026": [
    ["funtampa", "https://www.instagram.com/reel/Dc2WqU-xuCD/"],
    ["cheatdayorlando", "https://www.instagram.com/reel/Dc2vk3eBHGQ/"],
    ["cheatdayorlando", "https://www.instagram.com/reel/Dc2e78nNoMm/"],
    ["paigepbryant", "https://www.instagram.com/reel/Dc2dtxHNbtt/"],
    ["makingmemorieswithjess", "https://www.instagram.com/reel/Dc2vEpFiFL5/"],
  ],
  "florida-coffee-festival-2026": [
    ["flacoffeefestival", "https://www.instagram.com/p/Dc_KiM5xqhv/"],
  ],
  "hunsader-pumpkin-2026": [
    ["hunsaderfarms", "https://www.instagram.com/reel/Dc2B4ASphDx/"],
  ],
  "hhn-orlando-2026": [
    ["horrornightsorl", "https://www.instagram.com/reel/DcycQAlkXid/"],
    ["horrornightsorl", "https://www.instagram.com/reel/DcwSHqZj-TU/"],
  ],
});

// Reviewed editorial evidence in social-attachment-audit.json says these reels
// are multi-item roundups. Keeping the mentions separate preserves the research
// without presenting a calendar compilation as footage of one event or venue.
// This is guard/audit data only; no product surface reads it.
const ROUNDUP_MENTIONS = Object.freeze({
  "screamageddon-2026": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "tampa-bay-rodeo-2026-09-04": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "hyde-park-fresh-market-2026-09-06": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "howl-o-scream-tampa-2026": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "gallaghers-pumpkins-2026": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "sunshine-market-midtown-2026-09-26": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "westshore-marina-sunday-market-2026-09-27": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "pride-and-passion-tampa-2026": [["influencetampa", "https://www.instagram.com/reel/Dc3asu4uUOI/"]],
  "the-berry-farm-harvest-festival-2026": [["fashion.eat.travel", "https://www.instagram.com/reel/Dc3WlMLx2iv/"]],
  "bedners-fall-festival-2026": [["fashion.eat.travel", "https://www.instagram.com/reel/Dc3WlMLx2iv/"]],
  "pintos-fall-at-the-farm-2026": [["fashion.eat.travel", "https://www.instagram.com/reel/Dc3WlMLx2iv/"]],
});

// These dedicated posts identify the event venue, while the available local
// editorial copy does not identify the named seasonal event. They remain valid
// place-card evidence and are retained here so the rejected event attachment is
// reviewable; eventSocialPosts() does not publish them as event footage.
const VENUE_CONTEXT_POSTS = Object.freeze({
  "beware-the-night-brevard-zoo-2026": [["brevardbanana", "https://www.instagram.com/reel/DdDGRHSOX3B/"]],
  "pintos-fall-at-the-farm-2026": [["pintosfarm", "https://www.instagram.com/reel/DdAH96yx1xa/"]],
});

export function eventSocialPosts(eventId) {
  const key = String(eventId || "").replace(/^wfc:/, "");
  return (EXACT_EVENT_POSTS[key] || []).map(([creator, url]) => ({
    platform: "instagram",
    creator,
    url,
    association: "exact_event",
  }));
}

export const __EVENT_SOCIAL_FOR_GUARDS__ = EXACT_EVENT_POSTS;
export const __EVENT_ROUNDUP_MENTIONS_FOR_GUARDS__ = ROUNDUP_MENTIONS;
export const __EVENT_VENUE_CONTEXT_FOR_GUARDS__ = VENUE_CONTEXT_POSTS;
