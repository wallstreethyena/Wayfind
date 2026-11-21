// Reviewed photographs for exact inventory IDs. Venue photos show the listed
// location. Menu photos show items served by the named restaurant brand.
// Source pages, licenses, and image treatments are in public/places/CREDITS.md.
const curatedPhotos = [
  {
    file: "/places/food/whataburger-burger.webp",
    photo: {
      source: "owner",
      license: "Editorial press use",
      attribution_text: "Whataburger",
      attribution_url: "https://stories.whataburger.com/asset/864583/burger-small",
    },
    places: ["ChIJ73_jJQBn54gRyBzOZRlSfi4"],
  },
  {
    file: "/places/food/fat-shack-sandwich.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY-SA 4.0",
      attribution_text: "Cjuliano19, CC BY-SA 4.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Fat_Shack_Sandwich.jpg",
    },
    places: ["ChIJO7VwBz5p54gR_CIr-tDYiOw"],
  },
  {
    file: "/places/food/giordanos-stuffed-pizza.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Eric Chan, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Giordanos_stuffed_pizza.jpg",
    },
    places: ["ChIJicZ0CVZ-54gR-HtvpylXgFY"],
  },
  {
    file: "/places/food/white-castle-sliders.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Arnold Gatilao, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:White_Castle_-_Chicago,_IL_(3026769554).jpg",
    },
    places: ["ChIJky8WzhKB3YgRcaFWhdYjwik"],
  },
  {
    file: "/places/food/culvers-double-butterburger.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "@joefoodie, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Culver%27s_Double_Butterburger_with_Cheddar.jpg",
    },
    places: [
      "ChIJq2-RTwd854gREH4Tdh-7dyo",
      "ChIJV75h9OzE54gRKeAFTsHmIzk",
      "ChIJyUVHMkMRw4gRWxSSGDprdYQ",
      "ChIJYXE3ofE8w4gRS2oAiBkme80",
      "ChIJ8XtE6gjNwogRJ4Sp9FxYWms",
      "ChIJeYeavUrXwogRjRyk5ZOdYnA",
    ],
  },
  {
    file: "/places/editorial/wonderworks.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY-SA 3.0",
      attribution_text: "Leonard J. DeFrancisci, CC BY-SA 3.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:WonderWorks_%28Orlando%2C_Florida%29_001.jpg",
    },
    places: ["ChIJRdxzRk1-54gRJvqlZQbtpE4"],
  },
  {
    file: "/places/editorial/basilica.webp",
    photo: {
      source: "wikimedia",
      license: "CC0",
      attribution_text: "Nheyob, CC0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Basilica_of_the_Nat%27l_Shrine_of_Mary%2C_Queen_of_the_Universe_%28Orlando%2C_FL%29_-_reflection_2.jpg",
    },
    places: ["ChIJT1AHehWA3YgRkYNkOPfOHJw"],
  },
  {
    file: "/places/editorial/skyviews.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Phillip Pessar, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Skyviews_Miami_Bayside_Marketplace_-_Ferris_Wheel_Cars%2C_2022.jpg",
    },
    places: ["ChIJc7K5Gnu12YgRMXPWvBcju30"],
  },
  {
    file: "/places/editorial/bunche.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Russ, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Shell_creek_at_bunche_beach%2C_view_towards_Sanibel_%2822550546317%29.jpg",
    },
    places: ["ChIJgV1P91k524gRliXv8mmMF_w"],
  },
  {
    file: "/places/editorial/ball-chain2.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Phillip Pessar, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Ball_%26_Chain_Little_Havana%2C_Miami_FL_25_May_2025_-_2.jpg",
    },
    places: ["ChIJe4rXvvC22YgRpjGQg1PlJmM"],
  },
  {
    file: "/places/editorial/marketplace.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Theme Park Tourist, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Marketplace_Co-op_%2823169489792%29.jpg",
    },
    places: ["ChIJ1wtFLiiA3YgRNetAB3OzNQk"],
  },
  {
    file: "/places/editorial/prestonfield.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 4.0",
      attribution_text: "David Cheskin, CC BY 4.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Prestonfield-house-hotel-edinburgh-front.jpg",
    },
    places: ["wfadd_prestonfield_house_edinburgh"],
  },
  {
    file: "/places/editorial/chester.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY-SA 4.0",
      attribution_text: "rossograph, CC BY-SA 4.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Hotel_Chester-Starkville_MS.jpg",
    },
    places: ["ChIJD4cH_BA1gYgRKuCme_klwRg"],
  },
  {
    file: "/places/editorial/chick-fil-a.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY-SA 4.0",
      attribution_text: "Dough4872, CC BY-SA 4.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Chick-fil-A_chicken_sandwich_and_waffle_fries_at_Willow_Grove_Park_Mall.jpeg",
    },
    places: [
      "ChIJJx-MarpGw4gRQ8zoJ8Acx-c",
      "ChIJ_1KKw-oXw4gRGao51ByvSIc",
    ],
  },
  {
    file: "/places/editorial/five-guys.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 3.0",
      attribution_text: "Bobak Ha'Eri, CC BY 3.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Five_Guys_cheeseburger.jpg",
    },
    places: ["ChIJ8ejPSkQlw4gRtsFmF1TB_kU"],
  },
  {
    file: "/places/editorial/longhorn.webp",
    photo: {
      source: "wikimedia",
      license: "CC0",
      attribution_text: "Bonnachoven, CC0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Longhorn_Texas_Tonion_.jpg",
    },
    places: [
      "ChIJA3JCTYBBw4gRwNaRTu9qvzM",
      "ChIJa6RVdVtHw4gRAT4NfKfzfnA",
    ],
  },
  {
    file: "/places/editorial/wawa.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY-SA 4.0",
      attribution_text: "Dough4872, CC BY-SA 4.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Wawa_classic_chicken_salad_hoagie.jpeg",
    },
    places: [
      "ChIJLwykE35Qw4gRS50pL4BuL5o",
      "ChIJbZts7kI7w4gR8v6D69csQt8",
      "ChIJNaLB_dk4w4gRSrWtMKOcqFk",
    ],
  },
  {
    file: "/places/editorial/outback.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY-SA 2.0",
      attribution_text: "Hideyuki KAMON from Takarazuka / 宝塚市, Hyogo / 兵庫県, Japan / 日本, CC BY-SA 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Bloomin%27_Onion_%40_OUTBACK_STEAKHOUSE_%28Umeda%29_%285630415785%29.jpg",
    },
    places: ["ChIJU8B4Xhk_w4gRNVAF5GGoxnA"],
  },
];

const photosByPlace = new Map();
for (const { file, photo, places } of curatedPhotos) {
  for (const placeId of places) photosByPlace.set(placeId, { ...photo, file });
}

export function findCuratedPlacePhoto(placeId, env) {
  const photo = photosByPlace.get(placeId);
  if (!photo) return null;
  const host = env.VERCEL_ENV === "preview" && env.VERCEL_URL
    ? env.VERCEL_URL
    : "www.gowayfind.com";
  return { ...photo, image_url: `https://${host}${photo.file}` };
}
