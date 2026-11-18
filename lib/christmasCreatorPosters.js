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
  // Waterfront view of The Sail Plaza and Sail Pavilion at the Tampa Convention Center, from the city's own page.
  "the-sail-plaza-tampa": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/the-sail-plaza-tampa/cp_730c07b50d20ec0b.jpg",
    credit: "Photo by City of Tampa official website",
    href: "https://www.tampa.gov/sites/default/files/jumbotron-images/2021-06/the-sail-plaza-scaled_0.jpg",
  }),
  // A Ben's soft pretzel (signature product) from the brand's own site, which lists the 54 St. George St shop.
  "bens-soft-pretzels-st-augustine": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/bens-soft-pretzels-st-augustine/cp_9b84488c976a1978.jpg",
    credit: "Photo by Ben's Soft Pretzels official website",
    href: "https://cdn.sanity.io/images/9f8kt17n/production/b0b510efa56ca7771b41fcfe20d15c51fd3edc7f-1000x1000.png",
  }),
  // A Mimi's crepe with whipped cream and almonds on a courtyard table, from the shop's own site.
  "mimis-famous-crepes-st-augustine": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/mimis-famous-crepes-st-augustine/cp_7f4e2c1cf06c5b3b.jpg",
    credit: "Photo by Mimi's Famous Crepes official website",
    href: "https://www.mimisfamouscrepes.com/wp-content/uploads/2025/11/20250430_Mimis_Crepes_0007.jpg",
  }),
  // The Hangar Bar crane and sign at Disney Springs.
  "jock-lindseys-hangar-bar-disney-springs": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/jock-lindseys-hangar-bar-disney-springs/cp_35917a38c971b9ae.jpg",
    credit: "Photo by Jedi94 via Wikimedia Commons, CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Jock_Lindsey%27s_Hangar_Bar_at_Disney_Springs.jpg",
  }),
  // The lit snow tubing slopes at night, from the park's own site.
  "snowcat-ridge-dade-city": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/snowcat-ridge-dade-city/cp_452dfa740dd5a48a.jpg",
    credit: "Photo by Snowcat Ridge official website",
    href: "https://snowcatridge.com/wp-content/uploads/2021/11/SS_1.jpg",
  }),
  // A cut-your-own Christmas tree sign in the tree field, from the farm's own site.
  "santas-christmas-tree-forest-eustis": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/santas-christmas-tree-forest-eustis/cp_0e4c8735b734f4a7.jpg",
    credit: "Photo by Santa's Farm official website",
    href: "https://santaschristmastreeforest.com/wp-content/uploads/CutYourOwnTree.jpg",
  }),
  // The shop's red-umbrella courtyard patio with pastries and a smoothie, from its own site.
  "st-augustine-coffee-house": Object.freeze({
    src: "/place-photos/batch-2026-11-18-creators/st-augustine-coffee-house/cp_764e18b20dc90674.jpg",
    credit: "Photo by St. Augustine Coffee House official website",
    href: "https://images.squarespace-cdn.com/content/v1/680646de34f5d06ffff2cfd0/4827211a-1e47-4976-a7ac-2bb2204a8688/STACoffee_full_17.jpg",
  }),
});

export function christmasCreatorPoster(key) {
  const hit = CHRISTMAS_CREATOR_POSTERS[String(key || "")];
  return hit && typeof hit.src === "string" && hit.src.startsWith("/place-photos/") ? hit : null;
}
