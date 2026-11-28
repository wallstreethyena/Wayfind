// Menu and branch evidence for dishes that do not appear in the venue's name.
// The operator's location page links to the individual pickup menus below.
// IDs identify existing Wayfind inventory. This record cannot refresh a place or its score.
const firemanDereks = {
  name: "Fireman Derek’s Bake Shop",
  city: "Miami",
  dish: "Key lime pie",
  checkedAt: "2026-11-28T00:00:00Z",
  menu: "https://firemandereks.com/menu/",
  locations: "https://firemandereks.com/location/",
};

export const VERIFIED_MENU_DISHES = [
  {
    ...firemanDereks,
    placeId: "ChIJ45l98Ky22YgRP4ycv8twMFU",
    address: "2545 N Miami Ave, Bay 1, Miami, FL 33127",
    branchMenu: "https://order.online/store/fireman-derek%27s-miami-25104627/",
  },
  {
    ...firemanDereks,
    placeId: "ChIJSXKqIQW32YgRUP_X4wwbksk",
    address: "3435 Main Hwy, Miami, FL 33133",
    branchMenu: "https://order.online/store/fireman-derek%27s-miami-25141344/",
  },
];
