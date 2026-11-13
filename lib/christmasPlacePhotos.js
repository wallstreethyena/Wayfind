// lib/christmasPlacePhotos.js: event tagged Christmas photos for the Christmas
// ticket cards and the event pages they open. Photos live on the EXISTING place
// row in signals.christmas_photo_gallery, each tagged with christmas_keys (the
// event ids it belongs to), so a holiday shot never shows on a year round place
// card and two events at one park never borrow each other's photos. Reads only.
import { normalizePhotoUrl, photoHashKey } from "./photoDedupe.js";
import { CHRISTMAS_STATIC_GALLERY_ADDITIONS } from "./christmasStaticGalleryAdditions.js";
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

// Holiday photos that are not on the place row. Every entry needs a free licence
// or written permission; a news outlet credit is not permission. The Stetson
// Mansion news photos (ABC Action News) were removed 2026-11-12 for that reason
// (check-christmas-gallery-no-news-credit.mjs).
// Winterfest's parade photos are these files, cover first. Same strip shape as the vault photos.
export const CHRISTMAS_STATIC_GALLERY = Object.freeze({
  // batch 2026-12f (2026-11-12): Wikimedia Commons photos (CC0, CC BY, CC BY-SA, public domain) of the exact venue or event for Christmas cards
  // that showed the drawn tile. Licence, author and file page were re-read from the Commons API and raw file text on 2026-11-12; the sources are in
  // data/christmas-static-gallery-provenance.json. A venue photo is credited as a venue photo and never claims to be the 2026 event.
  "charlie-brown-christmas-ruth-eckerd-2026": [
    {
      "src": "/place-photos/batch-2026-12f/charlie-brown-christmas-ruth-eckerd-2026/xm_11e8432a123cb859.jpg",
      "credit": "PalauanReich, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:RuthEckerdHall_02.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "PalauanReich",
      "photo_year": 2023,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "derek-hough-dance-for-the-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-12f/derek-hough-dance-for-the-holidays-2026/xm_c8975b3c83afcda6.jpg",
      "credit": "PalauanReich, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:RuthEckerdHall_01.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "PalauanReich",
      "photo_year": 2023,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "frontyard-holiday-festival-at-dr-phillips-center-2026": [
    {
      "src": "/place-photos/batch-2026-12f/frontyard-holiday-festival-at-dr-phillips-center-2026/xm_3c6f9a0d2952174c.jpg",
      "credit": "Farragutful, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Seneff_Arts_Plaza_at_Christmas.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Farragutful",
      "photo_year": 2025,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "pinecrest-nights-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12f/pinecrest-nights-of-lights-2026/xm_75de94adefead837.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Pinecrest_Gardens_FL_park_entr02.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2011,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "islands-adventure-grinchmas-2026": [
    {
      "src": "/place-photos/batch-2026-12f/islands-adventure-grinchmas-2026/xm_8ddc88c47854e813.jpg",
      "credit": "Benoît Prieur, CC0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Hogsmeade_(Islands_of_Adventure)_May_2023.JPG",
      "license": "CC0",
      "license_url": "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
      "author": "Benoît Prieur",
      "photo_year": 2023,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "tamparep-miracle-on-34th-street-2026": [
    {
      "src": "/place-photos/batch-2026-12f/tamparep-miracle-on-34th-street-2026/xm_ca435345b598356e.jpg",
      "credit": "Barbthebuilder, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Tampa_architectural_photos_257.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Barbthebuilder",
      "photo_year": 2012,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "ngb-nutcracker-straz-2026": [
    {
      "src": "/place-photos/batch-2026-12f/ngb-nutcracker-straz-2026/xm_ca435345b598356e.jpg",
      "credit": "Barbthebuilder, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Tampa_architectural_photos_257.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Barbthebuilder",
      "photo_year": 2012,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "brevard-zoo-kids-holiday-hangout-2026": [
    {
      "src": "/place-photos/batch-2026-12f/brevard-zoo-kids-holiday-hangout-2026/xm_17a15116518b6371.jpg",
      "credit": "Michael Seeley, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Giraffes_and_Impalas_at_the_Brevard_Zoo_-_11_15_15_(22428915624).jpg",
      "license": "CC BY 2.0",
      "license_url": "https://creativecommons.org/licenses/by/2.0",
      "author": "Michael Seeley",
      "photo_year": 2015,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "gatorland-holiday-ho-down-2026": [
    {
      "src": "/place-photos/batch-2026-12f/gatorland-holiday-ho-down-2026/xm_e98fa2a64a67d80a.jpg",
      "credit": "Bobak, CC BY-SA 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Gatorland_entrance_-Florida-23Feb2006.jpg",
      "license": "CC BY-SA 2.5",
      "license_url": "https://creativecommons.org/licenses/by-sa/2.5",
      "author": "Bobak",
      "photo_year": 2006,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "cocoa-riverfront-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-12f/cocoa-riverfront-nutcracker-2026/xm_04103954e54d0cd1.jpg",
      "credit": "COCOAFL, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Riverfront_Park_3.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "COCOAFL",
      "photo_year": 2015,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "hot-cocoa-holidays-moonlight-and-music-2026": [
    {
      "src": "/place-photos/batch-2026-12f/hot-cocoa-holidays-moonlight-and-music-2026/xm_04103954e54d0cd1.jpg",
      "credit": "COCOAFL, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Riverfront_Park_3.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "COCOAFL",
      "photo_year": 2015,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "cocoa-holiday-tree-lighting-and-movie-in-the-park-2026": [
    {
      "src": "/place-photos/batch-2026-12f/cocoa-holiday-tree-lighting-and-movie-in-the-park-2026/xm_f0995917ed00c1f4.jpg",
      "credit": "COCOAFL, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Riverfront_Park_2.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "COCOAFL",
      "photo_year": 2015,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "mosi-santa-in-space-2026": [
    {
      "src": "/place-photos/batch-2026-12f/mosi-santa-in-space-2026/xm_160685ae394cf485.jpg",
      "credit": "Ebyabe, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:FL_Tampa_MOSI02.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Ebyabe",
      "photo_year": 2020,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "mosi-holiday-laser-2026": [
    {
      "src": "/place-photos/batch-2026-12f/mosi-holiday-laser-2026/xm_a7aa75d0da02d8f3.jpg",
      "credit": "Ebyabe, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:FL_Tampa_MOSI03.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Ebyabe",
      "photo_year": 2020,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "hyde-park-village-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12f/hyde-park-village-tree-lighting-2026/xm_ff57a8d9429b480d.jpg",
      "credit": "Guerinf, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Hyde_Park_Village_(5).jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Guerinf",
      "photo_year": 2022,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "heathcote-garden-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-12f/heathcote-garden-of-lights-2026/xm_a298bb2ff2d456c6.jpg",
      "credit": "Tom Kehoe, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Bonsai_lit_for_Christmas_at_Heathcote_Botanical_Gardens.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Tom Kehoe",
      "photo_year": 2019,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "eden-gardens-christmas-candlelight-open-house-2026": [
    {
      "src": "/place-photos/batch-2026-12f/eden-gardens-christmas-candlelight-open-house-2026/xm_2b9c5fe3bd9456fa.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:SR_Beach_Eden_Gardens_SP_Wesley08.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2008,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "gainesville-hippodrome-christmas-carol-2026": [
    {
      "src": "/place-photos/batch-2026-12f/gainesville-hippodrome-christmas-carol-2026/xm_72bdee6a00844205.jpg",
      "credit": "Ebyabe, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Hippodrome_Gainesville.jpg",
      "license": "CC BY 2.5",
      "license_url": "https://creativecommons.org/licenses/by/2.5",
      "author": "Ebyabe",
      "photo_year": 2007,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "sunken-gardens-breakfast-with-santa-2026": [
    {
      "src": "/place-photos/batch-2026-12f/sunken-gardens-breakfast-with-santa-2026/xm_ff8f512f6f5a5937.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Sunken_Gardens_gate01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2011,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "shopapalooza-festival-2026": [
    {
      "src": "/place-photos/batch-2026-12f/shopapalooza-festival-2026/xm_d1741f4e6e0aa5ce.jpg",
      "credit": "Calmuziclover, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Vinoy_Park_in_downtown_St_Pete.jpg",
      "license": "CC BY 2.0",
      "license_url": "https://creativecommons.org/licenses/by/2.0",
      "author": "Calmuziclover",
      "photo_year": 2020,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "vinoy-park-holiday-movie-2026": [
    {
      "src": "/place-photos/batch-2026-12f/vinoy-park-holiday-movie-2026/xm_d1741f4e6e0aa5ce.jpg",
      "credit": "Calmuziclover, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Vinoy_Park_in_downtown_St_Pete.jpg",
      "license": "CC BY 2.0",
      "license_url": "https://creativecommons.org/licenses/by/2.0",
      "author": "Calmuziclover",
      "photo_year": 2020,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "palma-sola-winter-nights-2026": [
    {
      "src": "/place-photos/batch-2026-12f/palma-sola-winter-nights-2026/xm_9ee83559e0a16c7f.jpg",
      "credit": "Jrussell55265, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Palma_Sola_Botanical_Park_Entrance.png",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Jrussell55265",
      "photo_year": 2023,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "immokalee-cowboy-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-12f/immokalee-cowboy-christmas-2026/xm_eb2e8f673708741e.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Immokalee_FL_Roberts_Ranch_bldg01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2010,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "omam-handbells-2026": [
    {
      "src": "/place-photos/batch-2026-12f/omam-handbells-2026/xm_a31f79abed3a7062.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Ormond_Beach_Gardens01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2011,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "worth-avenue-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12f/worth-avenue-tree-lighting-2026/xm_2b89fc2e61181018.jpg",
      "credit": "CZmarlin, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Worth_Avenue_and_Hibiscus_Avenue_Palm_Beach_FL-1.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "CZmarlin",
      "photo_year": 2012,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "wellington-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12f/wellington-tree-lighting-2026/xm_a1ab78f9f1402bf1.jpg",
      "credit": "Dee.lite, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Amphitheater_Wellington,_Florida_front.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Dee.lite",
      "photo_year": 2016,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "candy-cane-parade-and-concert-2026": [
    {
      "src": "/place-photos/batch-2026-12f/candy-cane-parade-and-concert-2026/xm_9df43ded6381e33e.jpg",
      "credit": "Tamanoeconomico, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Hollywood_Beach_Boardwalk_(1).jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Tamanoeconomico",
      "photo_year": 2019,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "sarasota-orchestra-festive-celebration-2026": [
    {
      "src": "/place-photos/batch-2026-12f/sarasota-orchestra-festive-celebration-2026/xm_c3eceb81056c0b9e.jpg",
      "credit": "Viva-Verdi, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Sarasota_Opera_House-March_2008.jpg",
      "license": "Public domain",
      "author": "Viva-Verdi",
      "photo_year": 2008,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "mount-dora-christmas-walk-2026": [
    {
      "src": "/place-photos/batch-2026-12f/mount-dora-christmas-walk-2026/xm_c2395be918263531.jpg",
      "credit": "Whoisjohngalt, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Sunset_Park_in_Mt_Dora_Florida.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Whoisjohngalt",
      "photo_year": 2019,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "asian-lantern-festival-central-florida-zoo-2026": [
    {
      "src": "/place-photos/batch-2026-12f/asian-lantern-festival-central-florida-zoo-2026/xm_ac543a38a167dd15.jpg",
      "credit": "Zrowny, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Central_Florida_Zoo_Entrance.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Zrowny",
      "photo_year": 2019,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "flamingo-gardens-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-12f/flamingo-gardens-winter-wonderland-2026/xm_c03b0bc767c49a90.jpg",
      "credit": "Dtobias, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Flamingo-gardens.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Dtobias",
      "photo_year": 2009,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "navarre-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12f/navarre-tree-lighting-2026/xm_ae20790815a28089.jpg",
      "credit": "j2003af, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Navarre_Park_-_panoramio.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "j2003af",
      "photo_year": 2009,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "navarre-christmas-in-the-park-and-merry-market-2026": [
    {
      "src": "/place-photos/batch-2026-12f/navarre-christmas-in-the-park-and-merry-market-2026/xm_ae20790815a28089.jpg",
      "credit": "j2003af, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Navarre_Park_-_panoramio.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "j2003af",
      "photo_year": 2009,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "sarasota-ballet-nutcracker-venice-2026": [
    {
      "src": "/place-photos/batch-2026-12f/sarasota-ballet-nutcracker-venice-2026/xm_f332ba1806be79dc.jpg",
      "credit": "PCHS-NJROTC, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Venice_Performing_Arts_Center.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "PCHS-NJROTC",
      "photo_year": 2023,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "hollywood-real-jazz-festival-and-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-12f/hollywood-real-jazz-festival-and-tree-lighting-2026/xm_d9d154eaff125bec.jpg",
      "credit": "Tamanoeconomico, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Young_Circle_Park_(2).jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Tamanoeconomico",
      "photo_year": 2018,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "mvmcp-2026": [
    {
      "src": "/place-photos/batch-2026-12f/mvmcp-2026/xm_981e3a819daa2411.jpg",
      "credit": "Figment3009, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Mickey's_Most_Merriest_Celebration.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Figment3009",
      "photo_year": 2018,
      "subject": "event",
    },
  ],
  // batch 2026-11p (owner, 2026-11-04): Wikimedia Commons photos under a free licence for blank Christmas event cards;
  // each licence was re-read from the Commons API at build time. Provenance: data/christmas-static-gallery-provenance.json.
  "madeira-beach-festival-of-lights-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/madeira-beach-festival-of-lights-boat-parade-2026/xm_29efca8868d88ab4.jpg",
      "credit": "Richard Mc Neil, CC BY 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Boats_Parade_in_John%27s_Pass,_Madeira_Beach,_Florida_-_panoramio.jpg",
      "license": "CC BY 3.0",
      "license_url": "https://creativecommons.org/licenses/by/3.0",
      "author": "Richard Mc Neil",
      "photo_year": 2012,
      "subject": "event",
    },
  ],
  "holiday-house-and-stroll-fort-myers-2026": [
    {
      "src": "/place-photos/batch-2026-11p/holiday-house-and-stroll-fort-myers-2026/xm_ad874d0d7160974b.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Fort_Myers_FL_Murphy-Burroughs_House01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2010,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "river-district-december-art-walk-holiday-market-2026": [
    {
      "src": "/place-photos/batch-2026-11p/river-district-december-art-walk-holiday-market-2026/xm_9c57db4a940ae8a3.jpg",
      "credit": "Sanibel sun, CC0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:First_Street_Fort_Myers.JPG",
      "license": "CC0",
      "license_url": "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
      "author": "Sanibel sun",
      "photo_year": 2013,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "light-up-clermont-2026": [
    {
      "src": "/place-photos/batch-2026-11p/light-up-clermont-2026/xm_7c8f3ed47925c4e5.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Clermont_FL_city_hall01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2011,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "light-up-winter-garden-2026": [
    {
      "src": "/place-photos/batch-2026-11p/light-up-winter-garden-2026/xm_15abf2bcf752c84e.jpg",
      "credit": "Freeholdman12, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Downtown_Winter_Garden_at_Night_(February_21,_2026).jpg",
      "license": "CC BY 4.0",
      "license_url": "https://creativecommons.org/licenses/by/4.0",
      "author": "Freeholdman12",
      "photo_year": 2026,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "brooksville-christmas-on-main-2026": [
    {
      "src": "/place-photos/batch-2026-11p/brooksville-christmas-on-main-2026/xm_709c478923a61172.jpg",
      "credit": "Leila Guerrios, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Brooksville_Courthouse_02.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Leila Guerrios",
      "photo_year": 2021,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "asolo-wonderful-life-2026": [
    {
      "src": "/place-photos/batch-2026-11p/asolo-wonderful-life-2026/xm_94f4ae49f7224611.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Sarasota_FL_Asolo_Rep_Theatre01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2011,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "seminolegulf-northpolenoir-fortmyers-2026": [
    {
      "src": "/place-photos/batch-2026-11p/seminolegulf-northpolenoir-fortmyers-2026/xm_b9e35838ed08ba21.jpg",
      "credit": "Sanibel sun, CC BY-SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:SGLR_Dinner_Train.jpg",
      "license": "CC BY-SA 4.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
      "author": "Sanibel sun",
      "photo_year": 2017,
      "subject": "event",
    },
  ],
  "fort-myers-holiday-house-stroll-2026": [
    {
      "src": "/place-photos/batch-2026-11p/fort-myers-holiday-house-stroll-2026/xm_ad874d0d7160974b.jpg",
      "credit": "Ebyabe, CC BY-SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Fort_Myers_FL_Murphy-Burroughs_House01.jpg",
      "license": "CC BY-SA 3.0",
      "license_url": "https://creativecommons.org/licenses/by-sa/3.0",
      "author": "Ebyabe",
      "photo_year": 2010,
      "subject": "venue",
      "context": "venue",
    },
  ],
  "naples-ballet-nutcracker-artis-2026": [
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_49036799992d820e.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_4db6d8a1c55ea093.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_76e10b2938869c48.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_b44e3530da58c561.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_990ee1e03760e7ce.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_e4154e950a0e47b1.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
    {
      "src": "/place-photos/batch-2026-11o/naples-ballet-nutcracker-artis-2026/ev_f670c42208a60278.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/nutcracker-naples-ballet"
    },
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
      "src": "/place-photos/batch-2026-11o/artis-naples-holiday-pops-2026/ev_78bc680008b2118e.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/holiday-pops"
    },
    {
      "src": "/place-photos/batch-2026-11o/artis-naples-holiday-pops-2026/ev_442848fc925c2115.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/holiday-pops"
    },
    {
      "src": "/place-photos/batch-2026-11o/artis-naples-holiday-pops-2026/ev_02b895b730d064ed.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/holiday-pops"
    },
    {
      "src": "/place-photos/batch-2026-11o/artis-naples-holiday-pops-2026/ev_7848d4e84cb18deb.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/holiday-pops"
    },
    {
      "src": "/place-photos/batch-2026-11o/artis-naples-holiday-pops-2026/ev_e7580a8ea8ca3546.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/holiday-pops"
    },
    {
      "src": "/place-photos/batch-2026-11o/artis-naples-holiday-pops-2026/ev_d1da9eb0d2387d90.jpg",
      "credit": "Artis Naples official website",
      "href": "https://artisnaples.org/events/holiday-pops"
    },
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
      "src": "/place-photos/batch-2026-11o/firstcoastnutcracker-jaxsymphony-2026/ev_2b134beabbc9b68c.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/first-coast-nutcracker/"
    },
    {
      "src": "/place-photos/batch-2026-11o/firstcoastnutcracker-jaxsymphony-2026/ev_aee864b9c51db381.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/first-coast-nutcracker/"
    },
    {
      "src": "/place-photos/batch-2026-11o/firstcoastnutcracker-jaxsymphony-2026/ev_72aaa2b29157c76e.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/first-coast-nutcracker/"
    },
    {
      "src": "/place-photos/batch-2026-11o/firstcoastnutcracker-jaxsymphony-2026/ev_6ded890dd1a3522c.jpg",
      "credit": "Jacksonville Symphony official website",
      "href": "https://www.jaxsymphony.org/first-coast-nutcracker/"
    },
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
      "src": "/place-photos/batch-2026-11p/cityplace-wpb-nightly-snowfall-2026/ev_eeba2e7ab318ef24.jpg",
      "credit": "cityplace.com official website",
      "href": "https://www.cityplace.com/west-palm-beach-events/nightly-snowfall"
    },
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
      "src": "/place-photos/batch-2026-11o/studios-of-key-west-holiday-makers-market-2026/ev_2be8e15ca52c8c2f.jpg",
      "credit": "The Studios of Key West official website",
      "href": "https://www.tskw.org/calendar/holidays-makers-market/"
    },
    {
      "src": "/place-photos/batch-2026-11o/studios-of-key-west-holiday-makers-market-2026/ev_ee29ad598fb7ca2c.jpg",
      "credit": "The Studios of Key West official website",
      "href": "https://www.tskw.org/calendar/holidays-makers-market/"
    },
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
      "src": "/place-photos/batch-2026-11o/bach-classic-christmas-2026/ev_dd8d297b0a45f0b6.jpg",
      "credit": "Bach Festival Society of Winter Park official website",
      "href": "https://www.bachfestivalflorida.org/event/a-classic-christmas-2026"
    },
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

  // batch 2026-11s (blank Christmas event cards, official organizer photos)
  "epcot-international-food-and-wine-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/epcot-international-food-and-wine-festival-2026/ev_77d1defeeb716981.jpg",
      "credit": "EPCOT, Walt Disney World",
      "href": "https://www.visitorlando.com/blog/post/fall-food-festivals-orlando/"
    }
  ],
  "disney-jollywood-nights-2026": [
    {
      "src": "/place-photos/batch-2026-11s/disney-jollywood-nights-2026/ev_75f0f1d234e48d55.jpg",
      "credit": "Disney's Hollywood Studios, Walt Disney World",
      "href": "https://disneyworld.disney.go.com/events/jollywood-nights/purchase/"
    }
  ],
  "wellen-park-wine-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/wellen-park-wine-festival-2026/ev_ef157de5583f26de.jpg",
      "credit": "Downtown Wellen Park, Solis Hall and Wellen Park Boulevard",
      "href": "https://wellenpark.com/wine/"
    },
    {
      "src": "/place-photos/batch-2026-11s/wellen-park-wine-festival-2026/ev_a70ec235a57a1195.jpg",
      "credit": "Downtown Wellen Park, Solis Hall and Wellen Park Boulevard",
      "href": "https://wellenpark.com/wine/"
    },
    {
      "src": "/place-photos/batch-2026-11s/wellen-park-wine-festival-2026/ev_d5a7590cc4fd3206.jpg",
      "credit": "Downtown Wellen Park, Solis Hall and Wellen Park Boulevard",
      "href": "https://wellenpark.com/wine/"
    },
    {
      "src": "/place-photos/batch-2026-11s/wellen-park-wine-festival-2026/ev_e44c2d41be423bdc.jpg",
      "credit": "Downtown Wellen Park, Solis Hall and Wellen Park Boulevard",
      "href": "https://wellenpark.com/wine/"
    },
    {
      "src": "/place-photos/batch-2026-11s/wellen-park-wine-festival-2026/ev_97e8b35d19e95c6a.jpg",
      "credit": "Downtown Wellen Park, Solis Hall and Wellen Park Boulevard",
      "href": "https://wellenpark.com/wine/"
    }
  ],
  "the-berry-farm-harvest-festival-miami-2026": [
    {
      "src": "/place-photos/batch-2026-11s/the-berry-farm-harvest-festival-miami-2026/ev_1900b46f7b9c78c3.jpg",
      "credit": "The Berry Farm",
      "href": "https://www.visittheberryfarm.com/pages/the-berry-farm-harvest-festival-2026-2027"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-berry-farm-harvest-festival-miami-2026/ev_78a36837ed476598.jpg",
      "credit": "The Berry Farm",
      "href": "https://www.visittheberryfarm.com/pages/the-berry-farm-harvest-festival-2026-2027"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-berry-farm-harvest-festival-miami-2026/ev_5f6d8dc25f4f0059.jpg",
      "credit": "The Berry Farm",
      "href": "https://www.visittheberryfarm.com/pages/the-berry-farm-harvest-festival-2026-2027"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-berry-farm-harvest-festival-miami-2026/ev_af2bdd96c5b5616a.jpg",
      "credit": "The Berry Farm",
      "href": "https://www.visittheberryfarm.com/pages/the-berry-farm-harvest-festival-2026-2027"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-berry-farm-harvest-festival-miami-2026/ev_2951461e0a67f645.jpg",
      "credit": "The Berry Farm",
      "href": "https://www.visittheberryfarm.com/pages/the-berry-farm-harvest-festival-2026-2027"
    }
  ],
  "daytona-turkey-run-2026": [
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_42dbd56f0719d2df.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_e4d2c4eac2173270.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_f6ba0982c22dae92.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_f2d706fd2e237230.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_205c86ca992da1b3.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_143c9a76efa088f3.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/daytona-turkey-run-2026/ev_43b0cd63fcc16146.jpg",
      "credit": "Daytona International Speedway",
      "href": "https://www.turkeyrun.com/"
    }
  ],
  "dazzling-nights-leu-gardens-2026": [
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_e49791f7f19b7648.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_99a82ce4f5456161.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_1eb6e793edb908ca.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_fbeb57b88efa9552.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_781c60bcb6724120.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_fe71d9e935ae2eeb.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/dazzling-nights-leu-gardens-2026/ev_464fdfd6c35c2bce.jpg",
      "credit": "Harry P. Leu Gardens",
      "href": "https://www.dazzlingorlando.com/"
    }
  ],
  "festival-of-trees-orlando-museum-of-art-2026": [
    {
      "src": "/place-photos/batch-2026-11s/festival-of-trees-orlando-museum-of-art-2026/ev_8208919e77a8762c.jpg",
      "credit": "Orlando Museum of Art",
      "href": "https://omart.org/events/festival-of-trees/"
    }
  ],
  "krush-brau-park-christkindlmarkt-2026": [
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_a3d1174217272c92.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    },
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_9bb6a143f6b64e57.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    },
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_ac70876e2974751c.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    },
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_e86fad5405aff14a.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    },
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_977330309c80b7b9.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    },
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_edba8012edd4a537.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    },
    {
      "src": "/place-photos/batch-2026-11s/krush-brau-park-christkindlmarkt-2026/ev_71849d3d2ac14d3a.jpg",
      "credit": "Krush Brau Park",
      "href": "https://krushbraupark.com/christkindlmarkt"
    }
  ],
  "homecomin-fall-menu-2026": [
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_68c0b61790fdcc6b.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_982b5b8caddab1a6.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_6758527ebfcf9e45.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_f5be342527125e87.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_f4d0b7121dc55bb9.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_9eae20d8a771c41a.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/homecomin-fall-menu-2026/ev_2ee3e51aa2dcdc64.jpg",
      "credit": "Chef Art Smith's Homecomin' (Disney Springs)",
      "href": "https://www.homecominkitchen.com/"
    }
  ],
  "30a-bbq-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/30a-bbq-festival-2026/ev_f3d2a4e33b6125d9.jpg",
      "credit": "Grand Boulevard",
      "href": "https://events.humanitix.com/30a-bbq-festival"
    },
    {
      "src": "/place-photos/batch-2026-11s/30a-bbq-festival-2026/ev_ad658546d3d39e9d.jpg",
      "credit": "Grand Boulevard",
      "href": "https://events.humanitix.com/30a-bbq-festival"
    },
    {
      "src": "/place-photos/batch-2026-11s/30a-bbq-festival-2026/ev_b77ff0f9bd81b520.jpg",
      "credit": "Grand Boulevard",
      "href": "https://events.humanitix.com/30a-bbq-festival"
    }
  ],
  "taste-of-mercato-2026": [
    {
      "src": "/place-photos/batch-2026-11s/taste-of-mercato-2026/ev_25a8548ce85e39cb.jpg",
      "credit": "Mercato",
      "href": "https://experiencemercato.com/events/"
    },
    {
      "src": "/place-photos/batch-2026-11s/taste-of-mercato-2026/ev_5db58e543fc71ece.jpg",
      "credit": "Mercato",
      "href": "https://experiencemercato.com/events/"
    },
    {
      "src": "/place-photos/batch-2026-11s/taste-of-mercato-2026/ev_43be609999277357.jpg",
      "credit": "Mercato",
      "href": "https://experiencemercato.com/events/"
    },
    {
      "src": "/place-photos/batch-2026-11s/taste-of-mercato-2026/ev_98be56210f87e022.jpg",
      "credit": "Mercato",
      "href": "https://experiencemercato.com/events/"
    }
  ],
  "the-wine-cheese-experience-2026": [
    {
      "src": "/place-photos/batch-2026-11s/the-wine-cheese-experience-2026/ev_1c6500f67d9deaa3.jpg",
      "credit": "Formosa Winery Tasting House",
      "href": "https://dxlwineandcheese.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-wine-cheese-experience-2026/ev_5e2c224589130c90.jpg",
      "credit": "Formosa Winery Tasting House",
      "href": "https://dxlwineandcheese.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-wine-cheese-experience-2026/ev_69cd14c75ffd49c4.jpg",
      "credit": "Formosa Winery Tasting House",
      "href": "https://dxlwineandcheese.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/the-wine-cheese-experience-2026/ev_db16accab84238e8.jpg",
      "credit": "Formosa Winery Tasting House",
      "href": "https://dxlwineandcheese.com/"
    }
  ],
  "treasure-coast-brew-fest-2026": [
    {
      "src": "/place-photos/batch-2026-11s/treasure-coast-brew-fest-2026/ev_c2bdb9c76952ac0e.jpg",
      "credit": "Stuart Memorial Park",
      "href": "https://www.tcbrewfest.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/treasure-coast-brew-fest-2026/ev_17ee4b6b96e61587.jpg",
      "credit": "Stuart Memorial Park",
      "href": "https://www.tcbrewfest.com/"
    }
  ],
  "veterans-boat-parade-madeira-beach-2026": [
    {
      "src": "/place-photos/batch-2026-11s/veterans-boat-parade-madeira-beach-2026/ev_007e3fabf8a22635.jpg",
      "credit": "American Legion Post 273",
      "href": "https://www.veteransboatparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11s/veterans-boat-parade-madeira-beach-2026/ev_6491e78d5fc403b7.jpg",
      "credit": "American Legion Post 273",
      "href": "https://www.veteransboatparade.org/"
    }
  ],
  "frrm-north-pole-express-2026": [
    {
      "src": "/place-photos/batch-2026-11s/frrm-north-pole-express-2026/ev_de43db7dae7ace58.jpg",
      "credit": "Florida Railroad Museum",
      "href": "https://www.frrm.org/north-pole-express/"
    }
  ],
  "luminary-nights-at-the-jupiter-inlet-lighthouse-2026": [
    {
      "src": "/place-photos/batch-2026-11s/luminary-nights-at-the-jupiter-inlet-lighthouse-2026/ev_ff04c3219fc58fac.jpg",
      "credit": "Jupiter Inlet Lighthouse & Museum",
      "href": "https://www.jupiterlighthouse.org/luminarynights"
    }
  ],
  "grace-jamaican-jerk-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/grace-jamaican-jerk-festival-2026/ev_ce69f38ffccdbf4f.jpg",
      "credit": "Miramar Regional Park",
      "href": "https://jerkfestival.com/"
    }
  ],
  "new-years-eve-beach-ball-drop-2026": [
    {
      "src": "/place-photos/batch-2026-11s/new-years-eve-beach-ball-drop-2026/ev_814293231ad0da9c.jpg",
      "credit": "Aaron Bessant Park / Celebration Tower",
      "href": "https://www.visitpanamacitybeach.com/events/holiday-events/new-years-eve-beach-ball-drop/"
    }
  ],
  "avalon-aglow-2026": [
    {
      "src": "/place-photos/batch-2026-11s/avalon-aglow-2026/ev_c013b497acb44e03.jpg",
      "credit": "Downtown Avalon Park",
      "href": "https://avalonparkorlando.com/play/community-festivals/avalon-aglow/"
    }
  ],
  "zen-awakening-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/zen-awakening-festival-2026/ev_2f44a3c2bc5e9b23.jpg",
      "credit": "Zen Meditation Fields",
      "href": "https://zenawakeningfestival.com/"
    }
  ],
  "halifax-art-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/halifax-art-festival-2026/ev_61e0d0b87a2461df.jpg",
      "credit": "Beach Street / Riverfront Esplanade",
      "href": "https://halifaxartfestival.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/halifax-art-festival-2026/ev_f293163194303bd9.jpg",
      "credit": "Beach Street / Riverfront Esplanade",
      "href": "https://halifaxartfestival.com/"
    },
    {
      "src": "/place-photos/batch-2026-11s/halifax-art-festival-2026/ev_610f268a5d2b6096.jpg",
      "credit": "Beach Street / Riverfront Esplanade",
      "href": "https://halifaxartfestival.com/"
    }
  ],
  "annunciation-fall-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_05db7526281a74f1.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    },
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_c631c1c2f883c029.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    },
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_79c6fdcbd690b029.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    },
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_e202379c8150dbc2.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    },
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_d77f16214c1efe8b.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    },
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_f686863a9f10d53c.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    },
    {
      "src": "/place-photos/batch-2026-11s/annunciation-fall-festival-2026/ev_756a8b4579e0354d.jpg",
      "credit": "Annunciation Catholic Church",
      "href": "https://annunciationorlando.org/fallfestival/"
    }
  ],
  "yankeetown-art-craft-and-seafood-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11s/yankeetown-art-craft-and-seafood-festival-2026/ev_054875364a972e96.jpg",
      "credit": "Yankeetown riverfront",
      "href": "https://yankeetownseafoodfestival.com/"
    }
  ],
  "miami-book-fair-2026": [
    {
      "src": "/place-photos/batch-2026-11s/miami-book-fair-2026/ev_6542d5517835ebda.jpg",
      "credit": "Miami Dade College Wolfson Campus",
      "href": "https://miamibookfair.com/miami-book-fair/miami-book-fair-overview/"
    },
    {
      "src": "/place-photos/batch-2026-11s/miami-book-fair-2026/ev_ec9c255ebcefeb2f.jpg",
      "credit": "Miami Dade College Wolfson Campus",
      "href": "https://miamibookfair.com/miami-book-fair/miami-book-fair-overview/"
    },
    {
      "src": "/place-photos/batch-2026-11s/miami-book-fair-2026/ev_1232ef4eccb04f26.jpg",
      "credit": "Miami Dade College Wolfson Campus",
      "href": "https://miamibookfair.com/miami-book-fair/miami-book-fair-overview/"
    },
    {
      "src": "/place-photos/batch-2026-11s/miami-book-fair-2026/ev_e2a0292cdfa94594.jpg",
      "credit": "Miami Dade College Wolfson Campus",
      "href": "https://miamibookfair.com/miami-book-fair/miami-book-fair-overview/"
    }
  ],
  "floridarama-fest-2026": [
    {
      "src": "/place-photos/batch-2026-11s/floridarama-fest-2026/ev_143fb27d9a7d6fc7.jpg",
      "credit": "FloridaRAMA at The Factory St. Pete",
      "href": "https://www.floridarama.art/2026/09/04/floridarama-fest-2026-a-st-petersburg-art-festival-celebrating-5-years-of-floridarama/"
    },
    {
      "src": "/place-photos/batch-2026-11s/floridarama-fest-2026/ev_5a3765ee0f8c3121.jpg",
      "credit": "FloridaRAMA at The Factory St. Pete",
      "href": "https://www.floridarama.art/2026/09/04/floridarama-fest-2026-a-st-petersburg-art-festival-celebrating-5-years-of-floridarama/"
    }
  ],
  // batch 2026-11q (blank Christmas event cards, official organizer photos)
  "fst-blunderful-life-2026": [
    {
      "src": "/place-photos/batch-2026-11q/fst-blunderful-life-2026/ev_653cd62cc3624a21.jpg",
      "credit": "Florida Studio Theatre official website",
      "href": "https://www.floridastudiotheatre.org/events-and-tickets"
    }
  ],
  "nutcracker-key-west-2026": [
    {
      "src": "/place-photos/batch-2026-11q/nutcracker-key-west-2026/ev_011cb421fed7694f.jpg",
      "credit": "Nutcracker Key West official website",
      "href": "https://nutcrackerkeywest.com/"
    },
    {
      "src": "/place-photos/batch-2026-11q/nutcracker-key-west-2026/ev_a88998e4d776c5fa.jpg",
      "credit": "Nutcracker Key West official website",
      "href": "https://nutcrackerkeywest.com/"
    },
    {
      "src": "/place-photos/batch-2026-11q/nutcracker-key-west-2026/ev_6840e071874ca1bc.jpg",
      "credit": "Nutcracker Key West official website",
      "href": "https://nutcrackerkeywest.com/"
    },
    {
      "src": "/place-photos/batch-2026-11q/nutcracker-key-west-2026/ev_61f328592e2c9590.jpg",
      "credit": "Nutcracker Key West official website",
      "href": "https://nutcrackerkeywest.com/"
    }
  ],
  "brooksville-family-sensory-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11q/brooksville-family-sensory-christmas-2026/ev_41b9dd64f4d0c8b6.jpg",
      "credit": "Brooksville Family Sensory Christmas organizers official website",
      "href": "https://www.welovebvl.org/christmas-in-brooksville"
    },
    {
      "src": "/place-photos/batch-2026-11q/brooksville-family-sensory-christmas-2026/ev_0cc1377db782dd6e.jpg",
      "credit": "Brooksville Family Sensory Christmas organizers official website",
      "href": "https://www.welovebvl.org/christmas-in-brooksville"
    }
  ],
  "clewiston-santa-express-2026": [
    {
      "src": "/place-photos/batch-2026-11q/clewiston-santa-express-2026/ev_f5ff54d17593dfda.jpg",
      "credit": "Sugar Express official website",
      "href": "https://sugarexpress.com/santa-express-clewiston/"
    },
    {
      "src": "/place-photos/batch-2026-11q/clewiston-santa-express-2026/ev_bf0105f811e74a00.jpg",
      "credit": "Sugar Express official website",
      "href": "https://sugarexpress.com/santa-express-clewiston/"
    },
    {
      "src": "/place-photos/batch-2026-11q/clewiston-santa-express-2026/ev_d6084adb692ec295.jpg",
      "credit": "Sugar Express official website",
      "href": "https://sugarexpress.com/santa-express-clewiston/"
    }
  ],
  "a-christmas-carol-orlando-shakes-2026": [
    {
      "src": "/place-photos/batch-2026-11q/a-christmas-carol-orlando-shakes-2026/ev_cbbf0f5ca0cfc6aa.jpg",
      "credit": "Orlando Shakes official website",
      "href": "https://www.orlandoshakes.org/show/carol26/"
    }
  ],
  "allison-christmas-spectacular-2026": [
    {
      "src": "/place-photos/batch-2026-11q/allison-christmas-spectacular-2026/ev_09065ecfa62f74e2.jpg",
      "credit": "Allison Christmas Spectacular official website",
      "href": "https://www.allisonchristmasspectacular.com/schedule.html"
    },
    {
      "src": "/place-photos/batch-2026-11q/allison-christmas-spectacular-2026/ev_4c80a6efb22fb147.jpg",
      "credit": "Allison Christmas Spectacular official website",
      "href": "https://www.allisonchristmasspectacular.com/schedule.html"
    }
  ],
  "holiday-lights-florida-botanical-2026": [
    {
      "src": "/place-photos/batch-2026-11q/holiday-lights-florida-botanical-2026/ev_33a241eb1fc77e81.jpg",
      "credit": "Walter from Tampa/St Petersburg, Florida via Wikimedia Commons, CC BY 2.0",
      "href": "https://commons.wikimedia.org/wiki/File:Gulf_Coast_Dancenter_perform_at_the_Holiday_Garden_Lights_(8275983347).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11q/holiday-lights-florida-botanical-2026/ev_12c8cbaa7126ac34.jpg",
      "credit": "Walter from Tampa/St Petersburg, Florida via Wikimedia Commons, CC BY 2.0",
      "href": "https://commons.wikimedia.org/wiki/File:Gulf_Coast_Dancenter_perform_at_the_Holiday_Garden_Lights_(8275991891).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11q/holiday-lights-florida-botanical-2026/ev_65f1cb9e06dc71ca.jpg",
      "credit": "Walter from Tampa/St Petersburg, Florida via Wikimedia Commons, CC BY 2.0",
      "href": "https://commons.wikimedia.org/wiki/File:Gulf_Coast_Dancenter_perform_at_the_Holiday_Garden_Lights_(8277043942).jpg"
    },
    {
      "src": "/place-photos/batch-2026-11p/holiday-lights-florida-botanical-gardens-2026/xm_227934f567129c63.jpg",
      "credit": "Walter from Tampa/St Petersburg, Florida, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Botanical_Gardens_DSC_2588_pp_(38633702682).jpg",
      "license": "CC BY 2.0",
      "license_url": "https://creativecommons.org/licenses/by/2.0",
      "author": "Walter from Tampa/St Petersburg, Florida",
      "photo_year": 2017,
      "subject": "event",
    }
  ],
  "merry-main-street-defuniak-2026": [
    {
      "src": "/place-photos/batch-2026-11q/merry-main-street-defuniak-2026/ev_6d7449b3df6bea57.jpg",
      "credit": "Main Street DeFuniak Springs official website",
      "href": "https://mainstreetdfs.org/merry-main-street/"
    },
    {
      "src": "/place-photos/batch-2026-11q/merry-main-street-defuniak-2026/ev_37179c45ad101c80.jpg",
      "credit": "Main Street DeFuniak Springs official website",
      "href": "https://mainstreetdfs.org/merry-main-street/"
    },
    {
      "src": "/place-photos/batch-2026-11q/merry-main-street-defuniak-2026/ev_550d15ca8e631a5f.jpg",
      "credit": "Main Street DeFuniak Springs official website",
      "href": "https://mainstreetdfs.org/merry-main-street/"
    },
    {
      "src": "/place-photos/batch-2026-11q/merry-main-street-defuniak-2026/ev_585b40321a179c88.jpg",
      "credit": "Main Street DeFuniak Springs official website",
      "href": "https://mainstreetdfs.org/merry-main-street/"
    }
  ],
  "nsb-coastal-christmas-market-2026": [
    {
      "src": "/place-photos/batch-2026-11q/nsb-coastal-christmas-market-2026/ev_ab87c9490f63e39f.jpg",
      "credit": "Canal Street Historic District New Smyrna Beach official website",
      "href": "https://www.canalstreetnsb.com/events/"
    }
  ],
  "plant-city-lights-of-love-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11q/plant-city-lights-of-love-tree-lighting-2026/ev_1841dae2e8afbbf6.jpg",
      "credit": "Plant City Lights of Love organizers official website",
      "href": "https://www.sfbhfoundation.org/lights-of-love"
    },
    {
      "src": "/place-photos/batch-2026-11q/plant-city-lights-of-love-tree-lighting-2026/ev_cc53a8c9b2fc3f09.jpg",
      "credit": "Plant City Lights of Love organizers official website",
      "href": "https://www.sfbhfoundation.org/lights-of-love"
    },
    {
      "src": "/place-photos/batch-2026-11q/plant-city-lights-of-love-tree-lighting-2026/ev_3dd2d9e73de9fd10.jpg",
      "credit": "Plant City Lights of Love organizers official website",
      "href": "https://www.sfbhfoundation.org/lights-of-love"
    }
  ],
  "stephen-foster-festival-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11q/stephen-foster-festival-of-lights-2026/ev_a2b73a23bf8348ec.jpg",
      "credit": "Stephen Foster Citizen Support Organization official website",
      "href": "https://stephenfostercso.org/event-6729538"
    }
  ],
  "panama-city-ballet-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11q/panama-city-ballet-nutcracker-2026/ev_07be9eb0de9586a3.jpg",
      "credit": "Panama City Ballet official website",
      "href": "https://www.panamacityballet.com/"
    }
  ],
  "ocala-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11q/ocala-christmas-parade-2026/ev_3391f1af8609e01b.jpg",
      "credit": "Ocala Christmas Parade organizers official website",
      "href": "https://ocalachristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11q/ocala-christmas-parade-2026/ev_83419e311afec16a.jpg",
      "credit": "Ocala Christmas Parade organizers official website",
      "href": "https://ocalachristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11q/ocala-christmas-parade-2026/ev_bd21e9d1fba59618.jpg",
      "credit": "Ocala Christmas Parade organizers official website",
      "href": "https://ocalachristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11q/ocala-christmas-parade-2026/ev_aaa63528a6aa0a8f.jpg",
      "credit": "Ocala Christmas Parade organizers official website",
      "href": "https://ocalachristmasparade.org/"
    }
  ],
  "festival-of-giving-childrens-museum-treasure-coast-2026": [
    {
      "src": "/place-photos/batch-2026-11q/festival-of-giving-childrens-museum-treasure-coast-2026/ev_3381404f19617d4a.jpg",
      "credit": "Childrens Museum of the Treasure Coast official website",
      "href": "https://www.childrensmuseumtc.org/festival-of-giving-2026"
    },
    {
      "src": "/place-photos/batch-2026-11q/festival-of-giving-childrens-museum-treasure-coast-2026/ev_e55cc02f416aef6f.jpg",
      "credit": "Childrens Museum of the Treasure Coast official website",
      "href": "https://www.childrensmuseumtc.org/festival-of-giving-2026"
    },
    {
      "src": "/place-photos/batch-2026-11q/festival-of-giving-childrens-museum-treasure-coast-2026/ev_d971dd5930871f8c.jpg",
      "credit": "Childrens Museum of the Treasure Coast official website",
      "href": "https://www.childrensmuseumtc.org/festival-of-giving-2026"
    },
    {
      "src": "/place-photos/batch-2026-11q/festival-of-giving-childrens-museum-treasure-coast-2026/ev_137b37d545af46f4.jpg",
      "credit": "Childrens Museum of the Treasure Coast official website",
      "href": "https://www.childrensmuseumtc.org/festival-of-giving-2026"
    }
  ],
  // batch 2026-11p (blank Christmas event cards, official organizer photos)
  "charlie-brown-christmas-orlando-family-stage-2026": [
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_88ee2944eb40c0c2.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_84700789052da9d4.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_b0581fc3b11e201b.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_7c2d6045fe661ce1.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_009bd0a90c788daa.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_a0a8ed4f54fff06c.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/charlie-brown-christmas-orlando-family-stage-2026/ev_d8fd8ff991a4881e.jpg",
      "credit": "orlandofamilystage.com official website",
      "href": "https://orlandofamilystage.com/show/a-charlie-brown-christmas/"
    }
  ],
  "evermore-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11p/evermore-christmas-2026/ev_1c4850190846293c.jpg",
      "credit": "evermoreresort.com official website",
      "href": "https://evermoreresort.com/experiences/christmas-at-evermore"
    },
    {
      "src": "/place-photos/batch-2026-11p/evermore-christmas-2026/ev_a51f9f61eaca1f32.jpg",
      "credit": "evermoreresort.com official website",
      "href": "https://evermoreresort.com/experiences/christmas-at-evermore"
    },
    {
      "src": "/place-photos/batch-2026-11p/evermore-christmas-2026/ev_e3310056a08ec244.jpg",
      "credit": "evermoreresort.com official website",
      "href": "https://evermoreresort.com/experiences/christmas-at-evermore"
    },
    {
      "src": "/place-photos/batch-2026-11p/evermore-christmas-2026/ev_8ab824a2631db6ce.jpg",
      "credit": "evermoreresort.com official website",
      "href": "https://evermoreresort.com/experiences/christmas-at-evermore"
    }
  ],
  "pensacola-downtown-first-city-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11p/pensacola-downtown-first-city-lights-2026/ev_1d0109a2c5c53103.jpg",
      "credit": "downtownpensacola.com official website",
      "href": "https://downtownpensacola.com/news/coming-nov-4-downtown-pensacola-kicks-off-the-holiday-season-with-lights-santa-the-grinch-shopping-and-more"
    }
  ],
  "wellen-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_7207e9ce61cf930c.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_42eeaf8f80ff1e0e.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_414117b931a663bd.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_461cc3b8e20cc0c5.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_2b81775bd3f1687c.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_b3a1b36258474afd.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wellen-wonderland-2026/ev_17f340c09d64acd6.jpg",
      "credit": "wellenpark.com official website",
      "href": "https://wellenpark.com/wellen-wonderland/"
    }
  ],
  "santa-drop-at-the-flora-bama-2026": [
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_fdc64006df92de50.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    },
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_54905618587417ae.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    },
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_d38dd503ea46f58d.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    },
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_208e0e7bf712b09e.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    },
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_bbd1a4356a4caf8e.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    },
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_72d7a8abea8c27c0.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    },
    {
      "src": "/place-photos/batch-2026-11p/santa-drop-at-the-flora-bama-2026/ev_881d85beb9f2663a.jpg",
      "credit": "florabama.com official website",
      "href": "https://www.florabama.com/santa-drop"
    }
  ],
  "fairgrounds-festival-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11p/fairgrounds-festival-of-lights-2026/ev_96088ba14a0500bc.jpg",
      "credit": "stluciecountyfair.org official website",
      "href": "https://www.stluciecountyfair.org/festival-of-lights"
    }
  ],
  "fantasy-lights-festival-palm-coast-2026": [
    {
      "src": "/place-photos/batch-2026-11p/fantasy-lights-festival-palm-coast-2026/ev_927228c9d98ead05.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/events/home/details/tree-lighting"
    },
    {
      "src": "/place-photos/batch-2026-11p/fantasy-lights-festival-palm-coast-2026/ev_b0ec65f6a1137048.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/events/home/details/tree-lighting"
    },
    {
      "src": "/place-photos/batch-2026-11p/fantasy-lights-festival-palm-coast-2026/ev_43e393596780f9ad.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/events/home/details/tree-lighting"
    },
    {
      "src": "/place-photos/batch-2026-11p/fantasy-lights-festival-palm-coast-2026/ev_142f27a750732fcb.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/events/home/details/tree-lighting"
    },
    {
      "src": "/place-photos/batch-2026-11p/fantasy-lights-festival-palm-coast-2026/ev_7f632c8cd2a20e52.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/events/home/details/tree-lighting"
    }
  ],
  "palm-coast-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11p/palm-coast-tree-lighting-2026/ev_3cdd70580bac903d.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/Events/Home/Details/tree-lighting"
    },
    {
      "src": "/place-photos/batch-2026-11p/palm-coast-tree-lighting-2026/ev_5485a1e06dcecd13.jpg",
      "credit": "palmcoast.gov official website",
      "href": "https://www.palmcoast.gov/Events/Home/Details/tree-lighting"
    }
  ],
  "vero-beach-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_d6da828226d79299.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_7fa93c9d56ce08dc.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_4dbe096d4874b552.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_d869df2099803558.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_b5c4c8d2ab623e5e.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_4fec5dac3ff9efd3.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    },
    {
      "src": "/place-photos/batch-2026-11p/vero-beach-christmas-parade-2026/ev_0e1e5f96c6fe0798.jpg",
      "credit": "verobeachchristmasparade.org official website",
      "href": "https://verobeachchristmasparade.org/"
    }
  ],
  "clearwater-holiday-lighted-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/clearwater-holiday-lighted-boat-parade-2026/ev_191f9caf8b752849.jpg",
      "credit": "clearwateryachtclub.org official website",
      "href": "https://www.clearwateryachtclub.org/special-events/holidayboatparade"
    },
    {
      "src": "/place-photos/batch-2026-11p/clearwater-holiday-lighted-boat-parade-2026/ev_62523ad98b87f7e4.jpg",
      "credit": "clearwateryachtclub.org official website",
      "href": "https://www.clearwateryachtclub.org/special-events/holidayboatparade"
    },
    {
      "src": "/place-photos/batch-2026-11p/clearwater-holiday-lighted-boat-parade-2026/ev_eb840a9e43358f57.jpg",
      "credit": "clearwateryachtclub.org official website",
      "href": "https://www.clearwateryachtclub.org/special-events/holidayboatparade"
    }
  ],
  "st-lucie-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/st-lucie-boat-parade-2026/ev_3343cbe2721d04d4.jpg",
      "credit": "fortpierceyachtclub.com official website",
      "href": "https://fortpierceyachtclub.com/SLC-Christmas-Boat-Parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-lucie-boat-parade-2026/ev_5d931270b5ef60c9.jpg",
      "credit": "fortpierceyachtclub.com official website",
      "href": "https://fortpierceyachtclub.com/SLC-Christmas-Boat-Parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-lucie-boat-parade-2026/ev_5dc735ab967d8e35.jpg",
      "credit": "fortpierceyachtclub.com official website",
      "href": "https://fortpierceyachtclub.com/SLC-Christmas-Boat-Parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-lucie-boat-parade-2026/ev_1e10344f20aeae42.jpg",
      "credit": "fortpierceyachtclub.com official website",
      "href": "https://fortpierceyachtclub.com/SLC-Christmas-Boat-Parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-lucie-boat-parade-2026/ev_e6ed343a49c54a09.jpg",
      "credit": "fortpierceyachtclub.com official website",
      "href": "https://fortpierceyachtclub.com/SLC-Christmas-Boat-Parade"
    }
  ],
  "titusville-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/titusville-christmas-parade-2026/ev_43cc207f075a6770.jpg",
      "credit": "christmasparadeirc.com official website",
      "href": "https://christmasparadeirc.com/"
    }
  ],
  "cape-coral-holiday-boat-a-long-2026": [
    {
      "src": "/place-photos/batch-2026-11p/cape-coral-holiday-boat-a-long-2026/ev_b924742b263db972.jpg",
      "credit": "capecoral.gov official website",
      "href": "https://www.capecoral.gov/community/special_events/holiday_boat_a_long.php"
    }
  ],
  "christmas-lane-plant-city-2026": [
    {
      "src": "/place-photos/batch-2026-11p/christmas-lane-plant-city-2026/ev_6c47ddc24972d608.jpg",
      "credit": "christmaslane.com official website",
      "href": "https://christmaslane.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/christmas-lane-plant-city-2026/ev_df465c0702654555.jpg",
      "credit": "christmaslane.com official website",
      "href": "https://christmaslane.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/christmas-lane-plant-city-2026/ev_dff9c5974737fca2.jpg",
      "credit": "christmaslane.com official website",
      "href": "https://christmaslane.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/christmas-lane-plant-city-2026/ev_d9d8b0302a8794b8.jpg",
      "credit": "christmaslane.com official website",
      "href": "https://christmaslane.com/"
    }
  ],
  "seaside-turn-on-the-town-2026": [
    {
      "src": "/place-photos/batch-2026-11p/seaside-turn-on-the-town-2026/ev_8fb8473dbb1ece7c.jpg",
      "credit": "seasidefl.com official website",
      "href": "https://seasidefl.com/event/seaside-holiday-parade-turn-on-the-town-2026/"
    }
  ],
  "pensacola-beach-fireworks-cruise-2026": [
    {
      "src": "/place-photos/batch-2026-11p/pensacola-beach-fireworks-cruise-2026/ev_edff33543fd18b5c.jpg",
      "credit": "visitpensacola.com official website",
      "href": "https://www.visitpensacola.com/events/lighted-boat-parade-fireworks-cruise/"
    },
    {
      "src": "/place-photos/batch-2026-11p/pensacola-beach-fireworks-cruise-2026/ev_13a31c814e263c0e.jpg",
      "credit": "visitpensacola.com official website",
      "href": "https://www.visitpensacola.com/events/lighted-boat-parade-fireworks-cruise/"
    },
    {
      "src": "/place-photos/batch-2026-11p/pensacola-beach-fireworks-cruise-2026/ev_8f6979525e3c20bf.jpg",
      "credit": "visitpensacola.com official website",
      "href": "https://www.visitpensacola.com/events/lighted-boat-parade-fireworks-cruise/"
    },
    {
      "src": "/place-photos/batch-2026-11p/pensacola-beach-fireworks-cruise-2026/ev_461c0c22f77d318e.jpg",
      "credit": "visitpensacola.com official website",
      "href": "https://www.visitpensacola.com/events/lighted-boat-parade-fireworks-cruise/"
    }
  ],
  "merritt-island-light-up-magnolia-2026": [
    {
      "src": "/place-photos/batch-2026-11p/merritt-island-light-up-magnolia-2026/ev_023a1d6c9d34de84.jpg",
      "credit": "fbcmi.com official website",
      "href": "https://www.fbcmi.com/events/event/25/light-up-magnolia/2026-12-04"
    }
  ],
  "plant-city-merry-market-2026": [
    {
      "src": "/place-photos/batch-2026-11p/plant-city-merry-market-2026/ev_83649ad3f467d749.jpg",
      "credit": "plantcitymerrymarket.com official website",
      "href": "https://plantcitymerrymarket.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/plant-city-merry-market-2026/ev_97c6b9e89356d946.jpg",
      "credit": "plantcitymerrymarket.com official website",
      "href": "https://plantcitymerrymarket.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/plant-city-merry-market-2026/ev_ed8e2a982a9e4e98.jpg",
      "credit": "plantcitymerrymarket.com official website",
      "href": "https://plantcitymerrymarket.com/"
    }
  ],
  "lwr-holiday-of-the-arts-2026": [
    {
      "src": "/place-photos/batch-2026-11p/lwr-holiday-of-the-arts-2026/ev_4f068d55b6f0cc11.jpg",
      "credit": "lakewoodranch.com official website",
      "href": "https://lakewoodranch.com/event/lakewood-ranch-fine-art-festival-2/"
    }
  ],
  "manatee-river-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/manatee-river-boat-parade-2026/ev_e47fb641428dcccf.jpg",
      "credit": "holidayboatparade.org official website",
      "href": "https://holidayboatparade.org/"
    }
  ],
  "the-saturday-night-before-christmas-eve-boat-parade-punta-gorda-isles-2026": [
    {
      "src": "/place-photos/batch-2026-11p/the-saturday-night-before-christmas-eve-boat-parade-punta-gorda-isles-2026/ev_34c438c0bdd5dd34.jpg",
      "credit": "puntagordaboatparade.com official website",
      "href": "https://puntagordaboatparade.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/the-saturday-night-before-christmas-eve-boat-parade-punta-gorda-isles-2026/ev_cd9f4630012f2f8f.jpg",
      "credit": "puntagordaboatparade.com official website",
      "href": "https://puntagordaboatparade.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/the-saturday-night-before-christmas-eve-boat-parade-punta-gorda-isles-2026/ev_2d03cfc743d78d1b.jpg",
      "credit": "puntagordaboatparade.com official website",
      "href": "https://puntagordaboatparade.com/"
    }
  ],
  "havana-allison-christmas-spectacular-2026": [
    {
      "src": "/place-photos/batch-2026-11p/havana-allison-christmas-spectacular-2026/ev_ef745daa1c6c5ed2.jpg",
      "credit": "allisonchristmasspectacular.com official website",
      "href": "https://www.allisonchristmasspectacular.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/havana-allison-christmas-spectacular-2026/ev_2530849234b5a81f.jpg",
      "credit": "allisonchristmasspectacular.com official website",
      "href": "https://www.allisonchristmasspectacular.com/"
    }
  ],
  "suwannee-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11p/suwannee-lights-2026/ev_857e90bd936bfd80.jpg",
      "credit": "suwanneelights.com official website",
      "href": "https://www.suwanneelights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/suwannee-lights-2026/ev_ed75e07c3ab521c4.jpg",
      "credit": "suwanneelights.com official website",
      "href": "https://www.suwanneelights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/suwannee-lights-2026/ev_aecf0bd93d1950db.jpg",
      "credit": "suwanneelights.com official website",
      "href": "https://www.suwanneelights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/suwannee-lights-2026/ev_55f536eee35d673d.jpg",
      "credit": "suwanneelights.com official website",
      "href": "https://www.suwanneelights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/suwannee-lights-2026/ev_fb50a3a497341c4f.jpg",
      "credit": "suwanneelights.com official website",
      "href": "https://www.suwanneelights.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/suwannee-lights-2026/ev_5673e913b543e3ab.jpg",
      "credit": "suwanneelights.com official website",
      "href": "https://www.suwanneelights.com/"
    }
  ],
  "indian-rocks-beach-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11p/indian-rocks-beach-tree-lighting-2026/ev_4eb477768495c64f.jpg",
      "credit": "indian rocks beach.com official website",
      "href": "https://www.indian-rocks-beach.com/events/christmas-tree-lighting-3/"
    }
  ],
  "port-orange-holiday-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/port-orange-holiday-parade-2026/ev_a5865715e6f52a5f.jpg",
      "credit": "visitnsbfl.com official website",
      "href": "https://www.visitnsbfl.com/events/e/2026-47th-annual-holiday-parade-6aba3f96d4e7f77105e2f903"
    }
  ],
  "miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026": [
    {
      "src": "/place-photos/batch-2026-11p/miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026/ev_1ad26d02e04b69ef.jpg",
      "credit": "juniororangebowl.org official website",
      "href": "https://juniororangebowl.org/holiday-parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026/ev_bab1647fa35bca37.jpg",
      "credit": "juniororangebowl.org official website",
      "href": "https://juniororangebowl.org/holiday-parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026/ev_445930a787906a99.jpg",
      "credit": "juniororangebowl.org official website",
      "href": "https://juniororangebowl.org/holiday-parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026/ev_50759f36516d73fa.jpg",
      "credit": "juniororangebowl.org official website",
      "href": "https://juniororangebowl.org/holiday-parade"
    },
    {
      "src": "/place-photos/batch-2026-11p/miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026/ev_ee63bc495c91687a.jpg",
      "credit": "juniororangebowl.org official website",
      "href": "https://juniororangebowl.org/holiday-parade"
    }
  ],
  "avalon-aglow-wesley-chapel-2026": [
    {
      "src": "/place-photos/batch-2026-11p/avalon-aglow-wesley-chapel-2026/ev_3cd9095a013ffdb0.jpg",
      "credit": "avalonparkwesleychapel.com official website",
      "href": "https://avalonparkwesleychapel.com/avalon-aglow/"
    }
  ],
  "enchanted-holiday-experience-port-charlotte-2026": [
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_bae96da3788ee835.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_b430b48b4b004ee1.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_2bb833818a9a4693.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_d795a88194c5932a.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_67708732f7923c87.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_fae2c8789765767a.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/enchanted-holiday-experience-port-charlotte-2026/ev_71eb2d62b7e1dacf.jpg",
      "credit": "enchantedholidayexperience.com official website",
      "href": "https://enchantedholidayexperience.com/"
    }
  ],
  "alys-in-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-11p/alys-in-winter-wonderland-2026/ev_54d2d8fbddfdcf2d.jpg",
      "credit": "alysbeach.com official website",
      "href": "https://alysbeach.com/event/alys-in-winter-wonderland-2/"
    },
    {
      "src": "/place-photos/batch-2026-11p/alys-in-winter-wonderland-2026/ev_2e0bf78b6662fa24.jpg",
      "credit": "alysbeach.com official website",
      "href": "https://alysbeach.com/event/alys-in-winter-wonderland-2/"
    }
  ],
  "staug-beach-light-up-art-walk-2026": [
    {
      "src": "/place-photos/batch-2026-11p/staug-beach-light-up-art-walk-2026/ev_37a510bfd4a8ffe0.jpg",
      "credit": "visitstaugustine.com official website",
      "href": "https://www.visitstaugustine.com/event/light-beach-art-walkshop-and-dine"
    },
    {
      "src": "/place-photos/batch-2026-11p/staug-beach-light-up-art-walk-2026/ev_bc591321f56ef9d1.jpg",
      "credit": "visitstaugustine.com official website",
      "href": "https://www.visitstaugustine.com/event/light-beach-art-walkshop-and-dine"
    }
  ],
  "wekiva-island-winter-wonderland-2026": [
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_05e61817a831dfe6.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_89cdc927930df321.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_7f73e17cd9533ea8.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_d24c955f90522d3b.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_c1d2320fe47eb879.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_aa949ae02678cbb2.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    },
    {
      "src": "/place-photos/batch-2026-11p/wekiva-island-winter-wonderland-2026/ev_1ca5db111bf0b2e5.jpg",
      "credit": "wekivaisland.com official website",
      "href": "https://wekivaisland.com/winter-wonderland/"
    }
  ],
  "islamorada-holiday-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11p/islamorada-holiday-festival-2026/ev_8788291f0854599a.jpg",
      "credit": "islamoradachamber.com official website",
      "href": "https://islamoradachamber.com/holiday-fest/"
    },
    {
      "src": "/place-photos/batch-2026-11p/islamorada-holiday-festival-2026/ev_5a7e4ec91a34e7c7.jpg",
      "credit": "islamoradachamber.com official website",
      "href": "https://islamoradachamber.com/holiday-fest/"
    }
  ],
  "monticello-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11p/monticello-christmas-2026/ev_1b06fea78b26b22a.jpg",
      "credit": "monticellochristmas.com official website",
      "href": "https://www.monticellochristmas.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/monticello-christmas-2026/ev_6f472b934b995b36.jpg",
      "credit": "monticellochristmas.com official website",
      "href": "https://www.monticellochristmas.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/monticello-christmas-2026/ev_8d1c026b5c32690c.jpg",
      "credit": "monticellochristmas.com official website",
      "href": "https://www.monticellochristmas.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/monticello-christmas-2026/ev_872c0996ebedbdd9.jpg",
      "credit": "monticellochristmas.com official website",
      "href": "https://www.monticellochristmas.com/"
    }
  ],
  "hobe-sound-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/hobe-sound-christmas-parade-2026/ev_1819167ce3497934.jpg",
      "credit": "hobesound.org official website",
      "href": "https://www.hobesound.org/christmas-parade/"
    },
    {
      "src": "/place-photos/batch-2026-11p/hobe-sound-christmas-parade-2026/ev_c56237aadd92f0ab.jpg",
      "credit": "hobesound.org official website",
      "href": "https://www.hobesound.org/christmas-parade/"
    },
    {
      "src": "/place-photos/batch-2026-11p/hobe-sound-christmas-parade-2026/ev_e0087ed3a88db372.jpg",
      "credit": "hobesound.org official website",
      "href": "https://www.hobesound.org/christmas-parade/"
    },
    {
      "src": "/place-photos/batch-2026-11p/hobe-sound-christmas-parade-2026/ev_49042bdd7beb0e26.jpg",
      "credit": "hobesound.org official website",
      "href": "https://www.hobesound.org/christmas-parade/"
    }
  ],
  "palm-beach-holiday-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/palm-beach-holiday-boat-parade-2026/ev_1f480100dd9ff93d.jpg",
      "credit": "marinepbc.org official website",
      "href": "https://www.marinepbc.org/boat-parade/"
    }
  ],
  "mexico-beach-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11p/mexico-beach-tree-lighting-2026/ev_93cf7647121cf973.jpg",
      "credit": "mexicobeach.com official website",
      "href": "https://mexicobeach.com/event/christmas-tree-lighting/"
    }
  ],
  "keystone-heights-christmas-market-and-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/keystone-heights-christmas-market-and-parade-2026/ev_2397e640698b36c2.jpg",
      "credit": "exploreclay.com official website",
      "href": "https://exploreclay.com/christmas-in-clay/"
    },
    {
      "src": "/place-photos/batch-2026-11p/keystone-heights-christmas-market-and-parade-2026/ev_749527f4986c2012.jpg",
      "credit": "exploreclay.com official website",
      "href": "https://exploreclay.com/christmas-in-clay/"
    },
    {
      "src": "/place-photos/batch-2026-11p/keystone-heights-christmas-market-and-parade-2026/ev_7b20425efb7988c0.jpg",
      "credit": "exploreclay.com official website",
      "href": "https://exploreclay.com/christmas-in-clay/"
    },
    {
      "src": "/place-photos/batch-2026-11p/keystone-heights-christmas-market-and-parade-2026/ev_814addb1941ebdfc.jpg",
      "credit": "exploreclay.com official website",
      "href": "https://exploreclay.com/christmas-in-clay/"
    }
  ],
  "lake-sumter-landing-holly-jolly-arts-and-crafts-festival-2026": [
    {
      "src": "/place-photos/batch-2026-11p/lake-sumter-landing-holly-jolly-arts-and-crafts-festival-2026/ev_075a657d78b61043.jpg",
      "credit": "thevillagesentertainment.com official website",
      "href": "https://www.thevillagesentertainment.com/festivals-and-special-events/lake-sumter-landing-arts-crafts-festival-3/"
    },
    {
      "src": "/place-photos/batch-2026-11p/lake-sumter-landing-holly-jolly-arts-and-crafts-festival-2026/xm_384707fc60952369.jpg",
      "credit": "Ebyabe, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Villages_LSL01.jpg",
      "license": "CC BY 2.5",
      "license_url": "https://creativecommons.org/licenses/by/2.5",
      "author": "Ebyabe",
      "photo_year": 2009,
      "subject": "venue",
      "context": "venue",
    }
  ],
  "brandon-parade-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11p/brandon-parade-of-lights-2026/ev_0d22db33697400f1.jpg",
      "credit": "brandonparadeoflights.com official website",
      "href": "https://brandonparadeoflights.com/faq"
    },
    {
      "src": "/place-photos/batch-2026-11p/brandon-parade-of-lights-2026/ev_8da92a8030b2ffad.jpg",
      "credit": "brandonparadeoflights.com official website",
      "href": "https://brandonparadeoflights.com/faq"
    },
    {
      "src": "/place-photos/batch-2026-11p/brandon-parade-of-lights-2026/ev_28481ea467db83d0.jpg",
      "credit": "brandonparadeoflights.com official website",
      "href": "https://brandonparadeoflights.com/faq"
    },
    {
      "src": "/place-photos/batch-2026-11p/brandon-parade-of-lights-2026/ev_7590dcd36201663b.jpg",
      "credit": "brandonparadeoflights.com official website",
      "href": "https://brandonparadeoflights.com/faq"
    }
  ],
  "st-pete-christmas-classic-car-cart-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_8d4ea2917f9c469c.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_fc1903e9f535a258.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_5eecd49a84da34f7.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_63cfbbe91fb68cf0.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_57515f0466a15bd7.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_fa35a99d47015117.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    },
    {
      "src": "/place-photos/batch-2026-11p/st-pete-christmas-classic-car-cart-parade-2026/ev_92fca7a1381e63cc.jpg",
      "credit": "christmasclassictoydrive.com official website",
      "href": "https://www.christmasclassictoydrive.com/"
    }
  ],
  "stock-island-holiday-lighted-boat-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11p/stock-island-holiday-lighted-boat-parade-2026/ev_2030aa0171926729.jpg",
      "credit": "perrykeywest.com official website",
      "href": "https://www.perrykeywest.com/event/holiday-lighted-boat-parade/"
    }
  ],
  "chipley-christmas-fest-2026": [
    {
      "src": "/place-photos/batch-2026-11p/chipley-christmas-fest-2026/ev_0e6841ca9ee9b466.jpg",
      "credit": "visitwcfla.com official website",
      "href": "https://www.visitwcfla.com/events/chipley-christmas-festival/"
    }
  ],
  "cracker-christmas-fort-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_4da1b468bb28bb98.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_8adc2e278b376434.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_4101ed586624a63d.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_78552a2de99c0e45.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_372112d27c8b099c.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_0f44843bc126901d.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11p/cracker-christmas-fort-christmas-2026/ev_585dd07381996cd3.jpg",
      "credit": "fchsinfo.com official website",
      "href": "https://fchsinfo.com/cracker-christmas/"
    }
  ],
  // batch 2026-11o (blank Christmas event cards, official organizer photos)
  "utc-santas-grand-arrival-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11o/utc-santas-grand-arrival-parade-2026/ev_e0ff25a7150fc7a0.jpg",
      "credit": "University Town Center official website",
      "href": "https://utcsarasota.com/holidays/"
    },
    {
      "src": "/place-photos/batch-2026-11o/utc-santas-grand-arrival-parade-2026/ev_b21435deae09394f.jpg",
      "credit": "University Town Center official website",
      "href": "https://utcsarasota.com/holidays/"
    },
    {
      "src": "/place-photos/batch-2026-11o/utc-santas-grand-arrival-parade-2026/ev_cea73472dd7cd2b0.jpg",
      "credit": "University Town Center official website",
      "href": "https://utcsarasota.com/holidays/"
    },
    {
      "src": "/place-photos/batch-2026-11o/utc-santas-grand-arrival-parade-2026/ev_b920681804ccb70b.jpg",
      "credit": "University Town Center official website",
      "href": "https://utcsarasota.com/holidays/"
    },
    {
      "src": "/place-photos/batch-2026-11o/utc-santas-grand-arrival-parade-2026/ev_11adf3182af1a0b3.jpg",
      "credit": "University Town Center official website",
      "href": "https://utcsarasota.com/holidays/"
    }
  ],
  "siesta-key-holiday-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11o/siesta-key-holiday-parade-2026/ev_ad84d4a988ed2798.jpg",
      "credit": "Siesta Key Chamber of Commerce official website",
      "href": "https://my.siestakeychamber.com/events/details/2026-holiday-parade-3642"
    }
  ],
  "wbtt-motown-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11o/wbtt-motown-christmas-2026/ev_3eb80b527b99c221.jpg",
      "credit": "Westcoast Black Theatre Troupe official website",
      "href": "https://www.westcoastblacktheatre.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/wbtt-motown-christmas-2026/ev_0ab82daf6f28fc65.jpg",
      "credit": "Westcoast Black Theatre Troupe official website",
      "href": "https://www.westcoastblacktheatre.org/"
    }
  ],
  "florida-ballet-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11o/florida-ballet-nutcracker-2026/ev_898bc709142fcb56.jpg",
      "credit": "Florida Ballet official website",
      "href": "https://floridaballet.org/thenutcracker"
    },
    {
      "src": "/place-photos/batch-2026-11o/florida-ballet-nutcracker-2026/ev_009d1586a7b21e8b.jpg",
      "credit": "Florida Ballet official website",
      "href": "https://floridaballet.org/thenutcracker"
    }
  ],
  "san-marco-luminaria-2026": [
    {
      "src": "/place-photos/batch-2026-11o/san-marco-luminaria-2026/ev_b069209275777a1b.jpg",
      "credit": "San Marco Preservation Society official website",
      "href": "https://smpsjax.com/events/"
    }
  ],
  "light-up-night-staug-2026": [
    {
      "src": "/place-photos/batch-2026-11o/light-up-night-staug-2026/ev_34971bb13ff8fd33.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights-light-night"
    },
    {
      "src": "/place-photos/batch-2026-11o/light-up-night-staug-2026/ev_3b05b069aa55475d.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights-light-night"
    },
    {
      "src": "/place-photos/batch-2026-11o/light-up-night-staug-2026/ev_14dd212315f560f1.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights-light-night"
    }
  ],
  "nights-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_ed15188375c3d317.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_56ccd2c5cfd96a71.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_bce814d05cd5e3ff.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_7c45638117929e67.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_7e60da4c0692529f.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_64b36bfb5adf3423.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/nights-of-lights-2026/ev_dbb9e6b53f2dc466.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/nights-lights"
    }
  ],
  "florida-water-tours-nol-2026": [
    {
      "src": "/place-photos/batch-2026-11o/florida-water-tours-nol-2026/ev_79d1ab4efc40f860.jpg",
      "credit": "Florida's Historic Coast official website",
      "href": "https://www.floridashistoriccoast.com/events/regatta-of-lights/"
    },
    {
      "src": "/place-photos/batch-2026-11o/florida-water-tours-nol-2026/ev_fbb49d0fb26044d5.jpg",
      "credit": "Florida's Historic Coast official website",
      "href": "https://www.floridashistoriccoast.com/events/regatta-of-lights/"
    }
  ],
  "staug-tasting-tours-santa-ride-2026": [
    {
      "src": "/place-photos/batch-2026-11o/staug-tasting-tours-santa-ride-2026/ev_cd74b532fedab282.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/events/nights-lights"
    }
  ],
  "ripleys-red-train-nol-2026": [
    {
      "src": "/place-photos/batch-2026-11o/ripleys-red-train-nol-2026/ev_d07fc89dd0ae6769.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/ripleys-red-trains-nights-lights-tours"
    },
    {
      "src": "/place-photos/batch-2026-11o/ripleys-red-train-nol-2026/ev_d557c691a835e703.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/ripleys-red-trains-nights-lights-tours"
    }
  ],
  "staug-christmas-parade-2026": [
    {
      "src": "/place-photos/batch-2026-11o/staug-christmas-parade-2026/ev_096f4624ebcbbceb.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/christmas-parade"
    },
    {
      "src": "/place-photos/batch-2026-11o/staug-christmas-parade-2026/ev_ac672e9d7b536113.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/christmas-parade"
    },
    {
      "src": "/place-photos/batch-2026-11o/staug-christmas-parade-2026/ev_72d9dae6cdcf94e4.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/christmas-parade"
    },
    {
      "src": "/place-photos/batch-2026-11o/staug-christmas-parade-2026/ev_b077ce65150f9370.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/christmas-parade"
    },
    {
      "src": "/place-photos/batch-2026-11o/staug-christmas-parade-2026/ev_b045b8900e982e9f.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/christmas-parade"
    }
  ],
  "regatta-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11o/regatta-of-lights-2026/ev_b254533254793439.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/regatta-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/regatta-of-lights-2026/ev_c047673cf2548e58.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/regatta-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/regatta-of-lights-2026/ev_c98d9abdb7a8aaad.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/regatta-lights"
    },
    {
      "src": "/place-photos/batch-2026-11o/regatta-of-lights-2026/ev_e585cebbbf418e84.jpg",
      "credit": "Visit St. Augustine official website",
      "href": "https://www.visitstaugustine.com/event/regatta-lights"
    }
  ],
  "winterfest-family-fun-day-2026": [
    {
      "src": "/place-photos/batch-2026-11o/winterfest-family-fun-day-2026/ev_b94b5371418df5f1.jpg",
      "credit": "Seminole Hard Rock Winterfest official website",
      "href": "https://winterfestparade.com/events/family-fun-day"
    }
  ],
  "christmas-on-las-olas-2026": [
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-las-olas-2026/ev_9536ff3463ab389f.jpg",
      "credit": "Las Olas Boulevard official website",
      "href": "https://www.lasolasboulevard.com/christmasonlasolas"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-las-olas-2026/ev_fb4636fc03d189f2.jpg",
      "credit": "Las Olas Boulevard official website",
      "href": "https://www.lasolasboulevard.com/christmasonlasolas"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-las-olas-2026/ev_cbaa1e376b8e67d0.jpg",
      "credit": "Las Olas Boulevard official website",
      "href": "https://www.lasolasboulevard.com/christmasonlasolas"
    }
  ],
  "stranahan-victorian-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_81fb5d19f04f4a19.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    },
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_042101e6d1af59e9.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    },
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_56143c1c49e5a593.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    },
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_c969bbe98c853f6f.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    },
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_5c8481e98763bb89.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    },
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_7c4654ef0ff250e4.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    },
    {
      "src": "/place-photos/batch-2026-11o/stranahan-victorian-christmas-2026/ev_2ceb71c9c54a9288.jpg",
      "credit": "Historic Stranahan House Museum official website",
      "href": "https://stranahanhouse.org/victorian-christmas-tours/"
    }
  ],
  "naplescommunity-holidaypops-2026": [
    {
      "src": "/place-photos/batch-2026-11o/naplescommunity-holidaypops-2026/ev_0b9cd21f1965c446.jpg",
      "credit": "Naples Community Orchestra official website",
      "href": "https://www.thenco.org/holiday"
    }
  ],
  "christmas-on-third-naples-2026": [
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_ae286d9402bb115a.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_fedc56d8d751d776.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_9e690fe3b569e5fe.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_0e94e80d46ccc0c2.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_47839f58b6599a69.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_96780d9aca37c64c.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    },
    {
      "src": "/place-photos/batch-2026-11o/christmas-on-third-naples-2026/ev_fdd8c49ea2df8556.jpg",
      "credit": "Third Street South official website",
      "href": "https://thirdstreetsouth.com/christmas-on-third/"
    }
  ],
  "5th-avenue-south-christmas-walk-and-tree-lighting-2026": [
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_f3832fabc1f3e412.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_b582d9bc77acc0f4.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_78dd5eb1cd130003.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_14ab884ed5a3720b.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_0d29a538455b761e.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_662b3573ab2e10a0.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    },
    {
      "src": "/place-photos/batch-2026-11o/5th-avenue-south-christmas-walk-and-tree-lighting-2026/ev_f158f9aa468c95d8.jpg",
      "credit": "Fifth Avenue South official website",
      "href": "https://www.fifthavenuesouth.com/christmas/"
    }
  ],
  "venetian-village-holiday-on-the-bay-2026": [
    {
      "src": "/place-photos/batch-2026-11o/venetian-village-holiday-on-the-bay-2026/ev_493815da442fc697.jpg",
      "credit": "Venetian Village official website",
      "href": "https://www.venetianvillage.com/event/holiday-on-the-bay-2026/"
    }
  ],
  "christmas-boat-parade-on-naples-bay-2026": [
    {
      "src": "/place-photos/batch-2026-11o/christmas-boat-parade-on-naples-bay-2026/ev_f67b1767361914d3.jpg",
      "credit": "Marco Island Area Chamber of Commerce official website",
      "href": "https://www.miacc.org/event/christmas-boat-parade-on-naples-bay/"
    }
  ],
  "key-west-harbor-walk-of-lights-2026": [
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_277cf786a9e029e8.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_740665a732d2335f.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_388178071794e88d.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_e403ce7fa731c061.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_e192f07ffaff983d.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_e2e26057a392c937.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-harbor-walk-of-lights-2026/ev_ea85b4fd9e184c38.jpg",
      "credit": "Key West Harbor Walk of Lights official website",
      "href": "https://keywestchristmas.org/"
    }
  ],
  "conch-train-holiday-lights-tour-2026": [
    {
      "src": "/place-photos/batch-2026-11o/conch-train-holiday-lights-tour-2026/ev_20e5c186e134a0a7.jpg",
      "credit": "Conch Tour Train official website",
      "href": "https://www.conchtourtrain.com/key-west-christmas-holiday-tours/"
    }
  ],
  "key-west-art-and-historical-society-holiday-concert-and-bazaar-2026": [
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_58c299e4758104a7.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_3a0f0efba1cd6d6a.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_4fefe474a1f9f0c4.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_55ec2ed3a993a6b8.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_0553b32d3e569da6.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_6fe32a9a25c40c26.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    },
    {
      "src": "/place-photos/batch-2026-11o/key-west-art-and-historical-society-holiday-concert-and-bazaar-2026/ev_ffc13005c196ed91.jpg",
      "credit": "Key West Art and Historical Society official website",
      "href": "https://www.kwahs.org/bazaar/"
    }
  ],
  "holidays-on-park-2026": [
    {
      "src": "/place-photos/batch-2026-11o/holidays-on-park-2026/ev_727cc4ec3a44c1ac.jpg",
      "credit": "Park Avenue District official website",
      "href": "https://parkavenuedistrict.com/holidaysonpark"
    },
    {
      "src": "/place-photos/batch-2026-11o/holidays-on-park-2026/ev_4b2f22d3eae7a07a.jpg",
      "credit": "Park Avenue District official website",
      "href": "https://parkavenuedistrict.com/holidaysonpark"
    },
    {
      "src": "/place-photos/batch-2026-11o/holidays-on-park-2026/ev_61e3b6b737f838db.jpg",
      "credit": "Park Avenue District official website",
      "href": "https://parkavenuedistrict.com/holidaysonpark"
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
      "href": "https://commons.wikimedia.org/wiki/File:Seneff_Arts_Plaza_at_Christmas.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_5839eb93700ccf96.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_for_the_Performing_Arts_interior_03.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_7ffd1d63874acac5.jpg",
      "credit": "Antony 22, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_2024.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_12df81b23d54d5c4.jpg",
      "credit": "Connor J. Williams, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Orlando_-_54118164064.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_593cc82aed93c5d0.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_03.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_38ba668deef3a01d.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_07.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-ballet-nutcracker-2026/xmas_ae997ce37df5fac2.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_01.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "orlando-phil-fierce-holiday-2026": [
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_0f0c7ba901a99c2e.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Seneff_Arts_Plaza_at_Christmas.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_5839eb93700ccf96.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_for_the_Performing_Arts_interior_03.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_7ffd1d63874acac5.jpg",
      "credit": "Antony 22, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_2024.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_12df81b23d54d5c4.jpg",
      "credit": "Connor J. Williams, CC BY 2.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Orlando_-_54118164064.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_593cc82aed93c5d0.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_03.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_38ba668deef3a01d.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_07.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/orlando-phil-fierce-holiday-2026/xmas_ae997ce37df5fac2.jpg",
      "credit": "Elisfkc, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Dr._Phillips_Center_Pics_01.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "florida-orchestra-nightmare-before-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_7c14dd9fc3393f6e.jpg",
      "credit": "Taylor Bennett Jordan, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Mahaffey_Theater.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_1daca84243fd53c9.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater01.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_d9953e7ea9ea1187.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater02.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_f4f5e5964b342a46.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater04.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-nightmare-before-christmas-2026/xmas_7f37de3ac05bcec9.jpg",
      "credit": "U.S. Department of Veterans Affairs, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:NVCAF_Stage_Show_-_inside_the_theater,_St_Petersburg_Florida_2022.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "florida-orchestra-classical-christmas-2026": [
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_7c14dd9fc3393f6e.jpg",
      "credit": "Taylor Bennett Jordan, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Mahaffey_Theater.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_1daca84243fd53c9.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater01.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_d9953e7ea9ea1187.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater02.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_f4f5e5964b342a46.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:St._Petersburg_FL_Mahaffey_Theater04.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-orchestra-classical-christmas-2026/xmas_7f37de3ac05bcec9.jpg",
      "credit": "U.S. Department of Veterans Affairs, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:NVCAF_Stage_Show_-_inside_the_theater,_St_Petersburg_Florida_2022.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "communitynutcracker-jax-2026": [
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_fef9cafc5c7a9b34.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S..jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_33b52d052ef8ef4a.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(07).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_048034a7340c9af6.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(28).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_b3808a15bdd59909.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(23).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_90325231427c2953.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(31).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/communitynutcracker-jax-2026/xmas_febeca0dab63db90.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(25).jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "florida-theatre-nutcracker-magical-2026": [
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_fef9cafc5c7a9b34.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S..jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_33b52d052ef8ef4a.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(07).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_048034a7340c9af6.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(28).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_b3808a15bdd59909.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(23).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_90325231427c2953.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(31).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/florida-theatre-nutcracker-magical-2026/xmas_febeca0dab63db90.jpg",
      "credit": "bubba73, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Florida_Theatre,_Jacksonville,_FL,_U.S._(25).jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "ballet-palm-beach-nutcracker-2026": [
    {
      "src": "/place-photos/batch-2026-11j/ballet-palm-beach-nutcracker-2026/xmas_fb0f3b68bd9922bd.jpg",
      "credit": "Nick22aku, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Kravis_CIMG0279.JPG",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/ballet-palm-beach-nutcracker-2026/xmas_03864cb8eca4a98e.jpg",
      "credit": "Mjrmtg, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Kravis_Center_for_the_Performing_Arts,_West_Palm_Beach.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/ballet-palm-beach-nutcracker-2026/xmas_ec72566de2177033.jpg",
      "credit": "Farragutful, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Kravis_Center_for_the_Performing_Arts.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "jupiter-rendezvous-light-2026": [
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_540d019d0c7faf42.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:MY_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_in_Florida_(18473841561).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_b92119e72c1d7efc.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_(17237643489).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_084e4842844e5eb4.jpg",
      "credit": "Lea Shanley, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_and_Museum_-_waterfront_view.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_39fd01dad7e92465.jpg",
      "credit": "Schizm00, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_(2010).JPG",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_af647ad3d42a0b25.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:My_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_ONA_in_Florida_(18282513868).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_f3907e8ec17853f2.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC01.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-rendezvous-light-2026/xmas_cb93770881a1792a.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC02.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "jupiter-luminary-nights-2026": [
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_540d019d0c7faf42.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:MY_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_in_Florida_(18473841561).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_b92119e72c1d7efc.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_Outstanding_Natural_Area_(17237643489).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_084e4842844e5eb4.jpg",
      "credit": "Lea Shanley, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_and_Museum_-_waterfront_view.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_39fd01dad7e92465.jpg",
      "credit": "Schizm00, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_Lighthouse_(2010).JPG",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_af647ad3d42a0b25.jpg",
      "credit": "Bureau of Land Management, Public domain, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:My_Public_Lands_Roadtrip-_Jupiter_Inlet_Lighthouse_ONA_in_Florida_(18282513868).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_f3907e8ec17853f2.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC01.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/jupiter-luminary-nights-2026/xmas_cb93770881a1792a.jpg",
      "credit": "Ebyabe, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Jupiter_Inlet_FL_Lighthouse_VC02.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "cocoa-village-hot-cocoa-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_0c300b2ba0d292e1.jpg",
      "credit": "Ebyabe, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_FL_Aladdin_Theater04.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_de2c6180dbee5136.jpg",
      "credit": "COCOAFL, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Village_2.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_f9fa07c64e8f55f8.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Belair_Courtyard,_Cocoa,_Florida.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_e4698f74468de212.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Aviles_Building_(Cocoa,_Florida)_001.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_edc19f349ff49933.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:411-403_Brevard_Ave,_Cocoa,_Florida.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_21285783a8f08fc2.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:415_Brevard_Ave,_Cocoa,_Florida.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/cocoa-village-hot-cocoa-holidays-2026/xmas_ef1f4bee68465228.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Threadneedle_Street_Mall,_Cocoa,_Florida.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "art-and-craft-holiday-bazaar-2026": [
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_0c300b2ba0d292e1.jpg",
      "credit": "Ebyabe, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_FL_Aladdin_Theater04.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_de2c6180dbee5136.jpg",
      "credit": "COCOAFL, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Cocoa_Village_2.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_f9fa07c64e8f55f8.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Belair_Courtyard,_Cocoa,_Florida.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_e4698f74468de212.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Aviles_Building_(Cocoa,_Florida)_001.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_edc19f349ff49933.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:411-403_Brevard_Ave,_Cocoa,_Florida.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_21285783a8f08fc2.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:415_Brevard_Ave,_Cocoa,_Florida.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/art-and-craft-holiday-bazaar-2026/xmas_ef1f4bee68465228.jpg",
      "credit": "Pokemonprime, CC BY 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Threadneedle_Street_Mall,_Cocoa,_Florida.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "breakers-christmas-dining-2026": [
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_d25f73f791459ed1.jpg",
      "credit": "Rich Andrews, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:The_Breakers_(hotel).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_e17d5e64d8807782.jpg",
      "credit": "Nick22aku at English Wikipedia, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_CIMG0089.JPG",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_eb5438a3a823a054.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_001.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-christmas-dining-2026/xmas_e4e02b5cb67734cc.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_003.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "breakers-holidays-2026": [
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_d25f73f791459ed1.jpg",
      "credit": "Rich Andrews, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:The_Breakers_(hotel).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_e17d5e64d8807782.jpg",
      "credit": "Nick22aku at English Wikipedia, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_CIMG0089.JPG",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_eb5438a3a823a054.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_001.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holidays-2026/xmas_e4e02b5cb67734cc.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_003.jpg",
      "context": "venue"
    }
  ],
  // batch 2026-11j
  "breakers-holiday-decor-2026": [
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_d25f73f791459ed1.jpg",
      "credit": "Rich Andrews, CC BY SA 4.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:The_Breakers_(hotel).jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_e17d5e64d8807782.jpg",
      "credit": "Nick22aku at English Wikipedia, CC BY 2.5, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_CIMG0089.JPG",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_eb5438a3a823a054.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_001.jpg",
      "context": "venue"
    },
    {
      "src": "/place-photos/batch-2026-11j/breakers-holiday-decor-2026/xmas_e4e02b5cb67734cc.jpg",
      "credit": "Leonard J. DeFrancisci, CC BY SA 3.0, via Wikimedia Commons",
      "href": "https://commons.wikimedia.org/wiki/File:Breakers_(Palm_Beach,_Florida)_003.jpg",
      "context": "venue"
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
  const key = CHRISTMAS_STATIC_ALIAS[id] || id;
  const base = CHRISTMAS_STATIC_GALLERY[key] || [];
  const extra = (CHRISTMAS_STATIC_GALLERY_ADDITIONS[key] || []).filter((p) => !base.some((b) => b.src === p.src));
  const list = extra.length ? [...base, ...extra] : base;
  return list.slice(0, CHRISTMAS_MAX_PHOTOS).map((p) => ({ src: p.src, width: p.width || 1280, height: p.height || 853, alt: plain(p.alt || "Photo of " + (label || eventId)), ...(p.context === "venue" ? { context: "venue" } : {}), credit: /^photo\b/i.test(p.credit) ? p.credit : "Photo by " + p.credit, creditHref: /^https:\/\//.test(p.href || "") ? p.href : null, source: "static" }));
}

// The credit pinned on ONE event page rail photo (owner, 2026-11-05: keep
// attribution consistent with the displayed image). Each gallery photo has its
// own author and licence, so each photo carries its own line; a photo whose
// record says it shows the venue (context: "venue") says so. Null when the
// photo has no stored text credit (a Google answer is credited by its own lane).
export function eventRailPhotoCredit(photo) {
  const raw = typeof photo?.credit === "string" ? plain(photo.credit) : "";
  if (!raw) return null;
  const who = raw.replace(/^photos?\s*(?:by|from)\s+/i, "").replace(/^photo:\s*/i, "");
  return { text: (photo.context === "venue" ? "Venue photo · " : "") + "Photo: " + who, href: /^https:\/\//.test(String(photo.creditHref || "")) ? photo.creditHref : null };
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
