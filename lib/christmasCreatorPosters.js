// lib/christmasCreatorPosters.js
//
// Batch 2026-12e (owner screenshot, Nov 9): the "Seen from local creators"
// rail on /christmas-in-florida passed poster={null} for every post, so each
// tile showed only the maroon cover and a play button. A post gets a poster
// here only when we hold a verified, credited photo of that exact place.
// No creator media is copied: the poster is our own licensed photo, and the
// credit prints as a tiny muted line on the photo (owner rule 2026-11-04).
// A post with no entry keeps the plain branded cover. Keys are the CURATED
// keys in lib/creatorVideos.js.

export const CHRISTMAS_CREATOR_POSTERS = Object.freeze({
  // Lighted Christmas houseboat from the marina's own site.
  "holly-bluff-resort-marina-deland": Object.freeze({
    src: "/place-photos/batch-2026-12e/holly-bluff-resort-marina-deland/cp_9c06b36a77ddeb40.jpg",
    credit: "Photo by Holly Bluff Marina official website",
    href: "https://images.squarespace-cdn.com/content/683f8a2254fa063c049774e3/8b2d3664-c2a3-44de-8b8b-bd6c63d601ed/F86DBD04-FFDA-46B7-9806-0CFA580F08B0.PNG?format=2500w",
  }),
  // The resort at dusk from a guest room (RubyConf 2008 was held there).
  "omni-orlando-championsgate-blitzens": Object.freeze({
    src: "/place-photos/batch-2026-12e/ChIJtdT-ATl63YgRVrvPfarcWHU/pl_cd36422e81ced8da.jpg",
    credit: "Photo by supervillain via Flickr, CC BY 2.0",
    href: "https://www.flickr.com/photos/19932288@N00/3014078261",
  }),
});

export function christmasCreatorPoster(key) {
  const hit = CHRISTMAS_CREATOR_POSTERS[String(key || "")];
  return hit && typeof hit.src === "string" && hit.src.startsWith("/place-photos/") ? hit : null;
}
