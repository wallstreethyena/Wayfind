// Reviewed menu photographs for exact inventory IDs. The image shows a menu
// item from the named brand, so it can cover listed locations that serve it.
// Source pages, licenses, and image treatments are in public/places/CREDITS.md.
const menuPhotos = [
  {
    file: "whataburger-burger.webp",
    photo: {
      source: "owner",
      license: "Editorial press use",
      attribution_text: "Whataburger",
      attribution_url: "https://stories.whataburger.com/asset/864583/burger-small",
    },
    places: ["ChIJ73_jJQBn54gRyBzOZRlSfi4"],
  },
  {
    file: "giordanos-stuffed-pizza.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Eric Chan, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:Giordanos_stuffed_pizza.jpg",
    },
    places: ["ChIJicZ0CVZ-54gR-HtvpylXgFY"],
  },
  {
    file: "white-castle-sliders.webp",
    photo: {
      source: "wikimedia",
      license: "CC BY 2.0",
      attribution_text: "Arnold Gatilao, CC BY 2.0",
      attribution_url: "https://commons.wikimedia.org/wiki/File:White_Castle_-_Chicago,_IL_(3026769554).jpg",
    },
    places: ["ChIJky8WzhKB3YgRcaFWhdYjwik"],
  },
  {
    file: "culvers-double-butterburger.webp",
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
];

const photosByPlace = new Map();
for (const { file, photo, places } of menuPhotos) {
  for (const placeId of places) photosByPlace.set(placeId, { ...photo, file });
}

export function findFoodPlacePhoto(placeId, env) {
  const photo = photosByPlace.get(placeId);
  if (!photo) return null;
  const host = env.VERCEL_ENV === "preview" && env.VERCEL_URL
    ? env.VERCEL_URL
    : "www.gowayfind.com";
  return { ...photo, image_url: `https://${host}/places/food/${photo.file}` };
}
