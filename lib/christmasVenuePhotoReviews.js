// lib/christmasVenuePhotoReviews.js: hand reviewed venue photos for Christmas
// EVENT cards that have no photo of their own (reviewed 2026-11-12).
//
// Rule: a Christmas EVENT card with no photo may show its venue's stored
// Google Maps photo only when a person opened that exact photo version and it
// shows the holiday itself at that venue (the tree, the lights). A year round
// venue shot never qualifies: the owner's batch 11x rule (2026-11-04,
// lib/fallEventImage.js) keeps those cards on the designed tile, and
// docs/IMAGE_INTENT_RULE.md says no picture beats a wrong picture.
//
// Each entry pins the exact stored photo version that was looked at. When the
// store refreshes a venue's photo the version changes and the card goes back
// to its designed tile until someone reviews the new picture. Rejected entries
// stay listed with the reason so nobody re-adds them without looking.
// Locked by scripts/check-christmas-venue-photo-reviews.mjs.
export const CHRISTMAS_VENUE_PHOTO_REVIEWED_AT = "2026-11-12";

export const CHRISTMAS_VENUE_PHOTO_ACCEPTED = Object.freeze({
  "ChIJ4aH4U0bV54gR9HE5r_NLsTM": {
    "venue": "Ocala Downtown Square",
    "version": "b240cec1b8638dbe8e44ddf1fa93da9b6c05995cdd8889ecb854f05fbeee9df2",
    "events": [
      "light-up-ocala-2026"
    ],
    "shows": "Downtown Ocala square at night with the lit Christmas tree, the tree Light Up Ocala lights"
  },
  "ChIJu73by6Rbw4gR857K3YRfLQo": {
    "venue": "Centennial Park Venice",
    "version": "0b8873c066e4ef713ca3a223334a86b34e47c5865ba6c0d97cf1ec5b59d599d2",
    "events": [
      "venice-mayors-hometown-christmas-2026"
    ],
    "shows": "Centennial Park gazebo with the decorated Christmas tree, where The Mayor's Hometown Christmas is held"
  }
});

export const CHRISTMAS_VENUE_PHOTO_REJECTED = Object.freeze({
  "ChIJ-RBXBQFu54gRXwya8AZBGJA": {
    "venue": "Lake Concord Park",
    "version": "0e20ca5e0dfe31f933d422db0f3719946ad36a2de75c0619958d9bbfb6304ada",
    "events": [
      "casselberry-tree-lighting-2026"
    ],
    "reason": "photographer's shadow in frame"
  },
  "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8": {
    "venue": "St. Armands Circle",
    "version": "c9c0b11675ba039b64c687d983bd900b87d794a9ddfbdfc0b9d2bb3c69832bdb",
    "events": [
      "st-armands-holiday-night-of-lights-2026"
    ],
    "reason": "one boutique storefront, not the circle"
  },
  "ChIJ3yybHX3f2IgR63BD308M-Ko": {
    "venue": "Second Rodeo",
    "version": "748ae0e23db1fed2dcca4e6f6ff26764f8cad351ab515ec2a8bf84f0b17ced4f",
    "events": [
      "second-rodeo-sippin-santa-2026"
    ],
    "reason": "kitchen grill close up"
  },
  "ChIJ4ZCLFL1z3YgRNn4jbA4LGGI": {
    "venue": "Lake Eva Community Center",
    "version": "55fd1ecc08056090bfa7de3740126658451a546ab519005f114c462c77aca180",
    "events": [
      "haines-city-christmas-parade-2026"
    ],
    "reason": "plain playground"
  },
  "ChIJ6_k9TmCz5YgRZoTCykSG8rA": {
    "venue": "Jacksonville Arboretum",
    "version": "70d78d0fedef718b21f2b289773a5bff0a254a654365413135650d54a95a87c1",
    "events": [
      "glowing-gardens-2026"
    ],
    "reason": "trail sign, says nothing about a light show"
  },
  "ChIJdRWXR0Qp54gR013YFmrkVMA": {
    "venue": "Outriggers Tiki Bar",
    "version": "4d65a92b7a7fac38bbe31da322c9a197c05aa4540a6df5eadb387089580c6074",
    "events": [
      "sippin-santa-nsb-2026"
    ],
    "reason": "banquet setup with guests, misrepresents the pop up"
  },
  "ChIJg1HuP9xbw4gRs9PHCFmC4VU": {
    "venue": "Maxine Barritt Park",
    "version": "9f064ff6b58803d18dbcc449fc8aa3457bc76066e43d3ff62209154743412db4",
    "events": [
      "venice-nights-christmas-carols-2026"
    ],
    "reason": "plain pavilion"
  },
  "ChIJL7PWGcPR54gR2BbPdCHsGJ4": {
    "venue": "Lake Lillian Pavilion",
    "version": "c8e4a79b7fe46c9d4c52237e2ae7b02610b25869ae9dd88543552fb0634959e7",
    "events": [
      "ocala-belleview-christmas-parade-2026"
    ],
    "reason": "plain pond"
  },
  "ChIJMZ2NFvQB2YgRCwcJecybdGY": {
    "venue": "Las Olas Oceanside Park",
    "version": "25aa0c0d980bf63bbabecb2810a28d98642389b482d42c9d2c44de35d38ee51f",
    "events": [
      "light-up-the-beach-2026"
    ],
    "reason": "yoga class on the lawn, misrepresents a beach lighting"
  },
  "ChIJn_4zMBJAw4gRnyPviItiNRs": {
    "venue": "Art Ovation Hotel",
    "version": "2c5274632d9833a472b4e52cc346ba923e97f626795ef3da732dba3b2e008317",
    "events": [
      "art-ovation-holiday-art-mart-2026"
    ],
    "reason": "rooftop pool, misrepresents an art market"
  },
  "ChIJPYY9yxPzwogRhFOrmxJ1BLY": {
    "venue": "Downtown Palm Harbor",
    "version": "80aa07d3e8443a703541d54501d46424f89ca95b582d8d078d99b2f402ea6bf4",
    "events": [
      "palm-harbor-christmas-parade-tree-lighting-2026"
    ],
    "reason": "carnival ride, misrepresents a parade and tree lighting"
  },
  "ChIJR6tho_7hwogRcONKTjQvrNk": {
    "venue": "Coastal Creative",
    "version": "2626a6e22019707fab12964c33d530039fd8a1e27e2bcc3d3f325fb41c39fdef",
    "events": [
      "st-pete-ballet-nutcracker-2026"
    ],
    "reason": "empty white studio, unappealing"
  },
  "ChIJu54LVI1654gR4wd8T-CvADg": {
    "venue": "Gaston Edwards Park",
    "version": "1461d52349aa40086e812c97d7827d473e867c0c0f26a134c13e93ce494c8d51",
    "events": [
      "jingle-eve-ivanhoe-2026"
    ],
    "reason": "just a park sign"
  },
  "ChIJx1ylWdvE5YgRbXbUtGm1u8Q": {
    "venue": "Whitey's Fish Camp",
    "version": "1c1fd7c3f289b44b2e52fe1af94da5d62568a3f2694715ab387d810d25e750f6",
    "events": [
      "whiteys-boat-parade-2026"
    ],
    "reason": "dark entry, unappealing"
  },
  "ChIJ-QhIoDBz6IgR7dCwpZGFeTU": {
    "venue": "Liberty Park",
    "version": "db51c9c2579cc00d4981abaff4be85b1b8e2ba6824df1511a8cfad57f7809d3a",
    "events": [
      "inverness-light-up-liberty-2026"
    ],
    "reason": "Honest photo of the venue (Liberty Park boardwalk gazebo on the lake) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJ1zIbt3sB2YgR_8jyaGTRxJg": {
    "venue": "The Shorely",
    "version": "a28ffdaecfe768e50f5c14ae89ffda7605f3d172913fafc475822234ddcfec53",
    "events": [
      "miracle-shorely-marina-village-2026"
    ],
    "reason": "Honest photo of the venue (The Shorely deck at Marina Village) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJ24y7SQsT3YgR57bNmVn0Aqc": {
    "venue": "Sauvage",
    "version": "69aebe84191f9025363337baaaae0f309acb51d060e649549c01504618a47eaa",
    "events": [
      "miracle-at-sauvage-2026"
    ],
    "reason": "Honest photo of the venue (Sauvage storefront) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJ3TSFiBBw54gRM5repItsIWI": {
    "venue": "Central Park",
    "version": "15ccf002f5b7795cad31c24066f038fb8cc3f68d15cdf01f4b760c8d012e4877",
    "events": [
      "morse-christmas-in-the-park-2026",
      "winter-park-christmas-parade-2026",
      "holiday-pops-winter-park-2026"
    ],
    "reason": "Honest photo of the venue (Central Park fountain, Winter Park) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJ5zC5An2i54gRhNaZaHwZbjE": {
    "venue": "Elizabeth Evans Park",
    "version": "fcfe27a2b397ce2356ba158b949aeb3b80ec6dfbe5346760141ed162e7104e58",
    "events": [
      "light-up-mount-dora-2026",
      "mount-dora-lighted-boat-christmas-parade-2026"
    ],
    "reason": "Honest photo of the venue (Elizabeth Evans Park gazebo on Lake Dora at dusk) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJ86kIPeDFkIgRdsrbssu0Jwk": {
    "venue": "Pensacola Beach Boardwalk",
    "version": "6ea44bef62c83eb9ede59318ff4ba72c4f5814828485cdcafcdf74a8adda6943",
    "events": [
      "pensacola-beach-lighted-boat-parade-2026"
    ],
    "reason": "Honest photo of the venue (Pensacola Beach water tower landmark) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJB-QyVtEXw4gRk5F8bn3YV28": {
    "venue": "Manatee PAC",
    "version": "434945827a00fe07d38937d30a9c291c0835927562fb7e400c5ff240b61ae155",
    "events": [
      "manatee-pac-ibf-nutcracker-2026"
    ],
    "reason": "Honest photo of the venue (Manatee Performing Arts Center exterior at dusk) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJC2p8EbKj6IgRKUUx8t8-8L0": {
    "venue": "Cry Baby's",
    "version": "0379ca27b446e94682ef40d36af687ae6a0065cdba5ea6122ce3b4bc704a6e2c",
    "events": [
      "gainesville-miracle-cry-babys-2026"
    ],
    "reason": "Honest photo of the venue (Cry Baby's bar interior) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJe2BjEpziwogRZ4IPOMe7ZT8": {
    "venue": "Williams Pier Gulfport",
    "version": "13c145561c129d839aa6048042b19c90c1ddf93be8d39f494a30b36a68d487bf",
    "events": [
      "boca-ciega-yacht-club-lighted-christmas-boat-parade-2026"
    ],
    "reason": "Honest photo of the venue (Williams Pier, Gulfport, on the parade route) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJg8Z6yxjc5ogRgdYAlFKTxIc": {
    "venue": "Tanger Daytona",
    "version": "9699e95623ac54dcb163313dc4b48bd3eaf192ab470783ca6e1054948fba8adf",
    "events": [
      "tanger-daytona-tree-lighting-2026"
    ],
    "reason": "Honest photo of the venue (Tanger Outlets Daytona Beach walkway) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJHWXmMdewwogRk8JI-PK3rS0": {
    "venue": "Shops at Wiregrass",
    "version": "7b405651f370233b7f7ce0d2ea4c88017c5a06b93bd73ef4be0db33b0a69b9e2",
    "events": [
      "wiregrass-symphony-in-lights-2026"
    ],
    "reason": "Honest photo of the venue (The Shops at Wiregrass plaza) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJi2PkeXZBw4gRLZVjT4APW88": {
    "venue": "Tamiami Tap",
    "version": "646f377bb0cba88f3f224366faac65c8976e4e937b82a3d2d313e416842a02c8",
    "events": [
      "tamiami-tap-miracle-2026"
    ],
    "reason": "Honest photo of the venue (Tamiami Tap bar) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJJSK6DAolw4gR2-tcgDhSPVI": {
    "venue": "Parrish Community Park",
    "version": "392bc237f6ec8d5df556294f152850e69cc047367f9740af23a1674810ed4022",
    "events": [
      "parrish-hometown-christmas-2026"
    ],
    "reason": "Honest photo of the venue (Parrish Community Park) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJK8XimDu954gRDL72avt1fZE": {
    "venue": "BTW's",
    "version": "f8dfa8f4ca12c39e9a83cefca58853f9a8d050331594f5e19f43277f204d349e",
    "events": [
      "miracle-on-main-tavares-2026"
    ],
    "reason": "Honest photo of the venue (BTW's Crafted Concoctions bar interior) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJKccOvYNp54gRpfmAywZYEwI": {
    "venue": "Center Lake Park",
    "version": "1a71da23768be57434f1dd0acc34fc87cb26938fd476d6db0975ddabeed6f49f",
    "events": [
      "oviedo-winter-parade-2026"
    ],
    "reason": "Honest photo of the venue (Center Lake Park, Oviedo) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJlb5TDjSj54gRpJ9aO8JkTyc": {
    "venue": "Ferran Park",
    "version": "8c30bec9c11cdaaa651fb2da8a0224c8fe9f30fb27ef751c22022673c9c484cf",
    "events": [
      "light-up-eustis-2026"
    ],
    "reason": "Honest photo of the venue (Ferran Park fountain on Lake Eustis) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJlzQP_oF93YgRf8tcZ0bC38U": {
    "venue": "Sunset Walk",
    "version": "30f4dea6b1c05abb4bd3d0d314e455b3b95edc3255b4f2a5580737133273cb75",
    "events": [
      "sunset-walk-holiday-nights-2026"
    ],
    "reason": "Honest photo of the venue (Promenade at Sunset Walk street) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJpxlaxgx-54gRpmFrDKgSHq4": {
    "venue": "Cala Bella",
    "version": "06a4d2637b9e43f2583e476710489e4da258103e8711c2c154f9eb8927e7bbe8",
    "events": [
      "rosenshinglecreek-christmasbrunch-2026"
    ],
    "reason": "Honest photo of the venue (Cala Bella dining room, Rosen Shingle Creek) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJqQ1Avv5DkYgR19YWeQV8UiQ": {
    "venue": "HarborWalk Village",
    "version": "87b66bb0fc94c86b3aac6f9c2a1b8bdcbac623d8aab86f64477d1722fb42ab71",
    "events": [
      "harborwalk-grande-tree-lighting-2026",
      "harborwalk-santa-arrival-2026"
    ],
    "reason": "Honest photo of the venue (HarborWalk Village harbor lit up at dusk) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJQSiwx8I5w4gR41iFcFHYCWQ": {
    "venue": "Waterside Pavilion",
    "version": "d5d9453d5cedb5e840e9668997e0c97b97c073694e60d78b4729c36c7a0b3cac",
    "events": [
      "lwr-waterside-festival-band-2026"
    ],
    "reason": "Honest photo of the venue (Waterside Pavilion plaza, Lakewood Ranch) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJQwikKNrjwogR734UinU6wVs": {
    "venue": "Bar Mezzo",
    "version": "4c5daaa41ccccf483da5cbe4f8aaa7bab683ff6bdc4c74047cf642696dcd881b",
    "events": [
      "miracle-barmezzo-stpete-2026"
    ],
    "reason": "Honest photo of the venue (Bar Mezzo interior with its sign) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJresjyGKi54gRq3lL2HIBC90": {
    "venue": "Sunset Park",
    "version": "88f0e3013dfc670d68096cf15eb79bf811ecd995153d815d12266895d163e203",
    "events": [
      "mount-dora-christmas-walk-2026"
    ],
    "reason": "Honest photo of the venue (Sunset Park dock on Lake Dora at sunset) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJu5KCkJYn5IgRVVjGR-aX2N4": {
    "venue": "Forgotten Tonic",
    "version": "93bb29a1ebbe7d8ee1fc4abde16fa175329d3a73af1414d3ee8d313a6ae72d8f",
    "events": [
      "miracle-forgotten-tonic-staug-2026"
    ],
    "reason": "Honest photo of the venue (Forgotten Tonic patio on its St. Augustine street) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  },
  "ChIJwYoIDIjEwogR2Qnt9YxA-1U": {
    "venue": "Carol Morsani Hall",
    "version": "97c599d97c9d1549fc67ddbd78c60b4c3a2eee9a27dd5fa94374acc6222eaf85",
    "events": [
      "ngb-nutcracker-straz-2026"
    ],
    "reason": "Honest photo of the venue (Carol Morsani Hall auditorium, Straz Center) but a year round shot; the batch 11x rule (2026-11-04) keeps Christmas event cards on the tile until a photo of the holiday event itself exists"
  }
});

const VERSION = /\?v=([a-f0-9]{64})$/;

// True only for the exact reviewed photo of an accepted venue.
export function reviewedVenuePhoto(placeId, src) {
  const entry = CHRISTMAS_VENUE_PHOTO_ACCEPTED[placeId];
  if (!entry || typeof src !== "string") return false;
  const m = src.match(VERSION);
  return !!m && m[1] === entry.version && src.startsWith("/api/photo/stored/" + placeId + "?");
}
