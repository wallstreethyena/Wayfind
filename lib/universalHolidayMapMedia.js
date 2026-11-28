const MAP_PHOTO_DIR = "/guides/universal-orlando-christmas-2026/";
const UNIVERSAL_MEDIA_SITE = "https://media.universalparksusa.com";
const CC_BY_2 = "https://creativecommons.org/licenses/by/2.0/";
const REGISTERED_ADAPTATION = "Resized, cropped and converted to WebP. Adaptation retains the source license.";

// The Universal files are native press renditions for editorial use and retain
// their original bytes and full framing. Commons adaptations were resized and
// converted to WebP without a file crop.
function editorialPhoto(filename, width, height, alt, sourcePath) {
  return {
    src: MAP_PHOTO_DIR + filename,
    width,
    height,
    alt,
    credit: "©2026 Universal Orlando. All Rights Reserved.",
    source: UNIVERSAL_MEDIA_SITE + sourcePath,
    license: "Editorial use",
    licenseUrl: UNIVERSAL_MEDIA_SITE + "/usage-policy/",
    preserveFraming: true,
  };
}

export const UNIVERSAL_HOLIDAY_MAP_MEDIA = {
  "grinchmas-seuss-landing": {
    photo: editorialPhoto("map-grinchmas.jpg", 1024, 576, "The Grinch in a Santa hat amid colorful Grinchmas decorations in Seuss Landing", "/wp-content/uploads/2026/11/Grinchmas.jpg"),
    caption: "Grinchmas in Seuss Landing",
  },
  "hop-on-pop": {
    photoKey: "seuss-landing",
    caption: "Seuss Landing, where Hop on Pop serves the sandwich",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "green-eggs-and-ham": {
    photoKey: "green-eggs-ham",
    caption: "Green Eggs and Ham Cafe in Seuss Landing",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "grinch-character-breakfast": {
    photo: {
      src: MAP_PHOTO_DIR + "map-circus-mcgurkus.webp",
      width: 880,
      height: 660,
      alt: "Colorful striped entrance and sign at Circus McGurkus Cafe Stoo-pendous",
      credit: "Jeremy Thompson",
      source: "https://commons.wikimedia.org/wiki/File:Seuss_Landing_13.jpg",
      license: "CC BY 2.0",
      licenseUrl: CC_BY_2,
      modificationNotice: "Resized and converted to WebP. Display crop.",
    },
    caption: "Circus McGurkus Cafe, the breakfast venue",
  },
  "hogsmeade-christmas": {
    photo: editorialPhoto("map-hogwarts-holiday.jpg", 802, 535, "Hogwarts Castle illuminated during its Christmas projection show in Hogsmeade", "/photos/christmas-in-the-wizarding-world-of-harry-potter-hogwarts-castle/"),
    caption: "The Magic of Christmas at Hogwarts Castle",
  },
  "studios-holiday-parade": {
    photo: editorialPhoto("map-holiday-parade.jpg", 1024, 576, "Gingy’s gingerbread balloon passing lit storefronts at Universal’s Holiday Parade featuring Macy’s", "/photos/universals-holiday-parade-featuring-macys/"),
    caption: "Universal’s Holiday Parade featuring Macy’s",
  },
  "new-york-holiday-kiosks": {
    photoKey: "holiday-food-selection",
    caption: "A selection of Universal’s holiday food and drinks",
  },
  "diagon-alley-christmas": {
    photo: editorialPhoto("map-diagon-alley-holiday.jpg", 1024, 683, "The Gringotts dragon breathing fire over holiday-decorated Diagon Alley at Universal Studios Florida", "/photos/christmas-in-the-wizarding-world-of-harry-potter-diagon-alley/"),
    caption: "Christmas in Diagon Alley",
  },
  "gingy-gingerbread-cake": {
    photo: editorialPhoto("map-dreamworks-land.jpg", 1024, 683, "Guests walking past Shrek’s cottage in DreamWorks Land at Universal Studios Florida", "/photos/dreamworks-land-shreks-swamp-meet/"),
    caption: "DreamWorks Land, where to find Imagination Café",
  },
  "toadstool-cafe": {
    photoKey: "nintendo-night",
    caption: "Toadstool Cafe after dark in Super Nintendo World",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "frosty-moon": {
    photoKey: "epic-overview",
    caption: "Celestial Park, the home of Frosty Moon",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "hooligans-grog-and-gruel": {
    photo: editorialPhoto("map-snoggletog.jpg", 1024, 683, "Rows of decorated Snoggletog trees at Epic Universe’s Isle of Berk", "/photos/how-to-train-your-dragon-isle-of-berk-snoggletog/"),
    caption: "Snoggletog in Isle of Berk",
  },
  "le-gobelet-noir": {
    photoKey: "wizarding-paris-night",
    caption: "Wizarding Paris, where Le Gobelet Noir is located",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "burning-blade-tavern": {
    photo: {
      src: MAP_PHOTO_DIR + "map-burning-blade-tavern.webp",
      width: 660,
      height: 880,
      alt: "The Burning Blade Tavern’s stone building and windmill in Dark Universe",
      credit: "Martin Lewison",
      source: "https://commons.wikimedia.org/wiki/File:The_Burning_Blade_Tavern.jpg",
      license: "CC BY 2.0",
      licenseUrl: CC_BY_2,
      modificationNotice: "Resized and converted to WebP. Display crop.",
    },
    caption: "The Burning Blade Tavern in Dark Universe",
  },
  "celestial-park-after-dark": {
    photo: editorialPhoto("map-celestial-park-holidays.jpg", 1024, 652, "Holiday garlands and illuminated Christmas trees outside the Oak and Star Tavern in Celestial Park", "/photos/celestial-park-oak-and-star-tavern-at-the-holidays/"),
    caption: "Holiday lights at Celestial Park’s Oak and Star Tavern",
  },
  "green-red-coconut-club": {
    photo: {
      src: "/place-photos/batch-2026-11-18-creators/dead-coconut-club-citywalk-orlando/cp_05fdada786f2bc43.jpg",
      width: 1278,
      height: 1278,
      alt: "The Red Coconut Club’s neon sign and entrance at Universal CityWalk",
      credit: "Universal Orlando official website",
      source: "https://www.universalorlando.com/web/en/us/things-to-do/entertainment/red-coconut-club/index.html",
      license: "Credited venue photo",
    },
    caption: "Red Coconut Club exterior, site of the seasonal pop-up",
  },
  "parking-and-arrival": {
    photoKey: "universal-globe",
    caption: "The Universal globe near the Studios entrance, reached through CityWalk",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "santas-belt": {
    photo: {
      src: MAP_PHOTO_DIR + "map-port-of-entry.webp",
      width: 880,
      height: 660,
      alt: "Entrance arch and clock tower in Port of Entry at Islands of Adventure",
      credit: "Jeremy Thompson",
      source: "https://commons.wikimedia.org/wiki/File:Port_of_Entry_1.jpg",
      license: "CC BY 2.0",
      licenseUrl: CC_BY_2,
      modificationNotice: "Resized and converted to WebP. Display crop.",
    },
    caption: "Port of Entry, where Croissant Moon Bakery is located",
  },
  "frosty-hot-cocoa-snowman": {
    photo: editorialPhoto("map-today-cafe.jpg", 1024, 683, "The TODAY Cafe exterior with its sunrise logo and orange patio umbrellas", "/photos/today-cafe-1/"),
    caption: "TODAY Cafe at Universal Studios Florida",
  },
  "dongzhi-nights": {
    photoKey: "epic-overview",
    caption: "Celestial Park, where the Blue Dragon Pan-Asian Restaurant is located",
    modificationNotice: REGISTERED_ADAPTATION,
  },
  "mid-town-special-pizza": {
    photo: {
      src: MAP_PHOTO_DIR + "map-marvel-super-hero-island.webp",
      width: 880,
      height: 660,
      alt: "Comic-book storefronts and superhero figures on Marvel Super Hero Island at Islands of Adventure",
      credit: "Jeremy Thompson",
      source: "https://commons.wikimedia.org/wiki/File:Marvel_Super_Hero_Island_2.jpg",
      license: "CC BY 2.0",
      licenseUrl: CC_BY_2,
      modificationNotice: "Resized and converted to WebP. Display crop.",
    },
    caption: "Marvel Super Hero Island, where Cafe 4 is located",
  },
  "souvenir-frozen-yaknog": {
    photo: editorialPhoto("map-mead-hall.jpg", 1024, 683, "Viking-style benches and carved pillars inside Mead Hall in Isle of Berk", "/photos/how-to-train-your-dragon-isle-of-berk-mead-hall/"),
    caption: "Inside Mead Hall in Isle of Berk",
  },
};
