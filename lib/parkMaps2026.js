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

// Disney holiday food guide: per park, the close-up ("Food area") view and the
// whole-park view. Parks without a close-up use one illustration for both.
export const DISNEY_PARK_VIEWS = {
  "magic-kingdom": { food: "magic-kingdom", whole: null },
  "epcot": { food: "mexico-pavilion", whole: "epcot" },
  "hollywood-studios": { food: "echo-lake", whole: "hollywood-studios" },
  "animal-kingdom": { food: "animal-kingdom", whole: null },
  "disney-springs": { food: "disney-springs", whole: null },
};

export const DISNEY_FOOD_PINS = {
  "animal-kingdom": {
    "terra-treats-sundae": [42.63, 52.04],
    "santas-holiday-grove": [74.81, 72.51],
    // No printed pin: placed by a similarity fit of the two printed pins to
    // the stops' coordinates (lib/disneyChristmasFoodLocations2026.json).
    "flame-tree-cheesecake-pop": [57.5, 64.3],
  },
  "magic-kingdom": { "main-street-popcorn": [51.96, 84.39] },
  "epcot": { "san-angel-margarita": [73.46, 33.65] },
  "mexico-pavilion": { "san-angel-margarita": [50.19, 56.3] },
  "hollywood-studios": { "epic-eats-beignets": [41.0, 47.53] },
  "echo-lake": { "epic-eats-beignets": [82.56, 18.29] },
  "disney-springs": { "cookie-bar-sundae": [27.19, 40.0] },
};

// Universal Orlando Christmas guide: one illustration per map view.
export const UNIVERSAL_VIEW_MAPS = {
  islands: "islands-of-adventure",
  studios: "universal-studios-florida",
  epic: "epic-universe",
  citywalk: "citywalk",
};
