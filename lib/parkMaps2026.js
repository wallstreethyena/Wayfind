// Owner-supplied illustrated park maps (Gabe, 2026-11-19: "make sure to use
// the map attached for both guide"), shared by the Disney holiday food guide
// and the Universal Orlando Christmas guide.
//
// Source: wayfind-park-maps.zip, "Holiday illustrations" set, drawn over
// OpenStreetMap data (ODbL; credit rendered next to every map). Processing,
// done once and committed as WebP: the printed legend band under each map was
// cut off and the printed numbers inside the red pins were blanked, because
// the guide renders its own tappable numbered pins and two numbering systems
// on one map misled (Islands of Adventure printed a land route, EPCOT printed
// pavilion numbers, Animal Kingdom's printed list omitted Flame Tree).
//
// Pin coordinates are the pin TIP, as percent of the committed image, read
// from the printed pins where one exists. Where the illustration has no pin
// for a stop, the position is noted in `placed`.
export const PARK_MAP_CREDIT = { label: "Map data © OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" };

export const PARK_MAPS = {
  "animal-kingdom": { width: 1207, height: 1226, alt: "Illustrated map of Disney’s Animal Kingdom with Africa, Asia, Pandora, Discovery Island and Oasis labelled. North is up." },
  "magic-kingdom": { width: 1456, height: 993, alt: "Illustrated map of Magic Kingdom with its lands, Cinderella Castle and Main Street, U.S.A. labelled. North is up." },
  "epcot": { width: 1221, height: 1245, alt: "Illustrated map of EPCOT with Spaceship Earth and the World Showcase pavilions labelled. North is up." },
  "mexico-pavilion": { width: 1325, height: 1103, alt: "Illustrated close-up of EPCOT’s Mexico Pavilion with San Angel Inn Restaurante, Test Track and the Norway Pavilion labelled." },
  "hollywood-studios": { width: 1239, height: 1193, alt: "Illustrated map of Disney’s Hollywood Studios with Galaxy’s Edge, Toy Story Land, Sunset and Hollywood Boulevards and Echo Lake labelled. North is up." },
  "echo-lake": { width: 1382, height: 1055, alt: "Illustrated close-up of Echo Lake at Hollywood Studios with Epic Eats, Dockside Diner and Toy Story Mania labelled." },
  "disney-springs": { width: 1556, height: 945, alt: "Illustrated map of Disney Springs with West Side, The Landing, Town Center and Marketplace labelled." },
  "islands-of-adventure": { width: 1665, height: 881, alt: "Illustrated map of Universal Islands of Adventure with Seuss Landing, Hogsmeade, Jurassic Park and the other lands labelled. North is up." },
  "universal-studios-florida": { width: 1176, height: 1292, alt: "Illustrated map of Universal Studios Florida with New York, Diagon Alley, Hollywood, DreamWorks Land and the other areas labelled. North is up." },
  "epic-universe": { width: 1176, height: 1295, alt: "Illustrated map of Epic Universe with Celestial Park, Super Nintendo World, Dark Universe, the Ministry of Magic and the Isle of Berk labelled." },
  "citywalk": { width: 1247, height: 1192, alt: "Illustrated map of Universal CityWalk Orlando between Islands of Adventure and Universal Studios Florida, with Hollywood Way and Universal Boulevard." },
};

export function parkMapImage(key) {
  const map = PARK_MAPS[key];
  if (!map) throw new Error("Unknown park map: " + key);
  return { src: "/guides/park-maps-2026/" + key + ".webp", width: map.width, height: map.height, alt: map.alt };
}

// Disney holiday food guide: the one illustration each park's map shows in the
// shared guide map card (GuideMapExplorer). EPCOT uses the whole park so the
// Festival of the Holidays booths fit around World Showcase.
export const DISNEY_PARK_MAP = {
  "magic-kingdom": "magic-kingdom",
  "epcot": "epcot",
  "hollywood-studios": "hollywood-studios",
  "animal-kingdom": "animal-kingdom",
  "disney-springs": "disney-springs",
};

// Pin tips in percent of the park's map image, keyed by park then stop or
// festival booth id. Pavilion pins sit on the pavilion the illustration labels;
// Future World / World Celebration booths are approximate (that part of the
// illustration is unlabeled), which the guide says next to the map.
export const DISNEY_FOOD_PINS = {
  "animal-kingdom": {
    "terra-treats-sundae": [42.63, 52.04],
    "santas-holiday-grove": [74.81, 72.51],
    // No printed pin: placed by a similarity fit of the two printed pins to
    // the stops' coordinates (lib/disneyChristmasFoodLocations2026.json).
    "flame-tree-cheesecake-pop": [57.5, 64.3],
  },
  "magic-kingdom": { "main-street-popcorn": [51.96, 84.39] },
  "epcot": {
    "san-angel-margarita": [73.46, 33.65],
    // EPCOT International Festival of the Holidays booths (@disneyfoodblog post DfpbdQwG23q).
    "las-posadas-holiday-kitchen": [68.8, 37.4],
    "norway-cart": [84.36, 48.19],
    "shanghai-holiday-kitchen": [84.68, 58.31],
    "refreshment-outpost": [88.6, 64.2],
    "bavaria-holiday-kitchen": [85.18, 69.0],
    "sommerfest": [79.4, 73.2],
    "tuscany-holiday-kitchen": [72.36, 82.89],
    "shi-wasu-holiday-kitchen": [32.8, 87.55],
    "diwali-holiday-kitchen": [36.5, 47.5],
    "chestnuts-and-good-cheer": [57.5, 52.5],
    "holiday-hearth-desserts": [62.0, 42.0],
    "seasons-eatings": [47.2, 33.5],
    "experimental-prototype-cookies": [41.0, 38.0],
    "connections-cafe": [53.8, 29.6],
    "sunshine-seasons": [20.5, 31.0],
    "refreshment-station": [66.5, 23.0],
  },
  "hollywood-studios": { "epic-eats-beignets": [41.0, 47.53] },
  "disney-springs": { "cookie-bar-sundae": [27.19, 40.0] },
};

// Universal Orlando Christmas guide: one illustration per map view.
export const UNIVERSAL_VIEW_MAPS = {
  islands: "islands-of-adventure",
  studios: "universal-studios-florida",
  epic: "epic-universe",
  citywalk: "citywalk",
};
