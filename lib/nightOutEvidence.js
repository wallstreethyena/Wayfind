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

export function nightOutEditorialEvidence(placeId) {
  return NIGHT_OUT_EDITORIAL_EVIDENCE[String(placeId || "")]?.editorial || null;
}
