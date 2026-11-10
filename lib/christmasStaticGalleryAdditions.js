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
  ]
});
