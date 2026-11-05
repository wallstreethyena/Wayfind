// lib/christmasPlacePhotos.js: event tagged Christmas photos for the Christmas
// ticket cards and the event pages they open. Photos live on the EXISTING place
// row in signals.christmas_photo_gallery, each tagged with christmas_keys (the
// event ids it belongs to), so a holiday shot never shows on a year round place
// card and two events at one park never borrow each other's photos. Reads only.
import { normalizePhotoUrl, photoHashKey } from "./photoDedupe.js";
export const CHRISTMAS_MAX_PHOTOS = 14;

// Event id or public /florida-events slug to the venue's existing Google place id.
// Busch and Enchant publish under a slug that is not their wf_events event_id.
// Both ids point at the same existing place. Nothing here inserts a place row.
export const CHRISTMAS_EVENT_PLACE = Object.freeze({
  "christmas-at-gaylord-palms-2026": "ChIJl0CYCGZ_3YgRL05pG5wZSsE",
  "busch-gardens-christmas-town-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "christmas-town-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "universal-orlando-holidays-2026": "ChIJvRBCrN9-54gRGZuuaCLGrQE",
  "enchant-christmas-st-petersburg-2026": "ChIJkXdv95vhwogR3e84WZCqrJ4",
  "enchant-stpete-2026": "ChIJkXdv95vhwogR3e84WZCqrJ4",
  // The holiday photos were saved on the existing LEGOLAND place row.
  "legoland-fl-holidays-2026": "wfadd_legoland_florida",
  "holidays-at-legoland-florida-2026": "wfadd_legoland_florida",
  "legoland-christmas-bricktacular-2026": "wfadd_legoland_florida",
});

// A photo tagged with either id belongs to that one event, so the ticket card
// (event_id) and the event page (slug) show the same rail.
const CHRISTMAS_KEY_ALIASES = Object.freeze({
  "christmas-town-2026": Object.freeze(["christmas-town-2026", "busch-gardens-christmas-town-2026"]),
  "busch-gardens-christmas-town-2026": Object.freeze(["christmas-town-2026", "busch-gardens-christmas-town-2026"]),
  "enchant-stpete-2026": Object.freeze(["enchant-stpete-2026", "enchant-christmas-st-petersburg-2026"]),
  "enchant-christmas-st-petersburg-2026": Object.freeze(["enchant-stpete-2026", "enchant-christmas-st-petersburg-2026"]),
  // The event page slug and the photo tag are different ids for one event.
  "holidays-at-legoland-florida-2026": Object.freeze(["holidays-at-legoland-florida-2026", "legoland-fl-holidays-2026", "legoland-christmas-bricktacular-2026"]),
  "legoland-fl-holidays-2026": Object.freeze(["holidays-at-legoland-florida-2026", "legoland-fl-holidays-2026", "legoland-christmas-bricktacular-2026"]),
  "legoland-christmas-bricktacular-2026": Object.freeze(["holidays-at-legoland-florida-2026", "legoland-fl-holidays-2026", "legoland-christmas-bricktacular-2026"]),
  // Homepage card ids whose gallery tags use another id for the same event.
  "seaworld-orlando-christmas-2026": Object.freeze(["seaworld-orlando-christmas-2026", "seaworld-orlando-christmas-celebration-2026"]),
  "seaworld-orlando-christmas-celebration-2026": Object.freeze(["seaworld-orlando-christmas-2026", "seaworld-orlando-christmas-celebration-2026"]),
  "jollywood-nights-2026": Object.freeze(["jollywood-nights-2026", "disney-jollywood-nights-2026"]),
  "disney-jollywood-nights-2026": Object.freeze(["jollywood-nights-2026", "disney-jollywood-nights-2026"]),
  "dazzling-nights-leu-2026": Object.freeze(["dazzling-nights-leu-2026", "dazzling-nights-leu-gardens-2026"]),
  "dazzling-nights-leu-gardens-2026": Object.freeze(["dazzling-nights-leu-2026", "dazzling-nights-leu-gardens-2026"]),
  "naples-night-lights-2026": Object.freeze(["naples-night-lights-2026", "naples-botanical-garden-night-lights-2026"]),
  "naples-botanical-garden-night-lights-2026": Object.freeze(["naples-night-lights-2026", "naples-botanical-garden-night-lights-2026"]),
  "mvmcp-2026": Object.freeze(["mvmcp-2026", "mickeys-very-merry-christmas-party-2026", "wdw-holiday-season-2026"]),
  "mickeys-very-merry-christmas-party-2026": Object.freeze(["mvmcp-2026", "mickeys-very-merry-christmas-party-2026", "wdw-holiday-season-2026"]),
});

const VAULT_URL_RX = /^(?:https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/place-photos|https:\/\/www\.gowayfind\.com\/place-photos\/batch-\d{4}-\d{2}[a-z]?)\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
const plain = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Holiday photos that are not on the place row. Stetson has no place row.
// Winterfest's parade photos are these files, cover first. Same strip shape as the vault photos.
export const CHRISTMAS_STATIC_GALLERY = Object.freeze({
  "naples-ballet-nutcracker-artis-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-28cd43298efe64ef.webp",
      "credit": "Wikimedia Commons, Dfilner, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Naples-Philharmonic.jpg",
      "width": 1280,
      "height": 853,
      "alt": "Hayes Hall, Naples; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "artis-naples-holiday-pops-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-28cd43298efe64ef.webp",
      "credit": "Wikimedia Commons, Dfilner, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Naples-Philharmonic.jpg",
      "width": 1280,
      "height": 853,
      "alt": "Hayes Hall, Naples; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "miami-city-ballet-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-4981a2501c04548e.webp",
      "credit": "Wikimedia Commons, Phillip Pessar, CC BY 2.0",
      "href": "https://commons.wikimedia.org/wiki/File:Adrienne_Arsht_Center_for_the_Performing_Arts_of_Miami-Dade_County_-_Flickr_-_Phillip_Pessar.jpg",
      "width": 1280,
      "height": 960,
      "alt": "Ziff Ballet Opera House, Miami; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "firstcoastnutcracker-jaxsymphony-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-c83c32ccc64678ea.webp",
      "credit": "Wikimedia Commons, Mathew105601, CC BY-SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:CSX_and_Time-Union_Center.JPG",
      "width": 1280,
      "height": 644,
      "alt": "Moran Theater, Jacksonville; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "gainesville-nutcracker-phillips-center-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-2e52595b06f78144.webp",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Chris_M._Phillips_Center_for_the_Performing_Arts.jpg",
      "width": 1280,
      "height": 853,
      "alt": "Phillips Center for the Performing Arts, Gainesville; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "st-johns-town-center-holiday-spectacular-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-e0dae1d2956cea30.webp",
      "credit": "Wikimedia Commons, Excel23, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:StJohnsTCJax.jpg",
      "width": 1273,
      "height": 655,
      "alt": "St. Johns Town Center, Jacksonville; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "cityplace-wpb-nightly-snowfall-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-7f9c1c9a4b70044d.webp",
      "credit": "Wikimedia Commons, Andyxox, Public domain",
      "href": "https://commons.wikimedia.org/wiki/File:CityPlace_Live_Stage_2.JPG",
      "width": 1280,
      "height": 960,
      "alt": "CityPlace, West Palm Beach; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "melbourne-holiday-market-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-0c615bf92380f75f.webp",
      "credit": "Wikimedia Commons, Leonard J. DeFrancisci, CC BY-SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Melbourne_Auditorium_(Melbourne,_Florida)_002.jpg",
      "width": 1280,
      "height": 960,
      "alt": "Melbourne Auditorium, Melbourne; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "deck-the-chairs-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-5bdd2cd222ea7b02.webp",
      "credit": "Wikimedia Commons, Jud McCranie, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Seawalk_Pavilion,_Jacksonville_Beach.jpg",
      "width": 1280,
      "height": 853,
      "alt": "Seawalk Pavilion, Jacksonville Beach; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "studios-of-key-west-holiday-makers-market-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-541a02ee645369fb.webp",
      "credit": "Wikimedia Commons, Kimalanpederson, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:TSKW_New_Sign_Night_FIXED_TALL_rgb.jpg",
      "width": 1021,
      "height": 810,
      "alt": "The Studios of Key West, Key West; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "green-cove-parade-of-trees-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-45b550a7a96af346.webp",
      "credit": "Wikimedia Commons, Excel23, CC0",
      "href": "https://commons.wikimedia.org/wiki/File:BridgeGCS.JPG",
      "width": 1280,
      "height": 857,
      "alt": "Spring Park, Green Cove Springs; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "lake-nona-oh-what-fun-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-c72ac597612685af.webp",
      "credit": "Wikimedia Commons, PoultrySaga, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Lakenonatowncenter.jpg",
      "width": 1280,
      "height": 859,
      "alt": "Lake Nona Town Center, Orlando; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "san-marco-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-0555f60b370040c8.webp",
      "credit": "Wikimedia Commons, PicoOrdinalo, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Balis_Park_(Jacksonville,_Florida).jpg",
      "width": 1280,
      "height": 853,
      "alt": "Balis Park, Jacksonville; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "tradition-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-296d7a9e2ddcb739.webp",
      "credit": "Wikimedia Commons, Dough4872, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Tradition_Square_in_Port_St_Lucie_FL.jpeg",
      "width": 1280,
      "height": 960,
      "alt": "Tradition Square, Port St. Lucie; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "fort-pierce-sunrise-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-0ac23bb0e9fb0615.webp",
      "credit": "Wikimedia Commons, Ebyabe, CC BY-SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Ft_Pierce_FL_Sunrise_Theater01.jpg",
      "width": 1280,
      "height": 960,
      "alt": "Sunrise Theatre, Fort Pierce; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "eden-gardens-christmas-luminaries-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-b35837f439f9ecd1.webp",
      "credit": "Wikimedia Commons, Tim Ross, Public domain",
      "href": "https://commons.wikimedia.org/wiki/File:WesleyHsEdenGrdnsStPk.JPG",
      "width": 1280,
      "height": 598,
      "alt": "Eden Gardens State Park, Santa Rosa Beach; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "lakeland-snowfest-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-9f3fdf34f4b74f9e.webp",
      "credit": "Wikimedia Commons, Kiran891, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Lake_Mirror_Promenade_with_Lakeland_Electric_Building_in_the_background_03.jpg",
      "width": 1280,
      "height": 720,
      "alt": "Frances Langford Promenade, Lakeland; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "merry-in-mizner-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-6959ccda30aa2430.webp",
      "credit": "Wikimedia Commons, Elfguy at English Wikipedia, Public domain",
      "href": "https://commons.wikimedia.org/wiki/File:Mizner_Park.jpg",
      "width": 1280,
      "height": 960,
      "alt": "Mizner Park, Boca Raton; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "key-west-custom-house-concert-bazaar-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-b5b7eedb8af9b1d5.webp",
      "credit": "Wikimedia Commons, Gillfoto from Juneau, Alaska, United States, CC BY-SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:Customshouse_98.JPG",
      "width": 1200,
      "height": 900,
      "alt": "Key West Museum of Art & History, Key West; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "tallahassee-cascades-holiday-stroll-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-3ede5331355c8695.webp",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Cascades_sign_and_outdoor_stairs.jpg",
      "width": 1280,
      "height": 853,
      "alt": "Cascades Park, Tallahassee; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "bach-classic-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-bb06949e71218035.webp",
      "credit": "Wikimedia Commons, Ebyabe, CC BY-SA 2.5",
      "href": "https://commons.wikimedia.org/wiki/File:Rollins_College_Knowles_Chapel04.jpg",
      "width": 1251,
      "height": 1280,
      "alt": "Knowles Memorial Chapel, Winter Park; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "stuart-fadc-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-e0988d53552e221f.webp",
      "credit": "Wikimedia Commons, Lovehistory269 Aimee Beth Grace, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Lyric_Theatre_Stuart,_FL_05.jpg",
      "width": 871,
      "height": 1280,
      "alt": "The Lyric Theatre, Stuart; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],
  "stuart-lyric-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venue-e0988d53552e221f.webp",
      "credit": "Wikimedia Commons, Lovehistory269 Aimee Beth Grace, CC BY-SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:Lyric_Theatre_Stuart,_FL_05.jpg",
      "width": 871,
      "height": 1280,
      "alt": "The Lyric Theatre, Stuart; venue context, not a photo of the 2026 holiday event",
      "context": "venue"
    }
  ],

  // batch 2026-11n (blank Christmas event cards, official organizer photos)
  "star-trolley-st-pete-holiday-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11n/star-trolley-st-pete-holiday-lights-2026/ev_6fdf4231f25656ed.jpg",
      "credit": "Star Trolley official website",
      "href": "https://www.star-trolley.com/lights/"
    }
  ],
  "south-pasadena-lighted-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11n/south-pasadena-lighted-boat-parade-2026/ev_7272a64cbeb7b9a1.jpg",
      "credit": "City of South Pasadena official website",
      "href": "https://www.mysouthpasadena.com/news_detail_T11_R115.php"
    }
  ],
  "european-holiday-market-palmetto-2026": [
    {
      "src": "/place-photos/batch-2026-11n/european-holiday-market-palmetto-2026/ev_27d9751676b13e14.jpg",
      "credit": "European Holiday Market official website",
      "href": "https://www.europeanholidaymarket.com/"
    },
    {
      "src": "/place-photos/batch-2026-11n/european-holiday-market-palmetto-2026/ev_3a9ab4422694bc91.jpg",
      "credit": "European Holiday Market official website",
      "href": "https://www.europeanholidaymarket.com/"
    },
    {
      "src": "/place-photos/batch-2026-11n/european-holiday-market-palmetto-2026/ev_dc6be44eefaaa674.jpg",
      "credit": "European Holiday Market official website",
      "href": "https://www.europeanholidaymarket.com/"
    }
  ],
  "santas-wonderland-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11n/santas-wonderland-festival-2026/ev_a19968489c570814.jpg",
      "credit": "Santa's Wonderland Festival official website",
      "href": "https://santaswonderlandfestival.com/"
    },
    {
      "src": "/place-photos/batch-2026-11n/santas-wonderland-festival-2026/ev_30dd80a1faebd036.jpg",
      "credit": "Santa's Wonderland Festival official website",
      "href": "https://santaswonderlandfestival.com/"
    }
  ],
  // batch 2026-11m (homepage This week in Florida events, keyed by the public slug)
  "key-west-offshore-world-championship-2026": [
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_258fdeec3ebbb5ed.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    },
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_0ef0d0a85372e2b0.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    },
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_2d7c7db2360e19ec.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    },
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_c210ad79847e95f9.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    },
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_38dabc82c9f93638.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    },
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_78bdac2a40d3c91b.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    },
    {
      "src": "/place-photos/batch-2026-11m/key-west-offshore-world-championship-2026/ev_319b435cf7f1b0d9.jpg",
      "credit": "Race World Offshore official website",
      "href": "https://raceworldoffshore.com/key-west/"
    }
  ],
  "north-florida-fair-2026": [
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_f5c14f98f9adc398.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_10.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_7355ef13b82bc6b3.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_d3b2efd7aadd967c.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_5.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_9eb89ae076271c03.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 4.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2022_rides_2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_86030820c0066451.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2013_27.JPG"
    },
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_d17a8eb36f53da38.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2013_05.JPG"
    },
    {
      "src": "/place-photos/batch-2026-11m/north-florida-fair-2026/ev_485959d709235d4c.jpg",
      "credit": "Wikimedia Commons, Michael Rivera, CC BY SA 3.0",
      "href": "https://commons.wikimedia.org/wiki/File:North_Florida_Fair_2013_31.JPG"
    }
  ],
  "edc-orlando-2026": [
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_181923a476541579.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    },
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_8ab32064e59a8299.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    },
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_fb12040c16a5d4a9.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    },
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_0c7caa912ef0dec4.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    },
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_232e7ddac5048e47.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    },
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_d6df2997fa80a5b7.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    },
    {
      "src": "/place-photos/batch-2026-11m/edc-orlando-2026/ev_800ae4c4da68fcd3.jpg",
      "credit": "Insomniac EDC Orlando official photos",
      "href": "https://www.insomniac.com/photos/2025-11-07-08-09-edc-orlando/"
    }
  ],
  "sarasota-medieval-fair-2026": [
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_a582290b70a0f2ab.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_7aac6c6f44db254c.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_0dcd49e103419200.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_480a06a491cd6bed.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_db68929f0915e67a.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_59abc87f4f75b977.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sarasota-medieval-fair-2026/ev_4fcf5fecc4734190.jpg",
      "credit": "Sarasota Medieval Fair official website",
      "href": "https://www.sarasotamedievalfair.com/"
    }
  ],
  "sweetfields-farm-corn-maze-2026": [
    {
      "src": "/place-photos/batch-2026-11m/sweetfields-farm-corn-maze-2026/ev_34db15f2d1e6bf49.jpg",
      "credit": "Sweetfields Farm official website",
      "href": "https://www.sweetfieldsfarm.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/sweetfields-farm-corn-maze-2026/ev_76299c1dddf21ad5.jpg",
      "credit": "Sweetfields Farm official website",
      "href": "https://www.sweetfieldsfarm.com/"
    }
  ],
  "hillsborough-county-fair-2026": [
    {
      "src": "/place-photos/batch-2026-11m/hillsborough-county-fair-2026/ev_327926c9355bb0f5.jpg",
      "credit": "Hillsborough County Fair official website",
      "href": "https://www.hillsboroughcountyfair.com/"
    },
    {
      "src": "/place-photos/batch-2026-11m/hillsborough-county-fair-2026/ev_31b1357a84001d89.jpg",
      "credit": "Hillsborough County Fair official website",
      "href": "https://www.hillsboroughcountyfair.com/"
    }
  ],
  // batch 2026-11l (Tampa and first page cards)
  "miracle-strandhill-tampa-2026": [
    {
      "src": "/place-photos/batch-2026-11l/miracle-strandhill-tampa-2026/xmas_3b32aee630d25f8e.jpg",
      "credit": "Strandhill Public official website",
      "href": "https://www.strandhillpublic.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/miracle-strandhill-tampa-2026/xmas_a7902042a3625992.jpg",
      "credit": "Strandhill Public official website",
      "href": "https://www.strandhillpublic.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/miracle-strandhill-tampa-2026/xmas_a68f132db5307a84.jpg",
      "credit": "Strandhill Public official website",
      "href": "https://www.strandhillpublic.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/miracle-strandhill-tampa-2026/xmas_55e200d701a107cf.jpg",
      "credit": "Strandhill Public official website",
      "href": "https://www.strandhillpublic.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/miracle-strandhill-tampa-2026/xmas_e8bdbee9321a1dc8.jpg",
      "credit": "Strandhill Public official website",
      "href": "https://www.strandhillpublic.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/miracle-strandhill-tampa-2026/xmas_b7e7c675c7f87848.jpg",
      "credit": "Strandhill Public official website",
      "href": "https://www.strandhillpublic.com/"
    }
  ],
  "yacht-starship-tampa-santa-brunch-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_227a89e4fe17836a.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_83371208e26fe7c6.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_fb65e582ecca10c1.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_d5b81b8956954be4.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_5ef1d36e2087a10b.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_d97420dfcb191c68.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-santa-brunch-cruise-2026/xmas_109e67bee9020628.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    }
  ],
  "yacht-starship-tampa-boat-parade-dinner-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-boat-parade-dinner-cruise-2026/xmas_83371208e26fe7c6.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-boat-parade-dinner-cruise-2026/xmas_68d36eba5b894df7.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-boat-parade-dinner-cruise-2026/xmas_c69ec96db87783a6.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-boat-parade-dinner-cruise-2026/xmas_fb65e582ecca10c1.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-boat-parade-dinner-cruise-2026/xmas_d5b81b8956954be4.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    }
  ],
  "yacht-starship-tampa-christmas-eve-dinner-2026": [
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-christmas-eve-dinner-2026/xmas_109e67bee9020628.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-christmas-eve-dinner-2026/xmas_83371208e26fe7c6.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-christmas-eve-dinner-2026/xmas_330669a511984074.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-christmas-eve-dinner-2026/xmas_d5b81b8956954be4.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/yacht-starship-tampa-christmas-eve-dinner-2026/xmas_227a89e4fe17836a.jpg",
      "credit": "Yacht StarShip official website",
      "href": "https://yachtstarship.com/"
    }
  ],
  "sparkman-wharf-winter-wonder-wharf-2026": [
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_76a0ac57af2c3082.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_c605d8b969204fa7.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_631795693469eb56.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_cac51eca600e386d.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_b0d111bf1c8af373.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_689aac6ecc6ed2e1.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/sparkman-wharf-winter-wonder-wharf-2026/xmas_2b630a07b003edc0.jpg",
      "credit": "Sparkman Wharf official website",
      "href": "https://www.sparkmanwharf.com/"
    }
  ],
  "water-street-season-spectacular-2026": [
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_95d91a375b8bc629.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_8ef24c9979e1d8be.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_74550d4084a0a063.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_78e80f6689de20b3.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_f6648f7530516627.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_b845b3c6560f38ab.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/water-street-season-spectacular-2026/xmas_40a25261afbf1280.jpg",
      "credit": "Water Street Tampa official website",
      "href": "https://www.waterstreettampa.com/"
    }
  ],
  "tampa-riverwalk-holiday-harbour-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11l/tampa-riverwalk-holiday-harbour-tree-lighting-2026/xmas_8fc48c09b4e11c77.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://thetampariverwalk.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/tampa-riverwalk-holiday-harbour-tree-lighting-2026/xmas_b2bc3f5fa0e86288.jpg",
      "credit": "Tampa Riverwalk official website",
      "href": "https://thetampariverwalk.com/"
    }
  ],
  "lostpearl-boatparade-tampa-2026": [
    {
      "src": "/place-photos/batch-2026-11l/lostpearl-boatparade-tampa-2026/xmas_b6108e491c6c311e.jpg",
      "credit": "Lost Pearl official website (tampapirateship.com)",
      "href": "https://tampapirateship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/lostpearl-boatparade-tampa-2026/xmas_d3acd9cf155ddaa6.jpg",
      "credit": "Lost Pearl official website (tampapirateship.com)",
      "href": "https://tampapirateship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/lostpearl-boatparade-tampa-2026/xmas_9e03e2728a793a40.jpg",
      "credit": "Lost Pearl official website (tampapirateship.com)",
      "href": "https://tampapirateship.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/lostpearl-boatparade-tampa-2026/xmas_690fb098a82f52c8.jpg",
      "credit": "Lost Pearl official website (tampapirateship.com)",
      "href": "https://tampapirateship.com/"
    }
  ],
  "oxford-exchange-holiday-gift-bazaar-2026": [
    {
      "src": "/place-photos/batch-2026-11l/oxford-exchange-holiday-gift-bazaar-2026/xmas_ccda3d1a92023186.jpg",
      "credit": "Oxford Exchange official website",
      "href": "https://www.oxfordexchange.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/oxford-exchange-holiday-gift-bazaar-2026/xmas_063dea1883cbe63b.jpg",
      "credit": "Oxford Exchange official website",
      "href": "https://www.oxfordexchange.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/oxford-exchange-holiday-gift-bazaar-2026/xmas_3dc0e5388fcd1131.jpg",
      "credit": "Oxford Exchange official website",
      "href": "https://www.oxfordexchange.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/oxford-exchange-holiday-gift-bazaar-2026/xmas_7dd2f9bf7e1a7bb6.jpg",
      "credit": "Oxford Exchange official website",
      "href": "https://www.oxfordexchange.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/oxford-exchange-holiday-gift-bazaar-2026/xmas_949a8b740177f2dc.jpg",
      "credit": "Oxford Exchange official website",
      "href": "https://www.oxfordexchange.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/oxford-exchange-holiday-gift-bazaar-2026/xmas_f303151ee71b72e9.jpg",
      "credit": "Oxford Exchange official website",
      "href": "https://www.oxfordexchange.com/"
    }
  ],
  "christmas-with-chris-tomlin-pensacola-2026": [
    {
      "src": "/place-photos/batch-2026-11l/christmas-with-chris-tomlin-pensacola-2026/xmas_575f5864a45a0905.jpg",
      "credit": "Saenger Theatre Pensacola official website",
      "href": "https://www.pensacolasaenger.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/christmas-with-chris-tomlin-pensacola-2026/xmas_9bb2a5669b33b75f.jpg",
      "credit": "Saenger Theatre Pensacola official website",
      "href": "https://www.pensacolasaenger.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/christmas-with-chris-tomlin-pensacola-2026/xmas_e6cea80eb2cc3e8e.jpg",
      "credit": "Saenger Theatre Pensacola official website",
      "href": "https://www.pensacolasaenger.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/christmas-with-chris-tomlin-pensacola-2026/xmas_c6169eab63ef6556.jpg",
      "credit": "Saenger Theatre Pensacola official website",
      "href": "https://www.pensacolasaenger.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/christmas-with-chris-tomlin-pensacola-2026/xmas_b14d1d24bcd0a9b7.jpg",
      "credit": "Saenger Theatre Pensacola official website",
      "href": "https://www.pensacolasaenger.com/"
    }
  ],
  "the-wonderland-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11l/the-wonderland-of-lights-2026/xmas_441800220e37cb60.jpg",
      "credit": "The Wonderland of Lights official website",
      "href": "https://thewonderlandoflights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/the-wonderland-of-lights-2026/xmas_72395b669a60fde2.jpg",
      "credit": "The Wonderland of Lights official website",
      "href": "https://thewonderlandoflights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/the-wonderland-of-lights-2026/xmas_2a829a1e28c8de5f.jpg",
      "credit": "The Wonderland of Lights official website",
      "href": "https://thewonderlandoflights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/the-wonderland-of-lights-2026/xmas_8e5c0462e6913c63.jpg",
      "credit": "The Wonderland of Lights official website",
      "href": "https://thewonderlandoflights.com/"
    }
  ],
  "jaxsymphony-holidaypops-2026": [
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_3870e62d80358cee.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_e84aada072e0b14d.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_9c003c981fcd29dd.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_9a6a34de250b9f74.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_a871d87aa2107000.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_99c56c6c9f8e7be1.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/jaxsymphony-holidaypops-2026/xmas_7310d969c5fd75f8.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/"
    }
  ],
  "nfso-holiday-pops-candlelight-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11l/nfso-holiday-pops-candlelight-christmas-2026/xmas_c652aeff80329953.jpg",
      "credit": "Mattie Kelly Arts Center official website",
      "href": "https://mattiekellyartscenter.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/nfso-holiday-pops-candlelight-christmas-2026/xmas_04ba2a8df716e659.jpg",
      "credit": "Mattie Kelly Arts Center official website",
      "href": "https://mattiekellyartscenter.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/nfso-holiday-pops-candlelight-christmas-2026/xmas_dac1098854268403.jpg",
      "credit": "Mattie Kelly Arts Center official website",
      "href": "https://mattiekellyartscenter.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/nfso-holiday-pops-candlelight-christmas-2026/xmas_a02aabca2da85574.jpg",
      "credit": "Mattie Kelly Arts Center official website",
      "href": "https://mattiekellyartscenter.org/"
    },
    {
      "src": "/place-photos/batch-2026-11l/nfso-holiday-pops-candlelight-christmas-2026/xmas_bb7a3e0cdf4728e4.jpg",
      "credit": "Mattie Kelly Arts Center official website",
      "href": "https://mattiekellyartscenter.org/"
    }
  ],
  "titusville-playhouse-christmas-carol-2026": [
    {
      "src": "/place-photos/batch-2026-11l/titusville-playhouse-christmas-carol-2026/xmas_39d7661f740063fd.jpg",
      "credit": "Titusville Playhouse official website",
      "href": "https://titusvilleplayhouse.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/titusville-playhouse-christmas-carol-2026/xmas_657d2022f49aa64d.jpg",
      "credit": "Titusville Playhouse official website",
      "href": "https://titusvilleplayhouse.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/titusville-playhouse-christmas-carol-2026/xmas_4aa90e53b4a7a324.jpg",
      "credit": "Titusville Playhouse official website",
      "href": "https://titusvilleplayhouse.com/"
    },
    {
      "src": "/place-photos/batch-2026-11l/titusville-playhouse-christmas-carol-2026/xmas_36eea0ce92f1eab8.jpg",
      "credit": "Titusville Playhouse official website",
      "href": "https://titusvilleplayhouse.com/"
    }
  ],
  // batch 2026-11k
  "celebration-now-snowing-2026": [
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_b819412bf72965f0.jpg",
      "credit": "Brian Hart, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Downtown_waterfront_for_first_night_of_2011_%22Now_Snowing%22_event_in_Celebration.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_4d104c2e3a1c59cb.jpg",
      "credit": "Bobak Ha'Eri, CC BY SA 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:022306-CelebrationFL06.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_2f2cb9618da992ba.jpg",
      "credit": "Wassssuuuup! Adam R, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Celebration,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_2aef17097d46183a.jpg",
      "credit": "traveljunction, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Celebration,_the_town_that_Disney_built,_Florida,_USA_(15448001118).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_a554f2a0589ad7d4.jpg",
      "credit": "Photo taken by Bobak Ha'Eri, CC BY SA 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:022306-CelebrationFL11.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_10c2c71168d65295.jpg",
      "credit": "Mx. Granger, CC0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Celebration_fountain.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-now-snowing-2026/xmas_5368b9279a304e11.jpg",
      "credit": "Jade Orlando, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Town_of_Celebration_09.JPG"
    }
  ],
  // batch 2026-11j
  "celebration-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_b819412bf72965f0.jpg",
      "credit": "Brian Hart, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Downtown_waterfront_for_first_night_of_2011_%22Now_Snowing%22_event_in_Celebration.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_4d104c2e3a1c59cb.jpg",
      "credit": "Bobak Ha'Eri, CC BY SA 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:022306-CelebrationFL06.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_2f2cb9618da992ba.jpg",
      "credit": "Wassssuuuup! Adam R, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Celebration,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_2aef17097d46183a.jpg",
      "credit": "traveljunction, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Celebration,_the_town_that_Disney_built,_Florida,_USA_(15448001118).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_a554f2a0589ad7d4.jpg",
      "credit": "Photo taken by Bobak Ha'Eri, CC BY SA 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:022306-CelebrationFL11.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_10c2c71168d65295.jpg",
      "credit": "Mx. Granger, CC0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Celebration_fountain.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/celebration-tree-lighting-2026/xmas_5368b9279a304e11.jpg",
      "credit": "Jade Orlando, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Town_of_Celebration_09.JPG"
    }
  ],
  // batch 2026-11j
  "punta-gorda-light-up-the-night-2026": [
    {
      "src": "/place-photos/batch-2026-11k/punta-gorda-light-up-the-night-2026/xmas_99aff5183260a970.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Charlotte_County_Commissioner_Deutsch_in_parade.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/punta-gorda-light-up-the-night-2026/xmas_8f642f89277a05cf.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Punta_Gorda_Fire_Department_in_Christmas_Parade.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/punta-gorda-light-up-the-night-2026/xmas_59aadfbd28a88a78.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Charlotte_County_Democrats_in_Christmas_parade_02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/punta-gorda-light-up-the-night-2026/xmas_e7382bb7ccde989f.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:PCHS_PRIDE_of_Port_Charlotte_Marching_Band_02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/punta-gorda-light-up-the-night-2026/xmas_8360caae00d90bcf.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Sallie_Jones_Elementary_School_in_Christmas_Parade.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/punta-gorda-light-up-the-night-2026/xmas_e6b26adb49efaa5a.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Punta_Gorda_Airport_Authority_in_parade.jpg"
    }
  ],
  // batch 2026-11j
  "light-up-the-night-punta-gorda-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11k/light-up-the-night-punta-gorda-tree-lighting-2026/xmas_99aff5183260a970.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Charlotte_County_Commissioner_Deutsch_in_parade.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/light-up-the-night-punta-gorda-tree-lighting-2026/xmas_8f642f89277a05cf.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Punta_Gorda_Fire_Department_in_Christmas_Parade.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/light-up-the-night-punta-gorda-tree-lighting-2026/xmas_59aadfbd28a88a78.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Charlotte_County_Democrats_in_Christmas_parade_02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/light-up-the-night-punta-gorda-tree-lighting-2026/xmas_e7382bb7ccde989f.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:PCHS_PRIDE_of_Port_Charlotte_Marching_Band_02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/light-up-the-night-punta-gorda-tree-lighting-2026/xmas_8360caae00d90bcf.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Sallie_Jones_Elementary_School_in_Christmas_Parade.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/light-up-the-night-punta-gorda-tree-lighting-2026/xmas_e6b26adb49efaa5a.jpg",
      "credit": "PCHS NJROTC, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Punta_Gorda_Airport_Authority_in_parade.jpg"
    }
  ],


  // batch 2026-11j
  "stuart-christmas-on-main-2026": [
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-on-main-2026/xmas_07e90314af848ebf.jpg",
      "credit": "JonathanPuello, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_FL._Downtown.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-on-main-2026/xmas_6052e00b36cbb5fe.jpg",
      "credit": "Tamanoeconomico, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_Florida_(1).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-on-main-2026/xmas_093831cc03af0bac.jpg",
      "credit": "Tamanoeconomico, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_Florida_(2).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-on-main-2026/xmas_b387783f11be406a.jpg",
      "credit": "Vasiliymeshko, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:DowntownStuart.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-on-main-2026/xmas_cc5e5fe25441a11e.jpg",
      "credit": "Stephen B Calvert Clariosophic, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:SW_Flagler_Avenue,_Stuart,_Florida_001.JPG"
    }
  ],
  // batch 2026-11j
  "stuart-christmas-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-tree-lighting-2026/xmas_07e90314af848ebf.jpg",
      "credit": "JonathanPuello, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_FL._Downtown.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-tree-lighting-2026/xmas_6052e00b36cbb5fe.jpg",
      "credit": "Tamanoeconomico, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_Florida_(1).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-tree-lighting-2026/xmas_093831cc03af0bac.jpg",
      "credit": "Tamanoeconomico, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_Florida_(2).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-tree-lighting-2026/xmas_b387783f11be406a.jpg",
      "credit": "Vasiliymeshko, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:DowntownStuart.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-tree-lighting-2026/xmas_cc5e5fe25441a11e.jpg",
      "credit": "Stephen B Calvert Clariosophic, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:SW_Flagler_Avenue,_Stuart,_Florida_001.JPG"
    }
  ],
  // batch 2026-11j
  "stuart-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-parade-2026/xmas_07e90314af848ebf.jpg",
      "credit": "JonathanPuello, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_FL._Downtown.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-parade-2026/xmas_6052e00b36cbb5fe.jpg",
      "credit": "Tamanoeconomico, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_Florida_(1).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-parade-2026/xmas_093831cc03af0bac.jpg",
      "credit": "Tamanoeconomico, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Stuart,_Florida_(2).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-parade-2026/xmas_b387783f11be406a.jpg",
      "credit": "Vasiliymeshko, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:DowntownStuart.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/stuart-christmas-parade-2026/xmas_cc5e5fe25441a11e.jpg",
      "credit": "Stephen B Calvert Clariosophic, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:SW_Flagler_Avenue,_Stuart,_Florida_001.JPG"
    }
  ],
  // batch 2026-11j
  "tavares-christmas-parade-and-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11k/tavares-christmas-parade-and-festival-2026/xmas_19917514ef002cc3.jpg",
      "credit": "Jackdude101, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:TE%26G_-_Tavares_Station.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/tavares-christmas-parade-and-festival-2026/xmas_4a93eab693457098.jpg",
      "credit": "Connor J. Williams, CC BY 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Tavares_city_hall_tavares_florida.jpg"
    },
  ],
  // batch 2026-11j
  "tavares-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11k/tavares-christmas-parade-2026/xmas_19917514ef002cc3.jpg",
      "credit": "Jackdude101, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:TE%26G_-_Tavares_Station.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/tavares-christmas-parade-2026/xmas_4a93eab693457098.jpg",
      "credit": "Connor J. Williams, CC BY 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Tavares_city_hall_tavares_florida.jpg"
    },
  ],
  // batch 2026-11j
  "space-coast-nutcracker-king-center-2026": [
    {
      "src": "/place-photos/batch-2026-11k/space-coast-nutcracker-king-center-2026/xmas_090d8ee0ccd27743.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Maxwell_C._King_Center_for_the_Performing_Arts_001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11k/space-coast-nutcracker-king-center-2026/xmas_43c2f1c527d934c4.jpg",
      "credit": "Soulbust, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Brevard_Community_College_Maxwell_C._King_Center_for_the_Performing_Arts.JPG"
    }
  ],
  // batch 2026-11j
  "st-pete-santa-parade-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11k/st-pete-santa-parade-tree-lighting-2026/xmas_0bb1ebdc5ab95b69.jpg",
      "credit": "Roman Eugeniusz, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St.Petersburg,Florida,USA._-_panoramio_(2).jpg"
    },
  ],
  // batch 2026-11j
  "st-pete-holiday-lights-displays-2026": [
    {
      "src": "/place-photos/batch-2026-11k/st-pete-holiday-lights-displays-2026/xmas_0bb1ebdc5ab95b69.jpg",
      "credit": "Roman Eugeniusz, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St.Petersburg,Florida,USA._-_panoramio_(2).jpg"
    },
  ],
  // batch 2026-11j
  "st-pete-snowfest-2026": [
    {
      "src": "/place-photos/batch-2026-11k/st-pete-snowfest-2026/xmas_0bb1ebdc5ab95b69.jpg",
      "credit": "Roman Eugeniusz, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St.Petersburg,Florida,USA._-_panoramio_(2).jpg"
    },
  ],
  // batch 2026-11j
  "st-pete-santa-in-the-park-2026": [
    {
      "src": "/place-photos/batch-2026-11k/st-pete-santa-in-the-park-2026/xmas_0bb1ebdc5ab95b69.jpg",
      "credit": "Roman Eugeniusz, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St.Petersburg,Florida,USA._-_panoramio_(2).jpg"
    },
  ],
  // batch 2026-11j
  "orlando-ballet-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_0f0c7ba901a99c2e.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Seneff_Arts_Plaza_at_Christmas.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_5839eb93700ccf96.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_for_the_Performing_Arts_interior_03.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_7ffd1d63874acac5.jpg",
      "credit": "Antony 22, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_2024.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_12df81b23d54d5c4.jpg",
      "credit": "Connor J. Williams, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Orlando_-_54118164064.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_593cc82aed93c5d0.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_03.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_38ba668deef3a01d.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_07.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_ae997ce37df5fac2.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_01.jpg"
    }
  ],
  // batch 2026-11j
  "orlando-phil-fierce-holiday-2026": [
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_0f0c7ba901a99c2e.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Seneff_Arts_Plaza_at_Christmas.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_5839eb93700ccf96.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_for_the_Performing_Arts_interior_03.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_7ffd1d63874acac5.jpg",
      "credit": "Antony 22, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_2024.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_12df81b23d54d5c4.jpg",
      "credit": "Connor J. Williams, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Orlando_-_54118164064.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_593cc82aed93c5d0.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_03.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_38ba668deef3a01d.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_07.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_ae997ce37df5fac2.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_01.jpg"
    }
  ],
  // batch 2026-11j
  "florida-orchestra-nightmare-before-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_7c14dd9fc3393f6e.jpg",
      "credit": "Taylor Bennett Jordan, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Mahaffey_Theater.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_1daca84243fd53c9.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater01.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_d9953e7ea9ea1187.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_f4f5e5964b342a46.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater04.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_7f37de3ac05bcec9.jpg",
      "credit": "U.S. Department of Veterans Affairs, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:NVCAF_Stage_Show_-_inside_the_theater,_St_Petersburg_Florida_2022.jpg"
    }
  ],
  // batch 2026-11j
  "florida-orchestra-classical-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_7c14dd9fc3393f6e.jpg",
      "credit": "Taylor Bennett Jordan, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Mahaffey_Theater.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_1daca84243fd53c9.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater01.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_d9953e7ea9ea1187.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_f4f5e5964b342a46.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater04.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_7f37de3ac05bcec9.jpg",
      "credit": "U.S. Department of Veterans Affairs, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:NVCAF_Stage_Show_-_inside_the_theater,_St_Petersburg_Florida_2022.jpg"
    }
  ],
  // batch 2026-11j
  "communitynutcracker-jax-2026": [
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_fef9cafc5c7a9b34.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S..jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_33b52d052ef8ef4a.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(07).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_048034a7340c9af6.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(28).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_b3808a15bdd59909.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(23).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_90325231427c2953.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(31).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_febeca0dab63db90.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(25).jpg"
    }
  ],
  // batch 2026-11j
  "florida-theatre-nutcracker-magical-2026": [
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_fef9cafc5c7a9b34.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S..jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_33b52d052ef8ef4a.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(07).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_048034a7340c9af6.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(28).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_b3808a15bdd59909.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(23).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_90325231427c2953.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(31).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_febeca0dab63db90.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(25).jpg"
    }
  ],
  // batch 2026-11j
  "ballet-palm-beach-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11j/ballet-palm-beach-nutcracker-2026/xmas_fb0f3b68bd9922bd.jpg",
      "credit": "Nick22aku, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Kravis_CIMG0279.JPG"
    },
    {
      "src": "/place-photos/batch-2026-11j/ballet-palm-beach-nutcracker-2026/xmas_03864cb8eca4a98e.jpg",
      "credit": "Mjrmtg, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Kravis_Center_for_the_Performing_Arts,_West_Palm_Beach.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/ballet-palm-beach-nutcracker-2026/xmas_ec72566de2177033.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Kravis_Center_for_the_Performing_Arts.jpg"
    }
  ],
  // batch 2026-11j
  "jupiter-rendezvous-light-2026": [
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_540d019d0c7faf42.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:MY_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_in_Florida_(18473841561).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_b92119e72c1d7efc.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_(17237643489).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_084e4842844e5eb4.jpg",
      "credit": "Lea Shanley, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_and_Museum_-_waterfront_view.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_39fd01dad7e92465.jpg",
      "credit": "Schizm00, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_(2010).JPG"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_af647ad3d42a0b25.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:My_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_ONA_in_Florida_(18282513868).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_f3907e8ec17853f2.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC01.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_cb93770881a1792a.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC02.jpg"
    }
  ],
  // batch 2026-11j
  "jupiter-luminary-nights-2026": [
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_540d019d0c7faf42.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:MY_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_in_Florida_(18473841561).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_b92119e72c1d7efc.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_(17237643489).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_084e4842844e5eb4.jpg",
      "credit": "Lea Shanley, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_and_Museum_-_waterfront_view.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_39fd01dad7e92465.jpg",
      "credit": "Schizm00, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_(2010).JPG"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_af647ad3d42a0b25.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:My_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_ONA_in_Florida_(18282513868).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_f3907e8ec17853f2.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC01.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_cb93770881a1792a.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC02.jpg"
    }
  ],
  // batch 2026-11j
  "cocoa-village-hot-cocoa-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_0c300b2ba0d292e1.jpg",
      "credit": "Ebyabe, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_FL_Aladdin_Theater04.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_de2c6180dbee5136.jpg",
      "credit": "COCOAFL, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Village_2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_f9fa07c64e8f55f8.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Belair_Courtyard,_Cocoa,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_e4698f74468de212.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Aviles_Building_(Cocoa,_Florida)_001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_edc19f349ff49933.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:411-403_Brevard_Ave,_Cocoa,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_21285783a8f08fc2.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:415_Brevard_Ave,_Cocoa,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_ef1f4bee68465228.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Threadneedle_Street_Mall,_Cocoa,_Florida.jpg"
    }
  ],
  // batch 2026-11j
  "art-and-craft-holiday-bazaar-2026": [
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_0c300b2ba0d292e1.jpg",
      "credit": "Ebyabe, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_FL_Aladdin_Theater04.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_de2c6180dbee5136.jpg",
      "credit": "COCOAFL, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Village_2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_f9fa07c64e8f55f8.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Belair_Courtyard,_Cocoa,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_e4698f74468de212.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Aviles_Building_(Cocoa,_Florida)_001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_edc19f349ff49933.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:411-403_Brevard_Ave,_Cocoa,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_21285783a8f08fc2.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:415_Brevard_Ave,_Cocoa,_Florida.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_ef1f4bee68465228.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Threadneedle_Street_Mall,_Cocoa,_Florida.jpg"
    }
  ],
  // batch 2026-11j
  "breakers-christmas-dining-2026": [
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_d25f73f791459ed1.jpg",
      "credit": "Rich Andrews, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:The_Breakers_(hotel).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_e17d5e64d8807782.jpg",
      "credit": "Nick22aku at English Wikipedia, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_CIMG0089.JPG"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_eb5438a3a823a054.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_e4e02b5cb67734cc.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_003.jpg"
    }
  ],
  // batch 2026-11j
  "breakers-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_d25f73f791459ed1.jpg",
      "credit": "Rich Andrews, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:The_Breakers_(hotel).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_e17d5e64d8807782.jpg",
      "credit": "Nick22aku at English Wikipedia, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_CIMG0089.JPG"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_eb5438a3a823a054.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_e4e02b5cb67734cc.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_003.jpg"
    }
  ],
  // batch 2026-11j
  "breakers-holiday-decor-2026": [
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_d25f73f791459ed1.jpg",
      "credit": "Rich Andrews, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:The_Breakers_(hotel).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_e17d5e64d8807782.jpg",
      "credit": "Nick22aku at English Wikipedia, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_CIMG0089.JPG"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_eb5438a3a823a054.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_e4e02b5cb67734cc.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_003.jpg"
    }
  ],
  // batch 2026-11i
  "amelia-island-museum-of-history-holiday-home-tour-2026": [
    {
      "src": "/place-photos/batch-2026-11i/amelia-island-museum-of-history-holiday-home-tour-2026/xmas_04c6ee03d6550dc1.jpg",
      "credit": "Amelia Island official tourism website",
      "href": "https://www.ameliaisland.com/wp-content/uploads/Holiday-Home-Tour-1.jpg"
    }
  ],
  // batch 2026-11i
  "king-fisher-christmas-light-canal-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-11i/king-fisher-christmas-light-canal-cruise-2026/xmas_b88174ef565d416e.jpg",
      "credit": "King Fisher Fleet official website",
      "href": "https://kingfisherfleet.com/wp-content/uploads/sites/7547/2024/10/Z72_7551-copy.webp?w=1200&zoom=2"
    },
    {
      "src": "/place-photos/batch-2026-11i/king-fisher-christmas-light-canal-cruise-2026/xmas_dcf64bac9b3b3321.jpg",
      "credit": "King Fisher Fleet official website",
      "href": "https://kingfisherfleet.com/wp-content/uploads/sites/7547/2024/10/DWS_5822-copy.jpg?w=1200&zoom=2"
    },
    {
      "src": "/place-photos/batch-2026-11i/king-fisher-christmas-light-canal-cruise-2026/xmas_71a839074b709488.jpg",
      "credit": "King Fisher Fleet official website",
      "href": "https://kingfisherfleet.com/wp-content/uploads/sites/7547/2024/10/DWS_5795-copy.webp?w=1200&zoom=2"
    },
    {
      "src": "/place-photos/batch-2026-11i/king-fisher-christmas-light-canal-cruise-2026/xmas_b66eeee48f5231ed.jpg",
      "credit": "King Fisher Fleet official website",
      "href": "https://kingfisherfleet.com/wp-content/uploads/sites/7547/2024/10/DWS_5834-copy.webp?w=1200&zoom=2"
    }
  ],
  // batch 2026-11i
  "villa-zorayda-candlelight-2026": [
    {
      "src": "/place-photos/batch-2026-11i/villa-zorayda-candlelight-2026/xmas_9e06877358a1012e.jpg",
      "credit": "Villa Zorayda Museum official website",
      "href": "https://i0.wp.com/villazorayda.com/wp-content/uploads/2022/09/20210102_180300edit.jpg?ssl=1"
    },
    {
      "src": "/place-photos/batch-2026-11i/villa-zorayda-candlelight-2026/xmas_6b2f913a01b922ab.jpg",
      "credit": "Villa Zorayda Museum official website",
      "href": "https://villazorayda.com/wp-content/uploads/2022/08/cropped-125193766_10158637289058672_1972864953132173443_o-e1662394172506.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/villa-zorayda-candlelight-2026/xmas_f17164fe3a8e3fab.jpg",
      "credit": "Villa Zorayda Museum official website",
      "href": "https://i0.wp.com/villazorayda.com/wp-content/uploads/2022/11/cropped-Aviary-Photo_131555930952907931-e1667405368184.png?ssl=1"
    },
    {
      "src": "/place-photos/batch-2026-11i/villa-zorayda-candlelight-2026/xmas_16d05ba5d155848f.jpg",
      "credit": "Villa Zorayda Museum official website",
      "href": "https://i0.wp.com/villazorayda.com/wp-content/uploads/2024/11/IMG_1324-2edit.jpg?ssl=1"
    }
  ],
  // batch 2026-11i
  "wec-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-11i/wec-winter-wonderland-2026/xmas_a6e60aefa828e43d.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2025/10/2025-Winter-Wonderland-10561-scaled.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/wec-winter-wonderland-2026/xmas_bec65a84fe77327e.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2025/10/2024-WEC-WW-12-07-20335-2-e1760357389958.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/wec-winter-wonderland-2026/xmas_a675c7b075c05fd4.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2026/08/WW-2026.png"
    },
    {
      "src": "/place-photos/batch-2026-11i/wec-winter-wonderland-2026/xmas_0339fbfba56abe90.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2026/07/2025-Winter-Wonderland-10178-2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/wec-winter-wonderland-2026/xmas_62068c4a319b6f35.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2025/10/2025-Winter-Wonderland-20447-scaled.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/wec-winter-wonderland-2026/xmas_29cc705b8df1dde6.jpg",
      "credit": "World Equestrian Center official website",
      "href": "https://worldequestriancenter.com/wp-content/uploads/2026/06/2025-Winter-Wonderland-10254-scaled.jpg"
    }
  ],
  // batch 2026-11i
  "the-ben-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-11i/the-ben-winter-wonderland-2026/xmas_6b7b149cab63cb6c.jpg",
      "credit": "The Ben West Palm official website",
      "href": "https://cdn.marriottnetwork.com/uploads/sites/20/2026/09/DJI_20251103175429_0254_D.jpg"
    }
  ],
  // batch 2026-11i
  "key-west-waterfront-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-11i/key-west-waterfront-winter-wonderland-2026/xmas_98e54b685d262a40.jpg",
      "credit": "Waterfront Winter Wonderland official website",
      "href": "https://static.wixstatic.com/media/1917bf_16f7e18041fd4583a2ca8cd7577b6f62~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/key-west-waterfront-winter-wonderland-2026/xmas_611f777d2c43b69a.jpg",
      "credit": "Waterfront Winter Wonderland official website",
      "href": "https://static.wixstatic.com/media/1917bf_7c57a56bf2724a7599b2b310749d71e1~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/key-west-waterfront-winter-wonderland-2026/xmas_0f25705f57ab0b75.jpg",
      "credit": "Waterfront Winter Wonderland official website",
      "href": "https://static.wixstatic.com/media/1917bf_3056a555c13b4501834ccadf7b53bb96~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/key-west-waterfront-winter-wonderland-2026/xmas_1d21ed5d8a515c4f.jpg",
      "credit": "Waterfront Winter Wonderland official website",
      "href": "https://static.wixstatic.com/media/1917bf_da54d8389505459cb4b324e667781334~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/key-west-waterfront-winter-wonderland-2026/xmas_fa4c1ff91b2e7785.jpg",
      "credit": "Waterfront Winter Wonderland official website",
      "href": "https://static.wixstatic.com/media/1917bf_44b3976787674162a391fbfe015bccdd~mv2.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/key-west-waterfront-winter-wonderland-2026/xmas_06da851b200b8001.jpg",
      "credit": "Waterfront Winter Wonderland official website",
      "href": "https://static.wixstatic.com/media/1917bf_9bd211a6f22745f6a2271358b4ca1c7f~mv2.jpg"
    }
  ],
  // batch 2026-11h
  "wdw-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_828a3beb1359b8bc.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/christmas/1209ZM_0665SD_xak_2-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_32493dfccd0fb032.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/holiday/entertainment/Tree_0626ZR_0386DR-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_59fe8fc22c3a4410.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/holiday/experience/General_Special_Offers_1219ZN_1890SD_JRoh_R4-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_27cb5e1111d6d05c.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/holiday/experience/Jingle-Cruise-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_ec27bdf49d99c21f.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/christmas/1211ZN_0024AFN_JB_R1-1-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_de93c8555be6b6d6.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/holiday/experience/1216ZO_4032SD_DZ_r2-1-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/wdw-holidays-2026/xmas_6d58d60cc45bb4a7.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/holiday/entertainment/MVMCP_1219ZN_5617SD_mm_R2-16x9.jpg"
    }
  ],
  // batch 2026-11h
  "epcot-candlelight-2026": [
    {
      "src": "/place-photos/batch-2026-11h/epcot-candlelight-2026/xmas_ce2df4debb51473f.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/passholder-programs/ap-hub/1216ZN_0446KP_JB_R1-1-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/epcot-candlelight-2026/xmas_0e96c5c652edcc91.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/festival-of-the-holidays/entertainment/1216ZN_0899KP_JB_R2-16x9.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11i/epcot-candlelight-2026/xmas_6ace516083265f35.jpg",
      "credit": "Walt Disney World official website",
      "href": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1920/1080/75/vision-dam/digital/parks-platform/parks-global-assets/disney-world/events/festival-of-the-holidays/experience/1212ZN_3324AFN_JB_R2-16x9.jpg"
    }
  ],
  // batch 2026-11h
  "utc-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-11h/utc-holidays-2026/xmas_8711b9ed7e3b322c.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/UTC-2024-126.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/utc-holidays-2026/xmas_2ca44830a5caa99c.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/0839-1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/utc-holidays-2026/xmas_03a0d0152d1c31e2.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/2-web-or-mls-UTC-Holiday-Aerial-2025-8_-1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/utc-holidays-2026/xmas_a381b3e046473492.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/40-web-or-mls-UTC-2024-110.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11h/utc-holidays-2026/xmas_bf079088828688a4.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/IMG_8985.jpeg"
    },
    {
      "src": "/place-photos/batch-2026-11h/utc-holidays-2026/xmas_e8fb28c19bfbbb49.jpg",
      "credit": "UTC Sarasota official website",
      "href": "https://utc.imgix.net/uploads/UTC_EntryPhoto_Update-1-1.jpg"
    }
  ],
  "magic-of-lights-daytona-2026": [
    {
      "src": "/place-photos/batch-2026-11g/magic-of-lights-daytona-2026/xmas_eae2854ac14b2804.jpg",
      "credit": "Dough4872, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:2018_Coke_Zero_Sugar_400_fireworks_from_frontstretch.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/magic-of-lights-daytona-2026/xmas_d93afa1744b0bb81.jpg",
      "credit": "Jake N., CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Daytona-International-Speedway-June-30-2005-Night.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/magic-of-lights-daytona-2026/xmas_8b0d0d626cf40b05.jpg",
      "credit": "Dough4872, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:2018_Coke_Zero_Sugar_400_final_stage_from_frontstretch.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/magic-of-lights-daytona-2026/xmas_fd7ed7605a66430d.jpg",
      "credit": "GT3Simon, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Daytona-International-Speedway-WorldCenterofRacing-Lettering.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/magic-of-lights-daytona-2026/xmas_5c01bda282ee1f35.jpg",
      "credit": "GT3Simon, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Daytona-Rising-2024.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/magic-of-lights-daytona-2026/xmas_73177f31424632f0.jpg",
      "credit": "David Jones from Isle of Wight, United Kingdom, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Daytona_International_Speedway_(48529948691).jpg"
    }
  ],
  "wesley-house-holiday-village-belighted-2026": [
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_bc0df7a2bc6510a3.jpg",
      "credit": "Elizabeth Nicodemus, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Key_West_Christmas_Light_Tour_2008_-_01.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_5bcaf125dc35ab71.jpg",
      "credit": "Elizabeth Nicodemus, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Key_West_Christmas_Light_Tour_2008_-_02.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_7d786d434f347a48.jpg",
      "credit": "Elizabeth Nicodemus, CC BY SA 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Key_West_Christmas_Light_Tour_2008_-_03.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_0776e60699c99d70.jpg",
      "credit": "Cayobo, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:5_Brothers_Xmas_2024,_Key_West_FL.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_0317ccfd21eecd35.jpg",
      "credit": "Joe Parks from Berkeley, CA, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Christmas_in_Paradise_-_Flickr_-_Joe_Parks.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_6226b12a81c87254.jpg",
      "credit": "Niranjan Arminius, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:KeyWestFL_TrumanWaterfrontPark_Sunset1_20230125.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/wesley-house-holiday-village-belighted-2026/xmas_f48ffa9630d47dd5.jpg",
      "credit": "Niranjan Arminius, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:KeyWestFL_TrumanWaterfrontPark_Sunset_20220125.jpg"
    }
  ],
  "festival-of-trees-melbourne-2026": [
    {
      "src": "/place-photos/batch-2026-11g/festival-of-trees-melbourne-2026/xmas_431765c38f95ea97.jpg",
      "credit": "CC0 via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Eau_Gallie_Arts_District_-_42.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/festival-of-trees-melbourne-2026/xmas_1381734b5e4ea903.jpg",
      "credit": "CC0 via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Eau_Gallie_Arts_District_-_12.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/festival-of-trees-melbourne-2026/xmas_6ea799d7e0db4605.jpg",
      "credit": "CC0 via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Eau_Gallie_Arts_District_-_62.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/festival-of-trees-melbourne-2026/xmas_4a3cbdec861b6127.jpg",
      "credit": "CC0 via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Eau_Gallie_Arts_District_-_13.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/festival-of-trees-melbourne-2026/xmas_2fb6da84f5c5a62b.jpg",
      "credit": "CC0 via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Eau_Gallie_Arts_District_-_18.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11g/festival-of-trees-melbourne-2026/xmas_eeeeca25bd857fdd.jpg",
      "credit": "CC0 via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Eau_Gallie_Arts_District_-_24.jpg"
    }
  ],
  "holiday-fantasy-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_6f50e5f7ebdeb9cb.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/611%20Flower%20Entrance%20Arch%20RET%20LR.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_05e00b767ac813ca.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://fortlauderdalejournal.com/img/holiday-fantasy-of-lights.webp"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_0d006d7443f49258.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/drivethruwithcars-cropped-0001.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_1f4eae6578416036.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/litarches.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_79bbfe09d9e3787c.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/littrees.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_b22b6e16b37856bb.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/soldiers.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_de0195f7bfb92885.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/penguins.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_f1d4a63cadb56065.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/jackinbox.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/holiday-fantasy-of-lights-2026/xmas_168067df79327bf7.jpg",
      "credit": "Holiday Fantasy of Lights official website",
      "href": "https://img1.wsimg.com/isteam/ip/6dcca8ea-2e7f-4d56-b582-aa26c3e2ade9/snowboarder.jpg"
    }
  ],
  "pensacola-winterfest-elf-parade-and-trolley-tours-2026": [
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_98f20948dc451589.jpg",
      "credit": "Ballinger Publishing",
      "href": "https://ballingerpublishing.com/wp-content/uploads/2025/11/Pt.-2-WF-2017-Elf-Parade-_4-1536x1060.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_59238e7952449343.jpg",
      "credit": "Ballinger Publishing",
      "href": "https://ballingerpublishing.com/wp-content/uploads/2025/11/WF-2017-Elf-Parade-_44-1536x1041.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_ac30f0ea925822e6.jpg",
      "credit": "Ballinger Publishing",
      "href": "https://ballingerpublishing.com/wp-content/uploads/2025/11/WF-2017-Elf-Parade-_62-2-1536x1435.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_ea0b504e74622007.jpg",
      "credit": "Ballinger Publishing",
      "href": "https://ballingerpublishing.com/wp-content/uploads/2025/11/WF-2017-Elf-Parade-_73-1536x1386.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_27fc161527f87cd9.jpg",
      "credit": "Visit Pensacola official website",
      "href": "https://www.visitpensacola.com/imager/assets_simpleviewinc_com/simpleview/image/upload/w_1024,h_1024,c_limit/crm/pensacola/Elf-Parade_01_EA0D1DBA-D106-40EB-BDAD6598390330C1_e3551ecc-ca1c-4a14-b918308ee2af8ecc_e45adf5f6bc0c5c2a30a39868f44eab6.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_bec2efc4f1e3eafe.jpg",
      "credit": "Visit Pensacola official website",
      "href": "https://www.visitpensacola.com/imager/assets_simpleviewinc_com/simpleview/image/upload/w_1024,h_1024,c_limit/crm/pensacola/Elf-Parade-Dolly-Elf_E4A58BB6-CBD7-490B-892B60174DC6B796_4a5b2bc6-b8b3-439c-a2f1694526d5f280_e45adf5f6bc0c5c2a30a39868f44eab6.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/pensacola-winterfest-elf-parade-and-trolley-tours-2026/xmas_bf856655a87c6c05.jpg",
      "credit": "Visit Pensacola official website",
      "href": "https://www.visitpensacola.com/imager/assets_simpleviewinc_com/simpleview/image/upload/w_1024,h_1024,c_limit/crm/pensacola/Gator-Marching-Band-copy_2CE32DF3-E011-4C85-B4F3775BAB3C1E77_d3f18721-17ba-4077-a90c28ef3b60e4fb_e45adf5f6bc0c5c2a30a39868f44eab6.jpg"
    }
  ],
  "gulfshore-playhouse-christmas-carol-2026": [
    {
      "src": "/place-photos/batch-2026-11e/gulfshore-playhouse-christmas-carol-2026/xmas_06a0f38d03b7fb5d.jpg",
      "credit": "Photo courtesy of Gulfshore Playhouse",
      "href": "https://www.gulfshoreplayhouse.org/wp-content/uploads/2024/08/2-2-1024x1024.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/gulfshore-playhouse-christmas-carol-2026/xmas_20bcd8040af4d3f9.jpg",
      "credit": "Photo courtesy of Gulfshore Playhouse",
      "href": "https://www.gulfshoreplayhouse.org/wp-content/uploads/2024/08/4-4.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/gulfshore-playhouse-christmas-carol-2026/xmas_99f4cc1ba473fb50.jpg",
      "credit": "Photo courtesy of Gulfshore Playhouse",
      "href": "https://www.gulfshoreplayhouse.org/wp-content/uploads/2024/08/IMG_0175-1024x768.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/gulfshore-playhouse-christmas-carol-2026/xmas_0d8638960fa0b182.jpg",
      "credit": "Photo courtesy of Gulfshore Playhouse",
      "href": "https://www.gulfshoreplayhouse.org/wp-content/uploads/2024/08/1-2-1024x1024.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/gulfshore-playhouse-christmas-carol-2026/xmas_bd182c73300c700d.jpg",
      "credit": "Photo courtesy of Gulfshore Playhouse",
      "href": "https://www.gulfshoreplayhouse.org/wp-content/uploads/2024/08/5-1-1024x1024.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/gulfshore-playhouse-christmas-carol-2026/xmas_7643bac8fb188dd0.jpg",
      "credit": "Photo courtesy of Gulfshore Playhouse",
      "href": "https://www.gulfshoreplayhouse.org/wp-content/uploads/2024/08/3-2.png"
    }
  ],
  "northwest-florida-ballet-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11e/northwest-florida-ballet-nutcracker-2026/xmas_53cba6a0f549ddc8.jpg",
      "credit": "Photo courtesy of Mattie Kelly Arts Center",
      "href": "https://mattiekellyartscenter.org/wp-content/uploads/2026/06/MKAC-dark.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/northwest-florida-ballet-nutcracker-2026/xmas_f05cf3e070cddc4a.jpg",
      "credit": "Photo courtesy of Mattie Kelly Arts Center",
      "href": "https://mattiekellyartscenter.org/wp-content/uploads/2026/09/MKAC-audience.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/northwest-florida-ballet-nutcracker-2026/xmas_733da0823c07bb4d.jpg",
      "credit": "Photo courtesy of Mattie Kelly Arts Center",
      "href": "https://mattiekellyartscenter.org/wp-content/uploads/2026/06/orchestra-front.png"
    },
    {
      "src": "/place-photos/batch-2026-11e/northwest-florida-ballet-nutcracker-2026/xmas_df11922464a4de18.jpg",
      "credit": "Photo courtesy of Mattie Kelly Arts Center",
      "href": "https://mattiekellyartscenter.org/wp-content/uploads/2026/05/40th-season-graphic-opt.-1-copy-1.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/northwest-florida-ballet-nutcracker-2026/xmas_dbf3d47e3ec4a335.jpg",
      "credit": "Photo courtesy of Mattie Kelly Arts Center",
      "href": "https://mattiekellyartscenter.org/wp-content/uploads/2020/01/Dance-Facets-2019.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/northwest-florida-ballet-nutcracker-2026/xmas_4aa5a154694edcdc.jpg",
      "credit": "Photo courtesy of Mattie Kelly Arts Center",
      "href": "https://mattiekellyartscenter.org/wp-content/uploads/2018/04/7dancers.png"
    }
  ],
  "mannheim-steamroller-peabody-2026": [
    {
      "src": "/place-photos/batch-2026-11e/mannheim-steamroller-peabody-2026/xmas_8878289bd8640d14.jpg",
      "credit": "Photo courtesy of Mannheim Steamroller",
      "href": "https://www.mannheimsteamroller.com/wp-content/uploads/layerslider/winter2017/cover-crowd.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/mannheim-steamroller-peabody-2026/xmas_1da62cf45b597b4e.jpg",
      "credit": "Mannheim Steamroller official website",
      "href": "https://www.mannheimsteamroller.com/wp-content/uploads/2026/07/Generative-Expand-scaled.png"
    }
  ],
  "zoo-lights-at-palm-beach-zoo-2026": [
    {
      "src": "/place-photos/batch-2026-11e/ChIJP7aCRLrX2IgRVLd7doYiJi0/xmas_53c292daddd7f891.jpg",
      "credit": "Photo courtesy of Palm Beach Zoo",
      "href": "https://www.palmbeachzoo.org/assets/2589/tigerglamourshot.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/ChIJP7aCRLrX2IgRVLd7doYiJi0/xmas_1f3910984cb005f9.jpg",
      "credit": "Photo courtesy of Palm Beach Zoo",
      "href": "https://www.palmbeachzoo.org/assets/2589/img_jaguar_fionalungegreat_20250619_pbz.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/ChIJP7aCRLrX2IgRVLd7doYiJi0/xmas_8d7897f2021ab133.jpg",
      "credit": "Photo courtesy of Palm Beach Zoo",
      "href": "https://www.palmbeachzoo.org/assets/2589/img_otters_onslide_20250514_pbz.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/ChIJP7aCRLrX2IgRVLd7doYiJi0/xmas_912ed347f7edf7ce.jpg",
      "credit": "(WT de) Mistoffeles, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Palm_Beach_Zoo_At_Dreher_Park-12.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11e/ChIJP7aCRLrX2IgRVLd7doYiJi0/xmas_f0ee5c73aa396d56.jpg",
      "credit": "(WT de) Mistoffeles, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Palm_Beach_Zoo_At_Dreher_Park-11.jpg"
    }
  ],
  "old-town-trolley-nol-2026": [
    {
      "src": "/place-photos/batch-2026-11b/old-town-trolley-nol-2026/xmas_a40af3b3f851db8d.jpg",
      "credit": "Old Town Trolley Tours official website",
      "href": "https://www.trolleytours.com/wp-content/uploads/2021/11/st-augustine-trolley-fountain-of-youth-1a.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/old-town-trolley-nol-2026/xmas_a712d0ef6d1ad6f4.jpg",
      "credit": "Old Town Trolley Tours official website",
      "href": "https://www.trolleytours.com/wp-content/uploads/2025/03/trolley-st-augustine-old-jail-desktop.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/old-town-trolley-nol-2026/xmas_18791a551ca4c1e1.jpg",
      "credit": "Old Town Trolley Tours official website",
      "href": "https://www.trolleytours.com/wp-content/uploads/2020/02/st-augustine-trolley-driving-fountain-of-youth.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/old-town-trolley-nol-2026/xmas_e7b906a5fa46decd.jpg",
      "credit": "Old Town Trolley Tours official website",
      "href": "https://www.trolleytours.com/wp-content/uploads/2021/11/st-augustine-trolley-potter-wax-museum-1a.jpg"
    },
    {
      "src": "/place-photos/batch-2026-11b/old-town-trolley-nol-2026/xmas_a34178557e498711.jpg",
      "credit": "Old Town Trolley Tours official website",
      "href": "https://www.trolleytours.com/wp-content/uploads/2016/08/st-augustine-trolley.jpg"
    }
  ],
  "stetson-mansion-christmas-2026-2": [
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_08c508314b0a24ca.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/f844983/2147483647/strip/true/crop/1000x525+0+80/resize/1200x630!/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2Fcc%2Fa5%2F9b6a8a224d29a732a361df4370f0%2Fdownload.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_0037a7cd1556cd21.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/26a20e5/2147483647/strip/true/crop/1000x667+0+0/resize/1000x667!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F41%2Ffd%2F5c0e85ea4723885a15b8fd2708d6%2Fdownload-4.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_12a09ca121613fb4.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/e696853/2147483647/strip/true/crop/1200x800+0+0/resize/1200x800!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2Ffd%2F00%2F7eb841b04246ba83d19855c857ed%2F75462405-2438470662930624-684026928331489280-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_133474259d49d439.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/c3ffe17/2147483647/strip/true/crop/1000x667+0+0/resize/2000x1334!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F10%2F9f%2F5c630b684ab897abeaf8a96825f3%2Fdownload-5.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_203bba742ab4685d.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/fb0ac35/2147483647/strip/true/crop/1200x755+0+0/resize/2400x1510!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F96%2F5c%2F321e9b324ce1988dc9d3a73031ec%2F76710828-2474685832642440-5776643013535072256-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_216d419b7dec5b4e.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/130fb0d/2147483647/strip/true/crop/1137x686+0+0/resize/1137x686!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F69%2F88%2F0cc9e17d4e7089b2e4ba52e62d0e%2F79036167-2474685372642486-3318478237549461504-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_3198af759b06fa1b.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/2d7e0bc/2147483647/strip/true/crop/1176x765+0+0/resize/2352x1530!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F9d%2F2b%2Fc99246af4ebbadbe83d5992b3d68%2F78112427-2438500276260996-2182004301612711936-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_1f3fe0d72af2d517.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/4bb083d/2147483647/strip/true/crop/1200x800+0+0/resize/1200x800!/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2Fdf%2F8e%2Ff7e7c9424541b99e1b3e5adae35b%2F78386029-2438504316260592-8985697102268989440-o.jpg"
    },
    {
      "src": "/events/christmas-gallery/stetson-mansion-christmas-2026-2/xmas_179f812d9cd2463f.jpg",
      "credit": "ABC Action News Tampa Bay",
      "href": "https://ewscripps.brightspotcdn.com/dims4/default/707be2e/2147483647/strip/true/crop/1200x800+0+0/resize/2400x1600!/format/webp/quality/90/?url=http%3A%2F%2Fewscripps-brightspot.s3.amazonaws.com%2F7c%2F4b%2Ff74891184bc6815b9ce5951e6fbc%2F77264195-2438497002927990-1894570096433561600-o.jpg"
    }
  ],
  "winterfest-boat-parade-fort-lauderdale-2026": [
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_006bd9c9426d3fd2.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-72-Miss-Nicole-1024x683.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_021241b48d5dd69c.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-96-Gertrude-1024x683.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_06c8c893bb224a83.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-60-Shake-A-Leg-Miami-Yamas.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_06fcf12c8a3dd2d5.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-84-The-Beast-1536x1024.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_084f5cf26706fa23.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-44-Dare-To-Dream.webp"
    },
    {
      "src": "/events/christmas-gallery/winterfest-boat-parade-fort-lauderdale-2026/xmas_0b89f17ee9847974.jpg",
      "credit": "Seminole Hard Rock Winterfest Boat Parade official website",
      "href": "https://winterfestparade.com/wp-content/uploads/2025/12/2025-49-Catch-My-Drift.webp"
    }
  ]
});

// The featured card uses the wf_events event_id. The event page uses the public slug.
// Winterfest and the older Stetson id are the same galleries.
const CHRISTMAS_STATIC_ALIAS = Object.freeze({
  "key-west-offshore-worlds-2026": "key-west-offshore-world-championship-2026",
  "fl26-north-florida-fair-2026": "north-florida-fair-2026",
  "sweetfields-fall-2026": "sweetfields-farm-corn-maze-2026",
  "winterfest-boat-parade-2026": "winterfest-boat-parade-fort-lauderdale-2026",
  "stetson-mansion-christmas-2026": "stetson-mansion-christmas-2026-2",
  // The browse card uses the research id. The gallery is filed under the wf_events id.
  "fernandina-holiday-home-tour-2026": "amelia-island-museum-of-history-holiday-home-tour-2026",
  "ocala-wec-winter-wonderland-2026": "wec-winter-wonderland-2026",
  "cocoa-village-holiday-bazaar-2026": "art-and-craft-holiday-bazaar-2026",
  "breakers-holiday-decor-2026": "breakers-holidays-2026",
});

export function christmasStaticPhotos(eventId, label = "") {
  const id = String(eventId || "");
  const list = CHRISTMAS_STATIC_GALLERY[CHRISTMAS_STATIC_ALIAS[id] || id] || [];
  return list.slice(0, CHRISTMAS_MAX_PHOTOS).map((p) => ({ src: p.src, width: p.width || 1280, height: p.height || 853, alt: plain(p.alt || "Photo of " + (label || eventId)), ...(p.context === "venue" ? { context: "venue" } : {}), credit: /^photo\b/i.test(p.credit) ? p.credit : "Photo by " + p.credit, creditHref: /^https:\/\//.test(p.href || "") ? p.href : null, source: "static" }));
}

export function christmasPlaceFor(eventId, placeId) {
  return placeId || CHRISTMAS_EVENT_PLACE[String(eventId || "")] || null;
}

function tagKeys(eventId) {
  const id = String(eventId || "");
  return CHRISTMAS_KEY_ALIASES[id] || (id ? [id] : []);
}

/** Tagged entries for one event, cover first, as strip photos. */
export function christmasTaggedPhotos(eventId, gallery, label = "") {
  const id = String(eventId || "");
  const keys = new Set(tagKeys(id));
  if (!id || !keys.size || !Array.isArray(gallery)) return [];
  const seen = new Set();
  const out = [];
  const rows = gallery.filter((g) => g && Array.isArray(g.christmas_keys) && g.christmas_keys.some((k) => keys.has(String(k))));
  rows.sort((a, b) => (b.cover ? 1 : 0) - (a.cover ? 1 : 0));
  for (const g of rows) {
    const src = String(g.url || "").trim();
    const keys = [normalizePhotoUrl(src), photoHashKey(g)].filter(Boolean);
    if (!VAULT_URL_RX.test(src) || keys.some((k) => seen.has(k))) continue;
    const raw = plain(g.attribution_text);
    if (!raw) continue;
    keys.forEach((k) => seen.add(k));
    out.push({
      src,
      width: g.width || 1280,
      height: g.height || 853,
      alt: plain("Photo of " + (label || id)),
      credit: /^photo\b/i.test(raw) ? raw : "Photo by " + raw,
      creditHref: /^https:\/\//.test(String(g.attribution_url || "")) ? g.attribution_url : null,
      source: "vault",
    });
    if (out.length >= CHRISTMAS_MAX_PHOTOS) break;
  }
  return out;
}

// The LEGO Christmas arch is the holiday photo. The licensed file is the
// daytime entrance sign across the road, so it leads only when the arch is absent.
export const LEGOLAND_ARCH_FILE = "xmas_5d7a0dda91619967.jpg";

export function christmasCardRail(photos, licensedSrc = "") {
  const rail = [];
  const licensed = String(licensedSrc || "");
  for (const photo of Array.isArray(photos) ? photos : []) {
    const src = String(photo && photo.src || "").trim();
    if (!src || rail.some((p) => p.src === src)) continue;
    // The daytime LEGOLAND entrance sign is not a better cover than the arch.
    if (licensed.startsWith("/events/christmas/") && src === licensed && rail.some((p) => String(p.src).includes(LEGOLAND_ARCH_FILE))) continue;
    rail.push(photo);
    if (rail.length >= CHRISTMAS_MAX_PHOTOS) break;
  }
  const arch = rail.findIndex((p) => String(p.src).includes(LEGOLAND_ARCH_FILE));
  if (arch >= 0 && licensed.startsWith("/events/christmas/")) {
    const withoutSign = rail.filter((p) => p.src !== licensed);
    const at = withoutSign.findIndex((p) => String(p.src).includes(LEGOLAND_ARCH_FILE));
    if (at > 0) {
      const [shot] = withoutSign.splice(at, 1);
      withoutSign.unshift(shot);
    }
    return withoutSign;
  }
  if (arch > 0) {
    const [shot] = rail.splice(arch, 1);
    rail.unshift(shot);
  }
  return rail;
}

async function readPlaceGallery(place, deps) {
  if (!place || !/^[A-Za-z0-9_-]{10,}$/.test(place)) return null;
  const env = deps.env || process.env;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const base = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!key || !/^https:\/\//.test(base)) return null;
  const doFetch = deps.fetchImpl || fetch;
  const q = new URLSearchParams({ place_id: `eq.${place}`, select: "signals->christmas_photo_gallery", limit: "1" });
  const r = await doFetch(`${new URL(base).origin}/rest/v1/wf_inventory?${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!r || !r.ok) return null;
  const rows = await r.json();
  return (rows && rows[0] && rows[0].christmas_photo_gallery) || [];
}

/** Reads signals.christmas_photo_gallery for the place and returns this event's photos. */
export async function readChristmasEventPhotos(eventId, placeId, deps = {}) {
  const ids = [...new Set([eventId, deps.slug].map((id) => String(id || "")).filter(Boolean))];
  for (const id of ids) {
    const fixed = christmasStaticPhotos(id, deps.label);
    if (fixed.length) return christmasCardRail(fixed);
  }
  const places = [...new Set([placeId, ...ids.map((id) => CHRISTMAS_EVENT_PLACE[id])].filter(Boolean))];
  const label = deps.label;
  for (const place of places) {
    let gallery = null;
    try { gallery = await readPlaceGallery(place, deps); } catch { gallery = null; }
    if (!Array.isArray(gallery)) continue;
    const tagged = [];
    for (const id of ids) {
      for (const photo of christmasTaggedPhotos(id, gallery, label)) {
        if (!tagged.some((p) => p.src === photo.src)) tagged.push(photo);
      }
    }
    if (tagged.length) return christmasCardRail(tagged);
  }
  return [];
}

/** The Wayfind hosted cover for an event card (slug or event_id), or "". Owned files beat any Google photo. */
export function eventStaticCover(row) {
  if (!row) return "";
  for (const id of [row.slug, row.event_id]) {
    const [first] = christmasStaticPhotos(id);
    if (first && first.src) return first.src;
  }
  return "";
}
