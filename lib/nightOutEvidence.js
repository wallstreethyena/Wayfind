// Small, governed evidence overlays for Night Out identities that Google-style
// place metadata cannot express. This does not create venues: an ID must still
// exist as a rated, operational wf_inventory row inside the distance contract.
export const NIGHT_OUT_EDITORIAL_EVIDENCE = Object.freeze({
  "ChIJrYGdKBJAw4gRafewzUWWYnk": Object.freeze({
    rail: "dinner-entertainment",
    editorial: "Parisian-style dinner theatre and cabaret with a full restaurant and bar serving the same table before the performance.",
    source: "https://www.floridastudiotheatre.org/plan-your-visit/our-spaces/court-cabaret",
  }),
});

// Exact owned-inventory identities whose district promise is documented in
// the Atlas. The ID is the admission key; these labels and sources never create
// a card when the rated, operational row is absent or outside 27 miles.
export const NIGHT_OUT_DISTRICT_EVIDENCE = Object.freeze({
  "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8": Object.freeze({
    name: "St. Armands Circle",
    editorial: "An open-air shopping-and-dining circle built for a park-once stroll among restaurants, boutiques and the Ring of Fame.",
    verifiedAt: "2026-07-18",
    sources: Object.freeze([
      "https://starmandscircleassoc.com/about-us",
      "https://starmandscircleassoc.com/circle-history",
      "https://starmandscircleassoc.com/parking-transportation",
    ]),
  }),
  "ChIJg2IFCAE5w4gRjoL2et_wuBw": Object.freeze({
    name: "Main Street at Lakewood Ranch",
    editorial: "A walkable town center for an evening stroll, dinner and a movie along its lakeside Main Street.",
    verifiedAt: "2026-07-18",
    sources: Object.freeze([
      "https://www.lakewoodranch.com/main-street/",
      "https://www.yourobserver.com/news/2025/nov/15/lakewood-main-street-milestone/",
    ]),
  }),
  "ChIJi43QGNE5w4gRgxvO7rqqJfE": Object.freeze({
    name: "Waterside Place",
    editorial: "A lakefront shopping-and-dining district for a park-once stroll among restaurants, shops and Kingfisher Lake.",
    verifiedAt: "2026-07-18",
    sources: Object.freeze([
      "https://www.lakewoodranch.com/waterside-place/",
      "https://www.visitsarasota.com/article/bounty-farmers-markets-found-sarasota-county",
    ]),
  }),
});

export const NIGHT_OUT_DISTRICT_IDS = Object.freeze(Object.keys(NIGHT_OUT_DISTRICT_EVIDENCE));

export function nightOutEditorialEvidence(placeId) {
  const id = String(placeId || "");
  return NIGHT_OUT_EDITORIAL_EVIDENCE[id]?.editorial || NIGHT_OUT_DISTRICT_EVIDENCE[id]?.editorial || null;
}

export function nightOutAttributes(placeId) {
  return NIGHT_OUT_DISTRICT_EVIDENCE[String(placeId || "")] ? { district: true } : null;
}
