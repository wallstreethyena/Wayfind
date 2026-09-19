// Full-resolution licensed sources; Next Image delivers responsive derivatives.
const photo = (file, width, height, alt, caption) => ({ src: '/florida-photos/' + file, width, height, alt, caption });
export const SPRINGS_PHOTO = photo('springs-istock-2253526833.jpg',8064,5803,'A yellow kayak on clear water surrounded by trees in Florida','Florida springs · iStock · Licensed photograph');
export const EXPERIENCE_PHOTOS = {
  'bioluminescent-titusville': { ...SPRINGS_PHOTO, caption: 'Daytime kayaking illustration; bioluminescence is not pictured.' },
  'siesta-key-sunset-cruise': photo('sarasota-nathan-mullet.jpg',4000,5501,'A lifeguard tower on a Sarasota beach at sunset','Sarasota shoreline · Nathan Mullet / Unsplash. Cruise not pictured.'),
  'orlando-airboat': photo('airboat-richard-sagredo.jpg',4703,3762,'An airboat travels through sunlit Everglades wetlands','Everglades airboat · Richard Sagredo / Unsplash. Illustrative; operator varies.'),
  'clearwater-dolphin-cruise': photo('dolphin-dawn-casey.jpg',5151,3349,'A dolphin leaps out of blue ocean water','Dolphin illustration · Dawn Casey / Unsplash. Photographed in California.'),
};
