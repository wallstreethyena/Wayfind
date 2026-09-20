// Full-resolution licensed sources; Next Image delivers responsive derivatives.
const photo = (file, width, height, alt, caption) => ({ src: '/florida-photos/' + file, width, height, alt, caption });
export const SPRINGS_PHOTO = photo('springs-istock-2253526833.jpg',8064,5803,'A yellow kayak on clear water surrounded by trees in Florida','Florida springs · iStock · Licensed photograph');
export const EXPERIENCE_PHOTOS = {
  'bioluminescent-titusville': { ...SPRINGS_PHOTO, caption: 'Daytime kayaking illustration; bioluminescence is not pictured.' },
  'siesta-key-sunset-cruise': photo('sarasota-nathan-mullet.jpg',4000,5501,'A lifeguard tower on a Sarasota beach at sunset','Sarasota shoreline · Nathan Mullet / Unsplash. Cruise not pictured.'),
  'orlando-airboat': photo('airboat-richard-sagredo.jpg',4703,3762,'An airboat travels through sunlit Everglades wetlands','Everglades airboat · Richard Sagredo / Unsplash. Illustrative; operator varies.'),
  'clearwater-dolphin-cruise': photo('dolphin-dawn-casey.jpg',5151,3349,'A dolphin leaps out of blue ocean water','Dolphin illustration · Dawn Casey / Unsplash. Photographed in California.'),
};

// Photos supplied and selected by the owner for this landing page.
// Keep these exact subjects scoped to their matching event or park.
export const FLORIDA_EVENT_PHOTOS = {
  'brick-or-treat-2026': photo('owner-brick-or-treat.png',480,358,'LEGO Halloween characters and a pumpkin at Brick-or-Treat'),
  'hhn-orlando-2026': photo('owner-halloween-horror-nights.png',462,352,'Terrifier haunted house at Halloween Horror Nights'),
  'howl-o-scream-seaworld-2026': photo('owner-howl-o-scream.png',482,290,'SeaWorld Orlando Howl-O-Scream promotional artwork'),
  'seaworld-spooktacular-2026': photo('owner-seaworld-spooktacular.png',456,298,'Halloween characters beside a giant pumpkin at SeaWorld Spooktacular'),
  'epcot-food-wine-2026': photo('owner-epcot-food-wine.png',460,320,'Food and drinks in front of Spaceship Earth at EPCOT'),
  'mnsshp-2026': photo('owner-mickey-halloween-v2.png',482,334,'Disney characters in Halloween costumes in front of Cinderella Castle'),
};
export const FLORIDA_PARK_PHOTOS = {
  'winterhaven-hook-peppa-pig': photo('owner-peppa-pig.png',462,320,'Rainbow entrance to Peppa Pig Theme Park'),
  'tampa-hook-busch-gardens': photo('owner-busch-gardens.png',472,316,'Riders on a roller coaster at Busch Gardens Tampa Bay'),
  'orlando-hook-seaworld': photo('owner-seaworld.png',1090,758,'Orcas at SeaWorld'),
  'orlando-hook-aquatica': photo('owner-aquatica.png',474,370,'Water slides and splash play area at Aquatica'),
};
