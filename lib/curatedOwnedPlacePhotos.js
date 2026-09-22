// lib/curatedOwnedPlacePhotos.js — SERVER-side. Owned, non-Google photos for
// curated places, where the business itself has approved Wayfind's use of its
// own photography and a credit line.
//
// WHY THIS FILE EXISTS. lib/curatedPhotoRefs.js bridges a curated place to a
// Google photo resource name when the id is not in wf_inventory. This file is
// the OTHER curated bridge: a place that IS (or may be) in wf_inventory, but
// whose card must show a specific business-approved photo instead of
// whatever Google photo_ref the inventory row carries — and, most load-
// bearing, WITHOUT taking a Google Places Photo grant. lib/placePhoto's
// cardImageSrc ladder checks an owned `photo_url` (rung 1) before an owned
// Google `photo_ref` (rung 2), so a curated entry here always wins over a
// row's photo_ref — zero Google Places calls for that card, guaranteed by
// ladder order rather than by trusting inventory to stay ref-less.
//
// Format: place_id -> { url, w, h, alt, credit, creditUrl, note }.
//   url        a local, owned /public asset path (never a hotlink — checked
//              by lib/placePhoto.isPlaceOwnedPhotoUrl at every call site).
//   credit /
//   creditUrl  rendered by RailCard / IconicPlaceCard's existing photoAttr
//              corner badge — the same slot Wikimedia-licensed photos use.
//   note       the permission record: who approved it, when, and for what.
//
// See public/places/CREDITS.md for the file-level source/owner/treatment
// ledger that mirrors public/events/CREDITS.md's convention.
export const CURATED_OWNED_PLACE_PHOTOS = Object.freeze({
  // Pinto's Farm, Redland/Miami — owner approved Wayfind's use of Pinto's own
  // photography with credit (owner confirmation, 2026-09-22). A family riding
  // the farm's paddle-boat lagoon ride, one of the attractions included with
  // 2026 Fall at the Farm admission.
  "ChIJUczTK5XC2YgRRt4Jp6N3B70": Object.freeze({
    url: "/places/pintos-farm-family-paddleboat.webp",
    w: 1000, h: 910,
    alt: "A family riding a blue paddle boat across the lagoon at Pinto's Farm",
    credit: "Pinto's Farm",
    creditUrl: "https://pintofarm.com/upcoming-events",
    note: "Approved by Pinto's Farm for use on Wayfind with credit (owner confirmation, 2026-09-22). Source: pintofarm.com.",
  }),
});
