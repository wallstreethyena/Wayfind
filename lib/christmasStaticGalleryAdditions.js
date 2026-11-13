// lib/christmasStaticGalleryAdditions.js: Christmas event photos added after
// the main CHRISTMAS_STATIC_GALLERY in lib/christmasPlacePhotos.js. Kept in its
// own file so later photo batches never collide with edits to the big map.
// christmasStaticPhotos() appends these after the event's existing photos (the
// existing cover stays first); an event with no existing photos takes this
// list as is, cover first. Same strip shape as CHRISTMAS_STATIC_GALLERY.
//
// batch 2026-11z: Boat Parades & Coastal Traditions shelf (Venice, Marco
// Island, Tampa Riverwalk, Madeira Beach, King Fisher canal cruise, Yacht
// StarShip). Every file is 1280x853 JPEG, checked by eye, no overlays.
//
// batch 2026-11z-b: Christmas cards that showed the drawn tile (Sanford
// parade, Celebration of Lights, Christmas Club at The Oasis, Ballet Pensacola
// Nutcracker, Space Coast Holiday Food Fest and more). Two listings that are
// the same event under two ids (Surfing Santas, Fort Myers Holiday House)
// carry the same photos under both ids.
//
// batch 2026-12a: Christmas cards that showed only a Google venue shot or had
// fewer than 7 photos, in shelf order (lights, towns and markets, theme parks,
// boat parades, shows and outings, seasonal food). Photos come from each
// organizer's own official website. Listings that are one event under two ids
// (Punta Gorda Light Up the Night, Stuart Christmas on Main) carry the same
// photos under both ids. Every file is 1280x853 JPEG, checked by eye, no
// overlays, logos or text.
//
// batch 2026-12b: Wikimedia Commons photos (CC licensed, credited) for
// Christmas cards that still showed only a Google venue shot or fewer than 7
// photos: Edison and Ford Holiday Nights, ZooTampa Christmas in the Wild, St.
// Johns Town Center Holiday Spectacular and the City of Orlando tree at Lake
// Eola. Edison and Ford keeps its current cover first (the same Commons photo,
// now hosted and credited).
//
// batch 2026-12c: Christmas cards that still showed the drawn tile, with
// photos from each organizer's own website, the city or chamber event page,
// or the official tourism board (Amelia Island CVB, Destination Panama City).
// Winter Garden photos are matched to the city page of the event they show.
// Listings that are one event under two ids (Christmas Reflections in DeFuniak
// Springs; the St. Lucie County boat parade, Marco Island street parade and
// Fernandina downtown lighting, which already carry a photo under their other
// id) share photos. Every file is 1280x853 JPEG, checked by eye, no overlays,
// logos or added text.
//
// batch 2026-12d: Christmas cards that still showed the drawn tile or fewer
// than 7 photos, with photos found through Openverse (Flickr, CC licensed and
// credited to each photographer): Holiday Lights in the Gardens and Holiday
// Lights in Largo Central Park, Candlelight Processional at EPCOT, Disney
// Springs, the Grand Floridian gingerbread displays, Universal Holidays and
// its holiday parade, Jacksonville ZooLights, Holidays at Bok Tower Gardens
// (Pinewood Estate) and St. Augustine Light Up Night. Every photo shows the
// event itself in season. Every file is 1280x853 JPEG, checked by eye, no
// overlays, logos or added text.
//
// batch 2026-12e: Wonderland Circus by Nik Wallenda (Mall at UTC, Sarasota)
// showed "Photo unavailable" because its only image was the venue photo route,
// which has no stored photo for the mall. Three photos from the show's own
// site (wonderlandcircus.com): the high wire act, the big top at UTC at night
// and the Wallenda troupe on the wire. Stock and AI images on that site were
// skipped. Every file is 1280x853 JPEG, checked by eye, no added text.

export const CHRISTMAS_STATIC_GALLERY_ADDITIONS = Object.freeze({
  "venice-christmas-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11z/venice-christmas-boat-parade-2026/ev_7424114f9426c886.jpg",
      "credit": "Venice Christmas Boat Parade official website",
      "href": "https://static.wixstatic.com/media/7cb9dc_d267f04d30a942d08e3906d0a4203d9a~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/venice-christmas-boat-parade-2026/ev_270f4f623b2145a4.jpg",
      "credit": "Venice Christmas Boat Parade official website",
      "href": "https://static.wixstatic.com/media/ed9346_aab1cf83d21a4ff3b4e5ae5d8f29f3c2~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/venice-christmas-boat-parade-2026/ev_81f4d93886400cad.jpg",
      "credit": "Venice Christmas Boat Parade official website",
      "href": "https://static.wixstatic.com/media/ed9346_983efd0085a945e3ac85a6a8adce0aadf000.jpg"
    }
  ],
  "marco-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_8ddca9fe0808fc03.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/IMG_6077_easyHDR.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_daee7c18282c5105.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/2025_C.I.S._Boat_Parade_41.jpg?bwg=1767020051"
    },
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_de3592dbd14a87cd.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/IMG_6048_easyHDR-default.jpg?bwg=1767020052"
    },
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_ec6867e1177d45c3.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/IMG_6062_easyHDR-default.jpg?bwg=1767020052"
    },
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_3b8d35216dab2b85.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/IMG_6082_easyHDR.jpg?bwg=1767020052"
    },
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_3c47fe2e0825092e.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/2025_C.I.S._Boat_Parade_30.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/marco-boat-parade-2026/ev_5f04f1c061cac63d.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/photo-gallery/Boatparade25/IMG_6065_easyHDR-default.jpg?bwg=1767020051"
    }
  ],
  "tampa-riverwalk-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_a038008e2052ee25.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/2c628339-e5c2-4f86-b461-b34019ac82b6.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_f4c0822f2af75eb4.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/b1c14908-7b31-407c-8921-4b80c43e6851.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_192996d8183a7871.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/3407083f-fa7c-4224-a993-be3012368337.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_fe3829d0e25bfff7.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/7403c3b9-2a72-48d7-bab8-121993b63679.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_693a06a9e6294851.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/ad9020d2-2b7b-4ec4-9bb3-9bd6c376158d.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_b9287689b1059f9d.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/4e804e6d-bc85-48b7-b0c8-cfe494a9e990.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/tampa-riverwalk-boat-parade-2026/ev_c20ff0b2d4647a45.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://cdn.firespring.com/images/a169696c-4f7a-4775-87e0-10999db973b1.jpg"
    }
  ],
  "madeira-beach-festival-of-lights-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11z/madeira-beach-festival-of-lights-boat-parade-2026/ev_3913cff5cfc10052.jpg",
      "credit": "Richard Mc Neil, CC BY 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Parade_d%27embarcations_illumin%C3%A9es_%C3%A0_Madeira_Beach,florida,_USA._Parade_of_lighted_boats_in_Madeira_Beach_-_panoramio.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z/madeira-beach-festival-of-lights-boat-parade-2026/ev_aa38e3b0f7e5b01d.jpg",
      "credit": "Richard Mc Neil, CC BY 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Boats_Parade_in_John%27s_Pass,_Madeira_Beach,_Florida_-_panoramio.jpg"
    }
  ],
  "king-fisher-christmas-light-canal-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-11z/king-fisher-christmas-light-canal-cruise-2026/ev_c3bcc49efc3d92cc.jpg",
      "credit": "King Fisher Fleet official website",
      "href": "https://kingfisherfleet.com/wp-content/uploads/sites/7547/2024/09/Sunset-Cruise-Christmas-Light-Canal-Cruise-Combo-Aboard-the-Miss-Elissa-image-5.jpg"
    }
  ],
  "yacht-starship-tampa-boat-parade-dinner-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-11z/yacht-starship-tampa-boat-parade-dinner-cruise-2026/ev_8b703b2dabfe44f6.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/wp-content/uploads/2025/06/Still-1-e1784138768128.jpg"
    }
  ],
  "sanford-holiday-parade-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_d94953623abd37f3.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/IMG_4200-scaled.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_1c3ee84ccb454e4f.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/IMG_4146-scaled.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_85a96ff106834010.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/Photo-Dec-14-2024-7-20-40-AM.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_e1a8a1b14cac1af3.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/Photo-Dec-14-2024-6-40-06-AM.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_c778aa8094a146c0.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/IMG_4164-scaled.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_a87b2d2ae06a03a7.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/Photo-Dec-14-2024-6-51-54-AM.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/sanford-holiday-parade-of-lights-2026/ev_d1526d45eda4c884.jpg",
      "credit": "City of Sanford official website",
      "href": "https://sanfordfl.gov/wp-content/uploads/2025/10/IMG_4324-scaled.jpg"
    }
  ],
  "celebration-of-lights-concourse-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/celebration-of-lights-concourse-2026/ev_9d1eda241d49bbf4.jpg",
      "credit": "J David via Celebration of Lights official website",
      "href": "https://celebrationoflightsfl.com/wp-content/uploads/2024/10/411950794_10229551638202936_2798363613424371162_n.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/celebration-of-lights-concourse-2026/ev_6efc7cfab2e62437.jpg",
      "credit": "J David via Celebration of Lights official website",
      "href": "https://celebrationoflightsfl.com/wp-content/uploads/2024/10/412834608_10229551620842502_5442469851428557873_n-1024x683.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/celebration-of-lights-concourse-2026/ev_254be51bd19e9bbc.jpg",
      "credit": "J David via Celebration of Lights official website",
      "href": "https://celebrationoflightsfl.com/wp-content/uploads/2021/04/20201204_213542_HDR-1024x768.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/celebration-of-lights-concourse-2026/ev_b9aa9777a6afbeb5.jpg",
      "credit": "J David via Celebration of Lights official website",
      "href": "https://celebrationoflightsfl.com/wp-content/uploads/2024/10/413887224_10229551640763000_9107447617439723892_n-1024x683.jpg"
    }
  ],
  "christmas-club-oasis-naples-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_aaf620a398303794.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2023/11/IMG_4055-2048x1536.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_7da58839485a8556.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2023/11/IMG_4012-2048x1251.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_33b6658bdfee9406.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2023/11/IMG_4029-1600x1200.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_4d5c48a78b2bce77.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2023/11/IMG_4019-1600x1200.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_48fd86281562f80f.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2023/11/IMG_4060-2048x1536.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_106e8b4f0667cee5.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2025/11/thumbnail-13-1024x657.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-club-oasis-naples-2026/ev_559b03cae74ac602.jpg",
      "credit": "The Oasis Naples official website",
      "href": "https://theoasisnaples.com/wp-content/uploads/2025/11/thumbnail-4.jpg"
    }
  ],
  "ballet-pensacola-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/ballet-pensacola-nutcracker-2026/ev_bcfc778e89538e40.jpg",
      "credit": "Ballet Pensacola official website",
      "href": "https://images.squarespace-cdn.com/content/v1/688a53675cf40257b9a1b725/587768e7-deb6-418e-a02b-e29ba4aa5b56/EM1_4850.jpg?format=2500w"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/ballet-pensacola-nutcracker-2026/ev_3a923a0d1e193990.jpg",
      "credit": "Ballet Pensacola official website",
      "href": "https://images.squarespace-cdn.com/content/v1/688a53675cf40257b9a1b725/513b49b4-5bfc-436e-b5f6-ce85e6715a8b/EM2_6271.jpg?format=2500w"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/ballet-pensacola-nutcracker-2026/ev_4f7bc874fffd31e9.jpg",
      "credit": "Ballet Pensacola official website",
      "href": "https://images.squarespace-cdn.com/content/v1/688a53675cf40257b9a1b725/6b29bd28-205b-4686-aaee-2e62307cf0f5/EM2_6790.jpg?format=2500w"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/ballet-pensacola-nutcracker-2026/ev_bfc9c3c9c6c5eba5.jpg",
      "credit": "Ballet Pensacola official website",
      "href": "https://images.squarespace-cdn.com/content/v1/688a53675cf40257b9a1b725/8b9bb038-d353-4fe3-9ee9-8af170025ae3/Our+Calendar.jpeg?format=1000w"
    }
  ],
  "brooksville-christmas-on-main-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/brooksville-christmas-on-main-2026/ev_828b3a670c1afc16.jpg",
      "credit": "We Love BVL official website",
      "href": "https://images.squarespace-cdn.com/content/v1/609971c1784f7e5561cc49e0/f862d68f-9158-44e4-a068-e60ff95eaf57/2014-12-24+BvilleChrsEve+%2824%29.jpg?format=2500w"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/brooksville-christmas-on-main-2026/ev_adf1954a2c9a9adc.jpg",
      "credit": "We Love BVL official website",
      "href": "https://images.squarespace-cdn.com/content/v1/609971c1784f7e5561cc49e0/90641999-0a90-4494-a31f-42e9cc22f491/CW8F9643.jpg?format=1500w"
    }
  ],
  "christmas-island-style-street-parade-marco-island-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-island-style-street-parade-marco-island-2026/ev_aabdefd130322169.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/2026/04/IMG_0168.jpeg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/christmas-island-style-street-parade-marco-island-2026/ev_daf9cef602e0e709.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/wp-content/uploads/2026/04/IMG_0169.jpeg"
    }
  ],
  "fort-myers-holiday-house-stroll-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/fort-myers-holiday-house-stroll-2026/ev_0cd4329403e5b39a.jpg",
      "credit": "Fort Myers Woman's Community Club official website",
      "href": "https://static.wixstatic.com/media/0b7e1b_7f19a75684ae45348097c37c5fd7b2f0~mv2.jpg"
    }
  ],
  "hidden-cypress-farm-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/hidden-cypress-farm-christmas-2026/ev_c33e613722fcffdc.jpg",
      "credit": "Hidden Cypress Farm official website",
      "href": "https://static.wixstatic.com/media/37f7d5_b2b1709212654f5d821fa25aae3ca248~mv2.png"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/hidden-cypress-farm-christmas-2026/ev_32ff4b179d9b401d.jpg",
      "credit": "Hidden Cypress Farm official website",
      "href": "https://static.wixstatic.com/media/37f7d5_23bb2c3095944379b807189a91f6b9a5f000.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/hidden-cypress-farm-christmas-2026/ev_3f622fcfc85583d8.jpg",
      "credit": "Hidden Cypress Farm official website",
      "href": "https://static.wixstatic.com/media/37f7d5_71a5bf6aa2dc4a379f48e321c50c640d~mv2.png"
    }
  ],
  "old-citrus-estate-whoville-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/old-citrus-estate-whoville-2026/ev_a13d13050780cbbd.jpg",
      "credit": "The Old Citrus Estate official website",
      "href": "https://static.wixstatic.com/media/3a2579_fc1949a0495648c8b0f86bb09280e2fc~mv2.png"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/old-citrus-estate-whoville-2026/ev_98cf10315025a61c.jpg",
      "credit": "The Old Citrus Estate official website",
      "href": "https://static.wixstatic.com/media/3a2579_9cae55575b3a4eaf82e5fc6b11754970~mv2.png"
    }
  ],
  "ritz-amelia-santa-gingerbread-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/ritz-amelia-santa-gingerbread-2026/ev_83c4efb2ca3ede4c.jpg",
      "credit": "The Ritz Carlton Amelia Island official website",
      "href": "https://cache.marriott.com/is/image/marriotts7prod/rz-jaxam-ritz-carlton-christmas-tr-16911:Wide-Hor?wid=992&fit=constrain"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/ritz-amelia-santa-gingerbread-2026/ev_ab3c907abcb7ff44.jpg",
      "credit": "The Ritz Carlton Amelia Island official website",
      "href": "https://cache.marriott.com/is/image/marriotts7prod/rz-jaxam-breakfast-with-santa-30656:Classic-Hor?wid=1200&fit=constrain"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/ritz-amelia-santa-gingerbread-2026/ev_aad3cb63b615bc60.jpg",
      "credit": "The Ritz Carlton Amelia Island official website",
      "href": "https://cache.marriott.com/is/image/marriotts7prod/rz-jaxam-santa-s-magical-dinner-33092:Classic-Hor?wid=1200&fit=constrain"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/ritz-amelia-santa-gingerbread-2026/ev_462d416a64a7787e.jpg",
      "credit": "The Ritz Carlton Amelia Island official website",
      "href": "https://cache.marriott.com/is/image/marriotts7prod/rz-jaxam-kid-decorates-gingerbread-10233:Classic-Hor?wid=1200&fit=constrain"
    }
  ],
  "seaside-photos-with-santa-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/seaside-photos-with-santa-2026/ev_ae07b610585fbeaa.jpg",
      "credit": "Seaside official website",
      "href": "https://cdn.seasidefl.com/wp-content/uploads/2025/04/20151810/537658412_1205184204969881_3467180840813954609_n.jpg"
    }
  ],
  "space-coast-holiday-food-fest-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_f788f391d4dcd5fc.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F705715089%252F347053741771%252F1%252Foriginal.20240226-201929%3Fw%3D1880%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26s%3D69f3a75e2812a0cfd811bbc1eec90260&w=1880&q=75"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_082b7c24a788bf97.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/3rd-annual-space-coast-holiday-food-fest-craft-fair-2026-tickets-1992595270092"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_1260a63a09882b00.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/3rd-annual-space-coast-holiday-food-fest-craft-fair-2026-tickets-1992595270092"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_28afc5f105a632d6.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/3rd-annual-space-coast-holiday-food-fest-craft-fair-2026-tickets-1992595270092"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_96057e29178b8221.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/_next/image?url=https%3A%2F%2Fimg.evbuc.com%2Fhttps%253A%252F%252Fcdn.evbuc.com%252Fimages%252F1093192383%252F347053741771%252F1%252Foriginal.20250811-195757%3Fw%3D1880%26auto%3Dformat%252Ccompress%26q%3D75%26sharp%3D10%26s%3D591b23bc86ff76f21e80f795883607d8&w=1080&q=75"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_ed9c504801199b70.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/3rd-annual-space-coast-holiday-food-fest-craft-fair-2026-tickets-1992595270092"
    },
    {
      "src": "/place-photos/batch-2026-11z-b/space-coast-holiday-food-fest-2026/ev_d101749b64dc5757.jpg",
      "credit": "Space Coast Holiday Food Fest organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/3rd-annual-space-coast-holiday-food-fest-craft-fair-2026-tickets-1992595270092"
    }
  ],
  "surfing-santas-cocoa-beach-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/surfing-santas-cocoa-beach-2026/ev_6369cb2b139abc9c.jpg",
      "credit": "Cassie Fisher via Surfing Santas official website",
      "href": "https://surfingsantas.org/wp-content/uploads/2026/09/cassiefisher_surfingsantas25-83-small-1536x1025.jpg"
    }
  ],
  "tarpon-springs-sponge-docks-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/tarpon-springs-sponge-docks-tree-lighting-2026/ev_fde424cdb22f4954.jpg",
      "credit": "Explore Tarpon Springs official website",
      "href": "https://exploretarponsprings.com/wp-content/uploads/2023/02/5a26d260dfe7d.image_-1200x900.jpg"
    }
  ],
  "fernandina-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/fernandina-tree-lighting-2026/ev_4c9f2085a31de4e8.jpg",
      "credit": "Amelia Island Convention and Visitors Bureau official website",
      "href": "https://www.ameliaisland.com/wp-content/uploads/Amelia-Holidays-Downtown-Tree-Lighting.jpg"
    }
  ],
  "omni-amelia-holiday-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/omni-amelia-holiday-lights-2026/ev_97659f2947bae90b.jpg",
      "credit": "Amelia Island Convention and Visitors Bureau official website",
      "href": "https://www.ameliaisland.com/wp-content/uploads/2024-Amelia-Omni-Tree-Lighting-Holiday-Lights-Celebration.jpg"
    }
  ],
  "surfing-santas-of-cocoa-beach-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/surfing-santas-cocoa-beach-2026/ev_6369cb2b139abc9c.jpg",
      "credit": "Cassie Fisher via Surfing Santas official website",
      "href": "https://surfingsantas.org/wp-content/uploads/2026/09/cassiefisher_surfingsantas25-83-small-1536x1025.jpg"
    }
  ],
  "holiday-house-and-stroll-fort-myers-2026": [
    {
      "src": "/place-photos/batch-2026-11z-b/fort-myers-holiday-house-stroll-2026/ev_0cd4329403e5b39a.jpg",
      "credit": "Fort Myers Woman's Community Club official website",
      "href": "https://static.wixstatic.com/media/0b7e1b_7f19a75684ae45348097c37c5fd7b2f0~mv2.jpg"
    }
  ],
  "utc-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-12a/utc-holidays-2026/ev_e749cb881d1ade88.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/family-friendly-5-1.jpg?auto=format&q=35&h=1&ar=680%3A436&fit=crop&w=884"
    }
  ],
  "the-wonderland-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12a/the-wonderland-of-lights-2026/ev_89d5b71cd0582c3c.jpg",
      "credit": "The Wonderland of Lights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/648346471c5dd74ba2fce7b5/f28d2592-b46e-496c-9581-2d3b17974eb7/Screenshot+2023-06-09+at+12.27.59+PM.png?format=2500w"
    }
  ],
  "naples-night-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12a/naples-night-lights-2026/ev_ce45c258a21d9de7.jpg",
      "credit": "Naples Botanical Garden official website",
      "href": "https://www.naplesgarden.org/wp-content/uploads/2026/09/JNL-12_13_24_014-1024x673.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/naples-night-lights-2026/ev_2a580e9617a00c2b.jpg",
      "credit": "Naples Botanical Garden official website",
      "href": "https://www.naplesgarden.org/wp-content/uploads/2024/07/JNL_12_26_25_010-1-2048x1169.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/naples-night-lights-2026/ev_8eaa3e73344060c9.jpg",
      "credit": "Naples Botanical Garden official website",
      "href": "https://www.naplesgarden.org/wp-content/uploads/2026/09/JNL_12_26_25_013-scaled.jpg"
    }
  ],
  "dazzling-nights-leu-2026": [
    {
      "src": "/place-photos/batch-2026-12a/dazzling-nights-leu-2026/ev_a07a8f0e931d200b.jpg",
      "credit": "Dazzling Nights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/5f4d37bcf6740c688b1ce110/95b31b19-2ffd-444c-aa24-b5132a65c9c7/DN26-web-poinsettia2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/dazzling-nights-leu-2026/ev_fdfd43b19b172892.jpg",
      "credit": "Dazzling Nights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/5f4d37bcf6740c688b1ce110/a027696e-9fde-4e3f-99f0-f2354739d6c7/under-the-mistletoe.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/dazzling-nights-leu-2026/ev_8e2c9530a66b20ee.jpg",
      "credit": "Dazzling Nights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/5f4d37bcf6740c688b1ce110/3f4ec06f-2195-457f-be62-cc2987429ad0/DN26-web-polar.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/dazzling-nights-leu-2026/ev_4d183ff0b378d7ac.jpg",
      "credit": "Dazzling Nights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/5f4d37bcf6740c688b1ce110/f6575311-a19f-4ccb-886a-513eb41c3e42/DN26-web-sparkling.jpg?format=1500w"
    },
    {
      "src": "/place-photos/batch-2026-12a/dazzling-nights-leu-2026/ev_84336547849b9840.jpg",
      "credit": "Dazzling Nights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/5f4d37bcf6740c688b1ce110/7f1021e7-e3e8-447e-9308-944566f52c99/20241125-_DSC4500-Enhanced-NR.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/dazzling-nights-leu-2026/ev_994970a05fa5ac8d.jpg",
      "credit": "Dazzling Nights official website",
      "href": "https://images.squarespace-cdn.com/content/v1/5f4d37bcf6740c688b1ce110/f323315f-4581-4ccf-9b48-f0d5c2b0c692/twinkle-market.jpg?format=1500w"
    }
  ],
  "wec-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-12a/wec-winter-wonderland-2026/ev_517c3dee3f0b11ef.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2026/07/2025-Winter-Wonderland-19877-1-818x545.jpg"
    }
  ],
  "magic-of-lights-daytona-2026": [
    {
      "src": "/place-photos/batch-2026-12a/magic-of-lights-daytona-2026/ev_3350669f99b45621.jpg",
      "credit": "Magic of Lights official website",
      "href": "https://magicoflights.com/wp-content/uploads/2024/08/MOL10.webp"
    }
  ],
  "mckee-jungle-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12a/mckee-jungle-lights-2026/ev_669a73df0e51c95b.jpg",
      "credit": "McKee Botanical Garden official website",
      "href": "https://mckeegarden.org/wp-content/uploads/2025/10/McKee-Jungle-Lights-3-1024x682.webp"
    }
  ],
  "lighthouse-illuminations-2026": [
    {
      "src": "/place-photos/batch-2026-12a/lighthouse-illuminations-2026/ev_10ae0ea648d4f12c.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/sites/default/files/styles/hero_tablet/public/2025-11/lighthouse-keepers-house-holiday-25x15-WEB.jpg?itok=fgf9GpTW"
    }
  ],
  "nightgarden-fairchild-2026": [
    {
      "src": "/place-photos/batch-2026-12a/nightgarden-fairchild-2026/ev_e5c1b6293305b82f.jpg",
      "credit": "NightGarden official website",
      "href": "https://thenightgarden.co/assets/img/experience/experience-01-2026.e837c7c9.webp"
    },
    {
      "src": "/place-photos/batch-2026-12a/nightgarden-fairchild-2026/ev_ac7576c92dea33a6.jpg",
      "credit": "NightGarden official website",
      "href": "https://thenightgarden.co/assets/img/gallery/gallery-01.aff31a20.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/nightgarden-fairchild-2026/ev_16a723e1f03cfc29.jpg",
      "credit": "NightGarden official website",
      "href": "https://thenightgarden.co/assets/img/gallery/gallery-02.4a1b4343.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/nightgarden-fairchild-2026/ev_bf677a3d0f499c6f.jpg",
      "credit": "NightGarden official website",
      "href": "https://thenightgarden.co/assets/img/gallery/gallery-06.7136a01b.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/nightgarden-fairchild-2026/ev_ea579dbd9f3d737a.jpg",
      "credit": "NightGarden official website",
      "href": "https://thenightgarden.co/assets/img/experience/experience-03-2026.c4cc0b7c.webp"
    },
    {
      "src": "/place-photos/batch-2026-12a/nightgarden-fairchild-2026/ev_e841c8dc30b73e32.jpg",
      "credit": "NightGarden official website",
      "href": "https://thenightgarden.co/assets/img/gallery/gallery-03.daafa118.jpg"
    }
  ],
  "zoo-lights-miami-2026": [
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-miami-2026/ev_543eaad279f554a5.jpg",
      "credit": "Zoo Miami official website",
      "href": "https://www.zoomiami.org/assets/2891/img_9908.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-miami-2026/ev_938248ddc4332124.jpg",
      "credit": "Zoo Miami official website",
      "href": "https://www.zoomiami.org/assets/2891/img_0115.jpg?w=1440"
    },
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-miami-2026/ev_44e02755036aa7bb.jpg",
      "credit": "Zoo Miami official website",
      "href": "https://www.zoomiami.org/assets/2891/img_0435.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-miami-2026/ev_5caa9e9c28a0b251.jpg",
      "credit": "Zoo Miami official website",
      "href": "https://www.zoomiami.org/assets/2891/dsc_0880.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-miami-2026/ev_f7f7979625fe6374.jpg",
      "credit": "Zoo Miami official website",
      "href": "https://www.zoomiami.org/assets/2891/dsc_0919.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-miami-2026/ev_f2ff62a88f0fa503.jpg",
      "credit": "Zoo Miami official website",
      "href": "https://www.zoomiami.org/assets/2891/dsc_0798-2025121101400095.jpg"
    }
  ],
  "zoo-lights-at-palm-beach-zoo-2026": [
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-at-palm-beach-zoo-2026/ev_aab34e3759ae9ca8.jpg",
      "credit": "Palm Beach Zoo official website",
      "href": "https://www.palmbeachzoo.org/assets/2589/36ab37c2-a2cd-44f6-988c-98b5ef0ccf4a.webp"
    },
    {
      "src": "/place-photos/batch-2026-12a/zoo-lights-at-palm-beach-zoo-2026/ev_31538c95fa02a854.jpg",
      "credit": "Palm Beach Zoo official website",
      "href": "https://www.palmbeachzoo.org/assets/2589/6d7c828a-20eb-44e3-93f5-d3883ecd5364.webp"
    }
  ],
  "deck-the-chairs-2026": [
    {
      "src": "/place-photos/batch-2026-12a/deck-the-chairs-2026/ev_30115116a20f6769.jpg",
      "credit": "Deck the Chairs official website",
      "href": "https://static.wixstatic.com/media/f9b5cb_14b13bb685a04217a05dc747765e750a~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/deck-the-chairs-2026/ev_85830030699cd662.jpg",
      "credit": "Deck the Chairs official website",
      "href": "https://static.wixstatic.com/media/f9b5cb_fbf7c0066e834def9f18da508666cad2~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/deck-the-chairs-2026/ev_f936539efe1c6e0a.jpg",
      "credit": "Deck the Chairs official website",
      "href": "https://static.wixstatic.com/media/f9b5cb_4ae0084544ad49e7b18f4b1b5cc23a0df000.jpg"
    }
  ],
  "old-town-trolley-nol-2026": [
    {
      "src": "/place-photos/batch-2026-12a/old-town-trolley-nol-2026/ev_0e97c9b6246f9209.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/sites/default/files/styles/meta_16x9/public/2025-10/OTT1_NOLApp%20copy%202-25x15-WEB.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/old-town-trolley-nol-2026/ev_5471965a2974dfb9.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/sites/default/files/styles/xxl/public/ott-nol-flagler-college-hirdj-web.jpg?itok=XY-e8JS9"
    }
  ],
  "meadows-farmers-holiday-market-2026": [
    {
      "src": "/place-photos/batch-2026-12a/meadows-farmers-holiday-market-2026/ev_f91fdf41590c826f.jpg",
      "credit": "Holiday market organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/season-6-holiday-market-kick-off-with-santa-tickets-2002178125671"
    },
    {
      "src": "/place-photos/batch-2026-12a/meadows-farmers-holiday-market-2026/ev_b397612d7aa3a84f.jpg",
      "credit": "Holiday market organizer on Eventbrite",
      "href": "https://www.eventbrite.com/e/season-6-holiday-market-kick-off-with-santa-tickets-2002178125671"
    }
  ],
  "light-up-the-night-punta-gorda-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12a/light-up-the-night-punta-gorda-tree-lighting-2026/ev_928026ab37e65664.jpg",
      "credit": "Light Up the Night Punta Gorda official website",
      "href": "https://irp.cdn-website.com/1ec4be51/dms3rep/multi/opt/656cd2f087b67.image-1920w.png"
    }
  ],
  "punta-gorda-light-up-the-night-2026": [
    {
      "src": "/place-photos/batch-2026-12a/punta-gorda-light-up-the-night-2026/ev_928026ab37e65664.jpg",
      "credit": "Light Up the Night Punta Gorda official website",
      "href": "https://irp.cdn-website.com/1ec4be51/dms3rep/multi/opt/656cd2f087b67.image-1920w.png"
    }
  ],
  "winter-village-tampa-2026": [
    {
      "src": "/place-photos/batch-2026-12a/winter-village-tampa-2026/ev_7648cfe1d25ab2d7.jpg",
      "credit": "Winter Village Tampa official website",
      "href": "https://wintervillagetampa.com/assets/images/container16.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/winter-village-tampa-2026/ev_5bddbf12adbadcd7.jpg",
      "credit": "Winter Village Tampa official website",
      "href": "https://wintervillagetampa.com/assets/images/image05.jpg?v=fd3df04f"
    }
  ],
  "city-of-orlando-tree-lighting-celebration-2026": [
    {
      "src": "/place-photos/batch-2026-12a/city-of-orlando-tree-lighting-celebration-2026/ev_1d5c6dd3f008e347.jpg",
      "credit": "City of Orlando official website",
      "href": "https://www.orlando.gov/files/sharedassets/public/v/2/event-images/christmas-tree.jpg?dimension=pageimagefullwidth&w=992"
    },
    {
      "src": "/place-photos/batch-2026-12b/city-of-orlando-tree-lighting-celebration-2026/ev_6bf4a04fd8b41c82.jpg",
      "credit": "Michael Rivera via Wikimedia Commons, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_tree_in_Lake_Eola_park.jpg"
    }
  ],
  "winter-on-the-avenue-2026": [
    {
      "src": "/place-photos/batch-2026-12a/winter-on-the-avenue-2026/ev_1c6fc8bafc9af04c.jpg",
      "credit": "City of Winter Park official website",
      "href": "https://edge.growthzonecms.com/sites/574/2024/06/WOTA-tree.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/winter-on-the-avenue-2026/ev_8d96e98fcb0d1775.jpg",
      "credit": "City of Winter Park official website",
      "href": "https://edge.growthzonecms.com/sites/574/2024/06/WOTA-Bubble-Bus.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/winter-on-the-avenue-2026/ev_65f627271011f45c.jpg",
      "credit": "City of Winter Park official website",
      "href": "https://edge.growthzonecms.com/sites/574/2024/06/WOTA-Santa-kids-carolers-1024x683.jpg"
    }
  ],
  "palm-coast-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12a/palm-coast-tree-lighting-2026/ev_5b29c1df88f84d19.jpg",
      "credit": "City of Palm Coast official website",
      "href": "https://copc-strapi-production.s3.amazonaws.com/DSC_0186_1299490f3f.JPG"
    },
    {
      "src": "/place-photos/batch-2026-12a/palm-coast-tree-lighting-2026/ev_4e5a332c285f4f3f.jpg",
      "credit": "City of Palm Coast official website",
      "href": "https://copc-strapi-production.s3.amazonaws.com/DSC_0130_b9a45ad735.JPG"
    },
    {
      "src": "/place-photos/batch-2026-12a/palm-coast-tree-lighting-2026/ev_8b0d84e5d44bcb25.jpg",
      "credit": "City of Palm Coast official website",
      "href": "https://copc-strapi-production.s3.amazonaws.com/DSC_0175_aa09ef1566.JPG"
    }
  ],
  "christmas-on-las-olas-2026": [
    {
      "src": "/place-photos/batch-2026-12a/christmas-on-las-olas-2026/ev_a1ff022b93cec516.jpg",
      "credit": "Las Olas Boulevard official website",
      "href": "https://static.wixstatic.com/media/7b78b3_6a41b40a9cbf49c18413816e7e5fe97f~mv2.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-on-las-olas-2026/ev_d07a99176be72f0d.jpg",
      "credit": "Las Olas Boulevard official website",
      "href": "https://static.wixstatic.com/media/7b78b3_bdb14d9226af4b09b7555b604cacc725~mv2.jpg"
    }
  ],
  "stuart-christmas-on-main-2026": [
    {
      "src": "/place-photos/batch-2026-12a/stuart-christmas-on-main-2026/ev_817323c41e85844e.jpg",
      "credit": "Stuart Main Street official website",
      "href": "https://stuartmainstreet.org/wp-content/uploads/2024/10/mainstreet-59-1-1500x1000.jpg"
    }
  ],
  "stuart-christmas-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12a/stuart-christmas-tree-lighting-2026/ev_817323c41e85844e.jpg",
      "credit": "Stuart Main Street official website",
      "href": "https://stuartmainstreet.org/wp-content/uploads/2024/10/mainstreet-59-1-1500x1000.jpg"
    }
  ],
  "colonial-quarter-christmas-market-2026": [
    {
      "src": "/place-photos/batch-2026-12a/colonial-quarter-christmas-market-2026/ev_ad19bac0d3269004.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/sites/default/files/styles/hero_desktop/public/2024-11/colonial-quarter-holiday-market-open-area-25x15-WEB.jpg?itok=2B3IoKdf"
    },
    {
      "src": "/place-photos/batch-2026-12a/colonial-quarter-christmas-market-2026/ev_b676509dcfe1f825.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/sites/default/files/styles/xxl/public/2024-12/colonial-night-market-m-marcarelli-path2-25x15-WEB.jpg?itok=h3KfaKMg"
    }
  ],
  "merry-main-street-defuniak-2026": [
    {
      "src": "/place-photos/batch-2026-12a/merry-main-street-defuniak-2026/ev_3dfb5e476cfa268c.jpg",
      "credit": "Main Street DeFuniak Springs official website",
      "href": "https://mainstreetdfs.org/wp-content/uploads/2021/10/879A9980-1024x723.jpg"
    }
  ],
  "christmas-town-2026": [
    {
      "src": "/place-photos/batch-2026-12a/christmas-town-2026/ev_1ccd2c08fbd0436f.jpg",
      "credit": "Busch Gardens Tampa Bay official website",
      "href": "https://buschgardens.com/tampa/-/media/commercial/busch-gardens-tampa-bay/images/events/core-events/christmas-town/2024/media-module/750x422_bgt_event_ct_meet_santa.jpg?h=844&w=1500&la=en&hash=87F20D071D6754F3F5418AC690CEB7F2"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-town-2026/ev_5205576d901675ff.jpg",
      "credit": "Busch Gardens Tampa Bay official website",
      "href": "https://buschgardens.com/tampa/-/media/commercial/busch-gardens-tampa-bay/images/events/core-events/christmas-town/2024/media-module/750x422_bgt_event_ct_train_04.jpg?h=844&w=1500&la=en&hash=76849F16DBF55A5AE90C5C7CEF90D4ED"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-town-2026/ev_455c72265ffb20da.jpg",
      "credit": "Busch Gardens Tampa Bay official website",
      "href": "https://buschgardens.com/tampa/-/media/commercial/busch-gardens-tampa-bay/images/events/core-events/christmas-town/2024/s-curve/714x458_bgt_event_ct_holly_jolly_express.jpg?h=916&w=1428&la=en&hash=3BEF4595C74959922E0C90D495926798"
    }
  ],
  "epcot-festival-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-12a/epcot-festival-holidays-2026/ev_bd3d40f625629ac6.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1349/464/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/festival-of-the-holidays/experience/1212ZN_3324AFN_JB_R2-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/epcot-festival-holidays-2026/ev_2e32b0eaa3cf6662.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1300/544/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/festival-of-the-holidays/cookie-stroll/1215ZP_4639MS_JRoh_R2-1-16x9.jpg?2025-08-29T18:48:54+00:00"
    },
    {
      "src": "/place-photos/batch-2026-12a/epcot-festival-holidays-2026/ev_9c00fb91c66f7c55.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1349/464/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/festival-of-the-holidays/shopping/1215ZP_4837MS_JRoh-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/epcot-festival-holidays-2026/ev_5afb946fd5ad582e.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1349/464/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/festival-of-the-holidays/entertainment/Joyful-v2-16x9.jpg"
    }
  ],
  "seaworld-orlando-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-12a/seaworld-orlando-christmas-2026/ev_ef34fc1f0a83a879.jpg",
      "credit": "SeaWorld Orlando official website",
      "href": "https://seaworld.com/orlando/-/media/migrated-media/seaworld-orlando/images/events/christmas-celebration/2023/1800x900-swo-events-2023-christmas-sot.jpg?h=900&w=1800&la=en&hash=7080D18ABD07DD8E4ECAE92C88594076"
    },
    {
      "src": "/place-photos/batch-2026-12a/seaworld-orlando-christmas-2026/ev_124e34b90b2d13fd.jpg",
      "credit": "SeaWorld Orlando official website",
      "href": "https://seaworld.com/orlando/-/media/migrated-media/seaworld-orlando/images/events/christmas-celebration/380x237/380x237fireworks.jpg?h=1152&w=2048&la=en&hash=73E72C161ACA1A80E0D9C9FA9B05BC61"
    }
  ],
  "ripleys-christmas-park-hialeah-2026": [
    {
      "src": "/place-photos/batch-2026-12a/ripleys-christmas-park-hialeah-2026/ev_7933b8c8ef0eed2e.jpg",
      "credit": "Ripley's Christmas Park official website",
      "href": "https://ripleyschristmaspark.com/images/site/template/slider/tree.jpg"
    }
  ],
  "christmas-wonderland-at-tropical-park-2026": [
    {
      "src": "/place-photos/batch-2026-12a/christmas-wonderland-at-tropical-park-2026/ev_3a22659e449063bc.jpg",
      "credit": "Christmas Wonderland Miami official website",
      "href": "https://miamiwonderland.com/wp-content/uploads/2026/11/hhM.jpeg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-wonderland-at-tropical-park-2026/ev_37f5ee80bca86f89.jpg",
      "credit": "Christmas Wonderland Miami official website",
      "href": "https://miamiwonderland.com/wp-content/uploads/2026/10/Twilight-Wheel-1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-wonderland-at-tropical-park-2026/ev_4fa70e91b5a7e680.jpg",
      "credit": "Christmas Wonderland Miami official website",
      "href": "https://miamiwonderland.com/wp-content/uploads/2026/10/Bavarian-Marketplace-1024x684.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-wonderland-at-tropical-park-2026/ev_b0397a2ede58e841.jpg",
      "credit": "Christmas Wonderland Miami official website",
      "href": "https://miamiwonderland.com/wp-content/uploads/2026/10/DSC01929-Enhanced-NR-scaled-1-2048x1368.webp"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-wonderland-at-tropical-park-2026/ev_1f72540d8b69a0c5.jpg",
      "credit": "Christmas Wonderland Miami official website",
      "href": "https://miamiwonderland.com/wp-content/uploads/2025/11/midway-header-1536x1024.jpg"
    }
  ],
  "wdw-holiday-season-2026": [
    {
      "src": "/place-photos/batch-2026-12a/wdw-holiday-season-2026/ev_e291e41d21380354.jpg",
      "credit": "Disney Parks Blog",
      "href": "https://disneyparksblog.com/app/uploads/2025/07/Mickey-and-Minnie-at-the-MVMCP-Parade-1024x683.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/wdw-holiday-season-2026/ev_8c3d7053a32fa9fa.jpg",
      "credit": "Disney Parks Blog",
      "href": "https://disneyparksblog.com/app/uploads/2025/07/2025-Walt-Disney-World-Holidays-EPCOT-1620x1080.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/wdw-holiday-season-2026/ev_45adc28a97f70b47.jpg",
      "credit": "Disney Parks Blog",
      "href": "https://disneyparksblog.com/app/uploads/2025/07/2025-Walt-Disney-World-Holidays-Magic-Kingdom-2.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/wdw-holiday-season-2026/ev_0c61a30f5f361298.jpg",
      "credit": "Disney Parks Blog",
      "href": "https://disneyparksblog.com/app/uploads/2025/07/2025-Walt-Disney-World-Holidays-Disneys-Hollywood-Studios-1024x683.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/wdw-holiday-season-2026/ev_4b22403b45a5320d.jpg",
      "credit": "Disney Parks Blog",
      "href": "https://disneyparksblog.com/app/uploads/2026/06/Disney-World-2026-Holidays.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/wdw-holiday-season-2026/ev_62e886a5070d0867.jpg",
      "credit": "Disney Parks Blog",
      "href": "https://disneyparksblog.com/app/uploads/2025/07/2025-Walt-Disney-World-Holidays-Santa-Claus-1620x1080.png"
    }
  ],
  "palm-beach-holiday-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-12a/palm-beach-holiday-boat-parade-2026/ev_605f05bf468fbeba.jpg",
      "credit": "Marine Industries Association of Palm Beach County official website",
      "href": "https://www.marinepbc.org/wp-content/uploads/sites/1055/2025/12/11-1024x822.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/palm-beach-holiday-boat-parade-2026/ev_a074aa866799ce44.jpg",
      "credit": "Marine Industries Association of Palm Beach County official website",
      "href": "https://www.marinepbc.org/wp-content/uploads/sites/1055/2023/02/2022-Boats-2-1536x1229.jpg"
    }
  ],
  "pensacola-beach-fireworks-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-12a/pensacola-beach-fireworks-cruise-2026/ev_f47b127b5912c7fb.jpg",
      "credit": "Visit Pensacola official website",
      "href": "https://www.visitpensacola.com/imager/assets_simpleviewinc_com/simpleview/image/upload/w_1024,h_1024,c_limit/crm/pensacola/IMG_8011_5D75293C-3F34-412E-89A296354E593B09_a6f04377-53e8-44bd-aceccc4bcf6dc4ec_e45adf5f6bc0c5c2a30a39868f44eab6.jpg"
    }
  ],
  "frrm-north-pole-express-2026": [
    {
      "src": "/place-photos/batch-2026-12a/frrm-north-pole-express-2026/ev_7160ae2a6709e1a6.jpg",
      "credit": "Florida Railroad Museum official website",
      "href": "https://www.frrm.org/wp-content/uploads/sites/4793/2021/07/XPRO4689.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/frrm-north-pole-express-2026/ev_f479e6f2ce67723d.jpg",
      "credit": "Florida Railroad Museum official website",
      "href": "https://www.frrm.org/wp-content/uploads/sites/4793/2021/07/NPE-Conductor.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/frrm-north-pole-express-2026/ev_ac82d164b21f6210.jpg",
      "credit": "Florida Railroad Museum official website",
      "href": "https://www.frrm.org/wp-content/uploads/sites/4793/2021/07/EXT59348_49_50_51_52_53-photomatix.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/frrm-north-pole-express-2026/ev_8bb48c724b1e1099.jpg",
      "credit": "Florida Railroad Museum official website",
      "href": "https://www.frrm.org/wp-content/uploads/sites/4793/2021/07/138-RR-museum-on-Willow-RD-11-15-2022.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/frrm-north-pole-express-2026/ev_16f10bbf23aa2f7e.jpg",
      "credit": "Florida Railroad Museum official website",
      "href": "https://www.frrm.org/wp-content/uploads/sites/4793/2021/07/89-RR-museum-on-Willow-RD-11-15-2022.jpg"
    }
  ],
  "utc-rink-2026": [
    {
      "src": "/place-photos/batch-2026-12a/utc-rink-2026/ev_85027cc37ad4496e.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/40-web-or-mls-UTC-2024-110.jpg?auto=format&q=35&h=1&ar=680%3A436&fit=crop&w=1188"
    }
  ],
  "naplescommunity-holidaypops-2026": [
    {
      "src": "/place-photos/batch-2026-12a/naplescommunity-holidaypops-2026/ev_7cf604c05d5dfb70.jpg",
      "credit": "Naples Community Orchestra official website",
      "href": "https://static.wixstatic.com/media/836c2a_e5f77d34bc0c41c5872d3a008fe668e5f003.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/naplescommunity-holidaypops-2026/ev_945918ab500d1c05.jpg",
      "credit": "Naples Community Orchestra official website",
      "href": "https://static.wixstatic.com/media/836c2a_a57f0014dd144ece86c3fbe5428802b3~mv2.jpeg"
    },
    {
      "src": "/place-photos/batch-2026-12a/naplescommunity-holidaypops-2026/ev_e520fc147b084196.jpg",
      "credit": "Naples Community Orchestra official website",
      "href": "https://static.wixstatic.com/media/836c2a_bda8c18bb97d40f99707cf647fb92ad4~mv2.jpeg"
    }
  ],
  "christmas-at-gaylord-palms-2026": [
    {
      "src": "/place-photos/batch-2026-12a/christmas-at-gaylord-palms-2026/ev_a26f024922964a1d.jpg",
      "credit": "Christmas at Gaylord Palms official website",
      "href": "https://www.christmasatgaylordpalms.com/resourcefiles/home-hero-slider/polar-express.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-at-gaylord-palms-2026/ev_da1aaac089552435.jpg",
      "credit": "Christmas at Gaylord Palms official website",
      "href": "https://www.christmasatgaylordpalms.com/resourcefiles/gallery-page/cookies-with-mrs-claus.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-at-gaylord-palms-2026/ev_c4a9135d952a50f2.jpg",
      "credit": "Christmas at Gaylord Palms official website",
      "href": "https://www.christmasatgaylordpalms.com/resourcefiles/gallery-page/ge-mcogp-snowball-build-and-blas-gaylord-palms.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-at-gaylord-palms-2026/ev_4e5e03a19222f9a7.jpg",
      "credit": "Christmas at Gaylord Palms official website",
      "href": "https://www.christmasatgaylordpalms.com/resourcefiles/gallery-page/christmas-lights-1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-at-gaylord-palms-2026/ev_0d5ebfc2e7ba6e2a.jpg",
      "credit": "Christmas at Gaylord Palms official website",
      "href": "https://www.christmasatgaylordpalms.com/resourcefiles/gallery-page/scaletta-ice-at-gaylord-palms.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/christmas-at-gaylord-palms-2026/ev_73e8cdd2be27d77d.jpg",
      "credit": "Christmas at Gaylord Palms official website",
      "href": "https://www.christmasatgaylordpalms.com/resourcefiles/gallery-page/kid-enjoying-ice-slide-at-gaylord-palms.jpg"
    }
  ],
  "deering-estate-historic-holiday-decor-2026": [
    {
      "src": "/place-photos/batch-2026-12a/deering-estate-historic-holiday-decor-2026/ev_565c1b15e7c4f8f3.jpg",
      "credit": "Deering Estate official website",
      "href": "https://deeringestate.org/wp-content/uploads/2023/10/Holiday-Decor-Tides-Tidings.jpg"
    }
  ],
  "bonnet-house-holiday-magic-2026": [
    {
      "src": "/place-photos/batch-2026-12a/bonnet-house-holiday-magic-2026/ev_d8eb3dde9bc3e277.jpg",
      "credit": "Bonnet House official website",
      "href": "https://www.bonnethouse.org/wp-content/uploads/2023/07/CWP2019_santabonnet-52-scaled-1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/bonnet-house-holiday-magic-2026/ev_5d8ede070247e678.jpg",
      "credit": "Bonnet House official website",
      "href": "https://www.bonnethouse.org/wp-content/uploads/2022/04/video-placeholder.jpg"
    }
  ],
  "vizcaya-late-holiday-evening-2026": [
    {
      "src": "/place-photos/batch-2026-12a/vizcaya-late-holiday-evening-2026/ev_7c18207cac7b4a39.jpg",
      "credit": "Greater Miami Convention and Visitors Bureau official website",
      "href": "https://assets.simpleviewinc.com/simpleview/image/upload/c_limit,w_1000/f_auto/crm/miamifl/Vizcaya-Holiday-Evening-2-_0D916A89-C63A-4BD9-B06965193F214315_d5420c2d-c596-4309-9dd112a3e1751caa.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/vizcaya-late-holiday-evening-2026/ev_1aae7a66eb5e3df9.jpg",
      "credit": "Greater Miami Convention and Visitors Bureau official website",
      "href": "https://assets.simpleviewinc.com/simpleview/image/upload/c_limit,w_1000/f_auto/crm/miamifl/Vizcaya-Hokiday-Evening---gardens_EF6ABFAC-F740-43C8-BD400D2DD8D4F1C2_33a4e141-2f5c-4aff-8471ec66245759e4.png"
    },
    {
      "src": "/place-photos/batch-2026-12a/vizcaya-late-holiday-evening-2026/ev_561194b6e7218e11.jpg",
      "credit": "Greater Miami Convention and Visitors Bureau official website",
      "href": "https://assets.simpleviewinc.com/simpleview/image/upload/crm/miamifl/Vizcaya-Holiday-Evening_8C54A0B1-79C5-4922-B0ADE73606B1ECD6_23963b9a-6479-4d68-9d252986f36df60c.png"
    }
  ],
  "flagler-museum-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-12a/flagler-museum-holidays-2026/ev_2189749b81f29104.jpg",
      "credit": "Flagler Museum official website",
      "href": "https://www.flaglermuseum.org/images/general/Holiday-Evening-Tours.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/flagler-museum-holidays-2026/ev_87d112d51fdab5c4.jpg",
      "credit": "Flagler Museum official website",
      "href": "https://www.flaglermuseum.org/images/general/Christmas-Tree-Lightning-Festivities.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/flagler-museum-holidays-2026/ev_0d9e2fa975cab568.jpg",
      "credit": "Flagler Museum official website",
      "href": "https://www.flaglermuseum.org/images/general/Fleurs-de-Villes-Exhibition.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/flagler-museum-holidays-2026/ev_9a658b21512a12cd.jpg",
      "credit": "Flagler Museum official website",
      "href": "https://www.flaglermuseum.org/images/general/Holiday-Festivities-Header.jpg"
    }
  ],
  "deering-mistletoe-martinis-2026": [
    {
      "src": "/place-photos/batch-2026-12a/deering-mistletoe-martinis-2026/ev_aabf92943455f15a.jpg",
      "credit": "Deering Estate official website",
      "href": "https://deeringestate.org/wp-content/uploads/2023/11/Santa-2023-resize.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12a/deering-mistletoe-martinis-2026/ev_01a5c0ddda807f0c.jpg",
      "credit": "Deering Estate official website",
      "href": "https://deeringestate.org/wp-content/uploads/2025/10/097-RH1_8032-scaled.jpg"
    }
  ],
  "edison-and-ford-holiday-nights-2026": [
    {
      "src": "/place-photos/batch-2026-12b/edison-and-ford-holiday-nights-2026/ev_dfb5e3c065f55045.jpg",
      "credit": "Russ via Wikimedia Commons, CC BY 2.0",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_palms_edison_and_ford_estates_(16128689981).jpg"
    },
    {
      "src": "/place-photos/batch-2026-12b/edison-and-ford-holiday-nights-2026/ev_1d43a86391b06bcd.jpg",
      "credit": "Russ via Wikimedia Commons, CC BY 2.0",
      "href": "https://commons.wikimedia.org/wiki/File:Live_oak_christmas_ford_estate_ft_myers_(16104802146).jpg"
    }
  ],
  "zootampa-christmas-wild-2026": [
    {
      "src": "/place-photos/batch-2026-12b/zootampa-christmas-wild-2026/ev_c4a002f131247ab8.jpg",
      "credit": "Ssriram mt via Wikimedia Commons, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_Lighting_-_Lowry_Park_Zoo3.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12b/zootampa-christmas-wild-2026/ev_75aa6a2af8faea98.jpg",
      "credit": "Ssriram mt via Wikimedia Commons, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_Lighting_-_Lowry_Park_Zoo5.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12b/zootampa-christmas-wild-2026/ev_5f10c66d925babb4.jpg",
      "credit": "Ssriram mt via Wikimedia Commons, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_Lighting_-_Lowry_Park_Zoo4.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12b/zootampa-christmas-wild-2026/ev_914fa08a4f67a36d.jpg",
      "credit": "Ssriram mt via Wikimedia Commons, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_Lighting_-_Lowry_Park_Zoo2.jpg"
    }
  ],
  "st-johns-town-center-holiday-spectacular-2026": [
    {
      "src": "/place-photos/batch-2026-12b/st-johns-town-center-holiday-spectacular-2026/ev_cd37cd52c7f44735.jpg",
      "credit": "Michael Rivera via Wikimedia Commons, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:2017_Christmas_tree,_St._Johns_Town_Center.jpg"
    },
    {
      "src": "/place-photos/batch-2026-12b/st-johns-town-center-holiday-spectacular-2026/ev_bd712dd86cfd9ff9.jpg",
      "credit": "Michael Rivera via Wikimedia Commons, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Giant_Christmas_Ornament,_St._Johns_Town_Center.jpg"
    }
  ],
  "a-merry-winter-garden-light-show-2026": [
    {
      "src": "/place-photos/batch-2026-12c/a-merry-winter-garden-light-show-2026/ev_4f937e6ce2572428.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/915/A-Merry-Winter-Garden-Light-Show-2026"
    }
  ],
  "winter-garden-golf-cart-parade-night-market-2026": [
    {
      "src": "/place-photos/batch-2026-12c/winter-garden-golf-cart-parade-night-market-2026/ev_aa3696b08b78dc18.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/913/Winter-Garden-Christmas-Golf-Cart-Parade"
    },
    {
      "src": "/place-photos/batch-2026-12c/winter-garden-golf-cart-parade-night-market-2026/ev_00ab0f283703ceed.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/923/Holiday-Night-Market-2026---December-5"
    },
    {
      "src": "/place-photos/batch-2026-12c/winter-garden-golf-cart-parade-night-market-2026/ev_0348e73ea09d7850.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/923/Holiday-Night-Market-2026---December-5"
    },
    {
      "src": "/place-photos/batch-2026-12c/winter-garden-golf-cart-parade-night-market-2026/ev_035e413963b2d48a.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/923/Holiday-Night-Market-2026---December-5"
    },
    {
      "src": "/place-photos/batch-2026-12c/winter-garden-golf-cart-parade-night-market-2026/ev_d8cb241e6c968e08.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/923/Holiday-Night-Market-2026---December-5"
    },
    {
      "src": "/place-photos/batch-2026-12c/winter-garden-golf-cart-parade-night-market-2026/ev_4d3ece7f7358bac6.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.wgpd.com/923/Holiday-Night-Market-2026---December-5"
    }
  ],
  "light-up-winter-garden-2026": [
    {
      "src": "/place-photos/batch-2026-12c/light-up-winter-garden-2026/ev_802232b34538f5dc.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.cwgdn.com/925/Tis-the-Season-2026-Event-Schedule"
    },
    {
      "src": "/place-photos/batch-2026-12c/light-up-winter-garden-2026/ev_805ef9a155c5b5d0.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.cwgdn.com/925/Tis-the-Season-2026-Event-Schedule"
    },
    {
      "src": "/place-photos/batch-2026-12c/light-up-winter-garden-2026/ev_9ab3bfc4caeb09a7.jpg",
      "credit": "City of Winter Garden official website",
      "href": "https://www.cwgdn.com/925/Tis-the-Season-2026-Event-Schedule"
    }
  ],
  "bradenton-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-12c/bradenton-winter-wonderland-2026/ev_cd144322d3ccac48.jpg",
      "credit": "Realize Bradenton official website",
      "href": "https://www.realizebradenton.com/"
    }
  ],
  "lakeland-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-12c/lakeland-christmas-parade-2026/ev_1e93f93ed93c5ce2.jpg",
      "credit": "Junior League of Greater Lakeland official website",
      "href": "https://www.jlgl.org/"
    }
  ],
  "debary-winter-walk-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12c/debary-winter-walk-of-lights-2026/ev_4151757ac576a5fc.jpg",
      "credit": "City of DeBary official website",
      "href": "https://www.debary.org/334/Winter-Walk-of-Lights"
    }
  ],
  "st-lucie-county-christmas-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-12c/st-lucie-county-christmas-boat-parade-2026/ev_54c12b94474759b6.jpg",
      "credit": "Fort Pierce Yacht Club official website",
      "href": "https://www.fortpierceyachtclub.com/SLC-Christmas-Boat-Parade/"
    }
  ],
  "deerfield-ocean-way-holiday-2026": [
    {
      "src": "/place-photos/batch-2026-12c/deerfield-ocean-way-holiday-2026/ev_7a73735397b5e5eb.jpg",
      "credit": "City of Deerfield Beach official website",
      "href": "https://www.deerfield-beach.com/1298/Ocean-Way-Holiday"
    },
    {
      "src": "/place-photos/batch-2026-12c/deerfield-ocean-way-holiday-2026/ev_ccb16836fd44b8ef.jpg",
      "credit": "City of Deerfield Beach official website",
      "href": "https://www.deerfield-beach.com/1298/Ocean-Way-Holiday"
    },
    {
      "src": "/place-photos/batch-2026-12c/deerfield-ocean-way-holiday-2026/ev_67563b3b9f8ca686.jpg",
      "credit": "City of Deerfield Beach official website",
      "href": "https://www.deerfield-beach.com/1298/Ocean-Way-Holiday"
    },
    {
      "src": "/place-photos/batch-2026-12c/deerfield-ocean-way-holiday-2026/ev_bdad0964574949d5.jpg",
      "credit": "City of Deerfield Beach official website",
      "href": "https://www.deerfield-beach.com/1298/Ocean-Way-Holiday"
    }
  ],
  "boynton-beach-holiday-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12c/boynton-beach-holiday-tree-lighting-2026/ev_ab5b2232eadc9a5b.jpg",
      "credit": "City of Boynton Beach official website",
      "href": "https://www.boynton-beach.org/660/Holidays-in-Boynton-Beach"
    }
  ],
  "marco-tree-lighting-christmas-island-style-2026": [
    {
      "src": "/place-photos/batch-2026-12c/marco-tree-lighting-christmas-island-style-2026/ev_961513991e3c2b29.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/"
    },
    {
      "src": "/place-photos/batch-2026-12c/marco-tree-lighting-christmas-island-style-2026/ev_74bb6b1c096cdd89.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/"
    }
  ],
  "marco-street-parade-2026": [
    {
      "src": "/place-photos/batch-2026-12c/marco-street-parade-2026/ev_7af57053cd23a93e.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/"
    },
    {
      "src": "/place-photos/batch-2026-12c/marco-street-parade-2026/ev_c47c6e475a9afe9b.jpg",
      "credit": "Christmas Island Style official website",
      "href": "https://christmasislandstyle.com/"
    }
  ],
  "gardens-mall-santa-2026": [
    {
      "src": "/place-photos/batch-2026-12c/gardens-mall-santa-2026/ev_082a30e4532c624d.jpg",
      "credit": "The Gardens Mall official website",
      "href": "https://www.thegardensmall.com/blog/santa-photos/"
    },
    {
      "src": "/place-photos/batch-2026-12c/gardens-mall-santa-2026/ev_a0d3a89437a8407e.jpg",
      "credit": "The Gardens Mall official website",
      "href": "https://www.thegardensmall.com/blog/santas-arrival-parade-2/"
    },
    {
      "src": "/place-photos/batch-2026-12c/gardens-mall-santa-2026/ev_f62556655bb18478.jpg",
      "credit": "The Gardens Mall official website",
      "href": "https://www.thegardensmall.com/blog/holiday-magic-at-the-gardens-mall/"
    },
    {
      "src": "/place-photos/batch-2026-12c/gardens-mall-santa-2026/ev_4e49ed99773270c3.jpg",
      "credit": "The Gardens Mall official website",
      "href": "https://www.thegardensmall.com/blog/holiday-magic-at-the-gardens-mall/"
    }
  ],
  "fernandina-downtown-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12c/fernandina-downtown-lights-2026/ev_dd53682603c1e7ef.jpg",
      "credit": "Amelia Island Convention and Visitors Bureau official website",
      "href": "https://www.ameliaisland.com/festivals-events/amelia-island-christmas/"
    }
  ],
  "tidings-twinkle-fernandina-2026": [
    {
      "src": "/place-photos/batch-2026-12c/tidings-twinkle-fernandina-2026/ev_f50b440df4ece256.jpg",
      "credit": "Amelia Island Convention and Visitors Bureau official website",
      "href": "https://www.ameliaisland.com/festivals-events/amelia-island-christmas/"
    }
  ],
  "christmas-on-walnut-street-2026": [
    {
      "src": "/place-photos/batch-2026-12c/christmas-on-walnut-street-2026/ev_a2bd7708727861fa.jpg",
      "credit": "City of Green Cove Springs official website",
      "href": "https://www.greencovesprings.com/285/Christmas-on-Walnut-Street"
    }
  ],
  "christmas-made-in-the-south-2026": [
    {
      "src": "/place-photos/batch-2026-12c/christmas-made-in-the-south-2026/ev_747732c08ee14f1a.jpg",
      "credit": "Made in the South Shows official website",
      "href": "https://madeinthesouthshows.com/"
    }
  ],
  "christmas-reflections-defuniak-2026": [
    {
      "src": "/place-photos/batch-2026-12c/christmas-reflections-defuniak-2026/ev_411ec0f8cd0ac6bf.jpg",
      "credit": "City of DeFuniak Springs official website",
      "href": "https://www.defuniaksprings.net/1097/Christmas-Reflections"
    }
  ],
  "christmas-reflections-defuniak-springs-2026": [
    {
      "src": "/place-photos/batch-2026-12c/christmas-reflections-defuniak-springs-2026/ev_411ec0f8cd0ac6bf.jpg",
      "credit": "City of DeFuniak Springs official website",
      "href": "https://www.defuniaksprings.net/1097/Christmas-Reflections"
    }
  ],
  "boat-parade-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12c/boat-parade-of-lights-2026/ev_1ed14a69886739bc.jpg",
      "credit": "Destination Panama City official website",
      "href": "https://destinationpanamacity.com/boat-parade-of-lights-vendor-application/"
    }
  ],
  "debary-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-12c/debary-christmas-parade-2026/ev_fd7ced526a57b22f.jpg",
      "credit": "City of DeBary official website",
      "href": "https://www.debary.org/332/Christmas-Parade"
    }
  ],
  "staug-ballet-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-12c/staug-ballet-nutcracker-2026/ev_944cae0f85c43115.jpg",
      "credit": "Saint Augustine Ballet official website",
      "href": "https://www.saintaugustineballet.org/nutcracker"
    }
  ],
  "gulf-breeze-jolly-holiday-market-2026": [
    {
      "src": "/place-photos/batch-2026-12c/gulf-breeze-jolly-holiday-market-2026/ev_cccb9cefcbea7e46.jpg",
      "credit": "Gulf Breeze Parks and Recreation official website",
      "href": "https://www.gulfbreezeparksandrecreation.com/jolly-market"
    }
  ],
  "holiday-lights-florida-botanical-2026": [
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-florida-botanical-2026/ev_a474e87d4061f638.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/6669082791"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-florida-botanical-2026/ev_60e745b2129643e2.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/6669065691"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-florida-botanical-2026/ev_3e1c410155c00ebf.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/6669062669"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-florida-botanical-2026/ev_a08a906d6a71c799.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/6669076363"
    }
  ],
  "holiday-lights-in-largo-central-park-2026": [
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-in-largo-central-park-2026/ev_90ad330716df1227.jpg",
      "credit": "Eric Kilby, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/8749778@N06/11888672254"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-in-largo-central-park-2026/ev_517dd05c8fec806c.jpg",
      "credit": "Eric Kilby, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/8749778@N06/11888579973"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-in-largo-central-park-2026/ev_b96ee4411e5cd2e5.jpg",
      "credit": "Eric Kilby, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/8749778@N06/11888600613"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-in-largo-central-park-2026/ev_251e3d118fb91000.jpg",
      "credit": "Eric Kilby, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/8749778@N06/11889111746"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-in-largo-central-park-2026/ev_7576d7f247f18693.jpg",
      "credit": "Eric Kilby, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/8749778@N06/11888543693"
    },
    {
      "src": "/place-photos/batch-2026-12d/holiday-lights-in-largo-central-park-2026/ev_0cd692f3a41e2393.jpg",
      "credit": "Eric Kilby, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/8749778@N06/11888592313"
    }
  ],
  "epcot-candlelight-2026": [
    {
      "src": "/place-photos/batch-2026-12d/epcot-candlelight-2026/ev_c608404a0896791c.jpg",
      "credit": "HarshLight, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/79172203@N00/5310034963"
    }
  ],
  "disney-springs-christmas-tree-stroll-2026": [
    {
      "src": "/place-photos/batch-2026-12d/disney-springs-christmas-tree-stroll-2026/ev_41ffbcba2b602e91.jpg",
      "credit": "davidaug, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/157215791@N02/48997465693"
    }
  ],
  "grandfloridian-minigingerbread-2026": [
    {
      "src": "/place-photos/batch-2026-12d/grandfloridian-minigingerbread-2026/ev_f2cba5f8c8d860d7.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/17048422622"
    },
    {
      "src": "/place-photos/batch-2026-12d/grandfloridian-minigingerbread-2026/ev_15ce1799fe7c38a2.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/16862096078"
    },
    {
      "src": "/place-photos/batch-2026-12d/grandfloridian-minigingerbread-2026/ev_3da182cecd1cc078.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/8312371302"
    },
    {
      "src": "/place-photos/batch-2026-12d/grandfloridian-minigingerbread-2026/ev_275f383c02624621.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/8312369756"
    }
  ],
  "universal-orlando-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-12d/universal-orlando-holidays-2026/ev_91a5e588a7052b30.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/6669329509"
    }
  ],
  "universal-studios-holiday-parade-2026": [
    {
      "src": "/place-photos/batch-2026-12d/universal-studios-holiday-parade-2026/ev_d17f993e70c3c9b9.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/6669341001"
    }
  ],
  "jacksonville-zoolights-2026": [
    {
      "src": "/place-photos/batch-2026-12d/jacksonville-zoolights-2026/ev_a7cf97f627eb6b5e.jpg",
      "credit": "RobBixbyPhotography, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/14580956@N08/30799477863"
    },
    {
      "src": "/place-photos/batch-2026-12d/jacksonville-zoolights-2026/ev_d3dc13c62a0ce01b.jpg",
      "credit": "RobBixbyPhotography, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/14580956@N08/30767938774"
    }
  ],
  "bok-tower-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-12d/bok-tower-holidays-2026/ev_1397f562e3f54bc2.jpg",
      "credit": "roger4336, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/24736216@N07/4933668188"
    },
    {
      "src": "/place-photos/batch-2026-12d/bok-tower-holidays-2026/ev_7ed931ea3ddb14a5.jpg",
      "credit": "jared422_80, CC BY 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/93283041@N00/35252505474"
    }
  ],
  "light-up-night-staug-2026": [
    {
      "src": "/place-photos/batch-2026-12d/light-up-night-staug-2026/ev_2688afbba67546cd.jpg",
      "credit": "Corvair Owner, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/59398780@N00/23180347750"
    },
    {
      "src": "/place-photos/batch-2026-12d/light-up-night-staug-2026/ev_f5338080184ffcc1.jpg",
      "credit": "Corvair Owner, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/59398780@N00/23108164349"
    },
    {
      "src": "/place-photos/batch-2026-12d/light-up-night-staug-2026/ev_acaf5b1e43dfbaf3.jpg",
      "credit": "Corvair Owner, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/59398780@N00/23108155589"
    },
    {
      "src": "/place-photos/batch-2026-12d/light-up-night-staug-2026/ev_7385a7eff4b78111.jpg",
      "credit": "Corvair Owner, CC BY SA 2.0, via Flickr",
      "href": "https://www.flickr.com/photos/59398780@N00/22847817434"
    }
  ],
  "utc-wonderland-circus-2026": [
    {
      "src": "/place-photos/batch-2026-12e/utc-wonderland-circus-2026/ev_99e0d3fb6cf59b92.jpg",
      "credit": "Wonderland Circus official website",
      "href": "https://pixlcms.s3.us-east-1.amazonaws.com/wonderland-circus/1786747494104-Daring.avif"
    },
    {
      "src": "/place-photos/batch-2026-12e/utc-wonderland-circus-2026/ev_f22a49f6415d9633.jpg",
      "credit": "Wonderland Circus official website",
      "href": "https://pixlcms.s3.us-east-1.amazonaws.com/wonderland-circus/1786578217891-DJI_20251022144402_0001_D_2.avif"
    },
    {
      "src": "/place-photos/batch-2026-12e/utc-wonderland-circus-2026/ev_2fc44c800c06fc96.jpg",
      "credit": "Wonderland Circus official website",
      "href": "https://pixlcms.s3.us-east-1.amazonaws.com/wonderland-circus/1788369823281-ABC_7195.avif"
    }
  ]
});
